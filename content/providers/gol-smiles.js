/**
 * Provider Gol/Smiles
 *
 * Estratégia de injeção específica para domínios da Gol e Smiles.
 */
(function registerGolSmilesProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  const selectors = {
    nome: '[name="firstName"], [placeholder*="Nome"]',
    sobrenome: '[name="lastName"], [placeholder*="Sobrenome"]',
    cpf: '[name="cpf"], [placeholder*="CPF"]',
    dataNascimento: '[name="birthday"], [placeholder*="DD/MM/AAAA"]'
  };

  function supports(hostname) {
    return hostname.includes('gol.com.br') || hostname.includes('voegol.com.br') || hostname.includes('smiles.com.br');
  }

  function injectGolSmiles() {
    // Módulo reservado para implementação de injeção Gol/Smiles.
    console.log('[OCR] Site da Gol/Smiles detectado. Módulo ainda não implementado.');
  }

  global.OCRProviders.golSmiles = {
    id: 'gol-smiles',
    supports,
    selectors,
    inject: injectGolSmiles
  };
})(window);
