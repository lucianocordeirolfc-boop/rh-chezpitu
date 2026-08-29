2026-08-29 (2) — Contador/Lançamentos: grade só com quem tem lançamento, em ordem alfabética
- [MELHORIA] A grade da sub-aba Lançamentos vinha na ordem de gravação dos registros, sem relação com a aba Resumo. Passa a ordenar por getEmployeeName(...).localeCompare(nome, "pt-BR") — mesmo comparador e mesmo nome oficial usados por getEmployeesForCompany no Resumo, de modo que as duas telas listam na mesma sequência
- [MELHORIA] getLancamentosParaGrade filtra por hasAnyValue: registro com os oito campos zerados (ou "00:00") não conta como "funcionário com lançamento no mês" e sai da grade. O dado continua gravado — some apenas da tela. Com a coluna Ações fora, zerar um lançamento pelo pop-up agora faz a linha sumir, em vez de deixar uma fileira de "—"
- [SEGURANÇA DE DADOS] A ordenação é feita sobre slice(): o array devolvido por getLancamentos é o próprio dado gravado, e reordená-lo no lugar alteraria o registro do usuário
- [NOVO] Linha informativa "Somente funcionários com lançamentos no mês" (span.contador-toolbar-note) ao lado do botão "+ Lançamento": flex:1 + text-align:center, ocupando e centralizando-se no espaço entre o fim do botão e a borda direita da barra (última coluna, Vales). Itálico, tom --muted. Só na sub-aba Lançamentos
- [PRESERVADO] Aba Resumo intacta: renderResumoGrid e renderResumoPrintArea seguem listando TODOS os ativos (inclusive quem não tem lançamento) com a linha de totais, e o aviso não aparece lá
- [TESTE] verify-contador-lancamento-popup.mjs 46 -> 60 asserções (blocos 9 e 10): ordem alfabética, registro zerado fora da grade mas presente na base, texto/posição/centralização do aviso medidos no Chrome com o CSS real e a aba Resumo provada intacta. O harness passou a carregar css/style.css — sem o CSS real não se afirma nada sobre layout
- [TESTE] Validação funcional: asserção 8d nova (grade filtrada + ordenada + aviso na barra, com o Resumo preservado)
- Arquivos: js/contador.js, css/style.css, scripts/verify-contador-lancamento-popup.mjs, scripts/run-functional-validation.mjs
- npm test 47/47; npm run validate 20/20 suítes

2026-08-29 — Contador: "+ Lançamento" abre com os dados do mês selecionado; coluna Ações sai da tela
- [MELHORIA] Botão "+ Novo Lançamento" virou "+ Lançamento" (id btnNovoLancamento -> btnLancamento); o texto de estado vazio da tabela acompanhou
- [CORREÇÃO] O pop-up abria sempre zerado, mesmo com o mês selecionado ao lado já tendo lançamentos: agora buildLancamentoMap monta employeeId -> lançamento do mês da barra de ferramentas e escolher o funcionário preenche os oito campos com o que já está registrado (Jefferson/agosto: Consumo Interno 212,25 e Vales 250,00)
- [NOVO] Título do pop-up "Lançamento — <Mês> <Ano>" e marcação "•" na lista para quem já tem lançamento no mês, deixando a base explícita
- [CORREÇÃO] Salvar faz merge sobre o registro existente (Object.assign): campos fora do formulário (updatedAt, dados legados) sobrevivem, e os lançamentos dos demais funcionários do mês continuam intactos
- [MELHORIA] Depois de gravar, o formulário recarrega os valores salvos e mantém o funcionário selecionado, em vez de se limpar
- [REMOÇÃO] Coluna "Ações" da tabela de lançamentos, com os botões editar/excluir — a edição passou a ser toda pelo pop-up. bindContainerEvents (delegação que só servia a esses botões) e a regra CSS órfã .contador-table .cell-actions removidas; deleteLancamento mantida sem gatilho de UI, para uso programático/recuperação
- [CORREÇÃO] O submit gravava em AppData.getActiveCompany() enquanto a lista e os valores vinham de getPrimaryPageCompany("contador"); com o pop-up agora lendo dados do mês, ler de uma empresa e gravar em outra deixaria de ser risco teórico. Passa a gravar em company — a mesma da leitura. A regra "pop-up sem seletor de empresa" não mudou
- [TESTE] scripts/verify-contador-lancamento-popup.mjs (46 asserções, Chrome real sobre fixture em memória): rótulo do botão, tabela sem coluna Ações, pop-up carregado pelo mês, troca de funcionário, salvar 300,00 no vale do Jefferson deixando Ana e julho byte a byte iguais, lançamento novo para quem não tinha nada e saveState chamado só nas gravações do usuário
- [TESTE] Validação funcional: asserção 8 atualizada para a nova linha de gravação, mais 8b (botão + pop-up com base no mês) e 8c (tabela sem coluna Ações). Suíte nova registrada em run-validate.mjs
- Arquivos: js/contador.js, css/style.css, scripts/verify-contador-lancamento-popup.mjs (novo), scripts/run-functional-validation.mjs, scripts/run-validate.mjs
- npm test 47/47; npm run validate 20/20 suítes

2026-08-22 (3) — Funcionário inativo sai das telas operacionais + data de desligamento obrigatória
- [CORREÇÃO] Adonias Lima Santana estava Inativo no Cadastro e já não aparecia na Escala (que tem regra própria via deactivatedAt), mas seguia visível no Controle de Feriados e na própria lista do Cadastro: não existia regra geral de visibilidade de inativos
- [NOVO] REGRA FIXA — funcionário Inativo não aparece no Cadastro de Funcionários nem no Controle de Feriados. O dado nunca é apagado, some apenas da tela (PROJECT_RULES.md → "Cadastro de Funcionários → Funcionário inativo")
- [NOVO] Feriados: applyInactiveVisibility roda logo depois de buildLines, para que contadores do topo, filtros e tabela enxerguem o mesmo conjunto de linhas. Vínculo órfão ("Funcionário não encontrado") continua visível — é dado a corrigir, não alguém desligado (Boolean(employee) na marcação)
- [NOVO] Cadastro: isEmployeeVisibleByStatus. Exceção deliberada — com o filtro Status = Inativo o usuário pediu explicitamente os inativos, e o pedido vence a regra de ocultar (senão a tela viria vazia e o filtro ficaria quebrado). "Limpar filtros" volta ao padrão
- [NOVO] Botão "Mostrar funcionários inativos (N)" nas duas telas, abrindo um seletor com um checkbox por funcionário: só quem for marcado reaparece. A seleção é de exibição, vive em memória, não grava nada e não reativa ninguém. Em Feriados lista só os inativos COM vínculo de feriado (marcar quem não tem vínculo não mudaria nada) e a linha que volta ganha a tag "Inativo"
- [NOVO] js/inactive-employees.js (window.InactiveEmployeesUI): componente compartilhado do botão + seletor, para que as duas telas sejam idênticas em vez de duplicar ~150 linhas. Carregado no index.html depois de company-ui.js
- [NOVO] Data de desligamento obrigatória ao inativar: askTerminationDate no botão "Inativar" da lista e na mudança de status pelo formulário; valida data futura e data anterior à admissão. Substitui o confirm() antigo, que não pedia data
- [CORREÇÃO] A data informada alimenta deactivatedAt — o campo que a Escala usa para exibir o funcionário até o mês da saída. Antes o sistema assumia sempre "hoje", registrando saída errada para quem foi desligado em outra data
- [COMPATIBILIDADE] setEmployeeStatus(id, status, company) sem o 4º parâmetro mantém o comportamento antigo (data já registrada ou hoje): importações e chamadas legadas seguem funcionando. upsertEmployee passou a respeitar deactivatedAt explícito, com prioridade informado > registrado > hoje
- [NOVO] scripts/verify-inativos-visibilidade.mjs (25 asserções): data informada gravada, fallback legado, as duas regras de visibilidade e amarras de fonte
- [NOVO] scripts/verify-inativos-picker-ui.mjs (17 asserções): roda o seletor no Chrome real — asserção de fonte não prova que um modal funciona, e o seletor é o coração do pedido. Cobre abrir com um checkbox por inativo, ativo fora da lista, marcar/desmarcar todos, Aplicar devolvendo só os marcados e Cancelar inerte
- Arquivos: js/inactive-employees.js (novo), js/feriados.js, js/funcionarios.js, js/data.js, css/style.css, index.html, scripts/verify-inativos-visibilidade.mjs (novo), scripts/verify-inativos-picker-ui.mjs (novo), scripts/run-validate.mjs, PROJECT_RULES.md
- npm test 47/47; npm run validate 19/19 suítes (17 + 2 novas). Deploy 20260822.03, commits 1e2105a + 2a459a1

2026-08-22 (2) — Feriados: "+ Funcionário" sai da tabela (redundante com o botão global)
- [CORREÇÃO] Depois da saída do "Excluir feriado", o "+ Funcionário" ficou deslocado na coluna Ações. Ele só era renderizado na primeira linha de cada feriado, então a coluna alternava entre 3 e 2 elementos entre linhas
- [ANÁLISE] A mesma operação (AppData.addManualWorkedEmployee) já tinha dois caminhos, ambos preservados: o botão global "+ Vincular funcionário a feriado" no topo da página — que escolhe feriado E funcionário num passo só e funciona com a tabela vazia, situação em que o botão da linha nem aparecia — e o "+ Funcionário" do modal do calendário (data-link-employee-cal). O botão da linha era estritamente redundante
- [REMOÇÃO] Botão data-add-worked-employee e seu handler em bindTableActions; removidos também seenHoliday/isFirstHolidayRow, que existiam só para posicionar os dois botões agora fora da tabela
- [LAYOUT] Toda linha passa a ter exatamente data de compensação + "Excluir vínculo"; .holiday-actions (flex + gap) já alinha isso sem tocar no CSS
- showAddWorkedEmployeeModal permanece — segue em uso pelo modal do calendário. Apenas UI, nenhum dado tocado
- Arquivos: js/feriados.js
- npm test 47/47; npm run validate 17/17 suítes. Deploy 20260822.02, commits 101d1da + 8a111bf

2026-08-22 — Feriados: "Excluir feriado" sai da tela principal (fica só no modal)
- [CORREÇÃO] A coluna Ações da tabela principal trazia dois botões destrutivos lado a lado: "Excluir vínculo" (por funcionário) e "Excluir feriado" (apaga o feriado e TODOS os vínculos). A exclusão definitiva já existia no modal "Gerenciar feriados" (data-popup-remove-holiday), então o botão da tabela era uma segunda porta para a mesma ação, com risco real de clique errado
- [REMOÇÃO] Botão data-remove-holiday-perm da linha da tabela e seu handler em bindTableActions
- confirmDeleteHolidayPermanent e AppData.removeCompanyHolidayPermanently preservados — seguem em uso pelo modal. Nada mudou no popup, no calendário, nos filtros ou em outras abas. Apenas UI, nenhum dado tocado
- Arquivos: js/feriados.js
- npm test 47/47; npm run validate 17/17 suítes. Deploy 20260822.01, commits 9a5a16a + 872a710

2026-08-10 (3) — verify-print-escala: 8,7s → 2,7s (mesmas 55 asserções, mesmas medições)
- [MELHORIA] CSS do projeto (style.css + print.css + escala-print.css) passa a ser lido UMA vez e embutido no HTML de cada caso, no lugar de três <link href="file://">. Com isso o page.goto saiu de ~900ms para ~80ms por caso: não havia mais requisição para o waitUntil "networkidle0" esperar (500ms de ociosidade por navegação). Nenhum dos três CSS usa url(), então não há caminho relativo a resolver — a cascata é idêntica
- [MELHORIA] waitUntil de "networkidle0" para "load" (sem requisições, "load" já garante o CSS aplicado)
- [MELHORIA] Os 5 casos passam a rodar em PARALELO, cada um em sua própria aba, já que o custo dominante virou o page.pdf() do Chrome (~0,5s cada, ~2,6s em série). A saída é bufferizada por caso e impressa na ordem declarada, então o log continua agrupado e determinístico
- [VERIFICAÇÃO] Saída de geometria comparada com a versão anterior linha a linha (escala de auto-fit, altura do conteúdo, páginas do PDF, rodapé, razão nome/dia, preenchimento da grade): idêntica. 55/55 asserções, estável em 3 execuções seguidas
- npm run validate total: ~10,6s → ~4,9s
- Arquivos: scripts/verify-print-escala.mjs

2026-08-10 (2) — Suíte de testes: fixtures datadas corrigidas e npm run validate roda tudo
- [CORREÇÃO] run-functional-validation.mjs: fixture "Feriado Teste" tinha data FIXA (2026-04-10); ao vencer o prazo de compensação de 120 dias em 08/08/2026, o vínculo virou "Vencido" e derrubou duas asserções sem nenhuma mudança de código ("Status pendente detectado corretamente" e "Dashboard stats feriados: pendentes ≥ 1"). Data passou a ser relativa a hoje (hoje-30); o CO de 14/05/2026 usado pelo VT foi movido para um feriado próprio já compensado (status que não envelhece)
- [CORREÇÃO] verify-tombstones-sync.mjs: fixture criada antes da regra das 24h de exclusão de funcionário; sem createdAt, removeEmployee lançava exceção e o script morria no meio. Fixture ganhou createdAt recente (o teste é de cascata de tombstones, não da janela de exclusão)
- [NOVO] scripts/run-validate.mjs: runner que executa TODAS as suítes mesmo quando uma falha, imprime resumo com tempo por suíte e só então sai com código 1. Antes era uma cadeia com && — a primeira falha escondia o estado das demais
- [NOVO] npm run validate passou de 5 para 17 suítes (todas as scripts/verify-*.mjs entraram); aceita filtro por termo (ex.: npm run validate feriado) e avisa quando existe verify-*.mjs fora da lista
- Arquivos: scripts/run-validate.mjs (novo), scripts/run-functional-validation.mjs, scripts/verify-tombstones-sync.mjs, package.json
- npm test 47/47; npm run validate 17/17 suítes aprovadas

2026-08-10 — Controle de Feriados: lista completa (todos os anos) + editar/excluir por identidade
- [CORREÇÃO] Popup "Gerenciar Feriados" listava só state.calendarHolidays da empresa ativa; feriados que existiam apenas no bloco da empresa (companies[x].holidays) ficavam invisíveis — sintoma relatado: feriados de 2027 cadastrados não apareciam na lista
- [CORREÇÃO] mergeCalendarHolidaysPreservingSeeds fazia "remoto vence": qualquer feriado de calendário criado localmente e ainda não presente no remoto era DESCARTADO na primeira sincronização (perda silenciosa). Agora é UNIÃO por conteúdo (data + nome normalizado), unindo as empresas; exclusões continuam garantidas pelos tombstones
- [NOVO] AppData.listRegisteredHolidays(empresa) — visão unificada calendário + bloco da empresa, sem duplicar, sem recorte de ano, com contagem de vínculos
- [NOVO] Filtro de ano na lista do popup ("Todos os anos" por padrão) e coluna "Vínculos"
- [NOVO] AppData.updateHolidayEverywhere / removeHolidayEverywhere — editar e excluir pela identidade do feriado (data + nome), atingindo calendário + empresa; exclusão leva TODOS os vínculos e grava tombstones de feriado e de vínculo (não volta por merge, seed ou auto-sync); o CO já lançado na escala é preservado, só perde a referência
- [SEGURANÇA DE DADOS] Escopo por empresa: editar/excluir age só na empresa da aba ativa; entrada de calendário compartilhada ("ambas"/seed) é dividida/reduzida, nunca apagando o feriado nem os vínculos da outra empresa
- Arquivos: js/data.js, js/feriados.js, css/style.css, scripts/verify-feriados-todos-anos.mjs (novo), scripts/run-functional-validation.mjs, package.json
- npm test 47/47; verify-feriados-todos-anos 29/29; suítes de feriados/vínculos/tombstones sem regressão

2026-08-07 — Documentação: regra fixa de imutabilidade dos dados registrados
- [NOVO] PROJECT_RULES.md: seção "Imutabilidade dos dados já registrados (REGRA FIXA — TODOS OS MÓDULOS)" com tabela de dados protegidos por módulo (Feriados, Escala, VT, Ausências, Contador, Cadastro) e 6 regras operacionais
- [NOVO] Regra explícita: melhoria/correção/TESTE nunca altera dado registrado; homologação usa fixtures e scripts/verify-*.mjs; validação em produção é somente leitura; correção de dado real exige autorização caso a caso
- [NOVO] Mesma regra replicada em CLAUDE.md, AGENT_START.md e TEST_CHECKLIST.md (aviso no topo do checklist)
- [CORREÇÃO] PROJECT_STATUS.md e .claude/project-state.md estavam defasados em 20260703.01 — sincronizados para 20260806.03
- Somente documentação: nenhum arquivo de código alterado, nenhum deploy necessário (*.md está no ignore do firebase.json)

2026-08-06 (3) — Auto-vínculo: guarda anti-regressão (não nasce Vencido)
- [CORREÇÃO] syncAutoHolidaysWorkedForMonth deixa de CRIAR auto-vínculo para feriado com prazo de compensação (120 dias) já expirado — vínculo "nascido Vencido" é ruído e não é compensável
- A guarda só bloqueia criação; nunca remove vínculo existente. Trabalho real em feriado vencido continua via cadastro manual (addManualWorkedEmployee)
- [DADOS] Removidos os 10 vínculos Vencidos indevidos (Carnaval 2026 e Sexta-Feira Santa, todos com código vazio/FOLGA); os 47 Compensados/Agendados legítimos preservados
- [NOVO] PROJECT_RULES.md: salvaguarda de validação em produção (somente leitura — não rodar recompute de escala contra a base real)
- Arquivos: js/scale-rules.js, PROJECT_RULES.md, scripts/verify-auto-vinculo-vencido-guard.mjs (novo), scripts/verify-feriados-retroativos.mjs
- Versão 20260806.03 — commits aade7e6 (fix) + e3dd4f7 (carimbo) — npm test 47/47, validate 25/25, guard 4/4, retroativos 25/25

2026-08-06 (2) — Vínculo de feriado: exclusão DEFINITIVA + tombstones aninhados no Firebase
- [CORREÇÃO] "Excluir vínculo" passa a ser definitivo: novo state.workedLinkTombstones (chave data|nome|employeeId, escopo empresa) impede recriação pelo auto-vínculo da escala e pela união do merge entre PCs
- [CORREÇÃO] Sintoma resolvido: "Sexta-Feira Santa" reaparecia para CINTHIA JOSÉ MARIA (Pengold) após excluir o vínculo
- [NOVO] addManualWorkedEmployee limpa o tombstone no revínculo explícito; applyWorkedLinkTombstones em finalizeIncomingState (load + merge); preservado no cache lean
- [CORREÇÃO] holidayTombstones e workedLinkTombstones passam a trafegar ANINHADOS no nó tombstones do RTDB (__holidayTombstones/__workedLinkTombstones) — evita permission_denied, já que o deploy não publica database.rules.json. Fallback de leitura ao formato top-level antigo
- Arquivos: js/data.js, js/scale-rules.js, js/firebase-sync.js, js/version.js
- Versão 20260806.02 — commits d663d67 (fix) + 73fb812 (carimbo) — npm test 47/47, validate 25/25, verify-vinculo-tombstone 16/16, verify-exclusao-feriado-definitiva 15/15

2026-08-06 — Controle de Feriados: exclusão DEFINITIVA + tombstone por conteúdo
- [NOVO] Exclusão permanente de feriado pela interface, com TODOS os vínculos, sem retornar por sincronização (Firebase/outro PC), seed 2026 ou auto-sync do calendário
- [NOVO] state.holidayTombstones por CONTEÚDO (chave "data|nomeNormalizado", escopo empresa ou __calendar__) — duplicados têm ids distintos, então a identidade é data + nome
- [NOVO] removeCompanyHolidayPermanently remove todos os registros de mesmo nome+data (elimina duplicatas); removeCalendarHolidayPermanently faz o mesmo no calendário
- [NOVO] Helpers recordHolidayTombstone, isHolidayTombstoned, clearHolidayTombstone(s), mergeHolidayTombstoneStores, applyHolidayTombstones
- [CORREÇÃO] syncCompanyHolidaysFromCalendarEntry, applyHolidaySeed2026 e seedComplianceHolidays2026 passam a pular feriados tombados; recadastro explícito pelo usuário limpa o tombstone
- [CONTEXTO] Substitui o soft delete (isDeleted=true), que mantinha registro e workedEmployees e deixava duplicados acumulados (Natal 25/12/2025, Ano Novo 2026, Semana Santa, São Jorge 2/3, "Teste Tiradentes")
- Arquivos: js/data.js, js/feriados.js, js/firebase-sync.js, js/version.js
- Versão 20260806.01 — commits 954f7cd (feat) + cfab872 (carimbo) — npm test 47/47, validate 25/25, verify-exclusao-feriado-definitiva 15/15

2026-07-22 — Contador: máscara de horas HHH:MM (permite digitar 178:45)
- [CORREÇÃO] maskHora (js/contador.js) inseria o ":" cedo demais (178 → 1:78) e descartava os dígitos além de 2 casas de minutos, impedindo 3 dígitos de hora nos campos Ad. Noturno e Hora Extra
- Regra unificada: 2 últimos dígitos = minutos, até 3 dígitos = horas, com transbordo dos excedentes para as horas. Limite máximo 200:00 mantido; normalizeHora e submit inalterados
- [MELHORIA] Placeholder/hint atualizados; maxlength 6 → 7
- Versão 20260703.01 — commits 3b9b996 (fix) + a00e9e4 (carimbo) — npm test 47/47, validate 25/25 + simulação de digitação progressiva

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