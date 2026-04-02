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
 * Download: https://github.com/naptha/tesseract.js/releases
 * Arquivo necessário: tesseract.min.js + worker.min.js + tessdata (por/eng)
 */

import Tesseract from '../assets/tesseract/tesseract.esm.min.js';

// ─── Roteador de mensagens ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  // Filtrar apenas mensagens destinadas a este documento
  if (message.target !== 'offscreen') return;

  if (message.type === 'RUN_OCR') {
    runOCR(message.imageBase64);
  }
});

// ─── Pipeline de OCR ────────────────────────────────────────────────────────

async function runOCR(imageBase64) {
  try {
    const processedImageData = await preprocessImage(imageBase64);
    const rawText = await extractText(processedImageData);
    const parsedData = parsePassengerData(rawText);

    // Retorna os dados ao Service Worker
    chrome.runtime.sendMessage({
      type: 'OCR_RESULT',
      data: parsedData
    });

  } catch (error) {
    console.error('[Offscreen] Erro no OCR:', error);
    chrome.runtime.sendMessage({
      type: 'OCR_RESULT',
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

  // Binarização: converte para escala de cinza e aplica threshold
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const THRESHOLD = 128;

  for (let i = 0; i < data.length; i += 4) {
    // Luminância perceptual (ITU-R BT.709)
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const bw = lum < THRESHOLD ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = bw;
    data[i + 3] = 255; // alpha
  }

  ctx.putImageData(imageData, 0, 0);

  // Retorna o canvas processado — Tesseract aceita HTMLCanvasElement diretamente
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
  const worker = await Tesseract.createWorker('por+eng', 1, {
    // Caminhos locais — WASM e worker devem estar em /assets/tesseract/
    workerPath: chrome.runtime.getURL('assets/tesseract/worker.min.js'),
    langPath: chrome.runtime.getURL('assets/tesseract/tessdata'),
    corePath: chrome.runtime.getURL('assets/tesseract/tesseract-core.wasm.js'),
    logger: (m) => console.debug('[Tesseract]', m) // remover em produção
  });

  const { data: { text } } = await worker.recognize(canvas);
  await worker.terminate();

  return text;
}

// ─── Parser de dados de passageiros ────────────────────────────────────────

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
    .normalize('NFD') // decompõe acentos para robustez da regex
    .toUpperCase();

  return {
    nome: extractNome(normalizedText),
    cpf: extractCPF(normalizedText),
    dataNascimento: extractDataNascimento(normalizedText)
  };
}

function extractNome(text) {
  // Padrão: "NOME: FULANO DE TAL" ou "PASSAGEIRO: FULANO DE TAL"
  const patterns = [
    /(?:NOME|NAME|PASSAGEIRO|TITULAR)[:\s]+([A-Z][A-Z\s]{3,60})/,
    /^([A-Z]{2,}(?:\s[A-Z]{2,}){1,4})$/m  // linha inteira com 2-5 palavras maiúsculas
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
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
