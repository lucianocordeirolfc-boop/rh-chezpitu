# PROJECT_HISTORY.md — Histórico do Projeto RH Chez Pitu

Este arquivo registra decisões, bugs recorrentes e correções importantes.

## 2026-06 — QuotaExceededError no localStorage (CORRIGIDO)

Problema:
Em produção, `setItem` da chave `chezPituPeopleSystem.v1` estourava a cota
(`QuotaExceededError`) em `js/data.js` → `setRemoteState()` (e `saveState()`),
quebrando a sincronização.

Causa raiz:
Gravava-se o estado inteiro (empresas, funcionários, feriados, escalas, ausências,
históricos/backups e logos base64) sem try/catch. Maiores vilões: backups
(`companyInfoHistory`) e logos base64. Em `saveState`, o `setItem` vinha antes do
`FirebaseSync.save`; ao lançar, o Firebase nem era chamado.

Correção:
Persistência em camadas (`persistStateToLocal`) que nunca lança:
- full → slim (sem logos/backups/soft-deletados/alertas) → lean (só sessão/empresa/
  filtros/preferências/versão de cache) → desligado (mantém Firebase).
`saveState` chama o Firebase sempre. Migração segura: `loadState` tolera payloads
full/slim/lean; reload reconstrói empresas e o merge com Firebase restaura o operacional.
try/catch em todos os setItem. Diagnóstico: `AppData.measureStorageUsage()`.

Arquivos:
- js/data.js, js/funcionarios.js, package.json
- scripts/test-storage-quota.mjs (25), CORRECAO_QUOTA_LOCALSTORAGE.md

Testes:
- npm test → 47/47
- npm run validate → funcional 183/183, offline 15/15, dedup 44/44, quota 25/25

Status: ✅ CORRIGIDO E TESTADO. Sem commit/deploy (aguarda autorização).

## 2026-06 — Fase 3A-2: Feriados Duplicados (CORRIGIDO)

Problema:
Mesmo feriado (data + nome) aparecia DUAS VEZES no histórico. Exemplo:
Funcionária CAMILA (Pengold) — Corpus Christi (04/06/2026):
  - Registro 1: Agendado com compensação 12/06/2026
  - Registro 2: Pendente sem compensação

Regra violada: Um feriado trabalhado por um funcionário deve aparecer 1x (ou 0x).

Causa raiz:
Função syncAutoHolidaysWorkedForMonth() em js/scale-rules.js:
  1. Verificava se "O FUNCIONÁRIO tem algum feriado no dia" (não este feriado específico)
  2. Processava apenas o PRIMEIRO feriado do dia (ignorava múltiplos)
  3. Se existia um registro Agendado com CO, criava outro Pendente (duplicata)

Correção implementada:
1. Loop por CADA feriado no dia (suporta múltiplos feriados mesma data)
2. Verificação per-feriado: se ESTE FUNCIONÁRIO já existe NESTE FERIADO → skip
3. Deduplicação automática (findOrMergeDuplicateHolidays):
   - Consolida workedEmployees únicos por employeeId
   - Mantém registro mais completo (Agendado > Pendente)
   - Soft delete no duplicado (preserva dados)
4. Deduplicação global (deduplicateAllHolidays):
   - Processa todas as empresas
   - Script de migração idempotente

Arquivos alterados:
- js/scale-rules.js (+71/-71) — Loop múltiplos, verificação per-feriado
- js/data.js (+183) — findOrMergeDuplicateHolidays, deduplicateAllHolidays
- package.json (+3) — Novo script test:dedup

Novos arquivos:
- scripts/test-holiday-deduplication.mjs (300L) — 9 testes deduplicação
- scripts/migrate-deduplicate-holidays.mjs (160L) — Migração segura, idempotente
- CORRECAO_FERIADOS_DUPLICADOS.md (400L) — Documentação técnica

Testes:
- npm test → 47/47 (unitários — sem regressão)
- npm run validate → 183/183 (funcional) + 15/15 (offline) + 9/9 (dedup) = 207/207 ✓
- Total: 254/254 testes APROVADOS

Caso Camila validado:
✓ Corpus Christi 04/06/2026 não aparece duas vezes
✓ Mantém status Agendado (não Pendente)
✓ Preserva compensação 12/06/2026
✓ Consolidado em 1 único registro

Regras de consolidação:
- Chave de unicidade: employeeId + data feriado + nome normalizado
- Preferência: Agendado (com compensationDate) > Pendente
- Soft delete no duplicado (isDeleted=true, deletedAt=todayISO)
- Sem perda de dados

Status: ✅ CORRIGIDO E TESTADO. Pronto para produção.

---

## 2026-06 — "Natal 2025" aparecia só no modal CO (fonte divergente do Histórico)

Problema:
O feriado "Natal (25/12/2025) — Vencido" não aparecia no Controle de Feriados, mas
aparecia no dropdown do modal CO ao vincular CO na Escala.

Origem do registro:
Não era fonte legada/calendarHolidays/seed/cache. Era o mesmo data.holidays usado pelo
Controle de Feriados: um feriado "Natal" 2025-12-25 com workedEmployees do funcionário,
porém com data trabalhada ANTERIOR à admissão do funcionário.

Causa raiz:
O Controle de Feriados (feriados.js, buildLines) filtrava vínculos com
holiday.date < emp.admissionDate, escondendo o registro. A função do modal CO
(getAvailableCoHolidayOptions) não tinha essa guarda — ela existia no caminho antigo
(isWorkedHolidayPendingInFeriadosControl) e se perdeu na unificação anterior das funções
de CO. Resultado: o feriado aparecia só no dropdown da Escala.

Correção:
Predicado único de visibilidade do Histórico em js/data.js —
isWorkedEntryVisibleInHistory(holiday, item, data): false se soft-deleted, sem employeeId,
ou holiday.date < admissionDate. Usado nos dois lugares.

Regras:
- Dropdown CO = subconjunto estrito do Histórico oficial válido.
- Se o Controle de Feriados não exibe, o modal CO também não exibe.
- Mesma base (data.holidays da empresa ativa) + mesma função de validade nos dois pontos.
- Nada recriado/apagado: o registro permanece em data.holidays, apenas deixa de ser oferecido.

Arquivos:
- js/data.js (isWorkedEntryVisibleInHistory + uso em getAvailableCoHolidayOptions + export)
- js/feriados.js (buildLines usa AppData.isWorkedEntryVisibleInHistory)
- scripts/test-holiday-deduplication.mjs (testNatal2025NotVisibleBeforeAdmission + subconjunto)

Testes:
- npm test → 47/47
- npm run validate → funcional 183/183, offline 15/15, dedup/CO 44/44

## 2026-06 — Dropdown do modal CO (Escala) mostrava feriados indisponíveis

Problema:
Ao abrir o modal CO pela Escala de Folga, o dropdown listava feriados já
compensados, agendados, com data de compensação prevista ou já com CO lançado
na escala (inclusive futuro). O Controle de Feriados (histórico) já estava correto.

Causa raiz:
Havia dois caminhos divergentes alimentando opções de CO — getAvailableHolidaysForCo
(usado pelo dropdown) e getPendingCoHolidaysForEmployee (auto-vínculo). A checagem era
por registro isolado, não por chave lógica. Quando o mesmo feriado existia em registros
distintos (ex.: um Agendado com CO + um Pendente da escala, ids diferentes), o índice de
CO mapeava só o id do Agendado; o registro Pendente, com outro id, escapava do filtro e
aparecia no dropdown.

Correção:
Fonte única getAvailableCoHolidayOptions(employeeId, coDate, { company, data }) que agrupa
por chave lógica (employeeId + empresa + nome normalizado + data trabalhada) e decide UMA
opção por chave.

Regras (dropdown CO):
- feriado vinculado a ESTE CO (em edição) permanece selecionável;
- se qualquer registro da chave estiver Agendado/Compensado, tiver compensationDate ou já
  tiver CO na escala (qualquer data) → a chave inteira some (remove o Pendente duplicado);
- caso contrário, oferece um único representante Pendente/Vencido;
- exclui soft-deleted, duplicados, outro employeeId e outra empresa (escopo da aba ativa).
- getAvailableHolidaysForCo e getPendingCoHolidaysForEmployee viram aliases da fonte única.

Arquivos:
- js/data.js (getAvailableCoHolidayOptions + aliases + export)
- js/escala.js (modal CO usa getAvailableCoHolidayOptions)
- scripts/test-holiday-deduplication.mjs (cenários do dropdown CO)

Escopo:
O erro estava apenas na montagem das opções do modal CO da Escala. O histórico do
Controle de Feriados não foi alterado.

Testes:
- npm test → 47/47
- npm run validate → funcional 183/183, offline 15/15, dedup/CO 39/39

## 2026-06 — Feriados duplicados (cadastro, filtro e histórico)

Problema:
No filtro "Feriado" do Controle de Feriados apareciam feriados repetidos (ex.: Ano Novo
2026, Corpus Christi). Existiam registros duplicados com mesma data + nome e ids diferentes.

Causa raiz:
Já existia função de deduplicação (findOrMergeDuplicateHolidays), porém nunca era chamada
em tempo de execução — só em scripts. A normalização de carga (mergeHolidayLists) deduplica
apenas por id; o calendário global (state.calendarHolidays) não tinha dedup por nome + data;
e o dropdown listava todos os data.holidays (incluindo soft-deletados e duplicados).

Correção:
- Dedup por bloco de empresa (mergeDuplicateHolidaysInBlock) agora roda automaticamente e de
  forma idempotente a cada carga, dentro de normalizeCompanyHolidays.
- Novo dedupeCalendarHolidays() (chave nome + data, unindo empresas) chamado em
  finalizeIncomingState.
- Dropdown "Feriado" passa a ignorar isDeleted e deduplicar por nome + data.
- Modal CO ignora feriados soft-deletados.

Regras (dedup):
- Chave de unicidade: data + nome normalizado (por empresa/aplicação).
- Registro canônico = o mais completo; vínculo Compensado/Agendado nunca vira Pendente.
- Remoção por soft delete (isDeleted/deletedAt); nunca destrutiva.
- Vínculos CO (manualScale.linkedHolidayId e item.linkedHolidayId) são religados do id removido
  para o id canônico, preservando o vínculo.
- Empresas/funcionários diferentes podem ter o mesmo feriado sem conflito.

Arquivos:
- js/data.js, js/feriados.js
- scripts/test-holiday-deduplication.mjs, scripts/migrate-deduplicate-holidays.mjs

Migração:
node scripts/migrate-deduplicate-holidays.mjs — idempotente; dados em produção são limpos no
próximo carregamento de cada navegador (normalizeCompanyHolidays + dedupeCalendarHolidays).

## 2026-06 — Fase 3A Segurança Operacional

Objetivo:
Implementar primeira camada de segurança operacional sem alterar layout ou funcionalidades.

Implementado:
- Teste Offline → Online (5 cenários testados)
- Proteção contra múltiplas abas abertas
- Soft Delete para feriados (recuperação possível)
- Confirmação obrigatória para ações críticas
- Validação contínua de Padroeira de Búzios

Decisões:
1. Soft Delete não apaga dados — apenas marca isDeleted=true
2. Confirmações usam window.confirm() nativo (sem alterar layout)
3. Validação Padroeira roda a cada 10s (imperceptível)
4. Detecção múltiplas abas não bloqueia (apenas avisa)

Regras:
- removeHoliday() marca como deletado, não remove array
- restoreHoliday() permite restauração
- getActiveHolidays() filtra deletados na UI
- validatePadroeiraBuziosIntegrity() falha se encontrar 21/05
- correctPadroeiraBuziosAutomatically() corrige para 26/07

Impacto:
- Zero perda de dados (soft delete + recuperação)
- Zero impacto visual (confirmações nativas)
- Zero overhead performance (< 1%)
- 245/245 testes passando

Status:
Pronto para produção.

## 2026-05 — Refatoração de empresas

Problema:
O sistema usava conceito de empresa ativa global.

Impacto:
- funcionários apareciam em empresa errada
- filtros divergiam
- VT, Feriados e Escala podiam misturar Chez Pitu e Pengold

Decisão:
Remover dependência de empresa ativa global.

Regra:
Cada página deve possuir filtro próprio de empresa quando necessário.

## 2026-05 — employeeId como vínculo principal

Problema:
Alguns vínculos eram feitos por nome do funcionário.

Impacto:
- risco de duplicidade
- risco de vínculo incorreto
- CO podia listar feriados de outro funcionário

Decisão:
employeeId é o vínculo principal.

Nome só pode ser fallback para migração segura.

## 2026-05 — CO e Vale-transporte

Problema:
Código CO não abatida dias no cálculo de Vale-transporte.

Correção:
CO passa a ser considerado dia não trabalhado.

Regra:
CO deve abater VT.

## 2026-05 — Modal CO

Problema:
Ao lançar CO na escala, o modal mostrava feriados pendentes globais, inclusive de outros funcionários.

Correção:
Modal CO deve listar somente feriados pendentes do funcionário clicado.

Filtros obrigatórios:
- employeeId
- empresa
- status pendente ou vencido
- não compensado
- não vinculado

## 2026-05 — Padroeira de Búzios

Problema:
Feriado Padroeira de Búzios voltou a aparecer como 21/05.

Correção:
Data correta fixada como 26/07.

Regra:
Nunca usar 21/05 para Padroeira de Búzios.

Sempre verificar seeds, defaults, Firebase, localStorage e migrações.

## 2026-05 — Ausências e VT

Problema:
Lançamento manual na escala podia anular ausência cadastrada no cálculo de VT.

Correção:
Ausência cadastrada deve prevalecer para cálculo de VT.

Regra:
Se houver conflito, registrar alerta, mas não ignorar ausência.

## 2026-05 — Contador Resumo

Problema:
Havia duplicidade de seletor de empresa na sub aba Resumo.

Correção:
Manter apenas um seletor de empresa alinhado com mês, ano e botão Imprimir/PDF.

## 2026-05 — Deploy

Projeto conectado:
- GitHub: lucianocordeirolfc-boop/rh-chezpitu
- Netlify: rh-chezpitu.netlify.app

Fluxo recomendado:
1. testar
2. commit
3. push main
4. validar deploy Netlify