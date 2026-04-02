/**
 * SERVICE WORKER — Background da extensão (MV3)
 *
 * RESPONSABILIDADES SIMPLIFICADAS (após refator):
 *  - Manter a extensão ativa
 *  - Roteador de mensagens (para possíveis extensões futuras)
 *
 * NOTA: OCR agora é feito diretamente em upload.html
 *       Injeção é feita diretamente em popup.html.js no contexto da página destino
 *
 * CICLO DE VIDA:
 *  Service Workers MV3 são encerrados pelo Chrome após ~30s de inatividade.
 */

// ─── Roteador de mensagens ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SW] Mensagem recebida:', message.type);

  // Expandir quando necessário adicionar novos handlers
  switch (message.type) {
    case 'START_OCR':
      // Compatibilidade com abas antigas que ainda usam fluxo via SW/offscreen.
      // Resposta síncrona evita erro "listener indicated async response...".
      sendResponse({
        ok: false,
        deprecated: true,
        error: 'Fluxo START_OCR descontinuado. Reabra a aba de upload da extensão.'
      });
      return false;

    case 'OCR_RESULT':
      // Ignora resultados legados enviados por offscreen antigo.
      sendResponse({ ok: true, ignored: true });
      return false;

    case 'PING':
      // Simples keep-alive para manter SW ativo
      sendResponse({ ok: true, timestamp: Date.now() });
      return false;

    default:
      // Ignorar mensagens desconhecidas
      return false;
  }
});
