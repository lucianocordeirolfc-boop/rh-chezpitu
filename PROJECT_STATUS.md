# STATUS DO PROJETO RH CHEZ PITU

## Ambiente

GitHub: OK
Firebase Hosting: OK (produção: chez-pitu-rh.web.app / chez-pitu-rh.firebaseapp.com)
Firebase (Auth/Database): OK
Cursor: OK

## Status Geral

**Versão:** 20260829.02 (Contador: pop-up "+ Lançamento" com os dados do mês;
grade de Lançamentos só com quem tem lançamento, em ordem alfabética)
**Data:** 2026-08-29
**Status:** ✅ ESTÁVEL - Publicado em Produção (Firebase Hosting)

## Último Deploy

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

## Deploy anterior

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

**Próximo deploy recomendado:** conforme novas demandas.

## Módulos

Escala de Folga: OK (+ guarda anti auto-vínculo vencido)
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

**Portão de qualidade (29/08/2026):** `npm test` 47/47 e `npm run validate`
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