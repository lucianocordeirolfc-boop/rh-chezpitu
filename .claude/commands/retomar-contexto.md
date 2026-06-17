---
description: Recuperação de emergência após perda total de contexto — resumo em até 30 linhas
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git rev-parse:*), Read
---

# Retomar após perda de contexto (EMERGÊNCIA)

Use quando o contexto da conversa foi totalmente perdido e é preciso retomar do
zero com rapidez. Apenas leitura.

## Fluxo

1. Leia `.claude/project-state.md`.
2. Leia `.claude/session-recovery.md`.
3. Leia `PROJECT_HISTORY.md` (entradas mais recentes).
4. Rode `git rev-parse --abbrev-ref HEAD`, `git status --short` e `git log --oneline -5`.
5. Identifique as alterações pendentes (modificadas + não rastreadas).

## Saída obrigatória

Produza **um único resumo de no máximo 30 linhas**, em português, contendo:

- O que é o projeto (1–2 linhas).
- Versão, branch e último commit.
- Status atual e onde exatamente o trabalho parou.
- Alterações pendentes (lista curta de arquivos).
- Pendências de validação e de deploy.
- O próximo passo recomendado (uma ação concreta).

Termine com a pergunta: **"Deseja continuar a partir daqui?"**

## Regras

- Máximo de 30 linhas no resumo final.
- Não fazer commit, push ou deploy.
- Não alterar código nem dados.
- Não recriar tarefas já concluídas (confira o último CHECKPOINT).
