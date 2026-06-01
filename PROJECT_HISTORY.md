# PROJECT_HISTORY.md — Histórico do Projeto RH Chez Pitu

Este arquivo registra decisões, bugs recorrentes e correções importantes.

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