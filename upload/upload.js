// Importa Tesseract.js como módulo ESM
import * as TesseractModule from '../assets/tesseract/tesseract.esm.min.js';

// ─── Estado da Aplicação (Memória) ────────────────────────────────────────────

// 1. Criamos um Array com 9 posições (índices de 0 a 8).
// Cada posição começa com um objeto vazio.
let passageiros = Array.from({ length: 9 }, () => ({
  nome: '',
  cpf: '',
  dataNascimento: ''
}));

// 2. Variável que controla qual a aba/slot que o utilizador está a ver agora.
// Começa no 0 (que corresponde ao Passageiro 1).
let passageiroAtual = 0;

// ──────────────────────────────────────────────────────────────────────────────




const Tesseract = TesseractModule.Tesseract || TesseractModule.default || TesseractModule;

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const previewBox = document.getElementById('preview-box');
const previewImg = document.getElementById('preview-img');
const spinner    = document.getElementById('spinner');
const btnChange  = document.getElementById('btn-change');

// Novos elementos
const uploadSection  = document.getElementById('upload-section');
const resultSection  = document.getElementById('result-section');
const passengerTabs  = document.getElementById('passenger-tabs');
const fieldNome      = document.getElementById('field-nome');
const fieldCpf       = document.getElementById('field-cpf');
const fieldData      = document.getElementById('field-data');
const btnUploadMore  = document.getElementById('btn-upload-more');
const btnBack        = document.getElementById('btn-back');
const btnFinish      = document.getElementById('btn-finish');

// Debug: verificar se elementos foram encontrados
console.log('[Upload] dropZone:', dropZone);
console.log('[Upload] fileInput:', fileInput);
console.log('[Upload] Elements loaded successfully');

let ocrWorker = null; // Tesseract worker instance

// Criar as abas dos passageiros
function criarAbas() {
  passengerTabs.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const aba = document.createElement('button');
    aba.textContent = `P${i + 1}`;
    aba.className = 'passenger-tab';
    aba.id = `aba-${i}`;
    aba.type = 'button';
    aba.onclick = () => {
      passageiroAtual = i;
      renderizarPassageiro(i);
    };
    passengerTabs.appendChild(aba);
  }
  atualizarAbas();
}

function atualizarAbas() {
  for (let i = 0; i < 9; i++) {
    const aba = document.getElementById(`aba-${i}`);
    const temDados = passageiros[i].nome !== '' || passageiros[i].cpf !== '';

    // Remove classes anteriores
    aba.classList.remove('active', 'filled');

    // Adiciona classe 'active' se for o passageiro atual
    if (i === passageiroAtual) {
      aba.classList.add('active');
    }

    // Adiciona classe 'filled' se o passageiro tiver dados
    if (temDados) {
      aba.classList.add('filled');
    }
  }
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('hidden'));
  // Não esconde nada — deixa ambas as secções visíveis
}

function hideStatus() {
  const uploadStatus = document.querySelector('#upload-section #status');
  if (uploadStatus) uploadStatus.style.display = 'none';
  
  const resultStatus = document.querySelector('#result-section #status');
  if (resultStatus) resultStatus.style.display = 'none';
}

// ─── Setup dos Event Listeners ───
function setupEventListeners() {
  if (!dropZone) {
    console.error('[Upload] dropZone não encontrado!');
    return;
  }

  dropZone.addEventListener('click', () => {
    console.log('[Upload] Drop-zone clicado');
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

  btnBack.addEventListener('click', () => {
    previewBox.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    hideStatus();
  });

  btnUploadMore.addEventListener('click', () => {
    previewBox.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    hideStatus();
  });

  btnFinish.addEventListener('click', () => {
    finalizarEIrAoFormulario();
  });

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
 * Processa a imagem: OCR local + parsing + guarda no array
 */
async function processarImagemComOCR(imageDataUrl) {
  try {
    showSpinner(true);
    const parsedData = await runOCROnImage(imageDataUrl);
    showSpinner(false);
    
    // Simula o recebimento de uma mensagem OCR_RESULT
    chrome.runtime.onMessage.dispatchEvent = undefined; // Workaround: chamar diretamente
    
    // Guarda os dados no array na posição do passageiro atual
    passageiros[passageiroAtual] = {
      nome: parsedData.nomeCompleto ?? '',
      cpf: parsedData.cpf ?? '',
      dataNascimento: parsedData.dataNascimento ?? ''
    };
    
    // Mostra os dados no ecrã
    renderizarPassageiro(passageiroAtual);
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
    dataNascimento: msg.data.dataNascimento ?? ''
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
  
  fieldNome.value = dados.nome;
  fieldCpf.value  = dados.cpf;
  fieldData.value = dados.dataNascimento;
  
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

// Finalizar e salvar os dados dos 9 passageiros
function finalizarEIrAoFormulario() {
  // Filtrar apenas os passageiros com dados
  const passageirosPreenchidos = passageiros.filter(p => p.nome !== '' || p.cpf !== '');
  
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
    showStatus(`✓ ${passageirosPreenchidos.length} passageiro(s) salvo(s)! Fechando...`, 'success');
    
    // Fechar/voltar após 1.5s
    setTimeout(() => {
      // Estratégia 1: Se foi aberto como popup, fecha a popup
      if (window.opener) {
        window.opener.postMessage({ type: 'OCR_COMPLETED', data: passageirosPreenchidos }, '*');
        window.close();
      } 
      // Estratégia 2: Tenta voltar ao histórico (volta à aba anterior)
      else if (window.history.length > 1) {
        // Se há histórico, voltar
        window.history.back();
      }
      // Estratégia 3: Se não há histórico, redirecionar para test-form.html
      else {
        window.location.href = '../test-form.html';
      }
    }, 1500);
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
