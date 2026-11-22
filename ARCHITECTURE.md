js/data.js
Fonte oficial dos dados
Também: relógio de referência da sincronização — AppData.now() = hora local +
desvio do servidor (ver js/firebase-sync.js). Todo carimbo de versão
(updatedAt, deletedAt, metas) usa now(), nunca Date.now() direto.
- AppData.state é GETTER do estado vigente (setRemoteState reatribui o estado
  ao sincronizar; nunca guardar referência a ele entre chamadas).
- getScaleCode(employee, date, data, manualOverride?) resolve o código do dia
  pelo HISTÓRICO do cadastro (folga fixa, domingos, 2ª folga) — alteração de
  folga nunca é retroativa. manualOverride simula o rascunho da Escala.
- applyManualScaleBatch: gravação do "Salvar escala" (mesma regra de
  setManualScale por item; recalcula e salva uma vez).

js/rh-catalog.js
Regras de Cargos e Salários e Quadro de Vagas (sem DOM): funções (nome e CBO
únicos por empresa, histórico de salário), comissões, padronização de grafia
dos cargos do cadastro, vagas/candidatos/admissões e indicadores do Painel RH.

js/cargos.js
Tela Cargos e Salários (sub-abas Funções e Salários / Comissões).

js/quadro-vagas.js
Tela Quadro de Vagas (sub-abas Vagas em aberto / Painel RH / Recrutamento e
Seleção / Admissões).
- Dados por empresa em state.companies[empresa].{cargos, comissoes, vagas,
  candidatos, admissoes}; no Firebase aninhados em ferias/{empresa}.__rh.

js/rh-reports.js
Relatórios PDF de Cargos e Salários e Quadro de Vagas (HTML sem DOM +
impressão em iframe isolado; somente leitura).

js/escala.js
Escala de Folga
- Somente-leitura até "Editar escala"; alterações em rascunho (scaleState.draft)
  e gravação só no "Salvar escala", se a regra 5x2 estiver cumprida.

js/scale-5x2.js
Regra 5x2 (EC 141/2026) — fonte única, sem DOM: validateMonth (2 folgas F/D por
semana seg→dom a partir de 21/12/2026), suggestSecondFolgas (2ª folga por setor,
≤ 2 de folga/dia, evita sex/sáb, domingos quinzenais do regime feminino) e
sectorDayOverload (alerta de setor).

js/scale-rules.js
Integrações da escala (auto-vínculo de feriado, regras de cobertura — hoje sem
principais ativos, COVERAGE_PRINCIPALS vazio).

js/vale-transporte.js
Vale Transporte

js/feriados.js
Controle de Feriados

js/firebase-sync.js
Sincronização Firebase
- Envio INCREMENTAL: os nós indexados por empresa viram caminhos próprios
  (sistemaRH/funcionarios/Chez Pitu) e só o que mudou desde o último envio
  confirmado da sessão é gravado. Gravação sem mudança nenhuma não grava.
- Nunca envia null (null apagaria o nó no servidor) e nunca lança: erro de envio
  vira status "Erro de sincronização", nunca interrompe a ação do usuário.
- Listener em tempo real descarta apenas o ECO do próprio dispositivo
  (configuracoes.updatedBy = DEVICE_ID + carimbo).
- Lê .info/serverTimeOffset e alimenta AppData.setSyncClockOffset; o selo avisa
  quando o relógio do computador está fora de hora.
- sanitizeForRtdb é a última linha de defesa do payload (ver import-utils).

js/import-utils.js
Utilitários de importação/formatação e o escape de chave do Realtime Database
(escapeRtdbKey / hasForbiddenRtdbKeyChars). REGRA: toda chave montada com texto
do usuário passa por escapeRtdbKey — ver PROJECT_RULES.md → "Chaves do Firebase".

js/company-ui.js
Troca de empresas

js/inactive-employees.js
Botão e seletor "Mostrar funcionários inativos" (compartilhado por
Cadastro de Funcionários e Controle de Feriados)
