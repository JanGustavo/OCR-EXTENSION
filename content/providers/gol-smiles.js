/**
 * Provider GOL / SMILES
 */
(function registerSmilesProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  const selectors = {
    nome: 'input[name="personalData.firstName"], [data-testid="text-input-personalData.firstName"]',
    sobrenome: 'input[name="personalData.lastName"], [data-testid="text-input-personalData.lastName"]',
    cpf: 'input[name="personalData.federalId"], [data-testid="text-input-personalData.federalId"]',
    dataNascimento: 'input[name="personalData.birthDate"], [data-testid="date-input-personalData.birthDate"]',
    email: 'input[name="contact.email"]',
    telefone: 'input[id="phone-input-contact.phone"]'
  };

  function supports(hostname) {
    return hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br');
  }

  function injectSmiles(passageiros, utils) {
    console.log('✈️ [OCR-SMILES] Módulo ativado!');

    const passageirosValidos = (Array.isArray(passageiros) ? passageiros : [])
      .filter((p) => p && (p.nome || p.nomeCompleto || p.primeiroNome || p.firstName || p.cpf || p.dataNascimento || p.birthDate));

    if (!passageirosValidos.length) {
      console.warn('⚠️ [OCR-SMILES] Operação abortada: Nenhum dado válido encontrado para injeção.');
      return;
    }

    console.log('✈️ [OCR-SMILES] Iniciando preenchimento...');

    const splitNome = (nomeCompleto) => {
      const raw = String(nomeCompleto || '').trim();
      if (!raw) return { primeiroNome: '', sobrenome: '' };

      const partes = raw.split(/\s+/).filter(Boolean);
      if (partes.length === 1) return { primeiroNome: partes[0], sobrenome: '' };

      return {
        primeiroNome: partes.slice(0, -1).join(' '),
        sobrenome: partes[partes.length - 1]
      };
    };

    const normalizePassenger = (p) => {
      const nomeCompleto = String(p.nomeCompleto || p.nome || '').trim();
      const split = splitNome(nomeCompleto);
      return {
        nome: String(p.primeiroNome || p.firstName || split.primeiroNome || '').trim(),
        sobrenome: String(p.sobrenome || p.lastName || split.sobrenome || '').trim(),
        cpf: String(p.cpf || '').trim(),
        dataNascimento: String(p.dataNascimento || p.birthDate || '').trim(),
        email: String(p.email || '').trim(),
        telefone: String(p.telefone || '').trim(),
        genero: String(p.genero || p.gender || '').trim()
      };
    };

    const getElements = (selectorList) => {
      if (!selectorList) return [];

      const unique = new Set();
      selectorList
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => unique.add(el));
        });

      return Array.from(unique);
    };

    const setFieldValue = (el, value) => {
      if (!el || value == null || value === '') return false;
      return utils.fillField(el, value);
    };

    const passageirosNormalizados = passageirosValidos.map(normalizePassenger);

    const normalizarGeneroSmiles = (genero) => {
      const g = String(genero || '').trim().toLowerCase();
      if (!g) return '';
      if (g.startsWith('f')) return 'Feminino';
      if (g.startsWith('m')) return 'Masculino';
      return g.charAt(0).toUpperCase() + g.slice(1);
    };

    const allFieldElements = {
      nome: getElements(selectors.nome),
      sobrenome: getElements(selectors.sobrenome),
      cpf: getElements(selectors.cpf),
      dataNascimento: getElements(selectors.dataNascimento),
      email: getElements(selectors.email),
      telefone: getElements(selectors.telefone)
    };

    let totalPreenchidos = 0;

    passageirosNormalizados.forEach((dados, index) => {
      Object.entries(allFieldElements).forEach(([campo, elementos]) => {
        const valor = dados[campo];
        if (!valor) return;

        const alvo = elementos[index] || null;
        if (!alvo) return;

        if (setFieldValue(alvo, valor)) totalPreenchidos += 1;
      });
    });

    // Dropdown customizado de gênero na Smiles (quando existir)
    const dropdownInputs = Array.from(document.querySelectorAll('input[id="dropdown-input-personalData.gender"]'));
    passageirosNormalizados.forEach((dados, index) => {
      if (!dados.genero) return;

      const generoStr = normalizarGeneroSmiles(dados.genero);
      if (!generoStr) return;

      const input = dropdownInputs[index] || null;
      if (!input) return;

      const dropdown = input.closest('.dropdown');
      const toggle = input.closest('.dropdown-toggle') || input;

      setTimeout(() => {
        toggle.click();

        setTimeout(() => {
          const optionId = `opt_${generoStr}`;

          const localOptionButton = dropdown
            ? dropdown.querySelector(`#${optionId} button, li#${optionId} button`)
            : null;

          const globalOptionButton = document.querySelector(`#${optionId} button, li#${optionId} button`);

          const byTextOption = Array.from(document.querySelectorAll('.dropdown-menu li button, li[id^="opt_"] button, [role="option"]'))
            .find((btn) => btn.textContent?.trim().toLowerCase() === generoStr.toLowerCase());

          const option = localOptionButton || globalOptionButton || byTextOption || null;

          if (option) {
            option.click();
            totalPreenchidos += 1;
            console.log(`✈️ [OCR-SMILES] Gênero "${generoStr}" selecionado para passageiro ${index + 1}.`);
            return;
          }

          // Fallback: escreve no input readonly e dispara eventos
          input.value = generoStr;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          totalPreenchidos += 1;
          console.warn(`⚠️ [OCR-SMILES] Opção de gênero não encontrada; fallback aplicado em input para passageiro ${index + 1}.`);
        }, 120);
      }, 120 * (index + 1));
    });

    if (totalPreenchidos === 0) {
      console.warn('⚠️ [OCR-SMILES] Nenhum campo foi preenchido por índice. Tentando fallback no primeiro passageiro...');
      utils.fillForm(passageirosValidos[0], selectors, 'smiles');
      return;
    }

    console.log(`✈️ [OCR-SMILES] Preenchimento concluído. Campos preenchidos: ${totalPreenchidos}.`);
    if (typeof utils.highlightFilledFields === 'function') {
      utils.highlightFilledFields();
    }
  }

  global.OCRProviders.smiles = {
    id: 'smiles',
    supports,
    selectors,
    inject: injectSmiles
  };
})(window);