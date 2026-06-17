---
description: Recupera o contexto do projeto — lê estado, roda git status e indica o próximo passo
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git diff:*), Read
---

# Recuperar Projeto

Reconstrua o contexto do projeto após reinício/perda de sessão. Apenas leitura —
não alterar nada.

## Passos

1. Leia `.claude/project-state.md` (estado vivo da tarefa atual).
2. Leia `.claude/session-recovery.md` (arquitetura, comandos, regras).
3. Leia `PROJECT_HISTORY.md` (histórico cronológico) — foque nas entradas recentes.
4. Identifique a branch atual: `git rev-parse --abbrev-ref HEAD`.
5. Rode `git status --short` e `git log --oneline -5`.
6. Liste:
   - arquivos modificados (não commitados);
   - arquivos não rastreados (`??`);
   - última atividade realizada (do último CHECKPOINT em project-state.md).

## Saída (relatório)

Apresente, em português, de forma objetiva:

- **Projeto / versão / branch / último commit.**
- **Status atual** (desenvolvimento/teste/homologação/produção).
- **Última atividade realizada.**
- **Alterações pendentes** (arquivos modificados e não commitados).
- **Pendências de validação e de deploy.**
- **Próximo passo recomendado** (uma ação concreta).

## Regras

- Não fazer commit, push ou deploy.
- Não alterar código nem dados.
- Se `.claude/project-state.md` divergir do `git status`, sinalize a divergência.
