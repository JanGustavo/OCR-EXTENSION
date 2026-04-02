/**
 * OFFSCREEN DOCUMENT — Motor de OCR
 *
 * Este script roda em um documento HTML oculto com acesso completo ao DOM.
 * Responsabilidades:
 *  1. Receber a imagem base64 do Service Worker
 *  2. Renderizar a imagem em um <canvas> para pré-processamento
 *  3. Executar Tesseract.js para extrair o texto bruto
 *  4. Parsear o texto com regex para identificar Nome, CPF e Data de Nascimento
 *  5. Retornar os dados estruturados ao Service Worker
 *
 * ATENÇÃO: Tesseract.js deve estar incluído localmente em /assets/tesseract/
 * Download dos modelos: https://github.com/tesseract-ocr/tessdata
 * Arquivos necessários: tesseract.esm.min.js + worker.min.js + tessdata (por/eng)
 */

import Tesseract from '../assets/tesseract/tesseract.esm.min.js';

// ─── Roteador de mensagens ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Filtrar apenas mensagens destinadas a este documento
  if (message.target !== 'offscreen') {
    sendResponse({ handled: false });
    return false;
  }

  if (message.type === 'RUN_OCR') {
    // Processar de forma assíncrona e responder quando terminar
    runOCR(message.imageBase64, message.requestId).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      console.error('[Offscreen] Erro no OCR:', error);
      sendResponse({ ok: false, error: error.message });
    });
    // Retornar true para indicar resposta assíncrona
    return true;
  }
  
  sendResponse({ handled: false });
  return false;
});

// ─── Pipeline de OCR ────────────────────────────────────────────────────────

async function runOCR(imageBase64, requestId) {
  try {
    const processedImageData = await preprocessImage(imageBase64);
    const rawText = await extractText(processedImageData);
    console.log("TEXTO BRUTO EXTRAÍDO:", rawText); // <--- Adiciona isto
    const parsedData = parsePassengerData(rawText);

    // Retorna os dados ao Service Worker
    await chrome.runtime.sendMessage({
      type: 'OCR_RESULT',
      requestId,
      data: parsedData
    });

  } catch (error) {
    console.error('[Offscreen] Erro no OCR:', error);
    await chrome.runtime.sendMessage({
      type: 'OCR_RESULT',
      requestId,
      data: null,
      error: error.message
    });
  }
}

/**
 * Pré-processa a imagem via Canvas para melhorar a acurácia do OCR.
 * Aplica: escala de cinza + aumento de contraste + binarização simples.
 *
 * @param {string} base64 - Imagem em base64 (pode incluir prefixo data:image/...)
 * @returns {Promise<ImageData>} - ImageData processada para o Tesseract
 */
async function preprocessImage(base64) {
  const img = await loadImage(base64);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Escala 2x para melhorar legibilidade de fontes pequenas
  canvas.width = img.naturalWidth * 2;
  canvas.height = img.naturalHeight * 2;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Aumentar o contraste (Fator de contraste)
  const contrast = 75; // Valor entre 0 e 255. 75 dá um bom "boost" nas letras pretas
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    // Converter para escala de cinza perceptível
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    
    // Aplicar o contraste para escurecer as letras e clarear o fundo
    let newColor = factor * (lum - 128) + 128;
    
    // Garantir que fica entre 0 e 255
    newColor = Math.max(0, Math.min(255, newColor));
    
    data[i] = data[i + 1] = data[i + 2] = newColor;
    data[i + 3] = 255; // alpha (opacidade total)W
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Carrega uma imagem base64 em um elemento <img> do DOM.
 * @param {string} base64
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(base64) {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = reject;
    // Aceita base64 com ou sem prefixo
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  });
}

/**
 * Executa o Tesseract.js na imagem pré-processada.
 * Configurado para Português do Brasil (por) com fallback para inglês (eng).
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<string>} - Texto bruto extraído
 */
async function extractText(canvas) {
  const baseOptions = {
    // MV3: importScripts com chrome-extension:// URLs causa erro
    // Força usar worker remoto do CDN
    workerBlobURL: false,
    langPath: chrome.runtime.getURL('assets/tesseract/tessdata'),
    corePath: chrome.runtime.getURL('assets/tesseract/tesseract-core.wasm.js'),
    logger: (m) => console.debug('[Tesseract]', m)
  };

  let worker;
  
  // Estratégia: Tenta CDN PRIMEIRO (mais confiável em MV3), depois fallback para local
  try {
    console.log('[Offscreen] Tentando worker remoto (CDN)...');
    worker = await Tesseract.createWorker('por+eng', 1, {
      ...baseOptions,
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js'
    });
    console.log('[Offscreen] Worker remoto criado com sucesso');
  } catch (cdnErr) {
    console.warn('[Offscreen] Falha no worker remoto:', cdnErr.message);
    
    // Fallback para worker local
    try {
      console.log('[Offscreen] Tentando worker local...');
      worker = await Tesseract.createWorker('por+eng', 1, {
        ...baseOptions,
        workerPath: chrome.runtime.getURL('assets/tesseract/worker.min.js')
      });
      console.log('[Offscreen] Worker local criado com sucesso');
    } catch (localErr) {
      console.error('[Offscreen] Falha no worker local:', localErr.message);
      throw new Error(`Todos os workers falharam. CDN: ${cdnErr.message}, Local: ${localErr.message}`);
    }
  }

  // 👇 A MAGIA ACONTECE AQUI 👇
  await worker.setParameters({
    // PSM 11 = Texto esparso (Encontra o máximo de texto possível sem uma ordem rígida)
    // PSM 6 = Assume um único bloco de texto uniforme (testa qual funciona melhor para ti)
    tessedit_pageseg_mode: Tesseract.PSM ? Tesseract.PSM.SPARSE_TEXT : '11',
    // Opcional: Se só precisas de maiúsculas, números e pontuação, podes limitar o alfabeto:
    // tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: '
  });

  const { data: { text } } = await worker.recognize(canvas);
  await worker.terminate();

  return text;
}

// ─── Parser de dados de passageiros ────────────────────────────────────────

/**
 * Separa nome completo em nome(s) e sobrenome.
 * Ex: "CARLOS EDUARDO MENDONCA" → { primeiroNome: "CARLOS EDUARDO", sobrenome: "MENDONCA", nomeCompleto: "CARLOS EDUARDO MENDONCA" }
 */
function separateNome(nomeCompleto) {
  if (!nomeCompleto || typeof nomeCompleto !== 'string') {
    return { primeiroNome: null, sobrenome: null, nomeCompleto: null };
  }

  const palavras = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) {
    return { primeiroNome: null, sobrenome: null, nomeCompleto: null };
  }

  if (palavras.length === 1) {
    return { primeiroNome: palavras[0], sobrenome: '', nomeCompleto };
  }

  // Último nome = sobrenome, resto = nome(s)
  const sobrenome = palavras[palavras.length - 1];
  const primeiroNome = palavras.slice(0, -1).join(' ');

  return { primeiroNome, sobrenome, nomeCompleto };
}

/**
 * Extrai Nome, CPF e Data de Nascimento do texto bruto via regex.
 * As regex foram calibradas para os formatos mais comuns em:
 * - Passaportes brasileiros digitalizados
 * - Prints de sistemas de agências de viagens (ex: Amadeus, Sabre)
 * - Bilhetes de identidade
 *
 * @param {string} text - Texto bruto do Tesseract
 * @returns {{ nome: string|null, cpf: string|null, dataNascimento: string|null }}
 */
function parsePassengerData(text) {
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas de acento combinadas (ex.: Ç)
    .toUpperCase();

  const nomeCompleto = extractNome(normalizedText);
  const nomeSeparado = separateNome(nomeCompleto);

  return {
    nomeCompleto: nomeSeparado.nomeCompleto,
    primeiroNome: nomeSeparado.primeiroNome,
    sobrenome: nomeSeparado.sobrenome,
    cpf: extractCPF(normalizedText),
    dataNascimento: extractDataNascimento(normalizedText)
  };
}

function sanitizeNomeCandidate(candidate) {
  if (!candidate) return null;

  const cleaned = candidate
    .replace(/\b(NOME|NAME|PASSAGEIRO|TITULAR|COMPLETO)\b/g, ' ')
    .replace(/\b(CPF|DATA|NASC(?:IMENTO)?|NATURALIDADE|RG|DOC(?:UMENTO)?)\b.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;
  return cleaned;
}

function extractNome(text) {
  const patterns = [
    /(?:NOME(?:\s+COMPLETO)?|NAME|PASSAGEIRO|TITULAR)[:\s]*([A-Z][A-Z\s]{3,90}?)(?=\s+(?:CPF|DATA|NASC|NATURALIDADE|RG|DOC)|$)/,
    /^([A-Z]{2,}(?:\s[A-Z]{2,}){1,5})$/m
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = sanitizeNomeCandidate(match?.[1]);
    if (candidate) return candidate;
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/\bNOME\b/.test(lines[i])) {
      const candidate = sanitizeNomeCandidate(lines[i + 1] || lines[i]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function extractCPF(text) {
  // CPF: 000.000.000-00 ou 00000000000 (com ou sem formatação)
  const match = text.match(/\b(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?(\d{2})\b/);
  if (!match) return null;
  // Retorna formatado
  return `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
}

function extractDataNascimento(text) {
  // Formatos: 01/01/1990 | 01-01-1990 | 01.01.1990 | "NASC 01/01/1990"
  const patterns = [
    /(?:NASC(?:IMENTO)?|DOB|BORN|DT\.?\s*NASC)[:\s]*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/,
    /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Normaliza separadores para /
      return match[1].replace(/[-\.]/g, '/');
    }
  }
  return null;
}
