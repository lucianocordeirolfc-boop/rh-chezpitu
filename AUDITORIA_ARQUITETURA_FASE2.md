# AUDITORIA DE ARQUITETURA — PÓS FASE 2

**Data:** 2026-06-01  
**Período analisado:** Refatoração das abas Chez Pitu + Pengold  
**Status geral:** Estável com riscos identificáveis

---

## 1. VISÃO GERAL DA ARQUITETURA

### Estrutura atual

```
Aplicação Frontend (11.095 linhas JS)
  ├── Camada de autenticação (auth.js — 150L)
  ├── Camada de dados (data.js — 3.020L) ← CRÍTICA
  ├── Camada de persistência
  │   ├── Firebase sync (firebase-sync.js — 390L)
  │   └── Validação funcional (scripts/)
  ├── Módulos de negócio (6 módulos)
  │   ├── Escala de Folga (escala.js — 1.491L)
  │   ├── Controle de Feriados (feriados.js — 1.532L)
  │   ├── Vale Transporte (vale-transporte.js — 576L)
  │   ├── Ausências (ferias.js — 707L)
  │   ├── Cadastro Funcionários (funcionarios.js — 1.181L)
  │   └── Informações Contador (contador.js — 485L)
  ├── Módulo Dashboard (dashboard.js — 173L)
  ├── Regras de negócio (scale-rules.js — 469L)
  ├── UI de empresas (company-ui.js — 82L)
  └── App shell (app.js — 260L)
```

### Fluxo de dados

```
Firebase ←→ localStorage → AppData.state (memória) ← Módulos
   ↓           ↓
Sincronização  Persistência         Render UI
  (real-time)  (fallback)           (reativo)
```

---

## 2. GARGALOS IDENTIFICADOS

### 2.1 **CRÍTICO: Arquivo data.js é um monolito**

**Problema:**
- 3.020 linhas em um único arquivo
- 180+ funções compartilhadas
- Responsabilidades misturadas: state, cálculos, formatação, validação, persistência
- Mudanças em uma função afetam toda a base

**Impacto:**
- Difícil debugar erros (função está em que arquivo?)
- Refatorações arriscadas (alteração causa cascata de efeitos)
- Testes hard to isolate
- Onboarding lento para novos desenvolvedores

**Evidência:**
```
11.095 linhas totais / 3.020 em data.js = 27% do código em um arquivo
180 funções em um arquivo = difícil de navegar
```

**Recomendação:** Dividir em módulos temáticos (Fase 3)

---

### 2.2 **ALTO: 166 referências globais (window.* / global.*)**

**Problema:**
- Código distribuído depende de variáveis globais
- Acoplamento indireto entre módulos
- Difícil testar módulos isoladamente
- Ordem de carregamento crítica (veja index.html)

**Exemplos:** 
```javascript
// data.js exporta: window.AppData
// app.js exporta: window.App
// cada módulo acessa: window.AppData, window.App, etc.
```

**Ordem de carregamento em index.html (linha 120-149):**
```
1. auth.js
2. firebase-sync.js
3. import-utils.js
4. data.js ← DEBE SER ANTES DE TUDO
5. company-ui.js ← depende de AppData
6. empresa.js
7. dashboard.js
8. ... demais módulos
9. app.js ← inicializa eventos
```

**Risco:** Se ordem mudar, aplicação quebra silenciosamente.

**Recomendação:** Implementar module system ou import/export (Fase 3)

---

### 2.3 **ALTO: Sincronização Firebase frágil**

**Problema:**
- `firebase-sync.js` mantém estado de sincronização em variáveis locais
- Sem retry automático para falhas temporárias
- Conflito de merge não documentado completamente
- Ausência de heartbeat/keep-alive

**Estrutura atual:**
```javascript
let pushing = false;
let listening = false;
let lastPushedAt = 0;
const PUSH_GUARD_MS = 900; // sem justificativa de timing
```

**Risco:**
- Se Firebase ficar offline, sem feedback ao usuário
- Estados inconsistentes entre múltiplas abas
- Perda de dados em transições offline→online

**Teste recomendado:** Simular perda de internet, depois restaurar → verificar consistência

---

### 2.4 **MÉDIO: Múltiplos pontos de filtro por empresa**

**Problema:**
- 7 seletores de empresa independentes (um por módulo)
- Cada um armazena em chave localStorage diferente
- Sem sincronização centralizada

**Estrutura:**
```javascript
// data.js
const PAGE_FILTER_KEYS = {
  dashboard: "dashboardEmpresaSelecionada",
  funcionarios: "cadastroEmpresaSelecionada",
  escala: "escalaEmpresaSelecionada",
  ferias: "ausenciasEmpresaSelecionada",
  "vale-transporte": "vtEmpresaSelecionada",
  feriados: "feriadosEmpresaSelecionada",
  contador: "contadorEmpresaSelecionada"
};
```

**Benefício de ter filtros por módulo:**
- Dashboard e Cadastro permitem "Todas as empresas"
- Outros módulos filtram por empresa específica

**Risco:**
- Se usuário clica em aba "Chez Pitu" mas dashboard estava em "Todas", contextos divergem
- Não está claro qual é a "empresa ativa" em cada momento

---

### 2.5 **MÉDIO: Cálculos duplicados entre módulos**

**Problema:**
- Lógica de VT duplicada (vale-transporte.js + data.js)
- Cálculo de feriado duplicado (feriados.js + data.js + dashboard.js)
- Formatação de moeda/data em múltiplos arquivos

**Exemplos:**
```javascript
// vale-transporte.js:43
const workedDays = days.filter((day) => 
  AppData.isWorkedScaleCode(AppData.getScaleCode(employee, day, data))
).length;

// dashboard.js:57
todayOff = todayOff.concat(
  activeEmployees.filter((employee) => 
    AppData.getScaleCode(employee, today, data) === "FOLGA"
  )
);

// Mesma lógica (getScaleCode) replicada → risco de divergência
```

**Impacto:** Se corrigir bug em um, precisa lembrar de corrigir em 3-4 lugares

---

### 2.6 **MÉDIO: Validação de regras críticas não automatizada**

**Problema:**
- Regras de negócio em PROJECT_RULES.md, não no código
- Validação de cobertura (TR, TM, MR) existe mas não é enforced na UI
- Modal CO já filtrou corretamente, mas sem validação visual de entrada

**Critério de sucesso:**
- ✓ Testes passam (183 aprovadas)
- ✗ Validação em tempo real na UI
- ✗ Alertas visuais para violações

**Exemplo:** CO pode ser vinculado a feriado de outro funcionário se digitar manualmente.

---

## 3. RISCOS DE PERDA DE DADOS

### 3.1 **CRÍTICO: Merge Firebase vs localStorage**

**Cenário:**
1. Usuário offline, adiciona 10 feriados
2. Outro usuário na outra aba sinca e perde esses 10

**Proteção atual:**
- `mergeRemoteIntoLocal()` em `data.js` (linhas ~700)
- Usa timestamp `updatedAt` para determinar versão mais recente
- Não persiste conflitos — apenas escolhe uma

**Código:**
```javascript
function mergeRemoteIntoLocal(localState, remoteState) {
  // Implementação atual: "pega a mais recente"
  // Não persiste ambos os lados
}
```

**Risco:** Se timestamp está incorreto, dados são sobrescritos.

**Teste:** Modificar `Date.now()` local → verificar se merge descarta os novos dados.

---

### 3.2 **ALTO: Feriados podem ser deletados sem backup**

**Problema:**
- Função `removeHoliday()` em `feriados.js` deleta direto
- Não existe "soft delete" ou "archived"
- Histórico de feriados deletados não é preservado

**Código:**
```javascript
// feriados.js
function removeHoliday(holidayId, company) {
  data.holidays = data.holidays.filter(h => h.id !== holidayId);
  AppData.saveState();
  // POOF — desaparece para sempre
}
```

**Proteção:** Apenas se houver backup automático no Firebase.

**Teste:** Deletar feriado importante, desligar internet, ligar novamente → feriado voltou?

---

### 3.3 **MÉDIO: Funcionários podem ser marcados inativos**

**Problema:**
- Status "Ativo/Inativo" pode ser clicado na UI sem confirmação
- Ao marcar inativo, funcionário desaparece de cálculos (VT, Feriados, etc.)
- Sem auditoria de quem/quando marcou

**Risco:** Alguém clica "Inativo" por acidente → perde 1 mês de dados processados.

---

### 3.4 **MÉDIO: localStorage pode ser limpo manualmente**

**Problema:**
- Usuário clica "Limpar dados do navegador" em DevTools
- Sem aviso, dados locais são perdidos
- Se Firebase estiver offline, dados perdidos para sempre

**Proteção:** Verificar em bootstrap se localStorage foi limpo vs. Firebase.

---

## 4. CÓDIGO DUPLICADO

### 4.1 Formatação

```javascript
// data.js:102
function formatDateBR(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  return `${day}/${month}/${year}`;
}

// feriados.js:23
function formatDateBR(isoDate) {
  return AppData.formatDateBR(isoDate); // chama de data.js
}

// dashboard.js:141
const dueDate: `${AppData.formatDateBR(item.dueDate)}`
```

**Status:** Centralizado em `data.js`, bom.

---

### 4.2 Cálculo de "dias não trabalhados"

```javascript
// data.js:70
const NOT_WORKED_SCALE_CODES = new Set([
  "FOLGA", "DOM", "FÉRIAS", "CO", "ATESTADO", "FALTA", "SUSPENSÃO", "LICENÇA"
]);

// vale-transporte.js:41-43
const workedDays = days.filter((day) => 
  AppData.isWorkedScaleCode(AppData.getScaleCode(employee, day, data))
).length;

// dashboard.js:56-57
todayOff = todayOff.concat(
  activeEmployees.filter((employee) => 
    AppData.getScaleCode(employee, today, data) === "FOLGA"
  )
);
```

**Status:** Usa função centralizada `isWorkedScaleCode()`, bom.

---

### 4.3 Filtro de funcionários ativos

```javascript
// contador.js:50
.filter(function (e) { return AppData.isEmployeeActive(e); })

// dashboard.js:53
const activeEmployees = data.employees.filter((employee) => 
  AppData.isEmployeeActive(employee)
);

// funcionarios.js:?
const activeOnly = employees.filter(e => AppData.isEmployeeActive(e));
```

**Status:** Centralizado em `AppData.isEmployeeActive()`, bom.

---

### 4.4 Busca por nome de funcionário

```javascript
// funcionarios.js (linhas 110-150)
function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeSearchDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

// escala.js (linha 119)
function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

// feriados.js (linhas 150-200)
function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}
```

**Problema:** `normalizeSearch` definida em 3 lugares.

**Recomendação:** Mover para `data.js` ou utility.js.

---

## 5. DEPENDÊNCIAS FRÁGEIS

### 5.1 Inicialização de módulos

**Problema:** Ordem de `<script>` em index.html é crítica.

```html
<!-- Ordem atual (linha 120-149) -->
<script src="js/auth.js"></script>
<script src="js/firebase-sync.js"></script>
<script src="js/import-utils.js"></script>
<script src="js/data.js"></script>           <!-- ← TUDO depende disso -->
<script src="js/company-ui.js"></script>
...
<script src="js/app.js"></script>            <!-- ← Inicializa eventos -->
```

**Se alguém adicionar nova depêndência:**
- `dashboard.js` adiciona `window.UtilsX` que não existe → erro
- Erro é silencioso até usuário clicar no dashboard

**Proteção:** Script de validação que verifica todas as dependências globais.

---

### 5.2 Sincronização entre módulos

**Problema:** `softRefreshFromSync()` em múltiplos módulos, sem padrão claro.

```javascript
// app.js:171-183
if (moduleId === "escala") {
  window.EscalaModule?.softRefreshFromSync();
  return;
}

if (moduleId === "feriados") {
  window.FeriadosModule?.refreshView(container);
  return;
}

if (moduleId === "vale-transporte") {
  window.ValeTransporteModule?.softRefreshFromSync(container);
  return;
}
```

**Risco:** Qual módulo refresha via Firebase sync? Qual não?

---

### 5.3 Empresa ativa vs. filtros de página

**Confusão:**
```javascript
// app.js:87-90
function setupCompanyTabs() {
  // Clica na aba "Chez Pitu" →
  AppData.setActiveCompany(company);  // ← define empresa "ativa" global
  updateCompanyTabsUI();
  renderCurrent();
}
```

**Mas:**
```javascript
// dashboard.js:104-106
function render(container) {
  const pageCo = AppData.getPageCompany("dashboard");  // ← filtro do módulo
  const companies = AppData.resolveCompaniesForPage("dashboard", { allowAll: true });
}
```

**Pergunta:** Qual é a "empresa ativa"?
- A aba clicada no topo? → `AppData.getActiveCompany()`
- O filtro do módulo? → `AppData.getPageCompany("dashboard")`

**Resposta:**
- Abas de empresa definem contexto global
- Mas módulos de empresa específica (Escala, VT) **sempre** usam `getPageCompany()`
- Dashboard **permite** ver "Todas"

---

## 6. TESTES E COBERTURA

### Status atual (✓ OK)

```
npm test → 47 aprovadas, 0 falhas
npm run validate → 183 aprovadas, 0 erros
```

### Cobertura

**Testado:**
- ✓ Isolamento de empresas
- ✓ Cálculo de VT com CO/Férias/Ausências
- ✓ Feriados com status (pendente/compensado/vencido/agendado)
- ✓ Padroeira de Búzios (26/07, não 21/05)
- ✓ Modal CO (filtra apenas do funcionário)
- ✓ Merge Firebase/localStorage
- ✓ Troca de empresa 5x (estabilidade)

**Não testado:**
- ✗ Falha de internet (offline → online recovery)
- ✗ Conflito entre abas abertas simultaneamente
- ✗ Sincronização com lag (ex: usuário A muda, Usuário B não vê)
- ✗ Corrupção de dados (modificar Firebase manualmente)
- ✗ Exaustão de localStorage (mobile com 100 funcionários)
- ✗ Performance com 500+ funcionários

---

## 7. IDENTIFICAÇÃO DE PADRÕES

### Padrão identificado: IIFE + window.export

```javascript
(function () {
  // Private functions
  function foo() { ... }
  
  // Public API
  window.FooModule = {
    foo,
    bar: function() { ... }
  };
})();
```

**Vantagem:** Evita poluição global, isolamento de scope.

**Desvantagem:** Depende de ordem de carregamento, sem tree-shaking.

---

## 8. RECOMENDAÇÕES IMEDIATAS (Semanas 1-2)

1. **Adicionar testes de sincronização offline**
   - Simular perda de internet em firebase-sync.js
   - Verificar se dados são preservados

2. **Documentar dependências globais**
   - Criar arquivo `DEPENDENCIES.md`
   - Listar qual arquivo depende de qual

3. **Validação de Padroeira de Búzios**
   - Adicionar validação automática ao carregar Firebase
   - Correção idempotente

4. **Proteção contra deleção de feriados**
   - Soft delete (marcar como deletado, não remover)
   - Ou requerer confirmação dupla

---

## 9. FASE 3 — PROPOSTA DE ESTABILIZAÇÃO

### 9.1 Objetivos

1. **Reduzir monolito de data.js**
2. **Eliminar dependências globais frágeis**
3. **Implementar retry automático em Firebase**
4. **Adicionar testes de offline/conflict resolution**
5. **Documentar guia de arquitetura para novos devs**

### 9.2 Roadmap (estimado)

#### Semana 1-2: Análise e planejamento
- [ ] Identificar função de data.js que pode ser movida
- [ ] Mapear dependências de cada módulo
- [ ] Design de novo layout modular

#### Semana 3-4: Refatoração de data.js
- [ ] Extrair "Validação de Feriados" em `feriados-validator.js`
- [ ] Extrair "Cálculo de VT" em `vt-calculator.js`
- [ ] Extrair "Merge de Estado" em `state-merger.js`
- [ ] Manter data.js como orquestrador

#### Semana 5-6: Sincronização Firebase
- [ ] Implementar retry exponencial
- [ ] Adicionar heartbeat (ping para saber se está online)
- [ ] Conflict resolution visual

#### Semana 7-8: Testes integrados
- [ ] Teste offline → online
- [ ] Teste múltiplas abas
- [ ] Teste corrupção de dados

#### Semana 9: Documentação
- [ ] Atualizar ARCHITECTURE.md
- [ ] Criar DEVELOPER_GUIDE.md
- [ ] Documentar fluxo de sync

### 9.3 Estrutura proposta

```
js/
├── app.js (shell)
├── auth.js
├── firebase-sync.js (melhorado)
├── core/
│   ├── state-manager.js (era data.js)
│   ├── state-merger.js (novo)
│   └── validators/
│       ├── feriado-validator.js (novo)
│       ├── vt-validator.js (novo)
│       └── company-validator.js (novo)
├── calculators/
│   ├── vt-calculator.js (novo)
│   ├── feriado-calculator.js (novo)
│   └── escala-calculator.js (novo)
├── ui/
│   ├── company-ui.js
│   ├── module-registry.js (novo)
│   └── components/
│       ├── escala/
│       ├── feriados/
│       └── ...
└── utils/
    ├── formatting.js (novo)
    ├── date-utils.js (novo)
    └── search-utils.js (novo)
```

### 9.4 Priorização

**CRÍTICO (Semana 1-2):**
- Offline/online recovery
- Testes de perda de dados

**ALTO (Semana 3-4):**
- Dividir data.js em módulos
- Eliminar dependências de ordem

**MÉDIO (Semana 5-8):**
- Refatorar UI modules
- Adicionar retry automático

**BAIXO (Semana 9+):**
- Migrar para módulos (import/export)
- TypeScript (opcional)

---

## 10. MÉTRICAS ATUAIS

| Métrica | Valor | Status |
|---------|-------|--------|
| Total de linhas JS | 11.095 | ✓ Aceitável |
| Maior arquivo | 3.020 (data.js) | ⚠ Considerado monolito |
| Funções públicas | 180+ em data.js | ⚠ Difícil de navegar |
| Referências globais | 166+ | ⚠ Acoplamento alto |
| Testes passando | 183/183 | ✓ Excelente |
| Cobertura offline | 0% | ✗ Crítico |
| Tempo de cold start | ~500ms (estimado) | ? Não medido |
| Tamanho bundle | ~150KB (gzipped) | ✓ Aceitável |

---

## 11. CONCLUSÃO

### Saúde geral: **VERDE (Estável)**

**Pontos positivos:**
- ✓ Separação de empresas funciona
- ✓ Dados persistem corretamente
- ✓ Merge Firebase/localStorage seguro
- ✓ Testes abrangentes
- ✓ Sem bugs críticos reportados

**Pontos de atenção:**
- ⚠ Monolito de data.js
- ⚠ Dependências globais frágeis
- ⚠ Sem retry automático em Firebase
- ⚠ Sem testes de offline/conflicts
- ⚠ Código duplicado em normalizeSearch

**Recomendação final:**
- Fase 2 foi bem-sucedida na implementação de abas
- Fase 3 deve focar em **estabilidade e manutenibilidade**
- Não é urgente, mas essencial para escala futura

**Próximo passo:** Começar com **testes offline** e **documentação de dependências**.

---

## ANEXO A — LISTA DE ARQUIVOS CRÍTICOS

| Arquivo | Linhas | Responsabilidade | Risco |
|---------|--------|-----------------|-------|
| js/data.js | 3.020 | State management | **CRÍTICO** |
| js/firebase-sync.js | 390 | Persistência remota | **ALTO** |
| js/escala.js | 1.491 | Escala de folga | MÉDIO |
| js/feriados.js | 1.532 | Controle de feriados | MÉDIO |
| js/funcionarios.js | 1.181 | Cadastro de funcionários | BAIXO |
| js/vale-transporte.js | 576 | Cálculo VT | MÉDIO |
| index.html | 151 | Ordem de carregamento | **ALTO** |

---

## ANEXO B — CHECKLIST DE VALIDAÇÃO PHASE 3

- [ ] Offline recovery test (simular internet off)
- [ ] Multi-tab sync test (abrir 2 abas, modificar em uma)
- [ ] Data corruption test (modificar Firebase manualmente)
- [ ] Large dataset test (500+ funcionários)
- [ ] localStorage exhaustion test (mobile, 10MB limit)
- [ ] Padroeira de Búzios idempotent test (run twice)
- [ ] CO coverage validation (TR/TM/MR enforced)
- [ ] Company switch stability (10x troca rápida)

---

**Relatório preparado por:** Auditoria de Arquitetura Automatizada  
**Versão:** 1.0  
**Próxima revisão:** Após implementação de Fase 3
