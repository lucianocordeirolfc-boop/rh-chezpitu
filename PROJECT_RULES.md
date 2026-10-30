# PROJECT_RULES.md — Regras de Negócio RH Chez Pitu

## Imutabilidade dos dados já registrados (REGRA FIXA — TODOS OS MÓDULOS)

**Nenhuma melhoria, correção, refatoração, migração, homologação ou TESTE pode
alterar, apagar, sobrescrever ou "corrigir" um dado já registrado pelo usuário.**

Vale para **todos** os módulos, sem exceção:

| Módulo | Dados protegidos |
|---|---|
| Controle de Feriados | feriados lançados, vínculos funcionário × feriado, status (Pendente/Agendado/Compensado/Vencido), compensações, tombstones |
| Escala de Folga | códigos lançados por dia (CO, TR, TM, MR, FOLGA, vazio), meses fechados, meses passados |
| Vale-transporte | recibos gerados, valores, descontos, abatimentos já apurados |
| Ausências / Férias | períodos lançados, atestados, licenças, afastamentos |
| Informações Contador | lançamentos de horas (Hora Extra, Ad. Noturno), resumos e PDFs já emitidos |
| Cadastro de Funcionários | funcionários, `employeeId`, `createdAt`, `deactivatedAt`, `auditLog` |

Regras operacionais derivadas:

1. **Teste nunca escreve na base real.** Homologação de melhoria/correção usa
   **fixtures** e `scripts/verify-*.mjs` (sandbox em memória), nunca o
   `localStorage` de produção nem o Firebase de produção.
2. **Validação ao vivo em produção é SOMENTE LEITURA.** Abrir tela, conferir,
   fechar. Proibido acionar, como parte do teste, rotinas que gravam — em
   especial `runScaleIntegrations` / recompute de escala, `syncAutoHolidays*`,
   seeds e migrações (foi exatamente isso que materializou 10 vínculos Vencidos
   em 2026-08-06; ver `PROJECT_HISTORY.md`).
3. **Mudança de formato/validação vale só para o futuro.** Novos formatos (ex.:
   máscara `HHH:MM` do Contador) aplicam-se a novos lançamentos e a edições
   feitas pelo próprio usuário; valores antigos continuam legíveis e válidos.
4. **Rotina automática não descarta dado.** Nenhum job, sync, seed, dedup ou
   migração pode remover registro sem ação direta do usuário na interface.
5. **Merge sempre aditivo.** Firebase × localStorage fazem união segura; nunca
   sobrescrever o remoto com base filtrada ou parcial.
6. **Se um teste precisar de dado, ele cria o seu próprio** — nunca reaproveita
   nem muta registro existente.

**Exceção única:** exclusão/edição explícita feita pelo próprio usuário na
interface (botões de editar/excluir), com confirmação. Correção de dado em
produção pelo agente exige **autorização explícita do usuário caso a caso**, com
o que será alterado descrito antes da execução.

Em caso de dúvida: **não gravar** e perguntar.

## Lixeira — nada some do sistema (REGRA FIXA)

Vigente desde 2026-10-30. Origem: vínculos de feriado do Carlos Andrey (e
feriados inteiros da Chez Pitu com vínculos compensados) sumiram por exclusões
definitivas que guardavam só a marca da exclusão (tombstone), não o conteúdo —
não havia como recuperar.

1. **Toda exclusão definitiva arquiva antes.** Excluir vínculo, excluir
   funcionário, férias ou ausência grava
   ANTES, em `state.deletedArchive`, a cópia completa do que sai (status,
   compensação, CO da escala ligado, vínculos do funcionário), com quem e quando.
   Função: `archiveDeletion` (js/data.js). **Nova função que remova dado tem de
   chamá-la** — e ganhar asserção em `scripts/verify-lixeira.mjs`.
2. **A lixeira nunca é podada.** Nenhuma rotina, sync, seed, dedup ou migração
   apaga entrada dela. Restaurar só marca `restoredAt`/`restoredBy`.
3. **Restaurar é ação do usuário** (botão "Lixeira (N)" em Controle de Feriados,
   Cadastro de Funcionários e Férias/Ausências), com confirmação, e **nunca
   sobrescreve** dado lançado depois da exclusão: só devolve o que falta; célula
   da escala alterada depois não é tocada.
4. **Restauração vence o tombstone.** Item restaurado leva `restoredAt` posterior
   à exclusão; `applyHolidayTombstones` / `applyWorkedLinkTombstones` mantêm o
   registro e descartam o tombstone obsoleto — outro PC não o apaga de novo.
   Sem `restoredAt`, a exclusão continua vencendo (não ressuscita).
5. **Transporte:** aninhada em `tombstones.__deletedArchive` no Firebase (mesmo
   motivo dos demais tombstones — sem nó novo de topo). Merge = união por id.
6. **Rotina automática não descarta vínculo.** `normalizeWorkedEmployeeRefs`
   preserva o vínculo cujo funcionário não é encontrado no cadastro (antes ele
   sumia em silêncio).
7. **Confirmação diz o que sai.** "Excluir vínculo" nomeia funcionário, feriado,
   situação e alerta quando já há compensação.
8. **Feriado cadastrado não se exclui** — ver "Feriado cadastrado não se exclui
   (REGRA FIXA)". A entrada `feriado` da Lixeira existe só para recuperar
   exclusões feitas antes dessa regra.

## Padrão visual / Cores (REGRA FIXA)

O sistema segue o **padrão de cores oficial do Grupo Chez Pitu**: **navy + pêssego**.
Fonte de verdade do padrão: `C:\Users\conta\projetos\chezpitu-firebase\hosting\rh`.
Nunca reverter para a paleta antiga (verde-mar + dourado).

Tokens oficiais (em `css/style.css`, bloco `:root` da Fase 2):
- `--sea-900: #0e2148`
- `--sea-800: #133169`  (navy principal da marca)
- `--sea-700: #1d3f73`
- `--sea-500: #2a5d8f`
- `--sea-200: #c9d6ea`
- `--sea-100: #eef2f8`
- `--gold: #FFBC7D`     (pêssego — cor de destaque da marca)
- `--soft-blue: #4FA8FF`
- `--shadow: 0 16px 40px rgba(19, 49, 105, 0.12)`

Chrome institucional (sempre escuro navy + destaque pêssego): `.topbar`, `.company-tab`,
`.module-ribbon`, `.ribbon-item` usam navy `#102346`/`#15294F` com realce `#FFBC7D`.
Conteúdo dos módulos e folhas de impressão permanecem claros.

Proibido:
- Substituir esses tokens por outras cores sem autorização.
- Deixar `css/style.css` divergir do padrão de `chezpitu-firebase/hosting/rh`
  (após qualquer deploy, conferir se as cores continuam navy + pêssego).

## Empresas

Empresas do sistema:
- Chez Pitu
- Pengold

A empresa do funcionário deve vir do Cadastro de Funcionários.

Funcionário não pode aparecer em empresa diferente da cadastrada.

## Cadastro de Funcionários

Cada funcionário deve ter:
- employeeId
- nome
- empresa
- setor
- cargo
- horário
- status ativo/inativo

employeeId é o vínculo principal do sistema.

### Funcionário inativo (REGRA FIXA)

Funcionário com status **Inativo** não aparece nas telas operacionais:
Cadastro de Funcionários, Escala de Folga e Controle de Feriados.

O dado nunca é apagado — some apenas da tela. Para consultar ou reativar, cada
tela tem o botão **"Mostrar funcionários inativos (N)"**, que abre um seletor
onde se marca individualmente quem deve reaparecer. A seleção é de exibição,
vale só para aquela sessão e não altera nenhum registro.

No Cadastro, o filtro **Status = Inativo** também traz os inativos: é um pedido
explícito do usuário e vence a regra de ocultar.

**Inativar exige a data de desligamento.** Tanto o botão "Inativar" da lista
quanto a mudança de status pelo formulário abrem uma caixa de diálogo que só
conclui com uma data informada — não futura e não anterior à admissão. A data é
gravada em `deactivatedAt` e é o que a Escala usa para exibir o funcionário até
o mês da saída (nunca em meses posteriores). Chamadas sem data (importações e
código legado) mantêm o fallback antigo: data já registrada ou hoje.

## Escala de Folga

A escala deve respeitar:
- empresa
- mês
- ano
- setor
- funcionário

A escala não pode misturar funcionários de empresas diferentes.

Trocar empresa não pode apagar dados.

Trocar mês não pode apagar dados.

## Impressão da Escala — geometria da folha (REGRA FIXA)

Vigente desde 2026-09-07 (`20260907.01`). Ver `PROJECT_HISTORY.md` →
"Escala impressa: folha inteira e layout igual nas duas empresas".

**1. A geometria da folha mora FORA de `@media print`.**
As medidas, fontes e colunas da folha ficam no bloco `#scalePrintContainer` de
`css/escala-print.css`, sem media query. Dentro de `@media print` só entra regra
de **página** (esconder o resto do app, travar o body e o container em
297×210mm).

Motivo: `applyPrintFitScale` (`js/escala.js`) mede `scrollHeight` com o
container já no DOM, mas ainda em mídia `screen`. Se a geometria estiver dentro
de `@media print`, a medição enxerga o layout de tela — cabeçalho e logo
maiores, campos `.no-print` ainda visíveis, rodapé mais espaçado — e devolve uma
altura maior que a real (foram 811px contra 755px). O fator sai menor que 1 sem
necessidade e a folha encolhe **duas vezes**: uma pelo CSS de impressão, outra
pelo `transform: scale()`.

**2. Toda dimensão HORIZONTAL é compensada pelo fator de auto-fit.**
Largura da folha, margens laterais e coluna de nomes são escritas como
`calc(<medida> / var(--scale-print-fit, 1))`; o `transform: scale(fator)` as
devolve ao tamanho impresso pretendido. A altura do quadro varia (número de
funcionários e de setores); a largura, não — são sempre 30/31 dias mais a coluna
de nomes. Só **altura de linha e corpo de fonte** acompanham a redução.

Sem isso, encolher para caber nos 210mm encolhe junto a largura e sobra faixa
branca à direita — e, como a sobra depende do tamanho do quadro, cada empresa
sai com colunas de larguras diferentes.

**3. As duas empresas têm a MESMA geometria impressa.**
Chez Pitu e Pengold só podem diferir em **cor** (cabeçalho da tabela, faixa de
setor, título, nome legal). Coluna de nomes (26mm), coluna de dia, corpo de
fonte, altura de linha e fator de auto-fit têm de ser idênticos para o mesmo
quadro. Coberto por asserção em `scripts/verify-print-escala.mjs`.

**4. As regras de pré-visualização não podem alcançar a folha.**
Os blocos `@media screen and (max-width: …)` que reduzem a prévia devem ser
escopados em `.scale-print-preview-scroll`. Sem escopo, os `margin-right` /
`margin-bottom` negativos da prévia contaminam a medição em telas estreitas.

**5. O harness mede antes de marcar o body.**
`scripts/verify-print-escala.mjs` tem de reproduzir a ordem real de
`printScale`: medir em mídia `screen`, sem `body.printing-scale`, e só então
marcar o body e emular `print`. Marcar antes de medir esconde exatamente a
classe de bug descrita no item 1. A suíte exige medição `screen` = medição
`print`.

## Códigos da Escala

Códigos importantes:
- F = Folga
- D = Domingo
- FÉRIAS = Férias
- CO = Folga compensatória
- TR = cobertura Catherina
- TM = cobertura André
- MR = cobertura Rosana

## Regras de cobertura

Catherina Victoria de Azeredo:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código TR.

André Justo de Barros:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código TM.

Rosana Santos de Freitas:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código MR.

Férias e atestados também devem respeitar regras de cobertura quando aplicável.

## Vale-transporte

Para cálculo de VT, contam apenas dias realmente trabalhados.

Não contam como dia trabalhado:
- F
- D, se for folga/domingo não trabalhado
- FÉRIAS
- ATESTADO
- LICENÇA
- CO
- ausência cadastrada

CO deve obrigatoriamente abater VT.

Férias devem abater VT.

Atestado deve abater VT.

Licença deve abater VT.

Ausência cadastrada deve prevalecer para cálculo de VT, mesmo que exista lançamento manual conflitante na escala.

## Controle de Feriados

Todo feriado trabalhado gera direito à compensação.

Prazo máximo:
- 120 dias corridos a partir da data trabalhada.

Status possíveis:
- Pendente
- Agendado
- Compensado
- Vencido

Regra:
- Pendente: sem data de compensação.
- Agendado: com data futura de compensação.
- Compensado: já compensado.
- Vencido: passou de 120 dias e não compensou.

A tela principal mostra apenas funcionários **ativos** — o vínculo de quem foi
desligado continua na base, mas só reaparece pelo botão "Mostrar funcionários
inativos". Ver "Cadastro de Funcionários → Funcionário inativo (REGRA FIXA)".

## Feriado cadastrado não se exclui (REGRA FIXA)

Vigente desde 2026-10-30, a pedido do usuário. **Nenhum usuário pode excluir um
feriado já cadastrado** — nem definitivamente, nem por soft delete. A única
exclusão permitida no Controle de Feriados é a do **vínculo de um funcionário
específico** com um feriado ("Excluir vínculo"), que vai para a Lixeira.

- A tela não tem botão de excluir feriado (modal "Gerenciar feriados" e lista de
  feriados cadastrados só têm **Editar** e **+ Funcionário**).
- Na camada de dados, `removeHolidayEverywhere`, `removeCompanyHolidayPermanently`,
  `removeCalendarHolidayPermanently`, `removeHoliday` (js/data.js) e
  `ScaleRules.removeCalendarHoliday` **recusam sempre** (`{ ok: false, blocked: true }`
  / `false`) sem tocar em nada. Novos tombstones de feriado não são gravados.
- Corrigir nome/data: **Editar** (`updateHolidayEverywhere`, preserva vínculos).
- Duplicatas de mesmo nome + data continuam sendo **mescladas** automaticamente
  (`mergeDuplicateHolidaysInBlock`), unindo os vínculos — nada se perde.
- **Exclusões antigas continuam valendo:** os tombstones gravados antes desta
  regra (`state.holidayTombstones`) seguem impedindo o retorno por merge, seed e
  auto-sync. Recuperar um feriado excluído antes da regra só por restauração
  autorizada (entrada `feriado` da Lixeira, com `restoredAt`).
- Proibido reintroduzir exclusão de feriado (botão, função ou rotina) sem
  autorização explícita do usuário. Cobertura: `verify-exclusao-feriado-definitiva.mjs`,
  `verify-feriados-todos-anos.mjs`, `verify-lixeira.mjs` e a checagem de fonte em
  `run-functional-validation.mjs`.

Histórico: a exclusão definitiva existiu de 2026-08-06 a 2026-10-30 e apagou
Tiradentes, São Jorge, Trabalhador e Corpus Christi 2026 da Chez Pitu com todos
os vínculos (ver PROJECT_HISTORY.md → 2026-10-30).

### Exclusão de vínculo (definitiva)

"Excluir vínculo" (funcionário × feriado) é **definitivo na tela** (vai para a
Lixeira, de onde pode ser restaurado) e grava um
**tombstone de vínculo** (`state.workedLinkTombstones`, chave `data|nome|employeeId`)
que impede a recriação pelo **auto-vínculo da escala**
(`syncAutoHolidaysWorkedForMonth`) e pela **união do merge** entre PCs. Revincular
o mesmo funcionário pela interface limpa o tombstone. Sem isto, funcionários com
código de escala "trabalhado" (código vazio inclusive) no dia do feriado eram
re-vinculados automaticamente.

### Transporte dos tombstones no Firebase

`holidayTombstones` e `workedLinkTombstones` trafegam **aninhados** dentro do nó
`tombstones` do RTDB (`__holidayTombstones` / `__workedLinkTombstones`). Não criar
novos nós de topo sob `sistemaRH`: o deploy (`--only hosting`) NÃO publica as
regras do Database, então um nó não previsto nas regras de produção pode ter a
escrita negada (`permission_denied`).

## Vínculo automático anulado pela escala (REGRA FIXA)

Vigente desde 2026-10-30, a pedido do usuário ("se na escala marca folga, não
deve aparecer na relação de feriados").

O auto-vínculo só CRIA vínculo quando a escala marca o dia do feriado como
trabalhado — e nunca o apaga depois. Se a folga é trocada e a escala do dia
passa a marcar não trabalhado (FOLGA, DOM, FÉRIAS, atestado, licença...), o
vínculo **automático e sem nenhuma compensação** deixa de aparecer em toda a
relação de feriados — Histórico, cards do Dashboard, modal CO, contador "Auto
escala" e relatório PDF —, antes e depois da data do feriado.

- Função única: `isAutoLinkVoidedByScale` (js/data.js), aplicada dentro de
  `isWorkedEntryVisibleInHistory`. Não criar filtro paralelo em outra tela.
- **Nada é apagado:** o registro continua na base; se a escala voltar a marcar
  trabalho, o vínculo reaparece sozinho.
- **Não se aplica** a vínculo manual, com `historyOverride`, ou com qualquer
  compensação (`compensationDate`, `scheduledCoDate`, `scaleCoDate`, CO ligado):
  esses continuam visíveis com o alerta "Escala indica folga" — há decisão do
  usuário a tomar (ex.: CO já gozado para um feriado em que ele folgará).
- Mês sem escala lançada (`monthHasScaleData`, agora em js/data.js) não anula.

Cobertura: `scripts/verify-feriados-escala-folga.mjs`.

## Auto-vínculo da escala (guarda anti-regressão)

`syncAutoHolidaysWorkedForMonth` cria vínculos automáticos de feriado para
funcionários ativos com código de escala "trabalhado" no dia (código vazio conta
como trabalhado). Regra fixa:

- **Nunca CRIAR** auto-vínculo para feriado cujo **prazo de compensação (120 dias)
  já passou** (nasceria Vencido). Auto-vínculo overdue é ruído e não é compensável.
- A guarda **só bloqueia criação** — nunca apaga vínculo já existente.
- Casos reais de trabalho em feriado já vencido entram por **cadastro manual**
  (não passa pela guarda).

Função: `getHolidayCompensationDueDate` em `js/scale-rules.js`. Teste:
`scripts/verify-auto-vinculo-vencido-guard.mjs`. Ver PROJECT_HISTORY.md → 2026-08-06 (3).

## Salvaguarda ao validar em produção (processo do agente)

> Regra-mãe: **"Imutabilidade dos dados já registrados"** (topo deste arquivo).

Ao validar uma correção/melhoria ao vivo em produção:

- A validação deve ser **somente leitura** sempre que possível.
- **Não executar** rotinas que gravam na base como parte do teste — em especial
  `runScaleIntegrations`/recompute de escala, que dispara o auto-vínculo e pode
  **materializar dados** (ex.: pendências Vencidas) que não existiam.
- Para exercitar lógica que grava, usar **fixtures**/`scripts/verify-*.mjs`
  (sandbox), nunca a base de produção.
- Rodar `npm test` + `npm run validate` antes de qualquer deploy. Desde
  2026-08-10 o `validate` roda **todas** as suítes (inclusive os
  `scripts/verify-*.mjs`) mesmo quando uma falha, e só então reprova — leia o
  resumo final, não só a última linha da saída. Para focar: `npm run validate <termo>`.
- Ao criar um `scripts/verify-*.mjs`, cadastre-o em `SUITES` de
  `scripts/run-validate.mjs`. Fora da lista o script apodrece sem ninguém notar
  (o runner avisa, mas não reprova).
- **Fixture com data fixa é dívida.** Qualquer dado de teste sujeito a prazo
  (feriado × 120 dias de compensação, janela de 24h de exclusão) deve ser
  relativo a `todayISO()`. Fixtures datadas já quebraram a suíte sozinhas, sem
  nenhuma mudança de código.

## CO e Feriados

O código CO deve se vincular somente a feriados pendentes do próprio funcionário.

O modal CO deve filtrar por:
- employeeId
- empresa
- status Pendente ou Vencido
- não compensado
- não vinculado a outro CO

Nunca mostrar feriados pendentes de outro funcionário.

## Feriados específicos

Padroeira de Búzios:
- data correta: 26/07

Nunca usar 21/05 para Padroeira de Búzios.

Se aparecer 21/05, corrigir:
- seeds
- defaults
- localStorage
- Firebase
- migrações
- geração automática

## Ausências

Ausências incluem:
- férias
- atestado
- licença
- outros afastamentos

Ausência deve refletir:
- Escala de Folga
- Vale-transporte
- Dashboard
- Informações Contador

## Informações Contador

Deve respeitar:
- empresa selecionada
- mês
- ano
- funcionários da empresa
- ausências
- férias
- VT
- feriados quando aplicável

PDF e impressão devem usar os mesmos filtros exibidos na tela.

### Lançamentos do Contador

Campos de horas (Hora Extra, Hora Extra Noturna e Ad. Noturno) usam digitação livre no formato
`HH:MM`, aceitando de `00:00` até `200:00`. Não usar mais lista suspensa
(`input type="time"`), que limitava a 23:59.

## Proteção de lançamentos existentes (REGRA FIXA)

> Detalhamento por módulo e regras de teste: ver
> **"Imutabilidade dos dados já registrados"** no topo deste arquivo.

Qualquer alteração de melhoria, refatoração, migração ou correção:

- NUNCA pode apagar, excluir ou alterar um lançamento já efetuado.
- NUNCA pode resetar, limpar ou sobrescrever a base de lançamentos existente.
- Deve preservar integralmente o histórico já salvo (localStorage e Firebase).
- Mudanças de formato/validação (ex.: campos de horas) aplicam-se apenas a
  novos lançamentos e edições feitas pelo próprio usuário, mantendo os valores
  antigos legíveis e válidos.

Exceção única: exclusão ou edição explícita feita pelo próprio usuário na
interface (botões de editar/excluir), sempre com confirmação. Nenhuma rotina
automática pode descartar dados sem ação direta do usuário.

## Registro obrigatório no histórico (REGRA FIXA)

Toda alteração de melhoria, correção, refatoração ou nova funcionalidade que
chegar a commit DEVE ser registrada em `PROJECT_HISTORY.md`, automaticamente,
como parte do fluxo de trabalho — sem depender de pedido do usuário.

Procedimento padrão a cada entrega:

1. Adicionar uma entrada datada (`## AAAA-MM-DD — <título>`) no topo do
   `PROJECT_HISTORY.md`, logo abaixo do cabeçalho.
2. Descrever: o que mudou, arquivos afetados, motivo/causa raiz, testes
   executados e commits relacionados.
3. Fazer esse registro ANTES ou no MESMO commit das alterações (nunca deixar
   o histórico defasado em relação ao código já commitado).
4. Nunca apagar nem reescrever entradas antigas do histórico — apenas
   acrescentar novas (o histórico é append-only).

Esta regra vale para todas as sessões e para qualquer agente que trabalhe no
projeto.

## Dashboard

Dashboard deve usar a mesma base oficial dos módulos.

Cards não podem divergir das tabelas.

## Persistência

Nunca salvar apenas dados filtrados.

Sempre salvar base completa.

Ao carregar dados padrão, verificar antes se já existem dados salvos.

Migrações devem preservar dados antigos.

## Firebase / localStorage

Firebase e localStorage devem fazer merge seguro.

Nunca sobrescrever dados recentes com dados antigos.

Nunca recriar dados incorretos já corrigidos.

## Chaves do Firebase (REGRA FIXA)

O Realtime Database **recusa** chave que contenha `.` `#` `$` `/` `[` `]` ou
caractere de controle — e a recusa é **síncrona** (`ref.update()` lança). Uma
única chave inválida derruba a sincronização inteira daquele computador.

Portanto:

1. **Toda chave montada com texto do usuário** (nome de feriado, nome de pessoa,
   nome de empresa, qualquer campo digitável) passa obrigatoriamente por
   `ImportUtils.escapeRtdbKey`. `normalizeSearchText` **não serve** para isso:
   ele só tira acento e caixa.
2. Ao introduzir o escape numa chave que já existe em produção, incluir sempre:
   **migração não-destrutiva** da chave antiga (preservando o valor / o
   `deletedAt` maior) e **leitura tolerante** (aceitar a chave nova e a legada).
   Nunca descartar registro por mudança de grafia de chave.
3. Valor `undefined`, `NaN` e `Infinity` também são recusados. Campo opcional vai
   com fallback (`|| ""`), nunca cru.
4. `js/firebase-sync.js` mantém a rede de segurança (`sanitizeForRtdb`) que
   escapa/omite o que escapou das regras acima e **registra erro no console** —
   ela é a última linha de defesa, não a primeira. Console limpo é o esperado.
5. Nenhum envio pode mandar `null` num nó por não ter o dado: `null` **apaga** o
   nó no servidor. Nó ausente simplesmente não é enviado.

Cobertura: `scripts/verify-sync-chaves.mjs` (inclui uma guarda que monta um
estado completo com texto perigoso em todos os campos digitáveis e exige payload
limpo **antes** da rede de segurança).