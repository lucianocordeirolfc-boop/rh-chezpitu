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

## Exclusão de feriado (definitiva)

Além do soft-delete (reversível), o Controle de Feriados permite **exclusão
DEFINITIVA** de um feriado cadastrado, direto pela interface (botão
"Excluir feriado"):

- Remove o feriado e **todos os vínculos** (`workedEmployees`), incluindo
  duplicatas de mesmo **nome + data**.
- Grava um **tombstone por conteúdo** (`state.holidayTombstones`, escopo empresa
  ou `__calendar__`) que impede o retorno do feriado por: merge do Firebase
  (outro PC), seed 2026 e auto-sync do calendário.
- É **irreversível** e só ocorre por **ação explícita do usuário com confirmação**.
  Nenhuma rotina automática exclui feriado definitivamente.
- **Recadastrar** o mesmo feriado (nome + data) pela interface **limpa** o
  tombstone — o novo cadastro passa a valer normalmente.

Funções: `removeCompanyHolidayPermanently`, `removeCalendarHolidayPermanently`
(js/data.js). Ver PROJECT_HISTORY.md → 2026-08-06.

### Exclusão de vínculo (definitiva)

"Excluir vínculo" (funcionário × feriado) também é **definitivo**: grava um
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

Campos de horas (Hora Extra e Ad. Noturno) usam digitação livre no formato
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