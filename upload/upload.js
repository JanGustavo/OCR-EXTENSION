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

    const ocrSource = isBlobUrl(imageDataUrl)
      ? await imageUrlToCanvas(imageDataUrl)
      : imageDataUrl;

    // Recognize: executa OCR na imagem
    const result = await ocrWorker.recognize(ocrSource);
    const rawText = result.data.text;

    console.log('[Upload] Texto bruto extraído:', rawText.substring(0, 200) + '...');
    logExtractionContext(rawText);

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
 * Copia as funções de parsing do offscreen/offscreen.js
 */
function parsePassengerData(text) {
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas diacríticas
    .toUpperCase();

  const nomeCompleto = extractNome(normalizedText);
  const nomeSeparado = separateNome(nomeCompleto);
  const genero = extractGenero(normalizedText);
  const nacionalidade = extractNacionalidade(normalizedText);

  console.log('[Upload][Parse] genero extraido:', genero || '<vazio>');
  console.log('[Upload][Parse] nacionalidade extraida:', nacionalidade || '<vazio>');

  return {
    nomeCompleto: nomeSeparado.nomeCompleto,
    primeiroNome: nomeSeparado.primeiroNome,
    sobrenome: nomeSeparado.sobrenome,
    cpf: extractCPF(normalizedText),
    dataNascimento: extractDataNascimento(normalizedText),
    genero,
    nacionalidade
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

  const raw = String(candidate).toUpperCase().replace(/\s+/g, ' ').trim();
  const institucionalTokens = [
    'REPUBLICA', 'FEDERATIVA', 'BRASIL', 'GOVERNO', 'FEDERAL', 'ESTADO', 'SECRETARIA',
    'SEGURANCA', 'DEFESA', 'SOCIAL', 'POLICIA', 'CARTEIRA', 'IDENTIDADE', 'REGISTRO',
    'GERAL', 'DEPARTAMENTO', 'TRANSITO', 'SSP', 'DETRAN', 'MINISTERIO', 'ORGAO', 'EMISSOR'
  ];

  const institutionalScore = institucionalTokens.reduce((acc, token) => (
    acc + (new RegExp(`\\b${token}\\b`).test(raw) ? 1 : 0)
  ), 0);

  // Evita capturar cabeçalhos como "GOVERNO FEDERAL ESTADO DA PARAIBA"
  if (institutionalScore >= 2) return null;

  let cleaned = raw
    .replace(/\b(NOME|NAME|PASSAGEIRO|TITULAR|COMPLETO|NOME\s+SOCIAL|SOCIAL\s+NAME)\b/g, ' ')
    .replace(/\b(FOTO|PHOTO|FOTOGRAFIA|ASSINATURA)\b.*$/g, '')
    .replace(/\b(CPF|DATA|NASC(?:IMENTO)?|NATURALIDADE|RG|DOC(?:UMENTO)?|VALIDADE|EMISSAO)\b.*$/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove sufixos curtos gerados por OCR (ex: "... MENDONCA LS A").
  const removableTailTokens = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']);
  const connectorTokens = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);

  let wordsForTailCleanup = cleaned.split(' ').filter(Boolean);
  while (wordsForTailCleanup.length >= 4) {
    const tail = wordsForTailCleanup[wordsForTailCleanup.length - 1];

    const isSingleLetterNoise = removableTailTokens.has(tail);
    const isTwoLetterNoise = /^[A-Z]{2}$/.test(tail) && !connectorTokens.has(tail);

    if (!isSingleLetterNoise && !isTwoLetterNoise) break;
    wordsForTailCleanup.pop();
  }
  cleaned = wordsForTailCleanup.join(' ').trim();

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;

  // Nome precisa ter pelo menos 2 palavras "fortes" (não conectores)
  const connectors = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
  const strongWords = words.filter((w) => !connectors.has(w) && w.length >= 2);
  if (strongWords.length < 2) return null;

  return cleaned;
}

function extractNome(text) {
  const patterns = [
    /(?:NOME(?:\s+COMPLETO)?|NAME|PASSAGEIRO|TITULAR)[:\s]*([A-Z][A-Z\s]{3,90}?)(?=\s+(?:CPF|DATA|NASC|NATURALIDADE|RG|DOC|VALIDADE|EMISSAO)|$)/
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
    if (/\b(?:NOME|NAME)\b/.test(lines[i])) {
      // Prioriza linhas próximas ao marcador "Nome / Name"
      const nearbyCandidates = [
        lines[i].replace(/.*\b(?:NOME|NAME)\b[:\s]*/g, ' ').trim(),
        lines[i + 1] || '',
        lines[i + 2] || ''
      ];

      for (const item of nearbyCandidates) {
        const candidate = sanitizeNomeCandidate(item);
        if (candidate) return candidate;
      }
    }
  }

  // Fallback: aceita a primeira linha plausível que não seja institucional
  for (const line of lines) {
    const candidate = sanitizeNomeCandidate(line);
    if (candidate) return candidate;
  }

  return null;
}

function extractCPF(text) {
  const match = text.match(/\b(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?(\d{2})\b/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
}

function extractDataNascimento(text) {
  const normalized = String(text || '').toUpperCase();
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const birthCtx = /\b(NASC(?:IMENTO)?|DATA\s+DE\s+NASCIMENTO|DT\.?\s*NASC|DOB|BORN)\b/;
  const issueCtx = /\b(EXPEDICAO|DATA\s+DE\s+EXPEDICAO|EMISSAO|DATA\s+DE\s+EMISSAO|VALIDADE|VENCIMENTO|ISSUE)\b/;
  const dateRegex = /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/g;

  const normalizeDate = (d, m, y) => `${d}/${m}/${y}`;
  const getDateFromLine = (line) => {
    if (!line) return null;
    const match = line.match(/\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/);
    if (!match) return null;
    return normalizeDate(match[1], match[2], match[3]);
  };

  // 1) Prioridade máxima: data perto do rótulo de nascimento
  for (let i = 0; i < lines.length; i++) {
    if (!birthCtx.test(lines[i])) continue;

    const nearby = [lines[i], lines[i + 1] || '', lines[i - 1] || ''];
    for (const line of nearby) {
      const date = getDateFromLine(line);
      if (!date) continue;
      if (issueCtx.test(line) && !birthCtx.test(line)) continue;
      return date;
    }
  }

  // 2) Fallback com pontuação por contexto
  const candidates = [];
  const currentYear = new Date().getFullYear();

  lines.forEach((line, index) => {
    const matches = Array.from(line.matchAll(dateRegex));
    matches.forEach((m) => {
      const dd = m[1];
      const mm = m[2];
      const yyyy = m[3];
      const year = Number.parseInt(yyyy, 10);
      let score = 0;

      if (birthCtx.test(line)) score += 5;
      if (issueCtx.test(line)) score -= 6;

      const prev = lines[index - 1] || '';
      const next = lines[index + 1] || '';
      if (birthCtx.test(prev) || birthCtx.test(next)) score += 3;
      if (issueCtx.test(prev) || issueCtx.test(next)) score -= 4;

      if (year > currentYear) score -= 2;

      candidates.push({
        date: normalizeDate(dd, mm, yyyy),
        score,
        year
      });
    });
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.year - b.year; // em empate, tende a escolher a data mais antiga (mais provável para nascimento)
  });

  return candidates[0].date;
}

function extractGenero(text) {
  const textUpper = String(text || '').toUpperCase();
  console.log('[Upload][Genero] Iniciando extração...');

  const normalizeToken = (value) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  const mapGenero = (value) => {
    const token = normalizeToken(value);
    if (!token) return '';
    if (token === 'M' || token.startsWith('MASC')) return 'Masculino';
    if (token === 'F' || token.startsWith('FEM')) return 'Feminino';
    return '';
  };

  const extractFromChunk = (chunk) => {
    if (!chunk) return '';
    const match = chunk.match(/\b(MASC(?:ULINO)?|FEM(?:ININO)?|M\b|F\b)\b/);
    return mapGenero(match?.[1] || '');
  };

  const matchDireto = textUpper.match(/\b(?:SEXO|SEX|GENERO|GENDER)\b[\s:.-]{0,8}(MASC(?:ULINO)?|FEM(?:ININO)?|M\b|F\b)/);
  if (matchDireto) {
    console.log('[Upload][Genero] Match direto:', matchDireto[0]);
    const mapped = mapGenero(matchDireto[1]);
    if (mapped) return mapped;
  }
  console.log('[Upload][Genero] Match direto: <nao encontrado>');

  const matchPassaporte = textUpper.match(/\b(M|F)\s*\/\s*(?:M|F)\b/);
  if (matchPassaporte) {
    console.log('[Upload][Genero] Match passaporte:', matchPassaporte[0]);
    return matchPassaporte[1] === 'M' ? 'Masculino' : 'Feminino';
  }
  console.log('[Upload][Genero] Match passaporte: <nao encontrado>');

  const linhas = textUpper
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const labelRegex = /\b(SEXO|SEX|GENERO|GENDER)\b/;
  const candidatesByLabel = [];

  for (let i = 0; i < linhas.length; i++) {
    if (!labelRegex.test(linhas[i])) continue;

    const currentTail = linhas[i].replace(/^.*\b(?:SEXO|SEX|GENERO|GENDER)\b[\s:.-]*/g, ' ').trim();
    const chunks = [currentTail, linhas[i + 1] || '', linhas[i + 2] || ''];

    candidatesByLabel.push({
      index: i,
      line: linhas[i],
      analyzed: chunks
    });

    for (const chunk of chunks) {
      const mapped = extractFromChunk(chunk);
      if (mapped) {
        console.log('[Upload][Genero] Match por contexto de label:', { linhaLabel: linhas[i], trecho: chunk, genero: mapped });
        return mapped;
      }
    }
  }

  console.log('[Upload][Genero] Linhas com label (SEXO/GENERO):', candidatesByLabel.length ? candidatesByLabel : ['<nenhuma>']);

  // Fallback: linha curta isolada
  const shortLineCandidates = linhas.filter((linha) => {
    const cleaned = linha.replace(/[^A-Z]/g, '');
    return ['M', 'F', 'MASCULINO', 'FEMININO', 'MASC', 'FEM'].includes(cleaned);
  });
  console.log('[Upload][Genero] Linhas curtas candidatas:', shortLineCandidates.length ? shortLineCandidates : ['<nenhuma>']);

  for (const linha of shortLineCandidates) {
    const mapped = mapGenero(linha);
    if (mapped) return mapped;
  }

  console.log('[Upload][Genero] Resultado: <vazio>');
  return '';
}

function extractNacionalidade(text) {
  const textUpper = String(text || '').toUpperCase();
  console.log('[Upload][Nacionalidade] Iniciando extração...');

  const matchDireto = textUpper.match(/\b(?:NACIONALIDADE|NATIONALITY|NACIONALITY|NATURALIDADE)[\s:.-]*([A-Z]{3,24})\b/);
  if (matchDireto) {
    console.log('[Upload][Nacionalidade] Match direto:', matchDireto[0]);
    const nac = matchDireto[1];
    if (nac.includes('BRASIL') || nac === 'BRA' || nac.startsWith('BRASILEIR')) return 'Brasil';
    return nac.charAt(0) + nac.slice(1).toLowerCase();
  }
  console.log('[Upload][Nacionalidade] Match direto: <nao encontrado>');

  if (/\b(?:BRASILEIRA|BRASILEIRO|BRAZILIAN|BRASIL)\b/.test(textUpper)) {
    console.log('[Upload][Nacionalidade] Match por palavra-chave Brasil');
    return 'Brasil';
  }

  console.log('[Upload][Nacionalidade] Resultado: <vazio>');
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