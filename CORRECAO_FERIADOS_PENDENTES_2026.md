# CORREÇÃO: Feriados de abril/2026 ausentes para vinculação de CO

**Data:** 2026-06-10
**Fase:** 3B
**Status:** ✅ CORRIGIDO E TESTADO (sem commit/deploy — aguarda autorização)

---

## 1. PROBLEMA ENCONTRADO

Os feriados **Semana Santa (03/04/2026)**, **Tiradentes (21/04/2026)** e
**São Jorge (23/04/2026)** não apareciam no modal de vinculação de CO na
Escala de Folga, para nenhum funcionário das duas empresas.

## 2. CAUSA RAIZ

Validações executadas (Correção 1 do pedido):

| Verificação | Resultado |
|---|---|
| Feriados existem na base? | **NÃO** — nunca foram cadastrados (nem em `state.calendarHolidays`, nem em `companies[*].holidays`; não há feriados padrão no código — `calendarHolidays` nasce vazio em `createDefaultState`) |
| Filtrados indevidamente? | Não — o filtro do modal CO (`getAvailableCoHolidayOptions`) está correto |
| Marcados como compensados para todos? | Não — não existiam registros para marcar |
| Diferença cadastrado × pendente × elegível × compensado | O modal CO só exibe feriados em que o funcionário tem vínculo (`workedEmployees`) com status Pendente/Vencido. Sem o feriado cadastrado, o vínculo não pode existir — por isso nada aparecia |

**Conclusão:** não era um bug de filtro/status. Os três feriados simplesmente
não existiam na base.

## 3. CORREÇÃO APLICADA

### 3.1 Seed único e idempotente (`js/data.js`)

`applyHolidaySeed2026IfNeeded()` — executa uma única vez por dispositivo
(flag `chezPituHolidaySeed2026.v1` no localStorage), logo após `loadState()`:

- Cria os 3 feriados no **calendário global** (`cal-seed-2026-*`, escopo
  `["ambas"]`) e nos **blocos das duas empresas** (`feriado-seed-2026-*`).
- `workedEmployees: []` — **nenhum vínculo automático é criado**, nenhuma
  pendência em massa, nenhum funcionário pré-selecionado. O usuário marca
  manualmente no Controle de Feriados quem trabalhou; só então o feriado
  aparece no modal CO daquele funcionário (regras 1–4 do pedido atendidas).
- **Idempotente por conteúdo:** compara por ano 2026 + nome normalizado com
  variantes ("Sexta-feira Santa" ≈ "Semana Santa", "Dia de São Jorge" ≈
  "São Jorge"). Registros existentes — inclusive soft-deletados — nunca são
  alterados, duplicados ou ressuscitados.

### 3.2 Proteção no merge com Firebase (`mergeRemoteIntoLocal`)

Antes, o calendário remoto não-vazio **descartava o calendário local
inteiro**. Como a flag impede novo seed, os feriados recém-criados sumiriam
para sempre na primeira sincronização. Agora
`mergeCalendarHolidaysPreservingSeeds()` mantém a regra atual (remoto
prevalece) mas reinsere os seeds locais que o remoto ainda não tem, sem
duplicar variantes. O merge das listas de feriados por empresa já era união
por id e não precisou mudar.

### 3.3 Auditoria de consistência (`AppData.auditHolidayConsistency()`)

Função **somente leitura** (Correção 2 do pedido). Rodar no console do
navegador, em produção: `AppData.auditHolidayConsistency()`. Detecta:

1. Feriados cadastrados mas invisíveis para vinculação (soft-deletados com pendência);
2. Status gravado divergente do status calculado;
3. Vínculos órfãos (employeeId inexistente na empresa — funcionário errado);
4. Feriados sem funcionário vinculado (informativo, não conta como erro);
5. "Compensado" sem nenhuma data de compensação (deveria estar pendente);
6. Datas divergentes entre feriado da empresa e calendário (mesmo ano);
7. Duplicidades ativas (mesma data + nome) e variantes de nome em datas
   diferentes no calendário (risco de duplicidade futura).

## 4. ARQUIVOS ALTERADOS

| Arquivo | Alteração |
|---|---|
| `js/data.js` | Seed 2026 (constantes + 3 funções), `mergeCalendarHolidaysPreservingSeeds`, `auditHolidayConsistency`, 2 exports novos |
| `index.html` | Bump de cache `v=20260610` (já estava no working tree) |
| `PROJECT_HISTORY.md` | Registro da Fase 3B |
| `scripts/test-seed-2026.mjs` | 15 testes do seed (temporário — cabeçalho diz "não versionar") |

Nenhum dado existente foi apagado, migrado ou alterado. Nenhuma regra já
corrigida (CO, VT, empresas separadas, dedup de feriados, quota) foi tocada.

## 5. TESTES EXECUTADOS E RESULTADOS

| Suíte | Resultado |
|---|---|
| `npm test` (unitários Fase 2) | ✅ 47/47 |
| `npm run validate` (funcional + offline + dedup + quota) | ✅ 267 checks, 0 falhas |
| `node scripts/test-seed-2026.mjs` | ✅ 15/15 (seed limpo, recarga sem duplicata, variante "Sexta-feira Santa", merge com remoto) |
| Auditoria com dados sintéticos (7 cenários de problema) | ✅ 9/9 |
| Fluxo CO ponta a ponta | ✅ seed não cria vínculo; após seleção manual, os 3 feriados aparecem **Pendentes** no modal CO |

Prazo de compensação conferido: em 10/06/2026 os três feriados ainda estão
dentro dos 120 dias (Semana Santa vence 01/08/2026), portanto status
**Pendente** — elegíveis para CO.

## 6. RISCOS IDENTIFICADOS

- 🟡 **Auto-vínculo pela escala (pré-existente, NÃO alterado):**
  `syncAutoHolidaysWorkedForMonth` cria vínculos "Automático pela escala"
  para todo funcionário com código "trabalhado" quando o mês do feriado é
  recomputado (ex.: abrir a Escala em abril/2026). **Código vazio conta como
  trabalhado.** Isso vale para QUALQUER feriado cadastrado (não só os seeds).
  Recomendação operacional: conferir a escala de abril/2026 (folgas, férias)
  antes de navegar até o mês; vínculos automáticos indevidos podem ser
  removidos no Controle de Feriados.
- 🟢 Flag por dispositivo: limpar dados do navegador re-executa o seed — sem
  risco, pois é idempotente por conteúdo.
- 🟢 Seeds com data fixa: se a empresa usar outro dia da Semana Santa
  (ex.: 05/04), basta editar a data no Controle de Feriados — a edição é
  preservada (o seed nunca roda de novo após a flag).

## 7. MELHORIAS PREVENTIVAS (documentadas — NÃO implementadas)

1. **ALTO — Merge do calendário "remoto vence tudo":** fora dos seeds, um
   feriado de calendário criado offline ainda pode ser perdido na primeira
   sincronização se o remoto tiver calendário não-vazio. Sugestão (Fase 4):
   união por `data + nome normalizado` como nos feriados de empresa. O mesmo
   padrão existe em `coverageAlerts`.
2. **ALTO — Default "trabalhado" para código vazio na escala:** alimenta o
   auto-vínculo de feriados e o VT. Sugestão: ao recomputar meses passados,
   exigir confirmação ou criar vínculos automáticos como "sugestão" a aprovar.
3. **MÉDIO — `js/data.js` monolítico (~3.900 linhas):** concentra persistência,
   merge, feriados, VT, escala e empresa. Refatorar em módulos na Fase 4
   (feriados/CO já têm fonte única — bom ponto de corte).
4. **MÉDIO — Casamento por nome normalizado:** variantes de nome de feriado
   ("Sexta-feira Santa" × "Semana Santa") só são tratadas nos seeds e na
   Padroeira. Um catálogo de aliases central evitaria duplicidades futuras.
5. **BAIXO — Soft-deletados acumulam para sempre:** crescem o payload
   (mitigado pela camada "slim" da quota). Sugestão: expurgo opcional após
   N meses, com exportação prévia.
6. **BAIXO — IDs `Date.now()+Math.random()`:** risco de colisão remoto;
   padronizar gerador único (`uid()`) em `scale-rules.js`.

## 8. PENDÊNCIAS

- Commit/push/deploy aguardando autorização do usuário.
- `scripts/test-seed-2026.mjs` é temporário ("não versionar") — decidir se
  será incorporado ao `npm run validate` ou descartado após homologação.
- Rodar `AppData.auditHolidayConsistency()` no console de produção após o
  deploy para auditar os dados reais (a auditoria local usa dados sintéticos).
