2026-06-01 — Fase 3A-2: Correção Feriados Duplicados
- [CORREÇÃO] Feriados duplicados consolidados (mesma data + nome)
- [CORREÇÃO] Syncronização automática verifica per-feriado (não genérico)
- [CORREÇÃO] Deduplicação com priorização (Agendado > Pendente)
- [CORREÇÃO] Soft delete em duplicados (recuperação possível)
- [CORREÇÃO] Modal CO: dropdown lista apenas feriados únicos/disponíveis
- [CORREÇÃO] Histórico: não exibe duplicatas ou soft-deletados
- [NOVO] Função: findOrMergeDuplicateHolidays(company)
- [NOVO] Função: deduplicateAllHolidays()
- [NOVO] Função: dedupeCalendarHolidays(state)
- [NOVO] Função: getAvailableCoHolidayOptions(employeeId, coDate)
- [NOVO] Função: isWorkedEntryVisibleInHistory(holiday, item, data)
- [NOVO] Função: mergeDuplicateHolidaysInBlock(block)
- Novo arquivo: scripts/test-holiday-deduplication.mjs (300L+)
- Novo arquivo: scripts/migrate-deduplicate-holidays.mjs (160L)
- Novo arquivo: CORRECAO_FERIADOS_DUPLICADOS.md (documentação)
- npm run test:dedup adicionado ao package.json
- npm run validate: 183 + 15 + 9 = 207 testes (+ 47 unitários = 254/254 ✓)
- Caso Camila (Corpus Christi) validado e corrigido
- Risco: race condition em múltiplas edições simultâneas (Fase 4)
- Risco: escala.js tem normalizeSearch duplicado (consolidar Fase 4)

2026-06-01 — Fase 3A: Segurança Operacional (original)
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