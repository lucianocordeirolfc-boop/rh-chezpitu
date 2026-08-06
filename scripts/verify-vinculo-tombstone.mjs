/**
 * Validação focada: EXCLUSÃO DEFINITIVA de VÍNCULO (workedEmployee) e o
 * transporte ANINHADO dos tombstones no nó "tombstones" do Firebase.
 * Homologação temporária — não versionar.
 *
 * Cobre:
 *  - removeWorkedEmployeeFromHoliday grava o tombstone de vínculo;
 *  - applyWorkedLinkTombstones remove o vínculo tombado;
 *  - o merge (união) NÃO ressuscita o vínculo removido, mesmo que o remoto o tenha;
 *  - addManualWorkedEmployee limpa o tombstone (revínculo explícito permanece);
 *  - round-trip Firebase: stateToFirebase aninha __holidayTombstones/
 *    __workedLinkTombstones dentro de "tombstones" (sem novo nó de topo) e
 *    firebaseToState os extrai de volta, mantendo os tombstones por id intactos.
 *
 * Uso: node scripts/verify-vinculo-tombstone.mjs
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ FALHOU: ${msg}`); }
}

function makeSandbox(files) {
  const store = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
    Date, JSON, Math, Object, Array, Set, Map, String, Number,
    parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const sandbox = makeSandbox(["js/import-utils.js", "js/data.js", "js/firebase-sync.js"]);
const AppData = sandbox.AppData;
const FirebaseSync = sandbox.FirebaseSync;
const CO = "Chez Pitu";

console.log("\n=== TESTE: exclusão DEFINITIVA de vínculo + Firebase aninhado ===\n");

// ── 1. removeWorkedEmployeeFromHoliday grava tombstone e remove o vínculo ─────
{
  AppData.state.companies[CO].holidays = [
    { id: "hA", name: "Sexta-Feira Santa", date: "2026-04-03",
      workedEmployees: [{ employeeId: "e1", origin: "Automático pela escala", autoCreated: true },
                        { employeeId: "e2" }] }
  ];
  const ok = AppData.removeWorkedEmployeeFromHoliday("hA", "e1", { company: CO });
  const h = AppData.getCompanyData(CO).holidays.find((x) => x.id === "hA");
  assert(ok === true, "removeWorkedEmployeeFromHoliday retorna true");
  assert(!h.workedEmployees.some((w) => w.employeeId === "e1"), "vínculo de e1 removido");
  assert(
    AppData.isWorkedLinkTombstoned(CO, "2026-04-03", "Sexta-Feira Santa", "e1"),
    "tombstone de vínculo criado para e1"
  );
  assert(
    !AppData.isWorkedLinkTombstoned(CO, "2026-04-03", "Sexta-Feira Santa", "e2"),
    "e2 não é afetado"
  );
}

// ── 2. applyWorkedLinkTombstones remove o vínculo mesmo se reaparecer ─────────
{
  const h = AppData.getCompanyData(CO).holidays.find((x) => x.id === "hA");
  h.workedEmployees.push({ employeeId: "e1", origin: "Automático pela escala" }); // simula auto-vínculo
  AppData.applyWorkedLinkTombstones(AppData.state);
  const h2 = AppData.getCompanyData(CO).holidays.find((x) => x.id === "hA");
  assert(!h2.workedEmployees.some((w) => w.employeeId === "e1"), "applyWorkedLinkTombstones remove o vínculo ressuscitado");
}

// ── 3. Merge (união) NÃO ressuscita o vínculo removido ───────────────────────
{
  const local = {
    companies: { [CO]: { companyInfo: { legalName: CO },
      holidays: [{ id: "hA", name: "Sexta-Feira Santa", date: "2026-04-03", workedEmployees: [] }] } },
    workedLinkTombstones: { [CO]: { "2026-04-03|sexta-feira santa|e1": 5000 } }
  };
  const remote = {
    companies: { [CO]: { companyInfo: { legalName: CO },
      holidays: [{ id: "hA", name: "Sexta-Feira Santa", date: "2026-04-03",
        workedEmployees: [{ employeeId: "e1", origin: "Automático pela escala" }] }] } }
  };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const h = (merged.companies[CO].holidays || []).find((x) => x.date === "2026-04-03");
  assert(h && !h.workedEmployees.some((w) => w.employeeId === "e1"),
    "Merge: vínculo excluído não volta mesmo que o remoto o tenha");
  assert(merged.workedLinkTombstones?.[CO]?.["2026-04-03|sexta-feira santa|e1"] === 5000,
    "Merge une workedLinkTombstones");
}

// ── 4. addManualWorkedEmployee limpa o tombstone (revínculo permanece) ────────
{
  AppData.state.companies[CO].holidays = [
    { id: "hB", name: "Sexta-Feira Santa", date: "2026-04-03", workedEmployees: [] }
  ];
  AppData.state.companies[CO].employees = [{ id: "e1", name: "CINTHIA", status: "Ativo" }];
  AppData.state.workedLinkTombstones = { [CO]: { "2026-04-03|sexta-feira santa|e1": 5000 } };
  const res = AppData.addManualWorkedEmployee("hB", "e1", { company: CO });
  assert(res.ok === true, "addManualWorkedEmployee revincula com sucesso");
  assert(!AppData.isWorkedLinkTombstoned(CO, "2026-04-03", "Sexta-Feira Santa", "e1"),
    "tombstone de vínculo é limpo ao revincular");
  AppData.applyWorkedLinkTombstones(AppData.state);
  const h = AppData.getCompanyData(CO).holidays.find((x) => x.id === "hB");
  assert(h.workedEmployees.some((w) => w.employeeId === "e1"), "vínculo recadastrado permanece");
}

// ── 5. Round-trip Firebase: aninhado em "tombstones", sem novo nó de topo ─────
{
  const st = {
    companies: { [CO]: { companyInfo: { legalName: CO }, employees: [], holidays: [], vacations: [], absences: [], manualScale: {}, contadorLancamentos: {} } },
    calendarHolidays: [],
    tombstones: { employees: { [CO]: { emp9: 111 } }, vacations: {}, absences: {} },
    holidayTombstones: { [CO]: { "2025-12-25|natal": 222 } },
    workedLinkTombstones: { [CO]: { "2026-04-03|sexta-feira santa|e1": 333 } },
    valeTransporte: { deductionDays: {}, discountValues: {} },
    auditLog: []
  };
  const fb = FirebaseSync.stateToFirebase(st);
  assert(fb.tombstones && fb.tombstones.__holidayTombstones && fb.tombstones.__workedLinkTombstones,
    "stateToFirebase aninha __holidayTombstones e __workedLinkTombstones em tombstones");
  assert(fb.holidayTombstones === undefined && fb.workedLinkTombstones === undefined,
    "stateToFirebase NÃO cria nó de topo novo (evita regra nova do RTDB)");
  assert(fb.tombstones.employees && fb.tombstones.employees[CO]?.emp9 === 111,
    "tombstones por id continuam no nó tombstones");

  const back = FirebaseSync.firebaseToState(fb);
  assert(back.holidayTombstones?.[CO]?.["2025-12-25|natal"] === 222,
    "firebaseToState extrai holidayTombstones");
  assert(back.workedLinkTombstones?.[CO]?.["2026-04-03|sexta-feira santa|e1"] === 333,
    "firebaseToState extrai workedLinkTombstones");
  assert(back.tombstones.employees?.[CO]?.emp9 === 111 &&
    !("__holidayTombstones" in back.tombstones) && !("__workedLinkTombstones" in back.tombstones),
    "firebaseToState devolve tombstones por id SEM as chaves aninhadas");
}

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
