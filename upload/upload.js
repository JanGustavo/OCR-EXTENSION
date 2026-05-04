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

let ocrWorker = null;

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

async function runOCROnImage(imageDataUrl) {
  await initOCRWorker();
  showStatus('Analisando documento...', 'success');

  const img = await loadImageFromUrl(imageDataUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.naturalWidth * 2;
  canvas.height = img.naturalHeight * 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Pré-processamento Base Original
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const factor = (259 * (80 + 255)) / (255 * (259 - 80));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
    data[i+1] = Math.max(0, Math.min(255, factor * (data[i+1] - 128) + 128));
    data[i+2] = Math.max(0, Math.min(255, factor * (data[i+2] - 128) + 128));
  }
  ctx.putImageData(imageData, 0, 0);

  await ocrWorker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: ÁÉÍÓÚÂÊÔÃÕÇ',
  });

  const result = await ocrWorker.recognize(canvas);
  console.log('[Upload] Texto Bruto Capturado:\n', result.data.text);

  const parsed = parsePassengerData(result.data.text);
  console.log('[Upload] Dados Extraídos:');
  console.table(parsed);

  const el = document.getElementById('upload-status');
  if (el) el.style.display = 'none';

  return parsed;}

// ─── Extração de Dados ───

function parsePassengerData(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const nomeCompleto = extractNome(normalized);
  const nomeSeparado = separateNome(nomeCompleto);
  
  return {
    nomeCompleto: nomeSeparado.nomeCompleto,
    primeiroNome: nomeSeparado.primeiroNome,
    sobrenome: nomeSeparado.sobrenome,
    cpf: extractCPF(normalized),
    dataNascimento: extractDataNascimento(normalized),
    genero: extractGenero(normalized),
    nacionalidade: 'Brasil'
  };
}

function sanitizeNomeCandidate(text) {
  if (!text) return null;
  // Pré-conversão de números comuns que são OCR de letras no meio de nomes (0 -> O, 1 -> I, 5 -> S)
  let raw = String(text).toUpperCase().trim().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');
  
  const noise = ['ESTADO', 'SECRETARIA', 'SEGURANCA', 'PUBLICA', 'POLICIA', 'CIVIL', 'DETRAN', 'BRASIL', 'REPUBLICA', 'GOVERNO', 'FEDERAL', 'MINISTERIO', 'IDENTIDADE', 'CARTEIRA', 'HABILITACAO', 'REGISTRO', 'GERAL', 'ORGAO', 'EMISSOR', 'VIA', 'VALIDO', 'TERRITORIO', 'NACIONAL', 'EMISSAO', 'DATA', 'VALIDADE', 'NASCIMENTO', 'FILIACAO', 'PAI', 'MAE', 'TOGO', 'TERT', 'CTN', 'AMAZONAS', 'SOBRENOME', 'CATEGORIA', 'CNH', 'ACC', 'PERMISSAO', 'DOC', 'DRIVER', 'LICENSE', 'PERMISO', 'CONDUCCION', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  if (noise.some(t => new RegExp(`\\b${t}\\b`).test(raw))) return null;
  let clean = raw.replace(/[0-9]/g, '').replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let parts = clean.split(' ').filter(p => p.length >= 2);
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
  const final = parts.join(' ');
  return (parts.length >= 2 && final.length > 5) ? final : null;
}

function extractNome(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  // Prioridade 1: Linha imediatamente após o rótulo "NOME"
  for (let i = 0; i < lines.length; i++) {
    if (/\b(NOME|SOBRENOME|NAME)\b/i.test(lines[i])) {
      const cand = sanitizeNomeCandidate(lines[i + 1]);
      if (cand) return cand;
    }
  }
  // Prioridade 2: Qualquer linha que pareça um nome completo
  for (const line of lines) {
    const cand = sanitizeNomeCandidate(line);
    if (cand && cand.split(' ').length >= 3) return cand;
  }
  return null;
}

function extractCPF(text) {
  const norm = (s) => s.replace(/S/g, '5').replace(/[OB]/g, '0').replace(/[IL]/g, '1').replace(/[^\d]/g, '');
  
  // 1. Tentar achar com rótulo explícito "CPF"
  const cpfLabelMatch = text.match(/(?:CPF|C\.P\.F)[^\d]*([\dSOIBL\.\-\s]{11,18})/i);
  if (cpfLabelMatch) {
    const clean = norm(cpfLabelMatch[1]);
    if (clean.length >= 11) {
      const c = clean.slice(0, 11);
      return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9,11)}`;
    }
  }

  // 2. Busca fallback sem rótulo (só extrai se for exatamente 11 dígitos, descartando RGs de 7-9 dígitos)
  const spacedMatch = text.match(/(?:[\dSOIBL][\s\.\-]*){11,14}/g);
  if (spacedMatch) {
    for (const m of spacedMatch) {
      const clean = norm(m);
      if (clean.length === 11) {
        return `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9,11)}`;
      }
    }
  }
  return null;
}

function extractDataNascimento(text) {
  const months = { 'JAN':'01','FEV':'02','MAR':'03','ABR':'04','RBR':'04','MAI':'05','JUN':'06','JUL':'07','AGO':'08','SET':'09','OUT':'10','NOV':'11','DEZ':'12' };
  const norm = (s) => s.replace(/S/g, '5').replace(/[OB]/g, '0').replace(/[IL]/g, '1');
  const std = text.match(/([\dSOIBL]{2})[\/\-\.]([\dSOIBL]{2})[\/\-\.]([\dSOIBL]{4})/i);
  if (std) return `${norm(std[1])}/${norm(std[2])}/${norm(std[3])}`;
  const alpha = text.match(/([\dSOIBL]{2})[\/\-\.\s](JAN|FEV|MAR|ABR|RBR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]([\dSOIBL]{4})/i);
  if (alpha) return `${norm(alpha[1])}/${months[alpha[2].toUpperCase()]}/${norm(alpha[3])}`;

  // Tentar encontrar DD/MM/19X ou DD/MM/20X (mesmo incompleto)
  const partial = text.match(/([\dSOIBL]{2})[\/]([\dSOIBL]{2})[\/](19[\dSOIBL]{1,2}|20[\dSOIBL]{1,2})/i);
  if (partial) {
    let year = norm(partial[3]);
    if (year.length === 3) year += '0'; // ex: 202 -> 2020 ou 200 -> 2000
    return `${norm(partial[1])}/${norm(partial[2])}/${year}`;
  }

  return null;
}

function separateNome(n) {
  if (!n) return { primeiroNome: '', sobrenome: '', nomeCompleto: '' };
  const p = n.split(' ');
  return { primeiroNome: p.slice(0, -1).join(' '), sobrenome: p[p.length-1], nomeCompleto: n };
}

function extractGenero(t) { return /\b(MASC|M\b|SEXO\s*M)\b/i.test(t) ? 'Masculino' : /\b(FEM|F\b|SEXO\s*F)\b/i.test(t) ? 'Feminino' : ''; }

// ─── UI e Eventos ───

function setupEventListeners() {
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  document.addEventListener('paste', (e) => { const i = Array.from(e.clipboardData.items).find(x => x.kind === 'file'); if (i) handleFile(i.getAsFile()); });
  btnUploadMore.addEventListener('click', () => { sincronizarCamposDoPassageiroAtual(); passageiroAtual = (passageiroAtual + 1) % 9; renderizarPassageiro(passageiroAtual); });
  btnFinish.addEventListener('click', finalizarEIrAoFormulario);
  if (btnChange) btnChange.addEventListener('click', () => fileInput.click());
  if (btnBack) btnBack.addEventListener('click', () => previewBox.style.display = 'none');
  if (btnClearPassenger) btnClearPassenger.addEventListener('click', () => { passageiros[passageiroAtual] = { nome: '', cpf: '', dataNascimento: '', genero: '', nacionalidade: 'Brasil' }; renderizarPassageiro(passageiroAtual); });
}

function handleFile(f) {
  if (!f) return;
  const url = URL.createObjectURL(f);
  passageiros[passageiroAtual].imagemDataUrl = url;
  atualizarPreviewPassageiro(passageiroAtual);
  processarImagemComOCR(url, passageiroAtual);
}

async function processarImagemComOCR(url, idx) {
  showSpinner(true);
  try {
    const data = await runOCROnImage(url);
    passageiros[idx] = { ...passageiros[idx], nome: data.nomeCompleto, cpf: data.cpf, dataNascimento: data.dataNascimento, genero: data.genero };
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

window.onload = () => { aplicarConfiguracaoDoProvedor(); setupEventListeners(); atualizarAbas(); };
