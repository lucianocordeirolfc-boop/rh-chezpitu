# STATUS DO PROJETO RH CHEZ PITU

## Ambiente

GitHub: OK
Firebase Hosting: OK (produção: chez-pitu-rh.web.app / chez-pitu-rh.firebaseapp.com)
Firebase (Auth/Database): OK
Cursor: OK

## Status Geral

**Versão:** 20260907.01 (Escala de Folga impressa: folha inteira e layout
idêntico entre Chez Pitu e Pengold)
**Data:** 2026-09-07
**Status:** ✅ ESTÁVEL - Publicado em Produção (Firebase Hosting)

## Último Deploy

Data: 07/09/2026
Versão: 20260907.01 (Firebase Hosting — chez-pitu-rh)
Commits: `ed21969` (fix) + `4ea49f5` (carimbo de build)

**Escala de Folga — versão impressa.** A folha passou a usar toda a largura do
A4 e as duas empresas saem com a mesma geometria. Nos PDFs de referência de
Setembro/2026, Chez Pitu ocupava **256,1mm** e Pengold **280,0mm** dos 297mm,
com colunas de dia de larguras diferentes.

Duas causas somadas: (1) o **auto-fit media o layout de tela** — a geometria de
impressão vivia dentro de `@media print`, então `applyPrintFitScale` enxergava
cabeçalho e logo maiores, campos `.no-print` ainda visíveis e rodapé mais
espaçado, devolvendo 811px contra 755px reais; o fator saía menor que 1 sem
necessidade e a folha encolhia **duas vezes**; (2) a **redução era uniforme** —
o `transform: scale()` encolhia junto a largura, que não precisa ceder (são
sempre 30/31 dias mais a coluna de nomes). Como a sobra depende de quantas
linhas e setores cada empresa tem, cada uma recebia um fator diferente.

Correção: a geometria da folha saiu de `@media print` para um bloco próprio
ancorado em `#scalePrintContainer` (criado e removido por `printScale`), de modo
que a medição enxergue o que vai para o papel; as regras de pré-visualização
foram escopadas em `.scale-print-preview-scroll`; largura, margens laterais e
coluna de nomes passaram a ser **compensadas pelo fator**
(`calc(297mm / var(--scale-print-fit))`); a coluna de nomes ficou **fixa em
26mm**, independente da densidade; a margem lateral caiu de 4mm para 2,5mm; e
`applyPrintFitScale` virou um ponto fixo de 3 rodadas com conferência final de
altura (nunca cortar funcionário nem gerar 2ª página).

Resultado medido no vetor dos PDFs: **297,0mm de largura usada nas duas
empresas**, coluna de nome **26mm** e coluna de dia **8,86mm** em todos os
quadros testados (8, 17, 20, 30, 40 e 48 funcionários). Nos dois PDFs de 17
funcionários, as **76 bordas verticais da grade caem no mesmo x** — só as cores
do tema diferem.

Homologação: `scripts/verify-print-escala.mjs` reescrito para reproduzir o fluxo
real (marcava `body.printing-scale` **antes** de medir, e por isso o bug passava
batido), com asserções novas de medição `screen` = `print`, ocupação ≥97% da
folha e comparação direta Chez Pitu × Pengold — **119 asserções, 0 falhas**
(antes 55). `npm test` 47/47 e `npm run validate` 20/20 suítes, tudo com
fixtures: nenhum dado de produção foi lido ou alterado.

**Pendência mantida de propósito:** na vertical a folha segue alinhada ao topo
(Pengold com 15 funcionários usa ~176mm dos 210mm). Preencher a sobra exigiria
esticar as linhas, o que faria a altura de linha variar entre as empresas — o
oposto do layout idêntico pedido.

**Cache-busting:** todos os `?v=` do index.html em `20260907.01`.

## Deploy 20260829.02

Data: 29/08/2026
Versão: 20260829.02 (Firebase Hosting — chez-pitu-rh)
Commits: `3a1cf80` (feat) + `6c7e701` (carimbo de build)

Sub-aba **Lançamentos** (a aba Resumo não foi tocada): a grade passou a mostrar
**só funcionários com lançamento no mês** — registro com os oito campos zerados
não conta e sai da tela, embora continue gravado — em **ordem alfabética igual à
da aba Resumo** (`localeCompare` pt-BR sobre o nome oficial, aplicado a uma
cópia do array para não reordenar o dado gravado). Ao lado do botão
"+ Lançamento" entrou a linha **"Somente funcionários com lançamentos no mês"**,
centralizada no espaço entre o fim do botão e a borda da última coluna (Vales).

**Cache-busting:** todos os `?v=` do index.html em `20260829.02`.

## Deploy 20260829.01

Data: 29/08/2026
Versão: 20260829.01 (Firebase Hosting — chez-pitu-rh)
Commits: `252db7d` (feat) + `6bdf383` (carimbo de build)

Informações Contador: o botão **"+ Novo Lançamento"** virou **"+ Lançamento"** e
o pop-up passou a nascer com a base do **mês selecionado na barra ao lado** —
escolher o funcionário traz os oito campos preenchidos com o que já está
registrado no período (e a lista marca com "•" quem já tem lançamento no mês).
Salvar faz **merge** sobre o registro existente: grava só o funcionário
selecionado, preserva campos fora do formulário (`updatedAt`, dados legados) e
deixa os lançamentos dos demais intactos; o formulário recarrega os valores
gravados em vez de se limpar. A **coluna "Ações"** saiu da tabela de
lançamentos, com os botões editar/excluir — a edição é toda pelo pop-up
(`deleteLancamento` permanece, sem gatilho de UI, para uso programático). O
submit passou a gravar na mesma empresa de onde leu (`getPrimaryPageCompany`),
em vez de resolver de novo por `getActiveCompany`.

## Deploy 20260822.03

Data: 22/08/2026
Versão: 20260822.03 (Firebase Hosting — chez-pitu-rh)
Commits: `1e2105a` (feat) + `2a459a1` (carimbo de build)

Inclui a frente de **funcionários inativos**: funcionário com status Inativo
deixa de aparecer no Cadastro de Funcionários e no Controle de Feriados (o dado
nunca é apagado — some apenas da tela); botão **"Mostrar funcionários inativos
(N)"** nas duas telas, com seletor de checkbox individual para trazer de volta
quem o usuário quiser, via o módulo compartilhado `js/inactive-employees.js`; e
**data de desligamento obrigatória** ao inativar, tanto pelo botão "Inativar"
quanto pelo formulário, validada contra data futura e contra data anterior à
admissão. A data alimenta `deactivatedAt`, que a Escala já usa para exibir o
funcionário até o mês da saída — antes o sistema assumia sempre "hoje".

Na mesma data, dois ajustes anteriores na tela principal do Controle de
Feriados (deploys `20260822.01` e `20260822.02`): saída do botão **"Excluir
feriado"**, que duplicava fora do modal uma ação destrutiva ao lado de "Excluir
vínculo", e do **"+ Funcionário"**, redundante com o botão global "+ Vincular
funcionário a feriado". A coluna Ações ficou uniforme: data de compensação +
"Excluir vínculo" em toda linha.

Usuários recebem a nova versão automaticamente no próximo carregamento
(Ctrl+F5 força).

## Regra fixa vigente

⚠️ **Imutabilidade dos dados já registrados** — melhoria, correção ou teste nunca
altera feriados lançados, escala, VT, ausências, lançamentos do Contador ou
cadastro. Teste em fixtures/`scripts/verify-*.mjs`; validação em produção é
somente leitura. Ver `PROJECT_RULES.md`.

**Validação em produção:** ⏳ a entrega de 07/09/2026 (`20260907.01` — escala
impressa) aguarda conferência visual do usuário: gerar Setembro/2026 nas duas
empresas (Ctrl+F5) e comparar com os PDFs de referência. ✅ as duas entregas de
29/08/2026 (`20260829.01` e `20260829.02`) foram **aprovadas pelo usuário** em
produção, inclusive o critério de que lançamento com todos os campos zerados não
aparece na grade da sub-aba Lançamentos (o registro continua gravado).

**Próximo deploy recomendado:** conforme novas demandas.

## Módulos

Escala de Folga: OK (+ guarda anti auto-vínculo vencido; impressão usando a
folha A4 inteira, com a mesma geometria nas duas empresas)
Vale Transporte: OK
Ausências: OK
Controle de Feriados: OK (+ exclusão definitiva de feriado e de vínculo; só
funcionários ativos, com seletor de inativos)
Cadastro: OK (+ inativação com data de desligamento obrigatória, exclusão 24h,
auditoria; só funcionários ativos, com seletor de inativos)
Informações Contador: OK (+ pop-up "+ Lançamento" com a base do mês
selecionado; tela de lançamentos sem coluna Ações, só com quem tem lançamento no
mês e em ordem alfabética)
Dashboard: OK

## Testes

**Unit/Functional Tests:**
- npm test: 47/47 ✓
- npm run validate: 20/20 suítes ✓

**Offline Recovery Tests:**
- npm run test:offline: 15/15 ✓

**Homologação da frente atual (`scripts/verify-*.mjs`, sandbox com fixtures):**
- scripts/verify-print-escala.mjs: 119/119 ✓ (impressão da escala no Chrome
  real: 1 única página A4 paisagem em quadros de 8 a 48 funcionários, ninguém
  cortado, auto-fit medido no layout impresso — medição `screen` = medição
  `print` —, grade ocupando ≥97% dos 297mm e geometria idêntica entre Chez Pitu
  e Pengold com o mesmo quadro)
- scripts/verify-contador-lancamento-popup.mjs: 60/60 ✓ (pop-up "+ Lançamento"
  no Chrome real: base do mês, merge por funcionário, demais registros intactos,
  grade filtrada e ordenada, layout do aviso e aba Resumo preservada)
- verify-exclusao-feriado-definitiva.mjs: 15/15 ✓
- verify-vinculo-tombstone.mjs: 16/16 ✓
- verify-auto-vinculo-vencido-guard.mjs: 4/4 ✓
- verify-feriados-retroativos.mjs: 25/25 ✓
- scripts/verify-inativo-escala.mjs: 12/12 ✓ (deactivatedAt + visibilidade na Escala)
- scripts/verify-inativos-visibilidade.mjs: 25/25 ✓ (inativo fora das telas +
  data de desligamento obrigatória)
- scripts/verify-inativos-picker-ui.mjs: 17/17 ✓ (seletor de inativos exercitado
  no Chrome real, via puppeteer)

**Portão de qualidade (07/09/2026):** `npm test` 47/47 e `npm run validate`
20/20 suítes — ambos verdes antes do commit e do deploy ✅

## Fase 3A — Segurança Operacional

✅ **Implementado:**
1. Teste Offline → Online (5 cenários)
2. Proteção múltiplas abas (detecção automática)
3. Soft Delete feriados (recuperação possível)
4. Confirmação obrigatória (ações críticas)
5. Validação Padroeira (contínua, a cada 10s)

✅ **Impacto Zero:**
- Layout: sem alteração
- Funcionalidades: sem alteração
- Performance: overhead < 1%
- Dados: zero perda (soft delete + backup)

**Arquivos novos:** 2
- js/security-operations.js (200L)
- scripts/test-offline-recovery.mjs (300L)

**Arquivos modificados:** 6
- js/data.js (+130L)
- js/funcionarios.js (+15L)
- js/feriados.js (+20L)
- index.html (+1L)
- package.json (+1L)
- scripts/run-functional-validation.mjs (+3L)

**Documentação:** 4 novos arquivos
- AUDITORIA_ARQUITETURA_FASE2.md
- FASE3_ROADMAP_DETALHADO.md
- AUDITORIA_RESUMO_EXECUTIVO.md
- FASE3A_IMPLEMENTACAO_CONCLUIDA.md

## Problemas Conhecidos

Nenhum crítico.

**Monitorar:**
- Padroeira de Búzios: validação contínua ativa
- Soft delete feriados: UI filtra isDeleted=true
- Múltiplas abas: notificação apenas (sem bloqueio)

## Próxima Evolução

### Fase 3B (Opcional)
- Retry exponencial Firebase (backoff automático)
- Heartbeat Firebase (ping a cada 30s)
- Dialog customizado (trocar window.confirm)
- Auditoria de ações (logs de quem/quando)
- Testes multi-abas com SharedWorker

### Futuro
- Dashboard gerencial
- Auditoria automática de vínculos
- Relatórios PDF avançados
- Backup automático diário