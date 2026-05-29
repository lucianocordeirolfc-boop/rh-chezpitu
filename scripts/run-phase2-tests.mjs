import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function createStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    _dump() {
      return store;
    }
  };
}

function loadScripts(storage) {
  const context = {
    window: {},
    localStorage: storage,
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    navigator: { onLine: true }
  };
  context.window = context;
  const sandbox = vm.createContext(context);

  for (const file of ["js/import-utils.js", "js/data.js"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }

  return sandbox.AppData;
}

function seedState(AppData) {
  const state = AppData.state;
  state.pageFilters = {
    dashboard: AppData.PAGE_COMPANY_ALL,
    funcionarios: AppData.PAGE_COMPANY_ALL,
    escala: "Chez Pitu",
    ferias: "Chez Pitu",
    "vale-transporte": "Chez Pitu",
    feriados: "Chez Pitu",
    contador: "Pengold"
  };
  state.companies["Chez Pitu"].employees = [
    {
      id: "emp-1",
      name: "Ana Teste",
      status: "Ativo",
      fixedDay: "Segunda-feira",
      vtDaily: 10,
      admissionDate: "2024-01-01"
    }
  ];
  state.companies["Chez Pitu"].absences = [
    {
      id: "abs-1",
      employeeId: "emp-1",
      type: "Atestado médico",
      startDate: "2026-05-10",
      endDate: "2026-05-12"
    }
  ];
  state.companies["Chez Pitu"].holidays = [
    {
      id: "hol-1",
      name: "Feriado Teste",
      date: "2026-04-01",
      workedEmployees: [
        {
          employeeId: "emp-1",
          compensationDate: "2026-05-15",
          status: "Agendado"
        }
      ]
    }
  ];
}

function runTests() {
  const storage = createStorage();
  const AppData = loadScripts(storage);
  seedState(AppData);

  const chez = AppData.getCompanyData("Chez Pitu");

  assert(!AppData.state.selectedCompany, "selectedCompany removido do estado");
  assert(AppData.getPrimaryPageCompany("vale-transporte") === "Chez Pitu", "filtro VT por página");
  assert(AppData.getPrimaryPageCompany("contador") === "Pengold", "filtro contador por página");

  AppData.setVtDeduction("emp-1", "2026-05", "2", { company: "Chez Pitu", save: false });
  assert(AppData.getVtDeduction("emp-1", "2026-05", null, "Chez Pitu") === 2, "VT único em valeTransporte");
  assert(!chez.vtDeductions, "vtDeductions removido do bloco da empresa");

  AppData.saveDiscountValue("emp-1", "2026-05", "12,50", { company: "Chez Pitu", save: false });
  assert(AppData.getDiscountValue("emp-1", "2026-05", "Chez Pitu") === 12.5, "desconto VT por empresa");

  const absenceCode = AppData.getScaleCode(chez.employees[0], "2026-05-11", chez);
  assert(absenceCode === "ATESTADO", "ausência integrada na escala");

  const coCode = AppData.getScaleCode(chez.employees[0], "2026-05-15", chez);
  assert(coCode === "CO", "CO integrado na escala");

  const vtWorked = AppData.VT_WORKED_CODES.has(coCode);
  assert(!vtWorked, "CO não conta para VT");

  const statsBefore = chez.holidays[0].workedEmployees[0].status;
  AppData.getHolidayStats("Chez Pitu");
  const statsAfter = chez.holidays[0].workedEmployees[0].status;
  assert(statsBefore === statsAfter, "getHolidayStats não muta estado");

  assert(
    AppData.isCompensationWithinDeadline("2026-04-01", "2026-05-15"),
    "compensação dentro de 120 dias"
  );
  assert(
    !AppData.isCompensationWithinDeadline("2026-04-01", "2026-09-01"),
    "compensação fora de 120 dias"
  );

  const localSnapshot = JSON.parse(JSON.stringify(AppData.state));
  localSnapshot.valeTransporte.deductionDays["Chez Pitu"]["emp-1|2026-05"] = 9;
  const remoteSnapshot = JSON.parse(JSON.stringify(AppData.state));
  remoteSnapshot.valeTransporte.deductionDays["Chez Pitu"]["emp-1|2026-05"] = 1;
  remoteSnapshot.companies["Chez Pitu"].employees[0].name = "Remoto";

  const merged = AppData.mergeRemoteIntoLocal(localSnapshot, remoteSnapshot);
  AppData.setRemoteState(merged);
  assert(
    AppData.getVtDeduction("emp-1", "2026-05", null, "Chez Pitu") === 9,
    "merge VT preferindo local"
  );
  assert(
    AppData.getCompanyData("Chez Pitu").employees[0].name === "Ana Teste",
    "merge funcionários preferindo local"
  );

  assert(!storage.getItem("chezPituVtBackup.v1"), "backup VT legado ausente após carga");

  console.log(`\nResultado: ${passed} passou, ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

runTests();
