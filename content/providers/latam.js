/**
 * Provider LATAM
 *
 * Estratégia de injeção específica para domínios da LATAM.
 */
(function registerLatamProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  // Seletores atualizados com precisão baseada no HTML oficial da LATAM
  const selectors = {
    nome: 'input[name="passengerDetails.firstName"], input[id*="firstName"]',
    sobrenome: 'input[name="passengerDetails.lastName"], input[id*="lastName"]',
    dataNascimento: 'input[id*="dateOfBirth"]',
    cpf: 'input[name="taxDocument.documentNumber"], input[id*="taxDocument-documentNumber"]',
    documento: 'input[name="documentInfo.documentNumber"], input[id*="documentInfo-documentNumber"]',
    email: 'input[name="passengerInfo.emails"], input[id*="emails"]',
    telefone: 'input[name="passengerInfo.phones[0].number"]',
    genero: 'select[name="passengerInfo.gender"]',
    nacionalidade: 'select[name="documentInfo.nationality"]'
  };

  function supports(hostname) {
    return hostname.includes('latam.com') || hostname.includes('latamairlines.com');
  }

  // AGORA SIM: Recebe os dados e as funções do injector.js
  function injectLatam(passageiros, utils) {
    console.log('✈️ [OCR-LATAM] Módulo ativado!');
    console.log('✈️ [OCR-LATAM] Dados brutos recebidos da extensão:', passageiros);

    // Pega o primeiro passageiro válido do array
    const passageiro = passageiros.find(p => p && (p.nome || p.primeiroNome || p.cpf || p.dataNascimento));
    
    if (!passageiro) {
      console.warn('⚠️ [OCR-LATAM] Operação abortada: Nenhum dado válido encontrado para injeção.');
      return;
    }

    console.log('✈️ [OCR-LATAM] Iniciando preenchimento com os seletores da LATAM...');
    console.log('✈️ [OCR-LATAM] Mapeamento de seletores que será buscado:', selectors);

    // Usa a função "fillForm" do injector.js, passando os seletores da Latam
    utils.fillForm(passageiro, selectors, 'latam');
  }

  global.OCRProviders.latam = {
    id: 'latam',
    supports,
    selectors,
    inject: injectLatam
  };
})(window);