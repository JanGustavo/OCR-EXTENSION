/**
 * Provider LATAM
 *
 * Estratégia de injeção específica para domínios da LATAM.
 */
(function registerLatamProvider(global) {
  global.OCRProviders = global.OCRProviders || {};

  const selectors = {
    nome: '[data-testid="passenger-name"], [name*="firstName"], [aria-label*="nome"]',
    sobrenome: '[data-testid="passenger-lastname"], [name*="lastName"]',
    cpf: '[data-testid="cpf-field"], [name*="cpf"], [aria-label*="CPF"]',
    dataNascimento: '[data-testid="birthdate"], [name*="birthDate"], [aria-label*="nascimento"]'
  };

  function supports(hostname) {
    return hostname.includes('latam.com') || hostname.includes('latamairlines.com');
  }

  function injectLatam() {
    // Módulo reservado para implementação de injeção LATAM.
    console.log('[OCR] Site da LATAM detectado. Módulo ainda não implementado.');
  }

  global.OCRProviders.latam = {
    id: 'latam',
    supports,
    selectors,
    inject: injectLatam
  };
})(window);
