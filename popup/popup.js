const $ = (id) => document.getElementById(id);
let injectInFlight = false;
let lastInjectedSignature = '';
let lastInjectedAt = 0;

// Ao abrir o popup, verifica se há resultado pendente no storage
chrome.storage.local.get(['ocrResult', 'ocrPendente'], ({ ocrResult, ocrPendente }) => {
  if (ocrPendente && ocrResult) {
    mostrarDados(ocrResult);
    // Limpa o flag de pendente (mantém os dados para reuso)
    chrome.storage.local.set({ ocrPendente: false });
  }
});

// Abre a aba de upload
$('btn-open-upload').addEventListener('click', async () => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId = activeTab?.id;

    const uploadUrl = new URL(chrome.runtime.getURL('upload/upload.html'));
    if (Number.isInteger(targetTabId)) {
      uploadUrl.searchParams.set('targetTabId', String(targetTabId));
    }

    await chrome.tabs.create({ url: uploadUrl.toString() });
    window.close();
  } catch (err) {
    console.error('Erro ao abrir upload:', err);
    showStatus('Falha ao abrir tela de upload.', 'error');
  }
});

// Injeção na aba ativa
// ─── Injeção ──────────────────────────────────────────────────────────────────
$('btn-inject').addEventListener('click', async () => {
  if (injectInFlight) return;

  const fieldNome = $('field-nome');
  const fieldSobrenome = $('field-sobrenome');
  const fieldCpf = $('field-cpf');
  const fieldData = $('field-data');

  const data = {
    primeiroNome:      fieldNome.value.trim(),
    sobrenome:         fieldSobrenome.value.trim(),
    nomeCompleto:      (fieldNome.value.trim() + ' ' + fieldSobrenome.value.trim()).trim(),
    cpf:               fieldCpf.value.trim(),
    dataNascimento:    fieldData.value.trim()
  };

  const signature = JSON.stringify(data);
  const now = Date.now();
  if (signature === lastInjectedSignature && (now - lastInjectedAt) < 1500) {
    return showStatus('Aguarde um instante antes de reenviar os mesmos dados.', 'error');
  }

  if (!data.nomeCompleto && !data.cpf) return showStatus('Preencha ao menos nome ou CPF.', 'error');

  try {
    injectInFlight = true;
    $('btn-inject').disabled = true;

    const [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!targetTab?.id) {
      return showStatus('Nenhuma aba ativa encontrada.', 'error');
    }

    if (/^(chrome|chrome-extension):\/\//.test(targetTab.url || '')) {
      return showStatus('Abra a página do formulário e tente novamente.', 'error');
    }

    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (d) => {
        window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: d }));

        const setInputValue = (el, value) => {
          if (!el || value == null || value === '') return false;

          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;

          if (nativeSetter) {
            nativeSetter.call(el, value);
          } else {
            el.value = value;
          }

          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        };

        const nomeCompleto = (d?.nomeCompleto || '').trim();
        const primeiroNome = (d?.primeiroNome || '').trim();
        const sobrenome = (d?.sobrenome || '').trim();

        const candidates = {
          fullName: document.querySelector('#fullName, [name="fullName"], [data-testid="passenger-name"]'),
          firstName: document.querySelector('#firstName, [name*="firstName"], [name="nome"], [placeholder*="Nome"]'),
          lastName: document.querySelector('#lastName, [name*="lastName"], [name="sobrenome"], [placeholder*="Sobrenome"]'),
          cpf: document.querySelector('#cpf, [name*="cpf"], [data-testid="cpf-field"]'),
          birthDate: document.querySelector('#birthDate, [name*="birthDate"], [data-testid="birthdate"]')
        };

        setInputValue(candidates.fullName, nomeCompleto);
        setInputValue(candidates.firstName, primeiroNome);
        setInputValue(candidates.lastName, sobrenome);
        setInputValue(candidates.cpf, d?.cpf || '');
        setInputValue(candidates.birthDate, d?.dataNascimento || '');
      },
      args: [data]
    });

    lastInjectedSignature = signature;
    lastInjectedAt = Date.now();
    
    showStatus('✓ Formulário preenchido com sucesso!', 'success');
  } catch (err) {
    console.error('Erro na injeção:', err);
    showStatus('Falha ao se comunicar com a aba do formulário.', 'error');
  } finally {
    injectInFlight = false;
    $('btn-inject').disabled = false;
  }
});

function mostrarDados(data) {
  const nomeCompleto = data.nomeCompleto || data.nome || '';
  const primeiroNome = data.primeiroNome || '';
  const sobrenome = data.sobrenome || '';
  
  $('field-nome').value = primeiroNome || nomeCompleto;
  $('field-sobrenome').value = sobrenome;
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
