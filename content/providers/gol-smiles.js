/**
 * Provider GOL / SMILES
 */
(function registerSmilesProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  // Seletores exatos extraídos da página da Smiles
  const selectors = {
    nome: 'input[name="personalData.firstName"], [data-testid="text-input-personalData.firstName"]',
    sobrenome: 'input[name="personalData.lastName"], [data-testid="text-input-personalData.lastName"]',
    cpf: 'input[name="personalData.federalId"], [data-testid="text-input-personalData.federalId"]',
    dataNascimento: 'input[name="personalData.birthDate"], [data-testid="date-input-personalData.birthDate"]',
    
    // Campos extra caso no futuro decida preencher automaticamente
    email: 'input[name="contact.email"]',
    telefone: 'input[id="phone-input-contact.phone"]'
  };

  function supports(hostname) {
    return hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br');
  }

  function injectSmiles(passageiros, utils) {
    console.log('✈️ [OCR-SMILES] Módulo ativado!');
    
    const passageiro = passageiros.find(p => p && (p.nome || p.primeiroNome || p.cpf || p.dataNascimento));
    
    if (!passageiro) {
      console.warn('⚠️ [OCR-SMILES] Operação abortada: Nenhum dado válido encontrado para injeção.');
      return;
    }

    console.log('✈️ [OCR-SMILES] Iniciando preenchimento na Smiles...', selectors);
    
    // O injector.js fará a mágica de disparar os eventos corretos nestes seletores
    utils.fillForm(passageiro, selectors, 'smiles');
  }

  global.OCRProviders.smiles = {
    id: 'smiles',
    supports,
    selectors,
    inject: injectSmiles
  };
})(window);