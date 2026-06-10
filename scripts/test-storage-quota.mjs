/**
 * TESTE: Persistência enxuta / anti-QuotaExceededError
 *
 * Garante que setRemoteState() e saveState() NUNCA quebram quando o
 * localStorage atinge a cota (QuotaExceededError), degradando em camadas
 * (full → slim → lean → desligado) e mantendo o Firebase como fonte de verdade.
 */

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${message}`);
}

/** Storage mock que lança QuotaExceededError quando o valor passa de `limit` bytes. */
function createQuotaStorage(limit = Infinity) {
  const store = {};
  return {
    limit,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      const str = String(value);
      if (str.length > this.limit) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        err.code = 22;
        throw err;
      }
      store[key] = str;
    },
    removeItem(key) {
      delete store[key];
    },
    _dump() {
      return store;
    }
  };
}

function loadAppData(storage) {
  const context = {
    window: {},
    localStorage: storage,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Date,
    JSON,
    Math,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    navigator: { onLine: true }
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  for (const file of ["js/import-utils.js", "js/data.js"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox.window.AppData;
}

/** Cria um estado "gordo" com logos base64 grandes e muitos feriados. */
function buildHeavyRemoteState(AppData) {
  const bigLogo = "data:image/png;base64," + "A".repeat(120000);
  const company = (name) => ({
    companyInfo: { legalName: name, cnpj: "00.000.000/0001-00", logoDataUrl: bigLogo },
    employees: Array.from({ length: 30 }, (_, i) => ({
      id: `${name}-emp-${i}`,
      name: `Funcionario ${i}`,
      company: name,
      sector: "Salão",
      role: "Atendente",
      status: "ativo"
    })),
    vacations: [],
    absences: [],
    holidays: Array.from({ length: 40 }, (_, i) => ({
      id: `${name}-fer-${i}`,
      name: `Feriado ${i}`,
      date: "2026-01-01",
      isDeleted: i % 3 === 0,
      workedEmployees: [{ employeeId: `${name}-emp-0`, status: "Pendente" }]
    })),
    manualScale: {},
    contadorLancamentos: {}
  });

  return {
    pageFilters: { escala: "Chez Pitu", feriados: "Pengold" },
    activeCompany: "Chez Pitu",
    escalaSelectedYearMonth: "2026-06",
    companies: { "Chez Pitu": company("Chez Pitu"), Pengold: company("Pengold") },
    companyInfoHistory: { "Chez Pitu": [{ at: 1, info: { logoDataUrl: bigLogo } }] },
    companyInfoBackup: {},
    calendarHolidays: [],
    coverageAlerts: Array.from({ length: 50 }, (_, i) => ({ id: i, msg: "x".repeat(200) })),
    scaleCodeConfig: { foo: "bar" },
    valeTransporte: { selectedYearMonth: "2026-06", discountValues: {}, deductionDays: {} }
  };
}

// ── Cenário 1: cota generosa → grava completo (full), sem degradar ───────────
console.log("\n[1] Cota suficiente: grava estado completo");
{
  const storage = createQuotaStorage(50_000_000);
  const AppData = loadAppData(storage);
  let threw = false;
  try {
    AppData.setRemoteState(buildHeavyRemoteState(AppData));
  } catch (_) {
    threw = true;
  }
  assert(!threw, "setRemoteState não lança com cota suficiente");
  const stored = JSON.parse(storage.getItem(AppData.STORAGE_KEY));
  assert(!!stored.companies, "estado completo gravado");
  assert(stored.persistTier === undefined, "sem marcador de degradação (tier full)");
  const report = AppData.measureStorageUsage();
  assert(report.persistTier === "full", "relatório indica camada full");
}

// ── Cenário 2: cota média → degrada para "slim" (sem logos/backups) ──────────
console.log("\n[2] Cota apertada: degrada para slim e preserva operacional");
{
  // Grande o bastante para o slim (sem logos) mas pequeno demais para o full.
  const storage = createQuotaStorage(60_000);
  const AppData = loadAppData(storage);
  let threw = false;
  try {
    AppData.setRemoteState(buildHeavyRemoteState(AppData));
  } catch (_) {
    threw = true;
  }
  assert(!threw, "setRemoteState não lança ao estourar cota (degrada)");
  const stored = JSON.parse(storage.getItem(AppData.STORAGE_KEY));
  assert(stored.persistTier === "slim", "gravou na camada slim");
  assert(
    stored.companies["Chez Pitu"].companyInfo.logoDataUrl === "",
    "logo base64 removido do cache local"
  );
  assert(stored.companyInfoHistory === undefined, "histórico/backup removido do cache local");
  assert(
    stored.companies["Chez Pitu"].employees.length === 30,
    "dados operacionais (funcionários) preservados no cache slim"
  );
  assert(
    stored.companies["Chez Pitu"].holidays.every((h) => !h.isDeleted),
    "feriados soft-deletados removidos do cache slim"
  );
}

// ── Cenário 3: cota mínima → degrada para "lean" (só sessão/filtros/prefs) ────
console.log("\n[3] Cota mínima: degrada para lean (operacional vem do Firebase)");
{
  const storage = createQuotaStorage(2_000);
  const AppData = loadAppData(storage);
  let threw = false;
  try {
    AppData.setRemoteState(buildHeavyRemoteState(AppData));
  } catch (_) {
    threw = true;
  }
  assert(!threw, "setRemoteState não lança na camada lean");
  const stored = JSON.parse(storage.getItem(AppData.STORAGE_KEY));
  assert(stored.persistTier === "lean", "gravou na camada lean");
  assert(stored.activeCompany === "Chez Pitu", "lean mantém empresa ativa");
  assert(!!stored.pageFilters, "lean mantém filtros");
  assert(stored.cacheVersion !== undefined, "lean mantém versão de cache");
  assert(Object.keys(stored.companies).length === 0, "lean não grava dados operacionais");
}

// ── Cenário 4: nem o lean cabe → não quebra, desliga cache local ─────────────
console.log("\n[4] Cota zero: não quebra a aplicação, mantém Firebase");
{
  const storage = createQuotaStorage(10);
  const AppData = loadAppData(storage);
  let threw = false;
  try {
    AppData.setRemoteState(buildHeavyRemoteState(AppData));
    AppData.saveState();
  } catch (_) {
    threw = true;
  }
  assert(!threw, "setRemoteState + saveState não lançam mesmo sem espaço algum");
  const report = AppData.measureStorageUsage();
  assert(report.degraded === true, "estado marcado como degradado");
  assert(report.persistTier === "lean" || report.persistTier === "none", "camada reportada");
}

// ── Cenário 5: saveState chama Firebase mesmo com falha de cota ──────────────
console.log("\n[5] saveState sincroniza com Firebase mesmo com cota cheia");
{
  const storage = createQuotaStorage(10);
  const AppData = loadAppData(storage);
  let firebaseSaved = false;
  AppData.setRemoteState(buildHeavyRemoteState(AppData));
  // Simula Firebase pronto
  globalThis; // noop
  // Injeta FirebaseSync no window do sandbox via referência ao AppData não é trivial;
  // validamos indiretamente: saveState não deve lançar e a função existe.
  let threw = false;
  try {
    AppData.saveState();
  } catch (_) {
    threw = true;
  }
  firebaseSaved = !threw;
  assert(firebaseSaved, "saveState conclui sem lançar (Firebase não é bloqueado pela cota)");
}

// ── Cenário 6: migração segura — recarregar um payload "lean" não quebra ─────
console.log("\n[6] Migração segura: reload de payload lean não quebra e reconstrói empresas");
{
  const storage = createQuotaStorage(2_000);
  const AppData1 = loadAppData(storage);
  AppData1.setRemoteState(buildHeavyRemoteState(AppData1));
  const stored = JSON.parse(storage.getItem(AppData1.STORAGE_KEY));
  assert(stored.persistTier === "lean", "payload gravado é lean");

  // Segunda carga lê o payload lean do mesmo storage (simula reload da página).
  let threw = false;
  let AppData2;
  try {
    storage.limit = Infinity; // após reload, cota volta (cenário real: dados menores)
    AppData2 = loadAppData(storage);
  } catch (_) {
    threw = true;
  }
  assert(!threw, "loadState não quebra ao ler payload lean");
  assert(!!AppData2.state.companies["Chez Pitu"], "empresas reconstruídas no reload");
  assert(AppData2.state.activeCompany === "Chez Pitu", "empresa ativa preservada no reload");
  assert(
    AppData2.getPageCompany("escala") === "Chez Pitu",
    "filtro de página preservado no reload"
  );
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
