2026-07-03 — Exclusão limitada a 24h + auditoria + botão Inativar/Reativar (Cadastro)
- [NOVO] Regra: funcionário só pode ser EXCLUÍDO em até 24h após o cadastro; depois, apenas inativar. Carimbo imutável createdAt em upsertEmployee; canDeleteEmployee; bloqueio também em removeEmployee (camada de dados). Legado sem createdAt = não excluível
- [NOVO] Trilha de auditoria (auditLog): registra quem/ação/quando para cadastro, inativação, reativação e exclusão. getAuditLog/getEmployeeAuditLog; teto 3000 eventos; desempate por seq. Persiste em localStorage (inclusive lean) e Firebase; merge entre PCs por mergeAuditLogs (união por id)
- [NOVO] Botão "Auditoria" no rodapé da lista abre modal com Quando/Ação/Funcionário/Usuário (empresa da aba ativa)
- [NOVO] Botão Inativar/Reativar direto na linha da lista — setEmployeeStatus altera só o status, preserva demais campos, ajusta deactivatedAt e registra auditoria (idempotente)
- Arquivos: js/data.js, js/funcionarios.js, js/firebase-sync.js
- Versão 20260703.01 — npm test 47/47, validate 25/25, verify-exclusao-24h 13/13, verify-auditoria-status 17/17

2026-07-02 (b) — Correção do recibo VT impresso: descrição cortada no topo
- [CORREÇÃO] Recibo VT impresso: a descrição abaixo dos campos (incl. observação de desconto do mês anterior) era cortada no topo. Causa: caixa da declaração com min-height 18mm + body alinhado ao rodapé (flex-end) estourava o espaço e o overflow cortava as primeiras linhas
- Correção só em @media print: declaração alinhada ao topo (flex-start) e caixa com altura do conteúdo (flex 0 0 auto; min-height 0; max-height none)
- Validado por PDF headless do Chrome usando o CSS real (2 recibos, com e sem desconto) — descrição completa
- Versão 20260702.02 — commits 93ac50a (fix) + ed58f07 (carimbo). Push main + deploy Firebase Hosting concluídos

2026-07-02 — Inativar funcionário na Escala + ajustes de recibo VT e assinatura da Escala
- [NOVO] Funcionário inativo aparece na Escala em vermelho/tachado apenas até o mês da saída (deactivatedAt), oculto em escala futura
- [NOVO] upsertEmployee carimba/preserva/limpa deactivatedAt (Ativo→Inativo→Ativo) — persiste em localStorage e Firebase
- [MELHORIA] Meses passados de funcionário inativo ficam somente-leitura (selects disabled) — evita edição acidental
- [CORREÇÃO] Recibo VT impresso: liberada a altura da caixa da declaração (@media print) para não cortar a observação "menos X dia de desconto do mês anterior"
- [MELHORIA] Recibo VT: rótulo da assinatura passa a exibir o nome do funcionário
- [MELHORIA] Escala impressa: removida a frase "Responsável pela empresa"; nome do responsável descido no retângulo de assinatura
- Arquivos: js/data.js, js/escala.js, js/vale-transporte.js, css/print.css, css/style.css, css/escala-print.css
- Versão 20260702.01 — commits de920d9 (feat) + d3458f1 (carimbo) — npm test 47/47, validate OK, verify-inativo-escala 12/12
- Push main e deploy Firebase Hosting (chez-pitu-rh.web.app) concluídos

2026-06-17 — Impressão da Escala (1 página + logo por CNPJ), vínculo manual e continuidade
- [NOVO] Impressão da Escala em 1 única página A4 paisagem (auto-fit por escala) — applyPrintFitScale
- [CORREÇÃO] Coluna "Funcionários" larga demais / grade deslocada: removida a faixa repetida que quebrava o table-layout: fixed
- [MELHORIA] Coluna de nomes estreitada (38→26 / 34→23 / 30→20 mm) e nome em 1 linha com reticências
- [NOVO] Logo da empresa carregado por CNPJ no Firebase antes da impressão (ensureLogoForActiveCompany), com normalização e fallback
- [CORREÇÃO] Vínculo manual de feriados retroativos: bloqueio passa a revelar o vínculo existente (Histórico + modal CO)
- [NOVO] Infraestrutura de continuidade de sessão (.claude/project-state.md, session-recovery.md e comandos)
- Versão 20260617.02 — npm test 47/47, validate OK, homologação impressão 55/55, vínculo 31/31, feriados 24/24

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