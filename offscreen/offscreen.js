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
  
  // Aumentar o contraste e binarizar
  const contrast = 40; 
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const threshold = 128; // Limiar para binarização

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    let color = factor * (lum - 128) + 128;
    
    // Binarização simples: se for mais escuro que o threshold, vira preto (0), senão branco (255)
    color = color < threshold ? 0 : 255;
    
    data[i] = data[i + 1] = data[i + 2] = color;
    data[i + 3] = 255;
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
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
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
    workerBlobURL: false,
    langPath: chrome.runtime.getURL('assets/tesseract/tessdata'),
    corePath: chrome.runtime.getURL('assets/tesseract/tesseract-core.wasm.js'),
    logger: (m) => console.debug('[Tesseract]', m)
  };

  let worker;
  
  try {
    // Prioriza local para garantir compatibilidade de versão e offline
    console.log('[Offscreen] Tentando worker local...');
    worker = await Tesseract.createWorker('por+eng', 1, {
      ...baseOptions,
      workerPath: chrome.runtime.getURL('assets/tesseract/worker.min.js')
    });
  } catch (localErr) {
    console.warn('[Offscreen] Falha no worker local, tentando CDN...', localErr.message);
    worker = await Tesseract.createWorker('por+eng', 1, {
      ...baseOptions,
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/worker.min.js'
    });
  }

  await worker.setParameters({
    // PSM 3 = Automático (bom para documentos com cabeçalhos e vários blocos)
    tessedit_pageseg_mode: '3', 
    // Whitelist expandida para aceitar acentos brasileiros
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-: ÁÉÍÓÚÂÊÔÃÕÇ',
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
    dataNascimento: extractDataNascimento(normalizedText),
    genero: extractGenero(normalizedText),
    nacionalidade: extractNacionalidade(normalizedText)
  };
}

/**
 * Limpa o texto candidato a nome e remove termos indesejados (Blacklist)
 */
function sanitizeNomeCandidate(text) {
  if (!text) return null;

  const raw = String(text).toUpperCase().replace(/\s+/g, ' ').trim();

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

  // 1. Mantém apenas letras e espaços
  let cleanText = raw
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. 🛑 LISTA NEGRA TURBINADA: Destrói cabeçalhos de RG e CNH
  const blacklist = [
    'VALIDADE', 'VALIDA', 'EXPEDICAO', 'DATA', 'NASCIMENTO', 'CPF', 'RG', 'DOC',
    'SSP', 'DETRAN', 'MINISTERIO', 'REPUBLICA', 'FEDERATIVA', 'BRASIL', 'UF',
    'CARTEIRA', 'NACIONAL', 'HABILITACAO', 'IDENTIDADE', 'REGISTRO', 'GERAL',
    'NATURALIDADE', 'ASSINATURA', 'TITULAR', 'PASSAPORTE', 'NOME', 'EMISSAO',
    'LOCAL', 'FILIACAO', 'PAI', 'MAE', 'ORGAO', 'EMISSOR',
    // --- NOVIDADES ---
    'GOVERNO', 'FEDERAL', 'ESTADO', 'SECRETARIA', 'SEGURANCA', 'PUBLICA', 
    'DEFESA', 'SOCIAL', 'POLICIA', 'CIVIL', 'DEPARTAMENTO', 'TRANSITO',
    'VALIDO', 'TODO', 'TERRITORIO', 'LEI', 'VIA'
  ];

  // 3. Remove as palavras da blacklist do candidato a nome
  blacklist.forEach(word => {
    // Usa \b para garantir que só remove a palavra inteira
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    cleanText = cleanText.replace(regex, '');
  });

  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  // 4. Validação final: nome com ao menos duas palavras "fortes"
  const parts = cleanText.split(' ');
  if (parts.length < 2 || cleanText.length <= 5) return null;

  const connectors = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
  const strongWords = parts.filter((w) => !connectors.has(w) && w.length >= 2);
  if (strongWords.length < 2) return null;

  return cleanText;

  // Reprova se sobrar apenas estado/localidade ou estrutura institucional
}
/**
 * Extrai o nome do passageiro caçando indicadores chave
 */
function extractNome(text) {
  const textUpper = text.toUpperCase();

  // 1. Procura com delimitadores diretos no texto corrido
  // Ex: "NOME: JOAO DA SILVA DATA..." -> Extrai "JOAO DA SILVA"
  const patterns = [
    /(?:NOME(?:\s+COMPLETO)?|NAME|PASSAGEIRO|TITULAR)[:\s]+([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s]{3,90}?)(?=\s+(?:CPF|DATA|NASC|NAT|RG|DOC|VAL|EXP|ASSINATURA|EMISSAO|$))/
  ];

  for (const pattern of patterns) {
    const match = textUpper.match(pattern);
    const candidate = sanitizeNomeCandidate(match?.[1]);
    if (candidate) return candidate;
  }

  // 2. Separa o OCR linha por linha para análise estrutural
  const lines = textUpper
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // 3. Estratégia de Proximidade: Procura a palavra "NOME"
  for (let i = 0; i < lines.length; i++) {
    if (/\b(?:NOME|NAME)\b/.test(lines[i])) {
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

  // 4. Último Recurso (Fallback): Passa todas as linhas no filtro
  // A primeira linha que sobrar inteira, com duas palavras, sem ser da blacklist, é assumida como o nome.
  for (let i = 0; i < lines.length; i++) {
    const candidate = sanitizeNomeCandidate(lines[i]);
    if (candidate) return candidate;
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

/**
 * Extrai o Gênero / Sexo do documento
 */
function extractGenero(text) {
  const textUpper = String(text || '').toUpperCase();

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

  // Padrão 1: "SEXO M", "SEXO: F", "SEXO MASCULINO", "SEX: M"
  const matchDireto = textUpper.match(/\b(?:SEXO|SEX|GENERO|GENDER)\b[\s:.-]{0,8}(MASC(?:ULINO)?|FEM(?:ININO)?|M\b|F\b)/);
  if (matchDireto) {
    const mapped = mapGenero(matchDireto[1]);
    if (mapped) return mapped;
  }

  // Padrão 2: Formato clássico de passaporte (M / M ou F / F)
  const matchPassaporte = textUpper.match(/\b(M|F)\s*\/\s*(?:M|F)\b/);
  if (matchPassaporte) {
    return matchPassaporte[1] === 'M' ? 'Masculino' : 'Feminino';
  }

  const linhas = textUpper
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const labelRegex = /\b(SEXO|SEX|GENERO|GENDER)\b/;
  for (let i = 0; i < linhas.length; i++) {
    if (!labelRegex.test(linhas[i])) continue;

    const currentTail = linhas[i].replace(/^.*\b(?:SEXO|SEX|GENERO|GENDER)\b[\s:.-]*/g, ' ').trim();
    const chunks = [currentTail, linhas[i + 1] || '', linhas[i + 2] || ''];

    for (const chunk of chunks) {
      const mapped = extractFromChunk(chunk);
      if (mapped) return mapped;
    }
  }

  // Padrão 3: Apenas M/F em linha curta
  for (const linha of linhas) {
    const mapped = mapGenero(linha);
    if (mapped) return mapped;
  }

  return '';
}

/**
 * Extrai a Nacionalidade do documento
 */
function extractNacionalidade(text) {
  const textUpper = String(text || '').toUpperCase();

  // Padrão 1: "NACIONALIDADE BRASILEIRO", "NATIONALITY BRA"
  const matchDireto = textUpper.match(/\b(?:NACIONALIDADE|NATIONALITY|NACIONALITY|NATURALIDADE)[\s:.-]*([A-Z]{3,24})\b/);
  if (matchDireto) {
    const nac = matchDireto[1];
    if (nac.includes('BRASIL') || nac === 'BRA' || nac.startsWith('BRASILEIR')) return 'Brasil';
    return nac.charAt(0) + nac.slice(1).toLowerCase();
  }

  // Padrão 2: palavras-chave brasileiras comuns
  if (/\b(?:BRASILEIRA|BRASILEIRO|BRAZILIAN|BRASIL)\b/.test(textUpper)) {
    return 'Brasil';
  }

  return '';
}
