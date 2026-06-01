# FASE 3 — ROADMAP DETALHADO

**Objetivo:** Estabilizar arquitetura, preparar para crescimento futuro  
**Duração estimada:** 8-10 semanas  
**Risco geral:** BAIXO (sem alteração de regras de negócio)

---

## PRIORIZAÇÃO POR IMPACTO

### Tier 1 — CRÍTICO (Semana 1-2)

#### 1.1 Teste de sincronização offline
**Problema:** Sistema não foi testado em cenário offline → online
**Solução:**
```javascript
// scripts/test-offline-recovery.mjs (novo)
1. Iniciar aplicação normalmente
2. Simular perda de internet (mock navigator.onLine = false)
3. Modificar 3-4 registros (escala, feriado, VT)
4. Restaurar internet (navigator.onLine = true)
5. Verificar se todos os registros foram sincronizados
6. Verificar se localStorage foi limpo após sync (evitar duplicação)
```

**Entrada de risco:** Se usuário estava offline e adicionou CO, ao voltar online:
- CO aparece na escala? ✓ ou ✗
- CO abate VT corretamente? ✓ ou ✗
- Timestamp é mantido ou recalculado? ✓ ou ✗

**Aceitação:**
- [ ] Teste passa sem modificar código
- [ ] OU identifica bug e é documentado em BUGS_CONHECIDOS.md

---

#### 1.2 Documentação de dependências globais
**Problema:** 166 referências globais sem mapa claro
**Solução:** Arquivo `DEPENDENCIES.md`

```markdown
# Mapa de Dependências Globais

## window.AppData
Exportado por: js/data.js (linha 3020)
Depende de: firebase-sync.js, auth.js
Usado por: TODOS os módulos

Responsabilidades (por 3 iniciais):
- **app*** (app.js) → AppData.setActiveCompany()
- **asl*** → AppData.absencesByCompany()
- **cal*** → AppData.calendarHolidays

## window.AppAuth
Exportado por: js/auth.js (linha 150)
Depende de: firebase.js (cdn)
Usado por: firebase-sync.js, app.js

## window.EscalaModule
Exportado por: js/escala.js (linha 1491)
Depende de: AppData
Usado por: app.js (render)

...
```

**Checklist:**
- [ ] Mapear TODOS os window.* 
- [ ] Listar dependências de cada
- [ ] Documentar ordem de carregamento esperada
- [ ] Criar validador que verifica em tempo de inicialização

---

#### 1.3 Validação de Padroeira de Búzios (consolidar)
**Problema:** Bug reincidente em 21/05 foi corrigido, mas sem proteção automática
**Solução:** Implementar validação ao carregar Firebase

```javascript
// js/data.js → nova função
function validatePadroeiraBuzios(companyData) {
  const holidays = companyData.holidays || [];
  let corrected = false;
  
  holidays.forEach(h => {
    if (h.date && h.date.endsWith("-05-21")) {
      console.warn(`[Validação] Padroeira de Búzios encontrada em 21/05, corrigindo para 26/07`);
      h.date = h.date.slice(0, 5) + "-07-26";
      corrected = true;
    }
  });
  
  return { corrected, data: companyData };
}

// Chamar ao carregar Firebase
const remote = await loadFromFirebase();
companyData.forEach(data => {
  const { corrected } = validatePadroeiraBuzios(data);
  if (corrected) saveState();
});
```

**Teste:**
- [ ] Inserir feriado com data 2026-05-21
- [ ] Carregar Firebase
- [ ] Verificar se automaticamente corrigido para 2026-07-26

---

### Tier 2 — ALTO (Semana 3-4)

#### 2.1 Dividir data.js em módulos temáticos

**Estrutura proposta:**

```
js/core/
├── index.js (exporta AppData, orquestra imports)
├── state.js (3.020L → 600L)
│   ├── getState()
│   ├── setState()
│   ├── saveState()
│   └── readLocalState()
├── company.js (novo, 200L)
│   ├── getCompanyData()
│   ├── createCompanyData()
│   ├── registerCompany()
│   └── ensureCompanyDataShape()
├── employees.js (novo, 300L)
│   ├── getEmployees()
│   ├── findEmployeeRecord()
│   ├── isEmployeeActive()
│   ├── sortEmployeesByName()
│   └── getEmployeeName()
├── scale.js (novo, 400L)
│   ├── getScaleCode()
│   ├── isWorkedScaleCode()
│   ├── setScaleCode()
│   ├── runScaleIntegrations()
│   └── validateCoverageRules()
├── holidays.js (novo, 350L)
│   ├── getHolidayCompensationDueDate()
│   ├── resolveWorkedHolidayStatus()
│   ├── syncWorkedEmployeeStatus()
│   ├── getHolidayStats()
│   └── validateHolidayIntegrity()
├── vt.js (novo, 250L)
│   ├── getVtDeduction()
│   ├── getVtSelectedYearMonth()
│   ├── ensureValeTransporteState()
│   └── calculateVtForEmployee()
├── filters.js (novo, 150L)
│   ├── getPageCompany()
│   ├── setPageCompany()
│   ├── resolveCompaniesForPage()
│   └── getPrimaryPageCompany()
└── utils.js (novo, 400L)
    ├── todayISO()
    ├── monthKey()
    ├── formatDateBR()
    ├── diffDays()
    ├── addDays()
    ├── normalizeSearch() [centralizado]
    ├── escapeHTML()
    └── [outras helpers]
```

**Mapa de migração:**
| Função | Atual | Novo |
|--------|-------|------|
| getCompanyData() | data.js:x | core/company.js |
| getScaleCode() | data.js:y | core/scale.js |
| getEmployeeName() | data.js:z | core/employees.js |
| formatDateBR() | data.js:a | core/utils.js |
| normalizeSearch | funcs.js:b | core/utils.js |

**Esforço estimado:** 40-50 horas

**Benefícios:**
- [ ] Cada módulo <500 linhas (legível)
- [ ] Dependências explícitas (`import { x } from './scale.js'`)
- [ ] Testes isolados por responsabilidade
- [ ] Novos devs entendem função em 5 min

---

#### 2.2 Eliminar duplicação de `normalizeSearch`

**Atual:** 3 funções idênticas (funcionarios.js, escala.js, feriados.js)

**Solução:** Centralizar em `core/utils.js`

```javascript
// js/core/utils.js
export function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

export function normalizeSearchDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
```

**Impacto:** -50 linhas de código, +1 ponto de verdade

---

#### 2.3 Consolidar validação de cobertura (TR/TM/MR)

**Problema:** Regra existe em scale-rules.js mas não é executada na UI
**Solução:** Implementar validador interativo

```javascript
// js/core/validators/coverage-validator.js (novo)
function validateCoverageRequirement(employee, date, company) {
  const principalName = employee.name;
  
  // Catarina Victoria → precisa TR
  if (principalName.includes("Catarina") || principalName.includes("Azeredo")) {
    const hasCodeTR = checkIfCoverageExists("TR", date, company);
    return hasCodeTR ? { valid: true } : { 
      valid: false, 
      error: "Catarina Victoria precisa de cobertura TR",
      requiredCode: "TR"
    };
  }
  
  // Idem para André (TM) e Rosana (MR)
  return { valid: true };
}
```

**UI Integração:**
```javascript
// em escala.js ao lançar código
const validation = validateCoverageRequirement(employee, date, company);
if (!validation.valid) {
  App.toast(validation.error, "warning", 5000);
  // Não bloqueia, mas avisa
}
```

---

### Tier 3 — MÉDIO (Semana 5-6)

#### 3.1 Implementar retry exponencial em Firebase

**Problema:** Se sync falhar, sem retry automático
**Solução:** Implementar backoff exponencial

```javascript
// js/firebase-sync.js
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

let retryCount = 0;
let nextRetryAt = null;

async function saveWithRetry(state, attempt = 1) {
  try {
    return await save(state);
  } catch (error) {
    if (attempt >= RETRY_CONFIG.maxRetries) {
      console.error("[FirebaseSync] Falha permanente após retries");
      setStatus("error", "Falha ao sincronizar (será retentado)");
      scheduleRetry(state);
      return false;
    }
    
    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
      RETRY_CONFIG.maxDelayMs
    );
    
    console.log(`[FirebaseSync] Retry ${attempt}/${RETRY_CONFIG.maxRetries} em ${delay}ms`);
    
    return new Promise(resolve => {
      setTimeout(() => resolve(saveWithRetry(state, attempt + 1)), delay);
    });
  }
}

function scheduleRetry(state) {
  // Tenta a cada 30s até conseguir
  if (nextRetryAt) clearTimeout(nextRetryAt);
  nextRetryAt = setTimeout(() => {
    if (isOnline()) {
      saveWithRetry(state);
    } else {
      scheduleRetry(state);
    }
  }, 30000);
}
```

**Teste:**
- [ ] Simular falha de rede: `db.ref().update = () => throw new Error("Network")`
- [ ] Verificar se tenta novamente
- [ ] Verificar se para após maxRetries
- [ ] Verificar se continua tentando a cada 30s

---

#### 3.2 Adicionar heartbeat (keep-alive)

**Problema:** Usuário pode ficar offline sem saber
**Solução:** Ping periódico ao Firebase

```javascript
// js/firebase-sync.js
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL_MS = 30000;

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    if (!isOnline()) {
      setStatus("offline", "Sem conexão");
      return;
    }
    
    try {
      // Ping simples: ler versão atualizada do Firebase
      const snap = await db.ref("configuracoes/updatedAt").once("value");
      const remoteUpdatedAt = snap.val();
      const localUpdatedAt = AppData.state?.firebaseLastSync || 0;
      
      if (remoteUpdatedAt > localUpdatedAt) {
        console.log("[FirebaseSync] Mudanças remotas detectadas, refreshando...");
        await refresh();
      }
      
      setStatus("online", "Sincronizado");
    } catch (error) {
      console.warn("[FirebaseSync] Heartbeat falhou:", error);
      setStatus("error", "Erro ao sincronizar");
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
}

// Chamar ao inicializar
window.addEventListener("online", startHeartbeat);
window.addEventListener("offline", stopHeartbeat);
```

---

### Tier 4 — TESTE INTEGRADO (Semana 7-8)

#### 4.1 Teste de offline → online recovery

```javascript
// scripts/test-offline-recovery-full.mjs (novo)
import { runTest, assert } from './test-utils.mjs';

await runTest("Offline → Online Recovery", async (env) => {
  const { db, localStorage, navigator } = env;
  
  // 1. Começar online, sincronizar baseline
  assert(navigator.onLine, "Deve começar online");
  await env.initialSync();
  
  // 2. Ir offline
  navigator.onLine = false;
  env.syncStatus.should.be("offline");
  
  // 3. Modificar 5 registros
  const changes = {
    "escala|CPF001|2026-06-05": "CO",
    "escala|CPF002|2026-06-06": "FÉRIAS",
    "feriado|001": { status: "Compensado", date: "2026-06-10" },
    "vt|CPF001|2026-06": { deductDays: 2 },
    "ausencia|CPF003": { type: "ATESTADO", date: "2026-06-07" }
  };
  
  for (const [key, value] of Object.entries(changes)) {
    await env.modifyLocal(key, value);
  }
  
  // 4. Verificar que localStorage tem as mudanças
  const localState = env.readLocalState();
  assert(localState.escala["CPF001|2026-06-05"] === "CO", "CO deve estar em localStorage");
  
  // 5. Restaurar internet
  navigator.onLine = true;
  env.syncStatus.should.transition.to("syncing");
  
  // 6. Aguardar sync completar
  await env.waitForStatus("online");
  env.syncStatus.should.be("online");
  
  // 7. Verificar se Firebase tem as mudanças
  const remoteState = await env.readRemote();
  assert(
    remoteState.escalas[company]["CPF001|2026-06-05"] === "CO",
    "CO deve estar em Firebase após sync"
  );
  
  // 8. Verificar que registros offline não foram perdidos
  const finalLocal = env.readLocalState();
  assert.deepEqual(finalLocal, localState, "localStorage não deve mudar após sync");
});
```

**Aceitação:**
- [ ] Teste passa
- [ ] Nenhum dado foi perdido
- [ ] Não há duplicação

---

#### 4.2 Teste de múltiplas abas

```javascript
// scripts/test-multitab-sync.mjs (novo)
import { runTest, assert } from './test-utils.mjs';

await runTest("Multi-tab synchronization", async (env) => {
  // Simular 2 abas com SharedWorker ou Service Worker
  const tab1 = new Tab("escala-tab");
  const tab2 = new Tab("feriados-tab");
  
  // Tab 1: Adiciona CO
  await tab1.setScaleCode("CPF001", "2026-06-05", "CO");
  await env.waitForFirebaseSync();
  
  // Tab 2: Deve ver o CO imediatamente (via listener)
  const escalaData = await tab2.getScaleCode("CPF001", "2026-06-05");
  assert.equal(escalaData, "CO", "Tab 2 deve ver CO de Tab 1");
  
  // Tab 1: Modifica VT
  await tab1.setVtDeduction("CPF001", "2026-06", 1);
  
  // Tab 2: Verifica se VT foi atualizado
  const vtDeduction = await tab2.getVtDeduction("CPF001", "2026-06");
  assert.equal(vtDeduction, 1, "Tab 2 deve ver VT atualizado");
});
```

---

#### 4.3 Teste de corrupção de dados

```javascript
// scripts/test-data-corruption-recovery.mjs (novo)
await runTest("Data corruption recovery", async (env) => {
  // 1. Começar com dados válidos
  const validData = {
    companies: {
      "Chez Pitu": {
        employees: [
          { id: "E001", name: "João", company: "Chez Pitu" }
        ],
        holidays: [
          { id: "H001", name: "Padroeira de Búzios", date: "2026-07-26" }
        ]
      }
    }
  };
  
  await env.setRemoteState(validData);
  
  // 2. Simular corrupção (alguém modificou Firebase manualmente)
  const corruptedData = {
    ...validData,
    companies: {
      ...validData.companies,
      "Chez Pitu": {
        ...validData.companies["Chez Pitu"],
        holidays: [
          { id: "H001", name: "Padroeira de Búzios", date: "2026-05-21" } // ← ERRADO
        ]
      }
    }
  };
  
  await env.setRemoteState(corruptedData);
  
  // 3. Recarregar aplicação (simula novo login)
  await env.reload();
  
  // 4. Verificar se validação corrigiu automaticamente
  const holidays = env.getHolidays();
  const padroeira = holidays.find(h => h.name.includes("Padroeira"));
  assert.equal(padroeira.date, "2026-07-26", "Data deve ser corrigida para 26/07");
});
```

---

### Tier 5 — DOCUMENTAÇÃO (Semana 9)

#### 5.1 ARCHITECTURE.md atualizado

```markdown
# Arquitetura — Fase 3

## Estrutura modular

```
js/
├── core/
│   ├── index.js (orquestrador)
│   ├── state.js (estado global)
│   ├── company.js (dados de empresa)
│   ├── employees.js (funcionários)
│   ├── scale.js (escala de folga)
│   ├── holidays.js (feriados)
│   ├── vt.js (vale-transporte)
│   ├── filters.js (filtros de página)
│   ├── utils.js (helpers compartilhadas)
│   └── validators/
│       ├── company-validator.js
│       ├── coverage-validator.js
│       └── holiday-validator.js
├── sync/
│   ├── firebase-sync.js (sincronização remota)
│   └── merge-strategy.js (resolução de conflitos)
├── modules/
│   ├── escala.js
│   ├── feriados.js
│   ├── vale-transporte.js
│   ├── ferias.js
│   ├── funcionarios.js
│   ├── contador.js
│   └── dashboard.js
└── app.js (shell)

```

## Fluxo de dados (melhorado)

```
Firebase ←→ [retry/heartbeat] ← FirebaseSync
  ↑                               ↓
  │                         MergeStrategy
  │                               ↓
  └←→ localStorage ←→ AppData (core/index.js)
                          ↓
                    [Validadores]
                          ↓
                    [Módulos UI]
```

## Inicialização

1. HTML carrega scripts em ordem (sem dependências frágeis)
2. core/index.js orquestra imports internos
3. Modules registram-se em window.ModuleRegistry
4. app.js ativa listeners

---

#### 5.2 DEVELOPER_GUIDE.md (novo)

```markdown
# Guia para Desenvolvedores

## Adicionar novo campo em Funcionário

1. Editar `js/core/employees.js`
2. Adicionar em `normalizeEmployee()`
3. Atualizar teste em `scripts/run-phase2-tests.mjs`
4. Avisar se afeta Escala/VT/Feriados

## Adicionar novo código de escala

1. Editar `js/core/scale.js` → `NOT_WORKED_SCALE_CODES`
2. Atualizar `js/data.js` → `SCALE_CODES`
3. Verificar impacto em `VT_WORKED_CODES`
4. Adicionar cor em `css/style.css` → `.code-NOVO`

## Adicionar novo módulo

1. Criar `js/modules/novo-modulo.js`
2. Exportar em `window.NovoModuloModule`
3. Registrar em `app.js` → `renderers`
4. Adicionar aba em `index.html`
5. Adicionar testes

## Debugging

- Ver estado em console: `AppData.state`
- Ver logs de sync: `localStorage.setItem("DEBUG_FIREBASE", "true")`
- Simular offline: `navigator.onLine = false`

---

## Resumo de Priorização

| Tier | Tarefa | Semanas | Risco | Impacto |
|------|--------|---------|-------|--------|
| 1 | Offline recovery test | 1-2 | BAIXO | ⭐⭐⭐⭐⭐ |
| 1 | Dependencies doc | 1-2 | BAIXO | ⭐⭐⭐⭐ |
| 1 | Padroeira validação | 1-2 | BAIXO | ⭐⭐⭐ |
| 2 | Dividir data.js | 3-4 | MÉDIO | ⭐⭐⭐⭐⭐ |
| 2 | Eliminar duplicação | 3-4 | BAIXO | ⭐⭐ |
| 2 | Coverage validator | 3-4 | BAIXO | ⭐⭐⭐ |
| 3 | Retry exponencial | 5-6 | MÉDIO | ⭐⭐⭐⭐ |
| 3 | Heartbeat | 5-6 | MÉDIO | ⭐⭐⭐ |
| 4 | Testes integrados | 7-8 | BAIXO | ⭐⭐⭐⭐ |
| 5 | Documentação | 9 | BAIXO | ⭐⭐⭐ |

---

## GO / NO-GO para Fase 3

✓ **GO SE:**
- Testes offline passarem
- data.js dividido com sucesso
- Nenhum bug novo introduzido

✗ **NO-GO SE:**
- Offline recovery falhar
- Dados forem perdidos
- Performance piorar significativamente

---

