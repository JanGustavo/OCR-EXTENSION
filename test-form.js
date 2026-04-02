// Array para armazenar os dados dos 9 passageiros
let passageiros = Array.from({ length: 9 }, () => ({
  firstName: "",
  lastName: "",
  cpf: "",
  birthDate: "",
  email: "",
  phone: "",
}));
let passageiroAtual = 0;

// Criar abas e formulários dinamicamente
function criarFormularios() {
  const tabsContainer = document.getElementById("passengerTabs");
  const formsContainer = document.getElementById("formsContainer");

  tabsContainer.innerHTML = "";
  formsContainer.innerHTML = "";

  for (let i = 0; i < 9; i++) {
    // ─── Aba ───
    const tab = document.createElement("button");
    tab.textContent = `P${i + 1}`;
    tab.className = "passenger-tab";
    tab.id = `tab-${i}`;
    tab.type = "button";
    tab.dataset.index = i;
    tabsContainer.appendChild(tab);

    // ─── Formulário ───
    const form = document.createElement("div");
    form.className = "passenger-form";
    form.id = `form-${i}`;
    if (i === 0) form.classList.add("active");

    form.innerHTML = `
      <p class="section-title">Passageiro ${i + 1} — Identificação pessoal</p>

      <div class="row">
        <div class="field">
          <label for="firstName-${i}">Nome</label>
          <input
            type="text"
            id="firstName-${i}"
            name="firstName"
            data-index="${i}"
            data-testid="passenger-name"
            placeholder="Ex: João"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="lastName-${i}">Sobrenome</label>
          <input
            type="text"
            id="lastName-${i}"
            name="lastName"
            data-index="${i}"
            data-testid="passenger-lastname"
            placeholder="Ex: Silva"
            autocomplete="off"
          />
        </div>
      </div>

      <div class="row full">
        <div class="field">
          <label for="cpf-${i}">CPF</label>
          <input
            type="text"
            id="cpf-${i}"
            name="cpf"
            data-index="${i}"
            data-testid="cpf-field"
            placeholder="000.000.000-00"
            maxlength="14"
            autocomplete="off"
          />
        </div>
      </div>

      <div class="row full">
        <div class="field">
          <label for="birthDate-${i}">Data de nascimento</label>
          <input
            type="text"
            id="birthDate-${i}"
            name="birthDate"
            data-index="${i}"
            data-testid="birthdate"
            placeholder="DD/MM/AAAA"
            maxlength="10"
            autocomplete="off"
          />
        </div>
      </div>

      <p class="section-title" style="margin-top: 20px">Contato</p>

      <div class="row">
        <div class="field">
          <label for="email-${i}">E-mail</label>
          <input
            type="email"
            id="email-${i}"
            name="email"
            data-index="${i}"
            placeholder="email@exemplo.com"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="phone-${i}">Telefone</label>
          <input
            type="tel"
            id="phone-${i}"
            name="phone"
            data-index="${i}"
            placeholder="(00) 00000-0000"
            autocomplete="off"
          />
        </div>
      </div>
    `;

    formsContainer.appendChild(form);
  }

  // Setup event delegation for tab clicks
  tabsContainer.addEventListener("click", (e) => {
    const tab = e.target.closest(".passenger-tab");
    if (tab) {
      const index = parseInt(tab.dataset.index);
      passageiroAtual = index;
      mudarAbaAtiva(index);
    }
  });

  // Setup event delegation for form inputs
  formsContainer.addEventListener("change", (e) => {
    const input = e.target;
    if (input.tagName === "INPUT" && input.dataset.index !== undefined) {
      const index = parseInt(input.dataset.index);
      salvarDados(index);
    }
  });

  atualizarAbas();
}

function mudarAbaAtiva(index) {
  // Hide all forms
  document
    .querySelectorAll(".passenger-form")
    .forEach((f) => f.classList.remove("active"));
  // Show selected form
  document.getElementById(`form-${index}`).classList.add("active");

  atualizarAbas();
}

function atualizarAbas() {
  for (let i = 0; i < 9; i++) {
    const tab = document.getElementById(`tab-${i}`);
    const temDados =
      passageiros[i].firstName !== "" || passageiros[i].cpf !== "";

    tab.classList.remove("active", "filled");

    if (i === passageiroAtual) {
      tab.classList.add("active");
    }
    if (temDados) {
      tab.classList.add("filled");
    }
  }
}

function salvarDados(index) {
  // Get values from current form
  passageiros[index] = {
    firstName: document.getElementById(`firstName-${index}`).value || "",
    lastName: document.getElementById(`lastName-${index}`).value || "",
    cpf: document.getElementById(`cpf-${index}`).value || "",
    birthDate: document.getElementById(`birthDate-${index}`).value || "",
    email: document.getElementById(`email-${index}`).value || "",
    phone: document.getElementById(`phone-${index}`).value || "",
  };

  atualizarAbas();
}

function preencherFormulario(index, dados) {
  if (!dados) return;

  document.getElementById(`firstName-${index}`).value = dados.firstName || "";
  document.getElementById(`lastName-${index}`).value = dados.lastName || "";
  document.getElementById(`cpf-${index}`).value = dados.cpf || "";
  document.getElementById(`birthDate-${index}`).value = dados.birthDate || "";
  document.getElementById(`email-${index}`).value = dados.email || "";
  document.getElementById(`phone-${index}`).value = dados.phone || "";

  salvarDados(index);
}

// Escuta o evento OCR_AUTOFILL
window.addEventListener("OCR_AUTOFILL", (e) => {
  console.log("[Test Form] Dados recebidos via OCR_AUTOFILL:", e.detail);

  const dados = e.detail;
  if (dados) {
    preencherFormulario(passageiroAtual, {
      firstName: dados.primeiroNome || "",
      lastName: dados.sobrenome || "",
      cpf: dados.cpf || "",
      birthDate: dados.dataNascimento || "",
    });
  }
});

function handleSubmit() {
  console.log("[Test Form] Formulário enviado com dados:", passageiros);
  document.getElementById("status").style.display = "block";
}

// Receber dados quando upload.js redireciona com postMessage
window.addEventListener("message", (event) => {
  if (event.data.type === "OCR_COMPLETED") {
    console.log("[Test Form] Dados recebidos do upload:", event.data.data);
    const passageirosOCR = event.data.data;

    // Preencher os formulários com os dados recebidos
    passageirosOCR.forEach((dados, index) => {
      preencherFormulario(index, {
        firstName: dados.primeiroNome || dados.nome?.split(" ")[0] || "",
        lastName:
          dados.sobrenome || dados.nome?.split(" ").slice(1).join(" ") || "",
        cpf: dados.cpf || "",
        birthDate: dados.dataNascimento || "",
      });
    });

    // Mostrar mensagem de sucesso
    const status = document.getElementById("status");
    status.textContent = `✓ ${passageirosOCR.length} passageiro(s) importado(s) com sucesso!`;
    status.style.display = "block";
  }
});

// Listener para mensagens do Chrome runtime (responde corretamente para evitar erros)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Test Form] Mensagem recebida:", message);
  // Responder imediatamente para evitar erro de canal fechado
  sendResponse({ received: true });
  // Processar mensagem de forma assíncrona se necessário
  return false; // Não vamos responder de forma assíncrona
});

// Inicializar ao carregar
window.addEventListener("load", () => {
  console.log("[Test Form] Página carregou, criando formulários...");
  criarFormularios();
  
  // Tentar carregar dados salvos no storage
  setTimeout(() => {
    carregarDadosDoStorage();
  }, 500);
});

// Ler passageirosOCR do storage e auto-preencher
function carregarDadosDoStorage() {
  chrome.storage.local.get(['passageirosOCR'], (result) => {
    console.log("[Test Form] Dados do storage:", result);
    
    if (result.passageirosOCR && Array.isArray(result.passageirosOCR)) {
      console.log(`[Test Form] Auto-preenchendo ${result.passageirosOCR.length} passageiro(s)...`);
      
      result.passageirosOCR.forEach((dados, index) => {
        if (index >= 9) return; // Máximo 9 passageiros
        
        preencherFormulario(index, {
          firstName: dados.firstName || dados.nome?.split(" ")[0] || "",
          lastName: dados.lastName || dados.nome?.split(" ").slice(1).join(" ") || "",
          cpf: dados.cpf || "",
          birthDate: dados.birthDate || dados.dataNascimento || "",
        });
      });

      // Mostrar mensagem de sucesso
      const status = document.getElementById("status");
      status.textContent = `✓ ${result.passageirosOCR.length} passageiro(s) carregado(s) do OCR!`;
      status.style.display = "block";
    }
  });
}
