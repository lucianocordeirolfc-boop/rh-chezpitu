/**
 * REGRA FIXA: alteração de folga no cadastro NUNCA é retroativa.
 *
 * Folga fixa, domingos de folga e 2ª folga alterados no cadastro valem só a
 * partir da data da alteração; nenhum dia anterior muda (escala automática, VT,
 * auto-vínculo de feriado e 5x2 leem o código do dia pelo histórico).
 *
 * Data simulada: 17/11/2026 (terça). Fixtures em memória — nunca produção.
 * Uso: node scripts/verify-folga-sem-retroativo.mjs
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

function load(fakeToday) {
  const store = {};
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(`${fakeToday}T12:00:00`);
    }
    static now() { return new RealDate(`${fakeToday}T12:00:00`).getTime(); }
  }
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
    Date: FakeDate, JSON, Math, Object, Array, Set, Map, String, Number, parseInt, parseFloat, isNaN, undefined,
    navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of ["js/import-utils.js", "js/data.js", "js/scale-rules.js", "js/scale-5x2.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const CO = "Pengold";
const { AppData } = load("2026-11-17");
const data = AppData.getCompanyData(CO);
data.employees = [];
data.manualScale = {};
data.vacations = [];
data.absences = [];
data.holidays = [];

const base = {
  id: "emp-hudson", name: "Hudson Fixture", cpf: "", ctps: "1", role: "Cozinheiro", department: "COZINHA",
  status: "Ativo", admissionDate: "2024-01-01", fixedDay: "Quinta-feira", sundayOffWeeks: "4",
  doubleSundayOff: "false", defaultShift: "14h às 22:20h", vtDaily: 10, notes: ""
};

console.log("\n=== REGRA FIXA: alteração de folga não é retroativa ===\n");

// ── 1. Domingos de folga (caso Hudson: 4º → 1º) ─────────────────────────────
let emp = AppData.upsertEmployee({ ...base }, CO);
const code = (d) => AppData.getScaleCode(emp, d, data);
const before = ["2026-10-04", "2026-10-25", "2026-11-01", "2026-11-15"].map(code).join(",");
emp = AppData.upsertEmployee({ ...emp, sundayOffWeeks: "1" }, CO);
assert(emp.sundayOffWeeks === "1", "Cadastro mostra o domingo novo (1º)");
assert(["2026-10-04", "2026-10-25", "2026-11-01", "2026-11-15"].map(code).join(",") === before, "Domingos ANTERIORES à alteração não mudam");
assert(code("2026-10-25") === "DOM" && code("2026-11-01") === "", "Out/2026: 4º domingo continua DOM; 1º de nov continua trabalhado");
assert(code("2026-11-22") === "", "22/11/2026 (4º domingo, depois da alteração): passa a ser trabalhado");
assert(code("2026-12-06") === "DOM" && code("2026-12-27") === "", "Dez/2026: 1º domingo DOM, 4º trabalhado");
assert(emp.sundayOffWeeksHistory.length === 2 && emp.sundayOffWeeksHistory[1].from === "2026-11-17", "Histórico: antigo desde sempre + novo a partir de 17/11/2026");

emp = AppData.upsertEmployee({ ...emp, sundayOffWeeks: "3" }, CO);
assert(emp.sundayOffWeeksHistory.length === 2 && emp.sundayOffWeeksHistory[1].weeks === "3", "Nova troca no mesmo dia substitui (não acumula)");
assert(code("2026-10-25") === "DOM", "Passado continua intacto após 2ª troca");
emp = AppData.upsertEmployee({ ...emp, notes: "edição sem mexer em domingos" }, CO);
assert(emp.sundayOffWeeksHistory.length === 2 && emp.sundayOffWeeks === "3", "Editar outro campo preserva o histórico");

// ── 2. Folga fixa: vale a partir da data da alteração ───────────────────────
emp = AppData.upsertEmployee({ ...emp, fixedDay: "Segunda-feira" }, CO);
assert(code("2026-11-12") === "FOLGA", "Quinta 12/11 (antes da alteração) continua FOLGA");
assert(code("2026-11-16") === "", "Segunda 16/11 (antes da alteração) continua trabalhada");
assert(code("2026-11-19") === "" && code("2026-11-23") === "FOLGA", "A partir de 17/11: quinta 19/11 trabalhada, segunda 23/11 FOLGA");
assert(AppData.resolveFixedDayForDate(emp, "2026-11-17") === "Segunda-feira", "Nova folga vale já no dia da alteração (17/11)");
emp = AppData.upsertEmployee({ ...emp, fixedDay: "Terça-feira" }, CO);
assert(code("2026-11-12") === "FOLGA" && code("2026-11-24") === "FOLGA" && code("2026-11-23") === "", "2ª troca no mesmo dia: passado intacto, vale a última");
assert(AppData.getFixedDayChangeInfo(emp) === null, "Sem troca 'agendada' pendente (já vale hoje)");

// ── 3. Troca agendada antes da regra (para 01/12) é respeitada ──────────────
{
  const legacy = AppData.upsertEmployee({ ...base, id: "emp-legado", name: "Legado Fixture", sundayOffWeeks: "2" }, CO);
  legacy.fixedDay = "Sexta-feira";
  legacy.fixedDayHistory = [
    { fixedDay: "Quinta-feira", from: "", to: "2026-11-30" },
    { fixedDay: "Sexta-feira", from: "2026-12-01", to: "" }
  ];
  const info = AppData.getFixedDayChangeInfo(legacy);
  assert(info && info.effectiveFrom === "2026-12-01", "Troca já agendada para 01/12 continua mostrando 01/12");
  assert(AppData.getScaleCode(legacy, "2026-11-26", data) === "FOLGA" && AppData.getScaleCode(legacy, "2026-12-04", data) === "FOLGA", "Agendamento legado aplicado nas datas certas");
}

// ── 4. Fonte: regras documentadas e telas avisam ────────────────────────────
{
  const rules = fs.readFileSync(path.join(root, "PROJECT_RULES.md"), "utf8");
  const func = fs.readFileSync(path.join(root, "js/funcionarios.js"), "utf8");
  assert(/Alteração de folga no cadastro não é retroativa \(REGRA FIXA\)/.test(rules), "PROJECT_RULES: regra fixa registrada");
  assert(/Nada para trás foi alterado/.test(func), "Cadastro avisa ao salvar que nada para trás foi alterado");
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
