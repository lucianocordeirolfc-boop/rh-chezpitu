2026-06-01
- [FASE 3A] Teste Offline → Online implementado (15 testes)
- [FASE 3A] Proteção contra múltiplas abas (detecção automática)
- [FASE 3A] Soft Delete para feriados (recuperação possível)
- [FASE 3A] Confirmação obrigatória para ações críticas
- [FASE 3A] Validação contínua Padroeira de Búzios
- Novo arquivo: js/security-operations.js (200L)
- Novo arquivo: scripts/test-offline-recovery.mjs (300L)
- npm run validate: 183 testes + 15 offline recovery = 198/198 ✓
- npm run test:offline adicionado ao package.json

2026-05-30
- Corrigido CO abatendo VT
- Corrigido vínculo de feriados
- Corrigida Padroeira de Búzios
- Removido seletor duplicado de empresa