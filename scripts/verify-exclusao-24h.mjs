/**
 * Validação focada: regra de exclusão de funcionário limitada a 24h após o cadastro.
 * Homologação temporária — não versionar.
 *
 * Cobre:
 *  - upsertEmployee carimba `createdAt` no primeiro cadastro;
 *  - `createdAt` é preservado ao editar o cadastro;
 *  - canDeleteEmployee: true dentro de 24h, false depois;
 *  - canDeleteEmployee: false para legado sem createdAt;
 *  - removeEmployee exclui dentro da janela;
 *  - removeEmployee lança erro (bloqueia) após 24h — apenas inativar permitido.
 *
 * Uso: node scripts/verify-exclusao-24h.mjs
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
const DIA = 24 * 60 * 60 * 1000;

function findByCpf(cpf) {
  return AppData.getCompanyData(CO).employees.find(
    (e) => e.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
  );
}

// ── 1. createdAt carimbado no cadastro ──
console.log("[1] Carimbo de createdAt no cadastro");
AppData.upsertEmployee(
  { name: "Recem Cadastrado", cpf: "111.222.333-01", ctps: "0001", role: "Recepcionista", department: "Recepção", status: "Ativo" },
  CO
);
let emp = findByCpf("111.222.333-01");
assert(emp && Number(emp.createdAt) > 0, "createdAt definido no primeiro cadastro");
const createdOriginal = emp.createdAt;

// ── 2. createdAt preservado ao editar ──
console.log("[2] createdAt preservado ao editar");
AppData.upsertEmployee({ id: emp.id, name: "Recem Cadastrado", cpf: "111.222.333-01", role: "Caixa" }, CO);
emp = findByCpf("111.222.333-01");
assert(emp.createdAt === createdOriginal, "createdAt inalterado após edição");
assert(emp.role === "Caixa", "edição aplicada (role atualizado)");

// ── 3. canDeleteEmployee dentro da janela ──
console.log("[3] canDeleteEmployee dentro de 24h");
assert(AppData.canDeleteEmployee(emp) === true, "recém-cadastrado é excluível");
assert(AppData.canDeleteEmployee({ createdAt: Date.now() - 23 * 3600e3 }) === true, "23h atrás ainda excluível");

// ── 4. canDeleteEmployee após a janela ──
console.log("[4] canDeleteEmployee após 24h");
assert(AppData.canDeleteEmployee({ createdAt: Date.now() - 25 * 3600e3 }) === false, "25h atrás bloqueado");
assert(AppData.canDeleteEmployee({ createdAt: Date.now() - DIA - 1 }) === false, "logo após 24h bloqueado");

// ── 5. Legado sem createdAt não é excluível ──
console.log("[5] Legado sem createdAt");
assert(AppData.canDeleteEmployee({}) === false, "sem createdAt bloqueado");
assert(AppData.canDeleteEmployee(null) === false, "nulo bloqueado");

// ── 6. removeEmployee exclui dentro da janela ──
console.log("[6] removeEmployee dentro da janela");
const idRecente = emp.id;
AppData.removeEmployee(idRecente, CO);
assert(!findByCpf("111.222.333-01"), "funcionário recém-cadastrado excluído");

// ── 7. removeEmployee bloqueia após 24h ──
console.log("[7] removeEmployee bloqueado após 24h");
AppData.upsertEmployee(
  { name: "Antigo Fixo", cpf: "111.222.333-02", ctps: "0002", role: "Cozinha", department: "Cozinha", status: "Ativo" },
  CO
);
let antigo = findByCpf("111.222.333-02");
// Simula cadastro feito há mais de 24h
antigo.createdAt = Date.now() - 2 * DIA;
let bloqueou = false;
try {
  AppData.removeEmployee(antigo.id, CO);
} catch (e) {
  bloqueou = true;
}
assert(bloqueou, "removeEmployee lançou erro após 24h");
assert(!!findByCpf("111.222.333-02"), "funcionário NÃO foi excluído (preservado)");

// ── 8. Inativação segue permitida ──
console.log("[8] Inativação continua permitida após 24h");
AppData.upsertEmployee({ id: antigo.id, name: "Antigo Fixo", cpf: "111.222.333-02", status: "Inativo" }, CO);
antigo = findByCpf("111.222.333-02");
assert(antigo && antigo.status === "Inativo", "funcionário inativado (não excluído)");

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
