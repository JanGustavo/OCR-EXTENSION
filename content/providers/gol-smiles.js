/**
 * Provider GOL / SMILES — Versão Minimalista Ortogonal
 *
 * Filosofia: Preencher e sair. Não interferir com o funcionamento do site.
 * - Sem loops de re-aplicação
 * - Sem esperas por estabilização
 * - Apenas preenchimento direto via utils.fillField
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
    telefone: 'input[id="phone-input-contact.phone"]',
    genero: 'input[id="dropdown-input-personalData.gender"], input[name*="gender"], input[id*="gender"]'
  };

  function supports(hostname) {
    return hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br');
  }

  async function injectSmiles(passageiros, utils) {
    console.log('✈️ [OCR-SMILES] Módulo ativado!');

    const passageirosValidos = (Array.isArray(passageiros) ? passageiros : [])
      .filter((p) => p && (p.nome || p.nomeCompleto || p.primeiroNome || p.firstName || p.cpf || p.dataNascimento || p.birthDate));

    if (!passageirosValidos.length) {
      console.warn('⚠️ [OCR-SMILES] Nenhum passageiro válido.');
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
        genero: String(p.genero || p.gender || p.sexo || '').trim(),
        nacionalidade: String(p.nacionalidade || p.nationality || 'Brasil').trim()
      };
    };

    const normalizeGender = (genero) => {
      const g = String(genero || '').trim().toLowerCase();
      if (!g) return '';
      if (g === 'female' || g === 'f' || g.startsWith('fem')) return 'Feminino';
      if (g === 'male' || g === 'm' || g.startsWith('masc')) return 'Masculino';
      return genero.charAt(0).toUpperCase() + genero.slice(1);
    };

    const getElements = (selectorList) => {
      const unique = new Set();
      String(selectorList || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((selector) => {
          try {
            document.querySelectorAll(selector).forEach((el) => unique.add(el));
          } catch (e) {}
        });
      return Array.from(unique);
    };

    // Preenche campos de texto: nome, sobrenome, cpf, data, email, telefone
    const fieldConfigs = [
      { field: 'nome', selector: selectors.nome },
      { field: 'sobrenome', selector: selectors.sobrenome },
      { field: 'cpf', selector: selectors.cpf },
      { field: 'dataNascimento', selector: selectors.dataNascimento },
      { field: 'email', selector: selectors.email },
      { field: 'telefone', selector: selectors.telefone }
    ];

    let totalPreenchidos = 0;

    for (const fieldConfig of fieldConfigs) {
      const elements = getElements(fieldConfig.selector);
      if (!elements.length) continue;

      for (const [index, dados] of passageirosValidos.entries()) {
        const valor = normalizePassenger(dados)[fieldConfig.field];
        if (!valor) continue;

        const el = elements[index] || null;
        if (!el) continue;

        try {
          if (utils.fillField(el, valor)) {
            totalPreenchidos += 1;
          }
        } catch (e) {
          console.warn(`⚠️ [OCR-SMILES] Erro ao preencher ${fieldConfig.field}:`, e);
        }
      }
    }

    // Preenche gênero: precisa manipular dropdown customizado (não é input simples)
    const genderInputs = getElements(selectors.genero);
    for (const [index, dados] of passageirosValidos.entries()) {
      const generoNorm = normalizePassenger(dados).genero;
      if (!generoNorm) continue;

      const generoStr = normalizeGender(generoNorm);
      if (!generoStr) continue;

      const input = genderInputs[index] || null;
      if (!input) continue;

      try {
        // Campo é readonly, precisa manipular o dropdown
        const dropdown = input.closest('.dropdown');
        if (dropdown) {
          // Abre o dropdown
          const toggle = dropdown.querySelector('.dropdown-toggle') || input;
          toggle?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          toggle?.click();
          
          // Aguarda menu aparecer
          await new Promise((resolve) => setTimeout(resolve, 200));

          // Procura a opção
          const optionId = `opt_${generoStr}`;
          let option = dropdown.querySelector(`#${optionId} button, li#${optionId} button`);
          
          if (!option) {
            // Fallback: procura por texto
            const menu = dropdown.querySelector('.dropdown-menu');
            if (menu) {
              const buttons = Array.from(menu.querySelectorAll('button, li button'));
              option = buttons.find((btn) => 
                String(btn.textContent || '').trim().toLowerCase() === generoStr.toLowerCase()
              );
            }
          }

          if (option) {
            option.click();
            console.log(`✈️ [OCR-SMILES] Gênero "${generoStr}" selecionado para passageiro ${index + 1}.`);
            totalPreenchidos += 1;
          } else {
            console.warn(`⚠️ [OCR-SMILES] Opção de gênero não encontrada para P${index + 1}`);
          }
        } else {
          // Fallback: tenta fillField direto
          if (utils.fillField(input, generoStr)) {
            console.log(`✈️ [OCR-SMILES] Gênero "${generoStr}" preenchido para passageiro ${index + 1}.`);
            totalPreenchidos += 1;
          }
        }
      } catch (e) {
        console.warn(`⚠️ [OCR-SMILES] Erro ao preencher gênero P${index + 1}:`, e);
      }
    }

    // Preenche nacionalidade
    const nacionalidadeElements = getElements(selectors.nacionalidade);
    for (const [index, dados] of passageirosValidos.entries()) {
      const nacionalidade = normalizePassenger(dados).nacionalidade;
      if (!nacionalidade) continue;

      const el = nacionalidadeElements[index] || nacionalidadeElements[0] || null;
      if (!el) continue;

      try {
        if (utils.fillField(el, nacionalidade)) {
          totalPreenchidos += 1;
        }
      } catch (e) {
        console.warn(`⚠️ [OCR-SMILES] Erro ao preencher nacionalidade:`, e);
      }
    }

    if (totalPreenchidos === 0) {
      console.warn('⚠️ [OCR-SMILES] Nenhum campo preenchido. Tentando fallback...');
      utils.fillForm(passageirosValidos[0], selectors, 'smiles');
      return;
    }

    console.log(`✈️ [OCR-SMILES] Concluído. ${totalPreenchidos} campo(s) preenchido(s).`);
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