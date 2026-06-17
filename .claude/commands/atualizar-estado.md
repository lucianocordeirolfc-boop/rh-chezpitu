---
description: Registra um checkpoint e atualiza o estado vivo do projeto (.claude/project-state.md)
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git rev-parse:*), Read, Edit, Write
---

# Atualizar Estado do Projeto

Atualize `.claude/project-state.md` refletindo o estado REAL atual. Não invente
dados — colete-os.

## Passos

1. Colete o estado real:
   - Branch: `git rev-parse --abbrev-ref HEAD`
   - Último commit: `git log --oneline -1`
   - Arquivos modificados/não commitados: `git status --short`
   - Versão atual: leia `APP_VERSION` em `js/version.js`.

2. Atualize as seções de `.claude/project-state.md`:
   - Versão atual, Branch atual, Último commit, Status geral.
   - Funcionalidades concluídas / em andamento.
   - Bugs conhecidos, Próximas tarefas.
   - Pendências de validação e de deploy.
   - Snapshot de "Arquivos modificados não commitados".

3. Acrescente um novo bloco ao final, em "Histórico de checkpoints":

   ```
   ### CHECKPOINT
   - **Data:** <AAAA-MM-DD HH:MM>
   - **Versão:** <APP_VERSION>
   - **Branch:** <branch>
   - **Arquivos alterados:** <lista>
   - **Resumo:** <o que foi feito nesta tarefa>
   - **Próximo passo:** <ação recomendada>
   ```

## Regras

- Mantenha checkpoints anteriores (apenas acrescente; não apague histórico).
- Não altere código, dados, nem faça commit/push/deploy.
- Datas em formato absoluto (AAAA-MM-DD), nunca "hoje"/"ontem".
- Seja conciso e factual.
