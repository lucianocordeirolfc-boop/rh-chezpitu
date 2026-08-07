# TEST_CHECKLIST.md — Checklist de Testes RH Chez Pitu

Use este checklist antes de qualquer commit ou deploy.

> ⚠️ **REGRA FIXA — o teste não pode alterar dado registrado.**
> Nenhum item deste checklist autoriza gravar, corrigir ou apagar dados reais
> (feriados lançados, escala, recibos de VT, ausências, lançamentos do Contador,
> cadastro). Em produção, testar **somente leitura**: abrir a tela, conferir,
> sair — sem acionar recompute de escala, seeds, dedup ou migrações.
> Para exercitar lógica que grava, usar `scripts/verify-*.mjs` (fixtures).
> Se o teste precisar de dado, criar um registro próprio e removê-lo depois.
> Ver PROJECT_RULES.md → "Imutabilidade dos dados já registrados".

## Escala de Folga

- [ ] Trocar empresa Chez Pitu para Pengold.
- [ ] Trocar empresa Pengold para Chez Pitu.
- [ ] Confirmar que não trava.
- [ ] Confirmar que não mistura funcionários.
- [ ] Trocar mês e ano.
- [ ] Confirmar persistência.
- [ ] Testar lançamento de CO.
- [ ] Testar lançamento de férias.
- [ ] Testar lançamento de ausência.
- [ ] Confirmar cabeçalho fixo da escala.
- [ ] Confirmar regras TR/TM/MR.

## Vale-transporte

- [ ] Confirmar cálculo por empresa.
- [ ] Confirmar CO abatendo VT.
- [ ] Confirmar férias abatendo VT.
- [ ] Confirmar atestado abatendo VT.
- [ ] Confirmar licença abatendo VT.
- [ ] Confirmar ausência cadastrada abatendo VT.
- [ ] Confirmar total estimado VT.
- [ ] Confirmar impressão/PDF se aplicável.

## Controle de Feriados

- [ ] Confirmar cards.
- [ ] Confirmar pendentes.
- [ ] Confirmar vencidos.
- [ ] Confirmar compensados.
- [ ] Confirmar agendados.
- [ ] Confirmar prazo de 120 dias.
- [ ] Confirmar Padroeira de Búzios em 26/07.
- [ ] Confirmar que Padroeira de Búzios não aparece em 21/05.
- [ ] Filtrar por funcionário.
- [ ] Filtrar por empresa.
- [ ] Filtrar por status.

## Modal CO

- [ ] Abrir CO para Raquel R. da Costa.
- [ ] Confirmar que mostra apenas feriados dela.
- [ ] Confirmar que não mostra feriados de outros funcionários.
- [ ] Confirmar que não mostra feriados compensados.
- [ ] Confirmar que não mostra feriados já vinculados.
- [ ] Vincular CO.
- [ ] Confirmar atualização no histórico.
- [ ] Confirmar abatimento no VT.

## Ausências

- [ ] Lançar férias.
- [ ] Lançar atestado.
- [ ] Lançar licença.
- [ ] Confirmar reflexo na escala.
- [ ] Confirmar reflexo no VT.
- [ ] Confirmar histórico.
- [ ] Confirmar filtros.

## Cadastro

- [ ] Confirmar empresa correta do funcionário.
- [ ] Confirmar setor correto.
- [ ] Confirmar cargo correto.
- [ ] Confirmar que funcionário não aparece na empresa errada.
- [ ] Confirmar funcionário ativo/inativo.

## Dashboard

- [ ] Validar cards por empresa.
- [ ] Validar números com tabelas de origem.
- [ ] Validar após troca de empresa.
- [ ] Validar após atualização da página.

## Informações Contador

- [ ] Testar Resumo.
- [ ] Testar Lançamentos.
- [ ] Trocar empresa.
- [ ] Trocar mês.
- [ ] Gerar PDF.
- [ ] Conferir cabeçalho do PDF.
- [ ] Conferir funcionários listados.

## Persistência

- [ ] Atualizar página.
- [ ] Fechar e abrir sistema.
- [ ] Trocar abas.
- [ ] Trocar empresa.
- [ ] Confirmar dados preservados.

## Testes técnicos

- [ ] npm test
- [ ] npm run validate
- [ ] verificar console do navegador
- [ ] verificar git status