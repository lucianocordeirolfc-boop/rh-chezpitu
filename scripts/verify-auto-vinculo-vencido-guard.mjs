/**
 * Verificação: GUARDA anti-regressão do auto-vínculo (não criar vínculo já Vencido).
 * Homologação temporária — não versionar.
 *
 * Mecanismo (js/scale-rules.js): syncAutoHolidaysWorkedForMonth não CRIA um
 * vínculo automático para feriado cujo prazo de compensação (120 dias) já passou
 * — evita que recomputar meses antigos materialize dezenas de pendências vencidas.
 *
 * Cobre:
 *  1. Feriado JÁ VENCIDO (prazo expirado) não recebe auto-vínculo no recompute.
 *  2. Feriado DENTRO do prazo recebe auto-vínculo (comportamento preservado).
 *  3. Vínculo EXISTENTE (inclusive Compensado) em feriado vencido NÃO é removido
 *     pela guarda (ela só bloqueia CRIAÇÃO, nunca apaga o que já existe).
 *  4. Vínculo manual em feriado vencido continua possível (não passa pela guarda).
 *
 * Uso: node scripts/verify-auto-vinculo-vencido-guard.mjs
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (d, c) => { if (c) { pass++; console.log(`  ✓ ${d}`); } else { fail++; console.log(`  ✗ ${d}`); } };

function loadCore(storage) {
  const ctx = {
    window: {}, localStorage: storage, console, setTimeout, clearTimeout,
    Date, JSON, Math, Object, Array, Set, Map, String, Number, RegExp,
    parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }, performance: { now: () => 0 }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const f of ["js/version.js", "js/import-utils.js", "js/data.js", "js/scale-rules.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
  }
  return sandbox;
}
function storage(initial = {}) {
  const s = { ...initial };
  return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } };
}
const iso = (deltaDays) => new Date(Date.now() + deltaDays * 864e5).toISOString().slice(0, 10);

const CO = "Chez Pitu";
const past = iso(-200);            // > 120 dias atrás → prazo expirado
const pastMonth = past.slice(0, 7);
const recent = iso(-10);           // dentro do prazo
const recentMonth = recent.slice(0, 7);

function baseState() {
  return {
    calendarHolidays: [
      { id: "cal-past", name: "Feriado Antigo", date: past, companies: ["ambas"] },
      { id: "cal-recent", name: "Feriado Recente", date: recent, companies: ["ambas"] }
    ],
    companies: {
      "Chez Pitu": {
        employees: [{ id: "e1", name: "João Silva", company: CO, status: "Ativo", department: "Salão", admissionDate: "2023-01-01" }],
        vacations: [], absences: [], manualScale: {}, holidays: []
      },
      "Pengold": { employees: [], vacations: [], absences: [], manualScale: {}, holidays: [] }
    }
  };
}

console.log("\n=== VERIFICAÇÃO: guarda anti-regressão (auto-vínculo não nasce Vencido) ===\n");

const st = storage();
{
  const sb0 = loadCore(st);
  st.setItem(sb0.window.AppData.STORAGE_KEY, JSON.stringify(baseState()));
  st.setItem("chezPituHolidaySeed2026.v3", new Date().toISOString());
  st.setItem("chezPituHolidaySeed2026.v1", new Date().toISOString());
}
const sb = loadCore(st);
const App = sb.window.AppData;
const SR = sb.window.ScaleRules;
const data = App.getCompanyData(CO);

// Garante escala nos dois meses (dias diferentes dos feriados) → monthHasScaleData true.
data.manualScale[`e1|${pastMonth}-15`] = "FOLGA";
data.manualScale[`e1|${recentMonth}-20`] = "FOLGA";

// 1 + 2: recompute dos dois meses
SR.recomputeScaleIntegrations([pastMonth, recentMonth], { companies: [CO] });
const hPast = App.getCompanyData(CO).holidays.find((h) => h.date === past && h.name === "Feriado Antigo");
const hRecent = App.getCompanyData(CO).holidays.find((h) => h.date === recent && h.name === "Feriado Recente");

check("Feriado já vencido NÃO recebe auto-vínculo", !hPast || (hPast.workedEmployees || []).every((w) => w.employeeId !== "e1"));
check("Feriado dentro do prazo RECEBE auto-vínculo", Boolean(hRecent && (hRecent.workedEmployees || []).some((w) => w.employeeId === "e1" && w.autoCreated === true)));

// 3: vínculo existente (Compensado) em feriado vencido não é removido pela guarda
const data2 = App.getCompanyData(CO);
data2.holidays.push({
  id: "h-venc-existente", name: "Feriado Antigo 2", date: past,
  workedEmployees: [{ employeeId: "e1", status: "Compensado", origin: "Manual", compensationDate: iso(-150), autoCreated: false }]
});
SR.recomputeScaleIntegrations([pastMonth], { companies: [CO] });
const hExist = App.getCompanyData(CO).holidays.find((h) => h.id === "h-venc-existente");
check("Guarda NÃO remove vínculo já existente em feriado vencido", Boolean(hExist && (hExist.workedEmployees || []).some((w) => w.employeeId === "e1")));

// 4: vínculo MANUAL em feriado vencido continua possível (não passa pela guarda)
const resM = App.addManualWorkedEmployee("h-venc-existente", "e1", { company: CO });
check("Vínculo manual em feriado vencido continua permitido", resM.ok === true || resM.blocked === true);

console.log(`\n=== RESUMO: ${pass} passou, ${fail} falhou ===\n`);
process.exit(fail ? 1 : 0);
