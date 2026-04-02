/**
 * OFFSCREEN MANAGER
 *
 * Gerencia o ciclo de vida do documento offscreen.
 * O Chrome só permite UMA instância por extensão — este módulo
 * garante idempotência na criação e evita erros de duplicata.
 */

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');
const OFFSCREEN_REASON = chrome.offscreen.Reason.BLOBS; // Motivo declarado para uso de DOM/Canvas

/**
 * Garante que o documento offscreen existe antes de enviar mensagens a ele.
 * Idempotente: se já existir, não cria outro.
 */
export async function ensureOffscreenDocument() {
  // API disponível a partir do Chrome 116
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL]
  });

  if (existingContexts.length > 0) return; // já existe, nada a fazer

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [OFFSCREEN_REASON],
    justification: 'Necessário para executar Tesseract.js via Canvas/WebAssembly sem acesso ao DOM principal.'
  });
}

/**
 * Encerra o documento offscreen quando não for mais necessário.
 * Chamada opcional — útil para liberar memória após o OCR.
 */
export async function closeOffscreenDocument() {
  await chrome.offscreen.closeDocument().catch(() => {});
}
