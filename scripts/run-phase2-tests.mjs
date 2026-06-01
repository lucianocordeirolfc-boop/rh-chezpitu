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

  // === Item 1: fonte única de "dia trabalhado" (VT × Escala × Feriados × Dashboard) ===
  assert(AppData.isWorkedScaleCode("") === true, "fonte única: dia normal (vazio) é trabalhado");
  assert(AppData.isWorkedScaleCode("CO") === false, "fonte única: CO não é dia trabalhado");
  assert(AppData.isWorkedScaleCode("FÉRIAS") === false, "fonte única: FÉRIAS não é dia trabalhado");
  assert(AppData.isWorkedScaleCode("ATESTADO") === false, "fonte única: ATESTADO não é dia trabalhado");
  assert(AppData.isWorkedScaleCode("LICENÇA") === false, "fonte única: LICENÇA não é dia trabalhado");
  assert(AppData.isWorkedScaleCode("FALTA") === false, "fonte única: FALTA não é dia trabalhado");
  assert(AppData.isWorkedScaleCode("TM") === true, "fonte única: TM (cobertura) é dia trabalhado");
  assert(
    [...AppData.VT_WORKED_CODES].every((code) => AppData.isWorkedScaleCode(code)),
    "fonte única: VT_WORKED_CODES sem divergência (todos trabalhados)"
  );
  assert(
    ["CO", "FÉRIAS", "ATESTADO", "LICENÇA", "FALTA", "TM", ""].every(
      (code) => AppData.isWorkedScaleCode(code) === !AppData.isNotWorkedScaleCode(code)
    ),
    "fonte única: isWorkedScaleCode e isNotWorkedScaleCode são complementares"
  );
  AppData.state.scaleCodeConfig = { TM: "not-worked", FALTA: "worked" };
  assert(AppData.isWorkedScaleCode("TM") === false, "scaleCodeConfig: TM reconfigurado vira não trabalhado");
  assert(AppData.isWorkedScaleCode("FALTA") === true, "scaleCodeConfig: FALTA reconfigurado vira trabalhado");
  AppData.state.scaleCodeConfig = {};
  assert(
    AppData.isWorkedScaleCode("TM") === true && AppData.isWorkedScaleCode("FALTA") === false,
    "scaleCodeConfig: reset volta ao default canônico"
  );

  // === Item 2: gravação resolve empresa pelo employeeId, nunca pelo filtro de página ===
  assert(
    AppData.resolveCompanyForEmployeeWrite("emp-1", "Pengold", "vale-transporte") === "Chez Pitu",
    "gravação resolve empresa por employeeId, ignorando empresa errada no parâmetro"
  );
  assert(
    AppData.resolveCompanyForEmployeeWrite("inexistente", "Pengold", "ferias") === "Pengold",
    "employeeId inexistente: fallback seguro usa a empresa explícita (bloco)"
  );
  AppData.setVtDeduction("emp-1", "2026-07", "5", { company: "Pengold", save: false });
  assert(
    AppData.getVtDeduction("emp-1", "2026-07", null, "Chez Pitu") === 5,
    "setVtDeduction grava na empresa real do funcionário (Chez Pitu), não no filtro"
  );
  assert(
    AppData.getVtDeduction("emp-1", "2026-07", null, "Pengold") === 0,
    "setVtDeduction não vaza desconto para a empresa do filtro (Pengold)"
  );

  // === Fase 2: empresa ativa (aba) como contexto único ===
  AppData.setActiveCompany("Pengold", { save: false });
  assert(AppData.getActiveCompany() === "Pengold", "setActiveCompany define a empresa ativa");
  assert(
    ["dashboard", "escala", "ferias", "vale-transporte", "feriados", "contador", "funcionarios"].every(
      (m) => AppData.getPrimaryPageCompany(m) === "Pengold"
    ),
    "Aba ativa propaga para todos os módulos (sem filtros internos)"
  );
  const chezEmpsBefore = AppData.getCompanyData("Chez Pitu").employees.length;
  AppData.setActiveCompany("Chez Pitu", { save: false });
  assert(
    AppData.getActiveCompany() === "Chez Pitu" &&
      AppData.getCompanyData("Chez Pitu").employees.length === chezEmpsBefore,
    "Trocar de aba muda o contexto sem apagar dados"
  );

  // === Proteção dos dados da empresa (dados críticos — nunca apagar) ===
  const okSave = AppData.updateCompanyInfo(
    { legalName: "Chez Pitu Ltda", cnpj: "11.222.333/0001-81", responsibleName: "RH", address: "Rua A, 100", phones: "(22) 1111-2222" },
    "Chez Pitu"
  );
  assert(okSave === true, "updateCompanyInfo salva dados válidos da empresa");
  let cInfo = AppData.getCompanyData("Chez Pitu").companyInfo;
  assert(
    cInfo.cnpj === "11.222.333/0001-81" && cInfo.legalName === "Chez Pitu Ltda" && cInfo.updatedAt > 0,
    "dados da empresa persistidos com carimbo updatedAt"
  );
  let diag = AppData.diagnoseCompanyData("Chez Pitu");
  assert(diag.hasBackup === true && diag.meaningful === true && diag.inconsistencies.length === 0, "backup criado após salvar; diagnóstico OK");

  // Tentar esvaziar um registro válido NÃO apaga os dados (merge preserva)
  AppData.updateCompanyInfo({ legalName: "", cnpj: "" }, "Chez Pitu");
  assert(
    AppData.getCompanyData("Chez Pitu").companyInfo.cnpj === "11.222.333/0001-81" &&
      AppData.getCompanyData("Chez Pitu").companyInfo.legalName === "Chez Pitu Ltda",
    "tentar esvaziar não apaga os dados (CNPJ e Razão Social preservados)"
  );

  // Merge campo a campo: campos vazios não apagam os existentes
  AppData.updateCompanyInfo({ responsibleName: "Novo Resp", legalName: "", cnpj: "" }, "Chez Pitu");
  cInfo = AppData.getCompanyData("Chez Pitu").companyInfo;
  assert(
    cInfo.responsibleName === "Novo Resp" && cInfo.cnpj === "11.222.333/0001-81" && cInfo.legalName === "Chez Pitu Ltda" && cInfo.phones === "(22) 1111-2222",
    "merge preserva campos não enviados/vazios (CNPJ, Razão Social, Telefones)"
  );

  // Recuperação automática no carregamento (companyInfo esvaziado + backup)
  const lost = JSON.parse(JSON.stringify(AppData.state));
  lost.companies["Chez Pitu"].companyInfo = { legalName: "", cnpj: "" };
  const recovered = AppData.finalizeIncomingState(lost);
  assert(
    recovered.companies["Chez Pitu"].companyInfo.cnpj === "11.222.333/0001-81" &&
      recovered.companies["Chez Pitu"].companyInfo.legalName === "Chez Pitu Ltda",
    "recuperação automática restaura CNPJ e Razão Social do backup ao carregar"
  );

  // Merge Firebase: remoto vazio NÃO apaga local preenchido
  const localFb = JSON.parse(JSON.stringify(AppData.state));
  const remoteFb = JSON.parse(JSON.stringify(AppData.state));
  remoteFb.companies["Chez Pitu"].companyInfo = { legalName: "", cnpj: "" };
  const mergedFb = AppData.mergeRemoteIntoLocal(localFb, remoteFb);
  assert(
    mergedFb.companies["Chez Pitu"].companyInfo.cnpj === "11.222.333/0001-81",
    "merge Firebase preserva dados da empresa (remoto vazio não apaga)"
  );

  // Logo: remover sem force preserva; com force remove
  AppData.updateCompanyLogo("data:image/png;base64,AAA", "Chez Pitu");
  assert(AppData.getCompanyData("Chez Pitu").companyInfo.logoDataUrl === "data:image/png;base64,AAA", "logo salvo");
  const logoBlocked = AppData.updateCompanyLogo("", "Chez Pitu");
  assert(logoBlocked === false && AppData.getCompanyData("Chez Pitu").companyInfo.logoDataUrl !== "", "logo preservado sem force");
  AppData.updateCompanyLogo("", "Chez Pitu", { force: true });
  assert(AppData.getCompanyData("Chez Pitu").companyInfo.logoDataUrl === "", "logo removido com force (confirmação explícita)");

  // Isolamento por empresa
  AppData.updateCompanyInfo({ legalName: "Pengold Ltda", cnpj: "99.888.777/0001-66" }, "Pengold");
  assert(
    AppData.getCompanyData("Chez Pitu").companyInfo.cnpj !== AppData.getCompanyData("Pengold").companyInfo.cnpj,
    "CNPJ não vaza entre Chez Pitu e Pengold"
  );

  // Restauração manual a partir do backup
  AppData.state.companies["Chez Pitu"].companyInfo = { legalName: "", cnpj: "" };
  assert(AppData.restoreCompanyInfoFromBackup("Chez Pitu") === true, "restauração manual do backup retorna true");
  assert(AppData.getCompanyData("Chez Pitu").companyInfo.cnpj === "11.222.333/0001-81", "dados restaurados manualmente do backup");

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
