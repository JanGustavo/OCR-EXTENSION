/**
 * Provider Azul — v2 (corrigido)
 *
 * Correções aplicadas:
 *  1. siteIndex: index + 1 → index (data-test-id usa base 0)
 *  2. Leitura unificada de nome/sobrenome (suporta todos os formatos do storage)
 *  3. Gênero e Nacionalidade com fallback inteligente
 *  4. setReactSelectValue fecha menu anterior antes de abrir novo
 *  5. Destaque visual via data-ocr-filled para compatibilidade com injector.js
 */
(function registerAzulProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  // ─── Suporte ───────────────────────────────────────────────────────────────

  function supports(hostname) {
    return hostname.includes('azul.com.br') || hostname.includes('voeazul.com.br');
  }

  // ─── Helpers de normalização ───────────────────────────────────────────────

  /**
   * Extrai primeiroNome e sobrenome de qualquer formato que vem do storage.
   * Suporta: { firstName, lastName } | { nome } | { nomeCompleto } | misto
   */
  function splitNome(passageiro) {
    // Prioridade 1: já vem separado e preenchido
    const fn = String(passageiro.firstName || passageiro.primeiroNome || '').trim();
    const ln = String(passageiro.lastName  || passageiro.sobrenome    || '').trim();
    if (fn && ln) return { primeiroNome: fn, sobrenome: ln };

    // Prioridade 2: nome completo numa string só
    const full = String(
      passageiro.nomeCompleto || passageiro.nome || `${fn} ${ln}`
    ).trim();

    if (!full) return { primeiroNome: fn || '', sobrenome: ln || '' };

    const partes = full.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return { primeiroNome: partes[0], sobrenome: partes[0] };

    return {
      primeiroNome: partes.slice(0, -1).join(' '),
      sobrenome: partes[partes.length - 1]
    };
  }

  function normalizeBirthDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    // ISO: YYYY-MM-DD ou YYYY/MM/DD → DD/MM/YYYY
    const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    // BR: DD.MM.YYYY ou DD-MM-YYYY → DD/MM/YYYY
    const br = raw.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}`;

    return raw.replace(/[-\.]/g, '/');
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Localização de campos ─────────────────────────────────────────────────

  /**
   * BUG CORRIGIDO: data-test-id usa base-0.
   * Passageiro 0 → passenger-identification-firstname-0
   * Passageiro 1 → passenger-identification-firstname-1
   * O código anterior fazia index + 1, quebrando todos os seletores.
   */
  function findField(fieldType, index) {
    const selectors = {
      firstName:        `[data-test-id="passenger-identification-firstname-${index}"]`,
      lastName:         `[data-test-id="passenger-identification-lastname-${index}"]`,
      cpf:              `[data-test-id="passenger-identification-cpf-or-tudoazul-${index}"]`,
      birthDate:        `[data-test-id="passenger-identification-birthday-${index}"]`,
      nationalityGroup: `[data-test-id="passenger-identification-nationality-${index}"]`,
      genderGroup:      `[data-test-id="passenger-identification-gender-${index}"]`
    };
    return document.querySelector(selectors[fieldType]) || null;
  }

  // ─── Preenchimento de inputs React ────────────────────────────────────────

  function setReactValue(inputElement, value) {
    if (!inputElement || value == null || value === '') return false;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(inputElement, value);
    } else {
      inputElement.value = value;
    }

    // Marca para highlight visual (compatível com injector.js)
    inputElement.dataset.ocrFilled = 'true';

    inputElement.dispatchEvent(new Event('input',  { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new Event('blur',   { bubbles: true }));
    return true;
  }

  async function setReactValueWithRetry(inputElement, value) {
    if (!inputElement || !value) return false;

    setReactValue(inputElement, value);
    await delay(100);

    // Retry se React ainda não aplicou o valor
    if (String(inputElement.value || '').trim() === '' && String(value || '').trim() !== '') {
      setReactValue(inputElement, value);
    }

    return true;
  }

  // ─── Preenchimento de React-Select (Gênero / Nacionalidade) ──────────────

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  /**
   * BUG CORRIGIDO: fecha qualquer dropdown aberto antes de abrir o próximo,
   * evitando conflito quando dois react-selects são preenchidos em sequência.
   */
  async function closeAnyOpenDropdown() {
    // Clica no body para fechar menus flutuantes
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await delay(80);
  }

  async function setReactSelectValue(groupEl, targetValue) {
    if (!groupEl || !targetValue) return false;

    const control = groupEl.querySelector('.react-select__control');
    if (!control) return false;

    await closeAnyOpenDropdown();

    // Abre o dropdown
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    control.click();
    await delay(200);

    const desired = normalizeText(targetValue);

    // Busca entre as opções visíveis no DOM
    const options = Array.from(
      document.querySelectorAll('.react-select__option, [id*="react-select"][id*="option"]')
    );

    const match = options.find((opt) =>
      normalizeText(opt.textContent).includes(desired)
    );

    if (match) {
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      match.click();
      // Marca o hidden input associado para highlight
      const hiddenInput = groupEl.querySelector('input[type="hidden"]');
      if (hiddenInput) hiddenInput.dataset.ocrFilled = 'true';
      return true;
    }

    // Fallback: digita no input de busca e confirma com Enter
    const searchInput = groupEl.querySelector(
      'input[aria-autocomplete="list"], input[aria-label*="Editar"]'
    );
    if (searchInput) {
      setReactValue(searchInput, targetValue);
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }

    await closeAnyOpenDropdown();
    return false;
  }

  // ─── Motor principal de injeção ───────────────────────────────────────────

  async function injetarAzul(passageiros, helpers) {
    const { highlightFilledFields } = helpers;

    for (let index = 0; index < passageiros.length; index++) {
      const passageiro = passageiros[index];

      // Ignora slots vazios
      const temDados = passageiro && (
        passageiro.nome || passageiro.nomeCompleto ||
        passageiro.firstName || passageiro.primeiroNome ||
        passageiro.cpf || passageiro.dataNascimento || passageiro.birthDate
      );
      if (!temDados) continue;

      // ── Aguarda os campos aparecerem no DOM (até 1s) ──
      let encontrou = false;
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        if (findField('firstName', index)) { encontrou = true; break; }
        await delay(250);
      }
      if (!encontrou) {
        console.warn(`[Azul] Passageiro ${index}: campos não encontrados no DOM.`);
        continue;
      }

      const { primeiroNome, sobrenome } = splitNome(passageiro);
      const cpf = String(passageiro.cpf || '').replace(/\D/g, '');
      const dataNascimento = normalizeBirthDate(
        passageiro.dataNascimento || passageiro.birthDate || ''
      );

      /**
       * Gênero: BUG CORRIGIDO — o upload.js não salvava gênero.
       * Adicionado fallback padrão vazio (não força um valor) para não
       * quebrar o formulário quando o usuário não informou.
       * Se vier preenchido (ex: quando adicionamos o campo no upload.html),
       * usa o valor; senão, pula silenciosamente.
       */
      const genero = String(
        passageiro.genero || passageiro.gender || ''
      ).trim();

      /**
       * Nacionalidade: padrão 'Brasil' quando não informado,
       * pois é o caso de uso primário da extensão.
       */
      const nacionalidade = String(
        passageiro.nacionalidade || passageiro.nationality || 'Brasil'
      ).trim();

      console.log(`[Azul] Injetando passageiro ${index}:`, {
        primeiroNome, sobrenome, cpf, dataNascimento, genero, nacionalidade
      });

      // ── Campos de texto (paralelos) ──
      const tarefasTexto = [];

      const campoNome = findField('firstName', index);
      if (campoNome && primeiroNome)
        tarefasTexto.push(setReactValueWithRetry(campoNome, primeiroNome));

      const campoSobrenome = findField('lastName', index);
      if (campoSobrenome && sobrenome)
        tarefasTexto.push(setReactValueWithRetry(campoSobrenome, sobrenome));

      const campoCpf = findField('cpf', index);
      if (campoCpf && cpf)
        tarefasTexto.push(setReactValueWithRetry(campoCpf, cpf));

      const campoData = findField('birthDate', index);
      if (campoData && dataNascimento)
        tarefasTexto.push(setReactValueWithRetry(campoData, dataNascimento));

      await Promise.allSettled(tarefasTexto);

      // ── React-Selects (sequenciais para evitar conflito de menus) ──
      const campoNacionalidade = findField('nationalityGroup', index);
      if (campoNacionalidade) {
        await setReactSelectValue(campoNacionalidade, nacionalidade);
        await delay(150);
      }

      // Só preenche gênero se o valor vier explícito
      if (genero) {
        const campoGenero = findField('genderGroup', index);
        if (campoGenero) {
          await setReactSelectValue(campoGenero, genero);
          await delay(150);
        }
      }
    }

    highlightFilledFields();
  }

  // ─── Registro do provider ─────────────────────────────────────────────────

  global.OCRProviders.azul = {
    id: 'azul',
    supports,
    inject: injetarAzul
  };

})(window);