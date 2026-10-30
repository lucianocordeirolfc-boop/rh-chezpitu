/**
 * Validação: alerta "Escala indica folga" no Controle de Feriados.
 *
 * Caso real (Carlos Andrey, 2026-10-30): vinculado como tendo trabalhado em
 * feriados em que a escala marcava DOM/FOLGA (troca de folga depois do
 * vínculo automático — que só CRIA vínculo, nunca remove).
 *
 * Cobre (fixtures em memória — nunca a base real):
 *  - FOLGA / DOM / FÉRIAS / atestado no dia do feriado → alerta com o código;
 *  - dia trabalhado (código vazio, TR...) → sem alerta;
 *  - mês sem escala preenchida → sem alerta (padrão do cadastro não é confiável);
 *  - o alerta só LÊ: nenhum vínculo, escala ou tombstone é alterado;
 *  - amarras de fonte: etiqueta na linha e indicador "Escala indica folga".
 *
 * Uso: node scripts/verify-feriados-escala-folga.mjs
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

const store = {};
const ctx = {
  window: {},
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  console: { log() {}, warn() {}, error: console.error, info() {} },
  setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
  Date, JSON, Math, Object, Array, Set, Map, String, Number,
  parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
};
ctx.window = ctx;
const sandbox = vm.createContext(ctx);
for (const file of ["js/import-utils.js", "js/data.js", "js/scale-rules.js", "js/feriados.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}
const AppData = sandbox.AppData;
const check = sandbox.FeriadosModule.scaleOffCodeOnHoliday;
const CO = "Chez Pitu";

const data = AppData.getCompanyData(CO);
const emp = { id: "e1", name: "CARLOS TESTE", status: "Ativo", company: CO, sundayOffWeeks: "4" };
data.employees = [emp];
// 26/07/2026 é o 4º domingo de julho → DOM pelo cadastro.
data.manualScale = {
  "e1|2026-07-01": "FOLGA",       // mês com escala preenchida
  "e1|2026-07-29": "FOLGA",       // folga lançada no feriado
  "e1|2026-09-07": "",            // trabalhado (vazio)
  "e1|2026-09-01": "FOLGA",
  "e1|2026-10-12": "TR"           // cobertura = trabalhado
};
data.vacations = [{ id: "v1", employeeId: "e1", startDate: "2026-11-01", endDate: "2026-11-05" }];
data.absences = [];
data.manualScale["e1|2026-11-20"] = "FOLGA";
data.holidays = [
  { id: "h1", name: "Padroeira de Búzios", date: "2026-07-26", workedEmployees: [{ employeeId: "e1", status: "Pendente" }] },
  { id: "h2", name: "Comércio Hoteleiro", date: "2026-07-29", workedEmployees: [{ employeeId: "e1", status: "Compensado", compensationDate: "2026-09-28" }] },
  { id: "h3", name: "Independência", date: "2026-09-07", workedEmployees: [{ employeeId: "e1" }] },
  { id: "h4", name: "Padroeira do Brasil", date: "2026-10-12", workedEmployees: [{ employeeId: "e1" }] },
  { id: "h5", name: "Finados", date: "2026-11-02", workedEmployees: [{ employeeId: "e1" }] }
];
const before = JSON.stringify({ h: data.holidays, s: data.manualScale, t: AppData.state.workedLinkTombstones });

console.log("\n=== TESTE: alerta 'Escala indica folga' ===\n");
assert(check(emp, "2026-07-26", data) === "DOM", "26/07 (4º domingo, cadastro) → alerta DOM");
assert(check(emp, "2026-07-29", data) === "FOLGA", "29/07 com FOLGA lançada → alerta FOLGA");
assert(check(emp, "2026-09-07", data) === "", "07/09 trabalhado (vazio) → sem alerta");
assert(check(emp, "2026-10-12", data) === "", "12/10 com TR (cobertura) → sem alerta");
assert(check(emp, "2026-11-02", data) === "FÉRIAS", "02/11 em férias → alerta FÉRIAS");
assert(check(emp, "2026-03-29", data) === "", "mês sem escala preenchida → sem alerta (mesmo sendo DOM)");
assert(check(null, "2026-07-26", data) === "", "funcionário não encontrado → sem alerta");
assert(
  JSON.stringify({ h: data.holidays, s: data.manualScale, t: AppData.state.workedLinkTombstones }) === before,
  "o alerta só lê: vínculos, escala e tombstones intactos"
);

const src = fs.readFileSync(path.join(root, "js/feriados.js"), "utf8");
assert(src.includes('id: "escalaFolga"') && src.includes("Escala indica folga"), "indicador 'Escala indica folga' na barra");
assert(src.includes("scale-off-pill") && src.includes('quickView === "escalaFolga"'), "etiqueta na linha e filtro do indicador");
assert(!/scaleOffCode[\s\S]{0,200}removeWorkedEmployeeFromHoliday/.test(src), "o alerta não exclui vínculo sozinho");

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
