  // Importa Tesseract.js como módulo ESM
  import * as TesseractModule from '../assets/tesseract/tesseract.esm.min.js';

  const urlParams = new URLSearchParams(window.location.search);
  const targetTabId = Number.parseInt(urlParams.get('targetTabId') || '', 10);

    // ─── Estado da Aplicação ──────────────────────────────────────────────────────

  let passageiroAtual = 0;
  const providerKey = (urlParams.get('provider') || 'azul').toLowerCase();
  const providerConfigMap = {
    azul: { title: 'OCR Passagens — Azul', heading: '✈ OCR Passagens Azul', generoHint: '(opcional)', nationality: 'Brasil', showContactFields: false, theme: { accent: '#0068ff', accentHover: '#0052cc' } },
    latam: { title: 'OCR Passagens — LATAM', heading: '✈ OCR Passagens LATAM', generoHint: '(opcional)', nationality: 'Brasil', showContactFields: true, theme: { accent: '#cc0a2f', accentHover: '#9f0724' } },
    smiles: { title: 'OCR Passagens — Smiles', heading: '✈ OCR Passagens Smiles', generoHint: '(opcional)', nationality: 'Brasil', showContactFields: true, theme: { accent: '#ff6a00', accentHover: '#e35700' } }
  };

  const providerConfig = providerConfigMap[providerKey] || providerConfigMap.azul;
  const DEFAULT_NATIONALITY = providerConfig.nationality;

  let passageiros = Array.from({ length: 9 }, () => ({
    nome: '', cpf: '', dataNascimento: '', genero: '', nacionalidade: DEFAULT_NATIONALITY, email: '', telefone: '', imagemDataUrl: ''
  }));

  const Tesseract = TesseractModule.Tesseract || TesseractModule.default || TesseractModule;
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const previewBox = document.getElementById('preview-box');
  const previewImg = document.getElementById('preview-img');
  const spinner = document.getElementById('spinner');
  const pageHeading = document.getElementById('page-heading');
  const generoHint = document.getElementById('genero-hint');
  const passengerSummary = document.getElementById('passenger-summary');
  const fieldNome = document.getElementById('field-nome');
  const fieldCpf = document.getElementById('field-cpf');
  const fieldData = document.getElementById('field-data');
  const contactFields = document.getElementById('contact-fields');
  const fieldEmail = document.getElementById('field-email');
  const fieldTelefone = document.getElementById('field-telefone');
  const btnUploadMore = document.getElementById('btn-upload-more');
  const btnBack = document.getElementById('btn-back');
  const btnFinish = document.getElementById('btn-finish');
  const btnClearPassenger = document.getElementById('btn-clear-passenger');
  const fieldGenero = document.getElementById('field-genero');
  const fieldNacionalidade = document.getElementById('field-nacionalidade');
  const btnChange = document.getElementById('btn-change');
  const btnSelectImage = document.getElementById('btn-select-image');

  // DOM Elements for Groq AI Config
  const aiConfigSection = document.getElementById('ai-config-section');
  const aiConfigHeader = document.getElementById('ai-config-header');
  const aiQuotaBadge = document.getElementById('ai-quota-badge');
  const fieldGroqKey = document.getElementById('field-groq-key');
  const fieldGroqLimit = document.getElementById('field-groq-limit');
  const aiQuotaText = document.getElementById('ai-quota-text');
  const aiQuotaFill = document.getElementById('ai-quota-fill');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const btnSaveAiConfig = document.getElementById('btn-save-ai-config');
  const btnTestAiConfig = document.getElementById('btn-test-ai-config');

  let ocrWorker = null;

  // State variables for Groq AI
  let groqApiKey = '';
  let groqDailyLimit = 50;
  let groqDailyUsage = { date: '', count: 0 };
  let aiConfigExpanded = false;


  // ─── Lógica de Configurações da IA e Groq ───

  function getTodayString() {
    return new Date().toLocaleDateString('sv'); // Swedish format returns YYYY-MM-DD reliably in local time
  }

  function loadAiConfig() {
    chrome.storage.local.get(['groqApiKey', 'groqDailyLimit', 'groqDailyUsage', 'aiConfigExpanded'], (result) => {
      groqApiKey = result.groqApiKey || '';
      groqDailyLimit = Number(result.groqDailyLimit ?? 50);
      
      const today = getTodayString();
      if (result.groqDailyUsage && result.groqDailyUsage.date === today) {
        groqDailyUsage = result.groqDailyUsage;
      } else {
        groqDailyUsage = { date: today, count: 0 };
        chrome.storage.local.set({ groqDailyUsage });
      }

      aiConfigExpanded = !!result.aiConfigExpanded;

      // Update UI fields
      if (fieldGroqKey) fieldGroqKey.value = groqApiKey;
      if (fieldGroqLimit) fieldGroqLimit.value = groqDailyLimit;

      if (aiConfigSection) {
        aiConfigSection.classList.toggle('expanded', aiConfigExpanded);
      }

      updateQuotaUI();
    });
  }

  function updateQuotaUI() {
    const today = getTodayString();
    if (groqDailyUsage.date !== today) {
      groqDailyUsage = { date: today, count: 0 };
    }

    const count = groqDailyUsage.count;
    const limit = groqDailyLimit;
    const pct = Math.min(100, Math.round((count / limit) * 100));

    if (aiQuotaBadge) aiQuotaBadge.textContent = `Cota: ${count} / ${limit}`;
    if (aiQuotaText) aiQuotaText.textContent = `${count} / ${limit} (${pct}%)`;
    
    if (aiQuotaFill) {
      aiQuotaFill.style.width = `${pct}%`;
      aiQuotaFill.classList.toggle('warning', pct > 85);
    }
  }

  function checkAndIncrementQuota() {
    const today = getTodayString();
    if (groqDailyUsage.date !== today) {
      groqDailyUsage = { date: today, count: 0 };
    }

    if (groqDailyUsage.count >= groqDailyLimit) {
      return false;
    }

    groqDailyUsage.count += 1;
    chrome.storage.local.set({ groqDailyUsage });
    updateQuotaUI();
    return true;
  }

  function saveAiConfig() {
    const key = fieldGroqKey ? fieldGroqKey.value.trim() : '';
    const limit = fieldGroqLimit ? Math.max(1, Number(fieldGroqLimit.value)) : 50;

    groqApiKey = key;
    groqDailyLimit = limit;

    chrome.storage.local.set({
      groqApiKey: key,
      groqDailyLimit: limit
    }, () => {
      updateQuotaUI();
      showStatus('Configurações salvas com sucesso!', 'success');
      setTimeout(() => {
        const el = document.getElementById('upload-status');
        if (el && el.textContent === 'Configurações salvas com sucesso!') el.style.display = 'none';
      }, 3000);
    });
  }

  function toggleAiConfigExpand() {
    aiConfigExpanded = !aiConfigExpanded;
    if (aiConfigSection) {
      aiConfigSection.classList.toggle('expanded', aiConfigExpanded);
    }
    chrome.storage.local.set({ aiConfigExpanded });
  }

  function toggleKeyVisibility() {
    if (!fieldGroqKey || !btnToggleKeyVisibility) return;
    if (fieldGroqKey.type === 'password') {
      fieldGroqKey.type = 'text';
      btnToggleKeyVisibility.textContent = '🙈';
    } else {
      fieldGroqKey.type = 'password';
      btnToggleKeyVisibility.textContent = '👁';
    }
  }

  async function testAiConnection() {
    const tempKey = fieldGroqKey ? fieldGroqKey.value.trim() : '';
    if (!tempKey) {
      showStatus('Por favor, insira uma API Key antes de testar.', 'error');
      return;
    }

    showSpinner(true);
    showStatus('Testando conexão com Groq...', 'success');

    try {
      const data = await callGroqChat(
        tempKey, 
        "Você é um validador de API. Retorne obrigatoriamente um objeto JSON contendo a chave 'status' com o valor 'ok'.", 
        "Teste de conexão",
        false
      );
      showSpinner(false);
      showStatus('✓ Conexão estabelecida com sucesso com o Groq!', 'success');
    } catch (err) {
      console.error('[Upload] Erro de teste da IA:', err);
      showSpinner(false);
      showStatus(`Falha de conexão: ${err.message}`, 'error');
    }
  }

  function cleanOcrText(text) {
    if (!text) return '';
    const blacklist = [
      'REPUBLICA FEDERATIVA', 'BRASIL', 'GOVERNO FEDERAL', 'SECRETARIA', 'SEGURANCA', 
      'PUBLICA', 'POLICIA CIVIL', 'DETRAN', 'CARTEIRA NACIONAL', 'HABILITACAO', 
      'IDENTIDADE', 'REGISTRO GERAL', 'MINISTERIO', 'VALIDO EM TODO', 'TERRITORIO',
      'ASSINATURA', 'TITULAR', 'FILIACAO', 'ORGAO EMISSOR', 'VIA', 'CATEGORIA', 'CNH',
      'ESTADO DO', 'DEPARTAMENTO DE TRANSITO'
    ];
    
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (line.length < 3) return false;
        if (/^[^a-zA-Z0-9]+$/.test(line)) return false; // descarta linhas que são só caracteres especiais
        
        const upper = line.toUpperCase();
        
        // Verifica se a linha contém palavras institucionais da blacklist
        const score = blacklist.reduce((acc, word) => acc + (upper.includes(word) ? 1 : 0), 0);
        if (score >= 2) return false; // descarta se for boilerplate puro
        
        return true;
      })
      .join('\n');
  }

  function getAiPrompt(provider) {
    const defaultInstructions = "Você é um assistente de OCR especializado em passagens e documentos de identidade brasileiros (como RG e CNH). Analise o texto de OCR fornecido e extraia as informações do passageiro com extrema precisão, corrigindo inteligentemente ruídos de digitação comuns de OCR (por exemplo: 'O'/'Q'/'D' no lugar de '0', 'I'/'L' no lugar de '1', 'Z' no lugar de '2', 'S' no lugar de '5', 'G' no lugar de '6', 'B' no lugar de '8' em campos de CPF ou Data de Nascimento, e caracteres inválidos em nomes). Retorne um objeto JSON estrito e válido. Não adicione explicações, comentários ou formatações markdown de código (como ```json).";

    if (provider === 'smiles') {
      return `${defaultInstructions} O JSON deve conter EXATAMENTE estas chaves:
{
  "nomeCompleto": "NOME COMPLETO EM CAIXA ALTA (limpo e sem ruídos)",
  "primeiroNome": "PRIMEIRO NOME E NOMES DO MEIO EM CAIXA ALTA",
  "sobrenome": "ÚLTIMO SOBRENOME EM CAIXA ALTA",
  "cpf": "CPF formatado como XXX.XXX.XXX-XX (apenas se for um CPF válido)",
  "dataNascimento": "Data de nascimento no formato DD/MM/AAAA (valide e corrija o ano se necessário)",
  "email": "E-mail se encontrado na imagem/texto, senão string vazia",
  "telefone": "Telefone se encontrado formatado como (XX) XXXXX-XXXX, senão string vazia",
  "genero": "Masculino" ou "Feminino" ou "",
  "nacionalidade": "Nacionalidade do passageiro (padrão 'Brasil')"
}`;
    } else if (provider === 'latam') {
      return `${defaultInstructions} O JSON deve conter EXATAMENTE estas chaves:
{
  "nomeCompleto": "NOME COMPLETO EM CAIXA ALTA (limpo e sem ruídos)",
  "primeiroNome": "PRIMEIRO NOME E NOMES DO MEIO EM CAIXA ALTA",
  "sobrenome": "ÚLTIMO SOBRENOME EM CAIXA ALTA",
  "cpf": "CPF formatado como XXX.XXX.XXX-XX (apenas se for um CPF válido)",
  "dataNascimento": "Data de nascimento no formato DD/MM/AAAA (valide e corrija o ano se necessário)",
  "email": "E-mail se encontrado na imagem/texto, senão string vazia",
  "telefone": "Telefone se encontrado formatado como (XX) XXXXX-XXXX, senão string vazia",
  "genero": "Masculino" ou "Feminino" ou "",
  "nacionalidade": "Nacionalidade do passageiro (padrão 'Brasil')",
  "documento": "Número do documento de identidade ou CPF (se for o caso, senão string vazia)"
}`;
    } else { // azul e outros
      return `${defaultInstructions} O JSON deve conter EXATAMENTE estas chaves:
{
  "nomeCompleto": "NOME COMPLETO EM CAIXA ALTA (limpo e sem ruídos)",
  "cpf": "CPF formatado como XXX.XXX.XXX-XX (apenas se for um CPF válido)",
  "dataNascimento": "Data de nascimento no formato DD/MM/AAAA (valide e corrija o ano se necessário)",
  "genero": "Masculino" ou "Feminino" ou "",
  "nacionalidade": "Nacionalidade do passageiro (padrão 'Brasil')"
}`;
    }
  }

  async function callGroqChat(apiKey, systemPrompt, userMessage, isVision = false, base64Image = null, customModelName = null) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    let model = customModelName;
    if (!model) {
      model = isVision ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';
    }
    
    let content;
    if (isVision) {
      content = [
        {
          type: "text",
          text: systemPrompt + "\n" + userMessage
        },
        {
          type: "image_url",
          image_url: {
            url: base64Image
          }
        }
      ];
    } else {
      content = userMessage;
    }

    const messages = [];
    if (!isVision) {
      messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: content });
    } else {
      // Groq Vision espera as mensagens de forma simplificada
      messages.push({ role: 'user', content: content });
    }

    const body = {
      model: model,
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = response.statusText;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.error?.message || msg;
      } catch (e) {}
      throw new Error(`Erro na API do Groq (${response.status}): ${msg}`);
    }

    const resJson = await response.json();
    const reply = resJson.choices?.[0]?.message?.content;
    if (!reply) throw new Error("Resposta da IA vazia.");
    
    try {
      return JSON.parse(reply.trim());
    } catch (e) {
      console.warn("[Upload] Resposta da IA não é JSON válido:", reply);
      // Tenta caçar JSON na resposta se houver sujeira
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0].trim());
      }
      throw e;
    }
  }

  function isAiDataValid(data, provider) {
    if (!data) return false;
    
    const name = data.nomeCompleto || data.nome;
    if (!name || String(name).trim().length < 5) return false;
    
    const cpf = data.cpf;
    const dob = data.dataNascimento || data.birthDate;
    
    const hasCpf = cpf && /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(cpf).trim());
    const hasDob = dob && /^\d{2}\/\d{2}\/\d{4}$/.test(String(dob).trim());
    
    if (provider === 'latam') {
      const doc = data.documento;
      const hasDoc = doc && String(doc).trim().length > 4;
      return Boolean(hasCpf || hasDob || hasDoc);
    }
    
    return Boolean(hasCpf || hasDob);
  }

  // ─── Lógica de Interface ───

  function aplicarConfiguracaoDoProvedor() {
    document.title = providerConfig.title;
    const root = document.documentElement;
    root.style.setProperty('--accent', providerConfig.theme.accent);
    root.style.setProperty('--accent-hover', providerConfig.theme.accentHover);
    if (pageHeading) pageHeading.textContent = providerConfig.heading;
    if (generoHint) generoHint.textContent = providerConfig.generoHint;
    if (contactFields) contactFields.classList.toggle('hidden', !providerConfig.showContactFields);
  }

  // ─── Lógica de OCR ───

  async function initOCRWorker() {
    if (ocrWorker) return;
    showSpinner(true);
    try {
      const options = {
        workerBlobURL: false,
        workerPath: chrome.runtime.getURL('assets/tesseract/worker.min.js'),
        corePath: chrome.runtime.getURL('assets/tesseract/tesseract-core.wasm.js'),
        langPath: chrome.runtime.getURL('assets/tesseract/tessdata'),
        logger: (m) => console.debug('[Tesseract]', m.status, Math.round(m.progress * 100) + '%')
      };
      ocrWorker = await Tesseract.createWorker('por+eng', 1, options);
      showSpinner(false);
    } catch (err) {
      console.error('[Upload] Erro Worker:', err);
      showSpinner(false);
    }
  }

  function buildOcrCanvas(img, scale = 2, options = {}) {
    const { applyContrast = true } = options;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (!applyContrast) return canvas;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const factor = (259 * (80 + 255)) / (255 * (259 - 80));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  function buildNumericCanvas(sourceCanvas, threshold = 160, maxPixels = 1500000) {
    const totalPixels = sourceCanvas.width * sourceCanvas.height;
    const scale = totalPixels > maxPixels
      ? Math.sqrt(maxPixels / totalPixels)
      : 1;
    const width = Math.max(1, Math.floor(sourceCanvas.width * scale));
    const height = Math.max(1, Math.floor(sourceCanvas.height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const v = gray > threshold ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (err) {
      console.warn('[Upload] Numeric threshold skipped due to memory limits.', err);
    }

    return canvas;
  }

  function cropCanvas(sourceCanvas, rect) {
    const sx = Math.max(0, Math.floor(rect.x * sourceCanvas.width));
    const sy = Math.max(0, Math.floor(rect.y * sourceCanvas.height));
    const sw = Math.max(1, Math.floor(rect.w * sourceCanvas.width));
    const sh = Math.max(1, Math.floor(rect.h * sourceCanvas.height));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  function cropCanvasPixels(sourceCanvas, rect) {
    const sx = Math.max(0, Math.floor(rect.x));
    const sy = Math.max(0, Math.floor(rect.y));
    const sw = Math.max(1, Math.floor(rect.w));
    const sh = Math.max(1, Math.floor(rect.h));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.min(sw, sourceCanvas.width - sx);
    canvas.height = Math.min(sh, sourceCanvas.height - sy);
    ctx.drawImage(sourceCanvas, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function buildLabelRois(ocrData, baseCanvas) {
    if (!ocrData || !Array.isArray(ocrData.words)) return [];
    const width = baseCanvas.width;
    const height = baseCanvas.height;
    const rois = [];
    const seen = new Set();
    const addRoi = (word, type) => {
      if (!word?.bbox) return;
      const wordHeight = Math.max(1, word.bbox.y1 - word.bbox.y0);
      const paddingX = Math.round(wordHeight * 0.4);
      const paddingY = Math.round(wordHeight * 0.4);
      const x = Math.min(width - 1, Math.max(0, word.bbox.x1 + paddingX));
      const y = Math.max(0, word.bbox.y0 - paddingY);
      const w = Math.max(1, Math.min(width - x, Math.round(width * 0.45)));
      const h = Math.max(1, Math.min(height - y, Math.round(wordHeight * 2.2)));
      const key = `${type}:${x}:${y}:${w}:${h}`;
      if (seen.has(key)) return;
      seen.add(key);
      rois.push({ type, x, y, w, h });
    };

    for (const word of ocrData.words) {
      const label = normalizeOcrText(word.text || '').replace(/[^A-Z]/g, '');
      if (!label) continue;
      if (label.includes('NASC')) addRoi(word, 'birth');
      if (label === 'CPF' || label.includes('CPF')) addRoi(word, 'cpf');
    }

    return rois.slice(0, 8);
  }

  function buildDefaultRois(baseCanvas) {
    const w = baseCanvas.width;
    const h = baseCanvas.height;
    return [
      { type: 'birth', x: w * 0.36, y: h * 0.26, w: w * 0.58, h: h * 0.10 },
      { type: 'birth', x: w * 0.36, y: h * 0.30, w: w * 0.58, h: h * 0.10 },
      { type: 'cpf', x: w * 0.36, y: h * 0.50, w: w * 0.58, h: h * 0.10 },
      { type: 'cpf', x: w * 0.36, y: h * 0.54, w: w * 0.58, h: h * 0.10 }
    ];
  }

  async function runNumericRoiOCR(baseCanvas, labelRois = []) {
    const roiRects = labelRois.length ? labelRois : buildDefaultRois(baseCanvas);

    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '7',
      tessedit_char_whitelist: '0123456789/.-',
      classify_bln_numeric_mode: '1'
    });

    const texts = [];
    for (const rect of roiRects) {
      const crop = labelRois.length ? cropCanvasPixels(baseCanvas, rect) : cropCanvas(baseCanvas, rect);
      const numericCrop = buildNumericCanvas(crop, 170, 400000);
      const result = await ocrWorker.recognize(numericCrop);
      const value = String(result.data.text || '').trim();
      if (value) texts.push(value);
    }

    return texts.join('\n');
  }

  function scoreOcrText(text) {
    const letters = (text.match(/[A-Z]/gi) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    return letters + digits * 1.2;
  }

  function mergeParsedData(primary, fallback) {
    const pick = (key) => primary[key] || fallback[key] || '';
    const nomeCompleto = pick('nomeCompleto');
    const nomeSeparado = separateNome(nomeCompleto);

    return {
      nomeCompleto,
      primeiroNome: pick('primeiroNome') || nomeSeparado.primeiroNome,
      sobrenome: pick('sobrenome') || nomeSeparado.sobrenome,
      cpf: pick('cpf'),
      dataNascimento: pick('dataNascimento'),
      genero: pick('genero'),
      nacionalidade: pick('nacionalidade') || 'Brasil'
    };
  }

  function shouldUseNumericText(text) {
    const normalized = normalizeOcrDigits(text);
    const digits = digitsOnly(normalized);
    if (digits.length < 8) return false;
    const hasDateLike = /([0-9OQDISLZGB]{2})[\/\-.]([0-9OQDISLZGB]{2})[\/\-.]([0-9OQDISLZGB]{4})/.test(text);
    const hasCpfLike = /(?:[0-9OQDISLZGB][\s.\-]*){11,14}/.test(text);
    return hasDateLike || hasCpfLike;
  }

  async function runClassicalOCRFlow(imageDataUrl) {
    await initOCRWorker();
    const img = await loadImageFromUrl(imageDataUrl);
    const rawCanvas = buildOcrCanvas(img, 2, { applyContrast: false });
    const contrastCanvas = buildOcrCanvas(img, 2, { applyContrast: true });

    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: ÁÉÍÓÚÂÊÔÃÕÇ'
    });

    const rawResult = await ocrWorker.recognize(rawCanvas);
    const contrastResult = await ocrWorker.recognize(contrastCanvas);

    const primaryResult = scoreOcrText(rawResult.data.text) >= scoreOcrText(contrastResult.data.text)
      ? rawResult
      : contrastResult;
    const fallbackResult = primaryResult === rawResult ? contrastResult : rawResult;
    const primaryText = primaryResult.data.text;
    const fallbackText = fallbackResult.data.text;
    const primaryCanvas = primaryResult === rawResult ? rawCanvas : contrastCanvas;

    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789/.-',
      classify_bln_numeric_mode: '1'
    });

    const numericVariants = [
      buildNumericCanvas(rawCanvas, 140),
      buildNumericCanvas(rawCanvas, 190)
    ];
    const numericTexts = [];
    for (const numericCanvas of numericVariants) {
      const numericResult = await ocrWorker.recognize(numericCanvas);
      numericTexts.push(numericResult.data.text || '');
    }
    const numericCombined = numericTexts.join('\n');
    const numericTextForParse = shouldUseNumericText(numericCombined) ? numericCombined : '';

    const parsedPrimary = parsePassengerData(primaryText, numericTextForParse);
    const parsedFallback = parsePassengerData(fallbackText, numericTextForParse);
    let parsed = mergeParsedData(parsedPrimary, parsedFallback);

    if (!parsed.cpf || !parsed.dataNascimento) {
      const labelRois = buildLabelRois(primaryResult.data, primaryCanvas);
      const roiNumericText = await runNumericRoiOCR(primaryCanvas, labelRois);
      if (roiNumericText) {
        const roiTextForParse = shouldUseNumericText(roiNumericText) ? roiNumericText : '';
        const parsedPrimaryRoi = parsePassengerData(primaryText, roiTextForParse);
        const parsedFallbackRoi = parsePassengerData(fallbackText, roiTextForParse);
        const parsedRoi = mergeParsedData(parsedPrimaryRoi, parsedFallbackRoi);
        parsed = mergeParsedData(parsed, parsedRoi);
      }
    }
    return parsed;
  }

  async function runOCROnImage(imageDataUrl, imageBase64) {
    // 1. Verifica se a chave do Groq está configurada
    if (!groqApiKey) {
      console.log('[Upload] Groq API Key não configurada. Usando processamento Tesseract clássico.');
      showStatus('Groq API Key não configurada. Usando OCR clássico off-line.', 'success');
      return runClassicalOCRFlow(imageDataUrl);
    }

    // 2. Tenta rodar o fluxo híbrido (Tesseract + Groq Text)
    try {
      // Primeiro, extrai o texto local com Tesseract rápido
      await initOCRWorker();
      showStatus('Extraindo texto do documento (Tesseract)...', 'success');

      const img = await loadImageFromUrl(imageDataUrl);
      const rawCanvas = buildOcrCanvas(img, 2, { applyContrast: false });
      
      await ocrWorker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: ÁÉÍÓÚÂÊÔÃÕÇ'
      });

      const rawResult = await ocrWorker.recognize(rawCanvas);
      const tesseractText = rawResult.data.text || '';
      console.log('[Upload] Texto original do Tesseract:\n', tesseractText);

      const cleanedText = cleanOcrText(tesseractText);
      console.log('[Upload] Texto limpo para envio ao Groq:\n', cleanedText);

      // Verifica limite de quota antes de chamar
      if (!checkAndIncrementQuota()) {
        console.warn('[Upload] Limite de quota diária da IA excedido.');
        showStatus('Cota diária da IA excedida! Usando OCR clássico off-line.', 'error');
        return runClassicalOCRFlow(imageDataUrl);
      }

      showStatus('Processando dados com IA (Llama 70B)...', 'success');
      const promptSystem = getAiPrompt(providerKey);
      const aiResponse = await callGroqChat(groqApiKey, promptSystem, `Texto extraído do documento:\n${cleanedText}`, false);
      console.log('[Upload] Resposta da IA (Groq Text):', aiResponse);

      // Valida se os dados essenciais estão presentes
      if (isAiDataValid(aiResponse, providerKey)) {
        console.log('[Upload] Sucesso! Dados completos extraídos via Groq Text.');
        return aiResponse;
      }

      console.log('[Upload] Dados incompletos via Groq Text. Acionando Fallback Groq Vision...');
    } catch (textErr) {
      console.warn('[Upload] Falha no estágio Groq Text:', textErr.message);
    }

    // 3. Fallback: Groq Vision (tenta múltiplos modelos candidatos)
    if (imageBase64) {
      const visionCandidates = [
        'llama-3.2-11b-vision-instruct',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'qwen/qwen3-vl-32b-instruct',
        'llama-3.2-90b-vision-instruct',
        'llama-3.2-11b-vision-preview'
      ];

      for (const candidateModel of visionCandidates) {
        try {
          if (!checkAndIncrementQuota()) {
            console.warn('[Upload] Limite de quota excedido no fallback Vision.');
            showStatus('Cota da IA excedida no fallback! Usando OCR clássico.', 'error');
            return runClassicalOCRFlow(imageDataUrl);
          }

          console.log(`[Upload] Tentando Groq Vision com o modelo: ${candidateModel}`);
          const displayModelName = candidateModel.includes('/') ? candidateModel.split('/').pop() : candidateModel;
          showStatus(`IA analisando imagem (${displayModelName})...`, 'success');
          
          const promptSystem = getAiPrompt(providerKey);
          const aiVisionResponse = await callGroqChat(
            groqApiKey,
            promptSystem,
            "Aqui está a imagem do documento do passageiro. Extraia os dados solicitados.",
            true,
            imageBase64,
            candidateModel
          );
          console.log(`[Upload] Resposta da IA (Groq Vision - ${candidateModel}):`, aiVisionResponse);

          if (isAiDataValid(aiVisionResponse, providerKey)) {
            console.log(`[Upload] Sucesso! Dados extraídos com sucesso via Groq Vision (${candidateModel}).`);
            return aiVisionResponse;
          }
          console.warn(`[Upload] Dados inválidos/incompletos retornados pelo modelo ${candidateModel}.`);
        } catch (visionErr) {
          console.error(`[Upload] Falha no fallback Groq Vision com ${candidateModel}:`, visionErr.message);
          // Continua o loop para tentar o próximo modelo candidato
        }
      }
    }

    // 4. Último Recurso: Tesseract clássico off-line
    console.warn('[Upload] Ambas tentativas de IA falharam ou dados continuam inválidos. Usando processamento Tesseract clássico.');
    showStatus('IA falhou. Usando fallback de OCR clássico offline...', 'error');
    return runClassicalOCRFlow(imageDataUrl);
  }
  // ─── Extração de Dados ───

  function parsePassengerData(text, numericText = '') {
    const normalized = normalizeOcrText(text);
    const numericNormalized = normalizeOcrText(numericText);
    const nomeCompleto = extractNome(normalized);
    const nomeSeparado = separateNome(nomeCompleto);

    return {
      nomeCompleto: nomeSeparado.nomeCompleto,
      primeiroNome: nomeSeparado.primeiroNome,
      sobrenome: nomeSeparado.sobrenome,
      cpf: extractCPF(normalized, numericNormalized),
      dataNascimento: extractDataNascimento(normalized, numericNormalized),
      genero: extractGenero(normalized),
      nacionalidade: 'Brasil'
    };
  }

  function normalizeOcrText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function normalizeOcrDigits(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[OQD]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/G/g, '6')
      .replace(/B/g, '8');
  }

  function digitsOnly(value) {
    return normalizeOcrDigits(value).replace(/[^0-9]/g, '');
  }

  function sanitizeNomeCandidate(text) {
    if (!text) return null;
    let raw = String(text).toUpperCase().trim().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');

    const noise = ['ESTADO', 'SECRETARIA', 'SEGURANCA', 'PUBLICA', 'POLICIA', 'CIVIL', 'DETRAN', 'BRASIL', 'REPUBLICA', 'GOVERNO', 'FEDERAL', 'MINISTERIO', 'IDENTIDADE', 'CARTEIRA', 'HABILITACAO', 'REGISTRO', 'GERAL', 'ORGAO', 'EMISSOR', 'VIA', 'VALIDO', 'TERRITORIO', 'NACIONAL', 'EMISSAO', 'DATA', 'VALIDADE', 'NASCIMENTO', 'FILIACAO', 'PAI', 'MAE', 'TOGO', 'TERT', 'CTN', 'AMAZONAS', 'SOBRENOME', 'CATEGORIA', 'CNH', 'ACC', 'PERMISSAO', 'DOC', 'DRIVER', 'LICENSE', 'PERMISO', 'CONDUCCION', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    if (noise.some((t) => new RegExp(`\\b${t}\\b`).test(raw))) return null;
    let clean = raw.replace(/[0-9]/g, '').replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    let parts = clean.split(' ').filter((p) => p.length >= 2);
    while (parts.length > 2) {
      const last = parts[parts.length - 1];
      if (last.length <= 2) {
        parts.pop();
        continue;
      }
      if (/^(O+|I+|M+|E+|R+|S+|L+|C+|OOM.*|.*OOO.*|ERR.*)$/.test(last)) {
        parts.pop();
        continue;
      }
      break;
    }
    let final = parts.join(' ');

    final = final.replace(/\\bIOPES\\b/g, 'LOPES');
    final = final.replace(/\\bSIIVA\\b/g, 'SILVA');
    final = final.replace(/\\bSOU5A\\b/g, 'SOUSA');

    return (parts.length >= 2 && final.length > 5) ? final : null;
  }

  function extractNome(text) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 3);
    for (let i = 0; i < lines.length; i += 1) {
      if (/\\b(NOME|SOBRENOME|NAME)\\b/i.test(lines[i])) {
        const cand = sanitizeNomeCandidate(lines[i + 1]);
        if (cand) return cand;
      }
    }
    for (const line of lines) {
      const cand = sanitizeNomeCandidate(line);
      if (cand && cand.split(' ').length >= 3) return cand;
    }
    return null;
  }

  function formatCPF(digits) {
    const c = String(digits || '').slice(0, 11);
    if (c.length !== 11) return null;
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
  }

  function isValidCPF(digits) {
    if (!/^\d{11}$/.test(digits)) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(digits[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
    check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === Number(digits[10]);
  }

  function collectCpfCandidates(value) {
    const matches = normalizeOcrDigits(value).match(/(?:[0-9OQDISLZGB][\s.\-]*){11,14}/g) || [];
    const found = new Set();
    matches.forEach((m) => {
      const digits = digitsOnly(m);
      if (digits.length === 11) {
        found.add(digits);
        return;
      }
      if (digits.length > 11) {
        for (let i = 0; i <= digits.length - 11; i += 1) {
          found.add(digits.slice(i, i + 11));
        }
      }
    });
    return Array.from(found);
  }

  function extractCPF(text, numericText = '') {
    const combined = [text, numericText].filter(Boolean).join('\n');
    const lines = combined.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const cpfLabelRegex = /\\bC\\s*P\\s*F\\b|CPF|C\\.P\\.F/i;
    const ignoreLineRegex = /\\b(REGISTRO|HABILITACAO|VALIDADE|EMISSAO|DOC|IDENTIDADE)\\b/i;
    const labeledCandidates = [];

    for (let i = 0; i < lines.length; i += 1) {
      if (!cpfLabelRegex.test(lines[i])) continue;
      const fromLine = collectCpfCandidates(lines[i]);
      const fromNext = fromLine.length ? [] : collectCpfCandidates(lines[i + 1] || '');
      const combinedCandidates = fromLine.concat(fromNext);
      const valid = combinedCandidates.find(isValidCPF);
      if (valid) return formatCPF(valid);
      labeledCandidates.push(...combinedCandidates);
    }

    if (labeledCandidates.length) return formatCPF(labeledCandidates[0]);

    const allCandidates = [];
    lines.forEach((line) => {
      if (ignoreLineRegex.test(line)) return;
      allCandidates.push(...collectCpfCandidates(line));
    });

    const valid = allCandidates.find(isValidCPF);
    if (valid) return formatCPF(valid);
    return allCandidates.length ? formatCPF(allCandidates[0]) : null;
  }

  function extractDataNascimento(text, numericText = '') {
    const combined = [text, numericText].filter(Boolean).join('\n');
    const lines = combined.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const currentYear = new Date().getFullYear();
    const birthLabelRegex = /(NASC|NASCIMENTO|DATA\s*LOCAL|DATA\s*DE\s*NASC)/i;
    const ignoreLineRegex = /(VALIDADE|EMISSAO|HABILITACAO|VENCIMENTO|EXPEDICAO)/i;

    for (let i = 0; i < lines.length; i += 1) {
      if (!birthLabelRegex.test(lines[i])) continue;
      const sameLine = extractDatesFromLine(lines[i], currentYear);
      if (sameLine.length) return formatDate(sameLine[0]);
      const nextLine = extractDatesFromLine(lines[i + 1] || '', currentYear);
      if (nextLine.length) return formatDate(nextLine[0]);
    }

    let candidates = [];
    lines.forEach((line) => {
      if (ignoreLineRegex.test(line)) return;
      candidates = candidates.concat(extractDatesFromLine(line, currentYear));
    });

    if (!candidates.length) {
      lines.forEach((line) => {
        candidates = candidates.concat(extractDatesFromLine(line, currentYear));
      });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
    return formatDate(candidates[0]);
  }

  function extractDatesFromLine(line, currentYear) {
    const months = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, RBR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
    const candidates = [];
    const seen = new Set();
    const addCandidate = (day, month, year) => {
      if (!day || !month || !year) return;
      if (year < 1900 || year > currentYear) return;
      if (month < 1 || month > 12) return;
      if (day < 1 || day > 31) return;
      const key = `${year}-${month}-${day}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ day, month, year });
    };

    const numericRegex = /([0-9OQDISLZGB]{2})[\/\-\.]([0-9OQDISLZGB]{2})[\/\-\.]([0-9OQDISLZGB]{4})/g;
    let match;
    while ((match = numericRegex.exec(line)) !== null) {
      const day = Number.parseInt(digitsOnly(match[1]), 10);
      const month = Number.parseInt(digitsOnly(match[2]), 10);
      const year = Number.parseInt(digitsOnly(match[3]), 10);
      addCandidate(day, month, year);
    }

    const alphaRegex = /([0-9OQDISLZGB]{2})[\/\-\.\s](JAN|FEV|MAR|ABR|RBR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]([0-9OQDISLZGB]{4})/g;
    while ((match = alphaRegex.exec(line)) !== null) {
      const day = Number.parseInt(digitsOnly(match[1]), 10);
      const month = months[String(match[2] || '').toUpperCase()] || 0;
      const year = Number.parseInt(digitsOnly(match[3]), 10);
      addCandidate(day, month, year);
    }

    const unslashedRegex = /([0-3][0-9OQDISLZGB])\s*([0-1][0-9OQDISLZGB])\s*(19[0-9OQDISLZGB]{2}|20[0-9OQDISLZGB]{2})/g;
    while ((match = unslashedRegex.exec(line)) !== null) {
      const day = Number.parseInt(digitsOnly(match[1]), 10);
      const month = Number.parseInt(digitsOnly(match[2]), 10);
      const year = Number.parseInt(digitsOnly(match[3]), 10);
      addCandidate(day, month, year);
    }

    return candidates;
  }

  function formatDate(date) {
    return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}/${date.year}`;
  }

  function separateNome(n) {
    if (!n) return { primeiroNome: '', sobrenome: '', nomeCompleto: '' };
    const p = n.split(' ');
    return { primeiroNome: p.slice(0, -1).join(' '), sobrenome: p[p.length - 1], nomeCompleto: n };
  }

  function extractGenero(t) {
    if (/\\b(MASC|M\\b|SEXO\\s*M)\\b/i.test(t)) return 'Masculino';
    if (/\\b(FEM|F\\b|SEXO\\s*F)\\b/i.test(t)) return 'Feminino';
    return '';
  }

  // ─── UI e Eventos ───

  function setupEventListeners() {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    document.addEventListener('paste', (e) => { const i = Array.from(e.clipboardData.items).find(x => x.kind === 'file'); if (i) handleFile(i.getAsFile()); });
    btnUploadMore.addEventListener('click', () => { sincronizarCamposDoPassageiroAtual(); passageiroAtual = (passageiroAtual + 1) % 9; renderizarPassageiro(passageiroAtual); });
    btnFinish.addEventListener('click', finalizarEIrAoFormulario);
    if (btnChange) btnChange.addEventListener('click', () => fileInput.click());
    if (btnSelectImage) btnSelectImage.addEventListener('click', () => fileInput.click());
    if (btnBack) btnBack.addEventListener('click', () => previewBox.style.display = 'none');
    if (btnClearPassenger) btnClearPassenger.addEventListener('click', () => { passageiros[passageiroAtual] = { nome: '', cpf: '', dataNascimento: '', genero: '', nacionalidade: 'Brasil' }; renderizarPassageiro(passageiroAtual); });

    // Listeners das Configurações da IA
    if (aiConfigHeader) aiConfigHeader.addEventListener('click', toggleAiConfigExpand);
    if (btnToggleKeyVisibility) btnToggleKeyVisibility.addEventListener('click', toggleKeyVisibility);
    if (btnSaveAiConfig) btnSaveAiConfig.addEventListener('click', saveAiConfig);
    if (btnTestAiConfig) btnTestAiConfig.addEventListener('click', testAiConnection);
  }

  function handleFile(f) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    passageiros[passageiroAtual].imagemDataUrl = url;
    atualizarPreviewPassageiro(passageiroAtual);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      passageiros[passageiroAtual].imageBase64 = base64;
      processarImagemComOCR(url, base64, passageiroAtual);
    };
    reader.readAsDataURL(f);
  }

  async function processarImagemComOCR(url, base64, idx) {
    showSpinner(true);
    try {
      const data = await runOCROnImage(url, base64);
      // Mapeia os campos da resposta da IA para os campos do passageiro
      passageiros[idx] = { 
        ...passageiros[idx], 
        nome: data.nomeCompleto || data.nome || '', 
        cpf: data.cpf || '', 
        dataNascimento: data.dataNascimento || data.birthDate || '', 
        genero: data.genero || '',
        nacionalidade: data.nacionalidade || 'Brasil',
        email: data.email || '',
        telefone: data.telefone || '',
        documento: data.documento || ''
      };
      renderizarPassageiro(idx);
      showStatus('Extração concluída!', 'success');
      setTimeout(() => {
        const el = document.getElementById('upload-status');
        if (el && el.textContent === 'Extração concluída!') el.style.display = 'none';
      }, 3000);
    } catch (err) {
      console.error('[Upload] OCR Error:', err);
      showStatus('Erro ao processar imagem.', 'error');
    } finally { 
      showSpinner(false); 
    }
  }


  function renderizarPassageiro(idx) {
    const d = passageiros[idx];
    fieldNome.value = d.nome || '';
    fieldCpf.value = d.cpf || '';
    fieldData.value = d.dataNascimento || '';
    if (fieldGenero) fieldGenero.value = d.genero || '';
    atualizarAbas();
  }

  function atualizarPreviewPassageiro(idx) {
    const d = passageiros[idx];
    if (d.imagemDataUrl) { previewImg.src = d.imagemDataUrl; previewBox.style.display = 'block'; dropZone.style.display = 'none'; }
  }

  function atualizarAbas() {
    if (!passengerSummary) return;
    passengerSummary.innerHTML = '';
    passageiros.forEach((d, i) => {
      const card = document.createElement('button');
      card.className = `passenger-card ${i === passageiroAtual ? 'active' : ''} ${d.nome ? 'filled' : 'empty'}`;
      card.innerHTML = `<div class="thumb" style="${d.imagemDataUrl ? `background-image:url(${d.imagemDataUrl})` : ''}">${d.imagemDataUrl ? '' : i+1}</div><div class="title">P${i+1}</div>`;
      card.onclick = () => { sincronizarCamposDoPassageiroAtual(); passageiroAtual = i; renderizarPassageiro(i); };
      passengerSummary.appendChild(card);
    });
  }

  function sincronizarCamposDoPassageiroAtual() {
    const d = passageiros[passageiroAtual];
    if (fieldNome) d.nome = fieldNome.value;
    if (fieldCpf) d.cpf = fieldCpf.value;
    if (fieldData) d.dataNascimento = fieldData.value;
  }

  function finalizarEIrAoFormulario() {
    sincronizarCamposDoPassageiroAtual();
    const validos = passageiros.filter(p => p.nome || p.cpf);
    chrome.storage.local.set({ passageirosOCR: validos, ocrCompleted: true }, () => {
      chrome.tabs.sendMessage(targetTabId, { type: 'OCR_AUTOFILL', data: validos }, () => {
        chrome.tabs.update(targetTabId, { active: true });
        chrome.tabs.getCurrent(t => chrome.tabs.remove(t.id));
      });
    });
  }

  function loadImageFromUrl(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  function showSpinner(v) { if (spinner) spinner.style.display = v ? 'flex' : 'none'; }
  function showStatus(m, t) { const el = document.getElementById('upload-status'); if (el) { el.textContent = m; el.className = t; el.style.display = 'block'; } }

  window.onload = () => { aplicarConfiguracaoDoProvedor(); setupEventListeners(); loadAiConfig(); atualizarAbas(); };
