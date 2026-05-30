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