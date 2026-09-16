# BUGS_CONHECIDOS.md — RH Chez Pitu

Este arquivo lista bugs conhecidos, riscos e pontos de atenção.

## Bug: Padroeira de Búzios em 21/05

Status:
Corrigido, mas deve ser sempre monitorado.

Descrição:
O sistema já recriou Padroeira de Búzios como 21/05 após refatorações.

Regra correta:
Padroeira de Búzios = 26/07.

Onde verificar:
- js/data.js
- js/feriados.js
- js/escala.js
- Firebase sync
- localStorage
- seeds
- defaults
- migrações

## Bug: Modal CO com feriados de outros funcionários

Status:
Corrigido, mas crítico.

Descrição:
Modal CO já exibiu feriados pendentes globais, inclusive de outros funcionários.

Regra correta:
Modal CO deve listar apenas feriados pendentes do employeeId selecionado.

## Bug: CO não abatendo Vale-transporte

Status:
Corrigido.

Regra correta:
CO é dia não trabalhado para VT.

## Bug: Mistura de empresas

Status:
Corrigido parcialmente em refatoração.

Descrição:
Funcionários da Chez Pitu já apareceram em Pengold.

Regra correta:
Empresa vem do Cadastro de Funcionários.

## Bug: Empresa ativa global

Status:
Deve ser evitado.

Descrição:
O conceito de empresa ativa global causou conflitos.

Regra correta:
Cada página deve ter seu próprio filtro de empresa.

## Bug: Ausência anulada por lançamento manual

Status:
Corrigido.

Regra:
Ausência cadastrada prevalece para cálculo de VT.

## Bug: chave inválida derruba a sincronização do computador

Status:
Corrigido em 16/09/2026 (versão 20260916.01), mas deve ser sempre monitorado.

Descrição:
O Realtime Database recusa chave que contenha `.` `#` `$` `/` `[` `]` — e a
recusa é SÍNCRONA (`ref.update()` lança). Os tombstones de exclusão definitiva
montavam a chave com o nome do feriado digitado pelo usuário, então excluir um
feriado como "Sto. Antônio" ou "Carnaval 16/02" tornava o payload inválido para
sempre naquele PC. Como `save()` não tratava a exceção e só liberava a trava do
listener no `.finally()`, o computador ficava surdo: nada subia e nada descia, e
o selo ficava preso em "Sincronizando…".

Regra correta:
Toda chave montada com texto do usuário passa por `ImportUtils.escapeRtdbKey`;
valor opcional vai com fallback (`|| ""`), nunca `undefined`; `save()` nunca
lança. Ver PROJECT_RULES.md → "Chaves do Firebase".

Onde verificar:
- js/import-utils.js (escapeRtdbKey)
- js/data.js (holidayTombstoneKey, workedLinkTombstoneKey)
- js/scale-rules.js (coveragePrincipalBindings)
- js/firebase-sync.js (sanitizeForRtdb, save)
- scripts/verify-sync-chaves.mjs

Sintoma para reconhecer:
Console com `update failed: values argument contains an invalid key (...)` ou
`contains undefined in property (...)`, e o selo parado em "Sincronizando…".

## Risco: relógio do computador fora de hora

Status:
Mitigado em 16/09/2026, monitorar.

Descrição:
O desempate da sincronização é "mais recente vence" por carimbo de tempo. Com o
relógio do PC atrasado, o que o usuário acabava de digitar perdia do dado velho
do outro computador e voltava sozinho.

Regra:
Carimbo sempre por `AppData.now()` (hora local + desvio de `.info/serverTimeOffset`),
nunca `Date.now()` direto. Desvio acima de 60s aparece no selo de sincronização.

## Risco: Firebase e localStorage

Status:
Monitorar.

Descrição:
Conflitos podem ocorrer quando dados antigos sobrescrevem dados novos.

Regra:
Sempre usar merge seguro.

## Risco: Dados hardcoded

Status:
Monitorar.

Descrição:
Datas, empresas e regras fixas no código podem recriar erros antigos.

Regra:
Evitar hardcoded sem documentação no PROJECT_RULES.md.

## Risco: Duplicidade de funções

Status:
Monitorar.

Descrição:
Funções duplicadas podem gerar divergência entre Dashboard, VT, Feriados e Escala.

Regra:
Centralizar cálculos críticos.  