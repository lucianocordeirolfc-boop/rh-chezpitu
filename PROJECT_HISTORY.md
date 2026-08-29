# PROJECT_HISTORY.md — Histórico do Projeto RH Chez Pitu

Este arquivo registra decisões, bugs recorrentes e correções importantes.

> **Regra de registro obrigatório:** toda alteração de melhoria/correção que
> chega a commit deve ser registrada neste arquivo (entrada datada no topo)
> ANTES ou junto do commit. Ver `PROJECT_RULES.md` → "Registro obrigatório no
> histórico".

## 2026-08-29 (3) — Homologação aprovada pelo usuário (Contador)

Entrada de registro, sem alteração de código.

O usuário validou em produção as duas entregas desta data e respondeu **"tudo
aprovado"**:

- `20260829.01` — botão "+ Lançamento", pop-up carregado com os dados do mês
  selecionado, salvamento por merge (só o funcionário selecionado muda) e saída
  da coluna "Ações" da tela de lançamentos.
- `20260829.02` — grade da sub-aba Lançamentos só com funcionários que têm
  lançamento no mês, em ordem alfabética igual à da aba Resumo, com a linha
  "Somente funcionários com lançamentos no mês" ao lado do botão.

Aprovado explicitamente o critério de exibição em aberto no relatório anterior:
**lançamento com os oito campos zerados não aparece na grade**; o registro
continua gravado na base e volta a aparecer assim que qualquer campo receber
valor.

Nenhuma pendência aberta desta frente. Melhoria opcional registrada para o
futuro: botão de "limpar lançamento do mês" dentro do pop-up, já que a exclusão
não tem mais gatilho na interface (`deleteLancamento` permanece no código).

## 2026-08-29 (2) — Contador/Lançamentos: grade só com quem tem lançamento, em ordem alfabética

**Origem:** pedido do usuário, na sequência da entrega anterior do mesmo dia.
A grade da sub-aba Lançamentos vinha na ordem de gravação dos registros, sem
relação com a ordem da aba Resumo, e não deixava claro por que alguns
funcionários não apareciam.

**O que foi feito (apenas na sub-aba Lançamentos — a aba Resumo não foi tocada):**

1. **Só funcionários com lançamento no mês.** `getLancamentosParaGrade` filtra
   por `hasAnyValue`: registro cujos oito campos estão zerados (ou `"00:00"`)
   **não** é "funcionário com lançamento" e sai da grade. Isso ficou possível
   depois que a coluna Ações saiu — o usuário zera um lançamento pelo pop-up e a
   linha some sozinha, em vez de ficar uma fileira de "—". O registro continua
   gravado: some da tela, nunca da base.

2. **Ordem alfabética igual à do Resumo.** Ordenação por
   `getEmployeeName(...).localeCompare(nome, "pt-BR")` — o mesmo comparador e o
   mesmo nome oficial que `getEmployeesForCompany` usa na aba Resumo, de modo
   que as duas telas listam na mesma sequência. A ordenação é feita sobre uma
   cópia (`slice()`): o array devolvido por `getLancamentos` é o próprio dado
   gravado e reordená-lo no lugar seria alterar o registro do usuário.

3. **Linha informativa "Somente funcionários com lançamentos no mês"** ao lado
   do botão "+ Lançamento" (`span.contador-toolbar-note`). O CSS usa
   `flex: 1` + `text-align: center`, então ela ocupa o espaço que sobra entre o
   fim do botão e a borda direita da barra — que é a borda da última coluna
   (Vales) — e se centraliza nele. Em itálico e no tom `--muted`, para informar
   sem competir com o botão. Renderizada só quando a sub-aba ativa é
   Lançamentos.

**Aba Resumo:** inalterada — `renderResumoGrid` e `renderResumoPrintArea`
continuam listando **todos** os funcionários ativos (inclusive quem não tem
lançamento) com a linha de totais, e o aviso não aparece lá. Coberto por
asserção na suíte.

**Arquivos:** js/contador.js, css/style.css,
scripts/verify-contador-lancamento-popup.mjs, scripts/run-functional-validation.mjs.

**Testes:** `npm test` 47/47 ✓; `npm run validate` 20/20 suítes ✓;
`verify-contador-lancamento-popup.mjs` 46/46 → **60/60 ✓** (blocos 9 e 10 novos:
ordem alfabética, registro zerado fora da grade mas presente na base, texto e
posição/centralização do aviso medidos no Chrome com o CSS real, e a aba Resumo
provada intacta). O harness da suíte passou a carregar `css/style.css` — sem o
CSS real não se pode afirmar nada sobre layout.

**Pendências:** nenhuma nova. Segue em aberto (da entrega anterior) a decisão
sobre criar um botão de "limpar lançamento do mês" no pop-up — agora com menos
urgência, já que zerar os campos faz a linha sair da grade.

## 2026-08-29 — Contador: "+ Lançamento" abre com os dados do mês e a coluna Ações sai da tela

**Origem:** pedido do usuário. O botão "+ Novo Lançamento" abria o pop-up sempre
zerado, mesmo com o mês selecionado ao lado já tendo lançamentos (agosto/2026).
Para conferir ou corrigir um valor era preciso fechar o pop-up e usar o lápis da
coluna Ações da tabela — duas portas para a mesma operação, e a de dentro do
pop-up mentia sobre o estado do mês.

**O que foi feito:**

1. **Botão renomeado** para "+ Lançamento" (id `btnLancamento`); o texto de
   estado vazio da tabela acompanhou.

2. **Pop-up nasce com a base do mês selecionado.** `buildLancamentoMap` monta
   `employeeId -> lançamento` do período que está na barra de ferramentas;
   escolher o funcionário no `select` preenche os oito campos com o que já
   está registrado (Jefferson em agosto: Consumo Interno 212,25 e Vales 250,00).
   Quem já tem lançamento no mês aparece marcado com "•" na lista. O título do
   pop-up passou a ser "Lançamento — <Mês> <Ano>", deixando a base explícita.

3. **Salvar altera só o funcionário selecionado.** O `record` agora é um merge
   sobre o registro existente (`Object.assign`), então campos fora do
   formulário (`updatedAt`, dados legados) sobrevivem e os lançamentos dos
   demais funcionários do mês ficam intactos — `saveLancamento` já trocava
   apenas a entrada daquele `employeeId`. Depois de gravar, o formulário
   recarrega os valores salvos em vez de se limpar, e o funcionário continua
   selecionado (era o comportamento pedido: "deve carregar essas informações").

4. **Coluna "Ações" removida** da tabela de lançamentos, com os botões de editar
   e excluir. A edição passou a ser inteiramente pelo pop-up. `bindContainerEvents`
   (delegação de clique que só existia para esses dois botões) foi removida;
   `deleteLancamento` foi mantida, sem gatilho de UI, para uso programático /
   recuperação. Saiu também a regra CSS órfã `.contador-table .cell-actions`.

5. **Gravação na mesma empresa da leitura.** O submit usava
   `AppData.getActiveCompany()` enquanto a lista de funcionários e os valores
   vinham de `getPrimaryPageCompany("contador")`. Na prática as duas coincidem
   (`setActiveCompany` propaga para os `pageFilters`), mas com o pop-up agora
   lendo dados do mês a divergência deixaria de ser teórica: ler de uma empresa
   e gravar em outra. Passou a gravar em `company` — a mesma de onde leu. A
   regra "pop-up sem seletor de empresa; empresa vem do contexto da aba" não
   mudou; mudou a linha que a implementa, e a asserção 8 da validação funcional
   (que fixava o texto `var targetCompany = AppData.getActiveCompany();`) foi
   atualizada para checar a nova, mais duas asserções (8b/8c) para o botão e a
   saída da coluna Ações.

**Arquivos:** js/contador.js, css/style.css,
scripts/verify-contador-lancamento-popup.mjs (novo),
scripts/run-functional-validation.mjs, scripts/run-validate.mjs.

**Testes:** `npm test` 47/47 ✓; `npm run validate` 20/20 suítes ✓;
`scripts/verify-contador-lancamento-popup.mjs` 46/46 ✓ (Chrome real sobre
fixture em memória — nenhuma base de produção lida ou escrita).

**Pendências:** sem gatilho de exclusão na interface, um lançamento indesejado
só pode ser zerado campo a campo (a linha continua na tabela, com "—"). Se o
usuário quiser excluir de volta, a função já existe e só precisa de um botão.

## 2026-08-22 (3) — Funcionário inativo some das telas + data de desligamento obrigatória

**Origem:** Adonias Lima Santana está Inativo no Cadastro e já não aparecia na
Escala (que tem regra própria desde a entrega do `deactivatedAt`), mas seguia
visível no Controle de Feriados e na própria lista do Cadastro. Não existia
regra geral de visibilidade de inativos.

**O que foi feito:**

1. **Regra de visibilidade (nova, fixa).** Inativo não aparece no Cadastro nem
   no Controle de Feriados. O dado nunca é apagado — some só da tela.
   - Feriados: `applyInactiveVisibility` roda logo depois de `buildLines`, de
     modo que contadores do topo, filtros e tabela vejam o mesmo conjunto.
     Vínculo órfão ("Funcionário não encontrado") continua visível: é dado a
     corrigir, não alguém desligado — daí o `Boolean(employee)` na marcação.
   - Cadastro: `isEmployeeVisibleByStatus`. **Exceção deliberada:** com o filtro
     Status = Inativo o usuário pediu explicitamente os inativos, e o pedido
     vence a regra — senão a tela viria vazia e o filtro ficaria quebrado.

2. **Botão "Mostrar funcionários inativos (N)"** nas duas telas, idêntico, com
   um seletor de checkbox por funcionário: só quem for marcado reaparece. Para
   não duplicar ~150 linhas em dois arquivos, virou o módulo compartilhado
   `js/inactive-employees.js` (`window.InactiveEmployeesUI`), carregado no
   index.html depois de company-ui.js. A seleção é de exibição, vive em memória
   e não grava nada. Em Feriados a lista traz só os inativos **com vínculo de
   feriado** — marcar quem não tem vínculo não mudaria nada na tela — e a linha
   que volta ganha a tag "Inativo".

3. **Data de desligamento obrigatória ao inativar.** O botão "Inativar" da lista
   e a mudança de status pelo formulário passam por `askTerminationDate`, que só
   conclui com data informada, não futura e não anterior à admissão. O antigo
   `confirm()` sem data saiu. A data alimenta `deactivatedAt` — o mesmo campo que
   a Escala usa para exibir o funcionário até o mês da saída. Antes o sistema
   assumia "hoje"; agora registra o dia real.

**Compatibilidade:** `setEmployeeStatus(id, status, company)` sem o 4º parâmetro
mantém o comportamento antigo (data já registrada ou hoje), então importações e
chamadas legadas seguem funcionando. `upsertEmployee` passou a respeitar um
`deactivatedAt` explícito, com a mesma ordem de prioridade documentada no código.

**Arquivos:** `js/inactive-employees.js` (novo), `js/feriados.js`,
`js/funcionarios.js`, `js/data.js`, `css/style.css`, `index.html`,
`scripts/verify-inativos-visibilidade.mjs` (novo),
`scripts/verify-inativos-picker-ui.mjs` (novo), `scripts/run-validate.mjs`,
`PROJECT_RULES.md`.

**Testes:** `npm test` 47/47. `npm run validate` **19/19** suítes (17 + 2 novas).
- `verify-inativos-visibilidade` (25 asserções): data informada gravada, fallback
  legado preservado, as duas regras de visibilidade e amarras de fonte.
- `verify-inativos-picker-ui` (17 asserções) roda o componente **no Chrome real**:
  asserção de fonte não prova que um modal funciona, e o seletor é o coração do
  pedido. Cobre abrir com um checkbox por inativo, ativo fora da lista,
  marcar/desmarcar todos, Aplicar devolvendo só os marcados e Cancelar inerte.

**Dados:** nada alterado. Adonias segue na base, com histórico completo.

## 2026-08-22 (2) — Feriados: "+ Funcionário" sai da tabela (redundante com o botão global)

**Pedido:** ajustar o layout da tela principal do Controle de Feriados — o botão
**+ Funcionário**, herdado do arranjo anterior, ficou deslocado depois da saída
do "Excluir feriado". Avaliar a necessidade e, não havendo, excluir.

**Análise da necessidade (por que dava para remover):** o botão da linha abria
`showAddWorkedEmployeeModal(holidayId)` — feriado fixo, escolhendo só o
funcionário — e era renderizado **apenas na primeira linha de cada feriado**,
o que deixava a coluna Ações com 3 elementos numa linha e 2 nas seguintes.
A mesma operação (`AppData.addManualWorkedEmployee`) já tem dois outros
caminhos, ambos preservados:

1. **"+ Vincular funcionário a feriado"** — botão primário no topo da página,
   sempre visível, escolhe feriado **e** funcionário num passo só e funciona
   com a tabela vazia (situação em que o botão da linha nem aparecia).
2. **"+ Funcionário"** do modal do calendário (`data-link-employee-cal`).

O botão da linha era estritamente redundante, e o caminho global é superior.

**O que foi feito (só em `js/feriados.js`):**

1. Removido o botão `data-add-worked-employee` da coluna Ações da tabela.
2. Removido o handler correspondente em `bindTableActions`, com comentário
   apontando os dois caminhos que permanecem.
3. Removidos `seenHoliday` / `isFirstHolidayRow`, que existiam **só** para
   escolher em qual linha desenhar "+ Funcionário" e "Excluir feriado" — ambos
   agora fora da tabela.

**Layout:** toda linha passa a ter exatamente data de compensação + "Excluir
vínculo". Como `.holiday-actions` já é `flex` com `gap: 10px`, o alinhamento
ficou uniforme sem tocar no CSS.

**Preservado:** `showAddWorkedEmployeeModal` continua em uso pelo modal do
calendário. Popup, filtros, calendário e demais abas intocados. Só UI, nenhum
dado registrado alterado.

**Testes:** `npm test` 47/47. `npm run validate` 17/17 suítes, incluindo
"Vínculo manual de funcionário".

## 2026-08-22 — Feriados: "Excluir feriado" sai da tela principal (fica só no modal)

**Pedido:** na aba Controle de Feriados, tela principal, remover a ação
**Excluir feriado**, deixando apenas **Excluir vínculo**. A exclusão definitiva
permanece exatamente como já estava dentro do modal "Gerenciar feriados".

**Causa da duplicidade:** o botão `data-remove-holiday-perm` era renderizado na
primeira linha de cada feriado na tabela principal (`js/feriados.js`), além do
`data-popup-remove-holiday` que já existia no modal. Duas portas para a mesma
ação destrutiva (apaga o feriado e todos os vínculos), sendo que a da tabela
ficava ao lado do "Excluir vínculo" — risco real de clique errado.

**O que foi feito (2 pontos, só em `js/feriados.js`):**

1. Removido o botão "Excluir feriado" da coluna de ações da tabela principal.
   O "Excluir vínculo" (`data-unlink-holiday`), o "+ Funcionário" e o campo de
   data de compensação seguem intactos.
2. Removido o handler `[data-remove-holiday-perm]` de `bindTableActions`, que
   ficaria órfão, com comentário apontando que a exclusão definitiva vive em
   `bindCompanyHolidayManager` / `data-popup-remove-holiday`.

**Preservado:** `confirmDeleteHolidayPermanent` e
`AppData.removeCompanyHolidayPermanently` continuam existindo — são usados pelo
modal. Nada mudou no popup, no calendário, nos filtros ou em outras abas.
Alteração puramente de UI: nenhum dado registrado foi tocado.

**Testes:** `npm test` 47/47. `npm run validate` 17/17 suítes — incluindo
"Feriados — exclusão definitiva", "Feriados — lista completa/editar/excluir" e a
asserção de que as linhas de funcionário só têm "Excluir vínculo".

## 2026-08-10 (3) — verify-print-escala: 8,7s → 2,7s sem perder fidelidade

**Origem:** a suíte de impressão consumia 8,7s dos ~10,6s do `npm run validate`.

**Onde estava o tempo (medido antes de mexer):**

| fase | custo |
| --- | --- |
| boot do node + import do puppeteer | ~0,34s |
| launch do Chrome | ~0,56s |
| `page.goto` × 5 | **~0,9s cada (~4,5s)** |
| medições no DOM × 5 | ~0,02s cada |
| `page.pdf` × 5 | ~0,5s cada (~2,6s) |

**O que foi feito:**

1. **CSS embutido.** O HTML de cada caso linkava três arquivos por
   `file://` (`style.css`, `print.css`, `escala-print.css`). Cada navegação
   abria três requisições e o `waitUntil: "networkidle0"` ainda esperava 500ms
   de ociosidade depois da última resposta. Os três arquivos passam a ser lidos
   **uma vez** no início e embutidos em `<style>`, na mesma ordem. Nenhum dos
   três usa `url(...)` (verificado), então não há caminho relativo a resolver e
   a cascata é idêntica. `goto` caiu de ~900ms para ~80ms.
2. **`waitUntil: "load"`.** Sem requisições, `networkidle0` só cobrava o timer
   ocioso; `load` já dispara depois de aplicar as folhas de estilo.
3. **Casos em paralelo.** Com o `goto` barato, o custo dominante virou o
   `page.pdf()` do Chrome. Os 5 casos são independentes (aba própria, arquivo
   próprio), então rodam com `Promise.all`. Para o log não embaralhar, cada caso
   passou a **acumular suas linhas** e devolver `{ lines, casePass, caseFail }`;
   a impressão acontece depois, na ordem declarada. `validateCase` virou só o
   ciclo de vida da aba (`try/finally`), com o corpo em `runCase`.

**Fidelidade — o ponto que importa numa suíte de homologação:** a saída de
geometria foi comparada linha a linha com a versão anterior (fator de auto-fit,
altura do conteúdo, páginas do PDF, `footerBottom`, razão nome/dia,
preenchimento da grade): **idêntica**. Nada de `sleep`, `timeout` ou asserção
afrouxada — só trabalho removido do caminho crítico.

**Testes:** 55/55 asserções, estável em 3 execuções seguidas. `npm test` 47/47.
`npm run validate` 17/17 suítes, total **~10,6s → ~4,9s**.

## 2026-08-10 (2) — Suíte de testes: fixtures datadas que envelhecem e validate que abortava na 1ª falha

**Origem:** as duas falhas pendentes registradas na entrega anterior desta mesma
data, mais o `npm run validate` que parava na primeira suíte.

**Causa raiz das duas falhas (era UMA só):** em
`scripts/run-functional-validation.mjs` o feriado da fixture `h1` ("Feriado
Teste") tinha **data fixa** `2026-04-10`, com um vínculo sem compensação que o
teste esperava como *Pendente*. O prazo de compensação é de 120 dias corridos:
10/04/2026 + 120 = **08/08/2026**. A partir daquele dia o vínculo passou a
resolver como *Vencido* — corretamente, pela regra de negócio — e derrubou:

- `[Controle de Feriados] Status pendente detectado corretamente`
- `[Dashboard] Dashboard stats feriados: pendentes ≥ 1 (Chez Pitu)`
  (`getHolidayStats().pending` caiu para 0 pelo mesmo motivo)

Não havia bug de produto: a fixture é que envelheceu. Vizinhas na mesma lista
(`h2` Vencido e `h3` Compensado) já usavam datas relativas a hoje; só `h1` ficou
com data absoluta.

**O que foi feito:**

- `scripts/run-functional-validation.mjs` — `h1` passou a usar
  `addDays(todayISO(), -30)` (dentro do prazo, sempre *Pendente*). O vínculo
  com `compensationDate: "2026-05-14"` que morava em `h1` — e que é o que faz
  14/05/2026 aparecer como **CO** em `getScaleCode` para as asserções de VT —
  foi movido para um feriado próprio (`h1b`, data fixa, status *Compensado*,
  que não envelhece). Assim cada fixture tem um propósito declarado.
- `scripts/verify-tombstones-sync.mjs` — o script morria no meio (exceção não
  tratada) porque `removeEmployee` passou a exigir a janela de 24h e a fixture,
  anterior à regra, não tinha `createdAt`. Fixture ganhou `createdAt: Date.now()`.
  O alvo do teste é a **cascata de tombstones**; a janela de exclusão tem suíte
  própria (`verify-exclusao-24h.mjs`). Como o script não estava no `validate`,
  ficou quebrado sem ninguém ver.
- `scripts/run-validate.mjs` (**novo**) — runner do `npm run validate`. Roda
  **todas** as suítes, cada uma em seu processo, com a saída preservada; no fim
  imprime resumo com tempo por suíte e sai com código 1 se qualquer uma falhou.
  A cadeia anterior (`node a && node b && ...`) escondia o estado real: uma
  fixture vencida na primeira suíte mascarou as outras quatro por dias.
  Extras: filtro por termo (`npm run validate feriado`) e aviso quando existe
  um `scripts/verify-*.mjs` fora da lista `SUITES` (guarda contra o
  apodrecimento que aconteceu com o `verify-tombstones-sync.mjs`).
- `package.json` — `validate` agora aponta para o runner. Cobertura foi de
  **5 para 17 suítes** (todos os `verify-*.mjs` entraram na lista).

**Testes:** `npm test` 47/47; `npm run validate` **17/17 suítes aprovadas**
(funcional, offline, dedup, quota + 13 `verify-*`). Caminho de falha do runner
verificado com uma suíte propositalmente reprovada: as demais continuaram
rodando e o processo saiu com código 1.

## 2026-08-10 — Controle de Feriados: lista mostrava só um recorte; editar/excluir por identidade

**Sintoma relatado:** no popup "Gerenciar Feriados" (aba Controle de Feriados →
*+ Cadastrar feriado*), a lista "Feriados cadastrados" mostrava apenas feriados
de 2026. Os feriados cadastrados para 2027 não apareciam e, por isso, não havia
como editar nem excluir.

**Causa raiz (duas, somadas):**

1. **Lista lia uma fonte só.** `renderCalendarHolidays()` (js/feriados.js)
   montava a tabela apenas com `state.calendarHolidays` filtrado pela empresa
   ativa. Um feriado tem duas moradas no estado — o calendário global e o bloco
   da empresa (`companies[x].holidays`, onde vivem os vínculos). Feriado que
   existisse só no bloco da empresa era invisível na lista, em qualquer ano.
2. **Merge do Firebase descartava o calendário local.**
   `mergeCalendarHolidaysPreservingSeeds` (js/data.js) fazia
   `remoto.length ? remoto : local` — o remoto vencia por completo. Qualquer
   entrada de calendário criada localmente e ainda não sincronizada era perdida
   na primeira carga do remoto. O feriado da empresa sobrevivia (esse merge é
   por união), o do calendário não — exatamente o par de sintomas observado.

**O que foi feito:**

- `js/data.js`
  - `mergeCalendarHolidaysPreservingSeeds` → **união** por conteúdo
    (data + nome normalizado), unindo `companies` dos dois lados. As exclusões
    definitivas continuam vencendo porque `applyHolidayTombstones` roda depois,
    em `finalizeIncomingState`. Os seeds 2026 sobrevivem por consequência.
  - `listRegisteredHolidays(empresa)` — visão unificada (calendário + bloco da
    empresa), sem duplicar, **sem recorte de ano**, com `workedCount`,
    `inCalendar`/`inCompany` e ids das duas origens.
  - `countHolidayLinksAllCompanies(data, nome)` — vínculos por empresa, para a
    confirmação de exclusão dizer exatamente o que será apagado.
  - `updateHolidayEverywhere` / `removeHolidayEverywhere` — editar e excluir
    pela **identidade** (data + nome), atingindo as duas fontes. A exclusão leva
    todos os vínculos e grava tombstone de feriado **e** de vínculo (não volta
    por merge, seed ou auto-sync); o CO já lançado na escala é preservado e só
    perde o `linkedHolidayId`.
  - **Escopo por empresa** (`resolveHolidayScopeCompanies` /
    `expandCalendarHolidayCompanies`): editar/excluir age só na empresa da aba
    ativa. Entrada de calendário compartilhada (`["ambas"]`, caso dos seeds) é
    reduzida na exclusão e **dividida** na edição — a outra empresa nunca perde
    feriado nem vínculo por tabela. O tombstone de calendário (`__calendar__`,
    que é global) só é gravado quando a identidade sai do calendário por
    completo.
- `js/feriados.js` — lista do popup passa a usar `listRegisteredHolidays`, com
  **filtro de ano** ("Todos os anos" por padrão) e coluna "Vínculos". Ações
  passam a identificar a linha por `data + nome` (não mais pelo id do
  calendário, que pode não existir), habilitando editar/excluir também nos
  feriados que só existem no bloco da empresa. Removido o atributo
  `data-company-holiday-manager` do container do popup — apontava para um
  refresh que substituiria o formulário inteiro.
- `css/style.css` — `.feriados-manager-head` / `.feriados-manager-filter`.
- `scripts/verify-feriados-todos-anos.mjs` (novo, 29 asserções, fixtures em
  memória) e ajuste da asserção de fonte em `run-functional-validation.mjs`
  (passou a checar `listRegisteredHolidays` + `calendarHolidayTargetsCompany`
  no lugar do helper local removido).

**Testes:** `npm test` 47/47; `verify-feriados-todos-anos` 29/29;
`verify-exclusao-feriado-definitiva` 15/15; `verify-vinculo-tombstone` 16/16;
`verify-feriados-retroativos` 25/25; dedup 44/44; offline 15/15; quota 25/25.
Sem regressão. Duas falhas de `run-functional-validation.mjs` ("Status pendente
detectado corretamente" e "Dashboard stats feriados") **já existiam antes desta
alteração** (confirmado com `git stash`) e seguem pendentes — como esse script
sai com código 1, o `&&` de `npm run validate` sempre parou nele; por isso o
novo script foi posto no **início** da cadeia.

**Observação sobre dados:** a correção do merge impede novas perdas e a lista
passa a exibir tudo o que existe no estado. Feriados de 2027 que já tenham sido
descartados pelo merge antigo em **ambas** as fontes não podem ser recuperados
por código — precisam ser recadastrados.

## 2026-08-07 — REGRA FIXA: imutabilidade dos dados já registrados (melhoria/teste nunca altera dado)

**Origem:** pedido do usuário após o incidente de 2026-08-06 (3), em que a
validação ao vivo de uma correção gravou na base de produção e materializou 10
vínculos de feriado Vencidos que não existiam. A salvaguarda criada naquela
entrega cobria apenas o caso da escala; o usuário pediu que a regra fosse
**geral e explícita para todos os módulos**.

**O que foi feito (somente documentação — nenhum código alterado):**

- `PROJECT_RULES.md` — nova seção no **topo** do arquivo: *"Imutabilidade dos
  dados já registrados (REGRA FIXA — TODOS OS MÓDULOS)"*, com tabela dos dados
  protegidos por módulo (Feriados e vínculos · Escala · Vale-transporte ·
  Ausências/Férias · Contador · Cadastro) e 6 regras operacionais:
  1. teste nunca escreve na base real (usar fixtures / `scripts/verify-*.mjs`);
  2. validação ao vivo em produção é **somente leitura** — proibido acionar
     `runScaleIntegrations`, `syncAutoHolidays*`, seeds, dedup ou migrações;
  3. mudança de formato/validação vale só para lançamentos novos;
  4. rotina automática não descarta dado sem ação do usuário;
  5. merge sempre aditivo;
  6. teste que precisa de dado cria o seu próprio.
  Exceção única: exclusão/edição explícita do usuário na interface. Correção de
  dado em produção pelo agente exige **autorização caso a caso**, descrevendo
  antes o que será alterado. As duas seções já existentes ("Proteção de
  lançamentos existentes" e "Salvaguarda ao validar em produção") foram
  **mantidas** e passaram a apontar para a regra-mãe.
- `CLAUDE.md` — seção "Imutabilidade dos dados registrados (REGRA FIXA)" antes
  de "Persistência", para o agente ler já na abertura do projeto.
- `AGENT_START.md` — aviso da regra antes do fluxo obrigatório.
- `TEST_CHECKLIST.md` — bloco de alerta no topo: nenhum item do checklist
  autoriza gravar/corrigir/apagar dado real; em produção, testar somente leitura.

**Correção de defasagem documental (divergência detectada por `/recuperar-projeto`):**
`PROJECT_STATUS.md`, `CHANGELOG.md` e `.claude/project-state.md` ainda apontavam
a versão `20260703.01` (03/07), ignorando as entregas de 2026-07-22 e as três de
2026-08-06 já em produção. Todos sincronizados para **`20260806.03`**, com os
commits reais (`954f7cd`+`cfab872`, `d663d67`+`73fb812`, `aade7e6`+`e3dd4f7`).

**Deploy:** não se aplica — `*.md` está no `ignore` do `firebase.json`, portanto
documentação não é publicada no Hosting e o código em produção permanece o de
`20260806.03`.

**Testes:** `npm test` 47/47 e `npm run validate` 25/25 (regressão — confirmam
que a alteração de documentação não tocou o comportamento do sistema).

## 2026-08-06 (3) — Auto-vínculo: guarda anti-regressão (não criar vínculo "nascido Vencido")

**Sintoma (usuário):** apareceram vínculos automáticos **Vencidos** de "Sexta-Feira
Santa" e "Carnaval 2026" que não existiam antes.

**Causa raiz (confirmada e assumida):** durante a validação ao vivo da entrega
anterior, foi executado `runScaleIntegrations` (recompute da escala) contra a base
de produção. Isso disparou `syncAutoHolidaysWorkedForMonth`, que **cria** vínculo
automático para todo funcionário ativo cujo código de escala no dia conta como
"trabalhado" — e **código vazio conta como trabalhado**. Como os feriados já
estavam com o prazo de 120 dias expirado, os vínculos nasceram **Vencidos** (10
casos, todos com código vazio/FOLGA — nenhum dia realmente trabalhado).

**Ação corretiva (dados):** removidos os **10 vínculos Vencidos** (auto+vazio e 2
manuais com FOLGA) de Carnaval 2026 e Sexta-Feira Santa, via
`removeWorkedEmployeeFromHoliday` (grava tombstone de vínculo → definitivo).
Os **47 vínculos Compensados/Agendados** (legítimos) foram **preservados**.

**Mecanismo (autorizado pelo usuário) — `js/scale-rules.js`:**
- `syncAutoHolidaysWorkedForMonth` passa a **NÃO CRIAR** auto-vínculo para feriado
  cujo prazo de compensação (`getHolidayCompensationDueDate`) já passou de hoje —
  um vínculo automático "nascido Vencido" é apenas ruído e não é compensável.
  A guarda **só bloqueia CRIAÇÃO**; nunca remove vínculo já existente. Casos reais
  de trabalho em feriado vencido continuam possíveis via **cadastro manual**
  (`addManualWorkedEmployee` não passa pela guarda).
- Consequência: recomputar meses antigos não materializa mais pendências vencidas.

**Salvaguarda de processo (PROJECT_RULES.md):** validação ao vivo em produção deve
ser **somente leitura**; não executar recompute/integração de escala que grave na
base de produção como parte de teste — usar fixtures/`scripts/verify-*`.

**Testes:** `npm test` 47/47, `npm run validate` 25/25;
`verify-feriados-retroativos.mjs` atualizado 25/25 (agora afirma que feriado
vencido não auto-vincula e que feriado dentro do prazo ainda auto-vincula);
novo `verify-auto-vinculo-vencido-guard.mjs` 4/4;
`verify-exclusao-feriado-definitiva` 15/15 e `verify-vinculo-tombstone` 16/16 sem regressão.

## 2026-08-06 (2) — Vínculo de feriado: exclusão DEFINITIVA (não volta pelo auto-vínculo) + Firebase aninhado

**Sintoma (usuário):** "Sexta-Feira Santa" reaparecia para CINTHIA JOSÉ MARIA
(Pengold) após "Excluir vínculo".

**Análise / causa raiz (confirmada nos dados de produção):**
1. **Auto-vínculo da escala.** `syncAutoHolidaysWorkedForMonth` (`scale-rules.js`),
   chamado por `runScaleIntegrations` em muitas ações/renders, **recria** o
   vínculo de todo funcionário ATIVO cujo código de escala no dia conta como
   "trabalhado" (código VAZIO conta como trabalhado — ver 2026-06-15) para cada
   feriado de calendário no dia. Cinthia (ativa, código vazio em 03/04/2026) era
   re-vinculada. `removeWorkedEmployeeFromHoliday` só filtrava o array, sem
   tombstone de sub-registro (limitação já documentada em 2026-06-24).
2. **União no merge.** `mergeWorkedEmployeeItems` une `workedEmployees` entre PCs,
   ressuscitando o vínculo a partir de outro PC/Firebase.
3. **Cascata no feriado.** Como o auto-vínculo também CRIA o feriado da empresa se
   existir feriado de calendário no dia, o próprio "Semana Santa" voltava.
4. **Infra (descoberto no diagnóstico):** os `holidayTombstones` (entrada anterior)
   estavam **vazios no localStorage** — sobrescritos por aba antiga em cache — e
   as sondagens de escrita no RTDB davam `permission_denied`. Para não depender de
   regra nova do Database (o deploy NÃO publica `database.rules.json`), os
   tombstones novos passaram a trafegar **aninhados** no nó `tombstones` já permitido.

**Correção:**
- `js/data.js` — novo `state.workedLinkTombstones` (chave `data|nome|employeeId`,
  escopo empresa). `removeWorkedEmployeeFromHoliday` grava o tombstone;
  `addManualWorkedEmployee` o limpa no revínculo explícito. `applyWorkedLinkTombstones`
  no `finalizeIncomingState` (cobre load e merge); união em `mergeRemoteIntoLocal`;
  preservado no `buildLeanPersistedState`. Exporta `isWorkedLinkTombstoned`/
  `applyWorkedLinkTombstones`.
- `js/scale-rules.js` — `syncAutoHolidaysWorkedForMonth` passa a **pular**
  (não recria) quando o feriado está tombado (`isHolidayTombstoned`) ou quando o
  vínculo daquele funcionário está tombado (`isWorkedLinkTombstoned`).
- `js/firebase-sync.js` — `holidayTombstones` e `workedLinkTombstones` trafegam
  **dentro** de `tombstones` (`__holidayTombstones`/`__workedLinkTombstones`),
  extraídos de volta na leitura; sem novo nó de topo (compatível com regras
  restritivas do RTDB). Fallback ao formato antigo top-level na leitura.
- `js/version.js` — APP_VERSION 20260806.02.

**Testes:** `npm test` 47/47, `npm run validate` 25/25,
`verify-exclusao-feriado-definitiva.mjs` 15/15 e novo
`verify-vinculo-tombstone.mjs` 16/16 (tombstone de vínculo, não-ressurreição via
merge e auto-vínculo, limpeza no revínculo e round-trip aninhado do Firebase).

## 2026-08-06 — Feriados: exclusão DEFINITIVA + limpeza de duplicados

**Objetivo:** permitir excluir permanentemente um feriado cadastrado (com TODOS
os vínculos), direto pela interface, sem depender do agente — e sem que ele volte
por sincronização (Firebase/outro PC), por seed 2026 ou pelo auto-sync do
calendário. Contexto: a aba Controle de Feriados acumulava duplicados (ex.: Natal
25/12/2025, Ano Novo 2026, Semana Santa, São Jorge 2/3, "Teste Tiradentes").

**Causa da persistência dos duplicados:** a exclusão existente era **soft-delete**
(`removeHoliday` → `isDeleted=true`), que **mantém** registro e `workedEmployees`.
Além disso, feriados de calendário e do seed 2026 podiam ressuscitar via merge do
Firebase e via `syncCompanyHolidaysFromCalendarEntry`.

**Solução — tombstone de feriado por CONTEÚDO (data|nome):**
- `js/data.js`
  - Novo `state.holidayTombstones = { escopo: { "data|nomeNormalizado": deletedAt } }`
    (escopo = empresa ou `"__calendar__"`). Diferente dos tombstones por id
    (funcionários/férias/ausências): feriados duplicados têm ids distintos, então
    a identidade do usuário é **data + nome**.
  - Helpers: `recordHolidayTombstone`, `isHolidayTombstoned`, `clearHolidayTombstone(s)`,
    `mergeHolidayTombstoneStores` (união por chave, mantém o `deletedAt` maior) e
    `applyHolidayTombstones` (remove os tombados de `companies[*].holidays` e de
    `calendarHolidays`). Aplicado em `finalizeIncomingState` (cobre load e merge).
  - `removeCompanyHolidayPermanently(id, {company})`: remove TODOS os registros de
    mesmo nome+data (elimina duplicatas) com seus vínculos e grava o tombstone.
  - `removeCalendarHolidayPermanently(id)`: idem para o calendário (escopo global).
  - Bloqueios de ressurreição: `syncCompanyHolidaysFromCalendarEntry` e os dois
    seeds (`applyHolidaySeed2026`, `seedComplianceHolidays2026`) passam a **pular**
    feriados tombados. Recriação explícita pelo usuário (`addHoliday`,
    `submitCalendarHolidayForm`) **limpa** o tombstone, permitindo recadastro.
  - Persistência: `createDefaultState`, `mergeRemoteIntoLocal` (união) e
    `buildLeanPersistedState` (preserva mesmo no cache enxuto) passam a carregar
    `holidayTombstones`.
- `js/firebase-sync.js` — serializa/lê `holidayTombstones` (propaga entre PCs).
- `js/feriados.js`
  - Botão **"Excluir feriado"** (definitivo) na 1ª linha de cada feriado no
    Histórico → `removeCompanyHolidayPermanently`, com confirmação forte de ação
    permanente. Botão "Excluir" do calendário (popup) e da lista de feriados
    cadastrados passam a usar a exclusão definitiva.
  - Confirmação `confirmDeleteHolidayPermanent` deixa explícito que é irreversível
    e afeta os N vínculos do feriado.

**Preservação:** o soft-delete antigo (`removeHoliday`/`restoreHoliday`) e todos os
demais dados continuam intactos. A exclusão definitiva só ocorre por ação explícita
do usuário na UI, com confirmação (alinhado à Regra de Ouro e à "Proteção de
lançamentos existentes").

**Testes:** `npm test` 47/47 e `npm run validate` 25/25 sem regressão;
`scripts/verify-exclusao-feriado-definitiva.mjs` 15/15 (exclusão + duplicatas +
vínculos, não-ressurreição via merge/seed/auto-sync do calendário, exclusão de
calendário, recriação limpando tombstone e união de tombstones no merge).

**Pendências:** deploy/commit aguardando autorização. Para o botão aparecer em
produção é preciso publicar (`npm run deploy`, que faz o bump de cache); os 6
duplicados serão removidos pelo próprio usuário com o novo botão.

## 2026-07-22 — Contador: máscara de horas HHH:MM (permite digitar 178:45)

**Problema:** no pop-up de lançamento (aba Informações para Contador), o campo
**Ad. Noturno** (e demais campos de hora) não permitia digitar valores com 3
dígitos de hora, como `178:45` (= 178h45min). Embora `normalizeHora` já aceitasse
até `200:00`, a **máscara de digitação `maskHora`** inseria o `:` cedo demais
(`178` virava `1:78`) e, a partir daí, os dígitos que passavam de 2 casas de
minutos eram **descartados** (`mm.slice(0,2)`), travando a entrada em `1:78`.

**Correção (`js/contador.js`):**
- `maskHora` reescrita: regra única "2 últimos dígitos = minutos, restante (até 3)
  = horas". Quando o usuário digita `:` manual e continua além dos 2 minutos, os
  dígitos **transbordam** para as horas em vez de serem perdidos. Ex.: digitar
  `17845` (ou `178:45`) resulta corretamente em `178:45`.
- Placeholder/hint do campo atualizados para o padrão **HHH:MM** com exemplo de 3
  dígitos (`17845 = 178:45`); `maxlength` do input ajustado de 6 → 7.
- Sem mudança de regra de negócio: limite máximo permanece `200:00`; `normalizeHora`
  e o submit não foram alterados. A correção beneficia igualmente o campo Hora Extra
  (mesma máscara compartilhada).

**Testes:** `npm test` (47/47) e `npm run validate` (25/25) OK; simulação de
digitação progressiva confirma `17845 → 178:45`, `1030 → 10:30`, `20000 → 200:00`,
`030 → 0:30`, `178:45h → 178:45`, com rejeição mantida para `200:01` e minutos > 59.

## 2026-07-03 — Exclusão limitada a 24h + trilha de auditoria + botão Inativar/Reativar

**Objetivo:** permitir excluir um funcionário apenas nas primeiras **24h após o
cadastro**. Passada essa janela, a exclusão fica **bloqueada para sempre**
(inclusive ao editar o cadastro) — resta apenas **Inativar** (status Inativo),
preservando o histórico do funcionário.

**Camada de dados (`js/data.js`):**
- Novo carimbo imutável **`createdAt`** em `upsertEmployee`: definido no primeiro
  cadastro e **preservado** em edições e re-imports (`existing?.createdAt || ...`).
  Persiste no localStorage/Firebase (employees serializados por inteiro) e trafega
  no merge newer-wins como os demais campos.
- Nova função **`canDeleteEmployee(employee)`** (exportada): `true` somente se
  `Date.now() - createdAt <= 24h`. Registros **legados sem `createdAt`** (cadastros
  anteriores a esta regra) retornam `false` — não excluíveis, apenas inativáveis
  (comportamento seguro por padrão, alinhado à Regra de Ouro de preservação).
- **`removeEmployee`** passou a validar `canDeleteEmployee` e **lançar erro** quando
  fora da janela — bloqueio na camada de dados, para nenhum caminho (UI/import)
  contornar. `removeEmployeeFromCompany` (usado pelo purge de mocks) segue direto,
  sem a trava, pois é limpeza interna.

**UI (`js/funcionarios.js`):**
- Na lista de cadastro, o botão **Excluir** só é renderizado quando
  `AppData.canDeleteEmployee(employee)` é verdadeiro. Fora da janela, aparece o
  rótulo desabilitado **"Inativar (Editar)"** com tooltip explicando a regra.
- Handler de exclusão envolto em `try/catch`: se `removeEmployee` lançar, exibe
  `alert` com a mensagem e não recarrega — defesa em profundidade.

**Melhoria 2 — Trilha de auditoria (`js/data.js`, `js/firebase-sync.js`, `js/funcionarios.js`):**
- Nova coleção global **`auditLog`** no estado: registra **quem** (e-mail do
  usuário logado via `window.AppAuth`), **qual ação** e **quando** — ações
  `cadastro`, `inativacao`, `reativacao` e `exclusao`. Helpers `recordAudit`,
  `getAuditLog({company,limit})`, `getEmployeeAuditLog(id,company)`. Teto de 3000
  eventos (nunca apaga seletivamente; só descarta os mais antigos ao estourar).
- Desempate de ordem por contador monotônico `seq` (eventos no mesmo ms).
- Persistência completa: `createDefaultState`, `finalizeIncomingState`,
  `buildLeanPersistedState` (auditoria preservada mesmo no cache enxuto) e
  sincronização Firebase (`stateToFirebase`/`firebaseToState`). Merge entre PCs
  por `mergeAuditLogs` (união por id, sem duplicar) em `mergeRemoteIntoLocal`.
- `upsertEmployee` registra `cadastro` no 1º cadastro e `inativacao`/`reativacao`
  quando o status muda; `removeEmployee` registra `exclusao` antes de remover.
  `options.silentAudit` desliga o registro (reservado a migrações).
- UI: botão **"Auditoria"** no rodapé da lista abre um modal (`openAuditPopup`)
  com Quando / Ação / Funcionário / Usuário, filtrado pela empresa da aba ativa.

**Melhoria 3 — Botão Inativar/Reativar na lista (`js/data.js`, `js/funcionarios.js`):**
- Nova função **`setEmployeeStatus(id, status, company)`**: altera **apenas** o
  status preservando todos os demais campos, carimba/limpa `deactivatedAt` (mesma
  regra do `upsertEmployee`) e registra auditoria. Retorna o funcionário; é
  idempotente (status igual não gera evento).
- Cada linha da lista passa a ter **Inativar** (quando Ativo) ou **Reativar**
  (quando Inativo), com confirmação. Substitui o antigo rótulo "Inativar (Editar)".

**Testes:** `npm test` (47/47) e `npm run validate` (25/25) verdes. Scripts
dedicados: `scripts/verify-exclusao-24h.mjs` (13/13) e
`scripts/verify-auditoria-status.mjs` (17/17) — cobrem carimbo/janela de 24h,
auditoria de cadastro/inativação/reativação/exclusão, `setEmployeeStatus`
(preservação de campos, `deactivatedAt`, idempotência) e ordenação/filtro do log.

**Versão:** 20260703.01.

## 2026-07-02 — Inativar funcionário na escala + ajustes de layout (VT impresso e assinatura da Escala)

**Objetivo:** melhorias específicas solicitadas, sem apagar dados nem alterar
regras de negócio.

**1. Funcionário inativo na Escala de Folga (vermelho no passado, oculto no futuro).**
- O campo **Status (Ativo/Inativo)** no pop-up de cadastro (`js/funcionarios.js`)
  e o filtro de relatórios (`isEmployeeActive` em Dashboard, Contador e
  Vale-transporte) **já existiam** — não foram recriados.
- Causa: `getFilteredEmployees` (`js/escala.js`) removia TODO funcionário inativo
  da escala, inclusive em meses passados.
- Correção (`js/escala.js`): funcionário inativo **não aparece em escala futura**;
  nos meses em que ainda fazia parte da empresa continua aparecendo, marcado com
  `_isInactive` e renderizado em **vermelho + tachado** (tela e impressão) para
  indicar que não faz mais parte da empresa. Nenhum dado é apagado; a inclusão é
  só de exibição (não afeta integrações nem relatórios).
- Estilos: `.scale-row-inactive` (`css/style.css`, tela) e
  `.scale-print-row-inactive` (`css/escala-print.css`, impressão).
- **Melhoria 1 — data de saída (`deactivatedAt`):** `upsertEmployee` (`js/data.js`)
  carimba a data no dia da transição Ativo→Inativo, preserva enquanto seguir
  inativo e limpa ao reativar. A Escala passa a exibir o inativo **apenas até o
  mês do `deactivatedAt`** (nunca em meses posteriores à saída). Registros legados
  sem data usam o mês corrente como limite. O campo persiste no localStorage e no
  Firebase (employees serializados por inteiro) e trafega no merge newer-wins.
- **Melhoria 2 — somente-leitura em meses passados:** linhas de inativo em meses
  anteriores ao corrente ficam com os `<select>` `disabled` (`js/escala.js`,
  classe `.scale-row-locked` em `css/style.css`), evitando edição acidental da
  escala de quem já saiu. O mês corrente (saída) segue editável.

**2. Recibo de VT impresso: descrição/observação abaixo dos campos não aparecia.**
- Causa raiz (confirmada por PDF headless do Chrome com o CSS real): no recibo de
  altura fixa da impressão, `.vt-receipt-body` usa `justify-content: flex-end`
  (conteúdo alinhado ao rodapé) e `.vt-declaration-box` tinha `min-height: 18mm`.
  Isso estourava o espaço disponível e, por estar alinhado ao rodapé, o
  `overflow: hidden` cortava o **TOPO** — as primeiras linhas da descrição
  (inclusive a observação "menos X dia de desconto do mês anterior").
- Correção (`css/print.css`, só em `@media print`, versão `20260702.02`): alinhar
  a declaração ao topo (`.vt-receipt-body { justify-content: flex-start }`) e
  deixar a caixa com a altura do próprio conteúdo (`.vt-declaration-box { flex:
  0 0 auto; min-height: 0; max-height: none }`). Layout de tela inalterado.
  Validado com PDF gerado a partir do CSS real (2 recibos, com e sem desconto):
  descrição completa e sem corte. (A 1ª tentativa — só `max-height: none` — foi
  insuficiente; o corte real vinha do `min-height` + alinhamento ao rodapé.)

**3. Recibo de VT: rótulo da assinatura passa a ser o nome do funcionário.**
- `js/vale-transporte.js`: `"Assinatura do funcionário"` → `${esc(receipt.employee.name)}`.

**4. Escala impressa: bloco de assinatura.**
- `js/escala.js`: removida a frase `"Responsável pela empresa"`
  (`.scale-print-sign-role`), mantendo apenas o nome do responsável.
- `css/escala-print.css`: `.scale-print-sign-name` ganhou `margin-top: 5mm` para
  descer o nome dentro do mesmo retângulo (nada fora do retângulo foi alterado).

**Arquivos:** `js/escala.js`, `js/vale-transporte.js`, `js/data.js`,
`js/funcionarios.js` (sem alteração — apenas confirmado), `css/print.css`,
`css/escala-print.css`, `css/style.css`.

**Testes:** `npm test` 47/47 e `npm run validate` (funcional + offline + dedup +
quota) sem falhas; `scripts/verify-inativo-escala.mjs` 12/12 (carimbo/preservação/
limpeza de `deactivatedAt` e regra de visibilidade da Escala).

**Deploy:** commit/push/deploy autorizados pelo usuário; bump de cache aplicado
via `npm run bump-cache` no fluxo de `npm run deploy`.

## 2026-06-24 — Tombstones (`deletedAt`): exclusões passam a se propagar entre PCs

**Objetivo:** fechar a limitação registrada na entrada abaixo — exclusões não se
propagavam (um registro apagado em um PC era "ressuscitado" pelo merge a partir de
outro PC que ainda o tinha).

**Causa raiz:** os merges por id (`mergeEmployeesById`, `mergeRecordsById`,
`mergeLancamentosMaps`) e por chave (`mergeTimestampedMap`) fazem UNIÃO. Sem um
marcador de exclusão, um registro removido de um lado sempre reaparecia do outro.

**Correção — registro de exclusões (tombstones) por versão:**
- `js/data.js`
  - Novo `state.tombstones[colecao][empresa][id] = deletedAt` (ms). O registro
    real continua sendo REMOVIDO do array (comportamento atual preservado — sem
    tocar nas telas de leitura); o tombstone só impede a ressurreição no merge.
  - Helpers `ensureTombstoneStore`, `recordTombstone`, `mergeTombstoneStores`
    (união por id mantendo o `deletedAt` MAIOR) e `applyTombstonesToState`.
  - Resolução por versão: a EXCLUSÃO vence quando `deletedAt >= updatedAt` do
    registro sobrevivente; a EDIÇÃO/RECRIAÇÃO posterior vence quando
    `updatedAt > deletedAt` (e o tombstone obsoleto é então descartado).
  - `mergeRemoteIntoLocal` une os tombstones dos dois lados; `finalizeIncomingState`
    aplica (remove excluídos / poda obsoletos) — cobre merge e load.
  - Coleções por id cobertas: **funcionários, férias e ausências**. Excluir um
    funcionário tomba EM CASCATA suas férias e ausências (evita órfãos).
  - **Feriados** já usavam soft-delete (`isDeleted`); agora `removeHoliday`/
    `restoreHoliday` carimbam `updatedAt` para que a exclusão/restauração VENÇA o
    newer-wins de `mergeHolidayLists` e propague.
  - Camada de persistência "lean" passa a preservar `tombstones` (minúsculos e
    críticos para o merge).
- `js/firebase-sync.js` — serializa/lê o nó `tombstones`.

**Compatibilidade:** estados legados sem `tombstones` seguem normalmente (união
sem remoções). RTDB descarta objetos vazios → leitura tolera `tombstones`
ausente (`|| {}`).

**Limitação remanescente (boundary documentado):** remoção de SUB-registros que
seguem por união — vínculos de feriado (`workedEmployees`) e células de mapa
(escala manual / VT zerada) — ainda não tem tombstone próprio. São edições de
sub-item (parcialmente mitigadas pelos filtros de funcionário ativo) e ficam como
próxima frente, se necessário.

**Testes:** `npm test` 47/47 e `npm run validate` sem erros;
`scripts/verify-tombstones-sync.mjs` 14/14 (exclusão de funcionário/férias/ausência,
"edição depois da exclusão prevalece", união pelo `deletedAt` mais recente,
soft-delete de feriado, cascata funcional e regressão sem tombstones);
`verify-sync-newer-wins.mjs` 13/13 e `verify-contador-sync.mjs` 5/5 (sem regressão).

## 2026-06-24 — Sincronização instantânea (newer-wins) estendida a TODOS os módulos

**Objetivo:** garantir que qualquer edição feita em um PC reflita automaticamente
nos demais, em todos os módulos — não só no Contador.

**Causa raiz (a mesma do item abaixo, generalizada):** todos os merges da
sincronização (`mergeEmployeesById`, `mergeRecordsById`, `mergeRecordMapsPreferLocal`,
`mergeHolidayLists`) preferiam o LOCAL incondicionalmente. No listener em tempo
real, o PC que já tinha o registro descartava a edição recém-feita em outro PC.

**Correção — resolução de conflito por versão (`updatedAt`, newer-wins):**
- `js/data.js`
  - Helpers genéricos `pickNewerRecord` e `mergeTimestampedMap` (mapa chave→valor
    com metadados de versão paralelos `*Meta`).
  - Registros com `id` agora vencem por `updatedAt`: **funcionários**
    (`mergeEmployeesById`), **férias/ausências** (`mergeRecordsById`),
    **lançamentos** (`mergeLancamentosMaps`) e **feriados** (`mergeHolidayLists`,
    apenas nos campos-base nome/data; os vínculos `workedEmployees` continuam por
    UNIÃO+preservação, mantendo CO/compensações de PCs diferentes).
  - Mapas chave→valor com meta paralela e newer-wins por chave:
    **escala manual** (`manualScaleMeta` no bloco da empresa) e
    **Vale-transporte** (`deductionDaysMeta`/`discountValuesMeta` em `valeTransporte`).
  - Carimbo de `updatedAt`/meta somente nas ESCRITAS DO USUÁRIO (upsertEmployee,
    addVacation/updateVacation, addAbsence/updateAbsence, addHoliday/updateHoliday,
    setManualScale, setVtDeduction, saveDiscountValue). Normalização/migração de
    carga **não** recarimba — senão o local pareceria sempre "mais novo".
  - `createCompanyData`/`normalizeCompanyBlock` inicializam `manualScaleMeta`;
    `ensureValeTransporteState`/`normalizeValeTransporteBlock` preservam os metas
    de VT no finalize/persistência.
- `js/firebase-sync.js` — novo nó `escalasMeta` (serializa/lê `manualScaleMeta`);
  os metas de VT trafegam dentro de `valeTransporte` (salvo inteiro).

**Compatibilidade:** em empate ou registros legados (sem `updatedAt`/meta), o
LOCAL é mantido — comportamento idêntico ao anterior. A 1ª edição feita após o
deploy já carimba a versão e passa a propagar corretamente, mesmo sobre dados
antigos sem carimbo.

**Limitação conhecida (pendência):** EXCLUSÕES ainda não se propagam entre PCs
(não há tombstone); um registro apagado em um PC pode ser "ressuscitado" pelo
merge a partir de outro PC que ainda o tenha. Vale para todos os módulos e já
existia antes. Próxima frente: tombstones por `deletedAt`.

**Testes:** `npm test` 47/47 e `npm run validate` (183+15+44+25) sem erros;
`scripts/verify-sync-newer-wins.mjs` 13/13 (funcionários, ausências, férias,
feriados+união, contador, escala manual e VT, incluindo casos legado e
"local mais novo não é sobrescrito") e `verify-contador-sync.mjs` 5/5.

## 2026-06-24 — Sincronização em tempo real: lançamentos do Contador não refletiam em outros PCs

**Problema (CRÍTICO):** lançamento de Ad. Noturno feito em um PC não aparecia em
outro PC com o sistema aberto (nem após reload), quebrando a atualização
instantânea esperada entre computadores.

**Causa raiz:** `mergeLancamentosMaps` (em `js/data.js`), usada por
`mergeRemoteIntoLocal`, preenchia o mapa por `employeeId` primeiro com o remoto e
**depois sobrescrevia incondicionalmente com o local** ("prefere local"). No
listener em tempo real do Firebase (`applyRemoteState(..., fromRemote=true)`), o
PC que já tinha um lançamento antigo do funcionário **descartava** a edição
recém-feita no outro PC. Esse "prefere local" é correto no bootstrap, mas errado
para alterações remotas que acabaram de acontecer.

**Correção (mínima, sem regressão):** resolução de conflito por versão
(*newer-wins*), no mesmo padrão já usado em `companyInfo.updatedAt`.
- `js/contador.js` — `saveLancamento` carimba `lancamento.updatedAt = Date.now()`
  a cada gravação/edição.
- `js/data.js` — `mergeLancamentosMaps` mantém o lançamento com `updatedAt` mais
  recente. Em empate ou registros legados sem `updatedAt`, mantém o local
  (comportamento anterior preservado). O `updatedAt` trafega íntegro no
  round-trip do Firebase (`stateToFirebase`/`firebaseToState` copiam o objeto).

**Testes:** `npm test` 47/47 e `npm run validate` (183 + 15 + 44 + 25) sem erros;
nova verificação focada `scripts/verify-contador-sync.mjs` (5/5) cobre:
remoto mais novo prevalece, local mais novo não é sobrescrito e legado sem
`updatedAt` sem regressão.

**Pendência / recomendação:** o mesmo padrão "prefere local" existe em
`mergeRecordsById` (ausências/férias) e `mergeEmployeesById` (funcionários);
edições simultâneas desses registros em PCs diferentes podem ter o mesmo atraso.
Recomenda-se estender o carimbo `updatedAt` + *newer-wins* a esses merges em
frente futura. (Exclusões ainda dependem de soft-delete/tombstone para propagar.)

## 2026-06-24 — Contador: horas até 200:00, máscara, total no Resumo e regra de proteção

Frente de trabalho na aba **Informações Contador** (commits `3d65563` +
carimbo `ebf0089`; build `2026-06-24`, cache exibida `20260618.02`).

**1. Campos de horas aceitam de 00:00 até 200:00.**
- `js/contador.js` — Hora Extra e Ad. Noturno deixam de usar `<input type="time">`
  (que limitava a 23:59) e passam a digitação livre `HH:MM`. Nova `normalizeHora`
  valida/normaliza (00:00–200:00; rejeita `200:01`, minutos > 59 e texto inválido).
  Validação no submit do pop-up: valor inválido exibe aviso e não salva.

**2. Máscara automática do ":" ao digitar (`maskHora`).**
- `js/contador.js` — os 2 últimos dígitos viram minutos e o restante (até 3) vira
  horas: `1030` → `10:30`, `20000` → `200:00`, `030` → `0:30`. Se o usuário digitar
  o `:`, a posição é respeitada. Normalização final no `blur`. Inputs marcados com
  `.hora-input`; dica de uso no campo.

**3. Totalizador no rodapé do Resumo (tela e impressão/PDF).**
- `js/contador.js` — `computeTotals` + `horaToMinutes`/`minutesToHora`: `<tfoot>`
  com linha **Total** somando cada coluna (horas em `HH:MM`, sem teto na soma;
  valores em R$), sobre os funcionários exibidos.
- `css/style.css` — `.resumo-total-row`/`.resumo-total-cell` (total sticky no
  rodapé, na tela) e `.resumo-print-total` (rodapé fixo na impressão).

**4. Regra fixa: proteção de lançamentos existentes.**
- `PROJECT_RULES.md` — nenhuma melhoria/refatoração/migração pode apagar, excluir
  ou alterar lançamento já efetuado; mudanças de formato valem só para novos
  lançamentos/edições do usuário; exceção única é a ação explícita do usuário na
  UI (editar/excluir com confirmação). Valores antigos seguem válidos e somam ok.

**Testes:** `npm test` 47/47; `npm run validate` (funcional 183, offline 15,
dedup 44, quota 25) sem erros; testes unitários de `normalizeHora`, `maskHora` e
soma de horas OK. Push para `main` e deploy em produção
(`chez-pitu-rh.web.app`) autorizados e concluídos.

## 2026-06-19 — Logo das empresas via Firebase Storage (permanente)

Frente de trabalho (versão `20260618.02`, commits `da18e28` + carimbo `fb5afae`).
Mudança de origem do logo das empresas: de RTDB (`sistemaRH/empresas`) para
**Firebase Storage** (`logos/{CNPJ}/<arquivo>`), tornando-o **permanente** e
visível em todos os módulos que já leem `companyInfo.logoDataUrl`.

**1. Resolução do logo no Storage por CNPJ.**
- `js/firebase-sync.js` — novo `resolveLogoUrlByCnpj(cnpj, company)`: lista a
  pasta `logos/{CNPJ}/` (somente dígitos) e retorna a URL de download da 1ª
  imagem (`png/jpg/jpeg/webp`), independente do nome do arquivo. Trata
  `storage/unauthorized` emitindo no console a regra de leitura necessária.
  Retorna `""` quando não encontra / sem permissão / SDK ausente. Exportado na API.

**2. Importação automática e persistência no boot.**
- `js/app.js` — `importCompanyLogos()` no boot: para cada empresa sem logo, busca
  no Storage por CNPJ e **persiste** via `AppData.updateCompanyLogo` (grava no
  RTDB). Idempotente — empresas que já têm logo são ignoradas.

**3. Escala usa Storage e persiste o logo.**
- `js/escala.js` — `ensureLogoForActiveCompany` reescrito: em vez de só espelhar
  em memória, agora busca via `resolveLogoUrlByCnpj` e persiste com
  `updateCompanyLogo`. Novo `waitForImages()` aguarda a logo (URL externa do
  Storage) carregar antes do `window.print()` (timeout de segurança de 2s).

**4. Vale-transporte aguarda a logo antes de imprimir.**
- `js/vale-transporte.js` — antes de `window.print()`, espera as imagens da área
  de impressão carregarem (timeout 2s) para não imprimir sem o logo.

**5. SDK de Storage no index.html.**
- `index.html` — inclui `firebase-storage-compat.js`; `?v=` atualizado para
  `20260618.02`.

**Pré-requisito de infra:** regra de leitura publicada no Firebase Storage
(`match /logos/{cnpj}/{arquivo=**} { allow read: if request.auth != null; }`),
senão a resolução cai em `storage/unauthorized`.

**Testes:** `npm test` 47/47, `npm run validate` 25/25. Validado no preview pelo
usuário (logos das duas empresas, impressão Escala + Vale-transporte). Deploy em
produção (`chez-pitu-rh.web.app`) e push para `main` autorizados e concluídos.

## 2026-06-17 — Impressão da Escala em 1 página, logo por CNPJ, vínculo manual e infra de continuidade

Frente de trabalho com quatro entregas (versão `20260617.02`):

**1. Impressão da Escala em 1 única página A4 paisagem (auto-fit).**
- `js/escala.js` — nova `applyPrintFitScale`: mede a altura real do conteúdo no
  momento da impressão e aplica `transform: scale()` somente em `@media print`;
  o container é travado em 210mm. Garante 1 folha sem cortar funcionários, em
  qualquer tamanho de quadro (quadros pequenos ficam em escala 1.0).
- `css/escala-print.css` / `css/print.css` — `@media print` da escala passou de
  fluxo multipágina para página única (container 210mm / `overflow: hidden`).

**2. Correção da coluna "Funcionários" larga demais / grade deslocada (causa raiz).**
- A **faixa repetida** (`scale-print-repeat-band`, `<th colspan>` como 1ª linha do
  `<thead>`) quebrava o `table-layout: fixed`: em layout fixo as larguras vêm da 1ª
  linha, e uma célula com `colspan` não define largura por coluna, jogando a tabela
  para o modo conteúdo (coluna de nomes ~554px, dias ~18px). A faixa só servia para
  repetir cabeçalho em multipágina — obsoleta com 1 página. **Removida**
  (`js/escala.js`). Resultado: razão nome/dia caiu de ~30× para 2,2–3,0; grade
  preenche 100%. Coluna de nomes estreitada (38→26 / 34→23 / 30→20 mm por densidade)
  e nome em 1 linha com reticências (`text-overflow: ellipsis`).

**3. Logo da empresa por CNPJ na impressão.**
- `js/escala.js` — `ensureLogoForActiveCompany`: o logo (`companyInfo.logoDataUrl`,
  mesmo mecanismo do Cadastro/VT) some quando o cache local degrada por cota; agora
  é buscado direto no Firebase (`sistemaRH/empresas`), casando por CNPJ normalizado
  (com/sem máscara), antes da prévia/impressão, e espelhado em memória (sem
  persistir). Ausente: `console.warn`, sem placeholder gigante.

**4. Vínculo manual de feriados retroativos (revelar vínculo existente).**
- `js/data.js`, `js/feriados.js`, `js/dashboard.js` — ao bloquear duplicidade, o
  sistema passa a revelar o vínculo existente (feriado/data/status/origem/
  compensação) com diálogo "Ver vínculo existente"; vínculo manual confirmado
  aparece no Histórico e no modal CO (`historyOverride`).

**5. Infraestrutura de continuidade de sessão.**
- `.claude/project-state.md`, `.claude/session-recovery.md` e comandos
  `.claude/commands/{recuperar-projeto,atualizar-estado,retomar-contexto}.md`.

Testes: `npm test` 47/47 · `npm run validate` OK · homologação de impressão 55/55,
vínculo 31/31, feriados retroativos 24/24 (scripts `scripts/verify-*.mjs`,
homologação não versionada).

## 2026-06-16 — Migração de hospedagem: Netlify → Firebase Hosting

Decisão:
O site passou a ser publicado **diretamente no Firebase Hosting** (projeto
`chez-pitu-rh`, o mesmo já usado para Auth e Realtime Database). Não usamos mais
Netlify. Produção responde em `chez-pitu-rh.web.app` e `chez-pitu-rh.firebaseapp.com`.

Alterações:
- `js/data.js` — `detectEnvironment()` agora marca PRODUÇÃO para hosts
  `*.web.app` / `*.firebaseapp.com` (antes era `*.netlify.app`). O fallback para
  qualquer host não-local já era PRODUÇÃO, então não há regressão de comportamento.
- `package.json` — scripts `deploy*` passam a usar `firebase` (`firebase deploy
  --only hosting`, `hosting:channel:deploy preview`, `--non-interactive` no CI).
  devDependency `netlify-cli` → `firebase-tools`.
- `firebase.json` (NOVO) — hosting com `public: "."`, rewrite SPA → `/index.html`
  e os mesmos headers de segurança/cache do antigo `netlify.toml`. Deploy é
  `--only hosting`; regras do Database (`database.rules.json`) NÃO são enviadas
  por este fluxo (evita sobrescrever regras de produção sem intenção).
- `.firebaserc` (NOVO) — projeto default `chez-pitu-rh`.
- `.gitignore` — ignora `.firebase/` e `firebase-debug.log`.
- Docs atualizados: `CLAUDE.md` (Deploy), `DEPLOY.md` (reescrito p/ Firebase),
  `PROJECT_STATUS.md`, `MANUAL_USUARIO.md` (acesso → chez-pitu-rh.web.app).
- Mantidos como OBSOLETO (banner no topo, não usar): `netlify.toml`,
  `CONFIGURAR-NETLIFY-SITE-EXISTENTE.md`, `scripts/deploy.ps1`.

Pendência: push/deploy aguardando autorização. Após `npm install` (troca de
dependência) e `firebase login`, publicar com `npm run deploy`.

## 2026-06-15 — Feriados retroativos (anteriores ao Corpus Christi)

Problema:
Não era possível cadastrar/vincular feriados anteriores ao Corpus Christi
(ex.: Ano Novo, Carnaval). Ao tentar vincular um funcionário (ex.: André Justo a
"São Jorge 2/3" em 23/04), o sistema acusava "funcionário já está vinculado a
este feriado", mesmo num feriado recém-criado.

Causa raiz:
- `syncAutoHolidaysWorkedForMonth` (js/scale-rules.js) auto-vincula todo
  funcionário ativo a qualquer feriado num dia cujo código de escala conte como
  "trabalhado". Dia SEM código retorna "" em `getScaleCode`, e
  `isWorkedScaleCode("")` = true → dia vazio conta como trabalhado. Ao recomputar
  a escala de abril, André (que trabalhou 23/04) era auto-vinculado a qualquer
  feriado criado nessa data, antes do vínculo manual.
- `addManualWorkedEmployee` (js/data.js) bloqueava qualquer employeeId já
  presente em workedEmployees, inclusive os vínculos automáticos.
- Risco já documentado (Fase 3B): meses sem escala (jan/fev/mar) podiam
  auto-vincular TODOS os funcionários, pois dia vazio = trabalhado.

Correção (decisões confirmadas com o usuário):
1. addManualWorkedEmployee — UPSERT seguro (js/data.js): para vínculo existente
   Pendente/Vencido (tipicamente automático), em vez de erro, confirma e converte
   para origem "Manual" (autoCreated=false), preservando status/datas. Nada é
   apagado nem duplicado. Agendado/Compensado continuam bloqueados (preserva
   compensação). Retorna `{ ok, converted, message }`.
2. Trava de auto-vínculo por mês (js/scale-rules.js): novo `monthHasScaleData` —
   `syncAutoHolidaysWorkedForMonth` só roda em meses com escala REAL preenchida
   (manualScale com código, ou férias/ausência no mês). Meses retroativos sem
   escala (jan/fev/mar) não auto-vinculam ninguém. Abril/maio/junho (com folgas/
   códigos) seguem funcionando, inclusive feriado trabalhado de dia vazio.
3. Seed retroativo (js/data.js): HOLIDAY_SEED_2026 ganhou Ano Novo (2026-01-01) e
   Quarta-feira de Cinzas (2026-02-18); flag bumpada v2 → v3. Idempotente por
   conteúdo, escopo "ambas", workedEmployees vazio (ninguém auto-vinculado).
   Sexta-feira Santa/Tiradentes/São Jorge já existiam — não duplicados.
4. Modais de vínculo (js/feriados.js) exibem result.message (informa conversão).

Arquivos:
- js/data.js (addManualWorkedEmployee upsert; HOLIDAY_SEED_2026 +2 itens, flag v3)
- js/scale-rules.js (monthHasScaleData + guard + export)
- js/feriados.js (toast usa result.message nos dois modais)
- js/version.js + index.html (cache v=20260615.01)
- scripts/test-holiday-deduplication.mjs (isola teste Ano Novo do seed)
- scripts/verify-feriados-retroativos.mjs (NOVO — homologação, não versionar)

Testes:
- npm test → 47/47
- npm run validate → funcional 183/183, offline 15/15, dedup 44/44, quota 25/25
- verify-feriados-retroativos.mjs → 24/24 (seed, trava por mês, conversão
  automático→Manual sem duplicar, bloqueio preserva Agendado/Compensado)

Pendência: commit/push/deploy aguardando autorização (regra CLAUDE.md). Carnaval
(16-17/02) e Dia do Trabalho (01/05) NÃO entraram no seed (não selecionados) —
podem ser adicionados depois ao HOLIDAY_SEED_2026 ou cadastrados manualmente.

## 2026-06-10 — Fase 3C: Vínculo manual funcionário × feriado + Controle de versão visível

### Parte 1 — Botão global "+ Vincular funcionário a feriado"

Problema:
A vinculação manual implementada antes só existia dentro de linhas da tabela
(botão "+ Funcionário" por linha) e no popup. Quando o filtro não retornava
resultados (ex.: "Tiradentes" → "Nenhum resultado"), não havia linha e o botão
sumia. Acrescido de cache `?v=` não incrementado, a funcionalidade não chegava
à interface real.

Solução definitiva (js/feriados.js):
- Botão GLOBAL `#openLinkEmployeeHoliday` no topo do Controle de Feriados, ao
  lado de "+ Cadastrar feriado". Sempre visível, mesmo com tabela vazia/filtrada.
- `showLinkEmployeeToHolidayModal()`: modal com Feriado (cadastrados da empresa
  ativa) + Funcionário (ativos da empresa ativa) + Data trabalhada (auto pelo
  feriado, travada) + labels Pendente/Manual + Salvar vínculo.
- `addManualWorkedEmployee()` (js/data.js): grava `{ employeeId, status:
  "Pendente", origin: "Manual", compensationDate: "" }`. Bloqueia duplicidade
  por employeeId (Pendente/Agendado/Compensado → aviso, não cria).
- Vincula apenas o funcionário selecionado; nunca todos. employeeId como chave.

### Parte 2 — Controle de versão visível

- `js/version.js`: FONTE ÚNICA `APP_VERSION` (formato AAAAMMDD.RR). Único ponto
  a editar; expõe `window.APP_BUILD_INFO`.
- `AppData.getSystemVersion()` (js/data.js): `{ version, environment, buildDate,
  branch, commit }`. `detectEnvironment()`: file://localhost → LOCAL;
  *.netlify.app → PRODUÇÃO.
- Badge `#appVersionBadge` no cabeçalho (index.html), ao lado de "Sincronizado":
  exibe `v2026.06.10.02 | LOCAL|PRODUÇÃO`. Clique abre modal de auditoria
  (`setupVersionBadge`/`showVersionModal` em js/app.js).
- `scripts/bump-cache.js` reescrito: lê `APP_VERSION` e propaga para todos os
  `?v=` do index.html; carimba branch/commit/data reais do git. Cache e versão
  exibida ficam sempre idênticos.

Arquivos:
- js/feriados.js (botão global + modal + listener)
- js/data.js (addManualWorkedEmployee, getSystemVersion, detectEnvironment, exports)
- js/app.js (badge + modal de versão)
- js/version.js (NOVO — fonte única da versão)
- index.html (script version.js + badge + bump ?v=20260610.02)
- css/style.css (.feriados-toolbar-actions, .app-version-badge, .version-info-table)
- scripts/bump-cache.js (derivado de APP_VERSION + git stamp)
- scripts/verify-vinculo-manual.mjs (NOVO — homologação temporária, não versionar)

Versão de cache: 20260610.02 (exibida v2026.06.10.02).

Testes:
- npm test → 47/47
- npm run validate → 267 checks, 0 falhas
- verify-vinculo-manual.mjs → 24/24 (criação Pendente/Manual, bloqueio de
  duplicidade, visibilidade no modal CO p/ vinculados e ocultação p/ não
  vinculados, getSystemVersion)

Pendência: commit/push/deploy aguardando autorização (regra CLAUDE.md). A
validação em produção (aba anônima em rh-chezpitu.netlify.app) só é possível
após deploy.

## 2026-06-10 — Fase 3B: Feriados de abril/2026 ausentes para vinculação de CO (CORRIGIDO)

Problema:
Semana Santa (03/04/2026), Tiradentes (21/04/2026) e São Jorge (23/04/2026)
não apareciam no modal de vinculação de CO da Escala de Folga.

Causa raiz:
Esses feriados nunca foram cadastrados na base (nem em `state.calendarHolidays`
nem em `companies[*].holidays`). O modal CO só exibe feriados em que o
funcionário tem vínculo (`workedEmployees`), e o vínculo só pode existir se o
feriado existir. Não havia filtro indevido nem marcação incorreta de
compensado: os registros simplesmente não existiam.

Correção (js/data.js):
- Seed único `applyHolidaySeed2026IfNeeded()` (flag `chezPituHolidaySeed2026.v1`):
  cria os 3 feriados no calendário global (`cal-seed-2026-*`, escopo "ambas") e
  em cada empresa (`feriado-seed-2026-*`) com `workedEmployees` VAZIO — nenhum
  vínculo automático, nenhuma pendência em massa. O usuário seleciona
  manualmente no Controle de Feriados quem trabalhou; só então o feriado
  aparece no modal CO daquele funcionário.
- Idempotente por conteúdo: variantes de nome ("Sexta-feira Santa" ≈ "Semana
  Santa") em 2026 não são duplicadas; registros existentes (inclusive
  soft-deletados) nunca são alterados nem ressuscitados.
- `mergeRemoteIntoLocal`: seeds locais do calendário sobrevivem ao merge com o
  Firebase (antes, remoto não-vazio descartava o calendário local inteiro e a
  flag impediria novo seed — feriados sumiriam para sempre).
- Auditoria somente leitura `AppData.auditHolidayConsistency()`: detecta
  vínculos invisíveis para CO, status divergente, vínculos órfãos,
  "Compensado" sem data, duplicidades ativas, datas divergentes do calendário
  e feriados sem vínculo.

Arquivos:
- js/data.js (+seed, +merge de calendário, +auditoria, exports)
- index.html (bump de cache v=20260610)
- scripts/test-seed-2026.mjs (15 testes — temporário, não versionar)

Testes:
- npm test → 47/47
- npm run validate → 267 checks, 0 falhas (funcional + offline + dedup + quota)
- seed 2026 → 15/15
- auditoria (sintético) → 9/9
- fluxo CO ponta a ponta → seed não cria vínculo; após seleção manual os 3
  feriados aparecem Pendentes no modal CO

Risco conhecido (comportamento pré-existente, NÃO alterado):
`syncAutoHolidaysWorkedForMonth` cria vínculos automáticos ("Automático pela
escala") para quem tem código "trabalhado" na escala quando o mês do feriado é
recomputado (ex.: abrir a Escala em abril/2026). Código vazio conta como
trabalhado — conferir a escala de abril antes de navegar até o mês.

Status: ✅ CORRIGIDO E TESTADO. Sem commit/deploy (aguarda autorização).

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

> ⚠️ Atualizado em 2026-06-16: a hospedagem migrou para **Firebase Hosting**.
> Ver entrada "Migração de hospedagem" no topo deste arquivo e `DEPLOY.md`.
> O registro abaixo reflete o estado da época (Netlify).

Projeto conectado:
- GitHub: lucianocordeirolfc-boop/rh-chezpitu
- Netlify: rh-chezpitu.netlify.app

Fluxo recomendado:
1. testar
2. commit
3. push main
4. validar deploy Netlify