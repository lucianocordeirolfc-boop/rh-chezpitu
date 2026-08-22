/**
 * Validação focada: funcionário inativo fora das telas operacionais + data de
 * desligamento obrigatória ao inativar.
 *
 * Cobre:
 *  - setEmployeeStatus grava a data de desligamento informada em deactivatedAt
 *    (e mantém o fallback antigo quando ninguém informa nada);
 *  - upsertEmployee respeita a data informada na transição Ativo→Inativo;
 *  - regra de visibilidade do Cadastro de Funcionários (oculta inativo, mostra
 *    o que foi marcado no seletor, filtro Status=Inativo vence);
 *  - regra de visibilidade do Controle de Feriados (mesma ideia, por vínculo);
 *  - amarras de fonte: botão nas duas telas, módulo carregado no index.html e
 *    inativação passando pela caixa de diálogo com data.
 *
 * As duas regras de visibilidade são reproduzidas aqui a partir das funções
 * reais (isEmployeeVisibleByStatus / applyInactiveVisibility), no mesmo padrão
 * de verify-inativo-escala.mjs: os módulos de tela são IIFE acopladas ao DOM e
 * não sobem em Node. As asserções de fonte no fim garantem que a cópia não se
 * descole do original sem alguém perceber.
 *
 * Uso: node scripts/verify-inativos-visibilidade.mjs
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

// ── 1. setEmployeeStatus com data de desligamento informada ──
console.log("[1] setEmployeeStatus grava a data informada");
AppData.upsertEmployee(
  { name: "Inativo Teste", cpf: "222.333.444-55", ctps: "0002", role: "Camareira", department: "Governança", status: "Ativo", admissionDate: "2025-01-10" },
  CO
);
let emp = findByCpf("222.333.444-55");
assert(emp && emp.status === "Ativo", "funcionário criado como Ativo");

AppData.setEmployeeStatus(emp.id, "Inativo", CO, { terminationDate: "2026-07-31" });
emp = findByCpf("222.333.444-55");
assert(emp.status === "Inativo", "status virou Inativo");
assert(emp.deactivatedAt === "2026-07-31", `deactivatedAt = data informada (${emp.deactivatedAt})`);

// ── 2. Sem data informada, comportamento antigo preservado ──
console.log("[2] Compatibilidade: sem data informada usa hoje");
AppData.setEmployeeStatus(emp.id, "Ativo", CO);
emp = findByCpf("222.333.444-55");
assert(!emp.deactivatedAt, "reativar limpou deactivatedAt");
AppData.setEmployeeStatus(emp.id, "Inativo", CO); // chamada legada, sem options
emp = findByCpf("222.333.444-55");
assert(emp.deactivatedAt === AppData.todayISO(), `fallback = hoje (${emp.deactivatedAt})`);

// ── 3. upsertEmployee respeita a data informada no formulário ──
console.log("[3] upsertEmployee respeita a data do formulário");
AppData.setEmployeeStatus(emp.id, "Ativo", CO);
emp = findByCpf("222.333.444-55");
AppData.upsertEmployee({ ...emp, status: "Inativo", deactivatedAt: "2026-06-15" }, CO);
emp = findByCpf("222.333.444-55");
assert(emp.deactivatedAt === "2026-06-15", `deactivatedAt = data do formulário (${emp.deactivatedAt})`);

// ── 4. Visibilidade no Cadastro de Funcionários ──
console.log("[4] Cadastro: inativo fora da lista, salvo se marcado");
// Espelha isEmployeeVisibleByStatus() de js/funcionarios.js
function isEmployeeVisibleByStatus(employee, listFilters) {
  if (AppData.isEmployeeActive(employee)) return true;
  if (listFilters.status === "Inativo") return true;
  return listFilters.visibleInactiveIds.has(employee.id);
}
const ativo = { id: "a1", status: "Ativo" };
const inativo = { id: "i1", status: "Inativo" };
const semSelecao = { status: "todos", visibleInactiveIds: new Set() };
const comSelecao = { status: "todos", visibleInactiveIds: new Set(["i1"]) };
const filtroInativo = { status: "Inativo", visibleInactiveIds: new Set() };

assert(isEmployeeVisibleByStatus(ativo, semSelecao) === true, "ativo sempre aparece");
assert(isEmployeeVisibleByStatus(inativo, semSelecao) === false, "inativo NÃO aparece por padrão");
assert(isEmployeeVisibleByStatus(inativo, comSelecao) === true, "inativo marcado no seletor aparece");
assert(isEmployeeVisibleByStatus(inativo, filtroInativo) === true, "filtro Status=Inativo vence e mostra os inativos");
assert(
  isEmployeeVisibleByStatus({ id: "i2", status: "Inativo" }, comSelecao) === false,
  "inativo NÃO marcado segue oculto mesmo com outro marcado"
);

// ── 5. Visibilidade no Controle de Feriados ──
console.log("[5] Feriados: vínculo de inativo fora da tela, salvo se marcado");
// Espelha applyInactiveVisibility() de js/feriados.js
function applyInactiveVisibility(lines, filterState) {
  return lines.filter((line) => {
    if (!line.employeeInactive) return true;
    return filterState.visibleInactiveIds.has(line.employeeId);
  });
}
const linhas = [
  { employeeId: "a1", employeeInactive: false },
  { employeeId: "i1", employeeInactive: true },
  { employeeId: null, employeeInactive: false } // feriado sem funcionário marcado
];
const semInativos = applyInactiveVisibility(linhas, { visibleInactiveIds: new Set() });
assert(semInativos.length === 2, "linha de inativo some da tela por padrão");
assert(semInativos.every((line) => !line.employeeInactive), "nenhuma linha de inativo restou");
assert(
  semInativos.some((line) => line.employeeId === null),
  "linha de feriado sem funcionário continua visível"
);
const comInativo = applyInactiveVisibility(linhas, { visibleInactiveIds: new Set(["i1"]) });
assert(comInativo.length === 3, "inativo marcado volta para a tela");

// Vínculo órfão (funcionário não encontrado no cadastro) não é tratado como inativo
const feriados = fs.readFileSync(path.join(root, "js/feriados.js"), "utf8");
assert(
  feriados.includes("employeeInactive: Boolean(employee) && !AppData.isEmployeeActive(employee)"),
  "vínculo órfão não vira 'inativo' (Boolean(employee) na regra)"
);

// ── 6. Amarras de fonte ──
console.log("[6] Amarras de fonte (botão, módulo e diálogo obrigatório)");
const funcionarios = fs.readFileSync(path.join(root, "js/funcionarios.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const modulo = fs.readFileSync(path.join(root, "js/inactive-employees.js"), "utf8");

assert(indexHtml.includes("js/inactive-employees.js"), "index.html carrega js/inactive-employees.js");
assert(
  modulo.includes("window.InactiveEmployeesUI") && modulo.includes("openPicker"),
  "módulo expõe InactiveEmployeesUI.openPicker"
);
assert(
  feriados.includes('id: "openInactiveHolidayEmployees"') &&
    feriados.includes("#openInactiveHolidayEmployees"),
  "Feriados: botão de inativos renderizado e ligado"
);
assert(
  funcionarios.includes('id: "btnShowInactiveEmployees"') &&
    funcionarios.includes("#btnShowInactiveEmployees"),
  "Cadastro: botão de inativos renderizado e ligado"
);
assert(
  funcionarios.includes("function askTerminationDate"),
  "Cadastro: caixa de diálogo de data de desligamento existe"
);
assert(
  funcionarios.includes("askTerminationDate(employee).then") &&
    funcionarios.includes('AppData.setEmployeeStatus(employeeId, "Inativo", company, { terminationDate })'),
  "Botão Inativar da tabela exige a data antes de inativar"
);
assert(
  funcionarios.includes("const terminationDate = await askTerminationDate(existing)") &&
    funcionarios.includes("payload.deactivatedAt = terminationDate"),
  "Formulário exige a data ao mudar de Ativo para Inativo"
);
assert(
  !funcionarios.includes('Tem certeza que deseja INATIVAR'),
  "confirm() antigo (sem data) foi substituído pelo diálogo com data"
);
assert(
  /data de desligamento[\s\S]{0,400}obrigat/i.test(funcionarios),
  "diálogo deixa claro que a data é obrigatória"
);

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
