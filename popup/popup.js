const $ = (id) => document.getElementById(id);

const uploadSection  = $('upload-section');
const previewSection = $('preview-section');
const resultSection  = $('result-section');
const statusBar      = $('status-bar');
const loadingEl      = $('loading');
const imagePreview   = $('image-preview');
const dropZone       = $('drop-zone');
const fieldNome      = $('field-nome');
const fieldCpf       = $('field-cpf');
const fieldData      = $('field-data');

if (!dropZone) {
  console.error('Drop zone não encontrada');
}

// ─── Input file ───────────────────────────────────────────────────────────────
// CRÍTICO: ler o arrayBuffer DENTRO do handler síncrono, antes de qualquer await.
// O Chrome invalida o File object quando o popup perde foco (ao abrir o diálogo).
// arrayBuffer() retorna uma Promise mas o File ainda é válido se chamado aqui.
$('file-btn').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    return showStatus('Nenhum arquivo escolhido.', 'error');
  }

  if (file.size > 5 * 1024 * 1024) {
    e.target.value = '';
    return showStatus('Imagem maior que 5MB.', 'error');
  }

  e.target.value = '';

  handleSelectedFile(file);
});

// ─── Drag & Drop ──────────────────────────────────────────────────────────────
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

if (dropZone) {
  dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); });
  dropZone.addEventListener('dragleave', ()  => { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    let file = e.dataTransfer?.files?.[0] ?? null;

    if (!file) {
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) {
        return showStatus('Nenhum arquivo detectado.', 'error');
      }

      for (const item of items) {
        if (item.kind === 'file') {
          file = item.getAsFile();
          if (file) break;
        }
      }
    }

    if (!file) {
      return showStatus('Arraste apenas imagens.', 'error');
    }

    if (file.size > 5 * 1024 * 1024) {
      return showStatus('Imagem maior que 5MB.', 'error');
    }

    handleSelectedFile(file);
  });
}

$('btn-change').addEventListener('click', () => {
  showSection('upload');
  hideStatus();
});

// ─── Processar arquivo ───────────────────────────────────────────────────────
function handleSelectedFile(file) {
  if (!(file instanceof Blob)) {
    return showStatus('Arquivo inválido ou inacessível.', 'error');
  }

  if (!file.type?.startsWith('image/')) {
    return showStatus('Apenas imagens PNG, JPG ou WEBP.', 'error');
  }

  const previewUrl = URL.createObjectURL(file);
  imagePreview.src = previewUrl;
  showSection('preview');
  showLoading(true);

  readFileAsDataUrl(file)
    .then((imageBase64) => {
      chrome.runtime.sendMessage({
        type: 'START_OCR',
        imageBase64
      }, (response) => {
        URL.revokeObjectURL(previewUrl);

        if (chrome.runtime.lastError) {
          console.error('chrome.runtime.lastError:', chrome.runtime.lastError.message);
          showLoading(false);
          return showStatus(chrome.runtime.lastError.message || 'Falha ao iniciar OCR. Tente novamente.', 'error');
        }

        if (!response?.ok) {
          showLoading(false);
          return showStatus(response?.error || 'Falha ao iniciar OCR.', 'error');
        }
      });
    })
    .catch((err) => {
      URL.revokeObjectURL(previewUrl);
      console.error('Falha em readFileAsDataUrl:', err?.name, err?.message, err);
      showLoading(false);
      showStatus(`Falha ao ler a imagem (${err?.name || 'erro desconhecido'}).`, 'error');
    });
}

// ─── OCR ──────────────────────────────────────────────────────────────────────
async function runOCR(base64) {
  try {
    await chrome.runtime.sendMessage({ type: 'START_OCR', imageBase64: base64 });
  } catch (_err) {
    // Tesseract não configurado ainda — usa mock para testar injeção
    console.warn('[Popup] SW sem OCR, usando mock.');
    showLoading(false);
    showExtractedData({
      nome: 'CARLOS EDUARDO MENDONÇA',
      cpf: '123.456.789-09',
      dataNascimento: '14/03/1987'
    });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'OCR_RESULT') return;
  showLoading(false);
  if (!msg.data) return showStatus('OCR sem dados. Tente outra imagem.', 'error');
  showExtractedData(msg.data);
});

function showExtractedData(data) {
  fieldNome.value = data.nome ?? '';
  fieldCpf.value  = data.cpf  ?? '';
  fieldData.value = data.dataNascimento ?? '';
  showSection('result');
  showStatus('Revise os dados e clique em "Preencher formulário".', 'success');
}

// ─── Injeção ──────────────────────────────────────────────────────────────────
$('btn-inject').addEventListener('click', async () => {
  const data = {
    nome:           fieldNome.value.trim(),
    cpf:            fieldCpf.value.trim(),
    dataNascimento: fieldData.value.trim()
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
  } catch (err) {
    showStatus('Abra o test-form.html antes de injetar.', 'error');
  }
});

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showSection(name) {
  uploadSection.classList.toggle('hidden',  name !== 'upload');
  previewSection.classList.toggle('hidden', name !== 'preview');
  resultSection.classList.toggle('hidden',  name !== 'result');
}
function showLoading(v)  { loadingEl.classList.toggle('hidden', !v); }
function showStatus(msg, type = 'success') {
  statusBar.textContent = msg;
  statusBar.className   = type;
  statusBar.classList.remove('hidden');
}
function hideStatus() { statusBar.classList.add('hidden'); }

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new DOMException('Falha ao ler o arquivo.'));
    reader.onabort = () => reject(reader.error ?? new DOMException('Leitura do arquivo interrompida.'));
    reader.readAsDataURL(file);
  });
}

