# RELATÓRIO DE CONTINUIDADE — RH Chez Pitu

> Referência estável de arquitetura e operação para retomar o projeto após perda
> de contexto. Conteúdo de baixa volatilidade (muda pouco). Para o estado **atual**
> do trabalho (tarefa em andamento, pendências), ver `.claude/project-state.md`.

## Visão geral do sistema

Sistema web (SPA) de Gestão de Pessoal do Grupo Chez Pitu. JavaScript puro
(módulos IIFE, sem framework), persistência em `localStorage` com sincronização
no Firebase Realtime Database e hospedagem no Firebase Hosting.

Duas empresas: **Chez Pitu** e **Pengold**. A empresa oficial de cada funcionário
vem sempre do Cadastro de Funcionários (não usar empresa ativa global como fonte).

Módulos: Dashboard · Cadastro de Funcionários · Escala de Folga · Ausências ·
Recibo de Vale-transporte · Controle de Feriados · Informações Contador.

## Arquitetura atual

- **UI/render:** cada módulo em `js/<modulo>.js` (IIFE) expõe `render(container)`;
  `js/app.js` orquestra navegação e helpers globais (`window.App`).
- **Dados:** `js/data.js` (`window.AppData`) — fonte de verdade; `employeeId` é o
  vínculo principal (nome só fallback de migração). `getCompanyData(company)`.
- **Regras de escala:** `js/scale-rules.js` (`window.ScaleRules`).
- **Versão:** `js/version.js` (constante única `APP_VERSION`); `scripts/bump-cache.js`
  carimba build e reescreve `?v=` no `index.html`.
- **Estilos:** `css/style.css` (geral) · `css/print.css` (impressão geral) ·
  `css/escala-print.css` (impressão da Escala).
- Detalhes completos: ver `ARCHITECTURE.md`.

## Principais regras de negócio

- Nunca apagar dados existentes; nunca resetar localStorage/Firebase; merge seguro.
- Filtros nunca salvam base filtrada — sempre salvar base completa.
- `employeeId` como chave; cada página tem seu próprio filtro de empresa.
- Feriados: status Pendente/Agendado/Compensado/Vencido (prazo 120 dias);
  vínculo manual confirmado deve aparecer no Histórico e no modal CO.
- Cores: padrão **navy + pêssego** (não reverter para verde-mar/dourado).
- Padroeira de Búzios: data correta **26/07** (nunca 21/05).
- Regras completas: `PROJECT_RULES.md`.

## Links internos importantes

- `CLAUDE.md` — instruções do agente para o projeto.
- `PROJECT_RULES.md` — regras de negócio e de engenharia.
- `PROJECT_HISTORY.md` — histórico cronológico do projeto.
- `PROJECT_STATUS.md` — status consolidado de fases/módulos.
- `ARCHITECTURE.md` — arquitetura detalhada.
- `BUGS_CONHECIDOS.md` — bugs conhecidos.
- `TEST_CHECKLIST.md` — checklist de testes manuais.
- `AGENT_START.md` — ordem de leitura obrigatória ao iniciar.
- `.claude/project-state.md` — estado vivo da tarefa atual.

## Dependências

- Runtime do app: nenhuma (JS puro no navegador) + Firebase (SDK via `index.html`).
- Ferramentas dev: Node.js; `firebase-tools` (deploy); `puppeteer-core` +
  Chrome/Edge instalado (homologação de impressão/PDF).

## Comandos de build

```
npm run bump-cache     # carimba versão e atualiza ?v= no index.html
```
> Não há bundler/transpilação: o "build" é apenas o cache-busting + arquivos servidos.

## Comandos de teste

```
npm test                              # testes Fase 2 (47/47)
npm run validate                      # funcional + offline + dedup + quota
npm run test:offline                  # recuperação offline→online
npm run test:dedup                    # deduplicação de feriados
npm run test:quota                    # cota de localStorage
node scripts/verify-print-escala.mjs  # homologação impressão Escala (PDF)
node scripts/verify-vinculo-manual.mjs
node scripts/verify-feriados-retroativos.mjs
```

## Comandos de deploy

```
npm run deploy            # bump-cache + firebase deploy --only hosting (PRODUÇÃO)
npm run deploy:preview    # canal de preview temporário (firebase hosting:channel)
```
> Produção: `chez-pitu-rh.web.app` / `chez-pitu-rh.firebaseapp.com`.
> **Nunca** commit/push/deploy sem autorização explícita do usuário.

## Comandos de continuidade (este sistema)

```
/recuperar-projeto       # leitura de estado + git status + próximo passo
/atualizar-estado        # registra checkpoint em .claude/project-state.md
/retomar-contexto        # recuperação de emergência (resumo ≤ 30 linhas)
```
