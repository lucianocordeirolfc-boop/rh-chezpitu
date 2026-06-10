# PROJECT_HISTORY.md — Histórico do Projeto RH Chez Pitu

Este arquivo registra decisões, bugs recorrentes e correções importantes.

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

## 2026-06 — Seed de feriados 2026

Problema:
A primeira versão do seed de feriados 2026 (Semana Santa 03/04, Tiradentes 21/04, São Jorge 23/04) foi revertida (commit ee762de): quando o remoto vencia o merge de calendarHolidays, o seed local era descartado e a flag chezPituHolidaySeed2026.v1 impedia nova tentativa — o seed se perdia na primeira sincronização com o Firebase.

Correção:
Nova implementação em js/data.js:
- seedComplianceHolidays2026 só ADICIONA feriados inexistentes (calendário com escopo "ambas" + Controle de Feriados das 2 empresas), com matching por aliases de nome (ex.: "Sexta-feira Santa" = "Semana Santa") para não duplicar lançamentos existentes.
- preserveSeededCalendarHolidays reanexa os seeds locais (ids "cal-seed-2026-*") quando o remoto vence o merge de calendarHolidays.

Regra:
Seeds de feriados nunca alteram nem removem lançamentos existentes (workedEmployees preservados).

Validação:
- scripts/test-seed-2026.mjs (temporário, não versionar): 15/15 OK.
- npm test: 15/15 OK. npm run validate: sem erros.

Observação de comportamento existente: normalizeWorkedEmployeeRefs descarta workedEmployees cujo employeeId não corresponde a funcionário cadastrado na empresa.

## 2026-05 — Deploy

Projeto conectado:
- GitHub: lucianocordeirolfc-boop/rh-chezpitu
- Netlify: rh-chezpitu.netlify.app

Fluxo recomendado:
1. testar
2. commit
3. push main
4. validar deploy Netlify