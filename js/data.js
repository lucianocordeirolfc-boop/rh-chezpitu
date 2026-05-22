(function () {
  const STORAGE_KEY = "chezPituPeopleSystem.v1";

  const COMPANIES = ["Chez Pitu", "Pengold"];
  const WEEK_DAYS = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo"
  ];

  const SCALE_CODES = [
    { code: "", label: "Trabalhado normal" },
    { code: "FOLGA", label: "Folga semanal" },
    { code: "DOM", label: "Folga de domingo" },
    { code: "FÉRIAS", label: "Férias" },
    { code: "CO", label: "Compensação de feriado" },
    { code: "MM", label: "Manhã Manutenção" },
    { code: "TM", label: "Tarde Manutenção (cobertura)" },
    { code: "NM", label: "Noite Manutenção" },
    { code: "MN", label: "Manhã" },
    { code: "TN", label: "Tarde" },
    { code: "NO", label: "Noite" },
    { code: "MR", label: "Manhã Recepção (cobertura)" },
    { code: "TR", label: "Tarde Recepção (cobertura)" },
    { code: "NR", label: "Noite Recepção" },
    { code: "ATESTADO", label: "Atestado" },
    { code: "FALTA", label: "Falta" },
    { code: "SUSPENSÃO", label: "Suspensão" },
    { code: "LICENÇA", label: "Licença" }
  ];

  const VT_WORKED_CODES = new Set(["", "MM", "TM", "NM", "MN", "TN", "NO", "MR", "TR", "NR"]);

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function diffDays(fromISO, toISO) {
    const from = new Date(`${fromISO}T00:00:00`);
    const to = new Date(`${toISO}T00:00:00`);
    return Math.ceil((to - from) / 86400000);
  }

  function monthKey(date = new Date()) {
    return date.toISOString().slice(0, 7);
  }

  function getDaysInMonth(yearMonth) {
    const [year, month] = yearMonth.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const days = [];

    while (date.getMonth() === month - 1) {
      days.push(date.toISOString().slice(0, 10));
      date.setDate(date.getDate() + 1);
    }

    return days;
  }

  function weekdayName(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    const index = date.getDay();
    const names = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return names[index];
  }

  function isBetween(dateISO, startISO, endISO) {
    return dateISO >= startISO && dateISO <= endISO;
  }

  function createCompanyData(companyName = "") {
    return {
      companyInfo: {
        legalName: companyName,
        cnpj: "",
        responsibleName: "",
        logoDataUrl: ""
      },
      employees: [],
      vacations: [],
      absences: [],
      holidays: [],
      manualScale: {},
      vtDeductions: {}
    };
  }

  function createDefaultState() {
    const companies = {};
    COMPANIES.forEach((company) => {
      companies[company] = createCompanyData(company);
    });

    return {
      selectedCompany: COMPANIES[0],
      escalaSelectedYearMonth: monthKey(),
      companies,
      calendarHolidays: [],
      coverageAlerts: [],
      coveragePrincipalBindings: {},
      scaleCodeConfig: {},
      valeTransporte: {
        selectedYearMonth: monthKey(),
        discountValues: {},
        deductionDays: {}
      }
    };
  }

  /** Dados locais prevalecem sobre remoto vazio/desatualizado (evita apagar descontos VT no sync). */
  function mergeRecordMapsPreferLocal(remoteMap = {}, localMap = {}) {
    return { ...remoteMap, ...localMap };
  }

  function mergeDiscountValuesByCompany(localVt = {}, remoteVt = {}) {
    const merged = {};
    COMPANIES.forEach((company) => {
      merged[company] = mergeRecordMapsPreferLocal(
        remoteVt.discountValues?.[company] || {},
        localVt.discountValues?.[company] || {}
      );
    });
    return merged;
  }

  function syncVtDeductionsToValeTransporte() {
    const vt = ensureValeTransporteState();
    if (!vt.deductionDays) vt.deductionDays = {};
    COMPANIES.forEach((company) => {
      vt.deductionDays[company] = { ...(getCompanyData(company).vtDeductions || {}) };
    });
  }

  function syncVtDeductionsFromValeTransporte() {
    const vt = ensureValeTransporteState();
    if (!vt.deductionDays) return;
    COMPANIES.forEach((company) => {
      const data = getCompanyData(company);
      if (!data.vtDeductions) data.vtDeductions = {};
      data.vtDeductions = mergeRecordMapsPreferLocal(vt.deductionDays[company] || {}, data.vtDeductions);
    });
  }

  function ensureValeTransporteState() {
    if (!state.valeTransporte || typeof state.valeTransporte !== "object") {
      state.valeTransporte = { selectedYearMonth: monthKey(), discountValues: {} };
    }
    if (!state.valeTransporte.discountValues || typeof state.valeTransporte.discountValues !== "object") {
      state.valeTransporte.discountValues = {};
    }
    if (!state.valeTransporte.deductionDays || typeof state.valeTransporte.deductionDays !== "object") {
      state.valeTransporte.deductionDays = {};
    }
    if (!state.valeTransporte.selectedYearMonth) {
      state.valeTransporte.selectedYearMonth = monthKey();
    }
    return state.valeTransporte;
  }

  function getVtSelectedYearMonth() {
    return ensureValeTransporteState().selectedYearMonth;
  }

  function setVtSelectedYearMonth(yearMonth, options = {}) {
    const normalized = String(yearMonth || "").trim();
    if (!/^\d{4}-\d{2}$/.test(normalized)) return;
    const vt = ensureValeTransporteState();
    if (vt.selectedYearMonth === normalized) return;
    vt.selectedYearMonth = normalized;
    if (options.save !== false) saveState();
  }

  function getEscalaSelectedYearMonth() {
    const stored = String(state.escalaSelectedYearMonth || "").trim();
    if (/^\d{4}-\d{2}$/.test(stored)) return stored;
    return monthKey();
  }

  function setEscalaSelectedYearMonth(yearMonth, options = {}) {
    const normalized = String(yearMonth || "").trim();
    if (!/^\d{4}-\d{2}$/.test(normalized)) return;
    if (state.escalaSelectedYearMonth === normalized) return;
    state.escalaSelectedYearMonth = normalized;
    if (options.save !== false) saveState();
  }

  function discountStorageKey(employeeId, yearMonth) {
    return `${employeeId}|${yearMonth}`;
  }

  function normalizeCurrencyInput(value) {
    if (value === undefined || value === null) return "";
    let raw = String(value).trim();
    if (!raw) return "";

    raw = raw.replace(/[R$\s]/gi, "");
    if (!raw) return "";

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");

    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else {
        raw = raw.replace(/,/g, "");
      }
    } else if (lastComma > -1) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      raw = raw.replace(/\./g, "");
    }

    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return "";
    return amount.toFixed(2);
  }

  function parseDiscountAmount(value) {
    const normalized = normalizeCurrencyInput(value);
    if (normalized === "") return null;
    return Number(normalized);
  }

  function formatDiscountDisplay(value) {
    if (value === null || value === undefined || value === "") return "";
    return ImportUtils.formatVtInput(value);
  }

  function getDiscountValue(employeeId, yearMonth, company = state.selectedCompany) {
    const vt = ensureValeTransporteState();
    const companyValues = vt.discountValues[company] || {};
    const key = discountStorageKey(employeeId, yearMonth);
    if (!Object.prototype.hasOwnProperty.call(companyValues, key)) return null;
    const stored = companyValues[key];
    if (stored === null || stored === undefined || stored === "") return null;
    return Number(stored);
  }

  function saveDiscountValue(employeeId, yearMonth, rawInput, options = {}) {
    const company = options.company || state.selectedCompany;
    const shouldSave = options.save !== false;
    const vt = ensureValeTransporteState();
    if (!vt.discountValues[company]) vt.discountValues[company] = {};

    const key = discountStorageKey(employeeId, yearMonth);
    const parsed = parseDiscountAmount(rawInput);

    if (parsed === null) {
      delete vt.discountValues[company][key];
    } else {
      vt.discountValues[company][key] = parsed;
    }

    if (shouldSave) saveState();
    return parsed;
  }

  function runScaleIntegrations(yearMonths) {
    if (!window.ScaleRules?.recomputeScaleIntegrations) return { created: 0 };
    return window.ScaleRules.recomputeScaleIntegrations(yearMonths);
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return createDefaultState();
    }

    try {
      const parsed = JSON.parse(saved);
      const defaults = createDefaultState();
      parsed.companies = parsed.companies || {};
      COMPANIES.forEach((company) => {
        parsed.companies[company] = {
          ...defaults.companies[company],
          ...(parsed.companies[company] || {})
        };
        parsed.companies[company].companyInfo = {
          ...defaults.companies[company].companyInfo,
          ...(parsed.companies[company].companyInfo || {})
        };
        parsed.companies[company].employees = parsed.companies[company].employees || [];
        parsed.companies[company].holidays = mergeHolidayLists([], parsed.companies[company].holidays || []);
        parsed.companies[company].manualScale = parsed.companies[company].manualScale || {};
        normalizeCompanyHolidays(parsed.companies[company]);
        parsed.companies[company].vacations = parsed.companies[company].vacations || [];
        parsed.companies[company].absences = parsed.companies[company].absences || [];
        parsed.companies[company].vtDeductions = parsed.companies[company].vtDeductions || {};
      });
      parsed.escalaSelectedYearMonth = parsed.escalaSelectedYearMonth || monthKey();
      parsed.calendarHolidays = parsed.calendarHolidays || [];
      parsed.coverageAlerts = parsed.coverageAlerts || [];
      parsed.coveragePrincipalBindings = parsed.coveragePrincipalBindings || {};
      parsed.scaleCodeConfig = parsed.scaleCodeConfig || {};
      parsed.valeTransporte = {
        ...defaults.valeTransporte,
        ...(parsed.valeTransporte || {}),
        discountValues: {
          ...(defaults.valeTransporte?.discountValues || {}),
          ...(parsed.valeTransporte?.discountValues || {})
        },
        deductionDays: {
          ...(defaults.valeTransporte?.deductionDays || {}),
          ...(parsed.valeTransporte?.deductionDays || {})
        }
      };
      return { ...defaults, ...parsed };
    } catch (error) {
      console.warn("Não foi possível carregar os dados salvos.", error);
      return createDefaultState();
    }
  }

  let state = loadState();
  syncVtDeductionsFromValeTransporte();

  function saveState() {
    syncVtDeductionsToValeTransporte();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Sincroniza com Firebase se disponível
    if (window.FirebaseSync?.isReady()) {
      window.FirebaseSync.save(state);
    }
  }

  function normalizeHolidayRecord(holiday) {
    if (!holiday || typeof holiday !== "object") return null;
    const normalized = {
      ...holiday,
      id: holiday.id || uid("feriado"),
      name: String(holiday.name || "").trim(),
      date: String(holiday.date || "").trim(),
      workedEmployees: Array.isArray(holiday.workedEmployees) ? holiday.workedEmployees : []
    };
    normalized.workedEmployees = normalized.workedEmployees.map((item) => ({
      ...item,
      employeeId: item.employeeId,
      compensationDate: item.compensationDate || "",
      scheduledCoDate: item.scheduledCoDate || item.compensationDate || "",
      status: item.status || "Pendente"
    }));
    return normalized;
  }

  function mergeHolidayLists(localList, remoteList) {
    const map = new Map();

    function upsert(holiday) {
      const normalized = normalizeHolidayRecord(holiday);
      if (!normalized) return;

      const existing = map.get(normalized.id);
      if (!existing) {
        map.set(normalized.id, normalized);
        return;
      }

      const employees = new Map();
      [...(existing.workedEmployees || []), ...(normalized.workedEmployees || [])].forEach((item) => {
        if (!item?.employeeId) return;
        const prev = employees.get(item.employeeId) || {};
        employees.set(item.employeeId, { ...prev, ...item });
      });
      existing.workedEmployees = [...employees.values()];
      map.set(normalized.id, existing);
    }

    (localList || []).forEach(upsert);
    (remoteList || []).forEach(upsert);
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function normalizeCompanyHolidays(companyBlock) {
    if (!companyBlock) return;
    companyBlock.holidays = mergeHolidayLists([], companyBlock.holidays || []);
  }

  // Aplica estado recebido do Firebase (chamado pelo sync em tempo real)
  function setRemoteState(remoteState, options = {}) {
    if (!remoteState || typeof remoteState !== "object") return;
    const defaults = createDefaultState();
    const preserveLocalHolidays = options.preserveLocalHolidays !== false;
    const previous = state;
    const localSnapshot = options.localSnapshot || null;
    const localCompanies = localSnapshot?.companies || previous.companies || {};
    const localVt = localSnapshot?.valeTransporte || previous.valeTransporte || {};

    remoteState.companies = remoteState.companies || {};
    COMPANIES.forEach((company) => {
      const localHolidays = preserveLocalHolidays ? localCompanies?.[company]?.holidays || [] : [];
      const remoteHolidays = remoteState.companies[company]?.holidays || [];
      const remoteDeductions = remoteState.companies[company]?.vtDeductions || {};
      const localDeductions = mergeRecordMapsPreferLocal(
        localCompanies?.[company]?.vtDeductions || {},
        localVt?.deductionDays?.[company] || {}
      );

      remoteState.companies[company] = {
        ...defaults.companies[company],
        ...(remoteState.companies[company] || {})
      };
      remoteState.companies[company].companyInfo = {
        ...defaults.companies[company].companyInfo,
        ...(remoteState.companies[company].companyInfo || {})
      };
      remoteState.companies[company].employees = remoteState.companies[company].employees || [];
      remoteState.companies[company].holidays = mergeHolidayLists(localHolidays, remoteHolidays);
      remoteState.companies[company].manualScale = remoteState.companies[company].manualScale || {};
      remoteState.companies[company].vacations = remoteState.companies[company].vacations || [];
      remoteState.companies[company].absences = remoteState.companies[company].absences || [];
      remoteState.companies[company].vtDeductions = mergeRecordMapsPreferLocal(remoteDeductions, localDeductions);
      normalizeCompanyHolidays(remoteState.companies[company]);
    });
    const remoteVt = remoteState.valeTransporte || {};
    state = {
      ...defaults,
      ...remoteState,
      escalaSelectedYearMonth:
        localSnapshot?.escalaSelectedYearMonth ||
        previous.escalaSelectedYearMonth ||
        remoteState.escalaSelectedYearMonth ||
        defaults.escalaSelectedYearMonth,
      calendarHolidays: remoteState.calendarHolidays || [],
      coverageAlerts: remoteState.coverageAlerts || [],
      coveragePrincipalBindings: remoteState.coveragePrincipalBindings || {},
      scaleCodeConfig: remoteState.scaleCodeConfig || {},
      valeTransporte: {
        ...defaults.valeTransporte,
        ...remoteVt,
        selectedYearMonth:
          localVt.selectedYearMonth ||
          previous.valeTransporte?.selectedYearMonth ||
          remoteVt.selectedYearMonth ||
          defaults.valeTransporte.selectedYearMonth,
        discountValues: mergeDiscountValuesByCompany(localVt, remoteVt),
        deductionDays: {}
      }
    };
    syncVtDeductionsToValeTransporte();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getCompanyData(company = state.selectedCompany) {
    return state.companies[company];
  }

  function setSelectedCompany(company) {
    if (!COMPANIES.includes(company)) return;
    state.selectedCompany = company;
    saveState();
  }

  function updateCompanyInfo(companyInfo) {
    const data = getCompanyData();
    data.companyInfo = {
      ...(data.companyInfo || {}),
      legalName: companyInfo.legalName.trim(),
      cnpj: companyInfo.cnpj.trim(),
      responsibleName: String(companyInfo.responsibleName ?? data.companyInfo?.responsibleName ?? "").trim()
    };
    saveState();
  }

  function updateCompanyLogo(logoDataUrl) {
    const data = getCompanyData();
    data.companyInfo = {
      ...(data.companyInfo || {}),
      logoDataUrl: logoDataUrl || ""
    };
    saveState();
  }

  const MOCK_EMPLOYEE_NAMES = new Set(
    [
      "Ana Paula Silva",
      "Carlos Eduardo Lima",
      "Fernanda Costa",
      "Roberto Alves",
      "Juliana Mendes",
      "Marcos Pereira",
      "Maria Exemplo"
    ].map((name) => normalizeEmployeeName(name))
  );

  const COMPANY_ALIASES = {
    chezpitu: "Chez Pitu",
    "chez pitu": "Chez Pitu",
    "grupo chez pitu": "Chez Pitu",
    hotelchezpitu: "Chez Pitu",
    pengold: "Pengold",
    "pengold joias": "Pengold"
  };

  function normalizeCompanyName(value) {
    const clean = String(value || "").trim();
    if (!clean) return "";
    const key = clean
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, "");
    if (COMPANY_ALIASES[key]) return COMPANY_ALIASES[key];
    const match = COMPANIES.find((company) => company.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR"));
    return match || "";
  }

  function normalizeEmployeeName(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function getTotalEmployeeCount() {
    return COMPANIES.reduce((total, company) => total + (state.companies[company]?.employees?.length || 0), 0);
  }

  function getEmployeeCounts() {
    const byCompany = COMPANIES.map((company) => ({
      company,
      total: state.companies[company]?.employees?.length || 0,
      active: (state.companies[company]?.employees || []).filter((employee) => employee.status === "Ativo").length
    }));
    return {
      total: byCompany.reduce((sum, item) => sum + item.total, 0),
      byCompany
    };
  }

  function isMockEmployee(employee) {
    if (!employee) return false;
    if (employee.source === "seed") return true;
    return MOCK_EMPLOYEE_NAMES.has(normalizeEmployeeName(employee.name));
  }

  function purgeMockEmployees() {
    let removed = 0;

    COMPANIES.forEach((company) => {
      const data = getCompanyData(company);
      const mockIds = data.employees.filter((employee) => isMockEmployee(employee)).map((employee) => employee.id);
      mockIds.forEach((id) => {
        removeEmployeeFromCompany(company, id, false);
        removed += 1;
      });
    });

    if (removed) saveState();
    return removed;
  }

  function normalizeCpfDigits(value) {
    return ImportUtils.normalizeCpfDigits(value);
  }

  function formatCpf(value) {
    return ImportUtils.formatCpf(value);
  }

  function formatCtps(value) {
    return ImportUtils.formatCtps(value);
  }

  function findEmployeeByCpf(cpf, company) {
    const digits = normalizeCpfDigits(cpf);
    if (!digits) return null;
    const data = getCompanyData(company);
    return data.employees.find((employee) => normalizeCpfDigits(employee.cpf) === digits) || null;
  }

  function findEmployeeCompanyByCpf(cpf, excludeCompany = "") {
    const digits = normalizeCpfDigits(cpf);
    if (!digits) return null;

    for (const company of COMPANIES) {
      if (company === excludeCompany) continue;
      const employee = findEmployeeByCpf(digits, company);
      if (employee) return { company, employee };
    }

    return null;
  }

  function findEmployeeByName(name, company) {
    const target = normalizeEmployeeName(name);
    if (!target) return null;
    const data = getCompanyData(company);
    return data.employees.find((employee) => normalizeEmployeeName(employee.name) === target) || null;
  }

  function resolveImportCompany(rowCompany, fallbackCompany) {
    const normalized = normalizeCompanyName(rowCompany);
    if (COMPANIES.includes(normalized)) return normalized;
    return fallbackCompany;
  }

  function upsertEmployee(employee, company = state.selectedCompany, options = {}) {
    const data = getCompanyData(company);
    const hasFixedDay = Object.prototype.hasOwnProperty.call(employee, "fixedDay");
    const cpfFormatted = formatCpf(employee.cpf || "");
    const cpfDigits = normalizeCpfDigits(cpfFormatted);
    const existingById = employee.id ? data.employees.find((item) => item.id === employee.id) : null;
    const existingByCpf = cpfDigits ? findEmployeeByCpf(cpfDigits, company) : null;
    const existing = existingById || existingByCpf;

    if (cpfDigits && !options.allowCrossCompany) {
      const otherCompany = findEmployeeCompanyByCpf(cpfDigits, company);
      if (otherCompany && (!existing || existing.id !== otherCompany.employee.id)) {
        throw new Error(`CPF já cadastrado em ${otherCompany.company}.`);
      }
    }

    const source = employee.source || existing?.source || "manual";
    const normalized = {
      id: existing?.id || employee.id || uid("func"),
      name: String(employee.name || "").trim(),
      cpf: cpfFormatted,
      ctps: formatCtps(employee.ctps || ""),
      role: String(employee.role ?? existing?.role ?? "").trim(),
      department: String(employee.department ?? existing?.department ?? "").trim(),
      status: employee.status || existing?.status || "Ativo",
      admissionDate: employee.admissionDate || existing?.admissionDate || todayISO(),
      fixedDay: hasFixedDay ? String(employee.fixedDay || "").trim() : existing?.fixedDay || "",
      vtDaily:
        employee.vtDaily === "" || employee.vtDaily === undefined
          ? ImportUtils.repairVtDailyValue(existing?.vtDaily || 0)
          : ImportUtils.repairVtDailyValue(ImportUtils.parseVtDaily(employee.vtDaily)),
      defaultShift: String(employee.defaultShift ?? existing?.defaultShift ?? "").trim(),
      sundayOffWeeks: String(employee.sundayOffWeeks ?? existing?.sundayOffWeeks ?? "").trim(),
      doubleSundayOff: String(employee.doubleSundayOff ?? existing?.doubleSundayOff ?? "false"),
      notes: employee.notes ?? existing?.notes ?? "",
      source
    };

    const index = data.employees.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      data.employees[index] = normalized;
    } else {
      data.employees.push(normalized);
    }

    if (options.save !== false) saveState();
    return normalized;
  }

  function removeEmployeeFromCompany(company, id, shouldSave = true) {
    const data = getCompanyData(company);
    data.employees = data.employees.filter((employee) => employee.id !== id);
    data.vacations = data.vacations.filter((vacation) => vacation.employeeId !== id);
    data.absences = (data.absences || []).filter((absence) => absence.employeeId !== id);
    Object.keys(data.manualScale).forEach((key) => {
      if (key.startsWith(`${id}|`)) delete data.manualScale[key];
    });
    data.holidays.forEach((holiday) => {
      holiday.workedEmployees = holiday.workedEmployees.filter((item) => item.employeeId !== id);
    });
    if (shouldSave) saveState();
  }

  function removeEmployee(id, company = state.selectedCompany) {
    removeEmployeeFromCompany(company, id, true);
  }

  function monthsTouchedByRange(startDate, endDate) {
    const months = new Set();
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const cursor = new Date(start);
    while (cursor <= end) {
      months.add(monthKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return [...months];
  }

  function addVacation(vacation) {
    const data = getCompanyData();
    data.vacations.push({
      id: uid("ferias"),
      employeeId: vacation.employeeId,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      note: vacation.note || ""
    });
    runScaleIntegrations(monthsTouchedByRange(vacation.startDate, vacation.endDate));
    saveState();
  }

  function removeVacation(id) {
    const data = getCompanyData();
    const vacation = data.vacations.find((item) => item.id === id);
    data.vacations = data.vacations.filter((item) => item.id !== id);
    if (vacation) runScaleIntegrations(monthsTouchedByRange(vacation.startDate, vacation.endDate));
    saveState();
  }

  function addAbsence(absence) {
    const data = getCompanyData();
    if (!data.absences) data.absences = [];
    data.absences.push({
      id: uid("ausencia"),
      employeeId: absence.employeeId,
      type: absence.type || "Atestado médico",
      startDate: absence.startDate,
      endDate: absence.endDate,
      cid: absence.cid || "",
      note: absence.note || ""
    });
    saveState();
  }

  function removeAbsence(id) {
    const data = getCompanyData();
    data.absences = (data.absences || []).filter((absence) => absence.id !== id);
    saveState();
  }

  function addHoliday(holiday) {
    const data = getCompanyData();
    data.holidays.push({
      id: uid("feriado"),
      name: holiday.name.trim(),
      date: holiday.date,
      workedEmployees: holiday.workedEmployees || []
    });
    saveState();
  }

  function removeHoliday(id) {
    const data = getCompanyData();
    data.holidays = data.holidays.filter((holiday) => holiday.id !== id);
    saveState();
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function resolveWorkedHolidayStatus(item, holidayDate, today = todayISO()) {
    const dueDate = addDays(holidayDate, 120);
    const daysLeft = diffDays(today, dueDate);

    if (item.compensationDate) {
      if (item.compensationDate > today) return { key: "agendado", label: "Agendado", daysLeft };
      return { key: "compensado", label: "Compensado", daysLeft };
    }

    if (daysLeft < 0) return { key: "vencido", label: "Vencido", daysLeft };
    return { key: "pendente", label: "Pendente", daysLeft };
  }

  function syncWorkedEmployeeStatus(item, holidayDate) {
    const resolved = resolveWorkedHolidayStatus(item, holidayDate);
    item.status = resolved.label;
    return resolved;
  }

  function canAutoLinkWorkedEmployee(item, coDate = "") {
    if (!item) return false;
    if (item.status === "Compensado" && !item.linkedFromScale) return false;
    if (item.linkedFromScale && item.scaleCoDate === coDate) return true;
    if (item.scaleCoDate && item.scaleCoDate !== coDate) return false;
    if (!item.compensationDate) return true;
    return item.status === "Pendente" || item.status === "Agendado";
  }

  function findOldestLinkableHolidayWorked(data, employeeId, preferredHolidayId, coDate = "") {
    if (preferredHolidayId) {
      const preferred = data.holidays.find((holiday) => holiday.id === preferredHolidayId);
      const preferredItem = preferred?.workedEmployees?.find((item) => item.employeeId === employeeId);
      if (preferred && preferredItem && canAutoLinkWorkedEmployee(preferredItem, coDate)) {
        return { holiday: preferred, item: preferredItem };
      }
    }

    const candidates = [];
    (data.holidays || []).forEach((holiday) => {
      (holiday.workedEmployees || []).forEach((item) => {
        if (item.employeeId !== employeeId) return;
        if (!canAutoLinkWorkedEmployee(item, coDate)) return;
        candidates.push({ holiday, item });
      });
    });

    candidates.sort((a, b) => a.holiday.date.localeCompare(b.holiday.date));
    return candidates[0] || null;
  }

  function isCoDateAlreadyLinked(data, employeeId, coDate, excludeHolidayId = "") {
    return (data.holidays || []).some((holiday) => {
      if (holiday.id === excludeHolidayId) return false;
      return (holiday.workedEmployees || []).some(
        (item) => item.employeeId === employeeId && item.linkedFromScale && item.scaleCoDate === coDate
      );
    });
  }

  function linkScaleCoToHoliday(employeeId, coDate, options = {}) {
    const company = options.company || state.selectedCompany;
    const data = getCompanyData(company);
    const today = todayISO();
    const target = findOldestLinkableHolidayWorked(data, employeeId, options.preferredHolidayId, coDate);

    if (!target) {
      return { linked: false, message: "Nenhum feriado trabalhado pendente encontrado para vincular ao CO." };
    }

    if (isCoDateAlreadyLinked(data, employeeId, coDate, target.holiday.id)) {
      return { linked: false, message: "Esta data de CO já está vinculada a outro feriado." };
    }

    const { holiday, item } = target;
    item.compensationDate = coDate;
    item.scheduledCoDate = coDate;
    item.scaleCoDate = coDate;
    item.linkedFromScale = true;
    item.linkedHolidayId = holiday.id;
    syncWorkedEmployeeStatus(item, holiday.date);

    const daysAfter = diffDays(holiday.date, coDate);
    const warning =
      daysAfter > 120 ? "Compensação agendada fora do prazo de 120 dias." : "";

    return {
      linked: true,
      holiday,
      item,
      warning,
      status: item.status
    };
  }

  function unlinkScaleCoFromHoliday(employeeId, coDate, options = {}) {
    const company = options.company || state.selectedCompany;
    const data = getCompanyData(company);
    let changed = false;

    (data.holidays || []).forEach((holiday) => {
      (holiday.workedEmployees || []).forEach((item) => {
        if (item.employeeId !== employeeId) return;
        const matchesCo =
          item.linkedFromScale &&
          (item.scaleCoDate === coDate || item.compensationDate === coDate);
        if (!matchesCo) return;

        item.compensationDate = "";
        item.scheduledCoDate = "";
        item.scaleCoDate = "";
        item.linkedFromScale = false;
        item.linkedHolidayId = "";
        syncWorkedEmployeeStatus(item, holiday.date);
        changed = true;
      });
    });

    return { changed };
  }

  function getPreviousManualScaleCode(data, employeeId, date) {
    const entry = data.manualScale[`${employeeId}|${date}`];
    if (entry === undefined) return undefined;
    return typeof entry === "object" ? entry.code : entry;
  }

  function getHolidayStats(company = state.selectedCompany) {
    const data = getCompanyData(company);
    const today = todayISO();
    const stats = {
      pending: 0,
      agendado: 0,
      compensado: 0,
      vencido: 0,
      deadlineAlerts: 0
    };

    (data.holidays || []).forEach((holiday) => {
      (holiday.workedEmployees || []).forEach((item) => {
        const resolved = resolveWorkedHolidayStatus(item, holiday.date, today);
        item.status = resolved.label;
        if (resolved.key === "pendente") stats.pending += 1;
        if (resolved.key === "agendado") stats.agendado += 1;
        if (resolved.key === "compensado") stats.compensado += 1;
        if (resolved.key === "vencido") stats.vencido += 1;
        if ((resolved.key === "pendente" || resolved.key === "agendado") && resolved.daysLeft <= 20) {
          stats.deadlineAlerts += 1;
        }
      });
    });

    return stats;
  }

  function setManualScale(employeeId, date, code, linkedHolidayId, company) {
    const resolvedCompany = company || state.selectedCompany;
    const data = getCompanyData(resolvedCompany);
    const key = `${employeeId}|${date}`;
    const previousCode = getPreviousManualScaleCode(data, employeeId, date);
    let coWarning = "";

    if (previousCode === "CO" && code !== "CO") {
      unlinkScaleCoFromHoliday(employeeId, date, { company: resolvedCompany });
    }

    if (code === "__AUTO__") {
      delete data.manualScale[key];
    } else if (linkedHolidayId) {
      data.manualScale[key] = { code, linkedHolidayId };
    } else {
      data.manualScale[key] = code;
    }

    if (code === "CO") {
      const result = linkScaleCoToHoliday(employeeId, date, {
        company: resolvedCompany,
        preferredHolidayId: linkedHolidayId
      });
      if (result.warning) coWarning = result.warning;
      if (!result.linked && result.message) coWarning = result.message;
      if (result.linked && linkedHolidayId) {
        data.manualScale[key] = { code: "CO", linkedHolidayId: result.holiday.id };
      }
    }

    runScaleIntegrations([date.slice(0, 7)]);
    saveState();
    return { coWarning };
  }

  function setVtDeduction(employeeId, yearMonth, days, options = {}) {
    const company = options.company || state.selectedCompany;
    const data = getCompanyData(company);
    if (!data.vtDeductions) data.vtDeductions = {};
    const vt = ensureValeTransporteState();
    if (!vt.deductionDays[company]) vt.deductionDays[company] = {};
    const key = `${employeeId}|${yearMonth}`;
    const raw = String(days ?? "").trim();

    if (raw === "") {
      delete data.vtDeductions[key];
      delete vt.deductionDays[company][key];
    } else {
      const value = Math.max(0, parseInt(raw, 10) || 0);
      if (value === 0) {
        delete data.vtDeductions[key];
        delete vt.deductionDays[company][key];
      } else {
        data.vtDeductions[key] = value;
        vt.deductionDays[company][key] = value;
      }
    }

    if (options.save !== false) saveState();
  }

  function getVtDeduction(employeeId, yearMonth, data = getCompanyData(), company = state.selectedCompany) {
    const key = `${employeeId}|${yearMonth}`;
    if (data.vtDeductions && Object.prototype.hasOwnProperty.call(data.vtDeductions, key)) {
      return Math.max(0, parseInt(data.vtDeductions[key], 10) || 0);
    }
    const fromVt = ensureValeTransporteState().deductionDays?.[company]?.[key];
    if (fromVt === undefined || fromVt === null || fromVt === "") return 0;
    return Math.max(0, parseInt(fromVt, 10) || 0);
  }

  function getVtDeductionDisplay(employeeId, yearMonth, data = getCompanyData(), company = state.selectedCompany) {
    const key = `${employeeId}|${yearMonth}`;
    if (data.vtDeductions && Object.prototype.hasOwnProperty.call(data.vtDeductions, key)) {
      return String(data.vtDeductions[key]);
    }
    const fromVt = ensureValeTransporteState().deductionDays?.[company]?.[key];
    if (fromVt === undefined || fromVt === null || fromVt === "") return "";
    return String(fromVt);
  }

  function getManualScaleEntry(employeeId, date, data) {
    const key = `${employeeId}|${date}`;
    return Object.prototype.hasOwnProperty.call(data.manualScale, key)
      ? data.manualScale[key]
      : undefined;
  }

  function getNthSundayOfMonth(isoDate) {
    // Returns which occurrence (1–5) of Sunday this date is in its month
    return Math.ceil(new Date(`${isoDate}T00:00:00`).getDate() / 7);
  }

  function getScaleCode(employee, date, data = getCompanyData()) {
    const vacation = data.vacations.find((item) => item.employeeId === employee.id && isBetween(date, item.startDate, item.endDate));
    if (vacation) return "FÉRIAS";

    const manual = data.manualScale[`${employee.id}|${date}`];
    if (manual !== undefined) return typeof manual === "object" ? manual.code : manual;

    const compensation = data.holidays.some((holiday) =>
      holiday.workedEmployees.some((item) => item.employeeId === employee.id && item.compensationDate === date)
    );
    if (compensation) return "CO";

    // Sunday off weeks: mark specific Sundays as "DOM" based on cadastro
    if (weekdayName(date) === "Domingo" && employee.sundayOffWeeks) {
      const weeks = String(employee.sundayOffWeeks).split(",").map((s) => s.trim()).filter(Boolean);
      if (weeks.length > 0 && weeks.includes(String(getNthSundayOfMonth(date)))) {
        return "DOM";
      }
    }

    if (employee.fixedDay && employee.fixedDay === weekdayName(date)) return "FOLGA";
    return "";
  }

  function getEmployeeName(employeeId, data = getCompanyData()) {
    return data.employees.find((employee) => employee.id === employeeId)?.name || "Funcionário não encontrado";
  }

  function findOrCreateHoliday(data, name, date) {
    const holidayName = String(name || "").trim();
    const holidayDate = String(date || "").trim();
    let holiday = data.holidays.find((item) => item.name === holidayName && item.date === holidayDate);

    if (!holiday) {
      holiday = {
        id: uid("feriado"),
        name: holidayName,
        date: holidayDate,
        workedEmployees: []
      };
      data.holidays.push(holiday);
    }

    return holiday;
  }

  function importEmployeesBatch(rows, options = {}) {
    const fallbackCompany = options.fallbackCompany || state.selectedCompany;
    const mapRow = options.mapRow || ((row) => row);
    const result = { imported: 0, skipped: 0, updated: 0, messages: [] };
    const cpfSeenInBatch = new Set();

    rows.forEach((rawRow, index) => {
      const mapped = mapRow(rawRow);
      const name = String(mapped.name || "").trim();
      if (!name) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: ignorada — nome do funcionário ausente.`);
        return;
      }

      if (MOCK_EMPLOYEE_NAMES.has(normalizeEmployeeName(name))) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: ignorada — registro de demonstração.`);
        return;
      }

      const company = resolveImportCompany(mapped.company, fallbackCompany);
      if (!COMPANIES.includes(company)) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: empresa "${mapped.company || ""}" inválida. Use Chez Pitu ou Pengold.`);
        return;
      }

      const cpfDigits = normalizeCpfDigits(mapped.cpf || "");
      if (cpfDigits) {
        const batchKey = `${company}|${cpfDigits}`;
        if (cpfSeenInBatch.has(batchKey)) {
          result.skipped += 1;
          result.messages.push(`Linha ${index + 1}: CPF duplicado no arquivo (${formatCpf(cpfDigits)}).`);
          return;
        }
        cpfSeenInBatch.add(batchKey);

        const otherCompany = findEmployeeCompanyByCpf(cpfDigits, company);
        if (otherCompany) {
          result.skipped += 1;
          result.messages.push(
            `Linha ${index + 1}: CPF ${formatCpf(cpfDigits)} já pertence a ${otherCompany.company}.`
          );
          return;
        }
      }

      const fixedDayRaw = mapped.fixedDay;
      const hasFixedDay = fixedDayRaw !== undefined && fixedDayRaw !== null;
      const existing = cpfDigits ? findEmployeeByCpf(cpfDigits, company) : null;

      upsertEmployee(
        {
          id: existing?.id,
          name,
          cpf: mapped.cpf || "",
          ctps: mapped.ctps || "",
          role: mapped.role || existing?.role || "",
          department: mapped.department || existing?.department || "",
          status: mapped.status || "Ativo",
          admissionDate: mapped.admissionDate || existing?.admissionDate || todayISO(),
          fixedDay: hasFixedDay ? String(fixedDayRaw).trim() : existing?.fixedDay || "",
          vtDaily: mapped.vtDaily,
          defaultShift: mapped.defaultShift || existing?.defaultShift || "",
          notes: mapped.notes || existing?.notes || "",
          source: "imported"
        },
        company,
        { save: false, allowCrossCompany: true }
      );

      if (existing) {
        result.updated += 1;
      }
      result.imported += 1;
    });

    if (result.imported) saveState();
    result.counts = getEmployeeCounts();
    return result;
  }

  function importHolidaysBatch(rows, options = {}) {
    const fallbackCompany = options.fallbackCompany || state.selectedCompany;
    const mapRow = options.mapRow || ((row) => row);
    const result = { imported: 0, skipped: 0, messages: [] };
    let touched = false;

    rows.forEach((rawRow, index) => {
      const mapped = mapRow(rawRow);
      const employeeName = String(mapped.employeeName || "").trim();
      const holidayName = String(mapped.holidayName || "").trim();
      const workedDate = String(mapped.workedDate || "").trim();

      if (!employeeName) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: ignorada — nome do funcionário ausente.`);
        return;
      }

      if (!holidayName || !workedDate) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: ignorada — feriado ou data trabalhada ausente.`);
        return;
      }

      const company = resolveImportCompany(mapped.company, fallbackCompany);
      if (!COMPANIES.includes(company)) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: empresa "${mapped.company}" não reconhecida.`);
        return;
      }

      const data = getCompanyData(company);
      const employee = findEmployeeByName(employeeName, company);
      if (!employee) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: funcionário "${employeeName}" não encontrado em ${company}.`);
        return;
      }

      const dueDate = mapped.dueDate || addDays(workedDate, 120);
      let compensationDate = String(mapped.compensationDate || "").trim();
      const statusText = String(mapped.status || "").toLocaleLowerCase("pt-BR");

      if (!compensationDate && (statusText.includes("compens") || statusText.includes("tirad"))) {
        compensationDate = dueDate;
      }

      if (compensationDate && diffDays(workedDate, compensationDate) > 120) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: compensação fora do prazo de 120 dias.`);
        return;
      }

      const holiday = findOrCreateHoliday(data, holidayName, workedDate);
      const existing = holiday.workedEmployees.find((item) => item.employeeId === employee.id);

      if (existing) {
        if (compensationDate) existing.compensationDate = compensationDate;
        if (mapped.notes) existing.note = mapped.notes;
        syncWorkedEmployeeStatus(existing, holiday.date);
      } else {
        const item = {
          employeeId: employee.id,
          compensationDate,
          note: mapped.notes || ""
        };
        syncWorkedEmployeeStatus(item, holiday.date);
        holiday.workedEmployees.push(item);
      }

      touched = true;
      result.imported += 1;
    });

    if (touched) saveState();
    return result;
  }

  function exportCurrentDataJSON() {
    return JSON.stringify(state, null, 2);
  }

  function migrateEmployeeSources() {
    COMPANIES.forEach((company) => {
      getCompanyData(company).employees.forEach((employee) => {
        if (!employee.source) {
          employee.source = isMockEmployee(employee) ? "seed" : "manual";
        }
        employee.vtDaily = ImportUtils.repairVtDailyValue(employee.vtDaily);
      });
    });
  }

  migrateEmployeeSources();
  purgeMockEmployees();

  window.AppData = {
    COMPANIES,
    WEEK_DAYS,
    SCALE_CODES,
    VT_WORKED_CODES,
    runScaleIntegrations,
    addDays,
    diffDays,
    getCompanyData,
    getDaysInMonth,
    getEmployeeName,
    getScaleCode,
    exportCurrentDataJSON,
    findEmployeeByCpf,
    findEmployeeByName,
    formatCpf,
    getEmployeeCounts,
    getTotalEmployeeCount,
    importEmployeesBatch,
    importHolidaysBatch,
    isBetween,
    normalizeCompanyName,
    purgeMockEmployees,
    monthKey,
    removeEmployee,
    removeHoliday,
    removeVacation,
    saveState,
    setManualScale,
    setSelectedCompany,
    state,
    todayISO,
    updateCompanyInfo,
    updateCompanyLogo,
    setRemoteState,
    getManualScaleEntry,
    setVtDeduction,
    getVtDeduction,
    getVtDeductionDisplay,
    getVtSelectedYearMonth,
    setVtSelectedYearMonth,
    getEscalaSelectedYearMonth,
    setEscalaSelectedYearMonth,
    normalizeCurrencyInput,
    saveDiscountValue,
    getDiscountValue,
    formatDiscountDisplay,
    parseDiscountAmount,
    upsertEmployee,
    addVacation,
    addAbsence,
    removeAbsence,
    addHoliday,
    resolveWorkedHolidayStatus,
    syncWorkedEmployeeStatus,
    linkScaleCoToHoliday,
    unlinkScaleCoFromHoliday,
    getHolidayStats,
    normalizeSearchText,
    weekdayName,
    formatVtCurrency: ImportUtils.formatVtCurrency,
    formatVtInput: ImportUtils.formatVtInput,
    parseVtDaily: ImportUtils.parseVtDaily
  };
})();
