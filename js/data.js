(function () {
  const STORAGE_KEY = "chezPituPeopleSystem.v1";
  const LEGACY_VT_BACKUP_KEY = "chezPituVtBackup.v1";

  /**
   * Versão do esquema persistido sob STORAGE_KEY. O leitor (loadState) tolera
   * tanto o payload completo legado (sem schemaVersion) quanto os payloads
   * reduzidos ("slim"/"lean") — a migração é sempre não-destrutiva: o que falta
   * localmente é restaurado pelo merge com o Firebase (fonte de verdade).
   */
  const PERSIST_SCHEMA_VERSION = 2;
  const CACHE_VERSION = "v1";

  const COMPANIES = ["Chez Pitu", "Pengold"];
  const DEFAULT_SELECTED_COMPANY = "Pengold";
  const HOLIDAY_COMPENSATION_DAYS = 120;

  const ABSENCE_TYPE_SCALE_CODES = {
    "Atestado médico": "ATESTADO",
    "Licença maternidade": "LICENÇA",
    "Licença paternidade": "LICENÇA",
    "Licença INSS / Afastamento": "LICENÇA",
    "Licença não remunerada": "LICENÇA",
    "Falta justificada": "FALTA",
    Outro: "FALTA"
  };
  /** Valor interno do filtro "Todas" por página (não é chave de companies). */
  const PAGE_COMPANY_ALL = "__todas__";

  const PAGE_FILTER_KEYS = {
    dashboard: "dashboardEmpresaSelecionada",
    funcionarios: "cadastroEmpresaSelecionada",
    escala: "escalaEmpresaSelecionada",
    ferias: "ausenciasEmpresaSelecionada",
    "vale-transporte": "vtEmpresaSelecionada",
    feriados: "feriadosEmpresaSelecionada",
    contador: "contadorEmpresaSelecionada"
  };

  const PAGE_MODULE_IDS = Object.keys(PAGE_FILTER_KEYS);

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

  /**
   * Códigos que NUNCA contam como dia trabalhado (folga, ausência e compensação).
   * Fonte única de verdade compartilhada por VT, Escala, Feriados e Dashboard.
   */
  const NOT_WORKED_SCALE_CODES = new Set([
    "FOLGA",
    "DOM",
    "FÉRIAS",
    "CO",
    "ATESTADO",
    "FALTA",
    "SUSPENSÃO",
    "LICENÇA"
  ]);

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

  /** Primeiro dia do mês seguinte à data informada (regra para folga fixa). */
  function getNextMonthFirstDay(fromIso = todayISO()) {
    const date = new Date(`${fromIso}T00:00:00`);
    date.setMonth(date.getMonth() + 1, 1);
    return date.toISOString().slice(0, 10);
  }

  function formatDateBR(isoDate) {
    if (!isoDate) return "—";
    const [year, month, day] = String(isoDate).split("-");
    return `${day}/${month}/${year}`;
  }

  function normalizeFixedDayHistory(employee) {
    if (!employee || !Array.isArray(employee.fixedDayHistory)) return [];
    return employee.fixedDayHistory
      .map((entry) => ({
        fixedDay: String(entry.fixedDay || "").trim(),
        from: String(entry.from || "").trim(),
        to: String(entry.to || "").trim()
      }))
      .filter((entry) => entry.fixedDay);
  }

  function resolveFixedDayForDate(employee, date) {
    if (!employee) return "";
    const history = normalizeFixedDayHistory(employee);
    if (history.length) {
      for (const entry of history) {
        const from = entry.from || "0000-01-01";
        const to = entry.to || "9999-12-31";
        if (date >= from && date <= to) return entry.fixedDay;
      }
    }
    return String(employee.fixedDay || "").trim();
  }

  function scheduleFixedDayChange(existing, newFixedDay) {
    const oldDay = String(existing?.fixedDay || "").trim();
    const nextDay = String(newFixedDay || "").trim();

    if (!existing) {
      return { fixedDay: nextDay, fixedDayHistory: [] };
    }

    if (oldDay === nextDay) {
      return {
        fixedDay: nextDay,
        fixedDayHistory: normalizeFixedDayHistory(existing)
      };
    }

    const effectiveFrom = getNextMonthFirstDay();
    const lastDayBefore = addDays(effectiveFrom, -1);
    let history = normalizeFixedDayHistory(existing);

    if (!history.length && oldDay) {
      history.push({ fixedDay: oldDay, from: "", to: lastDayBefore });
    } else {
      history = history.map((entry) => {
        if (!entry.to && (!entry.from || entry.from < effectiveFrom)) {
          return { ...entry, to: lastDayBefore };
        }
        return entry;
      });
    }

    history.push({ fixedDay: nextDay, from: effectiveFrom, to: "" });

    return { fixedDay: nextDay, fixedDayHistory: history };
  }

  function getFixedDayChangeInfo(employee) {
    if (!employee) return null;
    const effectiveFrom = getNextMonthFirstDay();
    const today = todayISO();
    const currentDay = resolveFixedDayForDate(employee, today);
    const nextDay = String(employee.fixedDay || "").trim();
    if (currentDay === nextDay) return null;
    return {
      currentDay,
      nextDay,
      effectiveFrom,
      effectiveFromLabel: formatDateBR(effectiveFrom)
    };
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

  // ─────────────────────────────────────────────────────────────────────────
  // PROTEÇÃO DOS DADOS DA EMPRESA (dados críticos — nunca apagar automaticamente)
  // ─────────────────────────────────────────────────────────────────────────
  const COMPANY_CRITICAL_FIELDS = [
    { key: "legalName", label: "Razão Social" },
    { key: "tradeName", label: "Nome Fantasia" },
    { key: "cnpj", label: "CNPJ" },
    { key: "responsibleName", label: "Responsável" },
    { key: "address", label: "Endereço" },
    { key: "phones", label: "Telefones" },
    { key: "email", label: "E-mail" },
    { key: "bankInfo", label: "Dados Bancários" },
    { key: "logoDataUrl", label: "Logo" },
    { key: "contadorInfo", label: "Informações do Contador" },
    { key: "vtInfo", label: "Informações do Vale Transporte" }
  ];
  const COMPANY_INFO_HISTORY_LIMIT = 15;
  /** CNPJ pode estar salvo sob qualquer um destes nomes de campo. */
  const COMPANY_CNPJ_FIELDS = ["cnpj", "CNPJ", "document", "taxId", "companyCnpj"];

  function emptyCompanyInfo(companyName = "") {
    const info = {};
    COMPANY_CRITICAL_FIELDS.forEach((field) => {
      info[field.key] = "";
    });
    info.legalName = companyName;
    info.updatedAt = 0;
    return info;
  }

  function resolveCompanyCnpj(info) {
    if (!info || typeof info !== "object") return "";
    for (const field of COMPANY_CNPJ_FIELDS) {
      const value = info[field];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  /** Um registro é "significativo" (válido) se tiver CNPJ OU Razão Social. */
  function isMeaningfulCompanyInfo(info) {
    if (!info || typeof info !== "object") return false;
    const cnpj = resolveCompanyCnpj(info);
    const legal = String(info.legalName || "").trim();
    return Boolean(cnpj || legal);
  }

  function valueIsFilled(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  /**
   * Merge campo a campo que NUNCA substitui um valor preenchido por vazio/null/undefined.
   * Só sobrescreve quando o valor de entrada está realmente preenchido.
   */
  function mergeCompanyInfoPreserving(existing = {}, incoming = {}) {
    const result = { ...(existing || {}) };
    Object.keys(incoming || {}).forEach((key) => {
      if (valueIsFilled(incoming[key])) result[key] = incoming[key];
    });
    return result;
  }

  function normalizeCompanyInfoShape(info, companyName = "") {
    const base = emptyCompanyInfo(companyName);
    const merged = { ...base, ...(info || {}) };
    // Consolida CNPJ vindo de campos variantes para o campo canônico `cnpj`.
    const cnpj = resolveCompanyCnpj(merged);
    if (cnpj && !valueIsFilled(merged.cnpj)) merged.cnpj = cnpj;
    return merged;
  }

  function ensureCompanyInfoBackupStores(targetState) {
    if (!targetState.companyInfoBackup || typeof targetState.companyInfoBackup !== "object") {
      targetState.companyInfoBackup = {};
    }
    if (!targetState.companyInfoHistory || typeof targetState.companyInfoHistory !== "object") {
      targetState.companyInfoHistory = {};
    }
  }

  /** Guarda backup + histórico de uma versão válida dos dados da empresa. */
  function backupCompanyInfoInState(targetState, company, info) {
    if (!isMeaningfulCompanyInfo(info)) return;
    ensureCompanyInfoBackupStores(targetState);
    const snapshot = { ...info };
    const prev = targetState.companyInfoBackup[company];
    targetState.companyInfoBackup[company] = snapshot;
    // Só registra no histórico se mudou de fato.
    if (!prev || JSON.stringify(prev) !== JSON.stringify(snapshot)) {
      const hist = Array.isArray(targetState.companyInfoHistory[company])
        ? targetState.companyInfoHistory[company]
        : [];
      hist.unshift({ info: snapshot, at: snapshot.updatedAt || Date.now() });
      targetState.companyInfoHistory[company] = hist.slice(0, COMPANY_INFO_HISTORY_LIMIT);
    }
  }

  function getCompanyInfoBackup(targetState, company) {
    const direct = targetState.companyInfoBackup?.[company];
    if (isMeaningfulCompanyInfo(direct)) return direct;
    const fromHistory = targetState.companyInfoHistory?.[company]?.find((entry) =>
      isMeaningfulCompanyInfo(entry?.info)
    );
    return fromHistory?.info || null;
  }

  /**
   * Recuperação automática: se a empresa estiver sem CNPJ e sem Razão Social
   * (vazia/resetada) mas existir backup válido, restaura. Caso contrário,
   * mantém o que existe e atualiza o backup com a versão válida atual.
   */
  function recoverCompanyInfoForState(targetState) {
    ensureCompanyInfoBackupStores(targetState);
    let recovered = false;
    companyKeysFromState(targetState).forEach((company) => {
      const block = targetState.companies?.[company];
      if (!block) return;
      const info = normalizeCompanyInfoShape(block.companyInfo, company);
      const backup = getCompanyInfoBackup(targetState, company);

      // Recuperação campo a campo: preenche QUALQUER campo crítico vazio a partir do
      // backup válido — nunca apaga o que já existe. Cobre "sem CNPJ", "sem Razão
      // Social" e "empresa vazia".
      if (backup) {
        let filled = false;
        COMPANY_CRITICAL_FIELDS.forEach((field) => {
          if (!valueIsFilled(info[field.key]) && valueIsFilled(backup[field.key])) {
            info[field.key] = backup[field.key];
            filled = true;
          }
        });
        if (filled) {
          recovered = true;
          console.warn(`[AppData] Dados da empresa "${company}" recuperados do backup.`);
        }
      }

      // Garante uma Razão Social mínima (nome da empresa) só para exibição.
      if (!valueIsFilled(info.legalName)) info.legalName = company;

      block.companyInfo = info;
      if (isMeaningfulCompanyInfo(info)) backupCompanyInfoInState(targetState, company, info);
    });
    return recovered;
  }

  function createCompanyData(companyName = "") {
    return {
      companyInfo: emptyCompanyInfo(companyName),
      employees: [],
      vacations: [],
      absences: [],
      holidays: [],
      manualScale: {},
      contadorLancamentos: {}
    };
  }

  function getCompanies() {
    if (!state?.companies || typeof state.companies !== "object") {
      return [...COMPANIES];
    }
    const keys = Object.keys(state.companies);
    const ordered = [];
    COMPANIES.forEach((company) => {
      if (state.companies[company]) ordered.push(company);
    });
    keys.forEach((company) => {
      if (!ordered.includes(company)) ordered.push(company);
    });
    if (!ordered.length) return [...COMPANIES];
    return ordered;
  }

  function ensureVtStructuresForCompany(company) {
    const vt = ensureValeTransporteState();
    if (!vt.discountValues[company]) vt.discountValues[company] = {};
    if (!vt.deductionDays[company]) vt.deductionDays[company] = {};
  }

  function registerCompany(companyKey) {
    const name = String(companyKey || "").trim();
    if (!name) throw new Error("Informe o nome da empresa.");
    if (state.companies[name]) throw new Error("Esta empresa já está cadastrada.");
    state.companies[name] = createCompanyData(name);
    ensureCompanyDataShape(state.companies[name]);
    ensureVtStructuresForCompany(name);
    saveState();
    return name;
  }

  function mergeSavedCompanyBlocks(parsed, defaults) {
    parsed.companies = parsed.companies || {};
    const allKeys = new Set([...COMPANIES, ...Object.keys(parsed.companies)]);
    allKeys.forEach((company) => {
      parsed.companies[company] = {
        ...defaults.companies[company] || createCompanyData(company),
        ...(parsed.companies[company] || {})
      };
      parsed.companies[company].companyInfo = {
        ...(defaults.companies[company]?.companyInfo || createCompanyData(company).companyInfo),
        ...(parsed.companies[company].companyInfo || {})
      };
      parsed.companies[company].employees = parsed.companies[company].employees || [];
      parsed.companies[company].manualScale = parsed.companies[company].manualScale || {};
      normalizeCompanyHolidays(parsed.companies[company]);
      parsed.companies[company].vacations = parsed.companies[company].vacations || [];
      parsed.companies[company].absences = parsed.companies[company].absences || [];
      normalizeCompanyBlock(parsed.companies[company]);
    });
    return parsed;
  }

  function createDefaultPageFilters(legacyCompany = DEFAULT_SELECTED_COMPANY) {
    const filters = {};
    const singleDefault = COMPANIES.includes(legacyCompany) ? legacyCompany : COMPANIES[0];
    PAGE_MODULE_IDS.forEach((moduleId) => {
      filters[moduleId] = singleDefault;
    });
    filters.dashboard = PAGE_COMPANY_ALL;
    filters.funcionarios = PAGE_COMPANY_ALL;
    return filters;
  }

  function isValidStoredPageFilter(value, companiesMap = state?.companies) {
    if (value === PAGE_COMPANY_ALL || value === "todas" || value === "Todas") return true;
    return Boolean(companiesMap?.[value]) || COMPANIES.includes(value);
  }

  function normalizePageFilterValue(value, fallback = DEFAULT_SELECTED_COMPANY, companiesMap = state?.companies) {
    if (value === PAGE_COMPANY_ALL || value === "todas" || value === "Todas" || value === "ambas") {
      return PAGE_COMPANY_ALL;
    }
    if (value && (companiesMap?.[value] || COMPANIES.includes(value))) return value;
    const fb = COMPANIES.includes(fallback) ? fallback : COMPANIES[0];
    return fb;
  }

  function isPageCompanyAll(value) {
    return normalizePageFilterValue(value) === PAGE_COMPANY_ALL;
  }

  function migratePageFilters(parsed, defaults) {
    const legacy =
      parsed.selectedCompany ||
      parsed.pageFilters?.escala ||
      parsed.pageFilters?.funcionarios ||
      DEFAULT_SELECTED_COMPANY;
    const companiesMap = parsed.companies || defaults.companies || {};
    parsed.pageFilters = { ...createDefaultPageFilters(legacy), ...(parsed.pageFilters || {}) };
    PAGE_MODULE_IDS.forEach((moduleId) => {
      const lsKey = PAGE_FILTER_KEYS[moduleId];
      let value = parsed.pageFilters[moduleId];
      if (!isValidStoredPageFilter(value, companiesMap)) {
        try {
          const fromLs = lsKey ? localStorage.getItem(lsKey) : null;
          if (fromLs) value = fromLs;
        } catch (_) {
          /* ignore */
        }
      }
      if (!isValidStoredPageFilter(value, companiesMap)) {
        value = moduleId === "dashboard" || moduleId === "funcionarios" ? PAGE_COMPANY_ALL : legacy;
      }
      parsed.pageFilters[moduleId] = normalizePageFilterValue(value, legacy, companiesMap);
      if (lsKey) {
        try {
          localStorage.removeItem(lsKey);
        } catch (_) {
          /* ignore */
        }
      }
    });
    delete parsed.selectedCompany;
    return parsed.pageFilters;
  }

  function getPageCompany(moduleId) {
    if (!state.pageFilters) state.pageFilters = createDefaultPageFilters();
    return normalizePageFilterValue(state.pageFilters[moduleId], DEFAULT_SELECTED_COMPANY);
  }

  function setPageCompany(moduleId, company, options = {}) {
    if (!state.pageFilters) state.pageFilters = createDefaultPageFilters();
    const normalized = normalizePageFilterValue(company, DEFAULT_SELECTED_COMPANY);
    state.pageFilters[moduleId] = normalized;
    if (options.save !== false) saveState();
  }

  function resolveCompaniesForPage(moduleId, options = {}) {
    const allowAll = options.allowAll !== false;
    const page = getPageCompany(moduleId);
    if (isPageCompanyAll(page)) {
      return allowAll ? getCompanies() : [getCompanies()[0] || COMPANIES[0]];
    }
    return [page];
  }

  function getPrimaryPageCompany(moduleId) {
    return resolveCompaniesForPage(moduleId, { allowAll: false })[0];
  }

  function findEmployeeRecord(employeeId) {
    if (!employeeId) return null;
    for (const company of getCompanies()) {
      const employee = getCompanyData(company)?.employees?.find((item) => item.id === employeeId);
      if (employee) return { employee, company };
    }
    return null;
  }

  function createDefaultState() {
    const companies = {};
    COMPANIES.forEach((company) => {
      companies[company] = createCompanyData(company);
    });

    return {
      pageFilters: createDefaultPageFilters(),
      activeCompany: COMPANIES[0],
      escalaSelectedYearMonth: monthKey(),
      companies,
      companyInfoBackup: {},
      companyInfoHistory: {},
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

  /**
   * Fase 2 — empresa ativa (aba superior). É o contexto único de todo o sistema.
   * Substitui os filtros de empresa internos: cada módulo lê getPrimaryPageCompany
   * (que segue pageFilters), e setActiveCompany propaga a empresa para todos os
   * pageFilters de uma vez. Nunca apaga dados — apenas troca o contexto de exibição.
   */
  function getActiveCompany() {
    const raw = String(state?.activeCompany || "").trim();
    if (raw && (state?.companies?.[raw] || COMPANIES.includes(raw))) return raw;
    const fromEscala = state?.pageFilters?.escala;
    if (fromEscala && fromEscala !== PAGE_COMPANY_ALL && (state?.companies?.[fromEscala] || COMPANIES.includes(fromEscala))) {
      return fromEscala;
    }
    return getCompanies()[0] || COMPANIES[0];
  }

  function setActiveCompany(company, options = {}) {
    const normalized = normalizePageFilterValue(company, COMPANIES[0]);
    const resolved = isPageCompanyAll(normalized) ? getCompanies()[0] || COMPANIES[0] : normalized;
    state.activeCompany = resolved;
    if (!state.pageFilters) state.pageFilters = createDefaultPageFilters();
    PAGE_MODULE_IDS.forEach((moduleId) => {
      state.pageFilters[moduleId] = resolved;
    });
    if (options.save !== false) saveState();
    return resolved;
  }

  /** Dados locais prevalecem sobre remoto vazio/desatualizado (evita apagar descontos VT no sync). */
  function mergeRecordMapsPreferLocal(remoteMap = {}, localMap = {}) {
    return { ...remoteMap, ...localMap };
  }

  function mergeEmployeesById(localArr = [], remoteArr = []) {
    const byId = {};
    remoteArr.forEach((employee) => {
      if (employee?.id) byId[employee.id] = employee;
    });
    localArr.forEach((employee) => {
      if (employee?.id) byId[employee.id] = employee;
    });
    return Object.values(byId);
  }

  function isEmployeeActive(employee) {
    return String(employee?.status || "").trim().toLocaleLowerCase("pt-BR") === "ativo";
  }

  function resolveVtCompany(company) {
    return company || getPrimaryPageCompany("vale-transporte");
  }

  /** Alerta não-bloqueante (console + toast quando a UI existir). */
  function emitDataAlert(message, type = "warning") {
    console.warn(`[AppData] ${message}`);
    try {
      window.App?.toast?.(message, type, 6000);
    } catch (_) {
      /* ambiente sem UI (testes) */
    }
  }

  /**
   * Resolve a empresa de destino de uma GRAVAÇÃO sem depender do filtro de página.
   * Ordem: (1) empresa real do funcionário (employeeId) → (2) bloco de empresa
   * explícito → (3) fallback seguro + alerta. Nunca usa o filtro como verdade.
   */
  function resolveCompanyForEmployeeWrite(employeeId, explicitCompany, moduleId = "escala") {
    const id = String(employeeId || "").trim();
    const record = id ? findEmployeeRecord(id) : null;
    if (record?.company) return record.company;

    if (explicitCompany && state?.companies?.[explicitCompany]) return explicitCompany;

    const fallback = explicitCompany || getPrimaryPageCompany(moduleId);
    emitDataAlert(
      `Funcionário "${id || "?"}" não localizado pelo employeeId; gravando em "${fallback}" como destino seguro. Verifique o cadastro.`
    );
    return fallback;
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

  function mergeDeductionDaysByCompany(localVt = {}, remoteVt = {}) {
    const merged = {};
    COMPANIES.forEach((company) => {
      merged[company] = mergeRecordMapsPreferLocal(
        remoteVt.deductionDays?.[company] || {},
        localVt.deductionDays?.[company] || {}
      );
    });
    return merged;
  }

  function normalizeValeTransporteBlock(parsedVt, defaultsVt) {
    return {
      selectedYearMonth: parsedVt?.selectedYearMonth || defaultsVt?.selectedYearMonth || monthKey(),
      discountValues: mergeDiscountValuesByCompany(defaultsVt, parsedVt),
      deductionDays: mergeDeductionDaysByCompany(defaultsVt, parsedVt)
    };
  }

  function mergeRecordsById(localArr = [], remoteArr = [], idField = "id") {
    const byId = {};
    remoteArr.forEach((record) => {
      if (record?.[idField]) byId[record[idField]] = record;
    });
    localArr.forEach((record) => {
      if (record?.[idField]) byId[record[idField]] = record;
    });
    return Object.values(byId);
  }

  function getHolidayCompensationDueDate(holidayDate) {
    return addDays(holidayDate, HOLIDAY_COMPENSATION_DAYS);
  }

  function isCompensationWithinDeadline(workedDate, compensationDate) {
    if (!compensationDate) return true;
    return diffDays(workedDate, compensationDate) <= HOLIDAY_COMPENSATION_DAYS;
  }

  function getAbsenceScaleCode(absenceType) {
    return ABSENCE_TYPE_SCALE_CODES[String(absenceType || "").trim()] || "FALTA";
  }

  const PADROEIRA_BUZIOS_CORRECT_SUFFIX = "-07-26";

  function isPadroeiraBuziosName(name) {
    const normalized = normalizeSearchText(name);
    return normalized.includes("padroeira") && normalized.includes("buzios");
  }

  function correctPadroeiraBuziosDate(isoDate) {
    const trimmed = String(isoDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return `${trimmed.slice(0, 4)}${PADROEIRA_BUZIOS_CORRECT_SUFFIX}`;
  }

  function migratePadroeiraBuziosInHolidayList(holidays) {
    if (!Array.isArray(holidays) || !holidays.length) return false;

    let changed = false;
    const keep = [];
    const mergedPadroeira = new Map();

    holidays.forEach((holiday) => {
      if (!holiday || typeof holiday !== "object") return;
      if (!isPadroeiraBuziosName(holiday.name)) {
        keep.push(holiday);
        return;
      }

      const correctDate = correctPadroeiraBuziosDate(holiday.date);
      if (holiday.date !== correctDate) changed = true;

      const bucketKey = `${correctDate}|${normalizeSearchText(holiday.name)}`;
      if (!mergedPadroeira.has(bucketKey)) {
        mergedPadroeira.set(bucketKey, {
          ...holiday,
          date: correctDate,
          workedEmployees: [...(holiday.workedEmployees || [])]
        });
        return;
      }

      const bucket = mergedPadroeira.get(bucketKey);
      const employees = new Map();
      [...(bucket.workedEmployees || []), ...(holiday.workedEmployees || [])].forEach((item) => {
        if (!item?.employeeId) return;
        employees.set(item.employeeId, mergeWorkedEmployeeItems(employees.get(item.employeeId) || {}, item));
      });
      bucket.workedEmployees = [...employees.values()];
      changed = true;
    });

    if (!mergedPadroeira.size) return changed;

    // Idempotência: só reescreve o array quando houve correção/deduplicação real.
    // Já estando tudo em 26/07 e sem duplicatas, não muta nem sinaliza mudança.
    if (!changed) return false;

    holidays.length = 0;
    holidays.push(...keep, ...mergedPadroeira.values());
    return true;
  }

  function migratePadroeiraBuziosHoliday(targetState) {
    if (!targetState) return false;
    let changed = false;

    if (!targetState.calendarHolidays) targetState.calendarHolidays = [];
    if (migratePadroeiraBuziosInHolidayList(targetState.calendarHolidays)) changed = true;

    companyKeysFromState(targetState).forEach((company) => {
      const block = targetState.companies?.[company];
      if (!block) return;
      if (!block.holidays) block.holidays = [];
      if (migratePadroeiraBuziosInHolidayList(block.holidays)) changed = true;
    });

    return changed;
  }

  function companyKeysFromState(targetState) {
    return [...new Set([...COMPANIES, ...Object.keys(targetState?.companies || {})])];
  }

  /**
   * Deduplica o calendário global de feriados (state.calendarHolidays).
   * Chave de unicidade: data + nome normalizado. Quando há duplicados, mantém
   * um único registro e une as empresas (companies) — assim o mesmo feriado não
   * aparece repetido no filtro nem é processado em dobro pela escala. Idempotente.
   */
  function dedupeCalendarHolidays(targetState) {
    if (!targetState || !Array.isArray(targetState.calendarHolidays)) return false;

    const byKey = new Map();
    let changed = false;

    targetState.calendarHolidays.forEach((holiday) => {
      if (!holiday || !holiday.date || !holiday.name) return;
      const key = `${holiday.date}|${normalizeSearchText(holiday.name)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, holiday);
        return;
      }
      const companies = new Set([...(existing.companies || []), ...(holiday.companies || [])]);
      existing.companies = Array.from(companies);
      changed = true; // duplicado descartado
    });

    if (changed) {
      targetState.calendarHolidays = Array.from(byKey.values());
    }
    return changed;
  }

  /**
   * SEED 2026 — Semana Santa, Tiradentes e São Jorge (Fase 3B).
   * Esses feriados de abril/2026 não existiam na base e por isso nunca
   * apareciam para vinculação manual de CO. O seed apenas DISPONIBILIZA os
   * feriados (workedEmployees vazio): nenhum vínculo automático é criado e
   * nenhum lançamento existente é alterado. Idempotente por conteúdo
   * (data 2026 + nome normalizado, com variantes) e executado uma única vez
   * por dispositivo (flag em localStorage).
   */
  const HOLIDAY_SEED_2026_FLAG = "chezPituHolidaySeed2026.v1";
  const HOLIDAY_SEED_2026 = [
    {
      slug: "semana-santa",
      name: "Semana Santa",
      date: "2026-04-03",
      type: "nacional",
      aliases: [
        "semana santa",
        "sexta-feira santa",
        "sexta feira santa",
        "sexta-feira da paixao",
        "sexta feira da paixao",
        "paixao de cristo"
      ]
    },
    {
      slug: "tiradentes",
      name: "Tiradentes",
      date: "2026-04-21",
      type: "nacional",
      aliases: ["tiradentes", "dia de tiradentes"]
    },
    {
      slug: "sao-jorge",
      name: "São Jorge",
      date: "2026-04-23",
      type: "estadual",
      aliases: ["sao jorge", "dia de sao jorge"]
    }
  ];

  /** Variante do mesmo feriado em 2026 (qualquer data do ano, nome equivalente). */
  function holidayMatchesSeed2026(holiday, seed) {
    if (!holiday || !String(holiday.date || "").startsWith("2026")) return false;
    const name = normalizeSearchText(holiday.name);
    return seed.aliases.some((alias) => name === normalizeSearchText(alias));
  }

  function applyHolidaySeed2026(targetState) {
    if (!targetState) return false;
    let changed = false;

    if (!Array.isArray(targetState.calendarHolidays)) targetState.calendarHolidays = [];
    HOLIDAY_SEED_2026.forEach((seed) => {
      if (targetState.calendarHolidays.some((holiday) => holidayMatchesSeed2026(holiday, seed))) return;
      targetState.calendarHolidays.push({
        id: `cal-seed-2026-${seed.slug}`,
        date: seed.date,
        name: seed.name,
        type: seed.type,
        companies: ["ambas"]
      });
      changed = true;
    });

    companyKeysFromState(targetState).forEach((company) => {
      const block = targetState.companies?.[company];
      if (!block) return;
      if (!Array.isArray(block.holidays)) block.holidays = [];
      HOLIDAY_SEED_2026.forEach((seed) => {
        // Soft-deletados também contam como existentes: o seed nunca ressuscita
        // um feriado que o usuário removeu de propósito.
        if (block.holidays.some((holiday) => holidayMatchesSeed2026(holiday, seed))) return;
        block.holidays.push({
          id: `feriado-seed-2026-${seed.slug}-${normalizeSearchText(company).replace(/\s+/g, "-")}`,
          name: seed.name,
          date: seed.date,
          workedEmployees: []
        });
        changed = true;
      });
    });

    return changed;
  }

  function applyHolidaySeed2026IfNeeded() {
    try {
      if (localStorage.getItem(HOLIDAY_SEED_2026_FLAG)) return false;
    } catch (_) {
      /* storage indisponível: segue — o seed é idempotente por conteúdo */
    }
    const changed = applyHolidaySeed2026(state);
    try {
      localStorage.setItem(HOLIDAY_SEED_2026_FLAG, new Date().toISOString());
    } catch (_) {
      /* sem flag o seed continua seguro (idempotente por conteúdo) */
    }
    if (changed) saveState();
    return changed;
  }

  /**
   * Calendário no merge: o remoto prevalece quando existe, mas os seeds 2026
   * locais não podem ser perdidos enquanto o remoto ainda não os recebeu
   * (a flag local impediria um novo seed e os feriados sumiriam para sempre).
   */
  function mergeCalendarHolidaysPreservingSeeds(localList = [], remoteList = []) {
    const base = (remoteList || []).length ? [...remoteList] : [...(localList || [])];
    HOLIDAY_SEED_2026.forEach((seed) => {
      const localSeed = (localList || []).find(
        (holiday) => String(holiday?.id || "") === `cal-seed-2026-${seed.slug}`
      );
      if (!localSeed) return;
      const exists = base.some(
        (holiday) => holiday?.id === localSeed.id || holidayMatchesSeed2026(holiday, seed)
      );
      if (!exists) base.push(localSeed);
    });
    return base;
  }

  function migrateVtStorage(targetState) {
    if (!targetState) return targetState;
    if (!targetState.valeTransporte) targetState.valeTransporte = createDefaultState().valeTransporte;
    const vt = targetState.valeTransporte;
    if (!vt.discountValues) vt.discountValues = {};
    if (!vt.deductionDays) vt.deductionDays = {};

    companyKeysFromState(targetState).forEach((company) => {
      if (!targetState.companies?.[company]) {
        targetState.companies[company] = createCompanyData(company);
      }
      if (!vt.deductionDays[company]) vt.deductionDays[company] = {};
      if (!vt.discountValues[company]) vt.discountValues[company] = {};
      const legacyCompanyVt = targetState.companies[company].vtDeductions;
      if (legacyCompanyVt && typeof legacyCompanyVt === "object") {
        vt.deductionDays[company] = mergeRecordMapsPreferLocal(vt.deductionDays[company], legacyCompanyVt);
      }
      delete targetState.companies[company].vtDeductions;
    });

    try {
      const raw = localStorage.getItem(LEGACY_VT_BACKUP_KEY);
      if (raw) {
        const backup = JSON.parse(raw);
        const backupVt = {
          selectedYearMonth: backup.selectedYearMonth,
          discountValues: backup.discountValues || {},
          deductionDays: backup.deductionDays || {}
        };
        vt.selectedYearMonth = vt.selectedYearMonth || backupVt.selectedYearMonth;
        vt.discountValues = mergeDiscountValuesByCompany(vt, backupVt);
        vt.deductionDays = mergeDeductionDaysByCompany(vt, backupVt);
        COMPANIES.forEach((company) => {
          const fromCompaniesVt = backup.companiesVt?.[company] || {};
          vt.deductionDays[company] = mergeRecordMapsPreferLocal(vt.deductionDays[company] || {}, fromCompaniesVt);
        });
        localStorage.removeItem(LEGACY_VT_BACKUP_KEY);
      }
    } catch (error) {
      console.warn("[VT] Falha ao migrar backup legado.", error);
    }

    return targetState;
  }

  function finalizeIncomingState(rawState) {
    const defaults = createDefaultState();
    const next = {
      ...defaults,
      ...rawState,
      pageFilters: {
        ...defaults.pageFilters,
        ...(rawState.pageFilters || {})
      },
      companies: rawState.companies || defaults.companies,
      valeTransporte: normalizeValeTransporteBlock(rawState.valeTransporte, defaults.valeTransporte)
    };
    migratePageFilters(next, defaults);
    migrateVtStorage(next);
    migratePadroeiraBuziosHoliday(next);
    dedupeCalendarHolidays(next);
    delete next.selectedCompany;

    // Fase 2 — empresa ativa (aba). Migra de pageFilters.escala quando ausente; nunca apaga dados.
    const activeRaw = String(next.activeCompany || "").trim();
    if (!activeRaw || !(next.companies[activeRaw] || COMPANIES.includes(activeRaw))) {
      const legacy = next.pageFilters?.escala;
      next.activeCompany =
        legacy && legacy !== PAGE_COMPANY_ALL && (next.companies[legacy] || COMPANIES.includes(legacy))
          ? legacy
          : COMPANIES[0];
    }
    companyKeysFromState(next).forEach((company) => {
      if (!next.companies[company]) next.companies[company] = createCompanyData(company);
      normalizeCompanyBlock(next.companies[company]);
      normalizeCompanyHolidays(next.companies[company]);
    });

    // Proteção dos dados da empresa: restaura do backup se vazio; atualiza backup se válido.
    recoverCompanyInfoForState(next);

    if (companyKeysFromState(next).some((company) => next.companies[company]?._vacationRepairPending)) {
      companyKeysFromState(next).forEach((company) => {
        delete next.companies[company]?._vacationRepairPending;
      });
      queueMicrotask(() => saveState());
    }
    return next;
  }

  function mergeRemoteIntoLocal(localState, remoteState) {
    if (!localState) return finalizeIncomingState(remoteState);
    if (!remoteState) return finalizeIncomingState(localState);

    const local = JSON.parse(JSON.stringify(localState));
    const remote = JSON.parse(JSON.stringify(remoteState));
    const defaults = createDefaultState();
    const merged = {
      ...defaults,
      ...remote,
      ...local,
      pageFilters: {
        ...defaults.pageFilters,
        ...(remote.pageFilters || {}),
        ...(local.pageFilters || {})
      },
      escalaSelectedYearMonth: local.escalaSelectedYearMonth || remote.escalaSelectedYearMonth || monthKey(),
      calendarHolidays: mergeCalendarHolidaysPreservingSeeds(
        local.calendarHolidays,
        remote.calendarHolidays
      ),
      coverageAlerts: (remote.coverageAlerts || []).length ? remote.coverageAlerts : local.coverageAlerts || [],
      coveragePrincipalBindings: {
        ...(remote.coveragePrincipalBindings || {}),
        ...(local.coveragePrincipalBindings || {})
      },
      scaleCodeConfig: { ...(remote.scaleCodeConfig || {}), ...(local.scaleCodeConfig || {}) },
      companies: {},
      valeTransporte: {
        selectedYearMonth:
          local.valeTransporte?.selectedYearMonth ||
          remote.valeTransporte?.selectedYearMonth ||
          monthKey(),
        discountValues: mergeDiscountValuesByCompany(local.valeTransporte, remote.valeTransporte),
        deductionDays: mergeDeductionDaysByCompany(local.valeTransporte, remote.valeTransporte)
      }
    };

    const companyKeys = new Set([
      ...COMPANIES,
      ...Object.keys(local.companies || {}),
      ...Object.keys(remote.companies || {})
    ]);

    companyKeys.forEach((company) => {
      const localCo = local.companies?.[company] || {};
      const remoteCo = remote.companies?.[company] || {};
      const defaultBlock = defaults.companies[company] || createCompanyData(company);

      merged.valeTransporte.deductionDays[company] = mergeRecordMapsPreferLocal(
        mergeRecordMapsPreferLocal(
          remote.valeTransporte?.deductionDays?.[company] || {},
          remoteCo.vtDeductions || {}
        ),
        mergeRecordMapsPreferLocal(
          local.valeTransporte?.deductionDays?.[company] || {},
          localCo.vtDeductions || {}
        )
      );
      merged.valeTransporte.discountValues[company] = mergeRecordMapsPreferLocal(
        remote.valeTransporte?.discountValues?.[company] || {},
        local.valeTransporte?.discountValues?.[company] || {}
      );

      merged.companies[company] = {
        ...defaultBlock,
        ...remoteCo,
        ...localCo,
        // Dados da empresa: merge campo a campo que NUNCA apaga valor preenchido.
        companyInfo: mergeCompanyInfoPreserving(
          mergeCompanyInfoPreserving(defaultBlock.companyInfo, remoteCo.companyInfo),
          localCo.companyInfo
        ),
        employees: mergeEmployeesById(localCo.employees, remoteCo.employees),
        manualScale: mergeRecordMapsPreferLocal(remoteCo.manualScale || {}, localCo.manualScale || {}),
        holidays: mergeHolidayLists(localCo.holidays, remoteCo.holidays),
        vacations: mergeRecordsById(localCo.vacations, remoteCo.vacations),
        absences: mergeRecordsById(localCo.absences, remoteCo.absences),
        contadorLancamentos: mergeLancamentosMaps(
          localCo.contadorLancamentos || {},
          remoteCo.contadorLancamentos || {}
        )
      };
      delete merged.companies[company].vtDeductions;
    });

    // Preserva backups/histórico dos dados da empresa através da sincronização Firebase.
    merged.companyInfoBackup = {};
    merged.companyInfoHistory = {};
    companyKeys.forEach((company) => {
      const backupCandidate =
        [local.companyInfoBackup?.[company], remote.companyInfoBackup?.[company]].find(isMeaningfulCompanyInfo) ||
        null;
      if (backupCandidate) merged.companyInfoBackup[company] = backupCandidate;

      const histLocal = Array.isArray(local.companyInfoHistory?.[company]) ? local.companyInfoHistory[company] : [];
      const histRemote = Array.isArray(remote.companyInfoHistory?.[company]) ? remote.companyInfoHistory[company] : [];
      const seen = new Set();
      const histMerged = [...histLocal, ...histRemote]
        .filter((entry) => entry && isMeaningfulCompanyInfo(entry.info))
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .filter((entry) => {
          const key = JSON.stringify(entry.info);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, COMPANY_INFO_HISTORY_LIMIT);
      if (histMerged.length) merged.companyInfoHistory[company] = histMerged;
    });

    return finalizeIncomingState(merged);
  }

  function readLocalStateSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("[AppData] Snapshot local inválido.", error);
      return null;
    }
  }

  function ensureValeTransporteState() {
    if (!state.valeTransporte || typeof state.valeTransporte !== "object") {
      state.valeTransporte = { selectedYearMonth: monthKey(), discountValues: {}, deductionDays: {} };
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

  function getDiscountValue(employeeId, yearMonth, company) {
    company = resolveVtCompany(company);
    const vt = ensureValeTransporteState();
    const companyValues = vt.discountValues[company] || {};
    const key = discountStorageKey(employeeId, yearMonth);
    if (!Object.prototype.hasOwnProperty.call(companyValues, key)) return null;
    const stored = companyValues[key];
    if (stored === null || stored === undefined || stored === "") return null;
    return Number(stored);
  }

  function saveDiscountValue(employeeId, yearMonth, rawInput, options = {}) {
    const company = resolveVtCompany(options.company);
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

  function runScaleIntegrations(yearMonths, options = {}) {
    if (!window.ScaleRules?.recomputeScaleIntegrations) return { created: 0 };
    const result = window.ScaleRules.recomputeScaleIntegrations(yearMonths, options);
    if (options.save !== false && (result?.created || 0) > 0) saveState();
    return result;
  }

  function enumerateDates(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) return [];
    const dates = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  function resolveEmployeeIdInBlock(ref, companyBlock) {
    const refStr = String(ref || "").trim();
    if (!refStr) return null;
    const employees = companyBlock?.employees || [];
    if (employees.some((employee) => employee.id === refStr)) return refStr;
    const targetName = normalizeEmployeeName(refStr);
    const byName = employees.find((employee) => normalizeEmployeeName(employee.name) === targetName);
    return byName?.id || null;
  }

  function remapManualScaleEmployeeIds(companyBlock) {
    const next = {};
    let changed = false;

    Object.entries(companyBlock.manualScale || {}).forEach(([key, entry]) => {
      const sep = key.indexOf("|");
      if (sep < 0) {
        next[key] = entry;
        return;
      }
      const ref = key.slice(0, sep);
      const date = key.slice(sep + 1);
      const canonical = resolveEmployeeIdInBlock(ref, companyBlock) || ref;
      const newKey = `${canonical}|${date}`;
      if (newKey !== key) changed = true;
      if (Object.prototype.hasOwnProperty.call(next, newKey)) return;
      next[newKey] = entry;
    });

    if (changed) companyBlock.manualScale = next;
    return changed;
  }

  function matchEmployeeIdByVacationNote(vacation, employees) {
    const note = normalizeEmployeeName(vacation?.note);
    if (!note || note === normalizeEmployeeName("Sincronizado da escala")) return null;

    const exact = employees.filter((employee) => normalizeEmployeeName(employee.name) === note);
    if (exact.length === 1) return exact[0].id;

    const partial = employees.filter((employee) => {
      const name = normalizeEmployeeName(employee.name);
      return name.includes(note) || note.includes(name);
    });
    if (partial.length === 1) return partial[0].id;
    return null;
  }

  function relinkOrphanVacations(companyBlock) {
    const employees = companyBlock.employees || [];
    const validIds = new Set(employees.map((employee) => employee.id));
    let changed = false;

    (companyBlock.vacations || []).forEach((vacation) => {
      if (!vacation?.employeeId || validIds.has(vacation.employeeId)) return;

      const byRef = resolveEmployeeIdInBlock(vacation.employeeId, companyBlock);
      if (byRef) {
        vacation.employeeId = byRef;
        changed = true;
        return;
      }

      const byNote = matchEmployeeIdByVacationNote(vacation, employees);
      if (byNote) {
        vacation.employeeId = byNote;
        changed = true;
        return;
      }

      const overlapDates = enumerateDates(vacation.startDate, vacation.endDate);
      const matched = employees.filter((employee) =>
        overlapDates.some((date) => manualScaleEntryCode(companyBlock.manualScale?.[`${employee.id}|${date}`]) === "FÉRIAS")
      );

      if (matched.length === 1) {
        vacation.employeeId = matched[0].id;
        changed = true;
      }
    });

    return changed;
  }

  function repairVacationAndAbsenceIds(companyBlock) {
    let changed = false;
    (companyBlock.vacations || []).forEach((vacation) => {
      const canonical = resolveEmployeeIdInBlock(vacation.employeeId, companyBlock);
      if (canonical && canonical !== vacation.employeeId) {
        vacation.employeeId = canonical;
        changed = true;
      }
    });
    (companyBlock.absences || []).forEach((absence) => {
      const canonical = resolveEmployeeIdInBlock(absence.employeeId, companyBlock);
      if (canonical && canonical !== absence.employeeId) {
        absence.employeeId = canonical;
        changed = true;
      }
    });
    return changed;
  }

  function migrateEmployeeRefs(companyBlock) {
    if (!companyBlock) return false;
    return (
      remapManualScaleEmployeeIds(companyBlock) ||
      relinkOrphanVacations(companyBlock) ||
      repairVacationAndAbsenceIds(companyBlock)
    );
  }

  function findVacationForDate(employeeId, date, data) {
    const canonicalId = String(employeeId || "").trim();
    if (!canonicalId) return null;

    const direct = (data.vacations || []).find(
      (item) => item.employeeId === canonicalId && isBetween(date, item.startDate, item.endDate)
    );
    if (direct) return direct;

    const employee = (data.employees || []).find((item) => item.id === canonicalId);
    if (employee) {
      const byNote = (data.vacations || []).find((item) => {
        if (!isBetween(date, item.startDate, item.endDate)) return false;
        return matchEmployeeIdByVacationNote(item, [employee]) === canonicalId;
      });
      if (byNote) return byNote;
    }

    const resolvedId = resolveEmployeeIdInBlock(canonicalId, data);
    if (resolvedId && resolvedId !== canonicalId) {
      return (data.vacations || []).find(
        (item) => item.employeeId === resolvedId && isBetween(date, item.startDate, item.endDate)
      );
    }

    return null;
  }

  function syncManualFeriasPrefixesToVacations(companyBlock) {
    const prefixes = new Set();
    Object.entries(companyBlock.manualScale || {}).forEach(([key, entry]) => {
      if (manualScaleEntryCode(entry) !== "FÉRIAS") return;
      const sep = key.indexOf("|");
      if (sep < 0) return;
      prefixes.add(key.slice(0, sep));
    });

    prefixes.forEach((prefix) => {
      const employeeId = resolveEmployeeIdInBlock(prefix, companyBlock);
      if (!employeeId) return;
      collectManualFeriasRanges(companyBlock, employeeId).forEach(({ startDate, endDate }) => {
        upsertVacationRange(companyBlock, employeeId, startDate, endDate, "Sincronizado da escala");
      });
    });
  }

  function manualScaleEntryCode(entry) {
    if (entry === undefined) return undefined;
    return typeof entry === "object" ? entry.code : entry;
  }

  function clearManualScaleCodeInRange(data, employeeId, startDate, endDate, codeFilter) {
    const prefix = `${employeeId}|`;
    Object.keys(data.manualScale || {}).forEach((key) => {
      if (!key.startsWith(prefix)) return;
      const date = key.slice(prefix.length);
      if (!isBetween(date, startDate, endDate)) return;
      const code = manualScaleEntryCode(data.manualScale[key]);
      if (codeFilter && code !== codeFilter) return;
      delete data.manualScale[key];
    });
  }

  function groupConsecutiveDates(sortedDates) {
    if (!sortedDates.length) return [];
    const ranges = [];
    let start = sortedDates[0];
    let end = sortedDates[0];
    for (let index = 1; index < sortedDates.length; index += 1) {
      const expected = addDays(end, 1);
      if (sortedDates[index] === expected) {
        end = sortedDates[index];
      } else {
        ranges.push({ startDate: start, endDate: end });
        start = sortedDates[index];
        end = sortedDates[index];
      }
    }
    ranges.push({ startDate: start, endDate: end });
    return ranges;
  }

  function collectManualFeriasRanges(data, employeeId) {
    const prefix = `${employeeId}|`;
    const dates = [];
    Object.entries(data.manualScale || {}).forEach(([key, entry]) => {
      if (!key.startsWith(prefix)) return;
      if (manualScaleEntryCode(entry) !== "FÉRIAS") return;
      dates.push(key.slice(prefix.length));
    });
    return groupConsecutiveDates([...new Set(dates)].sort());
  }

  function upsertVacationRange(data, employeeId, startDate, endDate, note = "") {
    if (!employeeId || !startDate || !endDate || endDate < startDate) return null;
    data.vacations = Array.isArray(data.vacations) ? data.vacations : [];
    let target = data.vacations.find(
      (item) =>
        item.employeeId === employeeId && !(endDate < item.startDate || startDate > item.endDate)
    );
    if (target) {
      if (target.startDate > startDate) target.startDate = startDate;
      if (target.endDate < endDate) target.endDate = endDate;
      if (note && !target.note) target.note = note;
    } else {
      target = {
        id: uid("ferias"),
        employeeId,
        startDate,
        endDate,
        note: note || ""
      };
      data.vacations.push(target);
    }
    clearManualScaleCodeInRange(data, employeeId, target.startDate, target.endDate, "FÉRIAS");
    return target;
  }

  function normalizeVacations(companyBlock) {
    if (!companyBlock) return false;
    let changed = migrateEmployeeRefs(companyBlock);
    companyBlock.vacations = Array.isArray(companyBlock.vacations) ? companyBlock.vacations : [];

    (companyBlock.employees || []).forEach((employee) => {
      if (!employee?.id) return;
      collectManualFeriasRanges(companyBlock, employee.id).forEach(({ startDate, endDate }) => {
        upsertVacationRange(companyBlock, employee.id, startDate, endDate, "Sincronizado da escala");
        changed = true;
      });
    });

    syncManualFeriasPrefixesToVacations(companyBlock);

    const validIds = new Set((companyBlock.employees || []).map((employee) => employee.id));
    companyBlock.vacations.forEach((vacation) => {
      if (!vacation?.employeeId || !vacation.startDate || !vacation.endDate) return;
      if (!validIds.has(vacation.employeeId)) return;
      clearManualScaleCodeInRange(
        companyBlock,
        vacation.employeeId,
        vacation.startDate,
        vacation.endDate,
        "FÉRIAS"
      );
    });

    return changed;
  }

  function normalizeCompanyBlock(block) {
    if (!block) return null;
    block.employees = sortEmployeesByName(Array.isArray(block.employees) ? block.employees : []);
    block.vacations = Array.isArray(block.vacations) ? block.vacations : [];
    block.absences = Array.isArray(block.absences) ? block.absences : [];
    block.holidays = Array.isArray(block.holidays) ? block.holidays : [];
    block.manualScale = block.manualScale && typeof block.manualScale === "object" ? block.manualScale : {};
    block.contadorLancamentos =
      block.contadorLancamentos && typeof block.contadorLancamentos === "object" ? block.contadorLancamentos : {};
    delete block.vtDeductions;
    if (normalizeVacations(block)) block._vacationRepairPending = true;
    return block;
  }

  function resolveCompanyKey(company) {
    const key = String(company || "").trim();
    if (key && state.companies?.[key]) return key;
    return getCompanies()[0] || COMPANIES[0];
  }

  function ensureCompanyDataShape(company) {
    return normalizeCompanyBlock(getCompanyData(company));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PERSISTÊNCIA ENXUTA / ANTI-QUOTA (QuotaExceededError)
  //
  // O estado completo (todas as empresas, funcionários, feriados, escalas,
  // ausências, históricos, backups e logos base64) pode ultrapassar a cota do
  // localStorage (~5 MB). Quando isso ocorre, setItem lança QuotaExceededError.
  // Aqui a gravação é feita em CAMADAS, com try/catch, e NUNCA lança:
  //   0) full  — estado completo (cache offline ideal);
  //   1) slim  — remove logos base64, históricos/backups, feriados soft-deletados
  //              e alertas (mantém dados operacionais offline);
  //   2) lean  — apenas sessão, empresa ativa, filtros, preferências e versão de
  //              cache; dados operacionais passam a vir do Firebase.
  // Se nem o "lean" couber, registra warning e desliga o cache local na sessão.
  // Em todos os casos o `state` em memória permanece completo e o Firebase
  // continua sendo a fonte de verdade — a aplicação não quebra.
  // ───────────────────────────────────────────────────────────────────────────

  let persistFloor = 0; // menor camada já aceita nesta sessão (sticky, evita re-tentar full caro)
  let storageDegraded = false;
  let degradedAlertShown = false;

  function isQuotaError(error) {
    if (!error) return false;
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  /** Camada "slim": preserva dados operacionais, descarta o que mais pesa. */
  function buildSlimPersistedState(src) {
    const clone = JSON.parse(JSON.stringify(src));
    delete clone.companyInfoHistory; // histórico/backup recuperável do Firebase
    delete clone.companyInfoBackup;
    clone.coverageAlerts = [];
    Object.values(clone.companies || {}).forEach((block) => {
      if (!block) return;
      if (block.companyInfo) block.companyInfo.logoDataUrl = ""; // logo base64 é o maior vilão
      if (Array.isArray(block.holidays)) {
        block.holidays = block.holidays.filter((holiday) => !holiday?.isDeleted);
      }
    });
    clone.schemaVersion = PERSIST_SCHEMA_VERSION;
    clone.cacheVersion = src.cacheVersion || CACHE_VERSION;
    clone.persistTier = "slim";
    return clone;
  }

  /** Camada "lean": só sessão/empresa/filtros/preferências/versão de cache. */
  function buildLeanPersistedState(src) {
    return {
      schemaVersion: PERSIST_SCHEMA_VERSION,
      cacheVersion: src.cacheVersion || CACHE_VERSION,
      persistTier: "lean",
      activeCompany: src.activeCompany || "",
      pageFilters: src.pageFilters || {},
      escalaSelectedYearMonth: src.escalaSelectedYearMonth || "",
      scaleCodeConfig: src.scaleCodeConfig || {},
      coveragePrincipalBindings: src.coveragePrincipalBindings || {},
      valeTransporte: { selectedYearMonth: src.valeTransporte?.selectedYearMonth || "" },
      companies: {} // dados operacionais vêm do Firebase
    };
  }

  const PERSIST_TIERS = [
    { name: "full", build: (src) => src },
    { name: "slim", build: buildSlimPersistedState },
    { name: "lean", build: buildLeanPersistedState }
  ];

  function trySetStorage(payload) {
    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch (error) {
      return { ok: false, quota: false, error };
    }
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      return { ok: true, bytes: serialized.length };
    } catch (error) {
      return { ok: false, quota: isQuotaError(error), error };
    }
  }

  /**
   * Persiste o estado no localStorage em camadas. Nunca lança: uma falha de
   * cota jamais pode quebrar a aplicação nem o fluxo de sincronização.
   * @returns {{ok:boolean, tier:string, bytes?:number}}
   */
  function persistStateToLocal(stateObj) {
    if (!stateObj || typeof stateObj !== "object") return { ok: false, tier: "none" };

    for (let i = persistFloor; i < PERSIST_TIERS.length; i += 1) {
      const tier = PERSIST_TIERS[i];
      const result = trySetStorage(tier.build(stateObj));

      if (result.ok) {
        if (i > persistFloor) {
          persistFloor = i; // a partir de agora começamos direto nesta camada
          storageDegraded = i > 0;
          emitDataAlert(
            `Armazenamento local quase cheio: salvando em modo "${tier.name}". ` +
              `Dados completos preservados no Firebase.`
          );
        }
        return { ok: true, tier: tier.name, bytes: result.bytes };
      }

      if (!result.quota) {
        // Erro não relacionado à cota (ex.: storage indisponível): registra e desiste sem quebrar.
        console.warn("[AppData] Falha ao persistir no localStorage (não-cota):", result.error);
        return { ok: false, tier: tier.name };
      }
      // QuotaExceededError → tenta a próxima camada mais enxuta.
    }

    // Nem a camada "lean" coube: desliga o cache local nesta sessão.
    persistFloor = PERSIST_TIERS.length;
    storageDegraded = true;
    if (!degradedAlertShown) {
      degradedAlertShown = true;
      emitDataAlert(
        "Armazenamento local cheio (QuotaExceededError). Os dados continuam salvos no " +
          "Firebase; o cache local foi desativado nesta sessão para não quebrar a aplicação."
      );
    }
    return { ok: false, tier: "none" };
  }

  /**
   * Diagnóstico de uso do localStorage. Rode no console de produção:
   *   AppData.measureStorageUsage()
   * Retorna tamanho total e por estrutura (em bytes) — base para o relatório.
   */
  function measureStorageUsage(targetState = state) {
    const bytesOf = (value) => {
      try {
        return JSON.stringify(value ?? null).length;
      } catch (_) {
        return 0;
      }
    };

    const perCompany = {};
    const totals = {
      employees: 0,
      holidays: 0,
      manualScale: 0,
      vacations: 0,
      absences: 0,
      contadorLancamentos: 0,
      logos: 0
    };

    Object.entries(targetState.companies || {}).forEach(([name, block]) => {
      const entry = {
        employees: bytesOf(block?.employees),
        holidays: bytesOf(block?.holidays),
        manualScale: bytesOf(block?.manualScale),
        vacations: bytesOf(block?.vacations),
        absences: bytesOf(block?.absences),
        contadorLancamentos: bytesOf(block?.contadorLancamentos),
        logo: bytesOf(block?.companyInfo?.logoDataUrl)
      };
      perCompany[name] = entry;
      totals.employees += entry.employees;
      totals.holidays += entry.holidays;
      totals.manualScale += entry.manualScale;
      totals.vacations += entry.vacations;
      totals.absences += entry.absences;
      totals.contadorLancamentos += entry.contadorLancamentos;
      totals.logos += entry.logo;
    });

    let storedBytes = 0;
    try {
      storedBytes = (localStorage.getItem(STORAGE_KEY) || "").length;
    } catch (_) {
      storedBytes = 0;
    }

    const report = {
      storageKey: STORAGE_KEY,
      quotaApproxMB: 5,
      storedBytes,
      storedKB: Number((storedBytes / 1024).toFixed(1)),
      stateBytes: bytesOf(targetState),
      breakdown: {
        ...totals,
        backups:
          bytesOf(targetState.companyInfoHistory) + bytesOf(targetState.companyInfoBackup),
        calendarHolidays: bytesOf(targetState.calendarHolidays),
        coverageAlerts: bytesOf(targetState.coverageAlerts),
        valeTransporte: bytesOf(targetState.valeTransporte),
        scaleCodeConfig: bytesOf(targetState.scaleCodeConfig)
      },
      perCompany,
      persistTier: PERSIST_TIERS[Math.min(persistFloor, PERSIST_TIERS.length - 1)]?.name || "none",
      degraded: storageDegraded
    };

    try {
      console.info("[AppData] Uso de armazenamento (bytes):", report);
      console.table(report.breakdown);
    } catch (_) {
      /* ambiente sem console.table */
    }
    return report;
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return finalizeIncomingState(createDefaultState());
    }

    try {
      const parsed = JSON.parse(saved);
      const defaults = createDefaultState();
      mergeSavedCompanyBlocks(parsed, defaults);
      parsed.escalaSelectedYearMonth = parsed.escalaSelectedYearMonth || monthKey();
      parsed.calendarHolidays = parsed.calendarHolidays || [];
      parsed.coverageAlerts = parsed.coverageAlerts || [];
      parsed.coveragePrincipalBindings = parsed.coveragePrincipalBindings || {};
      parsed.scaleCodeConfig = parsed.scaleCodeConfig || {};
      return finalizeIncomingState({ ...defaults, ...parsed });
    } catch (error) {
      console.warn("Não foi possível carregar os dados salvos.", error);
      return finalizeIncomingState(createDefaultState());
    }
  }

  let state = loadState();

  function saveState() {
    delete state.selectedCompany;
    // Persiste localmente em camadas (nunca lança). A sincronização com o
    // Firebase ocorre SEMPRE, mesmo que o cache local esteja cheio/indisponível.
    persistStateToLocal(state);
    if (window.FirebaseSync?.isReady()) {
      window.FirebaseSync.save(state);
    }
  }

  // Seed 2026 (Semana Santa, Tiradentes, São Jorge): roda uma única vez por
  // dispositivo, logo após o carregamento — antes de qualquer renderização.
  applyHolidaySeed2026IfNeeded();

  function normalizeHolidayRecord(holiday) {
    if (!holiday || typeof holiday !== "object") return null;
    const normalized = {
      ...holiday,
      id: holiday.id || uid("feriado"),
      name: String(holiday.name || "").trim(),
      date: String(holiday.date || "").trim(),
      workedEmployees: Array.isArray(holiday.workedEmployees) ? holiday.workedEmployees : []
    };
    if (isPadroeiraBuziosName(normalized.name)) {
      normalized.date = correctPadroeiraBuziosDate(normalized.date);
    }
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
        employees.set(item.employeeId, mergeWorkedEmployeeItems(prev, item));
      });
      existing.workedEmployees = [...employees.values()];
      map.set(normalized.id, existing);
    }

    (localList || []).forEach(upsert);
    (remoteList || []).forEach(upsert);
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function mergeLancamentosMaps(localMap, remoteMap) {
    const merged = {};
    const allKeys = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
    allKeys.forEach((ym) => {
      const localArr = Array.isArray(localMap[ym]) ? localMap[ym] : [];
      const remoteArr = Array.isArray(remoteMap[ym]) ? remoteMap[ym] : [];
      const byEmp = {};
      remoteArr.forEach((r) => { if (r.employeeId) byEmp[r.employeeId] = r; });
      localArr.forEach((l) => { if (l.employeeId) byEmp[l.employeeId] = l; });
      const arr = Object.values(byEmp);
      if (arr.length) merged[ym] = arr;
    });
    return merged;
  }

  function mergeWorkedEmployeeItems(prev = {}, next = {}) {
    const merged = { ...prev, ...next };
    if (prev.compensationDate && !next.compensationDate) merged.compensationDate = prev.compensationDate;
    if (prev.scheduledCoDate && !next.scheduledCoDate) merged.scheduledCoDate = prev.scheduledCoDate;
    if (prev.scaleCoDate && !next.scaleCoDate) merged.scaleCoDate = prev.scaleCoDate;
    if (prev.linkedFromScale || next.linkedFromScale) {
      merged.linkedFromScale = Boolean(prev.linkedFromScale || next.linkedFromScale);
      merged.scaleCoDate = next.scaleCoDate || prev.scaleCoDate || merged.scaleCoDate;
    }
    if (prev.linkedHolidayId && !next.linkedHolidayId) merged.linkedHolidayId = prev.linkedHolidayId;
    if (prev.status === "Compensado" && next.status === "Pendente") merged.status = prev.status;
    return merged;
  }

  function normalizeCompanyHolidays(companyBlock) {
    if (!companyBlock) return;
    companyBlock.holidays = mergeHolidayLists([], companyBlock.holidays || []);
    // Dedup automático e idempotente a cada carga: mescla feriados duplicados
    // (mesma data + nome) preservando vínculos compensados/agendados e CO.
    mergeDuplicateHolidaysInBlock(companyBlock);
    normalizeWorkedEmployeeRefs(companyBlock);
    reconcileCoCompensationLinks(companyBlock);
  }

  function buildScaleCoHolidayIndex(data, employeeId) {
    const linked = new Map();
    const prefix = `${employeeId}|`;
    Object.entries(data?.manualScale || {}).forEach(([key, entry]) => {
      if (!key.startsWith(prefix)) return;
      const coDate = key.slice(prefix.length);
      const code = typeof entry === "object" ? entry?.code : entry;
      if (code !== "CO") return;
      const linkedHolidayId =
        typeof entry === "object" ? String(entry.linkedHolidayId || "").trim() : "";
      if (linkedHolidayId) linked.set(linkedHolidayId, coDate);
    });
    return linked;
  }

  /** Status exibidos como pendência no Controle de Feriados (abas Pendentes e Vencidos). */
  const FERIADOS_CO_PICKER_STATUSES = new Set(["pendente", "vencido"]);

  function isWorkedHolidayPendingInFeriadosControl(item, holiday, employeeId, data, today, options = {}) {
    const employee = (data?.employees || []).find((entry) => entry.id === employeeId);
    if (employee?.admissionDate && holiday.date < employee.admissionDate) return false;

    syncWorkedEmployeeStatus(item, holiday.date);
    const status = resolveWorkedHolidayStatus(item, holiday.date, today);
    const isEditingThisCo = Boolean(options.isEditingThisCo);
    const coDate = options.coDate || "";

    if (status.key === "compensado" && !isEditingThisCo) return false;
    if (status.key === "agendado" && !isEditingThisCo) return false;

    // Regra crítica: Se não estou editando este CO específico, exclua feriados já marcados
    if (!isEditingThisCo) {
      // Verificar se o feriado já está no índice de COs (mapa de COs já lançados na escala)
      if (options.scaleCoLinks?.has(holiday.id)) return false;

      // Verificar se o feriado já está vinculado a um CO na escala (mesma verificação, mais explícita)
      if (item.linkedFromScale && item.scaleCoDate) return false;
    }

    if (item.linkedFromScale && item.scaleCoDate && item.scaleCoDate !== coDate && !isEditingThisCo) {
      return false;
    }

    if (item.compensationDate && item.compensationDate !== coDate) {
      if (status.key === "agendado" || status.key === "compensado") return isEditingThisCo;
    }

    if (isEditingThisCo) return true;
    return FERIADOS_CO_PICKER_STATUSES.has(status.key);
  }

  function reconcileCoCompensationLinks(companyBlock) {
    if (!companyBlock) return false;
    let changed = false;

    Object.entries(companyBlock.manualScale || {}).forEach(([key, entry]) => {
      const sep = key.indexOf("|");
      if (sep < 0) return;
      const employeeId = key.slice(0, sep);
      const coDate = key.slice(sep + 1);
      if (!employeeId || !coDate) return;

      const code = typeof entry === "object" ? entry?.code : entry;
      if (code !== "CO") return;

      const linkedHolidayId =
        typeof entry === "object" ? String(entry.linkedHolidayId || "").trim() : "";
      if (!linkedHolidayId) return;

      const holiday = (companyBlock.holidays || []).find((item) => item.id === linkedHolidayId);
      if (!holiday) return;

      const item = resolveWorkedEmployeeEntry(companyBlock, employeeId, holiday);
      if (!item) return;

      if (
        item.compensationDate !== coDate ||
        item.scaleCoDate !== coDate ||
        !item.linkedFromScale ||
        item.linkedHolidayId !== linkedHolidayId
      ) {
        item.compensationDate = coDate;
        item.scheduledCoDate = coDate;
        item.scaleCoDate = coDate;
        item.linkedFromScale = true;
        item.linkedHolidayId = linkedHolidayId;
        syncWorkedEmployeeStatus(item, holiday.date);
        changed = true;
      }
    });

    return changed;
  }

  function resolveWorkedEmployeeEntry(data, employeeId, holiday) {
    const canonicalId = String(employeeId || "").trim();
    if (!canonicalId || !holiday) return null;

    const employees = data?.employees || [];
    const employee = employees.find((entry) => entry.id === canonicalId);
    if (!employee) return null;

    const targetNameKey = normalizeSearchText(employee.name);
    let matched = null;

    (holiday.workedEmployees || []).forEach((row) => {
      if (!row || matched) return;

      let rowRef = String(row.employeeId || "").trim();
      if (!rowRef && row.employeeName) rowRef = String(row.employeeName).trim();
      if (!rowRef) return;

      if (rowRef === canonicalId) {
        row.employeeId = canonicalId;
        matched = row;
        return;
      }

      const rowNameKey = normalizeSearchText(rowRef);
      if (rowNameKey === targetNameKey) {
        row.employeeId = canonicalId;
        matched = row;
      }
    });

    return matched && matched.employeeId === canonicalId ? matched : null;
  }

  function normalizeWorkedEmployeeRefs(companyBlock) {
    if (!companyBlock?.holidays) return;
    const employees = companyBlock.employees || [];
    const idByName = new Map();
    employees.forEach((employee) => {
      if (employee?.id && employee?.name) {
        idByName.set(normalizeSearchText(employee.name), employee.id);
      }
    });

    companyBlock.holidays.forEach((holiday) => {
      const byEmployee = new Map();
      (holiday.workedEmployees || []).forEach((item) => {
        if (!item) return;

        let ref = String(item.employeeId || "").trim();
        if (!ref && item.employeeName) ref = String(item.employeeName).trim();
        if (!ref) return;

        let canonicalId = employees.find((employee) => employee.id === ref)?.id;
        if (!canonicalId) canonicalId = idByName.get(normalizeSearchText(ref));
        if (!canonicalId) return;

        item.employeeId = canonicalId;
        const prev = byEmployee.get(canonicalId) || {};
        byEmployee.set(canonicalId, mergeWorkedEmployeeItems(prev, item));
      });
      holiday.workedEmployees = [...byEmployee.values()];
    });
  }

  function isPendingCoCandidate(item, holiday, coDate, today, isEditingThisCo, context = {}) {
    return isWorkedHolidayPendingInFeriadosControl(item, holiday, context.employeeId, context.data, today, {
      coDate,
      isEditingThisCo,
      scaleCoLinks: context.scaleCoLinks
    });
  }

  // Persiste estado já mesclado (merge ocorre apenas em mergeRemoteIntoLocal).
  // O estado vem do Firebase/merge; uma QuotaExceededError aqui NÃO pode gerar
  // erro de sincronização — persistStateToLocal degrada com segurança e nunca lança.
  function setRemoteState(remoteState) {
    if (!remoteState || typeof remoteState !== "object") return;
    state = finalizeIncomingState(remoteState);
    persistStateToLocal(state);
  }

  function getCompanyData(company) {
    const resolved = resolveCompanyKey(company);
    if (!state.companies[resolved]) {
      state.companies[resolved] = createCompanyData(resolved);
    }
    return normalizeCompanyBlock(state.companies[resolved]);
  }

  function buildIncomingCompanyInfo(companyInfo) {
    const incoming = {};
    COMPANY_CRITICAL_FIELDS.forEach((field) => {
      if (field.key === "logoDataUrl") return; // logo tratado em updateCompanyLogo
      if (Object.prototype.hasOwnProperty.call(companyInfo || {}, field.key)) {
        const raw = companyInfo[field.key];
        incoming[field.key] = raw == null ? "" : String(raw).trim();
      }
    });
    return incoming;
  }

  /**
   * Atualiza dados da empresa com PROTEÇÃO:
   * - merge campo a campo (não apaga valor preenchido com vazio);
   * - bloqueia substituir registro válido por vazio sem options.force;
   * - cria backup automático + carimba updatedAt.
   * @returns {boolean} true se salvou.
   */
  function updateCompanyInfo(companyInfo, company, options = {}) {
    const resolved = company || getActiveCompany();
    const data = getCompanyData(resolved);
    if (!data) return false;

    const existing = data.companyInfo || {};
    const incoming = buildIncomingCompanyInfo(companyInfo || {});
    const force = options.force === true;
    const candidate = force ? { ...existing, ...incoming } : mergeCompanyInfoPreserving(existing, incoming);

    if (isMeaningfulCompanyInfo(existing) && !isMeaningfulCompanyInfo(candidate) && !force) {
      emitDataAlert(
        `Alteração ignorada: os dados da empresa "${resolved}" ficariam sem Razão Social e CNPJ. Dados preservados.`
      );
      return false;
    }

    candidate.updatedAt = Date.now();
    candidate.updatedBy = window.AppAuth?.getUser?.()?.email || candidate.updatedBy || "";
    data.companyInfo = normalizeCompanyInfoShape(candidate, resolved);
    backupCompanyInfoInState(state, resolved, data.companyInfo);
    saveState();
    return true;
  }

  function updateCompanyLogo(logoDataUrl, company, options = {}) {
    const resolved = company || getActiveCompany();
    const data = getCompanyData(resolved);
    if (!data) return false;

    const existing = data.companyInfo || {};
    const force = options.force === true;
    const value = logoDataUrl || "";

    if (!value && existing.logoDataUrl && !force) {
      emitDataAlert(`Logo da empresa "${resolved}" preservado (remoção exige confirmação).`);
      return false;
    }

    data.companyInfo = normalizeCompanyInfoShape(
      { ...existing, logoDataUrl: value, updatedAt: Date.now() },
      resolved
    );
    backupCompanyInfoInState(state, resolved, data.companyInfo);
    saveState();
    return true;
  }

  /** Diagnóstico de integridade dos dados da empresa. */
  function diagnoseCompanyData(company) {
    const target = company || getActiveCompany();
    const block = state.companies?.[target];
    const info = block?.companyInfo || {};
    const backup = getCompanyInfoBackup(state, target);
    const meaningful = isMeaningfulCompanyInfo(info);
    const inconsistencies = [];
    if (!resolveCompanyCnpj(info)) inconsistencies.push("CNPJ ausente");
    if (!String(info.legalName || "").trim()) inconsistencies.push("Razão Social ausente");
    if (!meaningful) inconsistencies.push("Registro vazio (sem CNPJ e sem Razão Social)");

    return {
      activeCompany: getActiveCompany(),
      company: target,
      source: meaningful ? "cadastro" : backup ? "backup disponível" : "sem dados",
      updatedAt: info.updatedAt || 0,
      updatedAtLabel: info.updatedAt ? new Date(info.updatedAt).toLocaleString("pt-BR") : "—",
      updatedBy: info.updatedBy || "",
      hasBackup: Boolean(backup),
      backupUpdatedAt: backup?.updatedAt || 0,
      historyCount: (state.companyInfoHistory?.[target] || []).length,
      meaningful,
      cnpj: resolveCompanyCnpj(info),
      inconsistencies
    };
  }

  /** Restauração manual a partir do backup (confirmação na UI). */
  function restoreCompanyInfoFromBackup(company) {
    const target = company || getActiveCompany();
    const backup = getCompanyInfoBackup(state, target);
    if (!backup) return false;
    const data = getCompanyData(target);
    data.companyInfo = normalizeCompanyInfoShape(backup, target);
    saveState();
    return true;
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

  function compareEmployeeName(a, b) {
    return String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR", {
      sensitivity: "base",
      numeric: true
    });
  }

  function sortEmployeesByName(employees) {
    if (!Array.isArray(employees)) return [];
    return [...employees].sort(compareEmployeeName);
  }

  function findEmployeeIdInOtherCompany(employeeId, company) {
    const targetId = String(employeeId || "").trim();
    if (!targetId) return null;
    return (
      companyKeysFromState(state)
        .map((co) => {
          if (co === company) return null;
          const match = getCompanyData(co).employees.find((item) => item.id === targetId);
          return match ? { company: co, employee: match } : null;
        })
        .find(Boolean) || null
    );
  }

  function getTotalEmployeeCount() {
    return getCompanies().reduce(
      (total, company) => total + (state.companies[company]?.employees?.length || 0),
      0
    );
  }

  function getEmployeeCounts() {
    const byCompany = getCompanies().map((company) => ({
      company,
      total: state.companies[company]?.employees?.length || 0,
      active: (state.companies[company]?.employees || []).filter((employee) => isEmployeeActive(employee)).length
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

  function upsertEmployee(employee, company, options = {}) {
    const resolved = company || getPrimaryPageCompany("funcionarios");
    const data = getCompanyData(resolved);
    const hasFixedDay = Object.prototype.hasOwnProperty.call(employee, "fixedDay");
    const cpfFormatted = formatCpf(employee.cpf || "");
    const cpfDigits = normalizeCpfDigits(cpfFormatted);
    const existingById = employee.id ? data.employees.find((item) => item.id === employee.id) : null;
    const existingByCpf = cpfDigits ? findEmployeeByCpf(cpfDigits, resolved) : null;
    const existing = existingById || existingByCpf;

    if (cpfDigits && !options.allowCrossCompany) {
      const otherCompany = findEmployeeCompanyByCpf(cpfDigits, resolved);
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
      source,
      fixedDayHistory: normalizeFixedDayHistory(existing)
    };

    if (existing && hasFixedDay) {
      const scheduled = scheduleFixedDayChange(existing, normalized.fixedDay);
      normalized.fixedDay = scheduled.fixedDay;
      normalized.fixedDayHistory = scheduled.fixedDayHistory;
    }

    const idClash = findEmployeeIdInOtherCompany(normalized.id, resolved);
    if (idClash && (!existing || existing.id !== normalized.id)) {
      throw new Error(`ID interno já utilizado em ${idClash.company}.`);
    }

    const index = data.employees.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      data.employees[index] = normalized;
    } else {
      data.employees.push(normalized);
    }
    data.employees = sortEmployeesByName(data.employees);

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

  function removeEmployee(id, company) {
    removeEmployeeFromCompany(company || getPrimaryPageCompany("funcionarios"), id, true);
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

  function addVacation(vacation, company) {
    const data = getCompanyData(resolveCompanyForEmployeeWrite(vacation.employeeId, company, "ferias"));
    const employeeName = getEmployeeName(vacation.employeeId, data);
    upsertVacationRange(
      data,
      vacation.employeeId,
      vacation.startDate,
      vacation.endDate,
      String(vacation.note || "").trim() || employeeName
    );
    runScaleIntegrations(monthsTouchedByRange(vacation.startDate, vacation.endDate));
    saveState();
  }

  function removeVacation(id, company) {
    const data = getCompanyData(company || getPrimaryPageCompany("ferias"));
    const vacation = data.vacations.find((item) => item.id === id);
    data.vacations = data.vacations.filter((item) => item.id !== id);
    if (vacation) runScaleIntegrations(monthsTouchedByRange(vacation.startDate, vacation.endDate));
    saveState();
  }

  function updateVacation(id, vacation, company) {
    const data = getCompanyData(resolveCompanyForEmployeeWrite(vacation.employeeId, company, "ferias"));
    const existing = data.vacations.find((item) => item.id === id);
    if (!existing) return false;

    const oldStart = existing.startDate;
    const oldEnd = existing.endDate;
    const employeeName = getEmployeeName(vacation.employeeId, data);

    existing.employeeId = vacation.employeeId;
    existing.startDate = vacation.startDate;
    existing.endDate = vacation.endDate;
    existing.note = String(vacation.note || "").trim() || employeeName;

    clearManualScaleCodeInRange(data, existing.employeeId, existing.startDate, existing.endDate, "FÉRIAS");

    const months = new Set([
      ...monthsTouchedByRange(oldStart, oldEnd),
      ...monthsTouchedByRange(vacation.startDate, vacation.endDate)
    ]);
    runScaleIntegrations([...months]);
    saveState();
    return true;
  }

  function addAbsence(absence, company) {
    const resolved = resolveCompanyForEmployeeWrite(absence.employeeId, company, "ferias");
    const data = getCompanyData(resolved);
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
    runScaleIntegrations(monthsTouchedByRange(absence.startDate, absence.endDate));
    saveState();
  }

  function removeAbsence(id, company) {
    const data = getCompanyData(company || getPrimaryPageCompany("ferias"));
    const absence = (data.absences || []).find((item) => item.id === id);
    data.absences = (data.absences || []).filter((item) => item.id !== id);
    if (absence) runScaleIntegrations(monthsTouchedByRange(absence.startDate, absence.endDate));
    saveState();
  }

  /**
   * Validação automática de Padroeira de Búzios (Fase 3A).
   * Falha com erro se encontrar data incorreta (21/05 em vez de 26/07).
   */
  function validatePadroeiraBuziosIntegrity() {
    const errors = [];

    COMPANIES.forEach((company) => {
      const data = getCompanyData(company);
      (data.holidays || []).forEach((holiday) => {
        if (!holiday.date) return;

        const isBuzios = String(holiday.name || "").includes("Padroeira");
        const isWrongDate = holiday.date.endsWith("-05-21");

        if (isBuzios && isWrongDate) {
          errors.push({
            company,
            holidayId: holiday.id,
            message: `Padroeira de Búzios em ${holiday.date} (deveria ser 26/07)`
          });
        }
      });
    });

    if (errors.length > 0) {
      console.error("[Validação] FALHA: Padroeira de Búzios com data incorreta", errors);
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Corrigir automaticamente Padroeira de Búzios (Fase 3A).
   * Muda de 21/05 para 26/07 se encontrado.
   */
  function correctPadroeiraBuziosAutomatically() {
    let corrected = 0;

    COMPANIES.forEach((company) => {
      const data = getCompanyData(company);
      (data.holidays || []).forEach((holiday) => {
        if (!holiday.date) return;

        const isBuzios = String(holiday.name || "").includes("Padroeira");
        const isWrongDate = holiday.date.endsWith("-05-21");

        if (isBuzios && isWrongDate) {
          const year = holiday.date.slice(0, 4);
          holiday.date = `${year}-07-26`;
          corrected += 1;
          console.warn(
            `[Validação] Padroeira de Búzios corrigida para ${holiday.date} (empresa: ${company})`
          );
        }
      });
    });

    if (corrected > 0) {
      saveState();
    }

    return corrected;
  }

  function updateAbsence(id, absence, company) {
    const data = getCompanyData(resolveCompanyForEmployeeWrite(absence.employeeId, company, "ferias"));
    const existing = (data.absences || []).find((item) => item.id === id);
    if (!existing) return false;

    const oldStart = existing.startDate;
    const oldEnd = existing.endDate;

    existing.employeeId = absence.employeeId;
    existing.type = absence.type || existing.type;
    existing.startDate = absence.startDate;
    existing.endDate = absence.endDate;
    existing.cid = absence.cid || "";
    existing.note = absence.note || "";

    const months = new Set([
      ...monthsTouchedByRange(oldStart, oldEnd),
      ...monthsTouchedByRange(absence.startDate, absence.endDate)
    ]);
    runScaleIntegrations([...months]);
    saveState();
    return true;
  }

  function addHoliday(holiday, options = {}) {
    const company = options.company || getPrimaryPageCompany("feriados");
    const data = getCompanyData(company);
    let name = String(holiday.name || "").trim();
    let date = String(holiday.date || "").trim();
    if (isPadroeiraBuziosName(name)) date = correctPadroeiraBuziosDate(date);
    data.holidays.push({
      id: uid("feriado"),
      name,
      date,
      workedEmployees: holiday.workedEmployees || []
    });
    saveState();
  }

  function resolveCalendarTargetCompanies(companies) {
    const list = Array.isArray(companies) ? companies : [];
    if (!list.length || list.includes("ambas")) return [...COMPANIES];
    return list.filter((company) => COMPANIES.includes(company));
  }

  function findCompanyHolidayByNameDate(data, name, date) {
    const normalizedName = normalizeSearchText(name);
    return (data.holidays || []).find(
      (holiday) => holiday.date === date && normalizeSearchText(holiday.name) === normalizedName
    );
  }

  function syncCompanyHolidaysFromCalendarEntry(entry, options = {}) {
    const name = String(entry?.name || "").trim();
    let date = String(entry?.date || "").trim();
    if (!name || !date) return false;
    if (isPadroeiraBuziosName(name)) date = correctPadroeiraBuziosDate(date);

    const shouldSave = options.save !== false;
    let changed = false;

    resolveCalendarTargetCompanies(entry.companies).forEach((company) => {
      const data = getCompanyData(company);
      if (!data.holidays) data.holidays = [];
      if (findCompanyHolidayByNameDate(data, name, date)) return;

      data.holidays.push({
        id: uid("feriado"),
        name,
        date,
        workedEmployees: []
      });
      changed = true;
    });

    if (changed && shouldSave) saveState();
    return changed;
  }

  function syncAllCalendarHolidaysToCompanies(options = {}) {
    let changed = false;
    (state.calendarHolidays || []).forEach((calendarHoliday) => {
      if (
        syncCompanyHolidaysFromCalendarEntry(
          {
            name: calendarHoliday.name,
            date: calendarHoliday.date,
            companies: calendarHoliday.companies || ["ambas"]
          },
          { save: false }
        )
      ) {
        changed = true;
      }
    });
    if (changed && options.save !== false) saveState();
    return changed;
  }

  /**
   * Soft delete de feriado — marca como deletado em vez de remover.
   * Permite restauração posterior.
   */
  function removeHoliday(id, options = {}) {
    const company = options.company || getPrimaryPageCompany("feriados");
    const data = getCompanyData(company);
    const holiday = (data.holidays || []).find((h) => h.id === id);
    if (!holiday) return false;

    // Soft delete: marcar com deletedAt em vez de remover
    holiday.deletedAt = holiday.deletedAt || todayISO();
    holiday.isDeleted = true;

    saveState();
    return true;
  }

  /**
   * Restaurar feriado que foi marcado como deletado.
   */
  function restoreHoliday(id, options = {}) {
    const company = options.company || getPrimaryPageCompany("feriados");
    const data = getCompanyData(company);
    const holiday = (data.holidays || []).find((h) => h.id === id);
    if (!holiday) return false;

    delete holiday.deletedAt;
    holiday.isDeleted = false;

    saveState();
    return true;
  }

  /**
   * Listar feriados não deletados (filtro padrão na UI).
   */
  function getActiveHolidays(company) {
    const data = getCompanyData(company);
    return (data.holidays || []).filter((h) => !h.isDeleted);
  }

  /**
   * FASE 3A — Deduplicação de feriados
   *
   * Chave de unicidade (por empresa/bloco): data + nome normalizado.
   *
   * Pontuação de um vínculo (workedEmployee) — quanto maior, mais completo:
   *   Compensado(4) > Agendado(3) > Vencido(1) > Pendente(0), reforçado por
   *   data de compensação, vínculo da escala e CO da escala. Garante que um
   *   vínculo compensado/agendado nunca seja substituído por um pendente.
   */
  function scoreWorkedHolidayItem(item, holidayDate) {
    if (!item) return -1;
    const status = resolveWorkedHolidayStatus(item, holidayDate);
    const statusRank =
      status.key === "compensado" ? 4 : status.key === "agendado" ? 3 : status.key === "vencido" ? 1 : 0;
    return (
      statusRank * 100 +
      (item.compensationDate ? 20 : 0) +
      (item.linkedFromScale ? 10 : 0) +
      (item.scaleCoDate ? 5 : 0) +
      (item.status ? 1 : 0)
    );
  }

  // Registro canônico = o mais completo: maior pontuação de vínculo e mais funcionários.
  function scoreHolidayRecord(holiday) {
    const worked = holiday.workedEmployees || [];
    let best = 0;
    worked.forEach((item) => {
      best = Math.max(best, scoreWorkedHolidayItem(item, holiday.date));
    });
    return best * 1000 + worked.length;
  }

  /**
   * Mescla, dentro de um bloco de empresa, feriados duplicados (mesma data + nome).
   * - Escolhe o registro mais completo como canônico (prioridade req. 4).
   * - Consolida todos os workedEmployees únicos por employeeId, preferindo o mais
   *   completo (compensado/agendado nunca vira pendente — req. 5/6).
   * - Aplica soft delete nos duplicados (idempotente — só agrupa registros ativos).
   * - Religa vínculos CO (manualScale.linkedHolidayId e item.linkedHolidayId) do id
   *   removido para o id canônico, preservando o vínculo CO existente (req. 2).
   * Idempotente: rodar várias vezes não recria nem perde duplicados.
   */
  function mergeDuplicateHolidaysInBlock(data) {
    if (!data || !Array.isArray(data.holidays) || data.holidays.length < 2) {
      return { merged: 0, details: [] };
    }

    const byKey = new Map();
    (data.holidays || []).forEach((holiday) => {
      if (!holiday || holiday.isDeleted) return; // só agrupa registros ativos (idempotência)
      if (!holiday.date || !holiday.name) return;
      const key = `${holiday.date}|${normalizeSearchText(holiday.name)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(holiday);
    });

    const details = [];
    const remap = new Map(); // id removido -> id canônico (para religar vínculos CO)
    let merged = 0;

    byKey.forEach((group) => {
      if (group.length < 2) return;

      const primary = group.slice().sort((a, b) => scoreHolidayRecord(b) - scoreHolidayRecord(a))[0];

      // Consolidar workedEmployees únicos por employeeId, preferindo o mais completo
      const workedMap = new Map();
      group.forEach((holiday) => {
        (holiday.workedEmployees || []).forEach((item) => {
          if (!item || !item.employeeId) return;
          const existing = workedMap.get(item.employeeId);
          if (!existing) {
            workedMap.set(item.employeeId, item);
            return;
          }
          const keepNew =
            scoreWorkedHolidayItem(item, holiday.date) > scoreWorkedHolidayItem(existing, primary.date);
          workedMap.set(item.employeeId, keepNew ? item : existing);
        });
      });

      primary.workedEmployees = Array.from(workedMap.values());
      primary.isDeleted = false;
      delete primary.deletedAt;

      group.forEach((holiday) => {
        if (holiday === primary) return;
        holiday.isDeleted = true;
        holiday.deletedAt = todayISO();
        if (holiday.id && holiday.id !== primary.id) remap.set(holiday.id, primary.id);
        details.push({
          action: "merged",
          kept: primary.id,
          deleted: holiday.id,
          date: holiday.date,
          name: holiday.name,
          keptCount: primary.workedEmployees.length
        });
        merged += 1;
      });
    });

    // Religar vínculos CO que apontavam para o registro removido (preserva o vínculo)
    if (remap.size) {
      Object.values(data.manualScale || {}).forEach((entry) => {
        if (entry && typeof entry === "object" && remap.has(entry.linkedHolidayId)) {
          entry.linkedHolidayId = remap.get(entry.linkedHolidayId);
        }
      });
      (data.holidays || []).forEach((holiday) => {
        (holiday.workedEmployees || []).forEach((item) => {
          if (item && remap.has(item.linkedHolidayId)) {
            item.linkedHolidayId = remap.get(item.linkedHolidayId);
          }
        });
      });
    }

    return { merged, details };
  }

  function findOrMergeDuplicateHolidays(company, options = {}) {
    const data = getCompanyData(company);
    const result = mergeDuplicateHolidaysInBlock(data);
    if (result.merged > 0 && options.save !== false) {
      saveState();
    }
    return result;
  }

  /**
   * Deduplicação global para todas as empresas.
   */
  function deduplicateAllHolidays(options = {}) {
    const results = {};
    COMPANIES.forEach((company) => {
      const result = findOrMergeDuplicateHolidays(company, { save: false });
      if (result.merged > 0) {
        results[company] = result;
      }
    });

    if (Object.keys(results).length > 0 && options.save !== false) {
      saveState();
    }

    return results;
  }

  function removeWorkedEmployeeFromHoliday(holidayId, employeeId, options = {}) {
    const company = options.company || getPrimaryPageCompany("feriados");
    const data = getCompanyData(company);
    const holiday = (data.holidays || []).find((item) => item.id === holidayId);
    if (!holiday) return false;

    const before = (holiday.workedEmployees || []).length;
    holiday.workedEmployees = (holiday.workedEmployees || []).filter((item) => item.employeeId !== employeeId);
    const changed = before !== holiday.workedEmployees.length;
    if (!changed) return false;

    Object.keys(data.manualScale || {}).forEach((key) => {
      if (!key.startsWith(`${employeeId}|`)) return;
      const entry = data.manualScale[key];
      if (entry && typeof entry === "object" && entry.linkedHolidayId === holidayId) {
        // Mantém o CO, mas remove o vínculo específico.
        data.manualScale[key] = "CO";
      }
    });

    if (options.save !== false) saveState();
    return true;
  }

  function updateHoliday(id, patch = {}, options = {}) {
    const data = getCompanyData(options.company || getPrimaryPageCompany("feriados"));
    const list = data.holidays || [];
    const idx = list.findIndex((holiday) => holiday.id === id);
    if (idx < 0) return false;

    const holiday = list[idx];
    const oldName = String(holiday.name || "").trim();
    const oldDate = String(holiday.date || "").trim();
    const nextName = patch.name !== undefined ? String(patch.name || "").trim() : oldName;
    const nextDate = patch.date !== undefined ? String(patch.date || "").trim() : oldDate;

    if (!nextName || !nextDate) return false;
    if (nextName === oldName && nextDate === oldDate) return false;

    const conflict = list.find(
      (item) =>
        item.id !== id &&
        item.date === nextDate &&
        normalizeSearchText(item.name) === normalizeSearchText(nextName)
    );

    if (conflict) {
      const byEmployee = new Map();
      [...(holiday.workedEmployees || []), ...(conflict.workedEmployees || [])].forEach((item) => {
        if (!item?.employeeId) return;
        const prev = byEmployee.get(item.employeeId) || {};
        byEmployee.set(item.employeeId, { ...prev, ...item });
      });
      holiday.workedEmployees = [...byEmployee.values()];

      Object.keys(data.manualScale || {}).forEach((key) => {
        const entry = data.manualScale[key];
        if (entry && typeof entry === "object" && entry.linkedHolidayId === conflict.id) {
          data.manualScale[key] = { ...entry, linkedHolidayId: id };
        }
      });

      data.holidays = list.filter((item) => item.id !== conflict.id);
    }

    holiday.name = nextName;
    holiday.date = nextDate;
    (holiday.workedEmployees || []).forEach((item) => syncWorkedEmployeeStatus(item, holiday.date));

    if (options.save !== false) {
      runScaleIntegrations([oldDate.slice(0, 7), nextDate.slice(0, 7)].filter(Boolean));
      saveState();
    }
    return true;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function resolveWorkedHolidayStatus(item, holidayDate, today = todayISO()) {
    const dueDate = getHolidayCompensationDueDate(holidayDate);
    const daysLeft = diffDays(today, dueDate);
    const effectiveCompDate = String(
      item.compensationDate || item.scheduledCoDate || item.scaleCoDate || ""
    ).trim();
    const statusNorm = normalizeSearchText(item.status);

    if (
      !effectiveCompDate &&
      (statusNorm.includes("compens") || statusNorm.includes("tirad"))
    ) {
      return { key: "compensado", label: "Compensado", daysLeft };
    }

    if (effectiveCompDate) {
      if (effectiveCompDate > today) return { key: "agendado", label: "Agendado", daysLeft };
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

  /**
   * Predicado ÚNICO de visibilidade de um vínculo (workedEmployee) no Histórico
   * oficial do Controle de Feriados. É a fonte de verdade compartilhada entre o
   * Controle de Feriados (feriados.js) e o dropdown do modal CO (Escala).
   *
   * Um vínculo é visível somente se:
   *  - o feriado não está soft-deletado;
   *  - tem employeeId;
   *  - a data trabalhada NÃO é anterior à admissão do funcionário (feriado de
   *    antes da admissão — ex.: "Natal 2025" para quem entrou depois — é invisível).
   *
   * Mantém a mesma semântica do filtro do Controle de Feriados: quando o
   * funcionário não é encontrado ou não tem admissionDate, o vínculo é visível.
   */
  function isWorkedEntryVisibleInHistory(holiday, item, data) {
    if (!holiday || holiday.isDeleted) return false;
    if (!item || !item.employeeId) return false;
    const emp = (data?.employees || []).find((entry) => entry.id === item.employeeId);
    if (emp && emp.admissionDate && holiday.date < emp.admissionDate) return false;
    return true;
  }

  /**
   * FONTE ÚNICA das opções do dropdown do modal CO (Escala de Folga).
   *
   * Chave lógica: employeeId + empresa + nome normalizado + data trabalhada.
   * Para cada chave, agrega TODOS os registros do funcionário e decide UMA opção:
   *   1. Se a chave tem o feriado já vinculado a ESTE CO (coDate em edição) → mantém
   *      esse registro selecionável (permite reabrir/editar o CO atual).
   *   2. Senão, se QUALQUER registro da chave está Agendado/Compensado, tem
   *      compensationDate, ou já tem CO lançado na escala (qualquer data, inclusive
   *      futura) → a chave inteira some do dropdown (remove o Pendente duplicado).
   *   3. Senão, oferece um único representante Pendente/Vencido da chave.
   *
   * Exclui ainda: soft-deletados, duplicados, registros de outro employeeId e de
   * outra empresa (os dados já chegam com escopo da empresa da aba ativa).
   * Retorno: [{ holiday, item, status, company }] ordenado por data.
   */
  function getAvailableCoHolidayOptions(employeeId, coDate, options = {}) {
    const canonicalId = String(employeeId || "").trim();
    if (!canonicalId) return [];

    const company =
      options.company ||
      findEmployeeRecord(canonicalId)?.company ||
      getPrimaryPageCompany("escala");
    const data = options.data || getCompanyData(company);
    normalizeWorkedEmployeeRefs(data);
    reconcileCoCompensationLinks(data);

    // Empresa da aba ativa (regra 9): o funcionário precisa pertencer a este bloco.
    if (!data.employees.some((entry) => entry.id === canonicalId)) return [];

    const today = todayISO();
    const currentEntry = getManualScaleEntry(canonicalId, coDate, data);
    const currentLinkedId =
      currentEntry && typeof currentEntry === "object" ? currentEntry.linkedHolidayId : null;
    const scaleCoIndex = buildScaleCoHolidayIndex(data, canonicalId); // linkedHolidayId -> coDate

    // 1) Agrupar registros do funcionário por chave lógica (data + nome normalizado)
    const groups = new Map();
    (data.holidays || []).forEach((holiday) => {
      if (!holiday || holiday.isDeleted) return; // regra 6: soft-deleted
      if (!holiday.date || !holiday.name) return;

      const item = resolveWorkedEmployeeEntry(data, canonicalId, holiday); // regra 8: employeeId
      if (!item) return;

      // Dropdown CO = subconjunto do Histórico oficial: descarta vínculos que o
      // Controle de Feriados não exibe (ex.: feriado anterior à admissão).
      if (!isWorkedEntryVisibleInHistory(holiday, item, data)) return;

      syncWorkedEmployeeStatus(item, holiday.date);
      const status = resolveWorkedHolidayStatus(item, holiday.date, today);

      // O feriado já vinculado a ESTE CO (em edição) permanece disponível.
      const isEditingThisCo =
        holiday.id === currentLinkedId ||
        (item.linkedFromScale && (item.scaleCoDate === coDate || item.compensationDate === coDate));

      // Este registro torna a chave indisponível? (regras 1,2,3,4,5)
      const hasScaleCo = scaleCoIndex.has(holiday.id) || (item.linkedFromScale && Boolean(item.scaleCoDate));
      const isResolved = status.key === "agendado" || status.key === "compensado";
      const hasCompDate = Boolean(item.compensationDate);
      const blocks = !isEditingThisCo && (isResolved || hasCompDate || hasScaleCo);

      const key = `${holiday.date}|${normalizeSearchText(holiday.name)}`;
      let group = groups.get(key);
      if (!group) {
        group = { blocked: false, editing: null, pending: null };
        groups.set(key, group);
      }
      if (blocks) group.blocked = true;
      if (isEditingThisCo && !group.editing) {
        group.editing = { holiday, item, status, company };
      }
      if (!group.pending && FERIADOS_CO_PICKER_STATUSES.has(status.key)) {
        group.pending = { holiday, item, status, company };
      }
    });

    // 2) Uma opção por chave: edição > (bloqueado: nada) > pendente/vencido
    const available = [];
    groups.forEach((group) => {
      if (group.editing) {
        available.push(group.editing);
        return;
      }
      if (group.blocked) return; // existe Agendado/Compensado/CO → some o Pendente (regra 7)
      if (group.pending) available.push(group.pending);
    });

    return available.sort((a, b) => a.holiday.date.localeCompare(b.holiday.date));
  }

  // Mantidos como alias da fonte única para não divergirem (root cause original).
  function getAvailableHolidaysForCo(employeeId, coDate, options = {}) {
    return getAvailableCoHolidayOptions(employeeId, coDate, options);
  }

  function getPendingCoHolidaysForEmployee(employeeId, coDate, options = {}) {
    return getAvailableCoHolidayOptions(employeeId, coDate, options);
  }

  /**
   * AUDITORIA de consistência dos feriados (Fase 3B) — SOMENTE LEITURA.
   * Não altera nenhum dado. Rode no console: AppData.auditHolidayConsistency()
   *
   * Verifica, por empresa:
   *  - vínculos invisíveis para CO (feriado soft-deletado com pendência);
   *  - vínculos anteriores à admissão (invisíveis no Histórico);
   *  - status gravado divergente do status calculado;
   *  - vínculos órfãos (employeeId inexistente na empresa);
   *  - "Compensado" sem nenhuma data de compensação;
   *  - duplicidades ativas (mesma data + nome normalizado);
   *  - data divergente entre feriado da empresa e calendário (mesmo ano);
   *  - feriados sem nenhum funcionário vinculado (informativo).
   * E no calendário: mesmo feriado (variantes de nome) em datas diferentes
   * no mesmo ano (risco de duplicidade futura).
   */
  function auditHolidayConsistency() {
    const today = todayISO();
    const report = {
      generatedAt: new Date().toISOString(),
      calendar: [],
      companies: {},
      totalIssues: 0
    };

    // Calendário global: nome equivalente em datas diferentes no mesmo ano.
    const calendarByKey = new Map();
    (state.calendarHolidays || []).forEach((holiday) => {
      if (!holiday?.date || !holiday?.name) return;
      const key = `${String(holiday.date).slice(0, 4)}|${normalizeSearchText(holiday.name)}`;
      const knownDate = calendarByKey.get(key);
      if (knownDate && knownDate !== holiday.date) {
        report.calendar.push({
          tipo: "datas-divergentes-calendario",
          feriado: holiday.name,
          datas: [knownDate, holiday.date]
        });
      } else if (!knownDate) {
        calendarByKey.set(key, holiday.date);
      }
    });

    getCompanies().forEach((company) => {
      const data = getCompanyData(company);
      const findings = {
        invisiveisParaCo: [],
        anterioresAdmissao: [],
        statusDivergente: [],
        vinculoOrfao: [],
        compensadoSemData: [],
        duplicadosAtivos: [],
        dataDivergenteCalendario: [],
        semFuncionarioVinculado: []
      };
      const employeeIds = new Set((data.employees || []).map((employee) => employee.id));
      const activeByKey = new Map();

      (data.holidays || []).forEach((holiday) => {
        if (!holiday?.date || !holiday?.name) return;
        const base = { feriado: holiday.name, data: holiday.date, id: holiday.id };
        const worked = holiday.workedEmployees || [];

        if (!holiday.isDeleted) {
          const key = `${holiday.date}|${normalizeSearchText(holiday.name)}`;
          if (activeByKey.has(key)) {
            findings.duplicadosAtivos.push({ ...base, duplicaDe: activeByKey.get(key) });
          } else {
            activeByKey.set(key, holiday.id);
          }

          const yearKey = `${String(holiday.date).slice(0, 4)}|${normalizeSearchText(holiday.name)}`;
          const calendarDate = calendarByKey.get(yearKey);
          if (calendarDate && calendarDate !== holiday.date) {
            findings.dataDivergenteCalendario.push({ ...base, dataCalendario: calendarDate });
          }

          if (!worked.length) findings.semFuncionarioVinculado.push(base);
        }

        worked.forEach((item) => {
          if (!item) return;
          const employee = (data.employees || []).find((entry) => entry.id === item.employeeId);
          const who = { funcionarioId: item.employeeId || "", funcionario: employee?.name || "" };
          const resolved = resolveWorkedHolidayStatus(item, holiday.date, today);

          if (holiday.isDeleted && resolved.key !== "compensado") {
            findings.invisiveisParaCo.push({ ...base, ...who, status: resolved.label });
          }
          if (!item.employeeId || !employeeIds.has(item.employeeId)) {
            findings.vinculoOrfao.push({ ...base, ...who });
            return;
          }
          if (employee?.admissionDate && holiday.date < employee.admissionDate) {
            findings.anterioresAdmissao.push({ ...base, ...who, admissao: employee.admissionDate });
          }
          if (item.status && item.status !== resolved.label) {
            findings.statusDivergente.push({
              ...base,
              ...who,
              statusGravado: item.status,
              statusCalculado: resolved.label
            });
          }
          const hasAnyCompDate = Boolean(
            item.compensationDate || item.scheduledCoDate || item.scaleCoDate
          );
          if (resolved.key === "compensado" && !hasAnyCompDate) {
            findings.compensadoSemData.push({ ...base, ...who });
          }
        });
      });

      report.companies[company] = findings;
      report.totalIssues += Object.entries(findings)
        .filter(([name]) => name !== "semFuncionarioVinculado")
        .reduce((sum, [, list]) => sum + list.length, 0);
    });

    report.totalIssues += report.calendar.length;
    return report;
  }

  function findOldestLinkableHolidayWorked(data, employeeId, preferredHolidayId, coDate = "") {
    const pending = getPendingCoHolidaysForEmployee(employeeId, coDate, { data });

    if (preferredHolidayId) {
      const preferred = pending.find((entry) => entry.holiday.id === preferredHolidayId);
      if (preferred) return preferred;
    }

    return pending[0] || null;
  }

  function isCoDateAlreadyLinked(data, employeeId, coDate, excludeHolidayId = "") {
    return (data.holidays || []).some((holiday) => {
      if (holiday.isDeleted) return false;
      if (holiday.id === excludeHolidayId) return false;
      return (holiday.workedEmployees || []).some(
        (item) => item.employeeId === employeeId && item.linkedFromScale && item.scaleCoDate === coDate
      );
    });
  }

  function applyCoLinkToWorkedItem(holiday, item, coDate) {
    item.compensationDate = coDate;
    item.scheduledCoDate = coDate;
    item.scaleCoDate = coDate;
    item.linkedFromScale = true;
    item.linkedHolidayId = holiday.id;
    syncWorkedEmployeeStatus(item, holiday.date);
    const warning = isCompensationWithinDeadline(holiday.date, coDate)
      ? ""
      : `Compensação agendada fora do prazo de ${HOLIDAY_COMPENSATION_DAYS} dias.`;
    return {
      linked: true,
      holiday,
      item,
      warning,
      status: item.status
    };
  }

  function linkScaleCoToHoliday(employeeId, coDate, options = {}) {
    const company =
      options.company ||
      findEmployeeRecord(employeeId)?.company ||
      getPrimaryPageCompany("escala");
    const data = getCompanyData(company);
    normalizeWorkedEmployeeRefs(data);

    const preferredHolidayId = String(options.preferredHolidayId || "").trim();
    if (preferredHolidayId) {
      const holiday = (data.holidays || []).find((entry) => entry.id === preferredHolidayId);
      const item = holiday ? resolveWorkedEmployeeEntry(data, employeeId, holiday) : null;
      if (holiday && item) {
        if (
          item.linkedFromScale &&
          item.scaleCoDate === coDate &&
          item.linkedHolidayId === holiday.id
        ) {
          return applyCoLinkToWorkedItem(holiday, item, coDate);
        }
        if (isCoDateAlreadyLinked(data, employeeId, coDate, holiday.id)) {
          return { linked: false, message: "Esta data de CO já está vinculada a outro feriado." };
        }
        return applyCoLinkToWorkedItem(holiday, item, coDate);
      }
    }

    const target = findOldestLinkableHolidayWorked(data, employeeId, preferredHolidayId, coDate);

    if (!target) {
      return { linked: false, message: "Nenhum feriado trabalhado pendente encontrado para vincular ao CO." };
    }

    if (isCoDateAlreadyLinked(data, employeeId, coDate, target.holiday.id)) {
      return { linked: false, message: "Esta data de CO já está vinculada a outro feriado." };
    }

    return applyCoLinkToWorkedItem(target.holiday, target.item, coDate);
  }

  function unlinkScaleCoFromHoliday(employeeId, coDate, options = {}) {
    const company =
      options.company ||
      findEmployeeRecord(employeeId)?.company ||
      getPrimaryPageCompany("escala");
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

  function getHolidayStats(company) {
    const data = getCompanyData(company || getPrimaryPageCompany("feriados"));
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
        const emp = data.employees.find((e) => e.id === item.employeeId);
        if (emp && emp.admissionDate && holiday.date < emp.admissionDate) return;

        const resolved = resolveWorkedHolidayStatus(item, holiday.date, today);
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
    const resolvedCompany = resolveCompanyForEmployeeWrite(employeeId, company, "escala");
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
      if (!linkedHolidayId) {
        coWarning = "Selecione o feriado pendente deste funcionário.";
        delete data.manualScale[key];
        saveState();
        return { coWarning };
      }

      const result = linkScaleCoToHoliday(employeeId, date, {
        company: resolvedCompany,
        preferredHolidayId: linkedHolidayId
      });
      if (result.warning) coWarning = result.warning;
      if (!result.linked && result.message) coWarning = result.message;
      if (result.linked) {
        data.manualScale[key] = { code: "CO", linkedHolidayId: result.holiday.id };
      } else {
        delete data.manualScale[key];
      }
    }

    runScaleIntegrations([date.slice(0, 7)]);
    saveState();
    return { coWarning };
  }

  function setVtDeduction(employeeId, yearMonth, days, options = {}) {
    const company = resolveCompanyForEmployeeWrite(employeeId, options.company, "vale-transporte");
    const vt = ensureValeTransporteState();
    if (!vt.deductionDays[company]) vt.deductionDays[company] = {};
    const key = `${employeeId}|${yearMonth}`;
    const raw = String(days ?? "").trim();

    if (raw === "") {
      delete vt.deductionDays[company][key];
    } else {
      vt.deductionDays[company][key] = Math.max(0, parseInt(raw, 10) || 0);
    }

    if (options.save !== false) saveState();
  }

  function getVtDeduction(employeeId, yearMonth, data, company) {
    company = resolveVtCompany(company);
    const key = `${employeeId}|${yearMonth}`;
    const fromVt = ensureValeTransporteState().deductionDays?.[company]?.[key];
    if (fromVt === undefined || fromVt === null || fromVt === "") return 0;
    return Math.max(0, parseInt(fromVt, 10) || 0);
  }

  function getVtDeductionDisplay(employeeId, yearMonth, data, company) {
    company = resolveVtCompany(company);
    const key = `${employeeId}|${yearMonth}`;
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

  function findAbsenceForDate(employeeId, date, data) {
    return (data.absences || []).find(
      (item) => item.employeeId === employeeId && isBetween(date, item.startDate, item.endDate)
    );
  }

  function getManualScaleCodeValue(employeeId, date, data) {
    const key = `${employeeId}|${date}`;
    if (!Object.prototype.hasOwnProperty.call(data.manualScale, key)) return undefined;
    const manual = data.manualScale[key];
    return typeof manual === "object" ? manual.code : manual;
  }

  function getScaleAbsenceConflict(employee, date, data = getCompanyData()) {
    const absence = findAbsenceForDate(employee.id, date, data);
    if (!absence) return null;

    const manualCode = getManualScaleCodeValue(employee.id, date, data);
    if (manualCode === undefined) return null;

    const absenceCode = getAbsenceScaleCode(absence.type);
    if (manualCode === absenceCode) return null;

    return {
      employeeId: employee.id,
      employeeName: getEmployeeName(employee.id, data),
      date,
      absenceType: absence.type,
      absenceCode,
      manualCode
    };
  }

  /**
   * Fonte única de verdade: um código de escala conta como dia trabalhado?
   * Respeita state.scaleCodeConfig (override do usuário) e os defaults canônicos.
   * Usado por VT, Escala, Controle de Feriados e Dashboard para eliminar divergências.
   */
  function isWorkedScaleCode(code) {
    const normalized = String(code ?? "").trim();
    if (!normalized) return true;

    const config = state?.scaleCodeConfig;
    if (config && typeof config === "object") {
      if (config[normalized] === "not-worked") return false;
      if (config[normalized] === "worked") return true;
    }

    if (NOT_WORKED_SCALE_CODES.has(normalized)) return false;
    if (VT_WORKED_CODES.has(normalized)) return true;
    return false;
  }

  function isNotWorkedScaleCode(code) {
    return !isWorkedScaleCode(code);
  }

  function getScaleCode(employee, date, data = getCompanyData()) {
    const vacation = findVacationForDate(employee.id, date, data);
    if (vacation) return "FÉRIAS";

    const absence = findAbsenceForDate(employee.id, date, data);
    if (absence) return getAbsenceScaleCode(absence.type);

    const manual = getManualScaleCodeValue(employee.id, date, data);
    if (manual !== undefined) return manual;

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

    const fixedDayForDate = resolveFixedDayForDate(employee, date);
    if (fixedDayForDate && fixedDayForDate === weekdayName(date)) return "FOLGA";
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
    const fallbackCompany = options.fallbackCompany || getPrimaryPageCompany("funcionarios");
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
    const fallbackCompany = options.fallbackCompany || getPrimaryPageCompany("funcionarios");
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

      const dueDate = mapped.dueDate || getHolidayCompensationDueDate(workedDate);
      let compensationDate = String(mapped.compensationDate || "").trim();
      const statusText = String(mapped.status || "").toLocaleLowerCase("pt-BR");

      if (!compensationDate && (statusText.includes("compens") || statusText.includes("tirad"))) {
        compensationDate = dueDate;
      }

      if (compensationDate && !isCompensationWithinDeadline(workedDate, compensationDate)) {
        result.skipped += 1;
        result.messages.push(`Linha ${index + 1}: compensação fora do prazo de ${HOLIDAY_COMPENSATION_DAYS} dias.`);
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
    PAGE_COMPANY_ALL,
    PAGE_FILTER_KEYS,
    HOLIDAY_COMPENSATION_DAYS,
    ABSENCE_TYPE_SCALE_CODES,
    getCompanies,
    registerCompany,
    getPageCompany,
    setPageCompany,
    resolveCompaniesForPage,
    getPrimaryPageCompany,
    getActiveCompany,
    setActiveCompany,
    isPageCompanyAll,
    findEmployeeRecord,
    isEmployeeActive,
    mergeEmployeesById,
    mergeRecordsById,
    getHolidayCompensationDueDate,
    isCompensationWithinDeadline,
    getAbsenceScaleCode,
    isPadroeiraBuziosName,
    correctPadroeiraBuziosDate,
    migratePadroeiraBuziosHoliday,
    findAbsenceForDate,
    getScaleAbsenceConflict,
    getPendingCoHolidaysForEmployee,
    getAvailableHolidaysForCo,
    getAvailableCoHolidayOptions,
    isWorkedEntryVisibleInHistory,
    resolveWorkedEmployeeEntry,
    isWorkedHolidayPendingInFeriadosControl,
    reconcileCoCompensationLinks,
    normalizeVacations,
    buildScaleCoHolidayIndex,
    finalizeIncomingState,
    migrateVtStorage,
    WEEK_DAYS,
    SCALE_CODES,
    VT_WORKED_CODES,
    runScaleIntegrations,
    addDays,
    getNextMonthFirstDay,
    resolveFixedDayForDate,
    getFixedDayChangeInfo,
    formatDateBR,
    diffDays,
    getCompanyData,
    ensureCompanyDataShape,
    getDaysInMonth,
    getEmployeeName,
    compareEmployeeName,
    sortEmployeesByName,
    getScaleCode,
    isWorkedScaleCode,
    isNotWorkedScaleCode,
    NOT_WORKED_SCALE_CODES,
    resolveCompanyForEmployeeWrite,
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
    restoreHoliday,
    getActiveHolidays,
    findOrMergeDuplicateHolidays,
    deduplicateAllHolidays,
    dedupeCalendarHolidays,
    validatePadroeiraBuziosIntegrity,
    correctPadroeiraBuziosAutomatically,
    applyHolidaySeed2026,
    auditHolidayConsistency,
    updateHoliday,
    removeWorkedEmployeeFromHoliday,
    removeVacation,
    saveState,
    setManualScale,
    state,
    todayISO,
    updateCompanyInfo,
    updateCompanyLogo,
    diagnoseCompanyData,
    restoreCompanyInfoFromBackup,
    resolveCompanyCnpj,
    isMeaningfulCompanyInfo,
    COMPANY_CRITICAL_FIELDS,
    setRemoteState,
    mergeRemoteIntoLocal,
    readLocalStateSnapshot,
    measureStorageUsage,
    STORAGE_KEY,
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
    updateVacation,
    addAbsence,
    updateAbsence,
    removeAbsence,
    addHoliday,
    syncCompanyHolidaysFromCalendarEntry,
    syncAllCalendarHolidaysToCompanies,
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
