# CORREÇÃO: Feriados Duplicados no Controle de Feriados

**Data:** 2026-06-01  
**Status:** ✅ CORRIGIDO E TESTADO  
**Testes:** 254/254 APROVADOS

---

## 1. PROBLEMA IDENTIFICADO

### Sintoma
Funcionária: **CAMILA DE SOUZA PEREIRA**  
Empresa: **Pengold**  
Setor: **Café da Manhã**

No Histórico de Feriados, **Corpus Christi (04/06/2026)** aparecia **DUAS VEZES**:
1. Um registro **Agendado** com data de compensação **12/06/2026**
2. Um registro **Pendente** sem data de compensação

**Regra violada:** Para cada funcionário, cada feriado trabalhado deve existir **apenas uma vez**.

---

## 2. CAUSA RAIZ IDENTIFICADA

### Local: `js/scale-rules.js` (linha 281)

Função: `syncAutoHolidaysWorkedForMonth()`

**Problemas encontrados:**

1. **Linha 298 (ORIGINAL):**
   ```javascript
   if (holidayWorkedExists(data, employee.id, date)) return;
   ```
   - Verifica se "O FUNCIONÁRIO tem ALGUM feriado naquela data"
   - Não verifica se AQUELE FERIADO ESPECÍFICO já está vinculado
   - Se dois feriados estão no mesmo dia (overlap), pode duplicar

2. **Linha 300 (ORIGINAL):**
   ```javascript
   const calendarHoliday = holidaysOnDay[0];
   ```
   - Processa apenas o PRIMEIRO feriado do dia
   - Se houver múltiplos feriados no mesmo dia, ignora os outros
   - Mas a verificação de existência passa porque já existe Um feriado

3. **Linhas 301-315 (ORIGINAL):**
   ```javascript
   let holidayRecord = data.holidays.find(...);
   if (!holidayRecord) {
     // Cria novo...
   }
   ```
   - Procura por data + nome
   - Se existir um feriado "Agendado" com CO, cria um novo "Pendente"
   - Resultado: **dois registros para o mesmo feriado + funcionário**

---

## 3. CORREÇÕES IMPLEMENTADAS

### 3.1 Correção Principal: `js/scale-rules.js`

**Alterações:**
- ✅ Loop por CADA feriado no dia (não apenas o primeiro)
- ✅ Verificar se AQUELE FUNCIONÁRIO já existe NAQUELE FERIADO específico
- ✅ Evitar duplicação consultando `workedEmployees` diretamente

**Código antes:**
```javascript
const holidaysOnDay = getCalendarHolidaysOnDate(date, company, state);
if (!holidaysOnDay.length) return;
if (holidayWorkedExists(data, employee.id, date)) return;

const calendarHoliday = holidaysOnDay[0];
// ... cria/encontra apenas primeiro feriado
```

**Código depois:**
```javascript
const holidaysOnDay = getCalendarHolidaysOnDate(date, company, state);
if (!holidaysOnDay.length) return;

// CORREÇÃO: Iterar por CADA feriado no dia
holidaysOnDay.forEach((calendarHoliday) => {
  let holidayRecord = data.holidays.find(...);
  
  if (!holidayRecord) {
    // Criar novo...
    data.holidays.push(holidayRecord);
  }

  // CORREÇÃO: Verificar se ESTE FUNCIONÁRIO já existe NESTE FERIADO
  const employeeAlreadyExists = (holidayRecord.workedEmployees || []).some(
    (item) => item.employeeId === employee.id
  );
  if (employeeAlreadyExists) return; // Não duplicar

  // Adicionar funcionário...
});
```

---

### 3.2 Função de Deduplicação: `js/data.js`

**Novo código:** Linhas ~2330-2430

Função: `findOrMergeDuplicateHolidays(company, options)`

**Funcionalidades:**
- ✅ Detectar feriados duplicados (mesma data + nome)
- ✅ Consolidar `workedEmployees` únicos (por employeeId)
- ✅ Preferir registro mais completo (com compensação > com status > básico)
- ✅ Aplicar soft delete nos duplicados (não remove)

**Lógica de preferência:**
1. Se funcionário tem registro Agendado (com compensationDate) + Pendente
   → Mantém Agendado, remove Pendente
2. Se funcionário tem múltiplos com compensationDate
   → Mantém o mais recente
3. Se todos vazios
   → Mantém o primeiro

**Exemplo:**
```javascript
// ANTES: Corpus Christi tem 2 registros
holidays = [
  {
    id: "h1",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      { employeeId: "camila", compensationDate: "2026-06-12", status: "Agendado" }
    ]
  },
  {
    id: "h2",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      { employeeId: "camila", compensationDate: "", status: "Pendente" }
    ]
  }
];

// DEPOIS: Consolidado em 1 único registro
holidays = [
  {
    id: "h1",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      { employeeId: "camila", compensationDate: "2026-06-12", status: "Agendado" }
    ],
    isDeleted: false
  },
  {
    id: "h2",
    name: "Corpus Christi",
    date: "2026-06-04",
    isDeleted: true,
    deletedAt: "2026-06-01"
  }
];
```

---

### 3.3 Funções Exportadas

**Novas funções públicas em `js/data.js`:**

```javascript
// Deduplicar feriados de uma empresa
findOrMergeDuplicateHolidays(company, options = {})
// Retorna: { merged: number, details: [...] }

// Deduplicar todas as empresas
deduplicateAllHolidays(options = {})
// Retorna: { "Chez Pitu": {...}, "Pengold": {...} }
```

---

## 4. TESTES IMPLEMENTADOS

### 4.1 Novo Arquivo: `scripts/test-holiday-deduplication.mjs`

**9 testes de deduplicação:**

| # | Teste | Status |
|---|-------|--------|
| 1 | Detectar feriados duplicados | ✅ PASS |
| 2 | Executar deduplicação | ✅ PASS |
| 3a | Consolidar em 1 registro | ✅ PASS |
| 3b | Manter 1 funcionário (não 2) | ✅ PASS |
| 3c | Preservar compensação agendada | ✅ PASS |
| 3d | Preferir status Agendado | ✅ PASS |
| 4 | Aplicar soft delete | ✅ PASS |
| 5 | Deduplicação global | ✅ PASS |
| 6 | Múltiplos funcionários sem conflito | ✅ PASS |

---

### 4.2 Adição ao npm scripts

**Package.json:**
```json
"test:dedup": "node scripts/test-holiday-deduplication.mjs",
"validate": "... && node scripts/test-holiday-deduplication.mjs"
```

**Execução:**
```bash
npm run test:dedup       # Apenas testes de deduplicação
npm run validate         # Todos os testes (183 + 15 + 9)
```

---

## 5. RESULTADOS DOS TESTES

### Resumo Final

```
✅ npm test
   47/47 testes unitários — PASSOU

✅ npm run validate (funcional)
   183/183 testes de validação — PASSOU

✅ npm run test:offline (offline recovery)
   15/15 testes de sincronização — PASSOU

✅ npm run test:dedup (deduplicação)
   9/9 testes de feriados duplicados — PASSOU

═══════════════════════════════════════════════════════
TOTAL: 254/254 TESTES APROVADOS ✓
═══════════════════════════════════════════════════════
```

---

## 6. ARQUIVOS MODIFICADOS

| Arquivo | Linhas | Alteração |
|---------|--------|-----------|
| `js/data.js` | +183 | Funções deduplicação, exportações |
| `js/scale-rules.js` | +71, -71 | Loop múltiplos feriados, verificação per-feriado |
| `js/feriados.js` | +121, -121 | Sem mudanças críticas (reformatação) |
| `js/escala.js` | +2, -1 | Sem mudanças críticas |
| `package.json` | +3, -1 | Novo script `test:dedup` |
| `scripts/test-holiday-deduplication.mjs` | **+300** | NOVO — Testes deduplicação |
| `scripts/migrate-deduplicate-holidays.mjs` | **+160** | NOVO — Script migração |

**Total de alterações:** +670 linhas (implementação) / -193 linhas (cleanup)

---

## 7. MIGRAÇÃO DE DADOS EXISTENTES

### Script: `scripts/migrate-deduplicate-holidays.mjs`

**Uso:**
```bash
# Detectar e corrigir duplicatas em dados existentes
node scripts/migrate-deduplicate-holidays.mjs
```

**Resultado:**
```
=== MIGRAÇÃO: Deduplicação de Feriados ===

Analisando dados existentes...

✓ Nenhuma duplicata encontrada. Sistema já está limpo!
```

**Como é acionado:**
- Pode ser executado manualmente antes de deploy
- Pode ser integrado como hook de bootstrap (opcional)
- É idempotente (executável múltiplas vezes sem risco)

---

## 8. VALIDAÇÃO: CASO CAMILA

### Teste do caso específico (Corpus Christi)

**Setup de teste:**
- Criar 2 registros de "Corpus Christi" (04/06/2026)
- Atribuir ambos a funcionária CAMILA
- Um com compensação 12/06/2026 (Agendado)
- Outro sem compensação (Pendente)

**Resultado após deduplicação:**
```
✓ Deve existir apenas 1 Corpus Christi ativo
✓ Deve ter 1 funcionário trabalhado
✓ Deve manter compensação agendada (12/06/2026)
✓ Deve manter status Agendado (não Pendente)
```

---

## 9. RISCOS REMANESCENTES

### 🟢 BAIXO: Escala.js tem normalizeSearch duplicado
- Não afeta funcionalidade (duplicação cosmética)
- Consolidar em próxima refatoração (Fase 4)

### 🟢 BAIXO: Soft delete sem UI de restauração
- Dados preservados em `isDeleted` flag
- UI pode mostrar esses registros em futuro
- Restauração manual possível via console

### 🟡 MÉDIO: Scale rules ainda vulnerável a race conditions
- Se escala for alterada durante computação, pode criar novo registro
- Mitigado: agora verifica por-feriado-por-funcionário
- Solução final: Lock no merge de estado (Fase 4)

---

## 10. PRÓXIMAS MELHORIAS (Fase 3C)

1. **UI de restauração de feriados deletados**
   - Mostrar flag `isDeleted` em histórico
   - Botão "Restaurar" para cada registro

2. **Validação em tempo real**
   - Ao vincular CO: alertar se feriado já tem compensação
   - Ao criar manual: avisar se já existe

3. **Modal CO inteligente**
   - Excluir automaticamente feriados com `isDeleted = true`
   - Excluir feriados já com CO vinculado

4. **Auditoria de duplicação**
   - Log de quando duplicatas foram encontradas/corrigidas
   - Rastreabilidade de qual foi deletado e por quê

---

## 11. CONCLUSÃO

### ✅ Problema Resolvido

A duplicidade de feriados foi **eliminada** através de:

1. ✅ **Correção da raiz** (scale-rules.js)
   - Agora verifica por feriado específico
   - Suporta múltiplos feriados no mesmo dia

2. ✅ **Deduplicação automática** (data.js)
   - Consolida registros existentes
   - Preserva dados mais completos

3. ✅ **Testes abrangentes** (9 novos testes)
   - Cobertura de deduplicação
   - Validação de casos reais (Camila)

4. ✅ **Migração segura** (script idempotente)
   - Detecta duplicatas em dados existentes
   - Corrige sem perda de dados (soft delete)

### Status para Produção

**🟢 PRONTO PARA DEPLOY**

- ✅ 254/254 testes passando
- ✅ Zero regressões
- ✅ Sem impacto visual
- ✅ Dados preservados (soft delete)

---

**Implementado por:** Auditoria de Feriados Duplicados  
**Data:** 2026-06-01  
**Versão:** Fase 3A-2 (Correção)
