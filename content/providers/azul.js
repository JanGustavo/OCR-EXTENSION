/**
 * Provider Azul
 *
 * Versão hardcoded para a página de viajantes da Azul baseada no HTML capturado.
 */
(function registerAzulProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  function supports(hostname) {
    return hostname.includes('azul.com.br') || hostname.includes('voeazul.com.br');
  }

  function splitNome(passageiro) {
    const nomeCompleto = String(
      passageiro.nome ||
      passageiro.nomeCompleto ||
      `${passageiro.firstName || passageiro.primeiroNome || ''} ${passageiro.lastName || passageiro.sobrenome || ''}`
    ).trim();

    if (!nomeCompleto) {
      return {
        primeiroNome: String(passageiro.firstName || passageiro.primeiroNome || '').trim(),
        sobrenome: String(passageiro.lastName || passageiro.sobrenome || '').trim()
      };
    }

    const partes = nomeCompleto.split(/\s+/).filter(Boolean);
    if (partes.length === 1) {
      return { primeiroNome: partes[0], sobrenome: partes[0] };
    }

    return {
      primeiroNome: partes[0],
      sobrenome: partes.slice(1).join(' ')
    };
  }

  function normalizeBirthDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    const br = raw.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}`;

    return raw.replace(/[-.]/g, '/');
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findField(root, fieldType, index) {
    const selectors = {
      firstName: `[data-test-id="passenger-identification-firstname-${index}"]`,
      lastName: `[data-test-id="passenger-identification-lastname-${index}"]`,
      cpf: `[data-test-id="passenger-identification-cpf-or-tudoazul-${index}"]`,
      birthDate: `[data-test-id="passenger-identification-birthday-${index}"]`,
      nationalityGroup: `[data-test-id="passenger-identification-nationality-${index}"]`,
      genderGroup: `[data-test-id="passenger-identification-gender-${index}"]`
    };

    return root.querySelector(selectors[fieldType]) || null;
  }

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

    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  async function setReactValueWithRetry(inputElement, value) {
    const ok = setReactValue(inputElement, value);
    if (!ok || !inputElement) return ok;

    await delay(80);
    if (!String(inputElement.value || '').trim() && String(value || '').trim()) {
      setReactValue(inputElement, value);
    }

    return true;
  }

  function normalizeOptionText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  async function setReactSelectValue(groupEl, targetValue) {
    if (!groupEl || !targetValue) return false;

    const control = groupEl.querySelector('.react-select__control');
    const input = groupEl.querySelector('input[aria-autocomplete="list"], input[aria-label*="Editar"]');

    if (!control || !input) return false;

    const desired = normalizeOptionText(targetValue);

    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    control.click();
    await delay(120);

    const options = Array.from(document.querySelectorAll('.react-select__option, [id*="react-select"][id*="option"]'));
    const match = options.find((opt) => normalizeOptionText(opt.textContent).includes(desired));

    if (match) {
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      match.click();
      return true;
    }

    setReactValue(input, targetValue);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    return true;
  }

  async function injetarAzul(passageiros, helpers) {
    const { highlightFilledFields } = helpers;
    const pending = [];

    for (let attempt = 0; attempt < 4; attempt++) {
      let encontrouAlgumCampo = false;

      passageiros.forEach((passageiro, index) => {
        if (!passageiro || (!passageiro.nome && !passageiro.firstName && !passageiro.cpf && !passageiro.dataNascimento && !passageiro.birthDate)) {
          return;
        }

        const siteIndex = index + 1;
        const root = document;

        const campoNome = findField(root, 'firstName', siteIndex);
        const campoSobrenome = findField(root, 'lastName', siteIndex);
        const campoCpf = findField(root, 'cpf', siteIndex);
        const campoData = findField(root, 'birthDate', siteIndex);
        const campoNacionalidade = findField(root, 'nationalityGroup', siteIndex);
        const campoGenero = findField(root, 'genderGroup', siteIndex);

        const { primeiroNome, sobrenome } = splitNome(passageiro);
        const cpfLimpo = String(passageiro.cpf || '').replace(/\D/g, '');
        const dataNascimento = normalizeBirthDate(passageiro.dataNascimento || passageiro.birthDate || '');
        const nacionalidade = String(passageiro.nacionalidade || passageiro.nationality || 'Brasileira').trim();
        const genero = String(passageiro.genero || passageiro.gender || '').trim();

        if (campoNome) {
          encontrouAlgumCampo = true;
          pending.push(setReactValueWithRetry(campoNome, primeiroNome));
        }

        if (campoSobrenome) {
          encontrouAlgumCampo = true;
          pending.push(setReactValueWithRetry(campoSobrenome, sobrenome));
        }

        if (campoCpf) {
          encontrouAlgumCampo = true;
          pending.push(setReactValueWithRetry(campoCpf, cpfLimpo));
        }

        if (campoData) {
          encontrouAlgumCampo = true;
          pending.push(setReactValueWithRetry(campoData, dataNascimento));
        }

        if (campoNacionalidade) {
          encontrouAlgumCampo = true;
          pending.push(setReactSelectValue(campoNacionalidade, nacionalidade));
        }

        if (campoGenero && genero) {
          encontrouAlgumCampo = true;
          pending.push(setReactSelectValue(campoGenero, genero));
        }
      });

      if (encontrouAlgumCampo) {
        break;
      }

      await delay(250);
    }

    await Promise.allSettled(pending);
    highlightFilledFields();
  }

  global.OCRProviders.azul = {
    id: 'azul',
    supports,
    inject: injetarAzul
  };
})(window);
