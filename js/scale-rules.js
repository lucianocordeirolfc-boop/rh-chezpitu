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
    return AppData.formatDateBR(isoDate);
  }

  function getCodeConfig(state) {
    if (!state.scaleCodeConfig || typeof state.scaleCodeConfig !== "object") {
      state.scaleCodeConfig = {};
    }
    return state.scaleCodeConfig;
  }

  // Fonte única de verdade: delega para AppData.isWorkedScaleCode (mesmo state.scaleCodeConfig).
  // O parâmetro `state` é mantido por compatibilidade de assinatura.
  function isScaleCodeWorked(code, state) {
    if (typeof AppData.isWorkedScaleCode === "function") {
      return AppData.isWorkedScaleCode(code);
    }
    // Fallback defensivo (não deve ocorrer: data.js carrega antes de scale-rules.js).
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
    if (typeof AppData.isNotWorkedScaleCode === "function") {
      return AppData.isNotWorkedScaleCode(code);
    }
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
    return AppData.isEmployeeActive(employee);
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

  function computeCoverageAlertsForMonth(yearMonth, state, options = {}) {
    const days = AppData.getDaysInMonth(yearMonth);
    const alerts = [];
    const allowedCompanies = options.companies?.length ? new Set(options.companies) : null;

    COVERAGE_PRINCIPALS.forEach((principal) => {
      const found = findPrincipalAcrossCompanies(principal, state);
      if (!found) return;

      const { employee, company } = found;
      if (allowedCompanies && !allowedCompanies.has(company)) return;
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

  /**
   * O mês/empresa tem escala REALMENTE preenchida?
   * Considera-se "com escala" quando existe ao menos um lançamento manual de
   * escala (manualScale) com código não vazio dentro do mês, OU férias/ausência
   * que toquem o mês.
   *
   * Motivo: em getScaleCode, dia sem código retorna "" e "" conta como
   * trabalhado. Sem esta trava, abrir um mês retroativo SEM escala (jan/fev/mar)
   * auto-vincularia TODOS os funcionários ativos a TODOS os feriados do mês.
   * Meses já operados (abril/maio/junho) têm folgas/códigos lançados e seguem
   * com auto-vínculo normal. Feriado trabalhado de dia vazio nesses meses
   * continua sendo auto-vinculado, pois o mês como um todo tem escala.
   */
  function monthHasScaleData(yearMonth, data) {
    const ym = String(yearMonth || "");
    if (!ym) return false;

    const manual = data.manualScale || {};
    for (const key of Object.keys(manual)) {
      const datePart = String(key).split("|")[1] || "";
      if (!datePart.startsWith(`${ym}-`)) continue;
      const entry = manual[key];
      const code = entry && typeof entry === "object" ? entry.code : entry;
      if (String(code || "").trim()) return true;
    }

    const touchesMonth = (start, end) => {
      const s = String(start || "").slice(0, 7);
      const e = String(end || start || "").slice(0, 7);
      return (s && s <= ym && ym <= (e || s)) || s === ym || e === ym;
    };
    if ((data.vacations || []).some((v) => touchesMonth(v.startDate, v.endDate))) return true;
    if ((data.absences || []).some((a) => touchesMonth(a.startDate, a.endDate))) return true;

    return false;
  }

  function syncAutoHolidaysWorkedForMonth(yearMonth, state, options = {}) {
    let created = 0;
    const targetCompanies = options.companies?.length ? options.companies : AppData.COMPANIES;

    targetCompanies.forEach((company) => {
      const data = AppData.getCompanyData(company);
      const days = AppData.getDaysInMonth(yearMonth);

      // Trava: não auto-vincular feriado em meses sem escala preenchida.
      if (!monthHasScaleData(yearMonth, data)) return;

      (data.employees || [])
        .filter((employee) => isEmployeeActive(employee))
        .forEach((employee) => {
          days.forEach((date) => {
            const code = AppData.getScaleCode(employee, date, data);
            if (!isScaleCodeWorked(code, state)) return;

            const holidaysOnDay = getCalendarHolidaysOnDate(date, company, state);
            if (!holidaysOnDay.length) return;

            // CORREÇÃO: Iterar por CADA feriado no dia (pode haver múltiplos)
            holidaysOnDay.forEach((calendarHoliday) => {
              // Feriado excluído DEFINITIVAMENTE pelo usuário: o auto-vínculo não
              // recria nem o feriado nem o vínculo (respeita o tombstone de feriado).
              if (
                typeof AppData.isHolidayTombstoned === "function" &&
                AppData.isHolidayTombstoned(company, date, calendarHoliday.name)
              ) {
                return;
              }

              // Vínculo deste funcionário excluído DEFINITIVAMENTE: não recriar.
              if (
                typeof AppData.isWorkedLinkTombstoned === "function" &&
                AppData.isWorkedLinkTombstoned(company, date, calendarHoliday.name, employee.id)
              ) {
                return;
              }

              // Procurar feriado existente por data + nome
              let holidayRecord = data.holidays.find(
                (item) =>
                  item.date === date &&
                  normalizeName(item.name) === normalizeName(calendarHoliday.name)
              );

              // Se não existe, criar novo registro
              if (!holidayRecord) {
                holidayRecord = {
                  id: `feriado-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                  name: calendarHoliday.name,
                  date,
                  workedEmployees: []
                };
                data.holidays.push(holidayRecord);
              }

              // CORREÇÃO: Verificar se ESTE FUNCIONÁRIO já existe NESTE FERIADO específico
              const employeeAlreadyExists = (holidayRecord.workedEmployees || []).some(
                (item) => item.employeeId === employee.id
              );
              if (employeeAlreadyExists) return; // Não duplicar

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
    });

    return created;
  }

  function recomputeScaleIntegrations(yearMonths, options = {}) {
    const state = AppData.state;
    const months = [...new Set((yearMonths || []).filter(Boolean))];
    if (!months.length) months.push(AppData.monthKey());
    const companyScope = options.companies?.length ? new Set(options.companies) : null;

    let allAlerts = [...(state.coverageAlerts || [])];
    let created = 0;

    months.forEach((yearMonth) => {
      if (companyScope) {
        allAlerts = allAlerts.filter(
          (alert) => !(alert.yearMonth === yearMonth && companyScope.has(alert.principalCompany))
        );
        allAlerts.push(...computeCoverageAlertsForMonth(yearMonth, state, options));
        created += syncAutoHolidaysWorkedForMonth(yearMonth, state, options);
      } else {
        allAlerts = allAlerts.filter((alert) => alert.yearMonth !== yearMonth);
        allAlerts.push(...computeCoverageAlertsForMonth(yearMonth, state));
        created += syncAutoHolidaysWorkedForMonth(yearMonth, state);
      }
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
    const name = String(holiday.name || "").trim();
    let date = String(holiday.date || "").trim();
    if (AppData.isPadroeiraBuziosName(name)) date = AppData.correctPadroeiraBuziosDate(date);
    state.calendarHolidays.push({
      id: `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      name,
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

  function updateCalendarHoliday(id, patch = {}) {
    const state = AppData.state;
    const holiday = (state.calendarHolidays || []).find((item) => item.id === id);
    if (!holiday) return false;
    if (patch.name !== undefined) holiday.name = String(patch.name || "").trim();
    if (patch.type !== undefined) holiday.type = patch.type || holiday.type || "nacional";
    if (patch.date !== undefined) {
      let date = String(patch.date || "").trim();
      if (AppData.isPadroeiraBuziosName(holiday.name)) date = AppData.correctPadroeiraBuziosDate(date);
      holiday.date = date;
    }
    if (Array.isArray(patch.companies)) holiday.companies = patch.companies;
    AppData.saveState();
    return true;
  }

  window.ScaleRules = {
    COVERAGE_PRINCIPALS,
    isScaleCodeWorked,
    isScaleCodeNotWorked,
    requiresCoverageSubstitution,
    getCoveragePrincipalStatus,
    computeCoverageAlertsForMonth,
    monthHasScaleData,
    recomputeScaleIntegrations,
    getCoverageAlertsForMonth,
    getCoverageAlertCount,
    countAutoPendingHolidays,
    countAutoPendingHolidaysAllCompanies,
    getHolidayDatesForCompany,
    addCalendarHoliday,
    updateCalendarHoliday,
    removeCalendarHoliday,
    getCalendarHolidaysOnDate,
    formatDateBR,
    situationLabel
  };
})();
