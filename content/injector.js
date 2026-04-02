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

// ─── Mapa de seletores por companhia ───────────────────────────────────────
// Cada companhia tem diferentes atributos e estruturas de formulário.
// A estratégia de prioridade: data-testid > aria-label > name > placeholder
const SELECTORS = {
  'latam.com': {
    nome:           '[data-testid="passenger-name"], [name*="firstName"], [aria-label*="nome"]',
    sobrenome:      '[data-testid="passenger-lastname"], [name*="lastName"]',
    cpf:            '[data-testid="cpf-field"], [name*="cpf"], [aria-label*="CPF"]',
    dataNascimento: '[data-testid="birthdate"], [name*="birthDate"], [aria-label*="nascimento"]'
  },
  'gol.com.br': {
    nome:           '[name="firstName"], [placeholder*="Nome"]',
    sobrenome:      '[name="lastName"], [placeholder*="Sobrenome"]',
    cpf:            '[name="cpf"], [placeholder*="CPF"]',
    dataNascimento: '[name="birthday"], [placeholder*="DD/MM/AAAA"]'
  },
  'azul.com.br': {
    nome:           '[formcontrolname="firstName"], [placeholder*="Nome"]',
    sobrenome:      '[formcontrolname="lastName"]',
    cpf:            '[formcontrolname="cpf"], [aria-label*="CPF"]',
    dataNascimento: '[formcontrolname="birthday"], [formcontrolname="dateOfBirth"]'
  }
};

// ─── Inicialização ──────────────────────────────────────────────────────────

// Escuta o evento disparado pelo Service Worker via chrome.scripting.executeScript
window.addEventListener('OCR_AUTOFILL', (event) => {
  const data = event.detail;
  if (!data) return console.warn('[Injector] Dados de OCR ausentes.');

  const domain = getDomain();
  const selectors = SELECTORS[domain];

  if (!selectors) {
    console.warn(`[Injector] Domínio não mapeado: ${domain}`);
    return;
  }

  fillForm(data, selectors);
});

// ─── Lógica de preenchimento ────────────────────────────────────────────────

function getDomain() {
  const hostname = window.location.hostname;
  return Object.keys(SELECTORS).find(d => hostname.includes(d)) || null;
}

/**
 * Preenche o formulário com os dados extraídos pelo OCR.
 * @param {{ nomeCompleto: string, primeiroNome: string, sobrenome: string, cpf: string, dataNascimento: string }} data
 * @param {Object} selectors - Mapa de seletores para o domínio atual
 */
function fillForm(data, selectors) {
  // Usa os campos separados se disponíveis, caso contrário faz fallback de separação
  let nome = data.primeiroNome || '';
  let sobrenome = data.sobrenome || '';
  
  // Fallback: se não temos campos separados, tenta separar do nomeCompleto
  if (!nome && data.nomeCompleto) {
    const palavras = (data.nomeCompleto || '').trim().split(/\s+/);
    if (palavras.length > 1) {
      sobrenome = palavras[palavras.length - 1];
      nome = palavras.slice(0, -1).join(' ');
    } else {
      nome = data.nomeCompleto;
    }
  }

  const fillMap = {
    nome: nome || data.nome,
    sobrenome,
    cpf: data.cpf,
    dataNascimento: data.dataNascimento
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

  console.info(`[Injector] ${successCount} campo(s) preenchido(s).`);
  highlightFilledFields();
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
