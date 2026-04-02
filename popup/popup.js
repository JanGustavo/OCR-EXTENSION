const $ = (id) => document.getElementById(id);

// Ao abrir o popup, verifica se há resultado pendente no storage
chrome.storage.local.get(['ocrResult', 'ocrPendente'], ({ ocrResult, ocrPendente }) => {
  if (ocrPendente && ocrResult) {
    mostrarDados(ocrResult);
    // Limpa o flag de pendente (mantém os dados para reuso)
    chrome.storage.local.set({ ocrPendente: false });
  }
});

// Abre a aba de upload
$('btn-open-upload').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('upload/upload.html') });
  window.close();
});

// Injeção na aba ativa
$('btn-inject')?.addEventListener('click', async () => {
  const data = {
    nome:           $('field-nome').value.trim(),
    cpf:            $('field-cpf').value.trim(),
    dataNascimento: $('field-data').value.trim()
  };

  if (!data.nome && !data.cpf) return showStatus('Preencha ao menos nome ou CPF.', 'error');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (d) => window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: d })),
      args: [data]
    });
    showStatus('✓ Formulário preenchido!', 'success');
  } catch {
    showStatus('Erro ao injetar. A página suporta scripts?', 'error');
  }
});

function mostrarDados(data) {
  $('field-nome').value = data.nome ?? '';
  $('field-cpf').value  = data.cpf  ?? '';
  $('field-data').value = data.dataNascimento ?? '';
  $('upload-section').classList.add('hidden');
  $('result-section').classList.remove('hidden');
  showStatus('Dados prontos! Revise e clique em "Preencher formulário".', 'success');
}

function showStatus(msg, type = 'success') {
  const bar = $('status-bar');
  bar.textContent = msg;
  bar.className = type;
  bar.classList.remove('hidden');
}
