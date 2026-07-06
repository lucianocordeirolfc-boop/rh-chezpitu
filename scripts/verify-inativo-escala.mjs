/**
 * Validação focada: inativação de funcionário + visibilidade na Escala.
 * Homologação temporária — não versionar.
 *
 * Cobre:
 *  - upsertEmployee carimba `deactivatedAt` na transição Ativo→Inativo;
 *  - preserva `deactivatedAt` enquanto segue inativo;
 *  - limpa `deactivatedAt` ao reativar (status Ativo);
 *  - regra de visibilidade da Escala (inativo aparece só até o mês da saída,
 *    nunca em meses posteriores/futuros; legado sem data usa mês corrente).
 *
 * Uso: node scripts/verify-inativo-escala.mjs
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
  const ctx = {
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console, setTimeout, clearTimeout, Date, JSON, Math, Object, Array, Set, Map,
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
const nowMonth = AppData.todayISO().slice(0, 7);

function findByCpf(cpf) {
  return AppData.getCompanyData(CO).employees.find(
    (e) => e.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
  );
}

// ── 1. Ativo→Inativo carimba deactivatedAt ──
console.log("[1] Carimbo de deactivatedAt");
AppData.upsertEmployee(
  { name: "Fulano Teste", cpf: "111.222.333-44", ctps: "0001", role: "Recepcionista", department: "Recepção", status: "Ativo" },
  CO
);
let emp = findByCpf("111.222.333-44");
assert(emp && emp.status === "Ativo", "funcionário criado como Ativo");
assert(!emp.deactivatedAt, "Ativo não tem deactivatedAt");

AppData.upsertEmployee({ ...emp, status: "Inativo" }, CO);
emp = findByCpf("111.222.333-44");
assert(emp.status === "Inativo", "status virou Inativo");
assert(emp.deactivatedAt === AppData.todayISO(), `deactivatedAt = hoje (${emp.deactivatedAt})`);

// ── 2. Segue inativo: preserva a data original ──
console.log("[2] Preserva deactivatedAt enquanto inativo");
const originalDate = "2026-03-10";
emp.deactivatedAt = originalDate; // simula data antiga
AppData.upsertEmployee({ ...emp, notes: "editado" }, CO);
emp = findByCpf("111.222.333-44");
assert(emp.deactivatedAt === originalDate, `data original preservada (${emp.deactivatedAt})`);

// ── 3. Reativar limpa deactivatedAt ──
console.log("[3] Reativar limpa deactivatedAt");
AppData.upsertEmployee({ ...emp, status: "Ativo" }, CO);
emp = findByCpf("111.222.333-44");
assert(emp.status === "Ativo" && !emp.deactivatedAt, "reativado sem deactivatedAt");

// ── 4. Regra de visibilidade na Escala ──
console.log("[4] Visibilidade na Escala (inativo até o mês da saída)");
// Reproduz inactiveVisibleForMonth(employee, yearMonth) do escala.js
function inactiveVisibleForMonth(employee, yearMonth) {
  const currentYearMonth = AppData.todayISO().slice(0, 7);
  const deactivatedMonth = String(employee.deactivatedAt || "").slice(0, 7);
  const limitMonth = deactivatedMonth || currentYearMonth;
  return yearMonth <= limitMonth;
}
const saiu = { deactivatedAt: "2026-05-20" };
assert(inactiveVisibleForMonth(saiu, "2026-04") === true, "aparece em mês anterior à saída");
assert(inactiveVisibleForMonth(saiu, "2026-05") === true, "aparece no mês da saída");
assert(inactiveVisibleForMonth(saiu, "2026-06") === false, "NÃO aparece no mês seguinte à saída");
assert(inactiveVisibleForMonth(saiu, "2030-01") === false, "NÃO aparece em mês futuro");
const legado = { deactivatedAt: "" };
assert(inactiveVisibleForMonth(legado, nowMonth) === true, "legado sem data aparece até o mês corrente");
const proximoMes = (() => { const [y, m] = nowMonth.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
assert(inactiveVisibleForMonth(legado, proximoMes) === false, "legado não aparece em escala futura");

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
