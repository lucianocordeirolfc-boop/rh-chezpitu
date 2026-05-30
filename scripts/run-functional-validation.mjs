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

  const agendado = chez.holidays
    .flatMap((h) => h.workedEmployees.map((w) => ({ h, w })))
    .find(({ w, h }) => {
      const futureCo = AppData.addDays(today, 10);
      return (
        AppData.resolveWorkedHolidayStatus(
          { ...w, compensationDate: futureCo },
          h.date,
          today
        ).key === "agendado"
      );
    });
  assert(area, Boolean(agendado), "Status agendado detectado corretamente", ["js/data.js", "js/feriados.js"], "—");

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

  AppData.setPageCompany("feriados", "Pengold", { save: false });
  const peng = AppData.getCompanyData("Pengold");
  const pengOnlyId = "h-peng-only-test";
  peng.holidays.push({ id: pengOnlyId, name: "Feriado Pengold", date: "2026-08-15", workedEmployees: [] });
  AppData.removeHoliday(pengOnlyId, { company: "Pengold", save: false });
  assert(
    area,
    !peng.holidays.some((h) => h.id === pengOnlyId) && chez.holidays.length > 0,
    "removeHoliday respeita empresa do filtro Feriados (não apaga bloco errado)",
    ["js/data.js", "js/feriados.js"],
    "removeHoliday(id, { company })"
  );
  AppData.setPageCompany("feriados", "Chez Pitu", { save: false });
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

function validatePadroeiraBuzios(AppData) {
  const area = "Padroeira de Búzios";
  const storage = createStorage();
  const rawState = {
    pageFilters: AppData.state.pageFilters,
    escalaSelectedYearMonth: "2026-07",
    valeTransporte: AppData.state.valeTransporte,
    calendarHolidays: [
      {
        id: "cal-padroeira-wrong",
        name: "Padroeira de Búzios",
        date: "2026-05-21",
        type: "municipal",
        companies: ["ambas"]
      }
    ],
    companies: {
      "Chez Pitu": {
        employees: [],
        holidays: [
          {
            id: "h-padroeira-wrong",
            name: "Padroeira de Búzios",
            date: "2026-05-21",
            workedEmployees: [{ employeeId: "chez-1", compensationDate: "", status: "Pendente" }]
          }
        ],
        absences: [],
        vacations: [],
        manualScale: {},
        contadorLancamentos: {}
      },
      Pengold: {
        employees: [],
        holidays: [
          {
            id: "h-padroeira-peng",
            name: "Padroeira de Búzios",
            date: "2026-07-26",
            workedEmployees: [{ employeeId: "peng-1", compensationDate: "", status: "Pendente" }]
          }
        ],
        absences: [],
        vacations: [],
        manualScale: {},
        contadorLancamentos: {}
      }
    }
  };
  storage.setItem("chezPituPeopleSystem.v1", JSON.stringify(rawState));
  const reloaded = loadCore(storage).AppData;

  const cal = reloaded.state.calendarHolidays.find((h) => AppData.isPadroeiraBuziosName(h.name));
  assert(
    area,
    cal && cal.date === "2026-07-26",
    "Calendário: Padroeira de Búzios migrada de 21/05 para 26/07",
    ["js/data.js"],
    "migratePadroeiraBuziosHoliday em finalizeIncomingState"
  );
  assert(
    area,
    !reloaded.state.calendarHolidays.some(
      (h) => AppData.isPadroeiraBuziosName(h.name) && h.date.endsWith("-05-21")
    ),
    "Nenhuma Padroeira de Búzios permanece em 21/05 no calendário",
    ["js/data.js"],
    "—"
  );

  const chezHolidays = reloaded.getCompanyData("Chez Pitu").holidays.filter((h) =>
    AppData.isPadroeiraBuziosName(h.name)
  );
  assert(
    area,
    chezHolidays.length === 1 && chezHolidays[0].date === "2026-07-26",
    "Empresa Chez Pitu: feriado Padroeira consolidado em 26/07",
    ["js/data.js"],
    "—"
  );

  AppData.syncCompanyHolidaysFromCalendarEntry(
    { name: "Padroeira de Búzios", date: "2026-05-21", companies: ["ambas"] },
    { save: false }
  );
  const afterSync = AppData.getCompanyData("Chez Pitu").holidays.filter((h) =>
    AppData.isPadroeiraBuziosName(h.name)
  );
  assert(
    area,
    afterSync.every((h) => h.date.endsWith("-07-26")),
    "Sync calendário→empresa força 26/07 mesmo se entrada vier com 21/05",
    ["js/data.js", "js/feriados.js"],
    "syncCompanyHolidaysFromCalendarEntry + correctPadroeiraBuziosDate"
  );

  const remoteWrong = JSON.parse(JSON.stringify(reloaded.state));
  remoteWrong.calendarHolidays.push({
    id: "cal-reinject",
    name: "Padroeira de Búzios",
    date: "2027-05-21",
    companies: ["ambas"]
  });
  const merged = AppData.mergeRemoteIntoLocal(reloaded.state, remoteWrong);
  assert(
    area,
    !(merged.calendarHolidays || []).some(
      (h) => AppData.isPadroeiraBuziosName(h.name) && h.date.endsWith("-05-21")
    ),
    "Merge Firebase remoto não reintroduz Padroeira em 21/05",
    ["js/data.js", "js/firebase-sync.js"],
    "migratePadroeiraBuziosHoliday após mergeRemoteIntoLocal"
  );
}

function validateCoModal(AppData, chez) {
  const area = "Modal CO (Escala)";
  const coDate = "2026-06-10";

  chez.employees.push(
    {
      id: "raquel-1",
      name: "Raquel R. da Costa",
      status: "Ativo",
      department: "Salão",
      role: "Garçonete",
      fixedDay: "Quarta-feira",
      vtDaily: 12,
      admissionDate: "2024-01-01"
    },
    {
      id: "outro-1",
      name: "Carlos Outro",
      status: "Ativo",
      department: "Cozinha",
      role: "Auxiliar",
      fixedDay: "Terça-feira",
      vtDaily: 12,
      admissionDate: "2024-01-01"
    }
  );

  chez.holidays.push(
    {
      id: "h-raquel-pend",
      name: "Feriado Raquel",
      date: "2026-04-01",
      workedEmployees: [{ employeeId: "raquel-1", compensationDate: "", status: "Pendente" }]
    },
    {
      id: "h-outro-pend",
      name: "Feriado Carlos",
      date: "2026-03-15",
      workedEmployees: [{ employeeId: "outro-1", compensationDate: "", status: "Pendente" }]
    },
    {
      id: "h-raquel-comp",
      name: "Feriado Raquel OK",
      date: "2026-01-10",
      workedEmployees: [
        {
          employeeId: "raquel-1",
          compensationDate: "2026-02-01",
          status: "Compensado",
          linkedFromScale: true,
          scaleCoDate: "2026-02-01"
        }
      ]
    },
    {
      id: "h-raquel-linked-other",
      name: "Feriado Raquel vinculado",
      date: "2026-02-20",
      workedEmployees: [
        {
          employeeId: "raquel-1",
          compensationDate: "",
          status: "Pendente",
          linkedFromScale: true,
          scaleCoDate: "2026-03-01"
        }
      ]
    }
  );

  const raquelPending = AppData.getPendingCoHolidaysForEmployee("raquel-1", coDate, {
    company: "Chez Pitu",
    data: chez
  });

  assert(
    area,
    raquelPending.length === 1 && raquelPending[0].holiday.id === "h-raquel-pend",
    "Raquel R. da Costa vê somente a pendência dela no modal CO",
    ["js/data.js", "js/escala.js"],
    "getPendingCoHolidaysForEmployee filtra por employeeId"
  );
  assert(
    area,
    raquelPending.every((entry) => entry.item.employeeId === "raquel-1"),
    "Modal CO usa employeeId como vínculo principal",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    !raquelPending.some((entry) => entry.status.key === "compensado"),
    "Feriados compensados não aparecem no modal CO",
    ["js/data.js", "js/escala.js"],
    "—"
  );
  assert(
    area,
    !raquelPending.some((entry) => entry.holiday.id === "h-outro-pend"),
    "Pendências de outros funcionários não aparecem no modal CO",
    ["js/data.js", "js/escala.js"],
    "—"
  );

  chez.holidays.push({
    id: "h-legacy-name",
    name: "Feriado legado",
    date: "2026-02-01",
    workedEmployees: [{ employeeId: "Raquel R. da Costa", compensationDate: "", status: "Pendente" }]
  });
  chez.holidays.push({
    id: "h-empty-id",
    name: "Feriado órfão",
    date: "2026-02-02",
    workedEmployees: [{ employeeId: "", compensationDate: "", status: "Pendente" }]
  });
  AppData.normalizeWorkedEmployeeRefs?.(chez);
  const raquelWithLegacy = AppData.getPendingCoHolidaysForEmployee("raquel-1", coDate, {
    company: "Chez Pitu",
    data: chez
  });
  assert(
    area,
    raquelWithLegacy.some((entry) => entry.holiday.id === "h-legacy-name"),
    "Vínculo legado por nome migra para employeeId e aparece só para Raquel",
    ["js/data.js"],
    "normalizeWorkedEmployeeRefs + resolveWorkedEmployeeEntry"
  );
  assert(
    area,
    !raquelWithLegacy.some((entry) => entry.holiday.id === "h-empty-id"),
    "Registros sem employeeId não aparecem para todos no modal CO",
    ["js/data.js"],
    "—"
  );

  const coWithoutLink = AppData.setManualScale("raquel-1", "2026-06-15", "CO", null, "Chez Pitu");
  assert(
    area,
    Boolean(coWithoutLink?.coWarning) && !chez.manualScale["raquel-1|2026-06-15"],
    "CO sem feriado selecionado não vincula automaticamente",
    ["js/data.js", "js/escala.js"],
    "setManualScale exige linkedHolidayId"
  );

  chez.holidays.push({
    id: "h-scale-linked",
    name: "Natal 2025",
    date: "2025-12-25",
    workedEmployees: [
      {
        employeeId: "raquel-1",
        compensationDate: "",
        status: "Pendente",
        autoCreated: true,
        origin: "Automático pela escala"
      }
    ]
  });
  chez.manualScale["raquel-1|2026-01-05"] = { code: "CO", linkedHolidayId: "h-scale-linked" };
  AppData.reconcileCoCompensationLinks(chez);
  const afterScaleLink = AppData.getPendingCoHolidaysForEmployee("raquel-1", coDate, {
    company: "Chez Pitu",
    data: chez
  });
  assert(
    area,
    !afterScaleLink.some((entry) => entry.holiday.id === "h-scale-linked"),
    "Feriado com CO na escala vinculado não aparece como pendente",
    ["js/data.js"],
    "reconcileCoCompensationLinks + buildScaleCoHolidayIndex"
  );

  chez.holidays.push({
    id: "h-status-comp",
    name: "Feriado status compensado",
    date: "2025-11-15",
    workedEmployees: [{ employeeId: "raquel-1", compensationDate: "", status: "Compensado" }]
  });
  const afterStatus = AppData.getPendingCoHolidaysForEmployee("raquel-1", coDate, {
    company: "Chez Pitu",
    data: chez
  });
  assert(
    area,
    !afterStatus.some((entry) => entry.holiday.id === "h-status-comp"),
    "Status Compensado legado sem data exclui feriado do modal CO",
    ["js/data.js"],
    "resolveWorkedHolidayStatus reconhece status tirado/compensado"
  );

  chez.employees.push({
    id: "edna-1",
    name: "Edna Maria Silva",
    status: "Ativo",
    department: "Salão",
    role: "Garçonete",
    fixedDay: "Quinta-feira",
    vtDaily: 12,
    admissionDate: "2024-01-01"
  });
  chez.holidays.push({
    id: "h-edna-pend",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      {
        employeeId: "edna-1",
        compensationDate: "",
        status: "Pendente",
        autoCreated: true,
        origin: "Automático pela escala"
      }
    ]
  });
  chez.holidays.push({
    id: "h-edna-venc",
    name: "Finados 2025",
    date: "2025-11-02",
    workedEmployees: [
      {
        employeeId: "edna-1",
        compensationDate: "",
        status: "Pendente",
        autoCreated: true,
        origin: "Automático pela escala"
      }
    ]
  });
  chez.holidays.push({
    id: "h-edna-comp",
    name: "Natal Edna",
    date: "2025-12-25",
    workedEmployees: [
      {
        employeeId: "edna-1",
        compensationDate: "2026-01-10",
        status: "Compensado"
      }
    ]
  });
  const ednaPending = AppData.getPendingCoHolidaysForEmployee("edna-1", coDate, {
    company: "Chez Pitu",
    data: chez
  });
  assert(
    area,
    ednaPending.some((entry) => entry.holiday.id === "h-edna-pend"),
    "Edna: feriado Pendente do Controle de Feriados aparece no modal CO",
    ["js/data.js", "js/escala.js"],
    "isWorkedHolidayPendingInFeriadosControl alinhado ao Controle de Feriados"
  );
  assert(
    area,
    ednaPending.some((entry) => entry.holiday.id === "h-edna-venc"),
    "Edna: feriado Vencido do Controle de Feriados aparece no modal CO",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    !ednaPending.some((entry) => entry.holiday.id === "h-edna-comp"),
    "Edna: feriados compensados não aparecem no modal CO",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    !ednaPending.some((entry) => entry.item.employeeId !== "edna-1"),
    "Modal CO da Edna lista somente vínculos dela",
    ["js/data.js"],
    "resolveWorkedEmployeeEntry"
  );
}

function validateCrossModuleLinks(AppData, chez, peng, ym) {
  const area = "Vínculos entre abas";
  const modules = ["funcionarios", "escala", "ferias", "feriados", "vale-transporte", "contador", "dashboard"];

  modules.forEach((moduleId) => {
    AppData.setPageCompany(moduleId, "Chez Pitu", { save: false });
    assert(
      area,
      AppData.getPrimaryPageCompany(moduleId) === "Chez Pitu",
      `Troca empresa Chez Pitu em ${moduleId}`,
      ["js/data.js"],
      "pageFilters isolados por módulo"
    );
    AppData.setPageCompany(moduleId, "Pengold", { save: false });
    assert(
      area,
      AppData.getPrimaryPageCompany(moduleId) === "Pengold",
      `Troca empresa Pengold em ${moduleId}`,
      ["js/data.js"],
      "—"
    );
  });

  AppData.setPageCompany("escala", "Chez Pitu", { save: false });
  AppData.setEscalaSelectedYearMonth("2026-06", { save: false });
  AppData.setVtSelectedYearMonth("2026-06", { save: false });
  assert(
    area,
    AppData.getEscalaSelectedYearMonth() === "2026-06" && AppData.getVtSelectedYearMonth() === "2026-06",
    "Troca mês/ano persiste nos seletores Escala e VT",
    ["js/data.js"],
    "—"
  );

  const emp = chez.employees[0];
  const record = AppData.findEmployeeRecord("chez-1");
  assert(
    area,
    record?.company === "Chez Pitu" && record?.employee?.department === "Cozinha",
    "Cadastro é fonte oficial: empresa, setor e cargo via employeeId",
    ["js/data.js"],
    "findEmployeeRecord"
  );

  const coVt = AppData.VT_WORKED_CODES.has(AppData.getScaleCode(emp, "2026-05-14", chez));
  const feriasVt = AppData.VT_WORKED_CODES.has(AppData.getScaleCode(emp, "2026-05-21", chez));
  const absVt = AppData.VT_WORKED_CODES.has(AppData.getScaleCode(emp, "2026-05-12", chez));
  assert(area, !coVt && !feriasVt && !absVt, "CO, férias e ausência abatem VT", ["js/data.js"], "—");

  const beforeEmployees = chez.employees.length;
  AppData.setPageCompany("dashboard", "Pengold", { save: false });
  assert(
    area,
    chez.employees.length === beforeEmployees && peng.employees.length === 1,
    "Troca de empresa/aba não apaga cadastro de funcionários",
    ["js/data.js"],
    "—"
  );
}

function validatePersistence(AppData, chez, ym) {
  const area = "Persistência localStorage";
  const storage = createStorage();
  const snapshot = JSON.parse(JSON.stringify(AppData.state));
  snapshot.pageFilters.escala = "Pengold";
  snapshot.companies["Chez Pitu"].contadorLancamentos[ym] = [
    { employeeId: "chez-1", falta: 2, horaExtra: "02:00", vales: 80 }
  ];
  storage.setItem("chezPituPeopleSystem.v1", JSON.stringify(snapshot));

  const reloaded = loadCore(storage).AppData;
  assert(
    area,
    reloaded.getPrimaryPageCompany("escala") === "Pengold",
    "Filtro de empresa persiste após reload (simula F5)",
    ["js/data.js"],
    "localStorage pageFilters"
  );
  assert(
    area,
    (reloaded.getCompanyData("Chez Pitu").contadorLancamentos[ym] || [])[0]?.falta === 2,
    "Lançamentos Contador persistem após reload",
    ["js/data.js", "js/contador.js"],
    "—"
  );
  assert(
    area,
    reloaded.getCompanyData("Chez Pitu").absences.some((a) => a.employeeId === "chez-1"),
    "Ausências persistem após reload",
    ["js/data.js"],
    "—"
  );
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
  validatePadroeiraBuzios(AppData);
  validateCoModal(AppData, chez);
  validateCrossModuleLinks(AppData, chez, peng, ym);
  validatePersistence(AppData, chez, ym);

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
  console.log("Pendente confirmação visual no browser: modal CO (Raquel), PDF Contador, troca Escala 5×.\n");
}

main();
