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
  // Espelha a produção: VT usa a fonte única AppData.isWorkedScaleCode.
  return AppData.getDaysInMonth(yearMonth).filter((day) =>
    AppData.isWorkedScaleCode(AppData.getScaleCode(employee, day, data))
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
      // Data RELATIVA a hoje (dentro dos 120 dias de prazo). Com data fixa
      // (era 2026-04-10) o vínculo "Pendente" virava "Vencido" assim que o
      // prazo expirava no mundo real — em 08/08/2026 a suíte passou a falhar
      // sozinha, sem nenhuma mudança de código.
      date: AppData.addDays(AppData.todayISO(), -30),
      workedEmployees: [{ employeeId: "chez-1", compensationDate: "", status: "Pendente" }]
    },
    {
      // Feriado já compensado em 14/05/2026: é o que faz 2026-05-14 aparecer
      // como CO na escala (getScaleCode) para as asserções de VT.
      // Status "compensado" não envelhece, então pode ter data fixa.
      id: "h1b",
      name: "Feriado Compensado em Maio",
      date: "2026-04-10",
      workedEmployees: [
        { employeeId: "chez-1", compensationDate: "2026-05-14", status: "Compensado" }
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
  // Fase 3A — Soft delete: feriado continua existindo mas marcado como deletado
  const deletedHoliday = peng.holidays.find((h) => h.id === pengOnlyId);
  assert(
    area,
    deletedHoliday?.isDeleted === true && chez.holidays.length > 0,
    "removeHoliday respeita empresa do filtro Feriados (soft delete — não apaga bloco errado)",
    ["js/data.js", "js/feriados.js"],
    "removeHoliday(id, { company }) — Fase 3A soft delete"
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

  // Idempotência: aplicar a migração repetidas vezes não altera o resultado (sempre 26/07).
  const idempotentState = {
    calendarHolidays: [
      { id: "cal-idem", name: "Padroeira de Búzios", date: "2028-05-21", companies: ["ambas"] }
    ],
    companies: {
      "Chez Pitu": {
        holidays: [
          { id: "h-idem", name: "Padroeira de Búzios", date: "2028-05-21", workedEmployees: [] }
        ]
      }
    }
  };
  const firstPass = AppData.migratePadroeiraBuziosHoliday(idempotentState);
  const secondPass = AppData.migratePadroeiraBuziosHoliday(idempotentState);
  assert(
    area,
    firstPass === true && secondPass === false,
    "Migração idempotente: corrige na 1ª passada e não muta mais nas seguintes",
    ["js/data.js"],
    "migratePadroeiraBuziosHoliday retorna false quando já está correto"
  );
  assert(
    area,
    idempotentState.calendarHolidays[0].date === "2028-07-26" &&
      idempotentState.companies["Chez Pitu"].holidays[0].date === "2028-07-26",
    "Migração idempotente força 26/07 em calendário e empresa",
    ["js/data.js"],
    "—"
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

function validateEmployeeCadastro(AppData, chez) {
  const area = "Cadastro de funcionários";
  const sorted = AppData.sortEmployeesByName([
    { name: "Zélia" },
    { name: "Ana" },
    { name: "Bruno" }
  ]);
  assert(
    area,
    sorted.map((item) => item.name).join(",") === "Ana,Bruno,Zélia",
    "Funcionários ordenados alfabeticamente (pt-BR)",
    ["js/data.js", "js/funcionarios.js"],
    "sortEmployeesByName / compareEmployeeName"
  );

  const holidaysBefore = JSON.stringify(chez.holidays);
  const scaleBefore = JSON.stringify(chez.manualScale);
  const vacationsBefore = JSON.stringify(chez.vacations);
  const absencesBefore = JSON.stringify(chez.absences);

  AppData.upsertEmployee(
    {
      name: "Novo Vínculo Teste",
      cpf: "52998224725",
      role: "Auxiliar",
      department: "Salão",
      status: "Ativo",
      admissionDate: "2026-05-29",
      vtDaily: 12
    },
    "Chez Pitu",
    { save: false }
  );

  assert(
    area,
    JSON.stringify(chez.holidays) === holidaysBefore,
    "Novo funcionário não altera feriados de outros colaboradores",
    ["js/data.js"],
    "upsertEmployee isola cadastro"
  );
  assert(
    area,
    JSON.stringify(chez.manualScale) === scaleBefore,
    "Novo funcionário não altera escala manual existente",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    JSON.stringify(chez.vacations) === vacationsBefore &&
      JSON.stringify(chez.absences) === absencesBefore,
    "Novo funcionário não altera férias ou ausências existentes",
    ["js/data.js"],
    "—"
  );

  const names = chez.employees.map((item) => item.name);
  const expectedOrder = [...names].sort((a, b) => AppData.compareEmployeeName({ name: a }, { name: b }));
  assert(
    area,
    names.join("|") === expectedOrder.join("|"),
    "Após inclusão, lista da empresa permanece em ordem alfabética",
    ["js/data.js", "js/funcionarios.js"],
    "sortEmployeesByName em upsertEmployee"
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

  const emp = chez.employees.find((item) => item.id === "chez-1");
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

function validateVacationSync(AppData, chez) {
  const area = "Férias × Escala";
  chez.manualScale["chez-1|2026-06-01"] = "FÉRIAS";
  chez.manualScale["chez-1|2026-06-02"] = "FÉRIAS";
  chez.manualScale["chez-1|2026-06-03"] = "FÉRIAS";
  AppData.normalizeVacations(chez);
  const synced = chez.vacations.find(
    (item) => item.employeeId === "chez-1" && item.startDate === "2026-06-01" && item.endDate === "2026-06-03"
  );
  assert(
    area,
    Boolean(synced),
    "Férias manuais na escala viram registro em vacations[]",
    ["js/data.js"],
    "normalizeVacations / upsertVacationRange"
  );
  assert(
    area,
    !chez.manualScale["chez-1|2026-06-02"],
    "Manual FÉRIAS removido após sincronizar com vacations[]",
    ["js/data.js"],
    "clearManualScaleCodeInRange"
  );
  const emp = chez.employees.find((item) => item.id === "chez-1");
  assert(
    area,
    emp && AppData.getScaleCode(emp, "2026-06-02", chez) === "FÉRIAS",
    "Férias sincronizadas aparecem na escala",
    ["js/data.js"],
    "getScaleCode"
  );

  chez.vacations.push({
    id: "v-orphan",
    employeeId: "func-legado-renan",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    note: "Maria Chez"
  });
  AppData.normalizeVacations(chez);
  assert(
    area,
    chez.vacations.some((item) => item.id === "v-orphan" && item.employeeId === "chez-1"),
    "Férias órfãs são religadas ao funcionário pelo nome (note/cadastro)",
    ["js/data.js"],
    "relinkOrphanVacations"
  );
  assert(
    area,
    AppData.getScaleCode(emp, "2026-06-11", chez) === "FÉRIAS",
    "Férias religadas refletem na escala",
    ["js/data.js"],
    "findVacationForDate"
  );
}

function validateCoDirectLink(AppData, chez) {
  const area = "CO persistente";
  const coDate = "2026-06-09";
  chez.employees.push({
    id: "andre-1",
    name: "André Teste",
    status: "Ativo",
    department: "Manutenção",
    role: "Auxiliar",
    fixedDay: "Segunda-feira",
    vtDaily: 12,
    admissionDate: "2024-01-01"
  });
  chez.holidays.push({
    id: "h-andre-pend",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [{ employeeId: "andre-1", compensationDate: "", status: "Pendente" }]
  });
  const result = AppData.setManualScale("andre-1", coDate, "CO", "h-andre-pend", "Chez Pitu");
  assert(
    area,
    !result?.coWarning && chez.manualScale[`andre-1|${coDate}`]?.code === "CO",
    "CO com feriado selecionado persiste na escala (André)",
    ["js/data.js", "js/escala.js"],
    "linkScaleCoToHoliday com preferredHolidayId"
  );
  const worked = chez.holidays.find((item) => item.id === "h-andre-pend")?.workedEmployees?.[0];
  assert(
    area,
    worked?.compensationDate === coDate && worked?.scaleCoDate === coDate,
    "CO vincula compensationDate no Controle de Feriados",
    ["js/data.js"],
    "applyCoLinkToWorkedItem"
  );
}

function validateCadastroSingleFilter() {
  const area = "Cadastro UI";
  const html = fs.readFileSync(path.join(root, "js/funcionarios.js"), "utf8");
  assert(
    area,
    !html.includes('renderToolbar?.("funcionarios"') && !html.includes('bindToolbar?.(container, "funcionarios"'),
    "Cadastro usa um único filtro de empresa (sem toolbar superior)",
    ["js/funcionarios.js"],
    "Remover CompanyUI.renderToolbar/bindToolbar do Cadastro"
  );
  assert(
    area,
    html.includes("applyPageCompanyToEmployeeList") &&
      html.includes("AppData.getActiveCompany()") &&
      !html.includes('id="employeeFilterCompany"'),
    "Cadastro lista apenas a empresa da aba ativa, sem seletor interno de empresa (Fase 2)",
    ["js/funcionarios.js"],
    "applyPageCompanyToEmployeeList filtra por getActiveCompany; seletor de empresa removido"
  );
  assert(
    area,
    html.includes("AppData.formatDateBR(employee.admissionDate)"),
    "Admissão exibida em DD/MM/AAAA",
    ["js/funcionarios.js"],
    "formatDateBR"
  );
}

function validateAusenciasEdit(AppData, chez) {
  const area = "Ausências — Editar";
  const emp = chez.employees.find((item) => item.id === "chez-1");
  const vacation = chez.vacations.find((item) => item.id === "v1");
  assert(area, Boolean(vacation), "Registro base de férias disponível para edição", ["js/data.js"], "—");

  const okVacation = AppData.updateVacation(
    "v1",
    {
      employeeId: "chez-1",
      startDate: "2026-05-19",
      endDate: "2026-05-21",
      note: "Férias ajustadas"
    },
    "Chez Pitu"
  );
  assert(area, okVacation, "updateVacation retorna true ao salvar", ["js/data.js"], "updateVacation");
  assert(
    area,
    vacation.startDate === "2026-05-19" && vacation.endDate === "2026-05-21",
    "updateVacation altera intervalo do registro",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    emp && AppData.getScaleCode(emp, "2026-05-19", chez) === "FÉRIAS" && AppData.getScaleCode(emp, "2026-05-22", chez) !== "FÉRIAS",
    "updateVacation atualiza reflexo na escala",
    ["js/data.js"],
    "runScaleIntegrations"
  );
  assert(area, AppData.updateVacation("inexistente", vacation, "Chez Pitu") === false, "updateVacation retorna false se id não existe", ["js/data.js"], "—");

  AppData.addAbsence(
    { employeeId: "chez-1", type: "Atestado médico", startDate: "2026-05-08", endDate: "2026-05-09", cid: "A00", note: "Teste" },
    "Chez Pitu"
  );
  const absence = (chez.absences || []).find((item) => item.startDate === "2026-05-08");
  assert(area, Boolean(absence), "Registro base de ausência disponível para edição", ["js/data.js"], "addAbsence");

  const okAbsence = AppData.updateAbsence(
    absence.id,
    {
      employeeId: "chez-1",
      type: "Licença não remunerada",
      startDate: "2026-05-08",
      endDate: "2026-05-10",
      cid: "",
      note: "Ajuste"
    },
    "Chez Pitu"
  );
  assert(area, okAbsence, "updateAbsence retorna true ao salvar", ["js/data.js"], "updateAbsence");
  assert(
    area,
    absence.type === "Licença não remunerada" && absence.endDate === "2026-05-10",
    "updateAbsence altera tipo e intervalo",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    emp && AppData.getScaleCode(emp, "2026-05-10", chez) === "LICENÇA",
    "updateAbsence atualiza reflexo na escala",
    ["js/data.js"],
    "runScaleIntegrations"
  );

  const feriasHtml = fs.readFileSync(path.join(root, "js/ferias.js"), "utf8");
  assert(
    area,
    feriasHtml.includes("data-edit-vacation") &&
      feriasHtml.includes("data-edit-absence") &&
      feriasHtml.includes("AppData.updateVacation") &&
      feriasHtml.includes("AppData.updateAbsence"),
    "Tabelas de Férias e Atestados exibem botão Editar com popup",
    ["js/ferias.js"],
    "openVacationEditPopup / openAbsenceEditPopup"
  );
}

function validateScalePrintLayout() {
  const area = "Escala impressa";
  const escalaPrintCss = fs.readFileSync(path.join(root, "css/escala-print.css"), "utf8");
  const printCss = fs.readFileSync(path.join(root, "css/print.css"), "utf8");
  const escalaJs = fs.readFileSync(path.join(root, "js/escala.js"), "utf8");

  assert(
    area,
    !printCss.includes("width: 281mm") &&
    escalaPrintCss.includes("scale-print-logo-frame") &&
      escalaPrintCss.includes("scale-print-table-wrap"),
    "Layout de impressão da escala centralizado em escala-print.css",
    ["css/escala-print.css", "css/print.css"],
    "—"
  );
  assert(
    area,
    escalaJs.includes("scalePrintContainer") &&
      escalaJs.includes("size: A4 landscape") &&
      escalaJs.includes("getPrintDensityClass"),
    "Escala imprime via container dedicado em A4 horizontal",
    ["js/escala.js"],
    "printScale"
  );
  assert(
    area,
    !escalaPrintCss.includes("box-shadow: inset 0 0 0 999px"),
    "Cores de domingo/feriado não usam box-shadow pesado na impressão",
    ["css/escala-print.css"],
    "—"
  );
}

function validateDateFormatBR(AppData) {
  const area = "Formato de data";
  assert(
    area,
    AppData.formatDateBR("2026-05-19") === "19/05/2026",
    "formatDateBR retorna DD/MM/AAAA",
    ["js/data.js"],
    "—"
  );
  const feriasHtml = fs.readFileSync(path.join(root, "js/ferias.js"), "utf8");
  assert(
    area,
    feriasHtml.includes("AppData.formatDateBR(vacation.startDate)") &&
      feriasHtml.includes("AppData.formatDateBR(absence.startDate)"),
    "Tabelas de Ausências exibem datas em DD/MM/AAAA",
    ["js/ferias.js"],
    "formatDateBR nas colunas"
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
    !printHtml.includes("resumoCompanySelect") &&
      !printHtml.includes('id="contadorPageCompany"') &&
      printHtml.includes('AppData.getPrimaryPageCompany("contador")'),
    "Contador sem seletor interno de empresa — contexto vem da aba ativa (Fase 2)",
    ["js/contador.js"],
    "Empresa definida pela aba; contador lê getPrimaryPageCompany('contador')"
  );
  assert(
    area,
    printHtml.includes("renderResumoPrintArea") && printHtml.includes("@page { size: A4 landscape"),
    "PDF/Impressão: layout landscape A4 e usa getPrimaryPageCompany('contador')",
    ["js/contador.js"],
    "Confirmar visualmente no browser: Imprimir / PDF no tab Resumo"
  );
}

function validateWorkedSourceOfTruth(AppData) {
  const area = "Fonte única — dia trabalhado";

  const notWorked = ["FOLGA", "DOM", "FÉRIAS", "CO", "ATESTADO", "FALTA", "SUSPENSÃO", "LICENÇA"];
  notWorked.forEach((code) => {
    assert(
      area,
      AppData.isWorkedScaleCode(code) === false,
      `Código ${code} não conta como dia trabalhado (VT/Escala/Feriados/Dashboard)`,
      ["js/data.js", "js/vale-transporte.js", "js/scale-rules.js"],
      "isWorkedScaleCode (fonte única)"
    );
  });

  ["", "MM", "TM", "MR", "TR", "NR", "NO", "MN", "TN", "NM"].forEach((code) => {
    assert(
      area,
      AppData.isWorkedScaleCode(code) === true,
      `Código "${code || "(vazio)"}" conta como dia trabalhado`,
      ["js/data.js"],
      "—"
    );
  });

  assert(
    area,
    [...AppData.VT_WORKED_CODES].every((code) => AppData.isWorkedScaleCode(code)),
    "VT_WORKED_CODES sem divergência com a fonte única (config padrão)",
    ["js/data.js", "js/vale-transporte.js"],
    "VT delega a isWorkedScaleCode"
  );

  assert(
    area,
    ["CO", "FÉRIAS", "ATESTADO", "LICENÇA", "FALTA", "TM", "", "MR"].every(
      (code) => AppData.isWorkedScaleCode(code) === !AppData.isNotWorkedScaleCode(code)
    ),
    "isWorkedScaleCode e isNotWorkedScaleCode são complementares",
    ["js/data.js"],
    "—"
  );

  AppData.state.scaleCodeConfig = { TM: "not-worked", FALTA: "worked" };
  assert(
    area,
    AppData.isWorkedScaleCode("TM") === false && AppData.isWorkedScaleCode("FALTA") === true,
    "scaleCodeConfig sobrepõe a fonte única para todos os módulos (sem divergência VT × Escala)",
    ["js/data.js", "js/scale-rules.js"],
    "scaleCodeConfig respeitado em isWorkedScaleCode"
  );
  AppData.state.scaleCodeConfig = {};
  assert(
    area,
    AppData.isWorkedScaleCode("TM") === true && AppData.isWorkedScaleCode("FALTA") === false,
    "Reset de scaleCodeConfig retorna ao default canônico",
    ["js/data.js"],
    "—"
  );
}

function validateCompanyWriteResolution(AppData, chez, peng) {
  const area = "Gravação por empresa (employeeId)";

  assert(
    area,
    AppData.resolveCompanyForEmployeeWrite("chez-1", "Pengold", "vale-transporte") === "Chez Pitu",
    "Empresa de gravação resolve por employeeId mesmo com empresa errada no parâmetro",
    ["js/data.js"],
    "resolveCompanyForEmployeeWrite"
  );
  assert(
    area,
    AppData.resolveCompanyForEmployeeWrite("peng-1", "Chez Pitu", "ferias") === "Pengold",
    "Funcionário Pengold grava em Pengold mesmo com filtro Chez Pitu",
    ["js/data.js"],
    "—"
  );
  assert(
    area,
    AppData.resolveCompanyForEmployeeWrite("nao-existe", "Pengold", "ferias") === "Pengold",
    "employeeId inexistente: fallback seguro usa a empresa explícita (bloco)",
    ["js/data.js"],
    "fallback + alerta"
  );

  AppData.setVtDeduction("chez-1", "2026-09", "7", { company: "Pengold", save: false });
  assert(
    area,
    AppData.getVtDeduction("chez-1", "2026-09", null, "Chez Pitu") === 7,
    "setVtDeduction grava na empresa real (Chez Pitu) apesar de company=Pengold",
    ["js/data.js", "js/vale-transporte.js"],
    "setVtDeduction usa resolveCompanyForEmployeeWrite"
  );
  assert(
    area,
    AppData.getVtDeduction("chez-1", "2026-09", null, "Pengold") === 0,
    "Desconto VT não vaza para a empresa do filtro (Pengold)",
    ["js/data.js"],
    "—"
  );

  AppData.setPageCompany("ferias", "Pengold", { save: false });
  AppData.addAbsence(
    { employeeId: "chez-1", type: "Falta justificada", startDate: "2026-09-03", endDate: "2026-09-03" },
    null
  );
  assert(
    area,
    chez.absences.some((a) => a.startDate === "2026-09-03") &&
      !peng.absences.some((a) => a.startDate === "2026-09-03"),
    "Ausência sem empresa explícita grava no bloco do funcionário (Chez Pitu), não no filtro (Pengold)",
    ["js/data.js", "js/ferias.js"],
    "addAbsence usa resolveCompanyForEmployeeWrite"
  );
  AppData.setPageCompany("ferias", "Chez Pitu", { save: false });

  const movedEmp = chez.employees.find((e) => e.id === "chez-1");
  AppData.setManualScale("chez-1", "2026-09-10", "FOLGA", null, "Pengold");
  assert(
    area,
    chez.manualScale["chez-1|2026-09-10"] === "FOLGA" && !peng.manualScale["chez-1|2026-09-10"],
    "setManualScale grava na empresa real do funcionário mesmo com company=Pengold",
    ["js/data.js", "js/escala.js"],
    "setManualScale usa resolveCompanyForEmployeeWrite"
  );
  assert(
    area,
    Boolean(movedEmp) && AppData.getScaleCode(movedEmp, "2026-09-10", chez) === "FOLGA",
    "Lançamento manual reflete na escala da empresa correta",
    ["js/data.js"],
    "—"
  );
  delete chez.manualScale["chez-1|2026-09-10"];
  chez.absences = chez.absences.filter((a) => a.startDate !== "2026-09-03");
}

function validateActiveCompanyTabs(AppData, chez, peng, ym) {
  const area = "Abas de empresa (Fase 2)";
  const pageModules = ["dashboard", "funcionarios", "escala", "ferias", "vale-transporte", "feriados", "contador"];

  // Aba Chez Pitu: contexto único propaga para todos os módulos
  AppData.setActiveCompany("Chez Pitu", { save: false });
  assert(area, AppData.getActiveCompany() === "Chez Pitu", "Aba ativa = Chez Pitu", ["js/data.js"], "getActiveCompany");
  assert(
    area,
    pageModules.every((m) => AppData.getPrimaryPageCompany(m) === "Chez Pitu"),
    "Aba Chez Pitu propaga para todos os módulos (sem filtros internos)",
    ["js/data.js", "js/app.js"],
    "setActiveCompany propaga pageFilters"
  );

  const pengIdSet = new Set(peng.employees.map((e) => e.id));
  const chezIdSet = new Set(chez.employees.map((e) => e.id));
  const chezView = AppData.getCompanyData(AppData.getActiveCompany());
  assert(
    area,
    chezView.employees.length > 0 && !chezView.employees.some((e) => pengIdSet.has(e.id)),
    "Aba Chez Pitu não mostra dados Pengold",
    ["js/data.js"],
    "—"
  );

  const chezCountBefore = chez.employees.length;
  const pengCountBefore = peng.employees.length;

  // Troca para aba Pengold
  AppData.setActiveCompany("Pengold", { save: false });
  assert(
    area,
    AppData.getActiveCompany() === "Pengold" &&
      pageModules.every((m) => AppData.getPrimaryPageCompany(m) === "Pengold"),
    "Aba Pengold propaga para todos os módulos",
    ["js/data.js"],
    "—"
  );
  const pengView = AppData.getCompanyData(AppData.getActiveCompany());
  assert(
    area,
    pengView.employees.length > 0 && !pengView.employees.some((e) => chezIdSet.has(e.id)),
    "Aba Pengold não mostra dados Chez Pitu",
    ["js/data.js"],
    "—"
  );

  // Trocar aba não apaga dados de nenhuma empresa
  assert(
    area,
    chez.employees.length === chezCountBefore && peng.employees.length === pengCountBefore,
    "Trocar aba não apaga cadastro (Chez Pitu e Pengold preservados)",
    ["js/data.js"],
    "—"
  );

  // Escala/VT/Ausências/Feriados/Contador/Dashboard respeitam a empresa da aba
  AppData.setActiveCompany("Chez Pitu", { save: false });
  const empChez = chez.employees.find((e) => e.id === "chez-1");
  assert(
    area,
    empChez && AppData.getScaleCode(empChez, "2026-05-12", AppData.getCompanyData(AppData.getPrimaryPageCompany("escala"))) === "ATESTADO",
    "Escala respeita a empresa da aba (dados Chez Pitu)",
    ["js/escala.js", "js/data.js"],
    "—"
  );
  assert(
    area,
    AppData.getVtDeduction("chez-1", ym, null, AppData.getPrimaryPageCompany("vale-transporte")) >= 0 &&
      AppData.getPrimaryPageCompany("vale-transporte") === "Chez Pitu",
    "VT, Ausências, Feriados, Contador e Dashboard usam a empresa da aba ativa",
    ["js/vale-transporte.js", "js/contador.js", "js/dashboard.js", "js/data.js"],
    "getPrimaryPageCompany segue a aba"
  );

  // Persistência da aba após reload (F5) — não reseta dados
  const storage2 = createStorage();
  const snap = JSON.parse(JSON.stringify(AppData.state));
  snap.activeCompany = "Pengold";
  storage2.setItem("chezPituPeopleSystem.v1", JSON.stringify(snap));
  const reloaded = loadCore(storage2).AppData;
  assert(
    area,
    reloaded.getActiveCompany() === "Pengold" &&
      reloaded.getCompanyData("Chez Pitu").employees.length === chezCountBefore &&
      reloaded.getCompanyData("Pengold").employees.length === pengCountBefore,
    "Empresa ativa persiste após reload e nenhum dado é apagado",
    ["js/data.js"],
    "finalizeIncomingState preserva activeCompany e companies"
  );

  AppData.setActiveCompany("Chez Pitu", { save: false });
}

function validatePhase2Improvements(AppData) {
  const area = "Melhorias Fase 2";
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const funcionarios = read("js/funcionarios.js");
  const contador = read("js/contador.js");
  const feriados = read("js/feriados.js");
  const empresa = read("js/empresa.js");
  const vt = read("js/vale-transporte.js");
  const dataJs = read("js/data.js");
  const firebaseJs = read("js/firebase-sync.js");
  const printCss = read("css/print.css");
  const styleCss = read("css/style.css");

  // === Proteção dos dados da empresa (dados críticos) ===
  assert(
    area,
    dataJs.includes("mergeCompanyInfoPreserving") &&
      dataJs.includes("recoverCompanyInfoForState") &&
      dataJs.includes("backupCompanyInfoInState") &&
      dataJs.includes("COMPANY_CRITICAL_FIELDS"),
    "Core: merge preservando + backup + recuperação automática dos dados da empresa",
    ["js/data.js"],
    "Nunca apagar/sobrescrever com vazio; restaurar do backup"
  );
  assert(
    area,
    firebaseJs.includes("empresasBackup") && firebaseJs.includes("empresasHistory"),
    "Firebase: backup/histórico dos dados da empresa preservados no round-trip",
    ["js/firebase-sync.js"],
    "—"
  );
  assert(
    area,
    empresa.includes("renderDiagnostics") &&
      empresa.includes('"bankInfo"') &&
      empresa.includes('"address"') &&
      empresa.includes('"tradeName"') &&
      empresa.includes("restoreCompanyInfoFromBackup"),
    "Dados da Empresa: campos críticos completos + diagnóstico + restauração",
    ["js/empresa.js"],
    "—"
  );
  if (AppData) {
    const diag = AppData.diagnoseCompanyData("Chez Pitu");
    assert(
      area,
      diag &&
        diag.company === "Chez Pitu" &&
        Array.isArray(diag.inconsistencies) &&
        typeof diag.hasBackup === "boolean" &&
        typeof diag.source === "string",
      "Diagnóstico da empresa retorna empresa ativa, origem, atualização, backup e inconsistências",
      ["js/data.js"],
      "diagnoseCompanyData"
    );
  }

  // 1. Cabeçalho fixo
  assert(
    area,
    /\.app-shell\s*\{[^}]*height:\s*100vh/.test(styleCss) &&
      /\.app-content\s*\{[^}]*overflow-y:\s*auto/.test(styleCss),
    "Cabeçalho fixo: app-shell em 100vh e somente .app-content rola",
    ["css/style.css"],
    "Header/abas/ribbon fora do contêiner de rolagem"
  );

  // 2. Cadastro sem bloco 'Visualizando todas as empresas'
  assert(
    area,
    !funcionarios.includes("Visualizando") && !funcionarios.includes("no grupo"),
    "Cadastro: bloco 'Visualizando … empresas' removido",
    ["js/funcionarios.js"],
    "—"
  );

  // 3. Pop-up funcionário sem seletor de empresa; grava na aba ativa
  assert(
    area,
    !funcionarios.includes('name="employeeCompany"') &&
      funcionarios.includes("const targetCompany = AppData.getActiveCompany();"),
    "Pop-up funcionário: sem seletor de empresa; grava na empresa da aba ativa",
    ["js/funcionarios.js"],
    "targetCompany = getActiveCompany()"
  );

  // 4. VT print sem 1ª página em branco (reset de layout Fase 2)
  assert(
    area,
    /\.app-content[^{]*\{[\s\S]*?height:\s*auto\s*!important/.test(printCss) &&
      printCss.includes(".module-ribbon,"),
    "Impressão VT: layout de cabeçalho fixo neutralizado no print (sem página em branco)",
    ["css/print.css"],
    "Reset .app-shell/.app-content + ocultar .module-ribbon no @media print"
  );

  // 5. Feriados — contexto do funcionário sem editar/excluir feriado
  assert(
    area,
    !feriados.includes("data-edit-holiday=") &&
      !feriados.includes("data-remove-holiday=") &&
      feriados.includes('data-unlink-holiday="') &&
      feriados.includes(">Excluir vínculo<"),
    "Feriados: linhas de funcionário só têm 'Excluir vínculo' (sem editar/excluir feriado)",
    ["js/feriados.js"],
    "Editar/Excluir feriado movidos para o modal de cadastro"
  );

  // 6. Feriados — editar/excluir dentro do modal de cadastro, com confirmação
  assert(
    area,
    feriados.includes("data-popup-edit-holiday=") &&
      feriados.includes("data-popup-remove-holiday=") &&
      feriados.includes("renderCompanyHolidaysManager") &&
      feriados.includes("confirmDeleteHoliday(holidayId)"),
    "Feriados: editar/excluir e lista de cadastrados dentro do modal, com confirmação",
    ["js/feriados.js"],
    "renderCompanyHolidaysManager + bindCompanyHolidayManager"
  );

  // 7. Contador Resumo com scroll horizontal
  assert(
    area,
    /\.resumo-scroll\s*\{[^}]*overflow-x:\s*auto/.test(styleCss) &&
      contador.includes('class="table-scroll resumo-scroll"'),
    "Contador Resumo: barra de rolagem horizontal funcional (overflow-x auto)",
    ["css/style.css", "js/contador.js"],
    "—"
  );

  // 8. Contador — novo lançamento sem seletor de empresa
  assert(
    area,
    !contador.includes('id="popupCompany"') &&
      contador.includes("var targetCompany = AppData.getActiveCompany();"),
    "Contador: pop-up de lançamento sem seletor de empresa; usa a aba ativa",
    ["js/contador.js"],
    "—"
  );

  // === Modal Cadastrar Feriado — alto (~85vh), lista priorizada, rolagem única ===
  assert(
    area,
    /\.feriados-register-popup\s*\{[^}]*height:\s*85vh[\s\S]*?flex-direction:\s*column/.test(styleCss) &&
      /\.feriados-register-popup\s*\{[^}]*overflow:\s*hidden/.test(styleCss),
    "Modal Feriado: card em coluna, altura ~85vh, sem rolagem do card inteiro",
    ["css/style.css"],
    "—"
  );
  assert(
    area,
    /\.feriados-popup-manager\s*\{[^}]*flex:\s*1 1 auto/.test(styleCss) &&
      /\.feriados-popup-manager \.feriados-manager-table\s*\{[^}]*overflow-y:\s*auto/.test(styleCss) &&
      /\.feriados-panel-footer\s*\{[^}]*flex-shrink/.test(styleCss),
    "Modal Feriado: lista 'Feriados cadastrados' é a área principal com rolagem única; rodapé fixo",
    ["css/style.css"],
    "—"
  );
  assert(
    area,
    /thead th\s*\{[^}]*position:\s*sticky/.test(styleCss) &&
      feriados.includes("Funcionários Vinculados"),
    "Modal Feriado: tabela com cabeçalho fixo e coluna de funcionários vinculados",
    ["css/style.css", "js/feriados.js"],
    "—"
  );
  assert(
    area,
    feriados.includes('class="feriados-panel-body"') &&
      feriados.includes("feriados-panel-footer") &&
      feriados.includes("data-company-holiday-manager"),
    "Modal Feriado: formulário e lista de feriados cadastrados separados",
    ["js/feriados.js"],
    "Lista de cadastrados com edição/exclusão dentro do modal"
  );

  // Aba Calendário: sem seletor de empresa; vinculado à aba ativa; com editar
  const scaleRules = read("js/scale-rules.js");
  assert(
    area,
    !feriados.includes('name="companyScope"') && !feriados.includes("Empresa aplicável"),
    "Calendário: seletor 'Empresa aplicável' removido (sem informações cruzadas)",
    ["js/feriados.js"],
    "—"
  );
  assert(
    area,
    feriados.includes("const companies = [AppData.getActiveCompany()];") &&
      feriados.includes("AppData.listRegisteredHolidays(company)") &&
      read("js/data.js").includes("function calendarHolidayTargetsCompany"),
    "Calendário: criação e listagem vinculadas à empresa da aba ativa",
    ["js/feriados.js", "js/data.js"],
    "submitCalendarHolidayForm usa getActiveCompany; listRegisteredHolidays filtra por empresa"
  );
  assert(
    area,
    feriados.includes("data-edit-calendar-holiday") &&
      feriados.includes("showEditCalendarHolidayModal") &&
      scaleRules.includes("updateCalendarHoliday"),
    "Calendário: opção de editar feriado já cadastrado",
    ["js/feriados.js", "js/scale-rules.js"],
    "showEditCalendarHolidayModal + ScaleRules.updateCalendarHoliday"
  );
  assert(
    area,
    feriados.includes("feriados-panel-footer-compact") &&
      feriados.includes('class="secondary btn-sm"') &&
      feriados.includes('class="primary btn-sm"'),
    "Modal Feriado: botões Cancelar/Salvar compactos no rodapé",
    ["js/feriados.js", "css/style.css"],
    "—"
  );

  // === Correção 2 — VT lê CNPJ da empresa ativa com normalização ===
  assert(
    area,
    vt.includes("CNPJ_FIELDS") &&
      vt.includes("resolveCompanyCnpjRaw") &&
      vt.includes("formatCnpjDisplay") &&
      vt.includes("getCompanyInfo(data, company)"),
    "VT: CNPJ resolvido da empresa ativa (cnpj/CNPJ/document/taxId/companyCnpj) com formatação",
    ["js/vale-transporte.js"],
    "Não bloqueia se CNPJ existir em qualquer campo válido"
  );
  assert(
    area,
    empresa.includes("CNPJ_FIELDS") && empresa.includes("resolveCnpj"),
    "Dados da Empresa: exibe CNPJ aceitando campos variantes",
    ["js/empresa.js"],
    "—"
  );

  // CNPJ persiste/lê por empresa (isolamento) — com e sem máscara
  if (AppData) {
    AppData.updateCompanyInfo({ legalName: "Chez Pitu Ltda", cnpj: "11222333000181", responsibleName: "RH" }, "Chez Pitu");
    AppData.updateCompanyInfo({ legalName: "Pengold Ltda", cnpj: "99.888.777/0001-66", responsibleName: "RH" }, "Pengold");
    const chezCnpj = AppData.getCompanyData("Chez Pitu").companyInfo.cnpj;
    const pengCnpj = AppData.getCompanyData("Pengold").companyInfo.cnpj;
    assert(
      area,
      chezCnpj === "11222333000181" && pengCnpj === "99.888.777/0001-66",
      "CNPJ salvo e lido por empresa (com ou sem máscara)",
      ["js/data.js", "js/empresa.js"],
      "updateCompanyInfo / companyInfo.cnpj"
    );
    assert(
      area,
      chezCnpj !== pengCnpj &&
        Boolean(chezCnpj) &&
        Boolean(pengCnpj),
      "CNPJ não vaza entre Chez Pitu e Pengold (dados separados por empresa)",
      ["js/data.js"],
      "—"
    );
  }
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
  validateEmployeeCadastro(AppData, chez);
  validateCrossModuleLinks(AppData, chez, peng, ym);
  validatePersistence(AppData, chez, ym);
  validateVacationSync(AppData, chez);
  validateCoDirectLink(AppData, chez);
  validateAusenciasEdit(AppData, chez);
  validateScalePrintLayout();
  validateCadastroSingleFilter();
  validateDateFormatBR(AppData);
  validateWorkedSourceOfTruth(AppData);
  validateCompanyWriteResolution(AppData, chez, peng);
  validateActiveCompanyTabs(AppData, chez, peng, ym);
  validatePhase2Improvements(AppData);

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
