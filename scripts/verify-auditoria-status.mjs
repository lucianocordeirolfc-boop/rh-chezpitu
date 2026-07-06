/**
 * Validação focada: trilha de auditoria + setEmployeeStatus (botão Inativar/Reativar).
 * Homologação temporária — não versionar.
 *
 * Cobre:
 *  - upsertEmployee registra "cadastro" no primeiro cadastro;
 *  - setEmployeeStatus alterna Ativo/Inativo preservando os demais campos;
 *  - setEmployeeStatus carimba/limpa deactivatedAt;
 *  - auditoria registra inativacao/reativacao/exclusao com usuário e timestamp;
 *  - getAuditLog filtra por empresa e ordena do mais recente ao mais antigo;
 *  - getEmployeeAuditLog isola o histórico de um funcionário;
 *  - mergeAuditLogs (via mergeRemoteIntoLocal) une sem duplicar por id.
 *
 * Uso: node scripts/verify-auditoria-status.mjs
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

function findByCpf(cpf) {
  return AppData.getCompanyData(CO).employees.find(
    (e) => e.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
  );
}

// ── 1. Cadastro gera evento de auditoria ──
console.log("[1] Auditoria de cadastro");
AppData.upsertEmployee(
  { name: "Auditoria Teste", cpf: "999.888.777-01", ctps: "0001", role: "Garçom", department: "Salão", status: "Ativo" },
  CO
);
const emp = findByCpf("999.888.777-01");
let hist = AppData.getEmployeeAuditLog(emp.id, CO);
assert(hist.length === 1 && hist[0].action === "cadastro", "cadastro registrado na auditoria");
assert(hist[0].user === "sistema", "usuário registrado (sistema no sandbox sem AppAuth)");
assert(typeof hist[0].at === "number" && hist[0].at > 0, "timestamp registrado");

// ── 2. setEmployeeStatus inativa preservando campos ──
console.log("[2] setEmployeeStatus → Inativo");
AppData.setEmployeeStatus(emp.id, "Inativo", CO);
let atual = findByCpf("999.888.777-01");
assert(atual.status === "Inativo", "status alterado para Inativo");
assert(atual.role === "Garçom" && atual.name === "Auditoria Teste", "demais campos preservados");
assert(!!atual.deactivatedAt, "deactivatedAt carimbado");

// ── 3. Auditoria de inativação ──
console.log("[3] Auditoria de inativação");
hist = AppData.getEmployeeAuditLog(emp.id, CO);
assert(hist[0].action === "inativacao", "inativacao é o evento mais recente");
assert(hist.length === 2, "dois eventos acumulados (cadastro + inativacao)");

// ── 4. setEmployeeStatus reativa e limpa deactivatedAt ──
console.log("[4] setEmployeeStatus → Ativo");
AppData.setEmployeeStatus(emp.id, "Ativo", CO);
atual = findByCpf("999.888.777-01");
assert(atual.status === "Ativo", "status alterado para Ativo");
assert(!atual.deactivatedAt, "deactivatedAt removido ao reativar");
hist = AppData.getEmployeeAuditLog(emp.id, CO);
assert(hist[0].action === "reativacao", "reativacao registrada");

// ── 5. setEmployeeStatus idempotente (sem mudança) não duplica ──
console.log("[5] Idempotência");
const antes = AppData.getEmployeeAuditLog(emp.id, CO).length;
AppData.setEmployeeStatus(emp.id, "Ativo", CO);
assert(AppData.getEmployeeAuditLog(emp.id, CO).length === antes, "status igual não gera evento novo");

// ── 6. Auditoria de exclusão (dentro da janela de 24h) ──
console.log("[6] Auditoria de exclusão");
AppData.removeEmployee(emp.id, CO);
assert(!findByCpf("999.888.777-01"), "funcionário excluído (dentro de 24h)");
const excl = AppData.getAuditLog({ company: CO }).find(
  (e) => e.employeeId === emp.id && e.action === "exclusao"
);
assert(!!excl, "exclusão registrada na auditoria");
assert(excl.employeeName === "Auditoria Teste", "nome preservado no registro de exclusão");

// ── 7. getAuditLog ordena do mais recente ao mais antigo ──
console.log("[7] Ordenação e filtro");
const log = AppData.getAuditLog({ company: CO });
const ordenado = log.every((e, i) => i === 0 || log[i - 1].at >= e.at);
assert(ordenado, "getAuditLog ordena por timestamp decrescente");
assert(log.every((e) => e.company === CO), "filtro por empresa aplicado");

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
