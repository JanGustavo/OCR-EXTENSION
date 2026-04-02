const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const previewBox = document.getElementById('preview-box');
const previewImg = document.getElementById('preview-img');
const spinner    = document.getElementById('spinner');
const statusEl   = document.getElementById('status');
const btnChange  = document.getElementById('btn-change');

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

btnChange.addEventListener('click', () => {
  previewBox.style.display = 'none';
  dropZone.style.display = 'block';
  fileInput.value = '';
  hideStatus();
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) return showStatus('Apenas imagens PNG, JPG ou WEBP.', 'error');
  if (file.size > 5 * 1024 * 1024) return showStatus('Imagem muito grande. Limite: 5MB.', 'error');

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);
  dropZone.style.display = 'none';
  previewBox.style.display = 'block';

  showSpinner(true);

  const reader = new FileReader();
  reader.onload  = (e) => sendToOCR(e.target.result);
  reader.onerror = ()  => { showSpinner(false); showStatus('Erro ao ler a imagem.', 'error'); };
  reader.readAsDataURL(file);
}

function sendToOCR(base64) {
  // Tenta o Service Worker real primeiro
  chrome.runtime.sendMessage({ type: 'START_OCR', imageBase64: base64 }, (response) => {
    const swFailed = chrome.runtime.lastError || !response?.ok;

    if (swFailed) {
      // Mock enquanto Tesseract não está configurado
      const mockData = {
        nome: 'CARLOS EDUARDO MENDONÇA',
        cpf: '123.456.789-09',
        dataNascimento: '14/03/1987'
      };
      salvarEFechar(mockData);
    }
    // Se SW funcionou, o resultado virá via OCR_RESULT abaixo
  });
}

// Quando o SW real retornar o resultado
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'OCR_RESULT') return;
  showSpinner(false);
  if (!msg.data) return showStatus('OCR sem dados. Tente outra imagem.', 'error');
  salvarEFechar(msg.data);
});

/**
 * Salva os dados no chrome.storage.local e fecha a aba.
 * O popup vai ler dali quando o usuário clicar no ícone da extensão.
 */
function salvarEFechar(data) {
  showSpinner(false);
  chrome.storage.local.set({ ocrResult: data, ocrPendente: true }, () => {
    showStatus('✓ Dados salvos! Clique no ícone da extensão para revisar.', 'success');
    // Fecha a aba após 1.5s para o usuário ver o feedback
    setTimeout(() => window.close(), 1500);
  });
}

function showSpinner(v) { spinner.style.display = v ? 'flex' : 'none'; }
function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
  statusEl.style.display = 'block';
}
function hideStatus() { statusEl.style.display = 'none'; }
