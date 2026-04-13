# Guia do Usuário: Ferramenta de Validação OCR de Passagens

## 1. Introdução

Bem-vindo ao Guia do Usuário da Ferramenta de Validação OCR de Passagens. Esta aplicação foi desenvolvida para simplificar e agilizar o processo de extração e validação de dados de passageiros a partir de imagens de documentos. Com uma interface intuitiva e moderna, você poderá revisar, editar e confirmar as informações de forma eficiente, garantindo a precisão dos dados.

Este guia abordará as funcionalidades essenciais da ferramenta, desde o upload de imagens até a finalização do processo de validação, focando na experiência de uso e nas melhores práticas para otimizar seu trabalho.

## 2. Visão Geral da Interface

A interface é dividida em seções claras para facilitar o fluxo de trabalho:

*   **Seção de Upload:** Onde você enviará as imagens dos documentos para processamento OCR.
*   **Seção de Resultados (Passageiros):** Após o OCR, esta área exibirá um resumo dos passageiros detectados e um formulário detalhado para validação e edição dos dados.

## 3. Utilizando a Seção de Upload

Esta é a primeira etapa para iniciar o processo de validação.

### 3.1. Enviando Imagens

Você tem duas opções para enviar suas imagens:

*   **Arrastar e Soltar:** Simplesmente arraste o arquivo de imagem (PNG, JPG ou WEBP, com no máximo 5MB) da sua pasta para a área indicada como "Arraste aqui ou clique para escolher".
*   **Clicar para Escolher:** Clique na área "Arraste aqui ou clique para escolher" para abrir o explorador de arquivos do seu sistema e selecione a imagem desejada.

### 3.2. Visualização e Troca de Imagem

Após o upload, uma pré-visualização da imagem será exibida na "Preview Box". Se precisar trocar a imagem, clique no botão "Trocar imagem" para selecionar um novo arquivo.

### 3.3. Processamento OCR

Uma vez que a imagem é enviada, a ferramenta iniciará o processamento OCR. Você verá um *spinner* de carregamento e uma mensagem "Processando OCR..." indicando que a análise está em andamento. Após a conclusão, uma mensagem de status (sucesso ou erro) será exibida.

## 4. Validando Dados na Seção de Passageiros

Após o processamento OCR, a seção de resultados será exibida, permitindo que você revise e valide os dados extraídos.

### 4.1. Resumo dos Passageiros

No topo da seção de resultados, você encontrará um painel com "cards" representando cada passageiro detectado. Cada card exibe:

*   **Número do Passageiro:** Um identificador visual para o passageiro.
*   **Nome:** O nome extraído do passageiro.
*   **Status:** Indica se o card está "Preenchido" (dados validados) ou "Pendente" (dados aguardando revisão).

**Navegação:** Clique em qualquer card de passageiro para carregar seus dados no formulário de edição abaixo. O card do passageiro atualmente selecionado será destacado com um brilho azul.

### 4.2. Formulário de Edição de Dados

Esta área contém os campos de dados extraídos pelo OCR, permitindo que você os revise e edite.

*   **Campos Principais:** Nome Completo, CPF e Data de Nascimento.
*   **Campos de Contato (Opcional):** E-mail e Telefone. Esta seção pode estar oculta inicialmente e aparecer conforme a necessidade.
*   **Gênero e Nacionalidade:** Campos de seleção (dropdown) para Gênero (com opção "Não informar") e Nacionalidade (com "Brasil" como padrão).

**Edição:** Clique em qualquer campo para editar o texto. Certifique-se de que as informações estejam corretas e completas. Os campos de seleção permitem escolher entre opções pré-definidas.

## 5. Botões de Ação

Na parte inferior da seção de resultados, você encontrará botões para gerenciar o fluxo de trabalho:

*   **"Selecionar imagem do passageiro atual"**: Permite associar uma nova imagem ao passageiro atualmente selecionado, caso seja necessário um novo OCR para dados específicos.
*   **"+ Adicionar outro passageiro"**: Adiciona um novo card de passageiro vazio, permitindo que você insira dados manualmente ou realize um novo upload para este passageiro.
*   **"Voltar"**: Retorna à seção de upload, descartando as alterações não salvas no passageiro atual.
*   **"🗑 Limpar passageiro atual"**: Limpa todos os campos do formulário do passageiro atualmente selecionado.
*   **"✓ Finalizar e ir ao formulário"**: Conclui o processo de validação para todos os passageiros e avança para a próxima etapa do fluxo de trabalho (fora desta interface).

## 6. Dicas para um Uso Eficiente

*   **Qualidade da Imagem:** Para melhores resultados de OCR, utilize imagens claras, bem iluminadas e com o texto nítido.
*   **Revisão Cuidadosa:** Sempre revise os dados extraídos pelo OCR, pois erros podem ocorrer devido à qualidade da imagem ou complexidade do documento.
*   **Navegação Rápida:** Utilize os cards de passageiros para alternar rapidamente entre os dados e garantir que todos foram validados.

Esperamos que este guia torne sua experiência com a Ferramenta de Validação OCR de Passagens produtiva e agradável. Em caso de dúvidas ou problemas, consulte a documentação técnica ou entre em contato com o suporte.
