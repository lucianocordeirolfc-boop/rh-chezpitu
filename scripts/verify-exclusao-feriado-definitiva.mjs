/**
 * Validação focada: EXCLUSÃO DEFINITIVA de feriado (tombstone por conteúdo).
 * Homologação temporária — não versionar.
 *
 * Cobre:
 *  - removeCompanyHolidayPermanently: remove o registro + duplicatas (mesmo
 *    nome+data) + vínculos, e cria tombstone de conteúdo;
 *  - não ressuscita via merge do Firebase (outro PC ainda com o feriado);
 *  - não ressuscita via seed 2026 (applyHolidaySeed2026 respeita o tombstone);
 *  - não ressuscita via auto-sync do calendário (syncCompanyHolidaysFromCalendarEntry);
 *  - removeCalendarHolidayPermanently: remove entrada do calendário + tombstone,
 *    e o merge não a traz de volta;
 *  - recriação explícita (addHoliday) limpa o tombstone e o feriado permanece;
 *  - união de holidayTombstones no merge mantém o deletedAt maior.
 *
 * Uso: node scripts/verify-exclusao-feriado-definitiva.mjs
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

function loadAppData() {
  const store = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
    Date, JSON, Math, Object, Array, Set, Map,
    String, Number, parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of ["js/import-utils.js", "js/data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.AppData;
}

const AppData = loadAppData();
const CO = "Chez Pitu";

function resetHolidays(list) {
  AppData.state.companies[CO].holidays = list;
}
function getHolidays() {
  return AppData.state.companies[CO].holidays || [];
}

console.log("\n=== TESTE: exclusão DEFINITIVA de feriado ===\n");

// ── 1. Exclusão remove registro + duplicatas + vínculos, e cria tombstone ────
{
  resetHolidays([
    { id: "h1", name: "Natal", date: "2025-12-25", workedEmployees: [{ employeeId: "e1" }] },
    { id: "h2", name: "Natal", date: "2025-12-25", workedEmployees: [{ employeeId: "e2" }] }, // duplicata
    { id: "h3", name: "Ano Novo", date: "2026-01-01", workedEmployees: [] }
  ]);
  const res = AppData.removeCompanyHolidayPermanently("h1", { company: CO });
  assert(res.ok && res.removed === 2, "Remove o registro e a duplicata de mesmo nome+data (2 registros)");
  const rest = getHolidays();
  assert(!rest.some((h) => h.name === "Natal"), "Nenhum 'Natal' 2025-12-25 permanece (vínculos vão junto)");
  assert(rest.some((h) => h.name === "Ano Novo"), "Outros feriados não são afetados");
  assert(
    AppData.isHolidayTombstoned(CO, "2025-12-25", "Natal"),
    "Tombstone de conteúdo criado para Natal 2025-12-25"
  );
}

// ── 2. Não ressuscita via merge (outro PC ainda tem o feriado) ───────────────
{
  const local = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] } },
    holidayTombstones: { [CO]: { "2025-12-25|natal": 5000 } }
  };
  const remote = {
    companies: {
      [CO]: {
        companyInfo: { legalName: CO },
        holidays: [{ id: "hx", name: "Natal", date: "2025-12-25", workedEmployees: [] }]
      }
    }
  };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const exists = (merged.companies?.[CO]?.holidays || []).some((h) => h.name === "Natal");
  assert(!exists, "Merge: feriado excluído não volta mesmo que o remoto ainda o tenha");
}

// ── 3. Seed 2026 respeita o tombstone (não recria Semana Santa) ──────────────
{
  const target = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] }, Pengold: { companyInfo: { legalName: "Pengold" }, holidays: [] } },
    calendarHolidays: [],
    holidayTombstones: {
      [CO]: { "2026-04-03|semana santa": 5000 },
      __calendar__: { "2026-04-03|semana santa": 5000 }
    }
  };
  const changed = AppData.applyHolidaySeed2026(target);
  const inCompany = (target.companies[CO].holidays || []).some((h) => h.name === "Semana Santa");
  const inCalendar = (target.calendarHolidays || []).some((h) => h.name === "Semana Santa");
  assert(!inCompany, "Seed não recria 'Semana Santa' na empresa tombada");
  assert(!inCalendar, "Seed não recria 'Semana Santa' no calendário tombado");
  assert(changed === true, "Seed ainda opera para os demais feriados (Tiradentes/São Jorge)");
}

// ── 4. Auto-sync do calendário não recria feriado tombado ────────────────────
{
  resetHolidays([]);
  AppData.state.holidayTombstones = { [CO]: { "2026-04-23|sao jorge": 5000 } };
  AppData.syncCompanyHolidaysFromCalendarEntry(
    { name: "São Jorge", date: "2026-04-23", companies: [CO] },
    { save: false }
  );
  assert(
    !getHolidays().some((h) => h.name === "São Jorge"),
    "syncCompanyHolidaysFromCalendarEntry não recria feriado excluído definitivamente"
  );
}

// ── 5. Exclusão definitiva de feriado do CALENDÁRIO + não volta no merge ─────
{
  AppData.state.holidayTombstones = {};
  AppData.state.calendarHolidays = [
    { id: "cal1", name: "Teste Tiradentes", date: "2026-04-21", type: "nacional", companies: ["ambas"] }
  ];
  const res = AppData.removeCalendarHolidayPermanently("cal1");
  assert(res.ok && res.removed === 1, "Remove a entrada do calendário");
  assert(
    AppData.isHolidayTombstoned("__calendar__", "2026-04-21", "Teste Tiradentes"),
    "Tombstone de calendário criado"
  );

  const local = { calendarHolidays: [], holidayTombstones: { __calendar__: { "2026-04-21|teste tiradentes": 6000 } } };
  const remote = { calendarHolidays: [{ id: "cal1", name: "Teste Tiradentes", date: "2026-04-21", companies: ["ambas"] }] };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const exists = (merged.calendarHolidays || []).some((h) => h.name === "Teste Tiradentes");
  assert(!exists, "Merge: feriado de calendário excluído não volta do remoto");
}

// ── 6. Recriação explícita limpa o tombstone e o feriado permanece ───────────
{
  resetHolidays([]);
  AppData.state.holidayTombstones = { [CO]: { "2026-01-01|ano novo": 5000 } };
  AppData.addHoliday({ name: "Ano Novo", date: "2026-01-01", workedEmployees: [] }, { company: CO });
  assert(
    !AppData.isHolidayTombstoned(CO, "2026-01-01", "Ano Novo"),
    "addHoliday limpa o tombstone ao recadastrar o mesmo feriado"
  );
  // Simula um finalize (aplicação dos tombstones) para garantir que não é removido
  AppData.applyHolidayTombstones(AppData.state);
  assert(
    getHolidays().some((h) => h.name === "Ano Novo"),
    "Feriado recadastrado permanece após aplicar os tombstones"
  );
}

// ── 7. União de tombstones no merge mantém o deletedAt maior ─────────────────
{
  const local = { holidayTombstones: { [CO]: { "2026-05-01|dia do trabalho": 1000 } } };
  const remote = { holidayTombstones: { [CO]: { "2026-05-01|dia do trabalho": 9000 } } };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  assert(
    merged.holidayTombstones?.[CO]?.["2026-05-01|dia do trabalho"] === 9000,
    "Merge une holidayTombstones mantendo o deletedAt mais recente"
  );
}

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
