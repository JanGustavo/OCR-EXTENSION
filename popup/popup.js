const $ = (id) => document.getElementById(id);
const OCRDBG = '[OCRDBG]';
let injectInFlight = false;
let lastInjectedSignature = '';
let lastInjectedAt = 0;
let activeProvider = 'azul';
let passageirosOCR = [];
let passageiroSelecionado = 0;

function getProviderFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('latam.com') || hostname.includes('latamairlines.com')) {
      return 'latam';
    }

    if (hostname.includes('smiles.com.br') || hostname.includes('gol.com.br') || hostname.includes('voegol.com.br')) {
      return 'smiles';
    }

    if (hostname.includes('azul.com.br') || hostname.includes('voeazul.com.br')) {
      return 'azul';
    }
  } catch (err) {
    console.warn('[Popup] Não foi possível detectar provider pela URL:', err);
  }

  return 'azul';
}

function updateExtraFieldsVisibility(provider) {
  const extraFields = $('extra-fields');
  if (!extraFields) return;

  const shouldShow = provider === 'latam' || provider === 'smiles';
  extraFields.classList.toggle('hidden', !shouldShow);

  if (!shouldShow) {
    const fieldEmail = $('field-email');
    const fieldTelefone = $('field-telefone');
    if (fieldEmail) fieldEmail.value = '';
    if (fieldTelefone) fieldTelefone.value = '';
  }
}

function getCurrentFormData() {
  const nome = $('field-nome')?.value.trim() || '';
  const sobrenome = $('field-sobrenome')?.value.trim() || '';

  return {
    primeiroNome: nome,
    firstName: nome,
    sobrenome,
    lastName: sobrenome,
    nomeCompleto: `${nome} ${sobrenome}`.trim(),
    cpf: $('field-cpf')?.value.trim() || '',
    dataNascimento: $('field-data')?.value.trim() || '',
    genero: $('field-genero')?.value || '',
    gender: $('field-genero')?.value || '',
    nacionalidade: $('field-nacionalidade')?.value || '',
    nationality: $('field-nacionalidade')?.value || '',
    email: $('field-email')?.value.trim() || '',
    telefone: $('field-telefone')?.value.trim() || ''
  };
}

function splitNomeSobrenome(nomeCompleto) {
  const raw = String(nomeCompleto || '').trim();
  if (!raw) return { primeiroNome: '', sobrenome: '' };

  const partes = raw.split(/\s+/).filter(Boolean);
  if (partes.length === 1) {
    return { primeiroNome: partes[0], sobrenome: '' };
  }

  return {
    primeiroNome: partes.slice(0, -1).join(' '),
    sobrenome: partes[partes.length - 1]
  };
}

function normalizeGenderValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  if (['male', 'm', 'masculino', 'masc', 'homem'].includes(lower)) return 'Masculino';
  if (['female', 'f', 'feminino', 'fem', 'mulher'].includes(lower)) return 'Feminino';

  if (lower.startsWith('masc')) return 'Masculino';
  if (lower.startsWith('fem')) return 'Feminino';
  return raw;
}

function logGeneroState(label = '') {
  const fieldGenero = $('field-genero');
  const idx = passageiroSelecionado + 1;
  if (fieldGenero) {
    const htmlValue = fieldGenero.value;
    const storageValue = passageirosOCR[passageiroSelecionado]?.genero || '';
    console.log(`${OCRDBG}[Popup] ${label} P${idx} genero state:`, {
      htmlFieldValue: htmlValue,
      storageGenero: storageValue,
      storageGender: passageirosOCR[passageiroSelecionado]?.gender || '',
      normalized: normalizeGenderValue(htmlValue)
    });
  }
}

function setFormData(data) {
  const nomeCompleto = data?.nomeCompleto || data?.nome || '';
  const split = splitNomeSobrenome(nomeCompleto);
  const primeiroNome = data?.primeiroNome || data?.firstName || split.primeiroNome;
  const sobrenome = data?.sobrenome || data?.lastName || split.sobrenome;

  $('field-nome').value = primeiroNome;
  $('field-sobrenome').value = sobrenome;
  $('field-cpf').value = data?.cpf ?? '';
  $('field-data').value = data?.dataNascimento ?? data?.birthDate ?? '';
  const fieldGenero = $('field-genero');
  const fieldNacionalidade = $('field-nacionalidade');
  if (fieldGenero) fieldGenero.value = normalizeGenderValue(data?.genero ?? data?.gender ?? '');
  if (fieldNacionalidade) fieldNacionalidade.value = data?.nacionalidade ?? data?.nationality ?? 'Brasil';

  const fieldEmail = $('field-email');
  const fieldTelefone = $('field-telefone');
  if (fieldEmail) fieldEmail.value = data?.email ?? '';
  if (fieldTelefone) fieldTelefone.value = data?.telefone ?? '';
}

function hasPassengerData(data) {
  if (!data) return false;
  return Boolean(data.nome || data.nomeCompleto || data.primeiroNome || data.firstName || data.sobrenome || data.lastName || data.cpf || data.dataNascimento || data.birthDate || data.email || data.telefone);
}

function normalizePassengerForInjection(data, shouldSendExtra) {
  const nomeCompletoBase = String(data?.nomeCompleto || data?.nome || '').trim();
  const split = splitNomeSobrenome(nomeCompletoBase);
  const primeiroNome = String(data?.primeiroNome || data?.firstName || split.primeiroNome || '').trim();
  const sobrenome = String(data?.sobrenome || data?.lastName || split.sobrenome || '').trim();
  const nomeCompleto = String(`${primeiroNome} ${sobrenome}`.trim() || nomeCompletoBase).trim();
  const generoNormalizado = normalizeGenderValue(data?.genero || data?.gender || data?.sexo || '');

  return {
    primeiroNome,
    firstName: primeiroNome,
    sobrenome,
    lastName: sobrenome,
    nomeCompleto,
    nome: nomeCompleto,
    cpf: String(data?.cpf || '').trim(),
    dataNascimento: String(data?.dataNascimento || data?.birthDate || '').trim(),
    birthDate: String(data?.birthDate || data?.dataNascimento || '').trim(),
    genero: String(generoNormalizado || '').trim(),
    gender: String(generoNormalizado || '').trim(),
    nacionalidade: String(data?.nacionalidade || data?.nationality || '').trim(),
    nationality: String(data?.nationality || data?.nacionalidade || '').trim(),
    email: shouldSendExtra ? String(data?.email || '').trim() : '',
    telefone: shouldSendExtra ? String(data?.telefone || '').trim() : ''
  };
}

function persistPassengerSelecionado() {
  if (!passageirosOCR[passageiroSelecionado]) {
    passageirosOCR[passageiroSelecionado] = {};
  }
  const p = passageirosOCR[passageiroSelecionado];

  const nomeDigitado = $('field-nome').value.trim();
  const sobrenomeDigitado = $('field-sobrenome').value.trim();

  // Sincroniza todos os aliases para que o splitNome da Azul.js entenda perfeitamente!
  p.nome = `${nomeDigitado} ${sobrenomeDigitado}`.trim();
  p.nomeCompleto = p.nome;
  p.firstName = nomeDigitado;
  p.primeiroNome = nomeDigitado;
  p.lastName = sobrenomeDigitado;
  p.sobrenome = sobrenomeDigitado;

  p.cpf = $('field-cpf').value.trim();
  p.dataNascimento = $('field-data').value.trim();
  p.birthDate = p.dataNascimento;

  if ($('field-email')) p.email = $('field-email').value.trim();
  if ($('field-telefone')) p.telefone = $('field-telefone').value.trim();

  // 🔥 Sincroniza género e nacionalidade
  const fieldGenero = $('field-genero');
  const fieldNacionalidade = $('field-nacionalidade');
  
  if (fieldGenero) {
    const genero = normalizeGenderValue(fieldGenero.value);
    const rawValue = fieldGenero.value;
    p.genero = genero;
    p.gender = genero;
    if (rawValue) {
      console.log(`${OCRDBG}[Popup] persistPassenger P${passageiroSelecionado + 1} genero:`, {
        rawFieldValue: rawValue,
        normalizedTo: genero
      });
    }
  }
  
  if (fieldNacionalidade) p.nacionalidade = fieldNacionalidade.value;

  // Salva no storage para manter a consistência
  chrome.storage.local.set({ passageirosOCR: passageirosOCR });
}

function renderPassengerTabs() {
  const switcher = $('passenger-switcher');
  const tabs = $('passenger-tabs');
  const meta = $('passenger-meta');
  if (!switcher || !tabs || !meta) return;

  tabs.innerHTML = '';
  const total = passageirosOCR.length;

  switcher.classList.toggle('hidden', total <= 1);
  if (total <= 1) return;

  passageirosOCR.forEach((passageiro, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'passenger-tab';
    btn.textContent = `P${index + 1}`;

    if (hasPassengerData(passageiro)) btn.classList.add('filled');
    if (index === passageiroSelecionado) btn.classList.add('active');

    btn.addEventListener('click', () => {
      persistPassengerSelecionado();
      console.log(`${OCRDBG}[Popup] Abas: P${passageiroSelecionado + 1} persistido, agora exibindo P${index + 1}`);
      logGeneroState('antes de switch para P' + (index + 1));
      passageiroSelecionado = index;
      setFormData(passageirosOCR[index] || {});
      logGeneroState('após setFormData de P' + (index + 1));
      renderPassengerTabs();
      showStatus(`Editando passageiro P${index + 1}.`, 'success');
    });

    tabs.appendChild(btn);
  });

  meta.textContent = `Passageiro ${passageiroSelecionado + 1} de ${total}`;
}

function showPassengersData(passageiros) {
  if (!Array.isArray(passageiros) || passageiros.length === 0) return;

  passageirosOCR = passageiros.map((p) => ({ ...p }));
  const firstWithData = passageirosOCR.findIndex((p) => hasPassengerData(p));
  passageiroSelecionado = firstWithData >= 0 ? firstWithData : 0;

  console.log(`${OCRDBG}[Popup] showPassengersData carregou ${passageirosOCR.length} passageiros`);
  passageirosOCR.forEach((p, idx) => {
    console.log(`${OCRDBG}[Popup] P${idx + 1} genero carregado do OCR:`, {
      genero: p.genero || '',
      gender: p.gender || '',
      sexo: p.sexo || '',
      sex: p.sex || ''
    });
  });

  setFormData(passageirosOCR[passageiroSelecionado] || {});
  logGeneroState('após setFormData');
  renderPassengerTabs();

  $('upload-section').classList.add('hidden');
  $('result-section').classList.remove('hidden');
  showStatus('Dados prontos! Revise e clique em "Preencher formulário".', 'success');
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs?.[0];
  activeProvider = getProviderFromUrl(activeTab?.url || '');
  updateExtraFieldsVisibility(activeProvider);
});

function getUploadEntryForUrl(url) {
  return `upload/upload.html?provider=${getProviderFromUrl(url)}`;
}

// Ao abrir o popup, verifica se há dados OCR no storage (novo fluxo com test-form.html)
chrome.storage.local.get(['passageirosOCR', 'ocrResult', 'ocrPendente'], (result) => {
  console.log('[Popup] Storage keys:', result);
  
  // Novo fluxo: dados salvos por upload.js em test-form + test-form.js
  if (result.passageirosOCR && Array.isArray(result.passageirosOCR)) {
    console.log('[Popup] Encontrados passageiros OCR:', result.passageirosOCR.length);
    showPassengersData(result.passageirosOCR);
  }
  // Fluxo antigo (compatibilidade)
  else if (result.ocrPendente && result.ocrResult) {
    console.log('[Popup] Encontrados dados legacy (ocrResult)');
    showPassengersData([result.ocrResult]);
    chrome.storage.local.set({ ocrPendente: false });
  }
});

// Abre a aba de upload
async function openUploadTab() {
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
}

$('btn-open-upload').addEventListener('click', (event) => {
  event.stopPropagation();
  openUploadTab();
});

const dropZone = $('drop-zone');
if (dropZone) {
  dropZone.addEventListener('click', () => {
    openUploadTab();
  });

  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openUploadTab();
    }
  });
}

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
    const fieldGenero = $('field-genero');
    const fieldNacionalidade = $('field-nacionalidade');
    const fieldEmail = $('field-email');
    const fieldTelefone = $('field-telefone');
    if (fieldGenero) fieldGenero.value = '';
    if (fieldNacionalidade) fieldNacionalidade.value = 'Brasil';
    if (fieldEmail) fieldEmail.value = '';
    if (fieldTelefone) fieldTelefone.value = '';

    $('result-section').classList.add('hidden');
    $('upload-section').classList.remove('hidden');

    passageirosOCR = [];
    passageiroSelecionado = 0;
    renderPassengerTabs();

    lastInjectedSignature = '';
    lastInjectedAt = 0;

    showStatus('Último OCR limpo. Você já pode iniciar um novo.', 'success');
  });
});

// Injeção na aba ativa
// ─── Injeção ──────────────────────────────────────────────────────────────────
$('btn-inject').addEventListener('click', async () => {
  if (injectInFlight) return;

  persistPassengerSelecionado();
  console.log(`${OCRDBG}[Popup] btn-inject clicado, persistPassenger finalizado`);

  const fieldNome = $('field-nome');
  const fieldSobrenome = $('field-sobrenome');
  const fieldCpf = $('field-cpf');
  const fieldData = $('field-data');
  const fieldGenero = $('field-genero');
  const fieldNacionalidade = $('field-nacionalidade');
  const fieldEmail = $('field-email');
  const fieldTelefone = $('field-telefone');
  const shouldSendExtra = activeProvider === 'latam' || activeProvider === 'smiles';

  const dataAtual = {
    primeiroNome:      fieldNome.value.trim(),
    sobrenome:         fieldSobrenome.value.trim(),
    nomeCompleto:      (fieldNome.value.trim() + ' ' + fieldSobrenome.value.trim()).trim(),
    cpf:               fieldCpf.value.trim(),
    dataNascimento:    fieldData.value.trim(),
    genero:            fieldGenero?.value || '',
    gender:            fieldGenero?.value || '',
    nacionalidade:     fieldNacionalidade?.value || '',
    nationality:       fieldNacionalidade?.value || '',
    email:             shouldSendExtra ? (fieldEmail?.value.trim() || '') : '',
    telefone:          shouldSendExtra ? (fieldTelefone?.value.trim() || '') : ''
  };

  const passageirosPayload = passageirosOCR.length > 0
    ? passageirosOCR.map((p) => normalizePassengerForInjection(p, shouldSendExtra))
    : [{
        nome: `${$('field-nome').value.trim()} ${$('field-sobrenome').value.trim()}`.trim(),
        firstName: $('field-nome').value.trim(),
        primeiroNome: $('field-nome').value.trim(),
        lastName: $('field-sobrenome').value.trim(),
        sobrenome: $('field-sobrenome').value.trim(),
        cpf: $('field-cpf').value.trim(),
        dataNascimento: $('field-data').value.trim(),
        birthDate: $('field-data').value.trim(),
        email: $('field-email') ? $('field-email').value.trim() : '',
        telefone: $('field-telefone') ? $('field-telefone').value.trim() : '',
        // 🔥 Adiciona género e nacionalidade ao fallback
        genero: $('field-genero') ? $('field-genero').value : '',
        nacionalidade: $('field-nacionalidade') ? $('field-nacionalidade').value : 'Brasil'
      }];

  console.log(`${OCRDBG}[Popup] btn-inject construindo payload: provider=${activeProvider} passageirosOCR.length=${passageirosOCR.length} payload.length=${passageirosPayload.length}`);
  passageirosPayload.forEach((p, idx) => {
    const hasGenero = !!(p.genero || p.gender);
    console.log(`${OCRDBG}[Popup] P${idx + 1} payload final:`, {
      nome: p.nomeCompleto,
      cpf: p.cpf,
      dataNascimento: p.dataNascimento,
      genero: p.genero || p.gender || '(vazio)',
      generoBoolean: hasGenero,
      nacionalidade: p.nacionalidade || p.nationality || ''
    });

    if (!(p.genero || p.gender)) {
      console.warn(`${OCRDBG}[Popup] ⚠️ P${idx + 1} SEM GENERO NO PAYLOAD FINAL!`, {
        nome: p.nomeCompleto,
        passageirosOCR_raw: {
          genero: passageirosOCR[idx]?.genero,
          gender: passageirosOCR[idx]?.gender,
          sexo: passageirosOCR[idx]?.sexo,
          sex: passageirosOCR[idx]?.sex
        },
        fieldValue: idx === passageiroSelecionado ? fieldGenero?.value : '(não é tab ativa)'
      });
    }
  });

  const signature = JSON.stringify(passageirosPayload);
  const now = Date.now();
  if (signature === lastInjectedSignature && (now - lastInjectedAt) < 1500) {
    return showStatus('Aguarde um instante antes de reenviar os mesmos dados.', 'error');
  }

  if (!passageirosPayload.length) return showStatus('Preencha ao menos nome ou CPF.', 'error');

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

      // Salvar no storage para que test-form.js leia a lista completa
      chrome.storage.local.set({ passageirosOCR: passageirosPayload }, () => {
        console.log('[Popup] Dados salvos no storage para test-form.js');
        // Enviar postMessage também para reloadear se necessário
        chrome.tabs.sendMessage(targetTab.id, { 
          type: 'RELOAD_FROM_STORAGE',
          data: passageirosPayload
        }).catch(err => {
          console.log('[Popup] test-form.html não respondeu (esperado para extension page)');
        });
      });
      
      showStatus(`✓ ${passageirosPayload.length} passageiro(s) salvo(s) no formulário!`, 'success');
    } else if (isExtensionPage) {
      return showStatus('Abra a página do formulário e tente novamente.', 'error');
    } else {
      // ─── Para páginas de conteúdo normal ───
      console.log('[Popup] Tentando enviar payload via sendMessage...');

      const sendMessageResult = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          targetTab.id,
          { type: 'OCR_AUTOFILL', data: passageirosPayload },
          (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              resolve({ ok: false, reason: lastError.message });
              return;
            }
            resolve({ ok: true, response });
          }
        );
      });

      if (!sendMessageResult.ok) {
        console.warn('[Popup] sendMessage falhou, tentando executeScript:', sendMessageResult.reason || 'sem resposta');

        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (d) => {
            window.dispatchEvent(new CustomEvent('OCR_AUTOFILL', { detail: d }));
          },
          args: [passageirosPayload]
        });
      } else {
        console.log(`${OCRDBG}[Popup] sendMessage ok`, sendMessageResult.response || null);
      }

      showStatus(`✓ Comando de preenchimento enviado para ${passageirosPayload.length} passageiro(s)!`, 'success');
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
  showPassengersData([data]);
}

['field-nome', 'field-sobrenome', 'field-cpf', 'field-data', 'field-genero', 'field-nacionalidade', 'field-email', 'field-telefone'].forEach((fieldId) => {
  const input = $(fieldId);
  if (!input) return;

  input.addEventListener('input', () => {
    if (fieldId === 'field-genero' && input.value) {
      console.log(`${OCRDBG}[Popup] genero input changed:`, {
        rawValue: input.value,
        normalized: normalizeGenderValue(input.value)
      });
    }
    persistPassengerSelecionado();
    renderPassengerTabs();
  });
});

function showStatus(msg, type = 'success') {
  const bar = $('status-bar');
  bar.textContent = msg;
  bar.className = type;
  bar.classList.remove('hidden');
}
