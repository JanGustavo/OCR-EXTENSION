/**
 * SERVICE WORKER — Orquestrador central da extensão (MV3)
 *
 * RESPONSABILIDADES:
 *  1. Receber a imagem (base64) enviada pelo popup
 *  2. Garantir que o documento offscreen existe antes de usá-lo
 *  3. Encaminhar a imagem ao offscreen para OCR (via chrome.runtime.sendMessage)
 *  4. Receber o resultado do OCR (dados extraídos)
 *  5. Injetar os dados na aba ativa via chrome.scripting (ou repassar ao content script)
 *
 * CICLO DE VIDA:
 *  Service Workers MV3 são encerrados pelo Chrome após ~30s de inatividade.
 *  NÃO armazene estado em variáveis globais — use chrome.storage.session para
 *  dados temporários que precisam sobreviver entre eventos.
 */

import { ensureOffscreenDocument } from './offscreen-manager.js';

// ─── Roteador de mensagens ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Retornar true é OBRIGATÓRIO quando sendResponse for chamado de forma assíncrona
  if (message.type === 'START_OCR') {
    handleOCRFlow(message.imageBase64, sendResponse);
    return true; // mantém o canal aberto para resposta assíncrona
  }

  if (message.type === 'OCR_RESULT') {
    // Mensagem vinda do offscreen.js com os dados extraídos
    handleInjection(message.data, sender, sendResponse);
    return true;
  }
});

// ─── Fluxo principal ────────────────────────────────────────────────────────

/**
 * Garante o documento offscreen e envia a imagem para OCR.
 * @param {string} imageBase64 - Imagem em base64 (sem prefixo data:image)
 * @param {Function} sendResponse - Callback para retornar ao popup
 */
async function handleOCRFlow(imageBase64, sendResponse) {
  try {
    await ensureOffscreenDocument();

    // Envia a imagem ao offscreen para processamento via Tesseract.js
    chrome.runtime.sendMessage({
      type: 'RUN_OCR',
      imageBase64,
      target: 'offscreen' // convenção de roteamento — ver offscreen.js
    });

    // A resposta ao popup virá de forma indireta via OCR_RESULT → handleInjection
    // Aqui apenas confirmamos que o processo foi iniciado
    sendResponse({ ok: true, status: 'OCR iniciado' });

  } catch (error) {
    console.error('[SW] Erro ao iniciar OCR:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

/**
 * Injeta os dados extraídos pelo OCR na aba ativa do usuário.
 * Utiliza chrome.scripting para executar o injector.js como função isolada.
 *
 * @param {Object} data - { nome, cpf, dataNascimento }
 */
async function handleInjection(data, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');

    // Alternativa A: executar função diretamente via scripting API
    // (útil quando o content script não está carregado na página)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectDataIntoPage, // função serializada e executada no contexto da página
      args: [data]
    });

    sendResponse?.({ ok: true, status: 'Dados injetados com sucesso.' });

  } catch (error) {
    console.error('[SW] Erro na injeção:', error);
    sendResponse?.({ ok: false, error: error.message });
  }
}

/**
 * Função injetada diretamente no contexto da página via chrome.scripting.
 * NÃO tem acesso a variáveis do Service Worker — é serializada como string.
 * Deve ser autocontida.
 *
 * @param {{ nome: string, cpf: string, dataNascimento: string }} data
 */
function injectDataIntoPage(data) {
  // Delegar ao content script via CustomEvent (se injector.js estiver carregado)
  window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: data }));
}
