# PROJECT_HISTORY.md — Histórico do Projeto RH Chez Pitu

Este arquivo registra decisões, bugs recorrentes e correções importantes.

> **Regra de registro obrigatório:** toda alteração de melhoria/correção que
> chega a commit deve ser registrada neste arquivo (entrada datada no topo)
> ANTES ou junto do commit. Ver `PROJECT_RULES.md` → "Registro obrigatório no
> histórico".

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