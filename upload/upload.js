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
    showContactFields: false
  },
  latam: {
    title: 'OCR Passagens — LATAM',
    heading: '✈ OCR Passagens LATAM',
    generoHint: '(opcional — preenche o select da LATAM)',
    nationality: 'Brasil',
    showContactFields: true
  },
  smiles: {
    title: 'OCR Passagens — Smiles',
    heading: '✈ OCR Passagens Smiles',
    generoHint: '(opcional — preenche o select da Smiles)',
    nationality: 'Brasil',
    showContactFields: true
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
  const uploadStatus = document.querySelector('#upload-section #status');
  if (uploadStatus) uploadStatus.style.display = 'none';
  
  const resultStatus = document.querySelector('#result-section #status');
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

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      console.log('[Upload] Arquivo arrastado:', file.name);
      handleFile(file);
    }
  });

  btnChange.addEventListener('click', () => {
    previewBox.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    hideStatus();
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

  const passageiroIndex = passageiroAtual;

  const reader = new FileReader();
  reader.onload  = (e) => {
    const imageDataUrl = e.target.result;

    passageiros[passageiroIndex].imagemDataUrl = imageDataUrl;
    if (passageiroIndex === passageiroAtual) {
      atualizarPreviewPassageiro(passageiroIndex);
    } else {
      atualizarAbas();
    }

    processarImagemComOCR(imageDataUrl, passageiroIndex);
  };
  reader.onerror = ()  => { showSpinner(false); showStatus('Erro ao ler a imagem.', 'error'); };
  reader.readAsDataURL(file);
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
      genero: passageiros[passageiroIndex].genero || '',
      nacionalidade: passageiros[passageiroIndex].nacionalidade || DEFAULT_NATIONALITY,
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
    genero: passageiros[passageiroAtual].genero || '',
    nacionalidade: passageiros[passageiroAtual].nacionalidade || DEFAULT_NATIONALITY,
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
  // Filtrar apenas os passageiros com dados e normalizar formato
  const passageirosPreenchidos = passageiros
    .filter((p) => p.nome !== '' || p.cpf !== '' || p.firstName || p.lastName)
    .map((p) => {
      const nomeCompleto = (p.nome || `${p.firstName || ''} ${p.lastName || ''}`.trim()).trim();
      const nomeParts = nomeCompleto.split(/\s+/).filter(Boolean);
      const firstName = p.firstName || nomeParts[0] || '';
      const lastName  = p.lastName  || nomeParts.slice(1).join(' ') || '';

      // CORRIGIDO: lê genero e nacionalidade dos selects antes de salvar
      const generoAtual       = fieldGenero       ? fieldGenero.value        : (p.genero       || '');
      const nacionalidadeAtual = fieldNacionalidade ? fieldNacionalidade.value : (p.nacionalidade || DEFAULT_NATIONALITY);
      const emailAtual        = fieldEmail        ? fieldEmail.value.trim()    : (p.email      || '');
      const telefoneAtual     = fieldTelefone     ? fieldTelefone.value.trim() : (p.telefone   || '');

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
    
    // Fechar/voltar após 1.2s
    setTimeout(() => {
      // Estratégia 1: Injetar diretamente na aba de origem (site real)
      if (Number.isInteger(targetTabId)) {
        chrome.scripting.executeScript({
          target: { tabId: targetTabId, allFrames: true },
          func: (dadosPassageiros) => {
            window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: dadosPassageiros }));
          },
          args: [passageirosPreenchidos]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Upload] Falha ao injetar na aba alvo:', chrome.runtime.lastError.message);
            showStatus('Falha ao enviar para a aba do site. Tente novamente.', 'error');
            return;
          }

          chrome.tabs.update(targetTabId, { active: true });
          chrome.tabs.getCurrent((currentTab) => {
            if (currentTab?.id) {
              chrome.tabs.remove(currentTab.id);
            } else {
              window.close();
            }
          });
        });
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
  const uploadStatus = document.querySelector('#upload-section #status');
  if (uploadStatus) {
    uploadStatus.textContent = msg;
    uploadStatus.className = type;
    uploadStatus.style.display = 'block';
  }
  
  // Status da secção de resultado
  const resultStatus = document.querySelector('#result-section #status');
  if (resultStatus) {
    resultStatus.textContent = msg;
    resultStatus.className = type;
    resultStatus.style.display = 'block';
  }
}