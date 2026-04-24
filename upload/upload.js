// Importa Tesseract.js como módulo ESM
import * as TesseractModule from '../assets/tesseract/tesseract.esm.min.js';

const urlParams = new URLSearchParams(window.location.search);
const targetTabId = Number.parseInt(urlParams.get('targetTabId') || '', 10);

// ─── Estado da Aplicação (Memória) ────────────────────────────────────────────

// 2. Variável que controla qual a aba/slot que o utilizador está a ver agora.
// Começa no 0 (que corresponde ao Passageiro 1).
let passageiroAtual = 0;

const providerKey = (urlParams.get('provider') || 'azul').toLowerCase();
const providerConfigMap = {
  azul: {
    title: 'OCR Passagens — Azul',
    heading: '✈ OCR Passagens Azul',
    generoHint: '(opcional — preenche o select da Azul)',
    nationality: 'Brasil',
    showContactFields: false,
    theme: {
      accent: '#0068ff',
      accentHover: '#0052cc',
      accentRgb: '0, 104, 255',
      accentAltRgb: '0, 184, 255',
      headingFont: '"Bahnschrift", "Segoe UI", sans-serif',
      bodyFont: '"Aptos", "Segoe UI Variable", "Segoe UI", sans-serif'
    }
  },
  latam: {
    title: 'OCR Passagens — LATAM',
    heading: '✈ OCR Passagens LATAM',
    generoHint: '(opcional — preenche o select da LATAM)',
    nationality: 'Brasil',
    showContactFields: true,
    theme: {
      accent: '#cc0a2f',
      accentHover: '#9f0724',
      accentRgb: '204, 10, 47',
      accentAltRgb: '255, 122, 61',
      headingFont: '"Franklin Gothic Medium", "Arial Narrow", sans-serif',
      bodyFont: '"Trebuchet MS", "Segoe UI", sans-serif'
    }
  },
  smiles: {
    title: 'OCR Passagens — Smiles',
    heading: '✈ OCR Passagens Smiles',
    generoHint: '(opcional — preenche o select da Smiles)',
    nationality: 'Brasil',
    showContactFields: true,
    theme: {
      accent: '#ff6a00',
      accentHover: '#e35700',
      accentRgb: '255, 106, 0',
      accentAltRgb: '255, 174, 0',
      headingFont: '"Segoe Print", "Comic Sans MS", cursive',
      bodyFont: '"Verdana", "Segoe UI", sans-serif'
    }
  }
};

const providerConfig = providerConfigMap[providerKey] || providerConfigMap.azul;
const DEFAULT_NATIONALITY = providerConfig.nationality;

// 1. Criamos um Array com 9 posições (índices de 0 a 8).
// Cada posição começa com um objeto vazio.
let passageiros = Array.from({ length: 9 }, () => ({
  nome: '',
  cpf: '',
  dataNascimento: '',
  genero: '',          // CORRIGIDO: adicionado para o select da Azul
  nacionalidade: DEFAULT_NATIONALITY, // CORRIGIDO: padrão do provedor atual
  email: '',
  telefone: '',
  imagemDataUrl: ''
}));

// ──────────────────────────────────────────────────────────────────────────────




const Tesseract = TesseractModule.Tesseract || TesseractModule.default || TesseractModule;

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const previewBox = document.getElementById('preview-box');
const previewImg = document.getElementById('preview-img');
const spinner    = document.getElementById('spinner');
const btnChange  = document.getElementById('btn-change');
const pageHeading = document.getElementById('page-heading');
const generoHint = document.getElementById('genero-hint');

// Novos elementos
const uploadSection  = document.getElementById('upload-section');
const resultSection  = document.getElementById('result-section');
const passengerSummary = document.getElementById('passenger-summary');
const passengerCounter = document.getElementById('passenger-counter');
const btnSelectImage = document.getElementById('btn-select-image');
const fieldNome      = document.getElementById('field-nome');
const fieldCpf       = document.getElementById('field-cpf');
const fieldData      = document.getElementById('field-data');
const contactFields  = document.getElementById('contact-fields');
const fieldEmail     = document.getElementById('field-email');
const fieldTelefone  = document.getElementById('field-telefone');
const btnUploadMore    = document.getElementById('btn-upload-more');
const btnBack          = document.getElementById('btn-back');
const btnFinish        = document.getElementById('btn-finish');
const btnClearPassenger = document.getElementById('btn-clear-passenger'); // NOVO
const fieldGenero      = document.getElementById('field-genero');       // CORRIGIDO: novo campo
const fieldNacionalidade = document.getElementById('field-nacionalidade'); // CORRIGIDO: novo campo
const btnPasteImage = document.getElementById('btn-paste-image');

// Debug: verificar se elementos foram encontrados
console.log('[Upload] dropZone:', dropZone);
console.log('[Upload] fileInput:', fileInput);
console.log('[Upload] Elements loaded successfully');

let ocrWorker = null; // Tesseract worker instance

// Criar as abas dos passageiros
function criarAbas() {
  aplicarConfiguracaoDoProvedor();
  atualizarAbas();
  renderizarResumoPassageiros();
}

function atualizarAbas() {
  renderizarResumoPassageiros();
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('hidden'));
  // Não esconde nada — deixa ambas as secções visíveis
}

function aplicarConfiguracaoDoProvedor() {
  document.title = providerConfig.title;

  const root = document.documentElement;
  const theme = providerConfig.theme || {};

  root.style.setProperty('--accent', theme.accent || '#4f46e5');
  root.style.setProperty('--accent-hover', theme.accentHover || '#6366f1');
  root.style.setProperty('--accent-rgb', theme.accentRgb || '79, 70, 229');
  root.style.setProperty('--accent-alt-rgb', theme.accentAltRgb || '16, 185, 129');
  root.style.setProperty('--font-heading', theme.headingFont || '"Segoe UI", sans-serif');
  root.style.setProperty('--font-body', theme.bodyFont || '"Segoe UI", sans-serif');

  if (document.body) {
    document.body.dataset.provider = providerKey;
  }

  if (pageHeading) {
    pageHeading.textContent = providerConfig.heading;
  }

  if (generoHint) {
    generoHint.textContent = providerConfig.generoHint;
  }

  if (contactFields) {
    contactFields.classList.toggle('hidden', !providerConfig.showContactFields);

    if (!providerConfig.showContactFields) {
      if (fieldEmail) fieldEmail.value = '';
      if (fieldTelefone) fieldTelefone.value = '';
      if (passageiros[passageiroAtual]) {
        passageiros[passageiroAtual].email = '';
        passageiros[passageiroAtual].telefone = '';
      }
    }
  }
}

function hideStatus() {
  const uploadStatus = document.getElementById('upload-status');
  if (uploadStatus) uploadStatus.style.display = 'none';
  
  const resultStatus = document.getElementById('result-status');
  if (resultStatus) resultStatus.style.display = 'none';
}

function sincronizarCamposDoPassageiroAtual() {
  const atual = passageiros[passageiroAtual] || {};
  passageiros[passageiroAtual] = {
    ...atual,
    nome: fieldNome ? fieldNome.value.trim() : (atual.nome || ''),
    cpf: fieldCpf ? fieldCpf.value.trim() : (atual.cpf || ''),
    dataNascimento: fieldData ? fieldData.value.trim() : (atual.dataNascimento || ''),
    birthDate: fieldData ? fieldData.value.trim() : (atual.birthDate || atual.dataNascimento || ''),
    genero: fieldGenero ? fieldGenero.value : (atual.genero || ''),
    gender: fieldGenero ? fieldGenero.value : (atual.gender || atual.genero || ''),
    nacionalidade: fieldNacionalidade ? fieldNacionalidade.value : (atual.nacionalidade || DEFAULT_NATIONALITY),
    nationality: fieldNacionalidade ? fieldNacionalidade.value : (atual.nationality || atual.nacionalidade || DEFAULT_NATIONALITY),
    email: fieldEmail ? fieldEmail.value.trim() : (atual.email || ''),
    telefone: fieldTelefone ? fieldTelefone.value.trim() : (atual.telefone || '')
  };
}

function proximoIndicePassageiro() {
  const isEmpty = (p) => !(p?.nome || p?.cpf || p?.dataNascimento || p?.email || p?.telefone || p?.imagemDataUrl);

  for (let i = passageiroAtual + 1; i < passageiros.length; i++) {
    if (isEmpty(passageiros[i])) return i;
  }

  for (let i = 0; i < passageiroAtual; i++) {
    if (isEmpty(passageiros[i])) return i;
  }

  return (passageiroAtual + 1) % passageiros.length;
}

function isImageLikeFile(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  const fileName = String(file?.name || '').toLowerCase();

  if (mimeType.startsWith('image/')) return true;

  return /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(fileName);
}

async function readFileAsDataUrl(file) {
  const toDataUrlFromBuffer = (buffer, mimeType) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
  };

  try {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => {
        reject(reader.error || new Error('Falha ao ler o arquivo com FileReader.'));
      };

      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.warn('[Upload] FileReader falhou, tentando fallback com arrayBuffer:', error);

    try {
      const buffer = await file.arrayBuffer();
      return toDataUrlFromBuffer(buffer, file.type);
    } catch (arrayBufferError) {
      console.warn('[Upload] arrayBuffer falhou, tentando fallback com slice():', arrayBufferError);

      try {
        const slicedBlob = file.slice(0, file.size, file.type || 'application/octet-stream');
        const buffer = await slicedBlob.arrayBuffer();
        return toDataUrlFromBuffer(buffer, file.type);
      } catch (sliceError) {
        console.warn('[Upload] Falha ao converter a imagem para data URL:', sliceError);
        throw new Error('A imagem selecionada não pôde ser lida. Tente usar o botão para selecionar o arquivo, ou teste outra imagem.');
      }
    }
  }
}

function getFileFromDropEvent(event) {
  const fallbackFile = event.dataTransfer?.files?.[0] || null;
  const items = Array.from(event.dataTransfer?.items || []);

  const fileItem = items.find((item) => item.kind === 'file');
  const directFile = fileItem?.getAsFile() || fallbackFile;
  if (directFile && directFile.size > 0) return Promise.resolve(directFile);

  const uriItem = items.find((item) => item.kind === 'string' && item.type === 'text/uri-list');
  if (!uriItem) return Promise.resolve(directFile || null);

  return new Promise((resolve) => {
    uriItem.getAsString(async (uriListRaw) => {
      try {
        const firstUri = String(uriListRaw || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))[0];

        if (!firstUri) {
          resolve(directFile || null);
          return;
        }

        const response = await fetch(firstUri);
        if (!response.ok) {
          resolve(directFile || null);
          return;
        }

        const blob = await response.blob();
        const fallbackName = decodeURIComponent(firstUri.split('/').pop() || 'imagem-arrastada');
        const fileFromUri = new File([blob], fallbackName, {
          type: blob.type || 'application/octet-stream',
          lastModified: Date.now()
        });

        resolve(fileFromUri);
      } catch (error) {
        console.warn('[Upload] Fallback uri-list falhou:', error);
        resolve(directFile || null);
      }
    });
  });
}

function isBlobUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:');
}

function revokePassengerImageUrl(index) {
  const url = passageiros[index]?.imagemDataUrl;
  if (isBlobUrl(url)) {
    URL.revokeObjectURL(url);
  }
}

function cloneFile(file) {
  return new File([file], file.name || 'imagem', {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now()
  });
}

function loadImageFromUrl(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem para OCR.'));
    image.src = imageUrl;
  });
}

async function imageUrlToCanvas(imageUrl) {
  const image = await loadImageFromUrl(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível preparar o canvas para OCR.');
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

function extractImageFromClipboardData(clipboardData) {
  const items = Array.from(clipboardData?.items || []);
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  return imageItem?.getAsFile() || null;
}

async function readClipboardImageViaApi() {
  if (!navigator.clipboard?.read) {
    throw new Error('O navegador não permite leitura direta da área de transferência.');
  }

  const clipboardItems = await navigator.clipboard.read();
  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;

    const blob = await item.getType(imageType);
    return new File([blob], `imagem-colada.${imageType.split('/')[1] || 'png'}`, {
      type: imageType,
      lastModified: Date.now()
    });
  }

  throw new Error('Nenhuma imagem foi encontrada na área de transferência.');
}

// ─── Setup dos Event Listeners ───
function setupEventListeners() {
  if (!dropZone) {
    console.error('[Upload] dropZone não encontrado!');
    return;
  }

  dropZone.addEventListener('click', () => {
    console.log('[Upload] Drop-zone clicado');
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log('[Upload] Arquivo selecionado:', file.name);
      handleFile(file);
    }
  });

  // Drag-and-drop desativado temporariamente: manter apenas seleção manual.

  document.addEventListener('paste', (event) => {
    const pastedFile = extractImageFromClipboardData(event.clipboardData);
    if (!pastedFile) return;

    event.preventDefault();
    showStatus('Imagem colada! Processando...', 'success');
    handleFile(pastedFile);
  });

  if (btnPasteImage) {
    btnPasteImage.addEventListener('click', async () => {
      try {
        const file = await readClipboardImageViaApi();
        showStatus('Imagem colada da área de transferência.', 'success');
        handleFile(file);
      } catch (error) {
        console.warn('[Upload] Não foi possível colar imagem via botão:', error);
        showStatus('Não foi possível colar imagem. Use Ctrl+V após copiar uma imagem.', 'error');
      }
    });
  }

  btnChange.addEventListener('click', () => {
    previewBox.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    hideStatus();
    fileInput.click();
  });

  if (btnSelectImage) {
    btnSelectImage.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
  }

  btnBack.addEventListener('click', () => {
    previewBox.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    hideStatus();
  });

  btnUploadMore.addEventListener('click', () => {
    sincronizarCamposDoPassageiroAtual();
    passageiroAtual = proximoIndicePassageiro();
    renderizarPassageiro(passageiroAtual);
    fileInput.value = '';
    showStatus(`Passageiro ${passageiroAtual + 1} selecionado para preenchimento.`, 'success');
  });

  btnFinish.addEventListener('click', () => {
    finalizarEIrAoFormulario();
  });

  // NOVO: limpar passageiro atual
  if (btnClearPassenger) {
    btnClearPassenger.addEventListener('click', () => {
      limparPassageiroAtual();
    });
  }

  // CORRIGIDO: sincroniza selects de gênero e nacionalidade com o array em tempo real
  if (fieldGenero) {
    fieldGenero.addEventListener('change', () => {
      passageiros[passageiroAtual].genero  = fieldGenero.value;
      passageiros[passageiroAtual].gender  = fieldGenero.value;
    });
  }
  if (fieldNacionalidade) {
    fieldNacionalidade.addEventListener('change', () => {
      passageiros[passageiroAtual].nacionalidade = fieldNacionalidade.value;
      passageiros[passageiroAtual].nationality   = fieldNacionalidade.value;
    });
  }

  if (fieldEmail) {
    fieldEmail.addEventListener('input', () => {
      passageiros[passageiroAtual].email = fieldEmail.value;
    });
  }

  if (fieldTelefone) {
    fieldTelefone.addEventListener('input', () => {
      passageiros[passageiroAtual].telefone = fieldTelefone.value;
    });
  }

  if (fieldNome) {
    fieldNome.addEventListener('input', () => {
      passageiros[passageiroAtual].nome = fieldNome.value;
    });
  }

  if (fieldCpf) {
    fieldCpf.addEventListener('input', () => {
      passageiros[passageiroAtual].cpf = fieldCpf.value;
    });
  }

  if (fieldData) {
    fieldData.addEventListener('input', () => {
      passageiros[passageiroAtual].dataNascimento = fieldData.value;
      passageiros[passageiroAtual].birthDate = fieldData.value;
    });
  }

  console.log('[Upload] Event listeners configurados com sucesso');
}

// ─── Inicializar listeners e abas ao carregar
window.addEventListener('load', () => {
  console.log('[Upload] Página carregada, inicializando...');
  setupEventListeners();
  criarAbas();
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

    // Pré-processamento simples no Canvas antes do OCR (Sincronizado com offscreen)
    const img = await loadImageFromUrl(imageDataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth * 2;
    canvas.height = img.naturalHeight * 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Aplicar binarização básica para reduzir ruído
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const color = lum < 128 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = color;
    }
    ctx.putImageData(imageData, 0, 0);

    // Configura parâmetros do worker antes do reconhecimento
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '3',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: ÁÉÍÓÚÂÊÔÃÕÇ',
    });

    const result = await ocrWorker.recognize(canvas);
    const rawText = result.data.text;

    console.log('[Upload] Texto bruto extraído:', rawText);
    logExtractionContext(rawText);

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

function logExtractionContext(rawText) {
  const lines = String(rawText || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const sexoLines = lines.filter((line) => /\b(SEXO|SEX|GENERO|GENDER|MASCULINO|FEMININO)\b/i.test(line));
  const nacLines = lines.filter((line) => /\b(NACIONALIDADE|NATIONALITY|NATURALIDADE|BRASIL|BRASILEIR|BRAZILIAN|BRA)\b/i.test(line));

  console.log('[Upload][Debug] Linhas candidatas (sexo/genero):', sexoLines.length ? sexoLines : ['<nenhuma>']);
  console.log('[Upload][Debug] Linhas candidatas (nacionalidade):', nacLines.length ? nacLines : ['<nenhuma>']);
}

/**
 * Funções de Parsing Sincronizadas e Melhoradas
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

function parsePassengerData(text) {
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const nomeCompleto = extractNome(normalizedText);
  const nomeSeparado = separateNome(nomeCompleto);

  return {
    nomeCompleto: nomeSeparado.nomeCompleto,
    primeiroNome: nomeSeparado.primeiroNome,
    sobrenome: nomeSeparado.sobrenome,
    cpf: extractCPF(normalizedText),
    dataNascimento: extractDataNascimento(normalizedText),
    genero: extractGenero(normalizedText),
    nacionalidade: extractNacionalidade(normalizedText)
  };
}

function sanitizeNomeCandidate(text) {
  if (!text) return null;

  const raw = String(text).toUpperCase().trim();
  
  // Lista de palavras que indicam ruído ou cabeçalho institucional
  const noiseTokens = [
    'TOGO', 'TERT', 'ESTADO', 'SECRETARIA', 'SEGURANCA', 'PUBLICA', 'POLICIA', 'CIVIL',
    'DETRAN', 'BRASIL', 'REPUBLICA', 'GOVERNO', 'FEDERAL', 'MINISTERIO', 'IDENTIDADE', 
    'CARTEIRA', 'HABILITACAO', 'REGISTRO', 'GERAL', 'ORGAO', 'EMISSOR', 'VIA', 'VALIDO', 
    'TERRITORIO', 'NACIONAL', 'EMISSAO', 'DATA', 'VALIDADE', 'NASCIMENTO'
  ];

  let noiseScore = 0;
  noiseTokens.forEach(token => {
    if (new RegExp(`\\b${token}\\b`).test(raw)) noiseScore++;
  });

  // Se a linha tem muitas palavras de "documento", não é um nome
  if (noiseScore >= 2) return null;

  let cleanText = raw
    .replace(/^[:\s\-]+/, '') // Remove lixo do início da linha (muito comum em OCR)
    .replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Nomes raramente começam com palavras de governo
  if (/^(ESTADO|SECRETARIA|POLICIA|GOVERNO|FEDERAL|DEPARTAMENTO)\b/.test(cleanText)) return null;

  const parts = cleanText.split(' ').filter(p => p.length >= 2);
  const connectors = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
  const strongWords = parts.filter(p => !connectors.has(p));

  // Um nome válido tem pelo menos 2 palavras fortes e tamanho razoável
  if (strongWords.length < 2 || cleanText.length <= 5) return null;
  
  // Nomes em documentos raramente passam de 7 palavras
  if (parts.length > 7) return null;

  return cleanText;
}

function extractNome(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  const candidates = [];

  // Estratégia 1: Tenta encontrar pelo rótulo "NOME:"
  const anchorPattern = /(?:NOME|NAME|PASSAGEIRO|TITULAR)[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{3,60})(?=\s+(?:CPF|DATA|RG|DOC|VAL|$))/i;
  const anchorMatch = text.match(anchorPattern);
  const anchorCandidate = sanitizeNomeCandidate(anchorMatch?.[1]);
  if (anchorCandidate) return anchorCandidate;

  // Estratégia 2: Sistema de pontuação para todas as linhas
  for (const line of lines) {
    const candidate = sanitizeNomeCandidate(line);
    if (candidate) {
      let score = candidate.length;
      
      // Linhas que começam com ":" no OCR original costumam ser valores de campos
      if (line.startsWith(':')) score += 20;
      
      // Linhas com 3 ou mais palavras têm score maior (nomes completos)
      if (candidate.split(' ').length >= 3) score += 10;

      candidates.push({ name: candidate, score });
    }
  }

  if (candidates.length === 0) return null;
  
  // Ordena pelo melhor score e retorna o vencedor
  candidates.sort((a, b) => b.score - a.score);
  console.log('[Upload] Candidatos a nome avaliados:', candidates);
  return candidates[0].name;
}

function extractCPF(text) {
  // 1. Tenta CPF (11 dígitos)
  const cpfMatch = text.match(/\b(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?(\d{2})\b/);
  if (cpfMatch) return `${cpfMatch[1]}.${cpfMatch[2]}.${cpfMatch[3]}-${cpfMatch[4]}`;

  // 2. Tenta RG como fallback (ex: 17.698.131-7)
  const rgMatch = text.match(/\b(\d{1,2})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?([\dX])\b/i);
  if (rgMatch) return `${rgMatch[1]}.${rgMatch[2]}.${rgMatch[3]}-${rgMatch[4]}`;

  return null;
}

function extractDataNascimento(text) {
  const months = {
    'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
    'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
  };

  // DD/MM/AAAA
  const stdMatch = text.match(/\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/);
  if (stdMatch) return `${stdMatch[1]}/${stdMatch[2]}/${stdMatch[3]}`;

  // DD/MAR/AAAA
  const alphaMatch = text.match(/\b(\d{2})[\/\-\.](JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.](\d{4})\b/i);
  if (alphaMatch) {
    const day = alphaMatch[1];
    const month = months[alphaMatch[2].toUpperCase()];
    const year = alphaMatch[3];
    if (month) return `${day}/${month}/${year}`;
  }

  return null;
}

function extractGenero(text) {
  const textUpper = text.toUpperCase();
  if (/\b(MASCULINO|MASC|SEXO\s*M)\b/.test(textUpper)) return 'Masculino';
  if (/\b(FEMININO|FEM|SEXO\s*F)\b/.test(textUpper)) return 'Feminino';
  
  // Padrão passaporte M / M ou F / F
  const passMatch = textUpper.match(/\b(M|F)\s*\/\s*(?:M|F)\b/);
  if (passMatch) return passMatch[1] === 'M' ? 'Masculino' : 'Feminino';

  return '';
}

function extractNacionalidade(text) {
  const textUpper = text.toUpperCase();
  if (/\b(BRASIL|BRASILEIR|BRAZILIAN|BRA)\b/.test(textUpper)) return 'Brasil';
  return '';
}

function handleFile(file) {
  if (!isImageLikeFile(file)) return showStatus('Apenas imagens PNG, JPG, WEBP ou similares.', 'error');
  if (file.size > 5 * 1024 * 1024) return showStatus('Imagem muito grande. Limite: 5MB.', 'error');

  const stableFile = cloneFile(file);
  const passageiroIndex = passageiroAtual;
  console.log('[Upload] Arquivo recebido:', {
    name: stableFile.name,
    type: stableFile.type,
    size: stableFile.size,
    lastModified: stableFile.lastModified
  });

  revokePassengerImageUrl(passageiroIndex);

  const imageObjectUrl = URL.createObjectURL(stableFile);
  passageiros[passageiroIndex].imagemDataUrl = imageObjectUrl;

  if (passageiroIndex === passageiroAtual) {
    atualizarPreviewPassageiro(passageiroIndex);
  } else {
    atualizarAbas();
  }

  processarImagemComOCR(imageObjectUrl, passageiroIndex);
}

/**
 * Processa a imagem: OCR local + parsing + guarda no array
 */
async function processarImagemComOCR(imageDataUrl, passageiroIndex = passageiroAtual) {
  try {
    showSpinner(true);
    const parsedData = await runOCROnImage(imageDataUrl);
    showSpinner(false);
    
    // Simula o recebimento de uma mensagem OCR_RESULT
    chrome.runtime.onMessage.dispatchEvent = undefined; // Workaround: chamar diretamente
    
    // Guarda os dados no array na posição do passageiro atual
    // CORRIGIDO: preserva genero e nacionalidade que o usuário pode ter editado manualmente
    passageiros[passageiroIndex] = {
      nome: parsedData.nomeCompleto ?? '',
      firstName: parsedData.primeiroNome ?? '',
      lastName: parsedData.sobrenome ?? '',
      cpf: parsedData.cpf ?? '',
      dataNascimento: parsedData.dataNascimento ?? '',
      birthDate: parsedData.dataNascimento ?? '',
      genero: parsedData.genero || passageiros[passageiroIndex].genero || '',
      gender: parsedData.genero || passageiros[passageiroIndex].gender || passageiros[passageiroIndex].genero || '',
      nacionalidade: parsedData.nacionalidade || passageiros[passageiroIndex].nacionalidade || DEFAULT_NATIONALITY,
      nationality: parsedData.nacionalidade || passageiros[passageiroIndex].nationality || passageiros[passageiroIndex].nacionalidade || DEFAULT_NATIONALITY,
      email: passageiros[passageiroIndex].email || '',
      telefone: passageiros[passageiroIndex].telefone || '',
      imagemDataUrl: imageDataUrl || passageiros[passageiroIndex].imagemDataUrl || ''
    };
    
    // Mostra os dados no ecrã
    if (passageiroIndex === passageiroAtual) {
      renderizarPassageiro(passageiroIndex);
    } else {
      atualizarAbas();
    }
  } catch (err) {
    console.error('[Upload] Erro ao processar imagem:', err);
    showSpinner(false);
    showStatus(`Falha: ${err.message}`, 'error');
  }
}

// ─── Receber os dados do OCR ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'OCR_RESULT') {
    // Responder imediatamente se não é uma mensagem OCR
    sendResponse({ handled: false });
    return false;
  }
  
  showSpinner(false);
  
  if (!msg.data) {
    sendResponse({ ok: false });
    return showStatus('OCR sem dados. Tente outra imagem.', 'error');
  }

  // 3. Guardar os dados extraídos no Array, na posição do passageiro atual!
  const nomeCompleto = msg.data.nomeCompleto ?? '';
  const nomeParts = nomeCompleto.split(' ');
  const firstName = nomeParts[0] || '';
  const lastName = nomeParts.slice(1).join(' ') || '';
  
  passageiros[passageiroAtual] = {
    firstName: firstName,
    lastName: lastName,
    cpf: msg.data.cpf ?? '',
    birthDate: msg.data.dataNascimento ?? '',
    // Compatibilidade com código antigo
    nome: nomeCompleto,
    dataNascimento: msg.data.dataNascimento ?? '',
    // CORRIGIDO: preserva genero e nacionalidade que o usuário pode ter editado
    genero: msg.data.genero || passageiros[passageiroAtual].genero || '',
    gender: msg.data.genero || passageiros[passageiroAtual].gender || passageiros[passageiroAtual].genero || '',
    nacionalidade: msg.data.nacionalidade || passageiros[passageiroAtual].nacionalidade || DEFAULT_NATIONALITY,
    nationality: msg.data.nacionalidade || passageiros[passageiroAtual].nationality || passageiros[passageiroAtual].nacionalidade || DEFAULT_NATIONALITY,
    email: passageiros[passageiroAtual].email || '',
    telefone: passageiros[passageiroAtual].telefone || '',
    imagemDataUrl: passageiros[passageiroAtual].imagemDataUrl || ''
  };

  // 4. Mostrar os dados no ecrã
  renderizarPassageiro(passageiroAtual);
  
  // Responder ao offscreen/service-worker
  sendResponse({ ok: true });
  return false;
});

// Nova função que atualiza os inputs com base nos dados do Array
function renderizarPassageiro(index) {
  const dados = passageiros[index];
  
  fieldNome.value = dados.nome || '';
  fieldCpf.value  = dados.cpf  || '';
  fieldData.value = dados.dataNascimento || '';

  // CORRIGIDO: sincroniza os novos campos com o estado do passageiro
  if (fieldGenero)        fieldGenero.value        = dados.genero       || '';
  if (fieldNacionalidade) fieldNacionalidade.value = dados.nacionalidade || DEFAULT_NATIONALITY;
  if (fieldEmail)        fieldEmail.value         = dados.email || '';
  if (fieldTelefone)     fieldTelefone.value      = dados.telefone || '';

  atualizarPreviewPassageiro(index);
  
  // Atualizar seleção da aba
  atualizarAbas();
  
  // Se o passageiro já tiver nome ou CPF preenchido, mostramos mensagem de sucesso
  if (dados.nome !== '' || dados.cpf !== '') {
    showStatus(`Passageiro ${index + 1} pronto! Podes rever ou adicionar mais.`, 'success');
  } else {
    // Se estiver vazio (ex: quando trocamos para uma aba nova)
    hideStatus();
  }
}

function getIniciales(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'P';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0] || ''}${partes[1][0] || ''}`.toUpperCase();
}

function getNomeCurto(dados) {
  const nome = String(dados?.nome || '').trim();
  if (nome) {
    const partes = nome.split(/\s+/).filter(Boolean);
    if (partes.length <= 2) return nome;
    return `${partes[0]} ${partes[partes.length - 1]}`;
  }

  if (dados?.firstName || dados?.lastName) {
    const composed = `${dados.firstName || ''} ${dados.lastName || ''}`.trim();
    if (!composed) return '';
    const partes = composed.split(/\s+/).filter(Boolean);
    if (partes.length <= 2) return composed;
    return `${partes[0]} ${partes[partes.length - 1]}`;
  }

  return '';
}

function renderizarResumoPassageiros() {
  if (!passengerSummary) return;

  passengerSummary.innerHTML = '';

  const preenchidos = passageiros.filter((p) => p.nome || p.cpf || p.imagemDataUrl).length;
  if (passengerCounter) {
    passengerCounter.textContent = `${preenchidos} de 9 preenchidos`;
  }

  passageiros.forEach((dados, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'passenger-card';
    card.setAttribute('aria-pressed', String(index === passageiroAtual));

    if (index === passageiroAtual) card.classList.add('active');
    if (dados.nome || dados.cpf || dados.imagemDataUrl) card.classList.add('filled');
    else card.classList.add('empty');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    if (dados.imagemDataUrl) {
      thumb.style.backgroundImage = `url(${dados.imagemDataUrl})`;
      thumb.textContent = '';
    } else {
      thumb.textContent = getIniciales(dados.nome || dados.firstName || `P${index + 1}`);
    }

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `P${index + 1}`;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = getNomeCurto(dados) || 'Sem dados';

    const status = document.createElement('div');
    status.className = 'card-status';
    status.textContent = dados.imagemDataUrl || dados.nome || dados.cpf ? 'Com dados' : 'Vazio';

    card.appendChild(thumb);
    card.appendChild(title);
    card.appendChild(name);
    card.appendChild(status);

    card.addEventListener('click', () => {
      sincronizarCamposDoPassageiroAtual();
      passageiroAtual = index;
      renderizarPassageiro(index);
    });

    passengerSummary.appendChild(card);
  });
}

function atualizarPreviewPassageiro(index) {
  const dados = passageiros[index];

  if (dados?.imagemDataUrl) {
    previewImg.src = dados.imagemDataUrl;
    previewBox.style.display = 'block';
    dropZone.style.display = 'none';
    return;
  }

  previewImg.removeAttribute('src');
  previewBox.style.display = 'none';
  dropZone.style.display = 'block';
}

// ─── Limpar passageiro atual ──────────────────────────────────────────────────

function limparPassageiroAtual() {
  revokePassengerImageUrl(passageiroAtual);

  passageiros[passageiroAtual] = {
    nome: '',
    firstName: '',
    lastName: '',
    cpf: '',
    dataNascimento: '',
    birthDate: '',
    genero: '',
    gender: '',
    nacionalidade: DEFAULT_NATIONALITY,
    nationality: DEFAULT_NATIONALITY,
    email: '',
    telefone: '',
    imagemDataUrl: ''
  };

  // Limpa os campos visuais
  fieldNome.value = '';
  fieldCpf.value  = '';
  fieldData.value = '';
  if (fieldGenero)        fieldGenero.value        = '';
  if (fieldNacionalidade) fieldNacionalidade.value = DEFAULT_NATIONALITY;
  if (fieldEmail)         fieldEmail.value         = '';
  if (fieldTelefone)      fieldTelefone.value      = '';

  // Volta a mostrar a zona de upload
  previewBox.style.display = 'none';
  previewImg.removeAttribute('src');
  dropZone.style.display   = 'block';
  fileInput.value          = '';

  atualizarAbas();
  renderizarResumoPassageiros();
  hideStatus();
}

// Finalizar e salvar os dados dos 9 passageiros
function finalizarEIrAoFormulario() {
  // Sincroniza os campos visíveis da tela para o passageiro atual antes do payload.
  sincronizarCamposDoPassageiroAtual();

  // Filtrar apenas os passageiros com dados e normalizar formato
  const passageirosPreenchidos = passageiros
    .filter((p) => {
      const nome = String(p.nome || p.nomeCompleto || '').trim();
      const primeiroNome = String(p.firstName || p.primeiroNome || '').trim();
      const sobrenome = String(p.lastName || p.sobrenome || '').trim();
      const cpf = String(p.cpf || '').trim();
      const dataNascimento = String(p.dataNascimento || p.birthDate || '').trim();

      return Boolean(nome || primeiroNome || sobrenome || cpf || dataNascimento);
    })
    .map((p) => {
      const nomeCompleto = (
        p.nome ||
        p.nomeCompleto ||
        `${p.firstName || p.primeiroNome || ''} ${p.lastName || p.sobrenome || ''}`.trim()
      ).trim();
      const nomeParts = nomeCompleto.split(/\s+/).filter(Boolean);
      const firstName = p.firstName || p.primeiroNome || nomeParts[0] || '';
      const lastName  = p.lastName  || p.sobrenome || nomeParts.slice(1).join(' ') || '';

      // BUG CORRIGIDO: o .map() itera todos os passageiros, mas fieldGenero/fieldNacionalidade
      // só refletem o passageiro ATUALMENTE VISÍVEL na tela. Usar o valor do DOM para todos
      // fazia o P1 herdar o gênero do último passageiro visualizado, e no fluxo do popup
      // (onde o usuário não toca nos selects) chegava sempre vazio para o P1.
      // Solução: sempre ler do objeto p[]. Os listeners de 'change' já sincronizam
      // o array em tempo real quando o usuário edita — aqui só colhemos o que já está salvo.
      const generoAtual        = p.genero        || p.gender       || '';
      const nacionalidadeAtual = p.nacionalidade || p.nationality  || DEFAULT_NATIONALITY;
      const emailAtual         = p.email         || '';
      const telefoneAtual      = p.telefone      || '';

      const emailFinal = providerConfig.showContactFields ? emailAtual : '';
      const telefoneFinal = providerConfig.showContactFields ? telefoneAtual : '';

      return {
        nome: nomeCompleto,
        firstName,
        lastName,
        cpf: p.cpf || '',
        dataNascimento: p.dataNascimento || p.birthDate || '',
        birthDate:      p.birthDate      || p.dataNascimento || '',
        genero:         generoAtual,
        gender:         generoAtual,       // alias para compatibilidade com azul.js
        nacionalidade:  nacionalidadeAtual,
        nationality:    nacionalidadeAtual, // alias para compatibilidade com azul.js
        email:          emailFinal,
        telefone:       telefoneFinal
      };
    });
  
  if (passageirosPreenchidos.length === 0) {
    showStatus('⚠ Adicione pelo menos um passageiro antes de finalizar.', 'error');
    return;
  }

  // Salvar os dados no storage
  chrome.storage.local.set({ 
    passageirosOCR: passageirosPreenchidos,
    ocrCompleted: true 
  }, () => {
    console.log('[Upload] Dados salvos no storage:', passageirosPreenchidos);
    showStatus(`✓ ${passageirosPreenchidos.length} passageiro(s) salvo(s)! Enviando para a aba...`, 'success');

    const concluirFluxo = () => {
      chrome.tabs.getCurrent((currentTab) => {
        if (currentTab?.id) {
          chrome.tabs.remove(currentTab.id);
        } else {
          window.close();
        }
      });
    };

    const entregarDadosNaAba = () => {
      chrome.tabs.sendMessage(
        targetTabId,
        { type: 'OCR_AUTOFILL', data: passageirosPreenchidos },
        (response) => {
          const lastError = chrome.runtime.lastError;

          if (!lastError) {
            chrome.tabs.update(targetTabId, { active: true });
            concluirFluxo();
            return;
          }

          console.warn('[Upload] sendMessage falhou, tentando executeScript:', lastError?.message || 'sem resposta');

          chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: (dadosPassageiros) => {
              window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: dadosPassageiros }));
            },
            args: [passageirosPreenchidos]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Upload] Falha ao enviar os dados para a aba alvo:', chrome.runtime.lastError.message);
              showStatus('Falha ao enviar para a aba do site. Os dados ficaram salvos localmente.', 'error');
              return;
            }

            chrome.tabs.update(targetTabId, { active: true });
            concluirFluxo();
          });
        }
      );
    };
    
    // Fechar/voltar após 1.2s
    setTimeout(() => {
      // Estratégia 1: Injetar diretamente na aba de origem (site real)
      if (Number.isInteger(targetTabId)) {
        entregarDadosNaAba();
        return;
      }

      // Estratégia 2: fallback legado (somente quando não há aba alvo)
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '../test-form.html';
      }
    }, 1200);
  });
}

function showSpinner(v) { spinner.style.display = v ? 'flex' : 'none'; }

function showStatus(msg, type) {
  // Status da secção de upload
  const uploadStatus = document.getElementById('upload-status');
  if (uploadStatus) {
    uploadStatus.textContent = msg;
    uploadStatus.className = type;
    uploadStatus.style.display = 'block';
  }
  
  // Status da secção de resultado
  const resultStatus = document.getElementById('result-status');
  if (resultStatus) {
    resultStatus.textContent = msg;
    resultStatus.className = type;
    resultStatus.style.display = 'block';
  }
}