(function () {
  const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

  const COVERAGE_PRINCIPALS = [
    {
      nameKey: "catherina victoria de azeredo",
      displayName: "Catherina Victoria de Azeredo",
      coverageCode: "TR",
      aliases: ["catherina victoria azeredo", "catherina azeredo"]
    },
    {
      nameKey: "andre justo de barros",
      displayName: "André Justo de Barros",
      coverageCode: "TM",
      aliases: ["andre justo barros", "andre barros"]
    },
    {
      nameKey: "rosana santos de freitas",
      displayName: "Rosana Santos de Freitas",
      coverageCode: "MR",
      aliases: ["rosana santos freitas", "rosana freitas"]
    }
  ];

  const DEFAULT_NOT_WORKED = new Set([
    "FOLGA",
    "DOM",
    "FÉRIAS",
    "CO",
    "ATESTADO",
    "FALTA",
    "SUSPENSÃO",
    "LICENÇA"
  ]);

  const DEFAULT_WORKED_EXTRA = new Set(["TR", "TM", "MR", "MM", "MN", "TN", "NO", "NM", "NR"]);

  /** Férias e atestado não exigem cobertura TR/TM/MR */
  const COVERAGE_EXEMPT_CODES = new Set(["FÉRIAS", "ATESTADO"]);

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function formatDateBR(isoDate) {
    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
  }

  function getCodeConfig(state) {
    if (!state.scaleCodeConfig || typeof state.scaleCodeConfig !== "object") {
      state.scaleCodeConfig = {};
    }
    return state.scaleCodeConfig;
  }

  function isScaleCodeWorked(code, state) {
    const normalized = String(code ?? "").trim();
    if (!normalized) return true;

    const config = getCodeConfig(state);
    if (config[normalized] === "not-worked") return false;
    if (config[normalized] === "worked") return true;

    if (DEFAULT_NOT_WORKED.has(normalized)) return false;
    if (AppData.VT_WORKED_CODES.has(normalized) || DEFAULT_WORKED_EXTRA.has(normalized)) return true;

    return false;
  }

  function isScaleCodeNotWorked(code, state) {
    const normalized = String(code ?? "").trim();
    if (!normalized) return false;
    return !isScaleCodeWorked(normalized, state);
  }

  function requiresCoverageSubstitution(code, state) {
    const normalized = String(code ?? "").trim();
    if (!normalized) return false;
    if (COVERAGE_EXEMPT_CODES.has(normalized)) return false;
    return isScaleCodeNotWorked(normalized, state);
  }

  function situationLabel(code) {
    if (!code) return "dia trabalhado normal";
    if (code === "FOLGA") return "FOLGA";
    if (code === "DOM") return "D";
    return code;
  }

  function isEmployeeActive(employee) {
    return String(employee?.status || "").trim().toLocaleLowerCase("pt-BR") !== "inativo";
  }

  function nameTokens(nameKey) {
    return normalizeName(nameKey)
      .split(/\s+/)
      .filter((token) => token && !NAME_PARTICLES.has(token));
  }

  function scoreNameMatch(employeeName, nameKey) {
    const normalizedEmployee = normalizeName(employeeName);
    const normalizedKey = normalizeName(nameKey);
    if (!normalizedEmployee || !normalizedKey) return 0;
    if (normalizedEmployee === normalizedKey) return 100;

    const tokens = nameTokens(nameKey);
    if (!tokens.length) return 0;

    const matched = tokens.filter((token) => normalizedEmployee.includes(token)).length;
    if (matched === tokens.length) return 95;

    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (tokens.length >= 2 && normalizedEmployee.includes(first) && normalizedEmployee.includes(last)) {
      return 80;
    }

    return Math.round((matched / tokens.length) * 70);
  }

  function ensureBindings(state) {
    if (!state.coveragePrincipalBindings || typeof state.coveragePrincipalBindings !== "object") {
      state.coveragePrincipalBindings = {};
    }
    return state.coveragePrincipalBindings;
  }

  function savePrincipalBinding(state, principal, found) {
    const bindings = ensureBindings(state);
    bindings[principal.nameKey] = {
      employeeId: found.employee.id,
      company: found.company,
      matchedName: found.employee.name,
      updatedAt: Date.now()
    };
  }

  function findPrincipalAcrossCompanies(principal, state) {
    const bindings = ensureBindings(state);
    const saved = bindings[principal.nameKey];
    if (saved?.employeeId && saved?.company) {
      const data = AppData.getCompanyData(saved.company);
      const employee = (data.employees || []).find((item) => item.id === saved.employeeId);
      if (employee) {
        return { employee, company: saved.company, matchType: "vinculo" };
      }
    }

    const keysToTry = [principal.nameKey].concat(principal.aliases || []);
    let best = null;

    AppData.COMPANIES.forEach((company) => {
      const data = AppData.getCompanyData(company);
      (data.employees || []).forEach((employee) => {
        keysToTry.forEach((nameKey) => {
          const score = scoreNameMatch(employee.name, nameKey);
          if (!best || score > best.score || (score === best.score && isEmployeeActive(employee) && !isEmployeeActive(best.employee))) {
            best = { employee, company, score, nameKey };
          }
        });
      });
    });

    if (!best || best.score < 60) return null;

    savePrincipalBinding(state, principal, best);
    return {
      employee: best.employee,
      company: best.company,
      matchType: best.score >= 95 ? "exato" : "aproximado",
      score: best.score
    };
  }

  function getCoveragePrincipalStatus(state) {
    return COVERAGE_PRINCIPALS.map((principal) => {
      const found = findPrincipalAcrossCompanies(principal, state);
      return {
        displayName: principal.displayName,
        coverageCode: principal.coverageCode,
        found: Boolean(found),
        matchedName: found?.employee?.name || "",
        company: found?.company || "",
        matchType: found?.matchType || "",
        active: found ? isEmployeeActive(found.employee) : false
      };
    });
  }

  function anyoneHasCoverageOnDate(date, coverageCode) {
    return AppData.COMPANIES.some((company) => {
      const data = AppData.getCompanyData(company);
      return (data.employees || [])
        .filter((employee) => isEmployeeActive(employee))
        .some((employee) => AppData.getScaleCode(employee, date, data) === coverageCode);
    });
  }

  function computeCoverageAlertsForMonth(yearMonth, state) {
    const days = AppData.getDaysInMonth(yearMonth);
    const alerts = [];

    COVERAGE_PRINCIPALS.forEach((principal) => {
      const found = findPrincipalAcrossCompanies(principal, state);
      if (!found) return;

      const { employee, company } = found;
      const data = AppData.getCompanyData(company);

      days.forEach((date) => {
        const code = AppData.getScaleCode(employee, date, data);
        if (!requiresCoverageSubstitution(code, state)) return;
        if (anyoneHasCoverageOnDate(date, principal.coverageCode)) return;

        alerts.push({
          id: `${principal.nameKey}|${date}`,
          date,
          yearMonth,
          principalName: found.employee.name || principal.displayName,
          principalEmployeeId: employee.id,
          principalCompany: company,
          situation: situationLabel(code),
          coverageCode: principal.coverageCode,
          message: `${formatDateBR(date)} — ${principal.displayName} está de ${situationLabel(code)} e não há nenhum funcionário marcado com ${principal.coverageCode}.`
        });
      });
    });

    return alerts;
  }

  function getCalendarHolidaysOnDate(date, company, state) {
    const list = [];
    (state.calendarHolidays || []).forEach((holiday) => {
      if (holiday.date !== date) return;
      const companies = holiday.companies || [];
      if (
        !companies.length ||
        companies.includes("ambas") ||
        companies.includes(company)
      ) {
        list.push(holiday);
      }
    });

    const data = AppData.getCompanyData(company);
    (data.holidays || []).forEach((holiday) => {
      if (holiday.date !== date) return;
      if (list.some((item) => item.id === holiday.id)) return;
      list.push({
        id: holiday.id,
        date: holiday.date,
        name: holiday.name,
        source: "feriados"
      });
    });

    return list;
  }

  function holidayWorkedExists(data, employeeId, date) {
    return (data.holidays || []).some(
      (holiday) =>
        holiday.date === date &&
        (holiday.workedEmployees || []).some((item) => item.employeeId === employeeId)
    );
  }

  function syncAutoHolidaysWorkedForMonth(yearMonth, state) {
    let created = 0;

    AppData.COMPANIES.forEach((company) => {
      const data = AppData.getCompanyData(company);
      const days = AppData.getDaysInMonth(yearMonth);

      (data.employees || [])
        .filter((employee) => isEmployeeActive(employee))
        .forEach((employee) => {
          days.forEach((date) => {
            const code = AppData.getScaleCode(employee, date, data);
            if (!isScaleCodeWorked(code, state)) return;

            const holidaysOnDay = getCalendarHolidaysOnDate(date, company, state);
            if (!holidaysOnDay.length) return;
            if (holidayWorkedExists(data, employee.id, date)) return;

            const calendarHoliday = holidaysOnDay[0];
            let holidayRecord = data.holidays.find(
              (item) =>
                item.date === date &&
                normalizeName(item.name) === normalizeName(calendarHoliday.name)
            );

            if (!holidayRecord) {
              holidayRecord = {
                id: `feriado-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                name: calendarHoliday.name,
                date,
                workedEmployees: []
              };
              data.holidays.push(holidayRecord);
            }

            const autoItem = {
              employeeId: employee.id,
              compensationDate: "",
              note: "",
              origin: "Automático pela escala",
              autoCreated: true,
              role: employee.role || "",
              department: employee.department || "",
              company
            };
            AppData.syncWorkedEmployeeStatus(autoItem, holidayRecord.date);
            holidayRecord.workedEmployees.push(autoItem);
            created += 1;
          });
        });
    });

    return created;
  }

  function recomputeScaleIntegrations(yearMonths) {
    const state = AppData.state;
    const months = [...new Set((yearMonths || []).filter(Boolean))];
    if (!months.length) months.push(AppData.monthKey());

    const allAlerts = (state.coverageAlerts || []).filter(
      (alert) => !months.includes(alert.yearMonth)
    );
    let created = 0;

    months.forEach((yearMonth) => {
      allAlerts.push(...computeCoverageAlertsForMonth(yearMonth, state));
      created += syncAutoHolidaysWorkedForMonth(yearMonth, state);
    });

    state.coverageAlerts = allAlerts;
    return {
      alerts: allAlerts.filter((alert) => months.includes(alert.yearMonth)),
      months,
      created
    };
  }

  function getCoverageAlertsForMonth(yearMonth) {
    return (AppData.state.coverageAlerts || []).filter((alert) => alert.yearMonth === yearMonth);
  }

  function getCoverageAlertCount() {
    return (AppData.state.coverageAlerts || []).length;
  }

  function countAutoPendingHolidays(company) {
    const data = AppData.getCompanyData(company);
    return (data.holidays || []).reduce((total, holiday) => {
      return (
        total +
        (holiday.workedEmployees || []).filter(
          (item) => item.autoCreated && !item.compensationDate
        ).length
      );
    }, 0);
  }

  function countAutoPendingHolidaysAllCompanies() {
    return AppData.COMPANIES.reduce(
      (sum, company) => sum + countAutoPendingHolidays(company),
      0
    );
  }

  function getHolidayDatesForCompany(company, state) {
    const dates = new Set();
    (state.calendarHolidays || []).forEach((holiday) => {
      const companies = holiday.companies || [];
      if (
        !companies.length ||
        companies.includes("ambas") ||
        companies.includes(company)
      ) {
        dates.add(holiday.date);
      }
    });
    (AppData.getCompanyData(company).holidays || []).forEach((holiday) => dates.add(holiday.date));
    return dates;
  }

  function addCalendarHoliday(holiday) {
    const state = AppData.state;
    if (!state.calendarHolidays) state.calendarHolidays = [];
    state.calendarHolidays.push({
      id: `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      date: holiday.date,
      name: String(holiday.name || "").trim(),
      type: holiday.type || "nacional",
      companies: holiday.companies || []
    });
    AppData.saveState();
  }

  function removeCalendarHoliday(id) {
    const state = AppData.state;
    state.calendarHolidays = (state.calendarHolidays || []).filter((item) => item.id !== id);
    AppData.saveState();
  }

  window.ScaleRules = {
    COVERAGE_PRINCIPALS,
    isScaleCodeWorked,
    isScaleCodeNotWorked,
    requiresCoverageSubstitution,
    getCoveragePrincipalStatus,
    computeCoverageAlertsForMonth,
    recomputeScaleIntegrations,
    getCoverageAlertsForMonth,
    getCoverageAlertCount,
    countAutoPendingHolidays,
    countAutoPendingHolidaysAllCompanies,
    getHolidayDatesForCompany,
    addCalendarHoliday,
    removeCalendarHoliday,
    getCalendarHolidaysOnDate,
    formatDateBR,
    situationLabel
  };
})();
