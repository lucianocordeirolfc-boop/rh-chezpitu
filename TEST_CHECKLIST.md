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
- [ ] Confirmar que não há regras de cobertura ativas (TR/TM/MR retiradas em
      17/11/2026 — painel e linha "Cobertura" ocultos).

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
- [ ] Cargo em lista suspensa vindo de Cargos e Salários da empresa da aba.
- [ ] Salário, gratificação, CBO e insalubridade aparecem somente leitura.
- [ ] Cargo antigo fora do catálogo continua salvo, com aviso.
- [ ] Exportar Excel com colunas CBO, Salário, Insalubridade (%), Base,
      Valor e Gratificação (Y–AD).

## Cargos e Salários

- [ ] Trocar empresa: cada uma com as suas funções.
- [ ] Nova função com o nome de uma existente (caixa/acento) é recusada.
- [ ] CBO já usado em outra função: aviso + confirmação; cancelar não grava.
- [ ] Níveis da mesma função (Cozinheiro I / II) dividem o CBO sem aviso.
- [ ] Insalubridade: grau 10/20/40% ou outro percentual; salário base e
      valor calculado.
- [ ] Gratificação no formato do salário; históricos (salário, gratificação,
      insalubridade) no pop-up.
- [ ] Comissões: 6 padrão com explicação; lista suspensa na função.
- [ ] "Padronizar e importar do cadastro": quadro só leitura até confirmar.
- [ ] Excluir função com funcionário vinculado é recusado; sem vínculo vai
      para a Lixeira e restaura.
- [ ] Relatório PDF (funções, comissões, funcionários por função).

## Quadro de Vagas

- [ ] Trocar empresa: vagas separadas.
- [ ] Nova vaga com função de Cargos e Salários (CBO exibido).
- [ ] Escolaridade, atribuições e requisitos (obrigatórios, desejáveis,
      diferenciais) gravados e exibidos no cartão.
- [ ] Observação longa quebra linha no cartão, sem cobrir Editar/Excluir.
- [ ] Cartão: CBO em fonte menor, "Urgente" em destaque, Quantidade só com o
      número (admitidos só no Painel RH).
- [ ] Vaga nova da mesma função sugere o perfil da última.
- [ ] Candidato "Agendado" (com data/horário) vira etiqueta no topo do cartão,
      ao lado de Editar/Excluir; hoje em destaque, passada em alerta, +N;
      clique abre Recrutamento e Seleção.
- [ ] Candidato (R&S) e admissão ligados à vaga; "Iniciou" conta como admitido.
- [ ] Painel RH confere com as tabelas.
- [ ] Mostrar concluídas/canceladas.
- [ ] Excluir vaga/candidato/admissão → Lixeira → restaurar.
- [ ] Relatório PDF (painel, vagas, R&S, admissões) em paisagem.

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

## Sincronização entre computadores (somente leitura)

- [ ] Selo do topo chega a **"Sincronizado"** (não fica preso em "Sincronizando…").
- [ ] Console sem `update failed: ... invalid key` e sem `contains undefined`.
- [ ] Console sem `[FirebaseSync] ... ocorrência(s) saneada(s)` — a rede de
      segurança é a última linha de defesa, não o caminho normal.
- [ ] Se o selo mostrar `⚠ relógio ... atrasado/adiantado`, acertar a data/hora
      do Windows (a sincronização continua correta, usa a hora do servidor).
- [ ] Alteração feita em um computador aparece no outro com o sistema aberto.
- [ ] Exclusão definitiva de feriado/vínculo feita em um PC não volta no outro.

## Testes técnicos

- [ ] npm test
- [ ] npm run validate
- [ ] npm run test:offline
- [ ] verificar console do navegador
- [ ] verificar git status