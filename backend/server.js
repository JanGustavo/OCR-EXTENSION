import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // Suporte para imagens Base64 grandes

const PORT = process.env.PORT || 3000;
const DAILY_USER_LIMIT = Number(process.env.DAILY_USER_LIMIT || 9);

// Inicializa a lista de chaves de API do Groq configuradas
const rawKeys = [
  { key: process.env.GROQ_FREE_KEY_1, type: 'free', id: 1 },
  { key: process.env.GROQ_FREE_KEY_2, type: 'free', id: 2 },
  { key: process.env.GROQ_FREE_KEY_3, type: 'free', id: 3 },
  { key: process.env.GROQ_FREE_KEY_4, type: 'free', id: 4 },
  { key: process.env.GROQ_FREE_KEY_5, type: 'free', id: 5 }
];

const keysConfig = rawKeys.filter(k => k.key && k.key.startsWith('gsk_') && !k.key.includes('your_free_key'));

const PAID_KEY = process.env.GROQ_PAID_KEY && process.env.GROQ_PAID_KEY.startsWith('gsk_') && !process.env.GROQ_PAID_KEY.includes('your_paid_key')
  ? process.env.GROQ_PAID_KEY
  : null;

// Registro em memória do uso das chaves (Load Balancing)
const keyRegistry = keysConfig.map(k => ({
  ...k,
  rpmCount: 0,
  lastUsed: 0,
  failedUntil: 0
}));

// Banco de dados em memória simples para cotas diárias de usuários
// Estrutura: Map { userId => { date: "YYYY-MM-DD", count: 0 } }
const userQuotaDb = new Map();

function getTodayString() {
  return new Date().toLocaleDateString('sv'); // YYYY-MM-DD em fuso horário local
}

// Middleware de Controle de Cotas
function checkUserQuota(req, res, next) {
  const userId = req.headers['x-user-id'] || req.ip;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'Cabecalho X-User-Id ou IP ausente.' });
  }

  const today = getTodayString();
  let userRecord = userQuotaDb.get(userId);

  if (!userRecord || userRecord.date !== today) {
    userRecord = { date: today, count: 0 };
    userQuotaDb.set(userId, userRecord);
  }

  if (userRecord.count >= DAILY_USER_LIMIT) {
    return res.status(403).json({
      ok: false,
      quotaExceeded: true,
      error: `Você atingiu o limite gratuito diário de ${DAILY_USER_LIMIT} envios de passagens. Faça o upgrade para o plano Premium para uso ilimitado!`
    });
  }

  req.userId = userId;
  req.userRecord = userRecord;
  next();
}

// Seleciona a chave gratuita menos utilizada recentemente e que não esteja em cooldown
function selectBestKey() {
  const now = Date.now();
  
  // Limpa o contador de requisições por minuto se a chave estiver ociosa por mais de 60s
  keyRegistry.forEach(k => {
    if (now - k.lastUsed > 60000) {
      k.rpmCount = 0;
    }
  });

  const availableKeys = keyRegistry.filter(k => now > k.failedUntil);
  if (!availableKeys.length) {
    console.log('[Proxy] ⚠️ Nenhuma chave gratuita ativa. Todas em cooldown por erro 429 ou não configuradas.');
    return null;
  }

  // Ordena por menor rpmCount e depois por maior tempo ociosa
  availableKeys.sort((a, b) => a.rpmCount - b.rpmCount || a.lastUsed - b.lastUsed);
  return availableKeys[0];
}

// Roteia requisições ao Groq com rotação dinâmica e suspensão automática de chaves
async function callGroqWithRotation(body, attempt = 1) {
  const now = Date.now();
  const selected = selectBestKey();

  let activeKey = null;
  let isPaidFallback = false;

  if (selected) {
    activeKey = selected.key;
    selected.rpmCount += 1;
    selected.lastUsed = now;
    console.log(`[Proxy] [Tentativa ${attempt}] Usando Chave Gratuita #${selected.id} (Uso Recente: ${selected.rpmCount} RPM)`);
  } else if (PAID_KEY) {
    activeKey = PAID_KEY;
    isPaidFallback = true;
    console.log(`[Proxy] [Tentativa ${attempt}] Usando Chave Paga de Fallback (Contingência)`);
  } else {
    throw new Error('Todas as chaves gratuitas do Groq estão em Rate Limit (Erro 429) no momento e nenhuma Chave Paga foi configurada no arquivo .env.');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`
      },
      body: JSON.stringify(body)
    });

    // Trata erro 429 (Rate Limit / Excesso de uso)
    if (response.status === 429) {
      if (!isPaidFallback && selected) {
        selected.failedUntil = Date.now() + 60000; // Bloqueia a chave gratuita por 60s
        console.warn(`[Proxy] ⛔ Chave Gratuita #${selected.id} retornou erro 429 (Rate Limit). Suspensa por 60 segundos.`);
      }

      if (attempt < 5) {
        console.log(`[Proxy] Re-tentando requisição com outra chave... (Tentativa ${attempt + 1})`);
        return callGroqWithRotation(body, attempt + 1);
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = response.statusText;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error?.message || errorMsg;
      } catch (e) {}
      throw new Error(`Erro na API do Groq (${response.status}): ${errorMsg}`);
    }

    const resJson = await response.json();
    const content = resJson.choices?.[0]?.message?.content;
    if (!content) throw new Error("A API retornou uma resposta vazia.");
    return content;
  } catch (err) {
    console.error(`[Proxy] Erro com a chave atual na tentativa ${attempt}: ${err.message}`);
    
    // Se não for a chave paga e ainda houver tentativas, tenta a próxima chave grátis
    if (!isPaidFallback && attempt < 5) {
      console.log(`[Proxy] Falha técnica. Re-tentando com próxima chave...`);
      return callGroqWithRotation(body, attempt + 1);
    }
    throw err;
  }
}

// ─── Endpoints da API ───

// Endpoint 1: OCR Textual (Tesseract -> LLM)
app.post('/api/ocr', checkUserQuota, async (req, res) => {
  const { systemPrompt, userMessage } = req.body;
  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ ok: false, error: 'Parâmetros systemPrompt e userMessage são obrigatórios.' });
  }

  try {
    const body = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const reply = await callGroqWithRotation(body);
    
    // Incrementa cota de uso após o sucesso
    req.userRecord.count += 1;
    console.log(`[Proxy] OCR Processado. Usuário: ${req.userId} | Cota: ${req.userRecord.count}/${DAILY_USER_LIMIT}`);

    res.json({ ok: true, data: JSON.parse(reply.trim()) });
  } catch (err) {
    console.error('[Proxy] Erro /api/ocr:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint 2: OCR Visual (Fallback vision multimodelo)
app.post('/api/ocr-vision', checkUserQuota, async (req, res) => {
  const { systemPrompt, userMessage, imageBase64, modelName } = req.body;
  if (!systemPrompt || !userMessage || !imageBase64) {
    return res.status(400).json({ ok: false, error: 'Parâmetros systemPrompt, userMessage e imageBase64 são obrigatórios.' });
  }

  const activeModel = modelName || 'meta-llama/llama-4-scout-17b-16e-instruct';

  try {
    const body = {
      model: activeModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt + '\n' + userMessage },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const reply = await callGroqWithRotation(body);
    
    // Incrementa cota de uso após o sucesso
    req.userRecord.count += 1;
    console.log(`[Proxy] Vision OCR Processado. Usuário: ${req.userId} | Cota: ${req.userRecord.count}/${DAILY_USER_LIMIT}`);

    res.json({ ok: true, data: JSON.parse(reply.trim()) });
  } catch (err) {
    console.error('[Proxy] Erro /api/ocr-vision:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint 3: Testar Conexão
app.post('/api/test', async (req, res) => {
  try {
    const body = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Você é um validador de API. Retorne obrigatoriamente um objeto JSON contendo a chave \'status\' com o valor \'ok\'.' },
        { role: 'user', content: 'Teste de conexão' }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const reply = await callGroqWithRotation(body);
    res.json({ ok: true, data: JSON.parse(reply.trim()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint 4: Consultar Cota Diária do Usuário
app.get('/api/quota/:userId', (req, res) => {
  const { userId } = req.params;
  const today = getTodayString();
  let userRecord = userQuotaDb.get(userId);

  if (!userRecord || userRecord.date !== today) {
    userRecord = { date: today, count: 0 };
    userQuotaDb.set(userId, userRecord);
  }

  res.json({
    ok: true,
    date: today,
    count: userRecord.count,
    limit: DAILY_USER_LIMIT
  });
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 SERVIDOR PROXY OCR INICIADO COM SUCESSO!`);
  console.log(`📡 Ouvindo na porta: ${PORT}`);
  console.log(`🔑 Chaves gratuitas configuradas no .env: ${keysConfig.length}`);
  console.log(`💎 Fallback pago configurado no .env: ${PAID_KEY ? 'Sim (Habilitado)' : 'Não (Desabilitado)'}`);
  console.log(`📊 Limite diário por usuário: ${DAILY_USER_LIMIT} requisições`);
  console.log(`==================================================\n`);
});
