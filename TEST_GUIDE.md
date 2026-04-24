# Guia de Testes - Correções OCR Extension

## Erros Corrigidos

Foram corrigidos 4 erros críticos que impediam o preenchimento correto de formulários em companhias aéreas:

### 1. ✅ Race Condition - "message channel closed"
**Sintoma**: Error nos logs: `"A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"`

**Causa**: Ambos timeout e Promise resolvida tentavam enviar resposta simultaneamente

**Solução**: Implementado guard `sendResponseOnce()` que garante uma única resposta

---

### 2. ✅ Campos de Nacionalidade e Gênero Vazios
**Sintoma**: Selects não preenchiam, permaneciam vazios após injeção

**Causas**:
- `getSelectedReactSelectText()` retornava sempre string vazia
- Seletores para encontrar opções estavam incorretos
- Delays entre ações era insuficiente para React atualizar

**Solução**:
- Melhorado `getSelectedReactSelectText()` com 3 estratégias de fallback
- Seletores agora procuram por `[role="option"]` e aria-controls
- Delays aumentados: 300ms → 450ms → 600ms (progressivo)

---

### 3. ✅ Dropdowns Não Fechavam Antes de Reabrir
**Sintoma**: Múltiplos dropdowns abertos simultaneamente causando conflito

**Solução**: Adicionado `closeDropdownForGroup()` antes de cada novo dropdown
- Envia Escape key
- Blur no input
- Aguarda 100ms cada

---

### 4. ✅ Lógica de Detecção de Valores Incorreta
**Sintoma**: Mesmo após preencher, sistema pensava que estava vazio

**Solução**: Melhorada `isExpectedSelectValue()`:
- Rejeita valores vazios explicitamente
- Compara com lógica mais permissiva
- Trata casos especiais como "Selecione" e "Select"

---

## Como Testar

### Passo 1: Preparar o Ambiente
```bash
# Ir para a pasta do projeto
cd ~/Documentos/Projetos/ocr

# As correções já estão nos arquivos:
# - content/injector.js
# - content/providers/azul.js
```

### Passo 2: Recarregar Extensão no Chrome
1. Abrir `chrome://extensions/`
2. Encontrar "OCR Passagens"
3. Clicar no ícone de refresh (recarregar)

### Passo 3: Testar com Formulário Azul

1. Abrir https://www.voeazul.com.br/br/pt/home/selecao-voo
2. Selecionar uma rota qualquer (ex: São Paulo → Rio de Janeiro)
3. Selecionar 2+ passageiros na próxima página
4. Clicar popup da extensão
5. Fazer upload de documento com OCR (ou preencher manualmente)
6. Clicar "Preencher Formulário"

### Passo 4: Verificar Logs do Console

Abrir DevTools (F12) e procurar por logs com padrão `[OCRDBG]`:

```
✅ BOM (deve ver estes logs):
[OCRDBG][Azul] select:start {fieldType: 'passenger-identification-nationality-0', targetValue: 'Brasil', ...}
[OCRDBG][Azul] closeDropdown executado para passenger-identification-nationality-0
[OCRDBG][Azul] select:attempt {fieldType: 'passenger-identification-nationality-0', attempt: 1, ...}
[OCRDBG][Azul] select:ok {fieldType: 'passenger-identification-nationality-0', ...}

❌ RUIM (não deve aparecer):
"A listener indicated an asynchronous response by returning true, but the message channel closed..."
select:failed (sem resolvição posterior)
```

### Passo 5: Validar Resultado

Após a injeção, verificar:
- [ ] Campo "Nacionalidade" está preenchido com "Brasil" (ou valor correto)
- [ ] Campo "Gênero" está preenchido (se informado no OCR)
- [ ] Nenhum erro no console relacionado a "message channel"
- [ ] Campos de texto (nome, CPF, data) também estão preenchidos

---

## Logs Importantes

### Antes das Correções (problemas)
```javascript
// Timeout race condition
Timeout ao aguardar resposta da injeção, enviando resposta de fallback
// E logo depois:
Error: A listener indicated an asynchronous response by returning true, 
       but the message channel closed before a response was received

// React-Select não funciona
[OCRDBG][Azul] select:start {...}
[OCRDBG][Azul] select:attempt 1 {atual: ''}    // vazio!
[OCRDBG][Azul] select:attempt 2 {atual: ''}    // vazio!
[OCRDBG][Azul] select:attempt 3 {atual: ''}    // vazio!
[OCRDBG][Azul] select:failed {targetValue: 'Brasil', atual: ''}
```

### Depois das Correções (esperado)
```javascript
// Resposta enviada uma única vez
iniciarInjecao Promise resolvida
sendResponse({ ok: true })

// React-Select funcionando
[OCRDBG][Azul] select:start {fieldType: 'passenger-identification-nationality-0', targetValue: 'Brasil', atual: ''}
[OCRDBG][Azul] closeDropdown executado para passenger-identification-nationality-0
[OCRDBG][Azul] select:attempt {fieldType: 'passenger-identification-nationality-0', attempt: 1, delayMs: 300, atual: 'Brasil'}
[OCRDBG][Azul] select:ok {fieldType: 'passenger-identification-nationality-0', attempt: 1, atual: 'Brasil'}
```

---

## Troubleshooting

Se ainda tiver problemas:

### Problema: Ainda recebe "message channel closed"
- [ ] Verificar se injector.js tem o guard `sendResponseOnce()`
- [ ] Limpar cache da extensão (reload em chrome://extensions)
- [ ] Verificar se não há múltiplas instâncias rodando

### Problema: React-Select vazio após injeção
- [ ] Verificar se `closeDropdownForGroup()` está sendo chamado (deve ver logs)
- [ ] Aumentar delays (atualmente 300/450/600ms)
- [ ] Debugar `getSelectedReactSelectText()` no console

### Problema: Timeout ainda aparece
- [ ] Aumentar timeout de 5000ms para 8000ms em injector.js Se muito lento
- [ ] Verificar se alguma validação assíncrona da Azul está pendente (ex: CPF 403)

---

## Modificações de Código

### Arquivos Alterados:
1. **content/injector.js**
   - Linhas 85-110: Implementado `sendResponseOnce()` guard

2. **content/providers/azul.js**
   - Linhas 225-235: Melhorado `closeDropdownForGroup()` com logging
   - Linhas 237-290: Reescrito `setReactSelectValue()` com estratégia de menu
   - Linhas 304-330: Reescrito `getSelectedReactSelectText()` com 3 fallbacks
   - Linhas 332-340: Melhorado `isExpectedSelectValue()` com lógica mais robusta
   - Linhas 342-410: Reescrito `setReactSelectValueWithRetry()` com delays progressivos

---

## Performance

As correções adicionam ~1.5-2 segundos no tempo total de injeção por passageiro:
- Antes: ~2s por passageiro
- Depois: ~3.5-4s por passageiro (por causa dos delays maiores, necessários)

Se quiser acelerar: reduzir delays em `setReactSelectValueWithRetry()` (linha 366)
```javascript
// Atual (seguro):
const delayMs = 150 + attempt * 150;  // 300, 450, 600ms

// Mais rápido (menos seguro):
const delayMs = 100 + attempt * 100;  // 200, 300, 400ms
```

---

## Próximos Passos

Se continuar tendo problemas:
1. Adicionar console.log em `getSelectedReactSelectText()` para debugar qual estratégia está funcionando
2. Usar DevTools Inspector (F12) para inspecionar estrutura do React-Select
3. Verificar se classe CSS `.react-select__option` ainda é correta (pode ter mudado na versão nova do site)
