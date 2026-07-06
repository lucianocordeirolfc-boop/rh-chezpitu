/**
 * Verificação da funcionalidade "Vincular funcionário a feriado" (vínculo manual).
 * Homologação temporária — não versionar.
 * Uso: node scripts/verify-vinculo-manual.mjs
 *
 * Cobre: addManualWorkedEmployee (criação Pendente/Manual), bloqueio de
 * duplicidade, visibilidade no modal CO (getAvailableCoHolidayOptions) e
 * getSystemVersion (auditoria de versão).
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
    { id: "e-renan",     name: "Renan Gonçalves",          company: "Chez Pitu", status: "Ativo", department: "Cozinha",     admissionDate: "2024-01-01" },
    { id: "e-cristiane", name: "Cristiane da S. Azevedo",  company: "Chez Pitu", status: "Ativo", department: "Recepção",    admissionDate: "2024-01-01" },
    { id: "e-rosana",    name: "Rosana Santos de Freitas", company: "Chez Pitu", status: "Ativo", department: "Limpeza",     admissionDate: "2024-01-01" },
    { id: "e-outro",     name: "Funcionário Não Vinculado", company: "Chez Pitu", status: "Ativo", department: "Salão",      admissionDate: "2024-01-01" },
  ];
  return {
    calendarHolidays: [
      { id: "cal-seed-2026-tiradentes", date: "2026-04-21", name: "Tiradentes", type: "nacional", companies: ["ambas"] },
      { id: "cal-seed-2026-sao-jorge",  date: "2026-04-23", name: "São Jorge",  type: "estadual", companies: ["ambas"] },
    ],
    companies: {
      "Chez Pitu": {
        employees, vacations: [], absences: [], manualScale: {},
        holidays: [
          { id: "h-tiradentes", name: "Tiradentes", date: "2026-04-21", workedEmployees: [] },
          { id: "h-sao-jorge",  name: "São Jorge",  date: "2026-04-23", workedEmployees: [] },
        ]
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

console.log("\n=== VERIFICAÇÃO: Vínculo manual funcionário × feriado ===\n");

const storage = createStorage({
  chezPituPeopleSystem: JSON.stringify(buildState()),
  "chezPituPeopleSystem.v1": JSON.stringify(buildState())
});
// Garante que o seed não recria nada e não atrapalha o estado de teste.
storage.setItem("chezPituHolidaySeed2026.v2", new Date().toISOString());

// Reconstrói storage com a chave real usada pelo data.js.
const sb = loadCore(storage);
const AppData = sb.window.AppData;
const STORAGE_KEY = AppData.STORAGE_KEY;
// Injeta o estado de teste na chave correta e recarrega.
storage.setItem(STORAGE_KEY, JSON.stringify(buildState()));
const sb2 = loadCore(storage);
const App = sb2.window.AppData;

const company = "Chez Pitu";

// 1. Vincular Renan e Cristiane ao Tiradentes
console.log("[Tiradentes]");
check("Vincula Renan (ok)", App.addManualWorkedEmployee("h-tiradentes", "e-renan", { company }).ok);
check("Vincula Cristiane (ok)", App.addManualWorkedEmployee("h-tiradentes", "e-cristiane", { company }).ok);

const tira = App.getCompanyData(company).holidays.find(h => h.id === "h-tiradentes");
check("Tiradentes tem 2 vínculos", (tira.workedEmployees || []).length === 2);
const renanEntry = tira.workedEmployees.find(w => w.employeeId === "e-renan");
check("Vínculo Renan: status Pendente", renanEntry.status === "Pendente");
check("Vínculo Renan: origem Manual", renanEntry.origin === "Manual");
check("Vínculo Renan: sem data de compensação", !renanEntry.compensationDate);

// 2. Duplicidade Pendente: UPSERT confirma (ok=true), sem duplicar, com detalhes.
const dup = App.addManualWorkedEmployee("h-tiradentes", "e-renan", { company });
check("Duplicado Pendente confirmado (ok=true)", dup.ok === true);
check("Duplicado Pendente retorna mensagem", typeof dup.message === "string" && dup.message.length > 0);
check("Duplicado Pendente devolve detalhes do vínculo (existing)", dup.existing && dup.existing.holidayId === "h-tiradentes");
check("Tiradentes continua com 2 vínculos (sem duplicar)", tira.workedEmployees.length === 2);

// 2b. Duplicidade Agendada: BLOQUEIA (ok=false) mas devolve detalhes para o
// diálogo "Ver vínculo existente" e garante visibilidade no Histórico.
const renanRef = tira.workedEmployees.find(w => w.employeeId === "e-renan");
renanRef.compensationDate = "2099-01-01"; // futuro → Agendado
const blocked = App.addManualWorkedEmployee("h-tiradentes", "e-renan", { company });
check("Duplicado Agendado bloqueado (ok=false)", blocked.ok === false);
check("Duplicado Agendado sinaliza blocked", blocked.blocked === true);
check("Duplicado Agendado devolve detalhes (status Agendado)", blocked.existing && blocked.existing.statusKey === "agendado");
check("Duplicado Agendado tem mensagem explicativa", typeof blocked.message === "string" && blocked.message.length > 0);
// Limpa para não afetar testes seguintes do modal CO.
renanRef.compensationDate = "";
App.syncWorkedEmployeeStatus(renanRef, tira.date);

// 2c. Visibilidade no Histórico mesmo se o feriado for anterior à admissão:
// vínculo manual confirmado deve aparecer (historyOverride).
const tiraData = App.getCompanyData(company);
check("Vínculo manual visível no Histórico", App.isWorkedEntryVisibleInHistory(tira, renanRef, tiraData));
check("Vínculo manual marcado com historyOverride", renanRef.historyOverride === true);

// 3. São Jorge: Renan, Cristiane, Rosana
console.log("\n[São Jorge]");
check("Vincula Renan", App.addManualWorkedEmployee("h-sao-jorge", "e-renan", { company }).ok);
check("Vincula Cristiane", App.addManualWorkedEmployee("h-sao-jorge", "e-cristiane", { company }).ok);
check("Vincula Rosana", App.addManualWorkedEmployee("h-sao-jorge", "e-rosana", { company }).ok);
const sj = App.getCompanyData(company).holidays.find(h => h.id === "h-sao-jorge");
check("São Jorge tem 3 vínculos", sj.workedEmployees.length === 3);

// 4. Visibilidade no modal CO
console.log("\n[Modal CO]");
const renanCo = App.getAvailableCoHolidayOptions("e-renan", "2026-05-10", { company });
const renanNames = renanCo.map(o => o.holiday.name);
check("Renan: Tiradentes aparece no CO", renanNames.includes("Tiradentes"));
check("Renan: São Jorge aparece no CO", renanNames.includes("São Jorge"));

const rosanaCo = App.getAvailableCoHolidayOptions("e-rosana", "2026-05-10", { company });
const rosanaNames = rosanaCo.map(o => o.holiday.name);
check("Rosana: São Jorge aparece no CO", rosanaNames.includes("São Jorge"));
check("Rosana: Tiradentes NÃO aparece (não vinculada)", !rosanaNames.includes("Tiradentes"));

const outroCo = App.getAvailableCoHolidayOptions("e-outro", "2026-05-10", { company });
check("Não vinculado: nenhum feriado no CO", outroCo.length === 0);

// 5. getSystemVersion
console.log("\n[getSystemVersion]");
const v = App.getSystemVersion();
check("version preenchida", typeof v.version === "string" && v.version.length > 0);
check("version vem do version.js (não 'dev')", v.version !== "dev");
check("environment definido", v.environment === "LOCAL" || v.environment === "PRODUÇÃO");
check("buildDate presente", typeof v.buildDate === "string" && v.buildDate.length > 0);
check("branch presente", typeof v.branch === "string" && v.branch.length > 0);
check("commit presente", typeof v.commit === "string" && v.commit.length > 0);

console.log(`\n=== RESUMO: ${pass} passou, ${fail} falhou ===\n`);
process.exit(fail ? 1 : 0);
