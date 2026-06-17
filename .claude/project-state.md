# ESTADO DO PROJETO — RH Chez Pitu

> Arquivo vivo de continuidade. Atualizado ao final de cada tarefa relevante
> (ver `/atualizar-estado`). Fonte de verdade rápida para retomar o trabalho
> após perda de contexto. **Não** substitui `PROJECT_STATUS.md`,
> `PROJECT_HISTORY.md` nem `ARCHITECTURE.md` — complementa e aponta para eles.

## Identificação

- **Projeto:** RH Chez Pitu — Sistema de Gestão de Pessoal (SPA web)
- **Versão atual:** `20260617.01` (exibida como `v2026.06.17.01`) — fonte: `js/version.js`
- **Branch atual:** `main`
- **Último commit:** `b3aaea5` — chore: carimbo de build em version.js (cor navy + pêssego)
- **Status geral:** 🟡 DESENVOLVIMENTO — há alterações locais **não commitadas** aguardando validação/autorização

## Funcionalidades concluídas (nesta frente de trabalho)

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

1. Validar 2 PDFs (Chez Pitu e Pengold, Junho/2026) no navegador/preview:
   1 página, grade rente ao dia 01, logo real carregada.
2. Após aprovação: autorizar commit/push/deploy.

## Pendências de validação

- ⏳ Teste de impressão pelo usuário no preview (Junho/2026, ambas as empresas):
  1 página, sem corte, espaço nome↔dia 01 reduzido, logo correta.
- Preview ativo: `https://chez-pitu-rh--preview-f7atcmwq.web.app` (expira 2026-06-24).

## Pendências de deploy

- ⛔ **Nada commitado/pushado/deployado em produção.** Aguardando aprovação do
  usuário. Deploy oficial: `npm run deploy` (GitHub main + Firebase Hosting).

## Arquivos modificados não commitados (snapshot)

```
M  css/escala-print.css   M  css/print.css      M  index.html
M  js/dashboard.js        M  js/data.js         M  js/escala.js
M  js/feriados.js         M  js/version.js
?? scripts/verify-*.mjs (homologação — não versionar)
?? scripts/_diag-print.mjs (diagnóstico temporário — remover ao concluir)
```

---

## Histórico de checkpoints

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
