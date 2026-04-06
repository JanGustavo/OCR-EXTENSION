/**
 * Provider LATAM
 *
 * Estratégia de injeção específica para domínios da LATAM.
 */
(function registerLatamProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  // Seletores atualizados - deixamos o Gênero mais flexível (sem forçar tag select)
  const selectors = {
    nome: 'input[name="passengerDetails.firstName"], input[id*="firstName"]',
    sobrenome: 'input[name="passengerDetails.lastName"], input[id*="lastName"]',
    dataNascimento: 'input[id*="dateOfBirth"]',
    cpf: 'input[name="taxDocument.documentNumber"], input[id*="taxDocument-documentNumber"]',
    documento: 'input[name="documentInfo.documentNumber"], input[id*="documentInfo-documentNumber"]',
    email: 'input[name="passengerInfo.emails"], input[id*="emails"]',
    telefone: 'input[name="passengerInfo.phones[0].number"]',
    // Retirada a tag "select" para cobrir tanto Selects Nativos quanto Inputs escondidos pelo Material-UI
    genero: '[name="passengerInfo.gender"], [id^="passengerInfo-gender-ADT_"], [id*="passengerInfo-gender"], [data-testid*="gender"]',
    nacionalidade: 'select[name="documentInfo.nationality"]'
  };

  function supports(hostname) {
    return hostname.includes('latam.com') || hostname.includes('latamairlines.com');
  }

  function injectLatam(passageiros, utils) {
    console.log('✈️ [OCR-LATAM] Módulo ativado!');
    
    const passageirosValidos = (Array.isArray(passageiros) ? passageiros : [])
      .filter((p) => p && (p.nome || p.nomeCompleto || p.primeiroNome || p.firstName || p.cpf || p.dataNascimento || p.birthDate));

    if (!passageirosValidos.length) {
      console.warn('⚠️ [OCR-LATAM] Operação abortada: Nenhum dado válido encontrado para injeção.');
      return;
    }

    const normalizePassengerName = (p) => {
      const nomeCompleto = String(p.nomeCompleto || p.nome || '').trim();

      if (p.primeiroNome || p.firstName || p.sobrenome || p.lastName) {
        return {
          primeiroNome: String(p.primeiroNome || p.firstName || '').trim(),
          sobrenome: String(p.sobrenome || p.lastName || '').trim()
        };
      }

      if (!nomeCompleto) {
        return { primeiroNome: '', sobrenome: '' };
      }

      const partes = nomeCompleto.split(/\s+/).filter(Boolean);
      if (partes.length === 1) {
        return { primeiroNome: partes[0], sobrenome: '' };
      }

      return {
        primeiroNome: partes.slice(0, -1).join(' '),
        sobrenome: partes[partes.length - 1]
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

      if (el.tagName === 'SELECT') {
        const normalized = String(value).trim().toLowerCase();
        const genderMap = {
          feminino: ['feminino', 'f', 'female', 'woman', 'mulher', 'fem'],
          masculino: ['masculino', 'm', 'male', 'man', 'homem', 'masc']
        };

        let option = Array.from(el.options || []).find((opt) => {
          const optValue = String(opt.value || '').trim().toLowerCase();
          const optText = String(opt.textContent || '').trim().toLowerCase();
          return optValue === normalized || optText === normalized || optText.includes(normalized) || normalized.includes(optText);
        });

        if (!option && el.name === 'passengerInfo.gender') {
          const mappedKey = Object.keys(genderMap).find((key) => genderMap[key].includes(normalized));
          const mappedValue = mappedKey === 'feminino' ? 'FEMALE' : mappedKey === 'masculino' ? 'MALE' : '';

          if (mappedValue) {
            option = Array.from(el.options || []).find((opt) => String(opt.value || '').trim().toUpperCase() === mappedValue);
          }
        }

        const finalValue = option ? option.value : value;

        const nativeSelectSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value'
        )?.set;

        if (nativeSelectSetter) {
          nativeSelectSetter.call(el, finalValue);
        } else {
          el.value = finalValue;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      // Se for input oculto do MUI em vez de Select
      return utils.fillField(el, value);
    };

    const camposPorPassageiro = passageirosValidos.map((p) => {
      const nomePartes = normalizePassengerName(p);
      const genero = String(p.genero || p.gender || '').trim();

      const generoNormalizado = (() => {
        const lower = genero.toLowerCase();
        if (!lower) return '';
        if (lower.startsWith('f') || lower.includes('female') || lower.includes('fem') || lower.includes('woman')) return 'FEMALE';
        if (lower.startsWith('m') || lower.includes('male') || lower.includes('masc') || lower.includes('man')) return 'MALE';
        return genero;
      })();

      return {
        nome: nomePartes.primeiroNome,
        sobrenome: nomePartes.sobrenome,
        dataNascimento: String(p.dataNascimento || p.birthDate || '').trim(),
        cpf: String(p.cpf || '').trim(),
        documento: String(p.documento || p.cpf || '').trim(),
        email: String(p.email || '').trim(),
        telefone: String(p.telefone || '').trim(),
        genero: generoNormalizado,
        nacionalidade: String(p.nacionalidade || p.nationality || '').trim()
      };
    });

    const allFieldElements = {
      nome: getElements(selectors.nome),
      sobrenome: getElements(selectors.sobrenome),
      dataNascimento: getElements(selectors.dataNascimento),
      cpf: getElements(selectors.cpf),
      documento: getElements(selectors.documento),
      email: getElements(selectors.email),
      telefone: getElements(selectors.telefone),
      genero: getElements(selectors.genero),
      nacionalidade: getElements(selectors.nacionalidade)
    };

    // AUMENTAMOS AS TENTATIVAS PARA 15 VEZES COM INTERVALO DE 600ms (Dá 9 segundos de paciência)
    const preencherGeneroComRetry = (dados, index, tentativasRestantes = 15) => {
      const selectsGenero = getElements(selectors.genero);
      const alvo = selectsGenero[index] || selectsGenero[0] || null;

      if (!alvo) {
        if (tentativasRestantes <= 0) {
          console.warn(`⚠️ [OCR-LATAM] Desistindo: Campo de gênero não carregou na tela após 9 segundos.`);
          return;
        }

        console.log(`⏳ Aguardando React carregar o campo de Gênero... (${tentativasRestantes} tentativas restantes)`);
        setTimeout(() => preencherGeneroComRetry(dados, index, tentativasRestantes - 1), 600);
        return;
      }

      if (setFieldValue(alvo, dados.genero)) {
        console.log(`✅ [OCR-LATAM] Gênero preenchido com sucesso após carregamento dinâmico!`);
      }
    };

    let totalPreenchidos = 0;

    camposPorPassageiro.forEach((dados, index) => {
      Object.entries(dados).forEach(([campo, valor]) => {
        if (!valor) return;

        if (campo === 'genero') {
          const list = allFieldElements[campo] || [];
          const alvo = list[index] || list[0] || null;

          if (!alvo) {
            // Dispara o observador para aguardar o elemento nascer na tela
            preencherGeneroComRetry(dados, index);
            return;
          }
        }

        const list = allFieldElements[campo] || [];
        const alvo = list[index] || null;
        if (!alvo) return;

        if (setFieldValue(alvo, valor)) totalPreenchidos += 1;
      });
    });

    if (totalPreenchidos === 0) {
      utils.fillForm(passageirosValidos[0], selectors, 'latam');
      return;
    }

    if (typeof utils.highlightFilledFields === 'function') {
      utils.highlightFilledFields();
    }
  }

  global.OCRProviders.latam = {
    id: 'latam',
    supports,
    selectors,
    inject: injectLatam
  };
})(window);