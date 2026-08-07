# STATUS DO PROJETO RH CHEZ PITU

## Ambiente

GitHub: OK
Firebase Hosting: OK (produção: chez-pitu-rh.web.app / chez-pitu-rh.firebaseapp.com)
Firebase (Auth/Database): OK
Cursor: OK

## Status Geral

**Versão:** 20260806.03 (Feriados: exclusão definitiva de feriado e de vínculo +
guarda anti-regressão do auto-vínculo)
**Data:** 2026-08-06
**Status:** ✅ ESTÁVEL - Publicado em Produção (Firebase Hosting)

## Último Deploy

Data: 06/08/2026
Versão: 20260806.03 (Firebase Hosting — chez-pitu-rh)
Commits: `954f7cd` + `cfab872` · `d663d67` + `73fb812` · `aade7e6` + `e3dd4f7`

Inclui: **exclusão DEFINITIVA de feriado** (tombstone por conteúdo `data|nome`,
remove duplicatas e bloqueia ressurreição por merge, calendário e seeds 2026);
**exclusão DEFINITIVA de vínculo** funcionário × feriado (`workedLinkTombstones`,
chave `data|nome|employeeId`), impedindo recriação pelo auto-vínculo da escala e
pela união do merge entre PCs — tombstones trafegam **aninhados** no nó
`tombstones` do RTDB (sem novo nó de topo, evitando `permission_denied`);
**guarda anti-regressão** em `syncAutoHolidaysWorkedForMonth`, que deixa de criar
auto-vínculo para feriado com prazo de 120 dias já expirado (não nasce Vencido).

**Cache-busting:** todos os `?v=` do index.html em `20260806.03` — usuários
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
Controle de Feriados: OK (+ exclusão definitiva de feriado e de vínculo)
Cadastro: OK (+ confirmação inativação, exclusão 24h, auditoria)
Informações Contador: OK
Dashboard: OK

## Testes

**Unit/Functional Tests:**
- npm test: 47/47 ✓
- npm run validate: 183/183 ✓

**Offline Recovery Tests:**
- npm run test:offline: 15/15 ✓

**Homologação da frente atual (`scripts/verify-*.mjs`, sandbox com fixtures):**
- verify-exclusao-feriado-definitiva.mjs: 15/15 ✓
- verify-vinculo-tombstone.mjs: 16/16 ✓
- verify-auto-vinculo-vencido-guard.mjs: 4/4 ✓
- verify-feriados-retroativos.mjs: 25/25 ✓
- scripts/verify-inativo-escala.mjs: 12/12 ✓ (deactivatedAt + visibilidade na Escala)

**Total:** 245/245 testes passando ✅

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