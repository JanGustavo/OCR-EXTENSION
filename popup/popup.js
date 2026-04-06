const $ = (id) => document.getElementById(id);
let injectInFlight = false;
let lastInjectedSignature = '';
let lastInjectedAt = 0;

function getUploadEntryForUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('latam.com') || hostname.includes('latamairlines.com')) {
      return 'upload/upload.html?provider=latam';
    }

    if (hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br')) {
      return 'upload/upload.html?provider=smiles';
    }

    if (hostname.includes('azul.com.br') || hostname.includes('voeazul.com.br')) {
      return 'upload/upload.html?provider=azul';
    }
  } catch (err) {
    console.warn('[Popup] Não foi possível detectar o provedor pela URL:', err);
  }

  return 'upload/upload.html?provider=azul';
}

// Ao abrir o popup, verifica se há dados OCR no storage (novo fluxo com test-form.html)
chrome.storage.local.get(['passageirosOCR', 'ocrResult', 'ocrPendente'], (result) => {
  console.log('[Popup] Storage keys:', result);
  
  // Novo fluxo: dados salvos por upload.js em test-form + test-form.js
  if (result.passageirosOCR && Array.isArray(result.passageirosOCR)) {
    console.log('[Popup] Encontrados passageiros OCR:', result.passageirosOCR.length);
    // Preencher com o primeiro passageiro que tem dados
    const primeiroPreenchido = result.passageirosOCR.find(p => p.nome || p.cpf);
    if (primeiroPreenchido) {
      mostrarDados(primeiroPreenchido);
    }
  }
  // Fluxo antigo (compatibilidade)
  else if (result.ocrPendente && result.ocrResult) {
    console.log('[Popup] Encontrados dados legacy (ocrResult)');
    mostrarDados(result.ocrResult);
    chrome.storage.local.set({ ocrPendente: false });
  }
});

// Abre a aba de upload
$('btn-open-upload').addEventListener('click', async () => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId = activeTab?.id;

    const uploadUrl = new URL(chrome.runtime.getURL('upload/upload.html'));
    const providerUrl = new URL(chrome.runtime.getURL(getUploadEntryForUrl(activeTab?.url || '')));
    uploadUrl.search = providerUrl.search;
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

// Limpa os dados do último OCR para reiniciar o fluxo
$('btn-clear-ocr').addEventListener('click', () => {
  chrome.storage.local.remove(['passageirosOCR', 'ocrResult', 'ocrPendente', 'ocrCompleted'], () => {
    if (chrome.runtime.lastError) {
      console.error('[Popup] Erro ao limpar OCR:', chrome.runtime.lastError.message);
      showStatus('Falha ao limpar dados do OCR.', 'error');
      return;
    }

    $('field-nome').value = '';
    $('field-sobrenome').value = '';
    $('field-cpf').value = '';
    $('field-data').value = '';

    $('result-section').classList.add('hidden');
    $('upload-section').classList.remove('hidden');

    lastInjectedSignature = '';
    lastInjectedAt = 0;

    showStatus('Último OCR limpo. Você já pode iniciar um novo.', 'success');
  });
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

    const isExtensionPage = /^(chrome|chrome-extension):\/\//.test(targetTab.url || '');
    
    if (isExtensionPage && targetTab.url.includes('test-form.html')) {
      // ─── Para test-form.html (extension page) ───
      console.log('[Popup] test-form.html detectado, salvando em storage...');
      
      // Salvar no storage para que test-form.js leia
      const dataToSave = {
        firstName: data.primeiroNome,
        lastName: data.sobrenome,
        cpf: data.cpf,
        birthDate: data.dataNascimento,
        nome: data.nomeCompleto,
        dataNascimento: data.dataNascimento
      };
      
      chrome.storage.local.set({ passageirosOCR: [dataToSave] }, () => {
        console.log('[Popup] Dados salvos no storage para test-form.js');
        // Enviar postMessage também para reloadear se necessário
        chrome.tabs.sendMessage(targetTab.id, { 
          type: 'RELOAD_FROM_STORAGE',
          data: dataToSave
        }).catch(err => {
          console.log('[Popup] test-form.html não respondeu (esperado para extension page)');
        });
      });
      
      showStatus('✓ Dados salvos no formulário!', 'success');
    } else if (isExtensionPage) {
      return showStatus('Abra a página do formulário e tente novamente.', 'error');
    } else {
      // ─── Para páginas de conteúdo normal ───
      console.log('[Popup] Injetando em página de conteúdo...');
      
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id, allFrames: true },
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

      showStatus('✓ Formulário preenchido com sucesso!', 'success');
    }

    lastInjectedSignature = signature;
    lastInjectedAt = Date.now();
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
