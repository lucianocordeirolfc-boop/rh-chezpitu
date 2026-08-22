# STATUS DO PROJETO RH CHEZ PITU

## Ambiente

GitHub: OK
Firebase Hosting: OK (produção: chez-pitu-rh.web.app / chez-pitu-rh.firebaseapp.com)
Firebase (Auth/Database): OK
Cursor: OK

## Status Geral

**Versão:** 20260822.03 (Funcionário inativo fora das telas operacionais + data
de desligamento obrigatória; limpeza de ações da tela de Feriados)
**Data:** 2026-08-22
**Status:** ✅ ESTÁVEL - Publicado em Produção (Firebase Hosting)

## Último Deploy

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

**Cache-busting:** todos os `?v=` do index.html em `20260822.03` — usuários
recebem a nova versão automaticamente no próximo carregamento (Ctrl+F5 força).

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
Informações Contador: OK
Dashboard: OK

## Testes

**Unit/Functional Tests:**
- npm test: 47/47 ✓
- npm run validate: 19/19 suítes ✓

**Offline Recovery Tests:**
- npm run test:offline: 15/15 ✓

**Homologação da frente atual (`scripts/verify-*.mjs`, sandbox com fixtures):**
- verify-exclusao-feriado-definitiva.mjs: 15/15 ✓
- verify-vinculo-tombstone.mjs: 16/16 ✓
- verify-auto-vinculo-vencido-guard.mjs: 4/4 ✓
- verify-feriados-retroativos.mjs: 25/25 ✓
- scripts/verify-inativo-escala.mjs: 12/12 ✓ (deactivatedAt + visibilidade na Escala)
- scripts/verify-inativos-visibilidade.mjs: 25/25 ✓ (inativo fora das telas +
  data de desligamento obrigatória)
- scripts/verify-inativos-picker-ui.mjs: 17/17 ✓ (seletor de inativos exercitado
  no Chrome real, via puppeteer)

**Portão de qualidade (22/08/2026):** `npm test` 47/47 e `npm run validate`
19/19 suítes — ambos verdes antes do commit e do deploy ✅

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