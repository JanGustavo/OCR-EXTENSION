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
  const OCRDBG = '[OCRDBG]';
  const azulInjectState = global.__OCR_AZUL_INJECT_STATE__ || {
    lastPathname: '',
    lastSignature: ''
  };
  global.__OCR_AZUL_INJECT_STATE__ = azulInjectState;

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
  function extractTrailingIndex(testId, prefix) {
    const raw = String(testId || '');
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = raw.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
    if (!match) return Number.NaN;
    return Number.parseInt(match[1], 10);
  }

  function findField(fieldType, index) {
    const prefixes = {
      firstName: 'passenger-identification-firstname-',
      lastName: 'passenger-identification-lastname-',
      cpf: 'passenger-identification-cpf-or-tudoazul-',
      birthDate: 'passenger-identification-birthday-',
      nationalityGroup: 'passenger-identification-nationality-',
      genderGroup: 'passenger-identification-gender-'
    };

    const prefix = prefixes[fieldType];
    if (!prefix) return null;

    // Tentativa direta (base 0)
    let direct = document.querySelector(`[data-test-id="${prefix}${index}"]`);
    if (direct) return direct;

    // Fallback comum de alguns ambientes (base 1)
    direct = document.querySelector(`[data-test-id="${prefix}${index + 1}"]`);
    if (direct) return direct;

    const all = Array.from(document.querySelectorAll(`[data-test-id^="${prefix}"]`));
    if (!all.length) return null;

    // Se os sufixos forem numéricos, tenta casar exatamente por índice (0/1-based).
    const bySuffix = all
      .map((el) => ({
        el,
        idx: extractTrailingIndex(el.getAttribute('data-test-id'), prefix)
      }))
      .filter((item) => Number.isFinite(item.idx));

    const exactZeroBased = bySuffix.find((item) => item.idx === index)?.el;
    if (exactZeroBased) return exactZeroBased;

    const exactOneBased = bySuffix.find((item) => item.idx === index + 1)?.el;
    if (exactOneBased) return exactOneBased;

    // Último fallback: posição no DOM.
    return all[index] || null;
  }

  async function ensurePassengerCardActive(index) {
    let card = document.querySelector(`#passenger-card-${index}`)
      || document.querySelector(`[data-test-id="passenger-card-${index}"]`)
      || document.querySelector(`#passenger-card-${index + 1}`)
      || document.querySelector(`[data-test-id="passenger-card-${index + 1}"]`);

    if (!card) {
      const cardCandidates = Array.from(document.querySelectorAll(
        '[id^="passenger-card-"], [data-test-id^="passenger-card-"]'
      ));
      card = cardCandidates[index] || null;
    }

    if (!card) {
      const accordionCandidates = Array.from(document.querySelectorAll(
        '[data-test-id*="accordion-passenger"], [id*="accordion-passenger"], [data-test-id*="passenger"][role="button"]'
      ));
      const accordion = accordionCandidates[index] || null;
      if (accordion) {
        accordion.scrollIntoView({ block: 'center', inline: 'nearest' });
        accordion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        accordion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await delay(220);
      }
      return;
    }

    card.scrollIntoView({ block: 'center', inline: 'nearest' });

    const header = card.querySelector(
      '.passenger-header, [class*="passenger-header"], .passenger, .passenger-type, button, [role="button"]'
    );

    if (header) {
      header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    await delay(220);
  }

  // ─── Preenchimento de inputs React ────────────────────────────────────────

  function setReactValue(inputElement, value) {
    if (!inputElement || value == null || value === '') return false;

    const currentValue = String(inputElement.value || '').trim();
    const nextValue = String(value).trim();
    const isCpfField = String(inputElement.getAttribute('data-test-id') || '').includes('cpf-or-tudoazul');
    const currentComparable = isCpfField ? currentValue.replace(/\D/g, '') : currentValue;
    const nextComparable = isCpfField ? nextValue.replace(/\D/g, '') : nextValue;

    if (currentComparable === nextComparable) {
      inputElement.dataset.ocrFilled = 'true';
      return true;
    }

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

  async function closeDropdownForGroup(groupEl) {
    if (!groupEl) return;
    const input = groupEl.querySelector('input[aria-autocomplete="list"], input[aria-label*="Editar"]');
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    await delay(60);
  }

  async function setReactSelectValue(groupEl, targetValue) {
    if (!groupEl || !targetValue) return false;

    const control = groupEl.querySelector('.react-select__control');
    if (!control) return false;

    // Abre o dropdown
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await delay(200);

    const desired = normalizeText(targetValue);

    // Prioriza o listbox ligado ao input deste grupo; evita pegar opção de outro select.
    const listboxId = groupEl
      .querySelector('input[aria-controls]')
      ?.getAttribute('aria-controls');

    let options = [];
    if (listboxId) {
      const listbox = document.getElementById(listboxId);
      if (listbox) {
        options = Array.from(listbox.querySelectorAll('[role="option"], .react-select__option'));
      }
    }

    if (!options.length) {
      options = Array.from(
        document.querySelectorAll('.react-select__option, [id*="react-select"][id*="option"]')
      );
    }

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

    await closeDropdownForGroup(groupEl);
    return false;
  }

  function getSelectedReactSelectText(groupEl) {
    if (!groupEl) return '';

    const hiddenInputValue = String(
      groupEl.querySelector('input[type="hidden"]')?.value || ''
    ).trim();
    if (hiddenInputValue) return hiddenInputValue;

    const singleValueText = String(
      groupEl.querySelector('.react-select__single-value')?.textContent || ''
    ).trim();
    if (singleValueText) return singleValueText;

    return '';
  }

  function isExpectedSelectValue(groupEl, targetValue) {
    const selected = normalizeText(getSelectedReactSelectText(groupEl));
    const expected = normalizeText(targetValue);
    if (!selected || !expected) return false;
    return selected.includes(expected) || expected.includes(selected);
  }

  async function setReactSelectValueWithRetry(groupEl, targetValue, maxAttempts = 3) {
    if (!groupEl || !targetValue) return false;

    const fieldType = String(groupEl.getAttribute('data-test-id') || 'unknown');
    console.log(`${OCRDBG}[Azul] select:start`, {
      fieldType,
      targetValue,
      atual: getSelectedReactSelectText(groupEl)
    });

    if (isExpectedSelectValue(groupEl, targetValue)) {
      console.log(`${OCRDBG}[Azul] select:already-ok`, {
        fieldType,
        atual: getSelectedReactSelectText(groupEl)
      });
      return true;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await setReactSelectValue(groupEl, targetValue);
      await delay(120 + attempt * 120);

      console.log(`${OCRDBG}[Azul] select:attempt`, {
        fieldType,
        attempt,
        atual: getSelectedReactSelectText(groupEl)
      });

      if (isExpectedSelectValue(groupEl, targetValue)) {
        console.log(`${OCRDBG}[Azul] select:ok`, {
          fieldType,
          attempt,
          atual: getSelectedReactSelectText(groupEl)
        });
        return true;
      }
    }

    // Fallback final: força digitação no input editável do react-select e confirma.
    const forcedInput = groupEl.querySelector('input[aria-autocomplete="list"], input[aria-label*="Editar"]');
    if (forcedInput) {
      setReactValue(forcedInput, targetValue);
      forcedInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await delay(220);

      console.log(`${OCRDBG}[Azul] select:forced-input`, {
        fieldType,
        atual: getSelectedReactSelectText(groupEl)
      });

      if (isExpectedSelectValue(groupEl, targetValue)) {
        console.log(`${OCRDBG}[Azul] select:ok-after-forced`, {
          fieldType,
          atual: getSelectedReactSelectText(groupEl)
        });
        return true;
      }
    }

    console.warn(`${OCRDBG}[Azul] select:failed`, {
      fieldType,
      targetValue,
      atual: getSelectedReactSelectText(groupEl)
    });

    return false;
  }

  // ─── Motor principal de injeção ───────────────────────────────────────────

  async function injetarAzul(passageiros, helpers) {
    const { highlightFilledFields } = helpers;

    const currentPathname = window.location.pathname;
    const payloadSignature = JSON.stringify((Array.isArray(passageiros) ? passageiros : [passageiros]).map((p) => ({
      nome: String(p?.nome || p?.nomeCompleto || `${p?.firstName || ''} ${p?.lastName || ''}` || '').trim(),
      cpf: String(p?.cpf || '').replace(/\D/g, ''),
      dataNascimento: String(p?.dataNascimento || p?.birthDate || '').trim(),
      genero: String(p?.genero || p?.gender || '').trim(),
      nacionalidade: String(p?.nacionalidade || p?.nationality || '').trim()
    })));

    if (
      azulInjectState.lastPathname === currentPathname &&
      azulInjectState.lastSignature === payloadSignature
    ) {
      console.warn('[Azul] Reinjeção idêntica na mesma rota detectada; ignorando para evitar efeitos colaterais.');
      return;
    }

    azulInjectState.lastPathname = currentPathname;
    azulInjectState.lastSignature = payloadSignature;

    console.log(`${OCRDBG}[Azul] inject:start`, {
      pathname: currentPathname,
      total: passageiros.length,
      signature: payloadSignature
    });

    for (let index = 0; index < passageiros.length; index++) {
      const passageiro = passageiros[index];

      // Ignora slots vazios
      const temDados = passageiro && (
        passageiro.nome || passageiro.nomeCompleto ||
        passageiro.firstName || passageiro.primeiroNome ||
        passageiro.cpf || passageiro.dataNascimento || passageiro.birthDate
      );
      if (!temDados) continue;

      await ensurePassengerCardActive(index);

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

      console.log(`${OCRDBG}[Azul] P${index + 1} payload`, {
        primeiroNome,
        sobrenome,
        cpf,
        dataNascimento,
        genero,
        nacionalidade
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

      // Alguns campos (principalmente do 1o passageiro) podem re-renderizar após CPF/data.
      await delay(450);

      // ── React-Selects (sequenciais para evitar conflito de menus) ──
      const campoNacionalidade = findField('nationalityGroup', index);
      if (campoNacionalidade) {
        await setReactSelectValueWithRetry(campoNacionalidade, nacionalidade);
        await delay(150);
      } else {
        console.warn(`${OCRDBG}[Azul] P${index + 1} nationalityGroup não encontrado`);
      }

      // Só preenche gênero se o valor vier explícito
      if (genero) {
        const campoGenero = findField('genderGroup', index);
        if (campoGenero) {
          await setReactSelectValueWithRetry(campoGenero, genero);
          await delay(150);
        } else {
          console.warn(`${OCRDBG}[Azul] P${index + 1} genderGroup não encontrado`);
        }
      }

      // A Azul pode re-renderizar o card após validações assíncronas (ex.: CPF 403),
      // limpando selects; revalida e reaplica uma vez após estabilização.
      await delay(900);
      await ensurePassengerCardActive(index);

      const campoNacionalidadeFinal = findField('nationalityGroup', index);
      if (campoNacionalidadeFinal && !isExpectedSelectValue(campoNacionalidadeFinal, nacionalidade)) {
        await setReactSelectValueWithRetry(campoNacionalidadeFinal, nacionalidade, 2);
      }

      console.log(`${OCRDBG}[Azul] P${index + 1} final`, {
        nacionalidadeAtual: campoNacionalidadeFinal ? getSelectedReactSelectText(campoNacionalidadeFinal) : '(nao-encontrado)'
      });

      if (genero) {
        const campoGeneroFinal = findField('genderGroup', index);
        if (campoGeneroFinal && !isExpectedSelectValue(campoGeneroFinal, genero)) {
          await setReactSelectValueWithRetry(campoGeneroFinal, genero, 2);
        }

        console.log(`${OCRDBG}[Azul] P${index + 1} final`, {
          generoAtual: campoGeneroFinal ? getSelectedReactSelectText(campoGeneroFinal) : '(nao-encontrado)'
        });
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