/**
 * Verificação: Feriados retroativos (anteriores ao Corpus Christi).
 * Homologação temporária — não versionar.
 * Uso: node scripts/verify-feriados-retroativos.mjs
 *
 * Cobre:
 *  1. Seed retroativo (Ano Novo 01/01 + Quarta de Cinzas 18/02) em calendário e
 *     nas duas empresas, sem vincular ninguém.
 *  2. Trava de auto-vínculo por mês (monthHasScaleData / syncAuto via recompute):
 *     mês sem escala não auto-vincula; mês com escala auto-vincula.
 *  3. addManualWorkedEmployee: converte vínculo automático Pendente em Manual
 *     (sem apagar/duplicar) e mantém bloqueio para Agendado/Compensado.
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

function loadCore(storage, windowExtras = {}) {
  const context = {
    window: {}, localStorage: storage, console, setTimeout, clearTimeout,
    Date, JSON, Math, Object, Array, Set, Map, String, Number,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    navigator: { onLine: true }, performance: { now: () => 0 }
  };
  context.window = context;
  Object.assign(context.window, windowExtras);
  const sandbox = vm.createContext(context);
  for (const file of ["js/version.js", "js/import-utils.js", "js/data.js", "js/scale-rules.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

function buildState() {
  const employees = [
    { id: "e-joao", name: "João Silva", company: "Chez Pitu", status: "Ativo", department: "Salão", admissionDate: "2024-01-01" }
  ];
  return {
    calendarHolidays: [],
    companies: {
      "Chez Pitu": {
        employees, vacations: [], absences: [], manualScale: {},
        holidays: [{ id: "h-ano", name: "Ano Novo", date: "2026-01-01", workedEmployees: [] }]
      },
      "Pengold": { employees: [], vacations: [], absences: [], manualScale: {}, holidays: [] }
    }
  };
}

let pass = 0, fail = 0;
function check(desc, cond) {
  if (cond) { pass++; console.log(`  ✓ ${desc}`); }
  else { fail++; console.log(`  ✗ ${desc}`); }
}

console.log("\n=== VERIFICAÇÃO: Feriados retroativos ===\n");

// --- 1. Seed retroativo (estado já presente, sem flag → seed roda 1x) --------
console.log("[Seed retroativo]");
const STORAGE_KEY = "chezPituPeopleSystem.v1";
const seedStorage = createStorage({ [STORAGE_KEY]: JSON.stringify(buildState()) });
const sbSeed = loadCore(seedStorage);
const AppSeed = sbSeed.window.AppData;

const calNames = (AppSeed.state.calendarHolidays || []).map((h) => `${h.name}|${h.date}`);
check("Calendário tem Ano Novo 2026-01-01", calNames.includes("Ano Novo|2026-01-01"));
check("Calendário tem Quarta-feira de Cinzas 2026-02-18", calNames.includes("Quarta-feira de Cinzas|2026-02-18"));

["Chez Pitu", "Pengold"].forEach((company) => {
  const hs = (AppSeed.getCompanyData(company).holidays || []);
  const has = (name, date) => hs.some((h) => h.name === name && h.date === date);
  check(`${company}: Ano Novo cadastrado`, has("Ano Novo", "2026-01-01"));
  check(`${company}: Quarta de Cinzas cadastrada`, has("Quarta-feira de Cinzas", "2026-02-18"));
  const anoNovoSeed = hs.find((h) => h.date === "2026-01-01" && h.id.startsWith("feriado-seed-2026-ano-novo"));
  check(`${company}: seed do Ano Novo sem vínculo automático`, !anoNovoSeed || (anoNovoSeed.workedEmployees || []).length === 0);
});

// --- 2. Trava de auto-vínculo por mês ----------------------------------------
console.log("\n[Trava de auto-vínculo por mês]");
const storage = createStorage();
{
  const sb = loadCore(storage);
  storage.setItem(sb.window.AppData.STORAGE_KEY, JSON.stringify(buildState()));
  storage.setItem("chezPituHolidaySeed2026.v3", new Date().toISOString()); // evita seed mexer no fixture
}
const sb = loadCore(storage);
const App = sb.window.AppData;
const ScaleRules = sb.window.ScaleRules;
const company = "Chez Pitu";
const data = App.getCompanyData(company);

check("monthHasScaleData = false em mês sem escala", ScaleRules.monthHasScaleData("2026-01", data) === false);

// Recompute sem escala: guard impede auto-vínculo.
ScaleRules.recomputeScaleIntegrations(["2026-01"], { companies: [company] });
const hAno = App.getCompanyData(company).holidays.find((h) => h.id === "h-ano");
check("Mês sem escala NÃO auto-vincula ninguém", (hAno.workedEmployees || []).length === 0);

// Agora preenche a escala do mês (uma folga qualquer) → mês passa a ter escala.
data.manualScale["e-joao|2026-01-15"] = "FOLGA";
check("monthHasScaleData = true após lançamento de escala", ScaleRules.monthHasScaleData("2026-01", data) === true);

// Ano Novo 01/01 já está VENCIDO (prazo de 120 dias expirado): a guarda
// anti-regressão impede o auto-vínculo "nascido Vencido" mesmo com escala.
ScaleRules.recomputeScaleIntegrations(["2026-01"], { companies: [company] });
const hAno2 = App.getCompanyData(company).holidays.find((h) => h.id === "h-ano");
check(
  "Feriado já vencido NÃO recebe auto-vínculo (guarda anti-regressão)",
  (hAno2.workedEmployees || []).length === 0
);

// Feriado DENTRO do prazo (data recente): o auto-vínculo continua funcionando.
const recent = new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10);
const recentMonth = recent.slice(0, 7);
const folgaDay = recent.endsWith("-01") ? `${recentMonth}-02` : `${recentMonth}-01`;
App.state.calendarHolidays.push({ id: "cal-recent", name: "Feriado Recente", date: recent, companies: ["ambas"] });
data.manualScale[`e-joao|${folgaDay}`] = "FOLGA"; // garante monthHasScaleData no mês recente
ScaleRules.recomputeScaleIntegrations([recentMonth], { companies: [company] });
const hRecent = App.getCompanyData(company).holidays.find((h) => h.date === recent && h.name === "Feriado Recente");
const joaoAuto = hRecent && (hRecent.workedEmployees || []).find((w) => w.employeeId === "e-joao");
check("Feriado dentro do prazo auto-vincula quem trabalhou", Boolean(joaoAuto));
check("Vínculo criado é automático", Boolean(joaoAuto && joaoAuto.autoCreated === true));

// --- 3. addManualWorkedEmployee converte automático → Manual ------------------
console.log("\n[Conversão automático → Manual]");
const res = App.addManualWorkedEmployee(hRecent.id, "e-joao", { company });
check("Vínculo manual sobre automático retorna ok", res.ok === true);
check("Resultado sinaliza conversão (converted=true)", res.converted === true);
check("Resultado traz mensagem informativa", typeof res.message === "string" && res.message.length > 0);
const joaoNow = App.getCompanyData(company).holidays.find((h) => h.id === hRecent.id).workedEmployees.filter((w) => w.employeeId === "e-joao");
check("Não duplica vínculo (continua 1)", joaoNow.length === 1);
check("Origem convertida para Manual", joaoNow[0].origin === "Manual");
check("autoCreated zerado", joaoNow[0].autoCreated === false);
check("Status preservado como Pendente/Vencido", ["Pendente", "Vencido"].includes(joaoNow[0].status));

// --- 4. Mantém bloqueio para Agendado/Compensado -----------------------------
console.log("\n[Bloqueio preserva compensação]");
const data2 = App.getCompanyData(company);
data2.holidays.push(
  { id: "h-ag", name: "Feriado Agendado", date: "2026-02-10", workedEmployees: [
    { employeeId: "e-joao", status: "Agendado", origin: "Manual", compensationDate: "2030-01-01", autoCreated: false }
  ] },
  { id: "h-cp", name: "Feriado Compensado", date: "2026-02-11", workedEmployees: [
    { employeeId: "e-joao", status: "Compensado", origin: "Manual", compensationDate: "2026-02-20", autoCreated: false }
  ] }
);
const resAg = App.addManualWorkedEmployee("h-ag", "e-joao", { company });
check("Agendado continua bloqueado (ok=false)", resAg.ok === false);
check("Agendado preserva compensationDate", data2.holidays.find((h) => h.id === "h-ag").workedEmployees[0].compensationDate === "2030-01-01");
const resCp = App.addManualWorkedEmployee("h-cp", "e-joao", { company });
check("Compensado continua bloqueado (ok=false)", resCp.ok === false);
check("Compensado preserva compensationDate", data2.holidays.find((h) => h.id === "h-cp").workedEmployees[0].compensationDate === "2026-02-20");

console.log(`\n=== RESUMO: ${pass} passou, ${fail} falhou ===\n`);
process.exit(fail ? 1 : 0);
