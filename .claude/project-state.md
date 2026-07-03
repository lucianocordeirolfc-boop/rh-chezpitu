# ESTADO DO PROJETO — RH Chez Pitu

> Arquivo vivo de continuidade. Atualizado ao final de cada tarefa relevante
> (ver `/atualizar-estado`). Fonte de verdade rápida para retomar o trabalho
> após perda de contexto. **Não** substitui `PROJECT_STATUS.md`,
> `PROJECT_HISTORY.md` nem `ARCHITECTURE.md` — complementa e aponta para eles.

## Identificação

- **Projeto:** RH Chez Pitu — Sistema de Gestão de Pessoal (SPA web)
- **Versão atual:** `20260703.01` (exibida como `v2026.07.03.01`) — fonte: `js/version.js`
- **Branch atual:** `main`
- **Último commit:** `714c185` — chore: carimbo de build v20260703.01 (commit f8d62f6)
- **Status geral:** 🟢 EM PRODUÇÃO — frente "exclusão 24h + auditoria + botão
  Inativar/Reativar no Cadastro" commitada, pushada e deployada (`chez-pitu-rh.web.app`).
  Working tree limpo (exceto `scripts/verify-*.mjs`, não versionados por convenção).

## Funcionalidades concluídas (nesta frente de trabalho)

- ✅ **Exclusão de funcionário limitada a 24h após o cadastro** — carimbo imutável
  `createdAt` em `upsertEmployee` (`js/data.js`); `canDeleteEmployee` (true só se
  ≤ 24h); `removeEmployee` valida e lança erro fora da janela (bloqueio na camada de
  dados). Legado sem `createdAt` → **não excluível**, apenas inativável. Na lista
  (`js/funcionarios.js`) o botão **Excluir** só aparece dentro da janela.
- ✅ **Trilha de auditoria (`auditLog`)** — registra **quem** (e-mail via
  `window.AppAuth`), **ação** (`cadastro`/`inativacao`/`reativacao`/`exclusao`) e
  **quando**. Helpers `recordAudit`/`getAuditLog`/`getEmployeeAuditLog` (`js/data.js`),
  teto 3000, desempate por `seq`. Persiste local (inclusive cache **lean**) e no
  Firebase (`js/firebase-sync.js`); merge entre PCs por `mergeAuditLogs` (união por
  id). Botão **"Auditoria"** no rodapé abre modal (`openAuditPopup`) com
  Quando/Ação/Funcionário/Usuário, filtrado pela empresa ativa.
- ✅ **Botão Inativar/Reativar na linha da lista** — `setEmployeeStatus(id,status,co)`
  altera **só** o status, preserva os demais campos, ajusta `deactivatedAt` e registra
  auditoria (idempotente). Substitui o rótulo "Inativar (Editar)".
- Versão `20260703.01`. Commits `f8d62f6` (feat) + `714c185` (carimbo). Testes:
  npm test 47/47, validate 25/25, `verify-exclusao-24h.mjs` 13/13,
  `verify-auditoria-status.mjs` 17/17. **Em produção.**

### Frente 2026-07-02 (já em produção)

- ✅ **Inativar funcionário na Escala + data de saída (`deactivatedAt`)** —
  `upsertEmployee` (`js/data.js`) carimba a data na transição Ativo→Inativo,
  preserva enquanto inativo e limpa ao reativar. A Escala (`js/escala.js`) exibe
  o inativo em **vermelho + tachado** (tela e impressão) apenas **até o mês da
  saída** (legado sem data → até o mês corrente); nunca em escala futura. Meses
  passados de inativo ficam **somente-leitura** (selects `disabled`). Relatórios
  (Dashboard/Contador/VT) já filtravam inativos — não recriados. Estilos:
  `.scale-row-inactive` / `.scale-row-locked` (`css/style.css`),
  `.scale-print-row-inactive` (`css/escala-print.css`).
- ✅ **Recibo VT impresso — descrição não é mais cortada no topo** (v `20260702.02`) —
  causa raiz confirmada por PDF headless do Chrome (CSS real): no recibo de altura
  fixa, `.vt-receipt-body` alinhava ao rodapé (`justify-content: flex-end`) e
  `.vt-declaration-box` tinha `min-height: 18mm`, estourando o espaço e cortando o
  TOPO da descrição. Correção só em `@media print` (`css/print.css`): declaração
  ao topo (`flex-start`) e caixa com altura do conteúdo (`flex: 0 0 auto;
  min-height: 0; max-height: none`). Tela inalterada. (1ª tentativa só com
  `max-height: none` foi insuficiente.)
- ✅ **Recibo VT — rótulo da assinatura = nome do funcionário** (`js/vale-transporte.js`).
- ✅ **Escala impressa — assinatura** — removida a frase "Responsável pela empresa";
  nome do responsável descido `5mm` no retângulo (`js/escala.js`, `css/escala-print.css`).
- Versão `20260702.01`. Commits `de920d9` (feat) + `d3458f1` (carimbo). Testes:
  npm test 47/47, validate OK, `verify-inativo-escala.mjs` 12/12. **Em produção.**

### Frente anterior (já em produção)

- ✅ **Logo das empresas via Firebase Storage (permanente)** — origem do logo
  migrada de RTDB (`sistemaRH/empresas`) para Storage (`logos/{CNPJ}/<arquivo>`).
  `resolveLogoUrlByCnpj` lista a pasta e pega a 1ª imagem; `app.js` importa/persiste
  no boot; `escala.js`/`vale-transporte.js` aguardam a imagem antes de imprimir.
  Versão `20260618.02`. Commits `da18e28` + `fb5afae`. **Em produção.**
  Pré-requisito: regra de leitura `logos/{cnpj}/...` publicada no Storage.

- ✅ **Vínculo manual de feriados retroativos** — bloqueio passou a revelar o vínculo
  existente (feriado/data/status/origem/compensação), com diálogo "Ver vínculo
  existente"; vínculo manual confirmado aparece no Histórico e no modal CO.
  Arquivos: `js/data.js`, `js/feriados.js`, `js/dashboard.js`. Testes: 31/31.
- ✅ **Impressão da Escala em 1 página A4 paisagem (auto-fit)** — `applyPrintFitScale`
  mede a altura real e aplica `transform: scale()` só em `@media print`; container
  travado em 210mm. Garante 1 folha sem cortar funcionários. Arquivos:
  `js/escala.js`, `css/escala-print.css`, `css/print.css`. Testes: 45/45 (1 página).

- ✅ **Grade de impressão — largura da coluna corrigida** — causa raiz: a **faixa
  repetida** (`scale-print-repeat-band`, `colspan=32` como 1ª linha do `<thead>`)
  quebrava o `table-layout: fixed`, jogando a coluna de nomes para ~554px (modo
  conteúdo). A faixa servia para multipágina, agora obsoleta (1 página). Removida.
  Razão nome/dia caiu de ~30x → 2,2–3,0; grade preenche 100%. Nome em 1 linha com
  reticências; coluna estreitada (26/23/20mm). Testes: 55/55.
- ✅ **Logo por CNPJ na impressão** — `ensureLogoForActiveCompany` busca o logo em
  `sistemaRH/empresas` no Firebase, casando por CNPJ normalizado (com/sem máscara),
  e espelha em `companyInfo.logoDataUrl` em memória (sem persistir). Carrega antes
  de prévia/impressão. Se ausente: `console.warn`, sem placeholder gigante.

## Funcionalidades em andamento

- (nenhuma pendência técnica aberta nesta frente — aguardando validação do usuário)

## Bugs conhecidos

- Ver `BUGS_CONHECIDOS.md` (nenhum bug aberto desta frente de impressão).

## Próximas tarefas

- (nenhuma pendência aberta nesta frente — concluída e em produção)

## Pendências de validação

- ✅ Validado pelo usuário no preview (`20260618.02`): logos das duas empresas
  carregando do Storage, impressão Escala + Vale-transporte OK.

## Pendências de deploy

- ✅ **Commitado, pushado (`main`) e deployado em produção** (`chez-pitu-rh.web.app`)
  na versão `20260703.01` (deploy Firebase Hosting concluído).
- ⚠️ Validação visual em produção pelo usuário (botões Inativar/Reativar, modal
  Auditoria, bloqueio de exclusão após 24h).
- ⚠️ Infra: garantir que a regra de leitura `logos/{cnpj}/...` permaneça publicada
  no Firebase Storage (Console → Storage → Regras).

## Arquivos modificados não commitados (snapshot)

```
(working tree limpo — versionados)
?? scripts/verify-*.mjs (homologação — não versionar)
```

---

## Histórico de checkpoints

### CHECKPOINT
- **Data:** 2026-07-03
- **Versão:** 20260703.01
- **Branch:** main
- **Commits:** `f8d62f6` (feat exclusão 24h + auditoria + Inativar/Reativar) +
  `714c185` (carimbo de build)
- **Arquivos alterados:** js/data.js (createdAt, canDeleteEmployee, removeEmployee
  com bloqueio, setEmployeeStatus, auditLog + recordAudit/getAuditLog/
  getEmployeeAuditLog/mergeAuditLogs, seq) · js/funcionarios.js (botões
  Inativar/Reativar na lista, handlers, modal Auditoria) · js/firebase-sync.js
  (auditLog em stateToFirebase/firebaseToState) · js/version.js · index.html (?v=) ·
  PROJECT_HISTORY.md · CHANGELOG.md · PROJECT_STATUS.md · .claude/project-state.md
- **Resumo:** Cadastro de Funcionários — (1) exclusão só em ≤24h após o cadastro,
  depois apenas inativar (bloqueio na camada de dados); (2) trilha de auditoria de
  cadastro/inativação/reativação/exclusão (quem/quando), com modal "Auditoria" e
  sincronização local+Firebase; (3) botão Inativar/Reativar na linha da lista.
  Testes: npm test 47/47, validate 25/25, verify-exclusao-24h 13/13,
  verify-auditoria-status 17/17. Push (main) e deploy (chez-pitu-rh.web.app) OK.
- **Próximo passo:** Validação visual em produção pelo usuário. Nenhuma pendência
  técnica aberta.

### CHECKPOINT
- **Data:** 2026-07-02 (b)
- **Versão:** 20260702.02
- **Branch:** main
- **Commits:** `93ac50a` (fix descrição VT impressa) + `ed58f07` (carimbo) + `0f710ea` (docs)
- **Arquivos alterados:** css/print.css (declaração ao topo + altura pelo conteúdo,
  só @media print) · js/version.js · index.html (?v=) · PROJECT_HISTORY.md ·
  CHANGELOG.md · PROJECT_STATUS.md · .claude/project-state.md
- **Resumo:** Corrigido o corte no TOPO da descrição do recibo VT impresso (causa:
  min-height 18mm + body alinhado ao rodapé estourava o espaço). Validado por PDF
  headless do Chrome com o CSS real. **Validado também pelo usuário em produção
  ("agora tudo ok").** Push (main) e deploy (chez-pitu-rh.web.app) concluídos;
  `?v=20260702.02` confirmado no ar.
- **Próximo passo:** Nenhuma pendência aberta. Sessão encerrada.

### CHECKPOINT
- **Data:** 2026-07-02
- **Versão:** 20260702.01
- **Branch:** main
- **Commits:** `de920d9` (feat inativar/VT) + `d3458f1` (carimbo de build)
- **Arquivos alterados:** js/data.js (deactivatedAt no upsertEmployee) · js/escala.js
  (visibilidade por mês de saída, vermelho/tachado, somente-leitura em meses passados) ·
  js/vale-transporte.js (assinatura = nome) · css/print.css (declaração VT sem teto na
  impressão) · css/style.css (.scale-row-inactive/.scale-row-locked) · css/escala-print.css
  (.scale-print-row-inactive + nome descido) · js/version.js · index.html (?v=)
- **Resumo:** Funcionário inativo passa a aparecer na Escala em vermelho/tachado só
  até o mês da saída (deactivatedAt) e some da escala futura; meses passados de inativo
  ficam somente-leitura. Corrigido corte da observação de desconto no recibo VT impresso;
  assinatura do VT usa o nome do funcionário; escala impressa sem "Responsável pela
  empresa". Testes: npm test 47/47, validate OK, verify-inativo-escala 12/12.
  Commit, push (main) e deploy (chez-pitu-rh.web.app) concluídos.
- **Próximo passo:** Nenhuma pendência aberta. Validação visual em produção pelo usuário.

### CHECKPOINT
- **Data:** 2026-06-17 18:20
- **Versão:** 20260617.01
- **Branch:** main
- **Arquivos alterados:** css/escala-print.css, css/print.css, js/escala.js,
  js/version.js, index.html (impressão 1 página) · js/data.js, js/feriados.js,
  js/dashboard.js (vínculo manual)
- **Resumo:** Impressão da Escala consolidada em 1 página A4 (auto-fit) e vínculo
  manual de feriados retroativos revelando vínculo existente. Iniciado diagnóstico
  do bug de largura da coluna de funcionários na impressão.
- **Próximo passo:** Confirmar causa raiz da largura da coluna e corrigir; carregar
  logo por CNPJ; validar 2 PDFs.

### CHECKPOINT
- **Data:** 2026-06-17 19:05
- **Versão:** 20260617.01
- **Branch:** main
- **Arquivos alterados:** js/escala.js (remoção da faixa repetida, nome truncado,
  logo por CNPJ via Firebase) · css/escala-print.css (coluna 26/23/20mm, nome em
  1 linha com reticências, limpeza do CSS da faixa) · scripts/verify-print-escala.mjs
  (harness sem faixa + checagem de largura de coluna)
- **Resumo:** Bug da coluna larga RESOLVIDO — causa raiz era a faixa repetida
  (`colspan`) como 1ª linha quebrando o `table-layout: fixed`. Logo por CNPJ
  implementado (busca no Firebase, normalização, fallback com aviso). Testes:
  impressão 55/55, npm test 47/47, validate ok, vínculo 31/31, feriados 24/24.
  Removido `scripts/_diag-print.mjs` (diagnóstico concluído).
- **Próximo passo:** Validar 2 PDFs no preview; aguardar autorização de commit/deploy.

### CHECKPOINT
- **Data:** 2026-06-19
- **Versão:** 20260618.02
- **Branch:** main
- **Commits:** `da18e28` (feat logo via Storage) + `fb5afae` (carimbo de build)
- **Arquivos alterados:** js/firebase-sync.js (resolveLogoUrlByCnpj) · js/app.js
  (importCompanyLogos no boot) · js/escala.js (ensureLogoForActiveCompany via
  Storage + persiste; waitForImages) · js/vale-transporte.js (aguarda imagens) ·
  index.html (firebase-storage-compat; ?v=) · js/version.js
- **Resumo:** Logo das empresas migrado de RTDB para Firebase Storage
  (`logos/{CNPJ}/`), tornando-o permanente e visível em todos os módulos.
  Validado no preview pelo usuário. Testes npm test 47/47, validate 25/25.
  Commit, push (`main`) e deploy em produção (`chez-pitu-rh.web.app`) concluídos.
- **Próximo passo:** Nenhuma pendência aberta. Garantir que a regra de leitura
  do Storage (`logos/{cnpj}/...`) permaneça publicada no Console.
