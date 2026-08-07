# AGENT START

Antes de executar qualquer tarefa neste projeto, leia obrigatoriamente:

1. CLAUDE.md
2. PROJECT_RULES.md
3. PROJECT_HISTORY.md
4. TEST_CHECKLIST.md
5. BUGS_CONHECIDOS.md
6. .cursor/rules/karpathy-general.mdc

REGRA FIXA acima de qualquer tarefa: melhoria, correção ou **teste** NUNCA
altera dado já registrado (feriados, escala, VT, ausências, lançamentos do
Contador, cadastro). Testar sempre em fixtures/`scripts/verify-*.mjs`; validação
em produção é somente leitura. Ver PROJECT_RULES.md → "Imutabilidade dos dados
já registrados".

Fluxo obrigatório:

1. Entender o problema.
2. Procurar causa raiz.
3. Verificar impacto nos módulos:
   - Escala
   - VT
   - Ausências
   - Feriados
   - Dashboard
   - Contador
4. Implementar correção.
5. Executar testes.
6. Atualizar PROJECT_HISTORY.md se necessário.
7. Apresentar relatório.

Não fazer commit sem autorização.

Não fazer deploy sem autorização.   