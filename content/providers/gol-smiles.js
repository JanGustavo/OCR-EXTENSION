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
    nacionalidade: 'select[name*="nationality"], input[name*="nationality"], [data-testid*="nationality"], [id*="nationality"], [name*="country"]',
    email: 'input[name="contact.email"]',
    telefone: 'input[id="phone-input-contact.phone"]'
  };

  function supports(hostname) {
    return hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br');
  }

  async function injectSmiles(passageiros, utils) {
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
        genero: String(p.genero || p.gender || p.sexo || '').trim()
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

    const waitForElements = async (selectorList, minCount = 1, timeoutMs = 8000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const elements = getElements(selectorList);
        if (elements.length >= minCount) return elements;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return getElements(selectorList);
    };

    const passageirosNormalizados = passageirosValidos.map(normalizePassenger);

    const normalizarGeneroSmiles = (genero) => {
      const g = String(genero || '').trim().toLowerCase();
      if (!g) return '';
      if (g === 'female' || g === 'f' || g.startsWith('fem') || g.includes('mulher')) return 'Feminino';
      if (g === 'male' || g === 'm' || g.startsWith('masc') || g.includes('homem')) return 'Masculino';
      if (g.startsWith('f')) return 'Feminino';
      if (g.startsWith('m')) return 'Masculino';
      return g.charAt(0).toUpperCase() + g.slice(1);
    };

    const getDropdownSelectedText = (input) => {
      if (!input) return '';

      const dropdown = input.closest('.dropdown');
      const toggle = input.closest('.dropdown-toggle') || input.parentElement || input;
      const rawText = String(
        dropdown?.textContent || toggle?.textContent || input?.value || ''
      ).replace(/\s+/g, ' ').trim();

      if (!rawText) return '';
      if (/selecione/i.test(rawText)) return '';
      return rawText;
    };

    const waitForDropdownSelection = async (input, expectedValue, timeoutMs = 2500) => {
      const expected = String(expectedValue || '').trim().toLowerCase();
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        const current = getDropdownSelectedText(input).toLowerCase();
        const currentInputValue = String(input?.value || '').trim().toLowerCase();
        if (
          (current && (current.includes(expected) || expected.includes(current))) ||
          (currentInputValue && (currentInputValue.includes(expected) || expected.includes(currentInputValue)))
        ) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      return false;
    };

    const findPassengerScopedGenderInput = (index) => {
      const globalCandidates = getElements('input[id="dropdown-input-personalData.gender"]');
      const anchor = allFieldElements.nome[index]
        || allFieldElements.sobrenome[index]
        || allFieldElements.cpf[index]
        || allFieldElements.dataNascimento[index]
        || null;

      if (anchor) {
        let current = anchor.parentElement;
        while (current && current !== document.body) {
          const scopedCandidates = Array.from(current.querySelectorAll('input[id="dropdown-input-personalData.gender"]'));
          if (scopedCandidates.length === 1) {
            return scopedCandidates[0];
          }

          if (scopedCandidates.length > 1) {
            const byPlaceholder = scopedCandidates.find((input) => /gênero|genero/i.test(String(input.placeholder || input.getAttribute('aria-label') || '')));
            if (byPlaceholder) return byPlaceholder;
            return scopedCandidates[0];
          }

          current = current.parentElement;
        }
      }

      return globalCandidates[index] || globalCandidates[0] || null;
    };

    const reaplicarGeneroSeNecessario = async (input, generoStr, index) => {
      if (!input || !generoStr) return false;

      const atual = String(input.value || '').trim().toLowerCase();
      const esperado = String(generoStr).trim().toLowerCase();
      if (atual && (atual.includes(esperado) || esperado.includes(atual))) {
        return true;
      }

      const dropdown = input.closest('.dropdown');
      const toggle = input.closest('.dropdown-toggle') || input.parentElement || input;
      const optionId = `opt_${generoStr}`;

      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 400 : 250));

      let option = dropdown
        ? dropdown.querySelector(`#${optionId} button, li#${optionId} button`)
        : null;

      if (!option) {
        option = document.querySelector(`#${optionId} button, li#${optionId} button`);
      }

      if (!option) {
        option = Array.from(document.querySelectorAll('.dropdown-menu li button, li[id^="opt_"] button, [role="option"]'))
          .find((btn) => String(btn.textContent || '').trim().toLowerCase() === esperado);
      }

      if (option) {
        option.click();
        return waitForDropdownSelection(input, generoStr, index === 0 ? 3500 : 2000);
      }

      input.value = generoStr;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return waitForDropdownSelection(input, generoStr, 1500);
    };

    const allFieldElements = {
      nome: await waitForElements(selectors.nome, 1, 8000),
      sobrenome: await waitForElements(selectors.sobrenome, 1, 8000),
      cpf: await waitForElements(selectors.cpf, 1, 8000),
      dataNascimento: await waitForElements(selectors.dataNascimento, 1, 8000),
      nacionalidade: await waitForElements(selectors.nacionalidade, 0, 2000),
      email: await waitForElements(selectors.email, 0, 2000),
      telefone: await waitForElements(selectors.telefone, 0, 2000)
    };

    let totalPreenchidos = 0;

    for (const [index, dados] of passageirosNormalizados.entries()) {
      Object.entries(allFieldElements).forEach(([campo, elementos]) => {
        const valor = dados[campo];
        if (!valor) return;

        const alvo = elementos[index] || null;
        if (!alvo) return;

        if (setFieldValue(alvo, valor)) totalPreenchidos += 1;
      });
    }

    // Dropdown customizado de gênero na Smiles (quando existir)
    for (const [index, dados] of passageirosNormalizados.entries()) {
      if (!dados.genero) continue;

      const generoStr = normalizarGeneroSmiles(dados.genero);
      if (!generoStr) continue;

      const input = findPassengerScopedGenderInput(index);
      if (!input) {
        console.warn(`⚠️ [OCR-SMILES] Campo de gênero não encontrado para passageiro ${index + 1}.`);
        continue;
      }

      const dropdown = input.closest('.dropdown');
      const toggle = input.closest('.dropdown-toggle') || input;

      try {
        const attempts = index === 0 ? 4 : 3;

        for (let attempt = 1; attempt <= attempts; attempt++) {
          if (index === 0) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }

          toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          toggle.click();
          await new Promise((resolve) => setTimeout(resolve, index === 0 ? 300 : 180));

          const optionId = `opt_${generoStr}`;
          let option = dropdown
            ? dropdown.querySelector(`#${optionId} button, li#${optionId} button`)
            : null;

          if (!option) {
            option = document.querySelector(`#${optionId} button, li#${optionId} button`);
          }

          if (!option) {
            option = Array.from(document.querySelectorAll('.dropdown-menu li button, li[id^="opt_"] button, [role="option"]'))
              .find((btn) => String(btn.textContent || '').trim().toLowerCase() === generoStr.toLowerCase());
          }

          if (option) {
            option.click();
            const ok = await waitForDropdownSelection(input, generoStr, index === 0 ? 3500 : 2000);
            if (ok) {
              totalPreenchidos += 1;
              console.log(`✈️ [OCR-SMILES] Gênero "${generoStr}" selecionado para passageiro ${index + 1}.`);
              break;
            }

            console.warn(`⚠️ [OCR-SMILES] Gênero não estabilizou após clique para passageiro ${index + 1} (tentativa ${attempt}).`);
          }

          if (attempt === attempts) {
            // Fallback: escreve no input readonly e dispara eventos
            input.value = generoStr;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            const ok = await waitForDropdownSelection(input, generoStr, 1500);
            if (ok) {
              totalPreenchidos += 1;
              console.log(`✈️ [OCR-SMILES] Gênero "${generoStr}" aplicado via fallback para passageiro ${index + 1}.`);
            } else {
              console.warn(`⚠️ [OCR-SMILES] Opção de gênero não estabilizou; fallback aplicado em input para passageiro ${index + 1}.`);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [OCR-SMILES] Falha ao selecionar gênero do passageiro ${index + 1}:`, error);
      }
    }

    // Nacionalidade, quando existir na etapa de infos adicionais.
    const nacionalidadeElements = allFieldElements.nacionalidade || [];
    for (const [index, dados] of passageirosNormalizados.entries()) {
      const nacionalidade = String(dados.nacionalidade || 'Brasil').trim();
      if (!nacionalidade) continue;

      const alvo = nacionalidadeElements[index] || nacionalidadeElements[0] || null;
      if (!alvo) continue;

      if (setFieldValue(alvo, nacionalidade)) {
        totalPreenchidos += 1;
        console.log(`✈️ [OCR-SMILES] Nacionalidade "${nacionalidade}" preenchida para passageiro ${index + 1}.`);
      }
    }

    // Passada final de estabilização: a Smiles costuma re-renderizar o card do primeiro passageiro
    // depois das interações subsequentes. Reaplicamos apenas o que ainda não estiver visível.
    await new Promise((resolve) => setTimeout(resolve, 700));
    for (const [index, dados] of passageirosNormalizados.entries()) {
      if (!dados.genero) continue;

      const generoStr = normalizarGeneroSmiles(dados.genero);
      if (!generoStr) continue;

      const input = findPassengerScopedGenderInput(index);
      if (!input) continue;

      const ok = await reaplicarGeneroSeNecessario(input, generoStr, index);
      if (ok) {
        console.log(`✈️ [OCR-SMILES] Gênero estabilizado para passageiro ${index + 1}.`);
      } else {
        console.warn(`⚠️ [OCR-SMILES] Gênero ainda não estabilizou para passageiro ${index + 1}.`);
      }
    }

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