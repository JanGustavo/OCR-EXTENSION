// Importa Tesseract.js como módulo ESM
import * as TesseractModule from '../assets/tesseract/tesseract.esm.min.js';

const Tesseract = TesseractModule.Tesseract || TesseractModule.default || TesseractModule;

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const previewBox = document.getElementById('preview-box');
const previewImg = document.getElementById('preview-img');
const spinner    = document.getElementById('spinner');
const statusEl   = document.getElementById('status');
const btnChange  = document.getElementById('btn-change');

let ocrWorker = null; // Tesseract worker instance

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

btnChange.addEventListener('click', () => {
  previewBox.style.display = 'none';
  dropZone.style.display = 'block';
  fileInput.value = '';
  hideStatus();
});

/**
 * Inicializa o worker do Tesseract.js (executado na primeira vez)
 */
async function initOCRWorker() {
  if (ocrWorker) return; // Já inicializado

  showSpinner(true);
  showStatus('Carregando mecanismo OCR...', 'success');

  try {
    // Aguarda o Tesseract.js ser carregado globalmente
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js não foi carregado. Aguarde um momento.');
    }

    console.log('[Upload] Criando worker OCR...');
    const options = {
      // Em contexto de extensão, o blob worker pode falhar no importScripts.
      workerBlobURL: false,
      workerPath: chrome.runtime.getURL('assets/tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('assets/tesseract/tesseract-core.wasm.js'),
      langPath: chrome.runtime.getURL('assets/tesseract/tessdata'),
      logger: (m) => console.debug('[OCR]', m)
    };

    try {
      ocrWorker = await Tesseract.createWorker('por+eng', 1, options);
    } catch (errA) {
      // Compatibilidade com builds que usam assinatura (langs, options)
      ocrWorker = await Tesseract.createWorker('por+eng', options);
      console.warn('[Upload] createWorker fallback (langs, options):', errA?.message || errA);
    }

    console.log('[Upload] Worker OCR criado com sucesso');
    showStatus('', 'success');
    showSpinner(false);
  } catch (err) {
    console.error('[Upload] Falha ao inicializar OCR:', err);
    showStatus('Erro ao carregar OCR local.', 'error');
    showSpinner(false);
    throw err;
  }
}

/**
 * Processa a imagem via OCR e extrai dados
 */
async function runOCROnImage(imageDataUrl) {
  try {
    await initOCRWorker();

    showStatus('Processando imagem com OCR...', 'success');
    console.log('[Upload] Iniciando OCR...');

    // Recognize: executa OCR na imagem
    const result = await ocrWorker.recognize(imageDataUrl);
    const rawText = result.data.text;

    console.log('[Upload] Texto bruto extraído:', rawText.substring(0, 200) + '...');

    // Parse: extrai nome, CPF, data usando as mesmas funções do offscreen
    const parsed = parsePassengerData(rawText);

    console.log('[Upload] Dados parseados:', parsed);

    if (!parsed.nomeCompleto && !parsed.cpf && !parsed.dataNascimento) {
      throw new Error('Nenhum dado foi extraído. Tente uma imagem mais clara.');
    }

    showStatus('✓ Dados extraídos com sucesso!', 'success');
    return parsed;
  } catch (err) {
    console.error('[Upload] Erro no OCR:', err);
    showStatus(`Erro no OCR: ${err.message}`, 'error');
    throw err;
  }
}

/**
 * Copia as funções de parsing do offscreen/offscreen.js
 */
function parsePassengerData(text) {
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas diacríticas
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

function sanitizeNomeCandidate(candidate) {
  if (!candidate) return null;

  const cleaned = candidate
    .replace(/\b(NOME|NAME|PASSAGEIRO|TITULAR|COMPLETO)\b/g, ' ')
    .replace(/\b(FOTO|PHOTO|FOTOGRAFIA|ASSINATURA)\b.*$/g, '')
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
  const match = text.match(/\b(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?(\d{2})\b/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
}

function extractDataNascimento(text) {
  const patterns = [
    /(?:NASC(?:IMENTO)?|DOB|BORN|DT\.?\s*NASC)[:\s]*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/,
    /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/[-\.]/g, '/');
    }
  }
  return null;
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) return showStatus('Apenas imagens PNG, JPG ou WEBP.', 'error');
  if (file.size > 5 * 1024 * 1024) return showStatus('Imagem muito grande. Limite: 5MB.', 'error');

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);
  dropZone.style.display = 'none';
  previewBox.style.display = 'block';

  const reader = new FileReader();
  reader.onload  = (e) => processarImagemComOCR(e.target.result);
  reader.onerror = ()  => { showSpinner(false); showStatus('Erro ao ler a imagem.', 'error'); };
  reader.readAsDataURL(file);
}

/**
 * Processa a imagem: OCR local + parsing + salva resultado
 */
async function processarImagemComOCR(imageDataUrl) {
  try {
    showSpinner(true);
    const parsedData = await runOCROnImage(imageDataUrl);
    showSpinner(false);
    
    // Salva e fecha
    await salvarDados(parsedData);
  } catch (err) {
    console.error('[Upload] Erro ao processar imagem:', err);
    showSpinner(false);
    showStatus(`Falha: ${err.message}`, 'error');
  }
}

/**
 * Salva os dados no chrome.storage.local e fecha a aba
 */
function salvarDados(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ ocrResult: data, ocrPendente: true }, () => {
      showStatus('✓ Dados salvos! Clique no ícone da extensão para revisar.', 'success');
      // Fecha após 2s para o usuário ver feedback
      setTimeout(() => { window.close(); resolve(); }, 2000);
    });
  });
}

function showSpinner(v) { spinner.style.display = v ? 'flex' : 'none'; }
function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
  statusEl.style.display = 'block';
}
function hideStatus() { statusEl.style.display = 'none'; }
