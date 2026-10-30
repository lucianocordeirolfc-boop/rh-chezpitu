/**
 * Validação focada: feriado cadastrado NÃO se exclui (REGRA FIXA 2026-10-30)
 * e as exclusões antigas (tombstones por conteúdo já gravados) continuam valendo.
 *
 * Cobre:
 *  - removeCompanyHolidayPermanently / removeCalendarHolidayPermanently /
 *    removeHolidayEverywhere / removeHoliday recusam e não tocam em nada
 *    (feriado, duplicata, vínculos, calendário, tombstones);
 *  - não ressuscita via merge do Firebase (outro PC ainda com o feriado);
 *  - não ressuscita via seed 2026 (applyHolidaySeed2026 respeita o tombstone);
 *  - não ressuscita via auto-sync do calendário (syncCompanyHolidaysFromCalendarEntry);
 *  - tombstone antigo de calendário: o merge não traz a entrada de volta;
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

// ── 1. Nenhuma função de exclusão de feriado apaga nada ──────────────────────
{
  resetHolidays([
    { id: "h1", name: "Natal", date: "2025-12-25", workedEmployees: [{ employeeId: "e1" }] },
    { id: "h2", name: "Natal", date: "2025-12-25", workedEmployees: [{ employeeId: "e2" }] }, // duplicata
    { id: "h3", name: "Ano Novo", date: "2026-01-01", workedEmployees: [] }
  ]);
  AppData.state.calendarHolidays = [
    { id: "cal1", name: "Natal", date: "2025-12-25", type: "nacional", companies: ["ambas"] }
  ];
  AppData.state.holidayTombstones = {};
  const before = JSON.stringify({ h: getHolidays(), c: AppData.state.calendarHolidays });

  const r1 = AppData.removeCompanyHolidayPermanently("h1", { company: CO });
  const r2 = AppData.removeCalendarHolidayPermanently("cal1");
  const r3 = AppData.removeHolidayEverywhere("2025-12-25", "Natal", { companies: [CO] });
  const r4 = AppData.removeHoliday("h3", { company: CO });
  assert(r1.ok === false && r1.blocked === true, "removeCompanyHolidayPermanently recusa (bloqueado)");
  assert(r2.ok === false && r2.blocked === true, "removeCalendarHolidayPermanently recusa (bloqueado)");
  assert(r3.ok === false && r3.blocked === true && /Excluir vínculo/.test(r3.error),
    "removeHolidayEverywhere recusa e orienta a usar Excluir vínculo");
  assert(r4 === false, "removeHoliday (soft delete) recusa");
  assert(
    JSON.stringify({ h: getHolidays(), c: AppData.state.calendarHolidays }) === before,
    "Feriados, duplicata, vínculos e calendário ficam intactos"
  );
  assert(!getHolidays().some((h) => h.isDeleted), "Nenhum feriado marcado como excluído");
  assert(
    !AppData.isHolidayTombstoned(CO, "2025-12-25", "Natal") &&
      !AppData.isHolidayTombstoned("__calendar__", "2025-12-25", "Natal"),
    "Nenhum tombstone de feriado gravado"
  );
  assert(Object.keys(AppData.state.deletedArchive || {}).length === 0, "Nada vai para a lixeira (nada saiu)");
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

// ── 5. Exclusão ANTIGA de feriado do CALENDÁRIO continua valendo no merge ────
{
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
