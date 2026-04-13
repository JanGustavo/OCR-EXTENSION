/**
 * CONTENT SCRIPT — Injetor de Formulários
 *
 * Roda no contexto das páginas das companhias aéreas (ver manifest host_permissions).
 * Responsabilidades:
 *  1. Escutar o CustomEvent 'OCR_AUTOFILL' disparado pelo Service Worker
 *  2. Localizar os campos corretos do formulário via estratégia de seletores em cascata
 *  3. Injetar os valores de forma que os frameworks reativos da página detectem a mudança
 *
 * NOTA SOBRE FRAMEWORKS REATIVOS:
 *  Sites como LATAM e Azul usam Angular/React internamente.
 *  Um simples element.value = 'X' NÃO dispara o ciclo de detecção de mudanças.
 *  É necessário disparar eventos sintéticos (input + change) para que o framework
 *  reconheça o novo valor como legítimo e habilite o botão de continuar.
 */

function getProviderForCurrentUrl() {
  const providers = Object.values(window.OCRProviders || {});
  const hostname = window.location.hostname;
  return providers.find((provider) => provider.supports(hostname)) || null;
}

const OCRDBG = '[OCRDBG]';

const OCR_INJECT_DEDUPE_WINDOW_MS = 4000;
const ocrInjectorState = window.__OCR_INJECTOR_STATE__ || {
  inFlight: false,
  lastSignature: '',
  lastInjectAt: 0
};
window.__OCR_INJECTOR_STATE__ = ocrInjectorState;

function buildPassengersSignature(passageiros) {
  try {
    const normalized = (Array.isArray(passageiros) ? passageiros : [passageiros])
      .filter(Boolean)
      .map((p, idx) => ({
        idx,
        nome: String(p.nome || p.nomeCompleto || `${p.firstName || ''} ${p.lastName || ''}` || '').trim(),
        cpf: String(p.cpf || '').replace(/\D/g, ''),
        dataNascimento: String(p.dataNascimento || p.birthDate || '').trim()
      }));

    return JSON.stringify(normalized);
  } catch (err) {
    console.warn('[Injector] Falha ao gerar assinatura de dedupe:', err);
    return `fallback:${Date.now()}`;
  }
}

// ─── Inicialização ──────────────────────────────────────────────────────────

// Escuta o evento disparado pelo Service Worker via chrome.scripting.executeScript
window.addEventListener('OCR_AUTOFILL', (event) => {
  const payload = event.detail;
  if (!payload) return console.warn('[Injector] Dados de OCR ausentes.');

  const passageiros = Array.isArray(payload) ? payload : [payload];
  console.log(`${OCRDBG}[Injector] Evento OCR_AUTOFILL recebido`, {
    total: passageiros.length,
    origem: 'window-event'
  });
  iniciarInjecao(passageiros).catch((error) => {
    console.error('[Injector] Falha ao iniciar injeção via evento:', error);
  });
});

// Escuta mensagens diretas do upload/popup sem depender de executeScript.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'OCR_AUTOFILL') return false;

  const passageiros = Array.isArray(message.data) ? message.data : [message.data];
  console.log(`${OCRDBG}[Injector] Mensagem OCR_AUTOFILL recebida`, {
    total: passageiros.length,
    origem: 'runtime-message',
    tabId: sender?.tab?.id,
    frameId: sender?.frameId
  });
  if (!passageiros.length) {
    console.warn('[Injector] Mensagem OCR_AUTOFILL sem dados.');
    sendResponse?.({ ok: false, reason: 'empty-payload' });
    return false;
  }

  iniciarInjecao(passageiros)
    .then(() => sendResponse?.({ ok: true }))
    .catch((error) => {
      console.error('[Injector] Falha ao iniciar injeção via mensagem:', error);
      sendResponse?.({ ok: false, error: error?.message || String(error) });
    });

  // Mantém o canal aberto para a resposta assíncrona acima.
  return true;
});

// ─── MOTOR DE INJEÇÃO MODULAR ────────────────────────────────────────────────

// Função principal que será injetada na página atual
async function iniciarInjecao(passageiros) {
  const provider = getProviderForCurrentUrl();

  if (!provider) {
    alert('Site de companhia aérea não reconhecido pelo OCR.');
    return;
  }

  const signature = `${provider.id}:${buildPassengersSignature(passageiros)}`;
  const now = Date.now();

  console.log(`${OCRDBG}[Injector] iniciarInjecao`, {
    provider: provider.id,
    signature,
    inFlight: ocrInjectorState.inFlight,
    deltaMs: now - (ocrInjectorState.lastInjectAt || 0)
  });

  if (
    ocrInjectorState.lastSignature === signature &&
    (now - ocrInjectorState.lastInjectAt) < OCR_INJECT_DEDUPE_WINDOW_MS
  ) {
    console.warn('[Injector] Injeção duplicada detectada, ignorando.');
    return;
  }

  if (ocrInjectorState.inFlight && ocrInjectorState.lastSignature === signature) {
    console.warn('[Injector] Injeção em andamento para o mesmo payload, ignorando.');
    return;
  }

  ocrInjectorState.inFlight = true;
  ocrInjectorState.lastSignature = signature;
  ocrInjectorState.lastInjectAt = now;

  console.log(`[OCR] Provider detectado: ${provider.id}. Iniciando módulo...`);

  try {
    if (typeof provider.inject === 'function') {
      await Promise.resolve(
        provider.inject(passageiros, {
          fillForm,
          highlightFilledFields,
          fillField
        })
      );
      return;
    }

    // Fallback para providers ainda sem motor dedicado
    const primeiroPassageiro = passageiros.find((p) => p && (p.nome || p.firstName || p.cpf || p.dataNascimento || p.birthDate));
    if (!primeiroPassageiro) {
      console.warn('[Injector] Nenhum passageiro com dados para injeção.');
      return;
    }

    fillForm(primeiroPassageiro, provider.selectors, provider.id);
  } finally {
    ocrInjectorState.inFlight = false;
  }
}

// ─── Lógica de preenchimento ────────────────────────────────────────────────

/**
/**
 * Preenche o formulário com os dados extraídos pelo OCR.
 * @param {{ nomeCompleto: string, primeiroNome: string, sobrenome: string, cpf: string, dataNascimento: string }} data
 * @param {Object} selectors - Mapa de seletores para o provider atual
 * @param {string} providerId
 */
function fillForm(data, selectors, providerId) {
  // Vai buscar os campos do payload de forma segura
  let nome = (data.primeiroNome || data.nome || '').trim();
  let sobrenome = (data.sobrenome || '').trim();
  
  // NOVA LÓGICA (FIX): Se não houver sobrenome, mas o 'nome' tiver múltiplas palavras,
  // fazemos a separação forçada aqui.
  if (!sobrenome && nome.includes(' ')) {
    const palavras = nome.split(/\s+/);
    sobrenome = palavras.pop(); // Remove a última palavra e guarda como sobrenome
    nome = palavras.join(' ');  // As restantes ficam como primeiro nome
  } 
  // Fallback antigo: caso só venha a string nomeCompleto
  else if (!nome && !sobrenome && data.nomeCompleto) {
    const palavras = data.nomeCompleto.trim().split(/\s+/);
    sobrenome = palavras.length > 1 ? palavras.pop() : '';
    nome = palavras.join(' ');
  }

  // O mapa de preenchimento atualizado com os nomes devidamente separados
  const fillMap = {
    nome: nome,
    sobrenome: sobrenome,
    cpf: data.cpf,
    dataNascimento: data.dataNascimento,
    genero: data.genero || data.gender,
    nacionalidade: data.nacionalidade || data.nationality,
    email: data.email,
    telefone: data.telefone
  };

  let successCount = 0;

  for (const [field, value] of Object.entries(fillMap)) {
    if (!value) continue;

    const element = document.querySelector(selectors[field]);
    if (!element) {
      console.warn(`[Injector] Campo não encontrado: ${field} (${selectors[field]})`);
      continue;
    }

    const filled = fillField(element, value);
    if (filled) successCount++;
  }

  console.info(`[Injector:${providerId}] ${successCount} campo(s) preenchido(s).`);
  if (typeof highlightFilledFields === 'function') {
      highlightFilledFields();
  }
}

/**
 * Injeta valor em um campo de forma compatível com frameworks reativos.
 * Técnica: sobrescreve o setter nativo via Object.getOwnPropertyDescriptor
 * para garantir que React/Angular detectem a mudança.
 *
 * @param {HTMLInputElement} element
 * @param {string} value
 * @returns {boolean} - true se bem-sucedido
 */
function fillField(element, value) {
  try {
    // Obtém o setter nativo do input (antes de frameworks sobrescreverem)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value; // fallback para campos simples
    }

    element.dataset.ocrFilled = 'true';

    // Dispara eventos que frameworks reativos escutam para detectar mudanças
    element.dispatchEvent(new Event('input',  { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur',   { bubbles: true }));

    return true;
  } catch (error) {
    console.error(`[Injector] Falha ao preencher campo:`, error);
    return false;
  }
}

/**
 * Destaca visualmente os campos preenchidos pelo OCR.
 * Facilita revisão pelo usuário antes de confirmar.
 */
function highlightFilledFields() {
  const style = document.createElement('style');
  style.textContent = `
    .ocr-autofill-highlight {
      outline: 2px solid #22c55e !important;
      background-color: rgba(34, 197, 94, 0.08) !important;
      transition: outline 0.3s ease;
    }
  `;
  document.head.appendChild(style);

  // Aplica highlight em todos os inputs com valor preenchido pelo injector
  document.querySelectorAll('input[data-ocr-filled]').forEach(el => {
    el.classList.add('ocr-autofill-highlight');
  });
}
