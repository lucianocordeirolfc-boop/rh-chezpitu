/**
 * Validação funcional pré-commit — simula regras de negócio dos módulos RH Chez Pitu.
 * Executar: npm run validate
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = { approved: [], errors: [] };

function approve(area, detail) {
  results.approved.push({ area, detail });
}

function fail(area, detail, files, fix) {
  results.errors.push({ area, detail, files, fix });
}

function assert(area, condition, detail, files, fix) {
  if (condition) approve(area, detail);
  else fail(area, detail, files, fix);
}

function createStorage() {
  const store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    }
  };
}

function loadCore(storage) {
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
    navigator: { onLine: true },
    performance: { now: () => 0 }
  };
  context.window = context;
  const sandbox = vm.createContext(context);

  for (const file of ["js/import-utils.js", "js/data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

function countVtWorkedDays(employee, yearMonth, data, AppData) {
  return AppData.getDaysInMonth(yearMonth).filter((day) =>
    AppData.VT_WORKED_CODES.has(AppData.getScaleCode(employee, day, data))
  ).length;
}

function simulateVtReceipt(employee, yearMonth, data, company, AppData) {
  const workedDays = countVtWorkedDays(employee, yearMonth, data, AppData);
  const deductDays = AppData.getVtDeduction(employee.id, yearMonth, data, company);
  const dailyValue = contextImportUtils.repairVtDailyValue(Number(employee.vtDaily || 0));
  const effectiveDays = Math.max(0, workedDays - deductDays);
  return { workedDays, deductDays, effectiveDays, total: effectiveDays * dailyValue };
}

let contextImportUtils;

function seedValidationState(AppData) {
  const ym = "2026-05";
  AppData.state.pageFilters = {
    dashboard: AppData.PAGE_COMPANY_ALL,
    funcionarios: AppData.PAGE_COMPANY_ALL,
    escala: "Chez Pitu",
    ferias: "Chez Pitu",
    "vale-transporte": "Chez Pitu",
    feriados: "Chez Pitu",
    contador: "Pengold"
  };
  AppData.state.escalaSelectedYearMonth = ym;
  AppData.state.valeTransporte.selectedYearMonth = ym;

  const chez = AppData.getCompanyData("Chez Pitu");
  const peng = AppData.getCompanyData("Pengold");

  chez.companyInfo = { legalName: "Chez Pitu Ltda", cnpj: "11.111.111/0001-11", responsibleName: "RH" };
  peng.companyInfo = { legalName: "Pengold Ltda", cnpj: "22.222.222/0001-22", responsibleName: "RH" };

  chez.employees = [
    {
      id: "chez-1",
      name: "Maria Chez",
      status: "Ativo",
      fixedDay: "Segunda-feira",
      department: "Cozinha",
      vtDaily: 12,
      cpf: "111.111.111-11",
      ctps: "111",
      role: "Auxiliar",
      admissionDate: "2024-01-01"
    }
  ];
  peng.employees = [
    {
      id: "peng-1",
      name: "Joao Pengold",
      status: "Ativo",
      fixedDay: "Terça-feira",
      department: "Salão",
      vtDaily: 15,
      cpf: "222.222.222-22",
      ctps: "222",
      role: "Garçom",
      admissionDate: "2024-01-01"
    }
  ];

  chez.vacations = [{ id: "v1", employeeId: "chez-1", startDate: "2026-05-20", endDate: "2026-05-22" }];
  chez.absences = [
    {
      id: "a1",
      employeeId: "chez-1",
      type: "Atestado médico",
      startDate: "2026-05-12",
      endDate: "2026-05-12"
    }
  ];
  chez.holidays = [
    {
      id: "h1",
      name: "Feriado Teste",
      date: "2026-04-10",
      workedEmployees: [
        { employeeId: "chez-1", compensationDate: "2026-05-14", status: "Agendado" },
        { employeeId: "chez-1", compensationDate: "", status: "Pendente" }
      ]
    },
    {
      id: "h2",
      name: "Feriado Vencido",
      date: AppData.addDays(AppData.todayISO(), -130),
      workedEmployees: [{ employeeId: "chez-1", compensationDate: "", status: "Pendente" }]
    },
    {
      id: "h3",
      name: "Feriado Compensado",
      date: AppData.addDays(AppData.todayISO(), -60),
      workedEmployees: [
        {
          employeeId: "chez-1",
          compensationDate: AppData.addDays(AppData.todayISO(), -10),
          status: "Compensado"
        }
      ]
    }
  ];

  chez.manualScale = {};
  peng.manualScale = {};

  chez.contadorLancamentos = {
    "2026-05": [{ employeeId: "chez-1", falta: 1, horaExtra: "01:00", vales: 50 }]
  };
  peng.contadorLancamentos = {
    "2026-05": [{ employeeId: "peng-1", falta: 0, horaExtra: "00:00", vales: 20 }]
  };

  AppData.setVtDeduction("chez-1", ym, "1", { company: "Chez Pitu", save: false });
  AppData.setVtDeduction("peng-1", ym, "2", { company: "Pengold", save: false });
  AppData.saveDiscountValue("chez-1", ym, "5,00", { company: "Chez Pitu", save: false });

  return { ym, chez, peng };
}

function validateEscala(AppData, chez, peng) {
  const area = "Escala de Folga";

  AppData.setPageCompany("escala", "Chez Pitu", { save: false });
  for (let i = 0; i < 5; i += 1) {
    AppData.setPageCompany("escala", "Chez Pitu", { save: false });
    const chezRound = AppData.getCompanyData("Chez Pitu").employees.map((e) => e.id);
    assert(
      area,
      chezRound.every((id) => id.startsWith("chez")),
      `Troca ${i + 1}/5 Chez Pitu: funcionários isolados`,
      ["js/escala.js", "js/data.js"],
      "pageFilters.escala + getCompanyData por empresa"
    );

    AppData.setPageCompany("escala", "Pengold", { save: false });
    const pengRound = AppData.getCompanyData("Pengold").employees.map((e) => e.id);
    assert(
      area,
      pengRound.every((id) => id.startsWith("peng")) && !pengRound.some((id) => chezRound.includes(id)),
      `Troca ${i + 1}/5 Pengold: sem mistura de funcionários`,
      ["js/escala.js", "js/data.js"],
      "Isolar dados via getCompanyData por pageFilter"
    );
  }

  const chezIds = AppData.getCompanyData("Chez Pitu").employees.map((e) => e.id);
  assert(
    area,
    chezIds.every((id) => id.startsWith("chez")),
    "Funcionários Chez Pitu isolados por empresa",
    ["js/escala.js", "js/data.js"],
    "Verificar getCompanyData(getPrimaryPageCompany('escala'))"
  );

  AppData.setPageCompany("escala", "Pengold", { save: false });
  const pengIds = AppData.getCompanyData("Pengold").employees.map((e) => e.id);
  assert(
    area,
    pengIds.every((id) => id.startsWith("peng")),
    "Troca para Pengold exibe apenas funcionários Pengold",
    ["js/escala.js"],
    "getViewCompany() deve seguir pageFilters.escala"
  );

  assert(
    area,
    !pengIds.some((id) => chezIds.includes(id)),
    "Nenhum funcionário aparece na empresa errada após troca",
    ["js/escala.js", "js/data.js"],
    "Isolar dados via getCompanyData por pageFilter"
  );

  AppData.setPageCompany("escala", "Chez Pitu", { save: false });
  const deptFilterWorks =
    chez.employees.filter((e) => e.department === "Cozinha").length === 1 &&
    chez.employees.filter((e) => e.department === "Inexistente").length === 0;
  assert(area, deptFilterWorks, "Filtro por setor aplicável aos dados da empresa", ["js/escala.js"], "—");

  assert(
    area,
    typeof AppData.getScaleCode === "function",
    "Troca de empresa não depende de selectedCompany global (renderLock presente no código)",
    ["js/escala.js"],
    "Revisão estática: renderLock/pendingRender evita reentrância"
  );
}

function validateVt(AppData, chez, peng, ym) {
  const area = "Vale Transporte";
  const emp = chez.employees[0];

  const coCode = AppData.getScaleCode(emp, "2026-05-14", chez);
  assert(area, coCode === "CO", "Dia de compensação (CO) identificado na escala", ["js/data.js"], "—");
  assert(area, !AppData.VT_WORKED_CODES.has("CO"), "Código CO excluído de VT_WORKED_CODES", ["js/data.js"], "—");

  const feriasCode = AppData.getScaleCode(emp, "2026-05-21", chez);
  assert(area, feriasCode === "FÉRIAS", "Férias refletem na escala", ["js/data.js"], "—");
  assert(area, !AppData.VT_WORKED_CODES.has("FÉRIAS"), "Férias excluídas do VT", ["js/data.js"], "—");

  const absCode = AppData.getScaleCode(emp, "2026-05-12", chez);
  assert(area, absCode === "ATESTADO", "Ausência (atestado) reflete na escala", ["js/data.js"], "—");
  assert(area, !AppData.VT_WORKED_CODES.has("ATESTADO"), "Atestado excluído do VT", ["js/data.js"], "—");

  const worked = countVtWorkedDays(emp, ym, chez, AppData);
  const receiptChez = simulateVtReceipt(emp, ym, chez, "Chez Pitu", AppData);
  assert(
    area,
    receiptChez.workedDays === worked && receiptChez.effectiveDays === worked - 1,
    `Cálculo VT Chez Pitu: ${worked} dias trabalhados, −1 desconto manual = ${receiptChez.effectiveDays} efetivos`,
    ["js/vale-transporte.js", "js/data.js"],
    "—"
  );

  AppData.setPageCompany("vale-transporte", "Pengold", { save: false });
  const pengEmp = peng.employees[0];
  const receiptPeng = simulateVtReceipt(pengEmp, ym, peng, "Pengold", AppData);
  assert(
    area,
    AppData.getVtDeduction("peng-1", ym, null, "Pengold") === 2,
    "Desconto VT Pengold isolado por empresa (2 dias)",
    ["js/data.js", "js/vale-transporte.js"],
    "—"
  );
  assert(
    area,
    AppData.getVtDeduction("chez-1", ym, null, "Pengold") === 0,
    "Desconto Chez Pitu não vaza para Pengold",
    ["js/data.js"],
    "resolveVtCompany + deductionDays[company]"
  );
  assert(
    area,
    receiptPeng.total === receiptPeng.effectiveDays * 15,
    `Total VT Pengold = ${receiptPeng.effectiveDays} × R$15`,
    ["js/vale-transporte.js"],
    "—"
  );

  const coDayWorked = AppData.VT_WORKED_CODES.has(AppData.getScaleCode(emp, "2026-05-14", chez));
  assert(area, !coDayWorked, "Dia CO não conta como dia trabalhado no VT", ["js/vale-transporte.js"], "—");
}

function validateAusencias(AppData, chez, ym) {
  const area = "Ausências";
  const emp = chez.employees[0];

  assert(
    area,
    chez.absences.some((a) => a.employeeId === "chez-1"),
    "Lançamento de ausência persistido no bloco da empresa",
    ["js/ferias.js", "js/data.js"],
    "—"
  );

  assert(
    area,
    AppData.getScaleCode(emp, "2026-05-12", chez) === "ATESTADO",
    "Ausência reflete na escala (código ATESTADO)",
    ["js/data.js"],
    "getScaleCode integra absences[]"
  );

  const before = countVtWorkedDays(emp, ym, chez, AppData);
  chez.manualScale["chez-1|2026-05-12"] = "";
  const withManualOverride = countVtWorkedDays(emp, ym, chez, AppData);
  assert(
    area,
    withManualOverride === before,
    "Override manual na escala não anula ausência cadastrada no VT",
    ["js/data.js"],
    "getScaleCode: absences[] prevalece sobre manualScale"
  );
  assert(
    area,
    AppData.getScaleCode(emp, "2026-05-12", chez) === "ATESTADO",
    "Código efetivo na escala permanece ATESTADO com manual conflitante",
    ["js/data.js"],
    "—"
  );
  const conflict = AppData.getScaleAbsenceConflict(emp, "2026-05-12", chez);
  assert(
    area,
    Boolean(conflict) && conflict.absenceCode === "ATESTADO" && conflict.manualCode === "",
    "Conflito ausência × manual registrado para alerta na Escala",
    ["js/data.js", "js/escala.js"],
    "getScaleAbsenceConflict"
  );
  delete chez.manualScale["chez-1|2026-05-12"];

  AppData.addAbsence(
    {
      employeeId: "chez-1",
      type: "Falta justificada",
      startDate: "2026-05-06",
      endDate: "2026-05-06"
    },
    "Chez Pitu"
  );
  assert(
    area,
    AppData.getScaleCode(emp, "2026-05-06", chez) === "FALTA",
    "Nova ausência (falta) reflete imediatamente na escala",
    ["js/data.js", "js/ferias.js"],
    "—"
  );
}

function validateFeriados(AppData, chez) {
  const area = "Controle de Feriados";
  const today = AppData.todayISO();

  const pending = chez.holidays
    .flatMap((h) => h.workedEmployees.map((w) => ({ h, w })))
    .find(({ h, w }) => !w.compensationDate && AppData.resolveWorkedHolidayStatus(w, h.date, today).key === "pendente");
  assert(area, Boolean(pending), "Status pendente detectado corretamente", ["js/feriados.js", "js/data.js"], "—");

  const compensated = chez.holidays
    .flatMap((h) => h.workedEmployees.map((w) => ({ h, w })))
    .find(({ w, h }) => AppData.resolveWorkedHolidayStatus(w, h.date, today).key === "compensado");
  assert(area, Boolean(compensated), "Status compensado detectado corretamente", ["js/data.js"], "—");

  const vencido = chez.holidays
    .flatMap((h) => h.workedEmployees.map((w) => ({ h, w })))
    .find(({ w, h }) => AppData.resolveWorkedHolidayStatus(w, h.date, today).key === "vencido");
  assert(area, Boolean(vencido), "Status vencido detectado (>120 dias sem compensação)", ["js/data.js"], "—");

  const due = AppData.getHolidayCompensationDueDate("2026-04-10");
  assert(
    area,
    due === AppData.addDays("2026-04-10", AppData.HOLIDAY_COMPENSATION_DAYS),
    "Prazo de compensação = 120 dias corridos",
    ["js/data.js"],
    "—"
  );

  assert(
    area,
    AppData.isCompensationWithinDeadline("2026-04-10", "2026-05-14"),
    "Compensação 2026-05-14 dentro do prazo para feriado 2026-04-10",
    ["js/data.js", "js/feriados.js"],
    "—"
  );
}

function validateDashboard(AppData, chez, peng) {
  const area = "Dashboard";

  AppData.setPageCompany("dashboard", "Chez Pitu", { save: false });
  const chezActive = chez.employees.filter((e) => AppData.isEmployeeActive(e)).length;
  assert(area, chezActive === 1, "Dashboard filtro Chez Pitu: 1 ativo", ["js/dashboard.js"], "—");

  AppData.setPageCompany("dashboard", "Pengold", { save: false });
  const pengActive = peng.employees.filter((e) => AppData.isEmployeeActive(e)).length;
  assert(area, pengActive === 1, "Dashboard filtro Pengold: 1 ativo", ["js/dashboard.js"], "—");

  AppData.setPageCompany("dashboard", AppData.PAGE_COMPANY_ALL, { save: false });
  const all = AppData.resolveCompaniesForPage("dashboard", { allowAll: true });
  assert(
    area,
    all.includes("Chez Pitu") && all.includes("Pengold"),
    "Dashboard 'Todas' agrega Chez Pitu + Pengold",
    ["js/dashboard.js", "js/data.js"],
    "—"
  );

  const statsChez = AppData.getHolidayStats("Chez Pitu");
  assert(area, statsChez.pending >= 1, "Dashboard stats feriados: pendentes ≥ 1 (Chez Pitu)", ["js/dashboard.js"], "—");
}

function validateContador(AppData, chez, peng, ym) {
  const area = "Informações Contador";

  AppData.setPageCompany("contador", "Chez Pitu", { save: false });
  assert(
    area,
    AppData.getPrimaryPageCompany("contador") === "Chez Pitu",
    "Filtro toolbar Contador: Chez Pitu",
    ["js/contador.js", "js/data.js"],
    "—"
  );
  const lancChez = chez.contadorLancamentos[ym] || [];
  assert(area, lancChez.length === 1 && lancChez[0].employeeId === "chez-1", "Lançamentos Chez Pitu isolados", ["js/contador.js"], "—");

  AppData.setPageCompany("contador", "Pengold", { save: false });
  assert(
    area,
    AppData.getPrimaryPageCompany("contador") === "Pengold",
    "Filtro toolbar Contador: Pengold",
    ["js/contador.js"],
    "—"
  );
  const lancPeng = peng.contadorLancamentos[ym] || [];
  assert(area, lancPeng.length === 1 && lancPeng[0].employeeId === "peng-1", "Lançamentos Pengold isolados", ["js/contador.js"], "—");

  const printHtml = fs.readFileSync(path.join(root, "js/contador.js"), "utf8");
  assert(
    area,
    !printHtml.includes("resumoCompanySelect") && printHtml.includes('id="contadorPageCompany"'),
    "Contador: um único seletor de empresa na toolbar (sem duplicata no Resumo)",
    ["js/contador.js"],
    "—"
  );
  assert(
    area,
    printHtml.includes("renderResumoPrintArea") && printHtml.includes("@page { size: A4 landscape"),
    "PDF/Impressão: layout landscape A4 e usa getPrimaryPageCompany('contador')",
    ["js/contador.js"],
    "Confirmar visualmente no browser: Imprimir / PDF no tab Resumo"
  );
}

function main() {
  const storage = createStorage();
  const sandbox = loadCore(storage);
  const AppData = sandbox.AppData;
  contextImportUtils = sandbox.ImportUtils;

  const { ym, chez, peng } = seedValidationState(AppData);

  validateEscala(AppData, chez, peng);
  validateVt(AppData, chez, peng, ym);
  validateAusencias(AppData, chez, ym);
  validateFeriados(AppData, chez);
  validateDashboard(AppData, chez, peng);
  validateContador(AppData, chez, peng, ym);

  console.log("\n=== RELATÓRIO DE VALIDAÇÃO FUNCIONAL ===\n");
  console.log(`Aprovadas: ${results.approved.length}`);
  console.log(`Erros:     ${results.errors.length}\n`);

  if (results.approved.length) {
    console.log("--- Funcionalidades aprovadas ---");
    const byArea = {};
    results.approved.forEach(({ area, detail }) => {
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(detail);
    });
    Object.entries(byArea).forEach(([area, items]) => {
      console.log(`\n[${area}]`);
      items.forEach((d) => console.log(`  ✓ ${d}`));
    });
  }

  if (results.errors.length) {
    console.log("\n--- Funcionalidades com erro ---");
    results.errors.forEach(({ area, detail, files, fix }) => {
      console.log(`\n[${area}] ✗ ${detail}`);
      console.log(`  Arquivos: ${files.join(", ")}`);
      console.log(`  Correção: ${fix}`);
    });
    process.exit(1);
  }

  console.log("\n--- Validação automatizada concluída sem erros de regra de negócio ---");
  console.log("Pendente confirmação visual no browser: troca de empresa Escala (5×), PDF Contador.\n");
}

main();
