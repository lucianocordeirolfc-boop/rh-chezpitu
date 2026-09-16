js/data.js
Fonte oficial dos dados
Também: relógio de referência da sincronização — AppData.now() = hora local +
desvio do servidor (ver js/firebase-sync.js). Todo carimbo de versão
(updatedAt, deletedAt, metas) usa now(), nunca Date.now() direto.

js/escala.js
Escala de Folga

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
