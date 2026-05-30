(function () {
  const MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];

  const SCALE_DEBUG = false;

  function scaleLog(...args) {
    if (SCALE_DEBUG) console.log("[Escala]", ...args);
  }

  const scaleState = {
    viewCompany: AppData.getPrimaryPageCompany("escala"),
    yearMonth: AppData.getEscalaSelectedYearMonth(),
    department: "todos",
    search: "",
    previewVisible: false,
    printSector: "",
    printMonthYear: "",
    printIssueDate: AppData.todayISO(),
    printNotes: ""
  };

  let renderLock = false;
  let pendingRender = false;
  let companySaveTimer = null;
  let monthIntegrationTimer = null;
  let syncRefreshTimer = null;
  let lastCompanySwitchAt = 0;

  function getViewCompany() {
    const company = AppData.getPageCompany("escala");
    if (AppData.isPageCompanyAll(company)) {
      return AppData.getCompanies()[0] || AppData.COMPANIES[0];
    }
    scaleState.viewCompany = company;
    return company;
  }

  function setViewCompany(company) {
    if (!AppData.state.companies[company]) return;
    scaleLog("setViewCompany", company);
    scaleState.viewCompany = company;
    AppData.setPageCompany("escala", company);
  }

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function displayName(name) {
    return esc(window.App?.formatDisplayName(name) || name || "");
  }

  function codeClass(code) {
    return code ? `code-${code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}` : "code-work";
  }

  function displayCode(code) {
    if (code === "FOLGA") return "F";
    if (code === "DOM") return "D";
    return code;
  }

  function splitYearMonth(yearMonth) {
    const [year, month] = yearMonth.split("-").map(Number);
    return { year, month };
  }

  function getYearMonth(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function previousMonth(yearMonth) {
    const { year, month } = splitYearMonth(yearMonth);
    const date = new Date(year, month - 2, 1);
    return AppData.monthKey(date);
  }

  function formatMonthYear(yearMonth) {
    const { year, month } = splitYearMonth(yearMonth);
    return `${MONTHS[month - 1]} / ${year}`;
  }

  function weekdayInitial(isoDate) {
    return AppData.weekdayName(isoDate).charAt(0);
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function monthOptions(selectedMonth) {
    return MONTHS.map((month, index) => {
      const value = index + 1;
      return `<option value="${value}" ${value === selectedMonth ? "selected" : ""}>${month}</option>`;
    }).join("");
  }

  function yearOptions(selectedYear) {
    const years = [];
    for (let year = selectedYear - 2; year <= selectedYear + 3; year += 1) {
      years.push(`<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}</option>`);
    }
    return years.join("");
  }

  function departmentOptions(data, selected) {
    const departments = [...new Set(data.employees.map((employee) => employee.department).filter(Boolean))].sort();
    const options = [`<option value="todos">Todos os setores</option>`].concat(
      departments.map((department) => `<option value="${esc(department)}" ${department === selected ? "selected" : ""}>${esc(department)}</option>`)
    );
    return options.join("");
  }

  function codeOptions(selectedCode, isManual) {
    const automaticOption = `<option value="__AUTO__" ${isManual ? "" : "selected"}>Automático</option>`;
    return [automaticOption].concat(
      AppData.SCALE_CODES.map((item) => `<option value="${item.code}" ${isManual && item.code === selectedCode ? "selected" : ""}>${item.code || "Em branco"}</option>`)
    ).join("");
  }

  function getManualCode(employeeId, date, data) {
    const entry = AppData.getManualScaleEntry(employeeId, date, data);
    if (entry === undefined) return undefined;
    return typeof entry === "object" ? entry.code : entry;
  }

  function getLinkedHolidayName(employeeId, date, data) {
    const entry = AppData.getManualScaleEntry(employeeId, date, data);
    if (!entry || typeof entry !== "object" || !entry.linkedHolidayId) return null;
    const holiday = (data.holidays || []).find((h) => h.id === entry.linkedHolidayId);
    return holiday ? (holiday.name || holiday.date) : null;
  }

  function getScaleCell(employee, date, data) {
    const finalCode = AppData.getScaleCode(employee, date, data);
    const manualCode = getManualCode(employee.id, date, data);
    const absenceConflict = AppData.getScaleAbsenceConflict(employee, date, data);
    const isManual = manualCode !== undefined && !absenceConflict && finalCode !== "FÉRIAS";
    const linkedHolidayName = finalCode === "CO" ? getLinkedHolidayName(employee.id, date, data) : null;

    return {
      finalCode,
      isManual,
      absenceConflict,
      linkedHolidayName,
      receivesVT: AppData.VT_WORKED_CODES.has(finalCode)
    };
  }

  function isActiveEmployee(employee) {
    return AppData.isEmployeeActive(employee);
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getScaleDataForEmployee(employee, fallbackData) {
    return employee._scaleCompany ? AppData.getCompanyData(employee._scaleCompany) : fallbackData;
  }

  function getPrincipalEmployeesExtra() {
    if (!window.ScaleRules?.COVERAGE_PRINCIPALS) return [];

    const rows = [];
    const seen = new Set();
    const bindings = AppData.state.coveragePrincipalBindings || {};

    window.ScaleRules.COVERAGE_PRINCIPALS.forEach((principal) => {
      const binding = bindings[principal.nameKey];
      if (!binding?.employeeId || !binding?.company) return;

      const companyData = AppData.getCompanyData(binding.company);
      const employee = companyData.employees.find((entry) => entry.id === binding.employeeId);
      if (!employee || !isActiveEmployee(employee) || seen.has(`${binding.company}|${employee.id}`)) return;

      seen.add(`${binding.company}|${employee.id}`);
      rows.push({
        ...employee,
        _scaleCompany: binding.company,
        _isCoveragePrincipal: true
      });
    });

    return rows;
  }

  function getFilteredEmployees(data) {
    const search = normalizeSearch(scaleState.search);

    const rows = (data.employees || [])
      .filter((employee) => isActiveEmployee(employee))
      .filter((employee) => scaleState.department === "todos" || employee.department === scaleState.department)
      .filter((employee) => {
        if (!search) return true;
        return [employee.name, employee.role, employee.department].some((field) => normalizeSearch(field).includes(search));
      })
      .map((employee) => ({ ...employee, _scaleCompany: getViewCompany() }));

    getPrincipalEmployeesExtra().forEach((employee) => {
      if (employee._scaleCompany !== getViewCompany()) return;

      const matchesDepartment =
        scaleState.department === "todos" || employee.department === scaleState.department;
      const matchesSearch =
        !search ||
        [employee.name, employee.role, employee.department].some((field) => normalizeSearch(field).includes(search));

      if (!matchesDepartment || !matchesSearch) return;
      if (rows.some((item) => item.id === employee.id && item._scaleCompany === employee._scaleCompany)) return;
      rows.push(employee);
    });

    return AppData.sortEmployeesByName(rows);
  }

  function ensureValidDepartment(data) {
    if (scaleState.department === "todos") return;
    const exists = (data.employees || []).some((employee) => employee.department === scaleState.department);
    if (!exists) scaleState.department = "todos";
  }

  function getScaleStats(employees, days, data) {
    return employees.reduce((stats, employee) => {
      const employeeData = getScaleDataForEmployee(employee, data);
      days.forEach((day) => {
        const code = AppData.getScaleCode(employee, day, employeeData);
        if (code === "FOLGA" || code === "DOM") stats.daysOff += 1;
        if (code === "FÉRIAS") stats.vacations += 1;
        if (code === "CO") stats.compensations += 1;
        if (AppData.VT_WORKED_CODES.has(code)) stats.vtDays += 1;
      });
      return stats;
    }, { daysOff: 0, vacations: 0, compensations: 0, vtDays: 0 });
  }

  function getHolidayDates(data) {
    if (window.ScaleRules?.getHolidayDatesForCompany) {
      return ScaleRules.getHolidayDatesForCompany(getViewCompany(), AppData.state);
    }
    return new Set(data.holidays.map((holiday) => holiday.date));
  }

  function filterAlertsForSelectedCompany(alerts) {
    const company = getViewCompany();
    return (alerts || []).filter((alert) => alert.principalCompany === company);
  }

  /** Somente leitura — nunca recalcula nem salva ao trocar empresa. */
  function getAlertsForView() {
    try {
      const month = scaleState.yearMonth;
      if (!window.ScaleRules?.getCoverageAlertsForMonth) return [];
      return filterAlertsForSelectedCompany(window.ScaleRules.getCoverageAlertsForMonth(month) || []);
    } catch (error) {
      console.error("[Escala] Erro ao ler alertas:", error);
      return [];
    }
  }

  /** Recálculo pesado apenas ao mudar mês/ano (debounced). */
  function scheduleMonthIntegrations(month) {
    window.clearTimeout(monthIntegrationTimer);
    monthIntegrationTimer = window.setTimeout(() => {
      try {
        const company = getViewCompany();
        scaleLog("scheduleMonthIntegrations", month, company);
        AppData.runScaleIntegrations([month], { companies: [company], save: true });
      } catch (error) {
        console.error("[Escala] Erro ao recalcular integrações do mês:", error);
      }
    }, 400);
  }

  function buildAlertLookups(alerts) {
    const alertDays = new Set(alerts.map((alert) => alert.date));
    const alertCells = new Set(
      alerts.map((alert) => `${alert.principalEmployeeId}|${alert.date}`)
    );
    return { alertDays, alertCells };
  }

  function renderCoverageSetupStatus() {
    if (!window.ScaleRules?.getCoveragePrincipalStatus) {
      return `<p class="scale-coverage-error">Regras TR/TM/MR não carregadas. Use Ctrl+F5 para atualizar.</p>`;
    }

    let statusList = [];
    try {
      statusList = window.ScaleRules.getCoveragePrincipalStatus(AppData.state) || [];
    } catch (error) {
      return `<p class="scale-coverage-error">Erro ao verificar funcionários principais: ${esc(error.message)}</p>`;
    }
    const missing = statusList.filter((item) => !item.found);
    const inactive = statusList.filter((item) => item.found && !item.active);

    if (!missing.length && !inactive.length) {
      return `
        <ul class="scale-coverage-setup scale-coverage-setup-ok">
          ${statusList
            .map(
              (item) =>
                `<li><strong>${esc(item.displayName)}</strong> → ${esc(item.matchedName)} (${esc(item.company)}) · cobertura <strong>${item.coverageCode}</strong></li>`
            )
            .join("")}
        </ul>
      `;
    }

    return `
      <div class="scale-coverage-setup scale-coverage-setup-warn">
        ${missing.length ? `<p><strong>Atenção:</strong> não foi possível localizar no cadastro ativo: ${missing.map((item) => esc(item.displayName)).join(", ")}. Os alertas TR/TM/MR dependem desses nomes no cadastro de funcionários (Chez Pitu ou Pengold).</p>` : ""}
        ${inactive.length ? `<p><strong>Atenção:</strong> funcionário principal inativo: ${inactive.map((item) => esc(item.matchedName)).join(", ")}.</p>` : ""}
        <ul>
          ${statusList
            .map((item) => {
              if (!item.found) {
                return `<li class="missing-principal">${esc(item.displayName)} — <em>não encontrado</em> (exige ${item.coverageCode})</li>`;
              }
              return `<li>${esc(item.displayName)} → ${esc(item.matchedName)} (${esc(item.company)}) · ${item.coverageCode}</li>`;
            })
            .join("")}
        </ul>
      </div>
    `;
  }

  function collectAbsenceConflicts(data, employees, days) {
    const conflicts = [];
    employees.forEach((employee) => {
      const employeeData = getScaleDataForEmployee(employee, data);
      days.forEach((day) => {
        const conflict = AppData.getScaleAbsenceConflict(employee, day, employeeData);
        if (conflict) conflicts.push(conflict);
      });
    });
    return conflicts;
  }

  function renderAbsenceConflictAlerts(conflicts) {
    const list = Array.isArray(conflicts) ? conflicts : [];
    if (!list.length) return "";

    return `
      <section id="scaleAbsenceConflictPanel" class="scale-coverage-alerts scale-absence-conflicts scale-coverage-has-alerts" role="region" aria-label="Conflitos ausência e escala manual">
        <h3>Conflitos ausência × escala manual <span class="coverage-alert-count">${list.length} alerta${list.length === 1 ? "" : "s"}</span></h3>
        <p class="help-text compact-help">Ausência cadastrada prevalece no VT. Remova o código manual ou ajuste a ausência para eliminar o conflito.</p>
        <ul class="scale-coverage-list">
          ${list
            .map(
              (item) =>
                `<li>${esc(displayName(item.employeeName))} — ${esc(AppData.formatDateBR(item.date))}: ausência <strong>${esc(item.absenceCode)}</strong> (${esc(item.absenceType)}) conflita com manual <strong>${esc(displayCode(item.manualCode))}</strong>. VT usa a ausência.</li>`
            )
            .join("")}
        </ul>
      </section>
    `;
  }

  function renderCoverageAlerts(alerts) {
    const list = Array.isArray(alerts) ? alerts : [];
    const setupBlock = renderCoverageSetupStatus();
    const rulesReady = Boolean(window.ScaleRules?.recomputeScaleIntegrations);
    const rulesWarning = rulesReady
      ? ""
      : `<p class="scale-coverage-error"><strong>Erro:</strong> regras de cobertura não carregaram. Pressione Ctrl+F5 para atualizar a página.</p>`;

    if (!list.length) {
      return `
        <section id="scaleCoveragePanel" class="scale-coverage-alerts scale-coverage-ok" role="region" aria-label="Alertas de cobertura">
          <h3>Alertas de cobertura <span class="coverage-alert-count">0 alertas</span></h3>
          ${rulesWarning}
          ${setupBlock}
          <p class="help-text compact-help">Nenhuma pendência de cobertura TR, TM ou MR neste mês. Regras: Catherina (TR), André (TM), Rosana (MR). Não se aplica a férias nem atestado.</p>
        </section>
      `;
    }

    return `
      <section id="scaleCoveragePanel" class="scale-coverage-alerts scale-coverage-has-alerts" role="region" aria-label="Alertas de cobertura">
        <h3>Alertas de cobertura <span class="coverage-alert-count">${list.length} alerta${list.length === 1 ? "" : "s"}</span></h3>
        ${rulesWarning}
        ${setupBlock}
        <ul class="scale-coverage-list">
          ${list.map((alert) => `<li>${esc(alert.message)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function syncPrintDefaults(data) {
    const selectedSector = scaleState.department === "todos" ? "" : scaleState.department;
    if (!scaleState.printSector && selectedSector) scaleState.printSector = selectedSector;
    if (!scaleState.printMonthYear) scaleState.printMonthYear = formatMonthYear(scaleState.yearMonth);

    if (scaleState.department !== "todos" && !data.employees.some((employee) => employee.department === scaleState.department)) {
      scaleState.printSector = selectedSector;
    } else if (scaleState.department === "todos") {
      scaleState.printSector = "";
    } else {
      scaleState.printSector = scaleState.department;
    }
  }

  function getPrintCompanyInfo(data) {
    const info = data.companyInfo || {};
    return {
      legalName: info.legalName || getViewCompany(),
      cnpj: info.cnpj || "",
      responsibleName: info.responsibleName || "",
      logoDataUrl: info.logoDataUrl || ""
    };
  }

  function companyClass() {
    const name = getViewCompany() || "";
    return "scale-company-" + name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  function renderLegend() {
    return AppData.SCALE_CODES.map((item) => `
      <span class="legend-item ${codeClass(item.code)}">
        <strong>${item.code || "Em branco"}</strong> ${item.label}
      </span>
    `).join("");
  }

  function groupEmployeesByDepartment(employees) {
    const groups = new Map();
    employees.forEach((employee) => {
      const department = employee.department?.trim() || "Sem setor";
      if (!groups.has(department)) groups.set(department, []);
      groups.get(department).push(employee);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }

  function renderToolbar(data) {
    const { year, month } = splitYearMonth(scaleState.yearMonth);

    return `
      <div class="scale-toolbar scale-toolbar-compact">
        ${window.CompanyUI?.renderToolbar?.("escala") || ""}
        <label>Mês
          <select id="scaleMonth">${monthOptions(month)}</select>
        </label>
        <label>Ano
          <select id="scaleYear">${yearOptions(year)}</select>
        </label>
        <label>Setor
          <select id="scaleDepartment">${departmentOptions(data, scaleState.department)}</select>
        </label>
        <label class="scale-search">Buscar funcionário
          <input id="scaleSearch" type="search" value="${esc(scaleState.search)}" placeholder="Nome, cargo ou setor">
        </label>
      </div>
      <div class="scale-actions scale-actions-compact">
        <button id="copyPreviousScale" class="secondary btn-sm" type="button">Copiar anterior</button>
        <button id="clearScaleMonth" class="secondary btn-sm" type="button">Limpar mês</button>
        <button id="exportScaleExcel" class="secondary btn-sm" type="button">Excel</button>
        <button id="previewScalePrint" class="secondary btn-sm" type="button">Prévia</button>
        <button id="printScale" class="primary btn-sm" type="button">Imprimir</button>
      </div>
    `;
  }

  function renderStats(employees, days, data, coverageAlertCount) {
    const stats = getScaleStats(employees, days, data);
    const alertChip =
      coverageAlertCount > 0
        ? `<span class="scale-alert-metric"><strong>${coverageAlertCount}</strong> alertas cobertura</span>`
        : "";
    return `
      <div class="scale-metrics-inline">
        <span><strong>${employees.length}</strong> func.</span>
        <span><strong>${stats.daysOff}</strong> folgas</span>
        <span><strong>${stats.vtDays}</strong> VT</span>
        ${alertChip}
      </div>
    `;
  }

  function renderScaleTable(data, employees, days, alertLookups) {
    const holidayDates = getHolidayDates(data);
    const { alertDays, alertCells } = alertLookups || { alertDays: new Set(), alertCells: new Set() };

    if (!employees.length) {
      return `<div class="empty-state"><strong>Nenhum funcionário ativo.</strong><span>Cadastre funcionários ativos ou ajuste os filtros para gerar a escala.</span></div>`;
    }

    const headerDays = days.map((day) => {
      const [, , dateDay] = day.split("-");
      const isSunday = AppData.weekdayName(day) === "Domingo";
      const isHoliday = holidayDates.has(day);
      const isAlertDay = alertDays.has(day);
      const dayClasses = [
        isSunday ? "sunday" : "",
        isHoliday ? "holiday" : "",
        isAlertDay ? "coverage-alert-day" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `<th class="scale-day-head ${dayClasses}"><span class="day-num">${dateDay}</span><small class="day-week">${weekdayInitial(day)}</small></th>`;
    }).join("");

    const coverageIndicatorRow = `
      <tr class="scale-coverage-indicator-row">
        <th class="coverage-indicator-label">Cobertura</th>
        ${days
          .map((day) =>
            alertDays.has(day)
              ? `<th class="coverage-alert-day coverage-indicator-cell" title="Pendência TR/TM/MR neste dia">!</th>`
              : `<th class="coverage-indicator-cell"></th>`
          )
          .join("")}
      </tr>
    `;

    const colSpan = days.length + 1;
    const rows = groupEmployeesByDepartment(employees)
      .map(([department, departmentEmployees]) => {
        const sectorRow = `<tr class="sector-row"><th class="sector-divider" colspan="${colSpan}">${esc(department.toUpperCase())}</th></tr>`;
        const employeeRows = departmentEmployees
          .map((employee) => {
            const employeeData = getScaleDataForEmployee(employee, data);
            const scaleCompany = employee._scaleCompany || getViewCompany();
            const cells = days
              .map((day) => {
                const cell = getScaleCell(employee, day, employeeData);
                const code = cell.finalCode;
                const isSunday = AppData.weekdayName(day) === "Domingo";
                const isHoliday = holidayDates.has(day);
                const isAlertCell = alertCells.has(`${employee.id}|${day}`);
                const dayClasses = [
                  isSunday ? "sunday" : "",
                  isHoliday ? "holiday" : "",
                  isAlertCell ? "coverage-alert-cell" : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                const linkedName = cell.linkedHolidayName;
                const conflictNote = cell.absenceConflict
                  ? " — conflito: ausência prevalece no VT"
                  : "";
                const title = `${employee.name} - ${day}: ${code || "Trabalho normal"}${linkedName ? ` (${linkedName})` : ""}${conflictNote}`;

                return `
                  <td class="scale-cell ${codeClass(code)} ${dayClasses} ${cell.isManual ? "manual-cell" : ""} ${cell.absenceConflict ? "absence-conflict-cell" : ""}" title="${esc(title)}">
                    <select class="scale-select" data-employee="${employee.id}" data-date="${day}" data-scale-company="${esc(scaleCompany)}" aria-label="Escala de ${esc(employee.name)} em ${day}">
                      ${codeOptions(code, cell.isManual)}
                    </select>
                    <span class="scale-cell-code">${esc(displayCode(code))}</span>
                    ${linkedName ? `<span class="co-holiday-tag" title="${esc(linkedName)}">${esc(linkedName)}</span>` : ""}
                  </td>
                `;
              })
              .join("");

            const companyTag = employee._isCoveragePrincipal && employee._scaleCompany !== getViewCompany()
              ? `<small class="emp-company-tag">${esc(employee._scaleCompany)}</small>`
              : "";

            return `
              <tr>
                <th class="employee-sticky employee-name-only" title="${esc(employee.name)}">
                  <span class="emp-name-text">${displayName(employee.name)}</span>
                  ${companyTag}
                  ${employee.defaultShift ? `<small class="emp-shift-label">${esc(employee.defaultShift)}</small>` : ""}
                </th>
                ${cells}
              </tr>
            `;
          })
          .join("");

        return sectorRow + employeeRows;
      })
      .join("");

    return `
      <div class="table-wrap scale-wrap scale-wrap-compact">
        <table class="scale-table scale-table-compact">
          <thead>
            <tr>
              <th class="employee-sticky">
                <span class="col-head-main">Funcionário</span>
                <small class="col-head-sub">Horário</small>
              </th>
              ${headerDays}
            </tr>
            ${coverageIndicatorRow}
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderPrintArea(data, employees, days) {
    const holidayDates = getHolidayDates(data);
    const printClass = scaleState.previewVisible ? "is-visible" : "";
    const companyInfo = getPrintCompanyInfo(data);
    const sectorSubtitle = scaleState.printSector ? `<p class="scale-print-sector-sub">${esc(scaleState.printSector)}</p>` : "";

    if (!employees.length) return "";

    const headerDays = days.map((day) => {
      const [, , dateDay] = day.split("-");
      const isSunday = AppData.weekdayName(day) === "Domingo";
      const isHoliday = holidayDates.has(day);
      return `
        <th class="${isSunday ? "print-day-sunday" : ""} ${isHoliday ? "print-day-holiday" : ""}">
          <span>${dateDay}</span>
          <small>${weekdayInitial(day)}</small>
        </th>
      `;
    }).join("");

    const colSpan = days.length + 1;
    const rows = groupEmployeesByDepartment(employees)
      .map(([department, departmentEmployees]) => {
        const sectorRow = `<tr class="sector-row-print"><th class="sector-divider-print" colspan="${colSpan}">${esc(department.toUpperCase())}</th></tr>`;
        const employeeRows = departmentEmployees
          .map((employee) => {
            const cells = days
              .map((day) => {
                const code = AppData.getScaleCode(employee, day, data);
                const isSunday = AppData.weekdayName(day) === "Domingo";
                const isHoliday = holidayDates.has(day);
                return `<td class="${codeClass(code)} ${isSunday ? "print-day-sunday" : ""} ${isHoliday ? "print-day-holiday" : ""}">${esc(displayCode(code))}</td>`;
              })
              .join("");
            return `<tr><th class="print-employee-name">
              ${displayName(employee.name)}
              ${employee.defaultShift ? `<small class="print-emp-shift">${esc(employee.defaultShift)}</small>` : ""}
            </th>${cells}</tr>`;
          })
          .join("");
        return sectorRow + employeeRows;
      })
      .join("");

    return `
      <article class="card scale-print-preview-card ${companyClass()} ${printClass}">
        <div class="card-header no-print">
          <div>
            <p class="eyebrow">Pré-visualização</p>
            <h2>Layout de impressão da escala</h2>
          </div>
          <button id="closeScalePreview" class="secondary" type="button">Ocultar prévia</button>
        </div>
        <div class="scale-print-preview-scroll">
          <section class="scale-print-area" aria-label="Pré-visualização da impressão da escala">
                        <header class="scale-print-header scale-print-header-corporate">
              <div class="scale-print-brand">
                <p class="scale-print-legal-name">${esc(companyInfo.legalName)}</p>
                ${companyInfo.logoDataUrl
                  ? `<img src="${companyInfo.logoDataUrl}" alt="Logo ${esc(companyInfo.legalName)}" class="scale-print-logo-img">`
                  : `<div class="scale-print-logo-slot" aria-hidden="true">LOGO</div>`}
                <p class="scale-print-cnpj">CNPJ: ${esc(companyInfo.cnpj || "—")}</p>
              </div>

              <div class="scale-print-title">
                <h2>ESCALA DE FOLGA</h2>
                <p class="scale-print-month-display no-screen">${esc(scaleState.printMonthYear)}</p>
                ${sectorSubtitle}
                <label class="no-print scale-print-month-edit">Mês/Ano
                  <input class="scale-print-field scale-print-month" data-print-field="printMonthYear" value="${esc(scaleState.printMonthYear)}">
                </label>
              </div>

              <div class="scale-print-meta-side">
                <label class="no-print">Emissão
                  <input class="scale-print-field" data-print-field="printIssueDate" type="date" value="${esc(scaleState.printIssueDate)}">
                </label>
                <p class="scale-print-issue-print">Emissão: ${esc(scaleState.printIssueDate.split("-").reverse().join("/"))}</p>
              </div>
            </header>

            <table class="scale-print-table">
              <thead><tr><th>Funcionários</th>${headerDays}</tr></thead>
              <tbody>${rows}</tbody>
            </table>

            <section class="scale-print-footer">
              <div class="scale-print-observations">
                <h3>OBSERVAÇÕES</h3>
                <textarea class="scale-print-field" data-print-field="printNotes" rows="5" placeholder="Digite observações antes da impressão">${esc(scaleState.printNotes)}</textarea>
                <div class="scale-print-manual-lines" aria-hidden="true"><span></span><span></span><span></span></div>
              </div>

              <div class="scale-print-signature scale-print-signature-simple">
                <div class="scale-print-sign-block">
                  <div class="scale-print-sign-line" aria-hidden="true"></div>
                  ${companyInfo.responsibleName ? `<p class="scale-print-sign-name">${displayName(companyInfo.responsibleName)}</p>` : '<p class="scale-print-sign-name scale-print-sign-name-empty">&nbsp;</p>'}
                  <p class="scale-print-sign-role">Responsável pela empresa</p>
                </div>
              </div>
            </section>

            <section class="scale-print-bottom">
              <div class="scale-print-legend">
                <strong>Legenda</strong>
                <span>F = Folga Semanal</span>
                <span>D = Folga de Domingo</span>
                <span>FÉRIAS = Férias</span>
                <span>CO = Compensação de Feriado</span>
                <span>MM = Manhã Manutenção</span>
                <span>TM = Tarde Manutenção</span>
                <span>NM = Noite Manutenção</span>
                <span>MR = Manhã Recepção</span>
                <span>TR = Tarde Recepção</span>
                <span>NR = Noite Recepção</span>
                <span>ATESTADO = Atestado</span>
                <span>FALTA = Falta</span>
              </div>

              <div class="scale-print-instructions">
                <strong>Instruções</strong>
                <span>Dias em branco = dia trabalhado normal.</span>
                <span>Preencher a escala utilizando os códigos da legenda.</span>
                <span>Domingos em vermelho e feriados em azul.</span>
                <span>Imprimir em A4 horizontal para melhor leitura.</span>
              </div>
            </section>
          </section>
        </div>
      </article>
    `;
  }

  function setPeriodFromControls(container) {
    const year = Number(container.querySelector("#scaleYear").value);
    const month = Number(container.querySelector("#scaleMonth").value);
    scaleState.yearMonth = getYearMonth(year, month);
    scaleState.printMonthYear = formatMonthYear(scaleState.yearMonth);
    AppData.setEscalaSelectedYearMonth(scaleState.yearMonth);
  }

  function renderCurrent(container) {
    if (renderLock) {
      pendingRender = true;
      return;
    }
    render(container, scaleState.yearMonth);
  }

  function copyPreviousScale() {
    const data = AppData.getCompanyData(getViewCompany());
    const targetDays = AppData.getDaysInMonth(scaleState.yearMonth);
    const sourceDays = AppData.getDaysInMonth(previousMonth(scaleState.yearMonth));
    const sourceByDayNumber = new Map(sourceDays.map((day) => [day.slice(-2), day]));
    let copied = 0;

    data.employees.forEach((employee) => {
      targetDays.forEach((targetDay) => {
        const sourceDay = sourceByDayNumber.get(targetDay.slice(-2));
        if (!sourceDay) return;

        const sourceKey = `${employee.id}|${sourceDay}`;
        if (!Object.prototype.hasOwnProperty.call(data.manualScale, sourceKey)) return;

        data.manualScale[`${employee.id}|${targetDay}`] = data.manualScale[sourceKey];
        copied += 1;
      });
    });

    AppData.runScaleIntegrations([scaleState.yearMonth]);
    AppData.saveState();
    return copied;
  }

  function clearMonth() {
    const data = AppData.getCompanyData(getViewCompany());
    const days = new Set(AppData.getDaysInMonth(scaleState.yearMonth));
    let removed = 0;

    Object.keys(data.manualScale).forEach((key) => {
      const [, date] = key.split("|");
      if (!days.has(date)) return;
      delete data.manualScale[key];
      removed += 1;
    });

    AppData.runScaleIntegrations([scaleState.yearMonth]);
    AppData.saveState();
    return removed;
  }

  function exportExcel(employees, days, data) {
    const rows = [
      ["Empresa", getViewCompany()],
      ["Competência", scaleState.yearMonth],
      [],
      ["Funcionário", "Cargo", "Setor", "Folga fixa", ...days.map((day) => `${day.slice(-2)} ${AppData.weekdayName(day).slice(0, 3)}`)]
    ];

    employees.forEach((employee) => {
      rows.push([
        employee.name,
        employee.role,
        employee.department,
        employee.fixedDay,
        ...days.map((day) => AppData.getScaleCode(employee, day, data))
      ]);
    });

    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `escala-${getViewCompany()}-${scaleState.yearMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function printScale() {
    const removePrintClass = () => document.body.classList.remove("printing-scale");
    document.body.classList.add("printing-scale");
    window.addEventListener("afterprint", removePrintClass, { once: true });
    window.print();
    window.setTimeout(removePrintClass, 1000);
  }

  function bindPrintFields(container) {
    container.querySelectorAll(".scale-print-field").forEach((field) => {
      field.addEventListener("input", () => {
        scaleState[field.dataset.printField] = field.value;
        if (field.dataset.printField === "printIssueDate") {
          container.querySelectorAll('[data-print-field="printIssueDate"]').forEach((dateField) => {
            if (dateField !== field) dateField.value = field.value;
          });
        }
      });
    });
  }

  function bindEvents(container, employees, days, data) {
    window.CompanyUI?.bindToolbar?.(container, "escala", (nextCompany) => {
      if (AppData.isPageCompanyAll(nextCompany)) return;
      if (nextCompany === getViewCompany()) return;
      scaleLog("change company", nextCompany);
      lastCompanySwitchAt = Date.now();
      window.clearTimeout(container._scaleSearchTimer);
      window.clearTimeout(syncRefreshTimer);
      setViewCompany(nextCompany);
      scaleState.department = "todos";
      scaleState.printSector = "";
      scaleState.search = "";
      renderCurrent(container);
    });

    container.querySelector("#scaleMonth").addEventListener("change", () => {
      setPeriodFromControls(container);
      scheduleMonthIntegrations(scaleState.yearMonth);
      renderCurrent(container);
    });

    container.querySelector("#scaleYear").addEventListener("change", () => {
      setPeriodFromControls(container);
      scheduleMonthIntegrations(scaleState.yearMonth);
      renderCurrent(container);
    });

    container.querySelector("#scaleDepartment").addEventListener("change", (event) => {
      scaleState.department = event.target.value;
      scaleState.printSector = event.target.value === "todos" ? "" : event.target.value;
      renderCurrent(container);
    });

    container.querySelector("#scaleSearch").addEventListener("input", (event) => {
      scaleState.search = event.target.value;
      window.clearTimeout(container._scaleSearchTimer);
      container._scaleSearchTimer = window.setTimeout(() => renderCurrent(container), 150);
    });

    function showCoHolidayPicker(cell, employeeId, date, scaleCompany) {
      document.getElementById("coHolidayPicker")?.remove();

      const resolvedEmployeeId = String(employeeId || "").trim();
      if (!resolvedEmployeeId) {
        window.App?.toast?.("Funcionário inválido para vincular CO.", "error");
        return;
      }

      const data = AppData.getCompanyData(scaleCompany || getViewCompany());
      const employee = (data.employees || []).find((entry) => entry.id === resolvedEmployeeId);
      if (!employee) {
        window.App?.toast?.("Funcionário não encontrado no cadastro desta empresa.", "error");
        return;
      }

      const employeeLabel = employee.name || resolvedEmployeeId;
      const currentEntry = AppData.getManualScaleEntry(resolvedEmployeeId, date, data);
      const currentLinkedId = typeof currentEntry === "object" ? currentEntry.linkedHolidayId : null;

      const eligible = AppData.getPendingCoHolidaysForEmployee(resolvedEmployeeId, date, {
        company: scaleCompany || getViewCompany(),
        data
      });

      const holidayOpts = eligible.length
        ? eligible
            .map(
              ({ holiday, status }) =>
                `<option value="${esc(holiday.id)}" ${holiday.id === currentLinkedId ? "selected" : ""}>${esc(
                  holiday.name || holiday.date
                )} (${esc(AppData.formatDateBR(holiday.date))}) — ${esc(status.label)}</option>`
            )
            .join("")
        : `<option value="" disabled selected>Nenhum feriado pendente para este funcionário</option>`;

      const selectAttrs = eligible.length
        ? 'required'
        : 'disabled';

      const picker = document.createElement("div");
      picker.id = "coHolidayPicker";
      picker.className = "co-holiday-picker";
      picker.innerHTML = `
        <p class="co-picker-title">Feriado trabalhado — CO</p>
        <p class="co-picker-hint">Funcionário: <strong>${esc(displayName(employeeLabel))}</strong></p>
        <p class="co-picker-hint">Selecione um feriado pendente ou vencido deste funcionário (Controle de Feriados):</p>
        <select id="coHolidaySelect" class="co-picker-select" ${selectAttrs}>
          ${eligible.length ? `<option value="" disabled ${currentLinkedId ? "" : "selected"}>— Selecione o feriado —</option>` : ""}
          ${holidayOpts}
        </select>
        ${eligible.length ? "" : `<p class="co-picker-hint">Este funcionário não possui feriados trabalhados pendentes.</p>`}
        <div class="co-picker-actions">
          <button id="coPickerCancel" class="secondary btn-sm" type="button">Cancelar CO</button>
          <button id="coPickerConfirm" class="primary btn-sm" type="button" ${eligible.length ? "" : "disabled"}>Confirmar CO</button>
        </div>
      `;

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      const wrapper = document.createElement("div");
      wrapper.className = "modal-center";
      wrapper.appendChild(picker);
      backdrop.appendChild(wrapper);
      document.body.appendChild(backdrop);

      let detachOutsideClick = null;

      picker.querySelector("#coPickerCancel").addEventListener("click", () => {
        detachOutsideClick?.();
        backdrop.remove();
        AppData.setManualScale(resolvedEmployeeId, date, "__AUTO__", null, scaleCompany);
        renderCurrent(container);
      });

      picker.querySelector("#coPickerConfirm").addEventListener("click", () => {
        if (!eligible.length) {
          detachOutsideClick?.();
          backdrop.remove();
          AppData.setManualScale(resolvedEmployeeId, date, "__AUTO__", null, scaleCompany);
          renderCurrent(container);
          return;
        }

        const linkedId = picker.querySelector("#coHolidaySelect").value || null;
        if (!linkedId) {
          window.App?.toast?.("Selecione o feriado pendente deste funcionário.", "warning");
          return;
        }

        detachOutsideClick?.();
        backdrop.remove();
        const result = AppData.setManualScale(resolvedEmployeeId, date, "CO", linkedId, scaleCompany);
        if (result?.coWarning) window.App?.toast?.(result.coWarning, "warning", 5000);
        renderCurrent(container);
        window.App.renderCurrent();
      });

      setTimeout(() => {
        const outsideClick = (e) => {
          if (!wrapper.contains(e.target)) {
            detachOutsideClick?.();
            const entry = AppData.getManualScaleEntry(resolvedEmployeeId, date, data);
            if (typeof entry !== "object") {
              AppData.setManualScale(resolvedEmployeeId, date, "__AUTO__", null, scaleCompany);
              renderCurrent(container);
            }
          }
        };
        detachOutsideClick = () => document.removeEventListener("mousedown", outsideClick);
        document.addEventListener("mousedown", outsideClick);
      }, 0);
    }

    var RANGE_CODES = new Set(["ATESTADO", "FÉRIAS", "LICENÇA", "FALTA", "SUSPENSÃO"]);

    function showDateRangePicker(employeeId, date, code, scaleCompany) {
      document.getElementById("dateRangePicker")?.remove();

      var data = AppData.getCompanyData(scaleCompany || getViewCompany());
      var emp = (data.employees || []).find(function (e) { return e.id === employeeId; });
      var empName = emp ? emp.name : employeeId;

      var labels = {
        "ATESTADO": "Atestado",
        "FÉRIAS": "Férias",
        "LICENÇA": "Licença",
        "FALTA": "Falta",
        "SUSPENSÃO": "Suspensão"
      };
      var label = labels[code] || code;

      var picker = document.createElement("div");
      picker.id = "dateRangePicker";
      picker.className = "co-holiday-picker";
      picker.innerHTML =
        '<p class="co-picker-title">' + esc(label) + '</p>' +
        '<p class="co-picker-hint">Funcionário: <strong>' + esc(empName) + '</strong></p>' +
        '<div style="display:flex;gap:12px;margin:12px 0">' +
          '<label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">Data Início' +
            '<input type="date" id="rangeStartDate" class="field-select" value="' + date + '">' +
          '</label>' +
          '<label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">Data Fim' +
            '<input type="date" id="rangeEndDate" class="field-select" value="' + date + '">' +
          '</label>' +
        '</div>' +
        '<div class="co-picker-actions">' +
          '<button id="rangePickerCancel" class="secondary btn-sm" type="button">Cancelar</button>' +
          '<button id="rangePickerConfirm" class="primary btn-sm" type="button">Confirmar</button>' +
        '</div>';

      var backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      var wrapper = document.createElement("div");
      wrapper.className = "modal-center";
      wrapper.appendChild(picker);
      backdrop.appendChild(wrapper);
      document.body.appendChild(backdrop);

      picker.querySelector("#rangePickerCancel").addEventListener("click", function () {
        detachOutsideClick?.();
        backdrop.remove();
        AppData.setManualScale(employeeId, date, "__AUTO__", null, scaleCompany);
        renderCurrent(container);
      });

      picker.querySelector("#rangePickerConfirm").addEventListener("click", function () {
        var startStr = picker.querySelector("#rangeStartDate").value;
        var endStr = picker.querySelector("#rangeEndDate").value;
        if (!startStr || !endStr) { alert("Preencha as duas datas."); return; }
        if (endStr < startStr) { alert("Data fim não pode ser anterior à data início."); return; }

        detachOutsideClick?.();
        backdrop.remove();

        if (code === "FÉRIAS") {
          AppData.addVacation(
            { employeeId: employeeId, startDate: startStr, endDate: endStr, note: "" },
            scaleCompany
          );
          renderCurrent(container);
          window.App.renderCurrent();
          if (window.App?.toast) {
            window.App.toast(
              "Férias registradas de " +
                AppData.formatDateBR(startStr) +
                " a " +
                AppData.formatDateBR(endStr) +
                ".",
              "success",
              3000
            );
          }
          return;
        }

        var cur = new Date(startStr + "T00:00:00");
        var end = new Date(endStr + "T00:00:00");
        var count = 0;
        while (cur <= end) {
          var dayStr = cur.toISOString().slice(0, 10);
          AppData.setManualScale(employeeId, dayStr, code, null, scaleCompany);
          cur.setDate(cur.getDate() + 1);
          count++;
        }
        renderCurrent(container);
        window.App.renderCurrent();
        if (window.App?.toast) window.App.toast(label + " registrado(a) para " + count + " dia(s).", "success", 3000);
      });

      var detachOutsideClick = null;
      setTimeout(function () {
        var outsideClick = function (e) {
          if (!wrapper.contains(e.target)) {
            detachOutsideClick?.();
            AppData.setManualScale(employeeId, date, "__AUTO__", null, scaleCompany);
            renderCurrent(container);
          }
        };
        detachOutsideClick = function () {
          document.removeEventListener("mousedown", outsideClick);
        };
        document.addEventListener("mousedown", outsideClick);
      }, 0);
    }

    function showAbsencePopup(employeeId, date, employeeName, company) {
      var existing = document.getElementById("scaleAbsencePopup");
      if (existing) existing.remove();

      var TYPES = [
        "Atestado médico",
        "Licença maternidade",
        "Licença paternidade",
        "Licença INSS / Afastamento",
        "Licença não remunerada",
        "Falta justificada",
        "Outro"
      ];
      var typesHTML = TYPES.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join("");

      var html =
        '<div class="popup-overlay" id="scaleAbsencePopup">' +
          '<div class="popup-card">' +
            '<div class="popup-header">' +
              '<h3>Registrar Ausência</h3>' +
              '<button class="popup-close" id="absPopupClose" type="button">\u2715</button>' +
            '</div>' +
            '<form id="scaleAbsenceForm" class="popup-form">' +
              '<label class="popup-field">Funcionário' +
                '<input type="text" value="' + esc(employeeName) + '" readonly class="field-readonly">' +
              '</label>' +
              '<label class="popup-field">Tipo de ausência' +
                '<select name="absType" required>' + typesHTML + '</select>' +
              '</label>' +
              '<div class="popup-grid">' +
                '<label class="popup-field">Início' +
                  '<input type="date" name="absStartDate" required value="' + date + '">' +
                '</label>' +
                '<label class="popup-field">Fim' +
                  '<input type="date" name="absEndDate" required value="' + date + '">' +
                '</label>' +
                '<label class="popup-field">Dias' +
                  '<input type="number" name="absDays" min="1" step="1" value="1">' +
                '</label>' +
                '<label class="popup-field">CID <small>(Opcional)</small>' +
                  '<input name="absCid" placeholder="Ex.: Z00.0" autocomplete="off">' +
                '</label>' +
              '</div>' +
              '<label class="popup-field">Observação' +
                '<textarea name="absNote" rows="2"></textarea>' +
              '</label>' +
              '<div class="popup-actions">' +
                '<button type="button" class="btn btn-cancel" id="absPopupCancel">Cancelar</button>' +
                '<button type="submit" class="btn btn-primary">Salvar</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>';

      document.body.insertAdjacentHTML("beforeend", html);
      var popup = document.getElementById("scaleAbsencePopup");
      var form = document.getElementById("scaleAbsenceForm");

      var startInput = form.querySelector('[name="absStartDate"]');
      var endInput = form.querySelector('[name="absEndDate"]');
      var daysInput = form.querySelector('[name="absDays"]');

      function syncDays() {
        if (startInput.value && endInput.value && endInput.value >= startInput.value) {
          var d1 = new Date(startInput.value + "T00:00:00");
          var d2 = new Date(endInput.value + "T00:00:00");
          daysInput.value = Math.round((d2 - d1) / 86400000) + 1;
        }
      }
      startInput.addEventListener("change", syncDays);
      endInput.addEventListener("change", syncDays);

      function closePopup() { popup.remove(); }
      document.getElementById("absPopupClose").addEventListener("click", closePopup);
      document.getElementById("absPopupCancel").addEventListener("click", closePopup);
      popup.addEventListener("click", function (e) { if (e.target === popup) closePopup(); });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        if (fd.get("absEndDate") < fd.get("absStartDate")) {
          alert("A data final não pode ser anterior à data inicial.");
          return;
        }
        AppData.addAbsence({
          employeeId: employeeId,
          type: fd.get("absType"),
          startDate: fd.get("absStartDate"),
          endDate: fd.get("absEndDate"),
          cid: fd.get("absCid") || "",
          note: fd.get("absNote") || ""
        });
        closePopup();
        window.App?.toast?.("Ausência registrada.", "success");
        renderCurrent(container);
        window.App.renderCurrent();
      });
    }

    container.querySelectorAll(".scale-select").forEach((select) => {
      select.addEventListener("change", () => {
        const scaleCompany = select.dataset.scaleCompany || getViewCompany();
        if (select.value === "CO") {
          showCoHolidayPicker(
            select.closest(".scale-cell"),
            select.dataset.employee,
            select.dataset.date,
            scaleCompany
          );
        } else if (RANGE_CODES.has(select.value)) {
          showDateRangePicker(
            select.dataset.employee,
            select.dataset.date,
            select.value,
            scaleCompany
          );
        } else {
          const result = AppData.setManualScale(
            select.dataset.employee,
            select.dataset.date,
            select.value,
            null,
            scaleCompany
          );
          if (result?.coWarning) window.App?.toast?.(result.coWarning, "warning", 5000);
          renderCurrent(container);
          window.App.renderCurrent();
        }
      });

      var cell = select.closest(".scale-cell");
      cell.addEventListener("click", () => {
        select.focus();
      });

      cell.addEventListener("dblclick", (e) => {
        e.preventDefault();
        var code = select.value === "__AUTO__" ? "" : select.value;
        if (!code || code === "" || code === "FOLGA" || code === "DOM") {
          var empId = select.dataset.employee;
          var date = select.dataset.date;
          var scaleCompany = select.dataset.scaleCompany || getViewCompany();
          var data = AppData.getCompanyData(scaleCompany);
          var emp = data.employees.find(function (emp) { return emp.id === empId; });
          var empName = emp ? emp.name : empId;
          showAbsencePopup(empId, date, empName, scaleCompany);
        }
      });
    });

    container.querySelector("#copyPreviousScale").addEventListener("click", () => {
      const copied = copyPreviousScale();
      alert(`${copied} marcações manuais copiadas da escala anterior.`);
      renderCurrent(container);
    });

    container.querySelector("#clearScaleMonth").addEventListener("click", () => {
      if (!confirm("Limpar todas as alterações manuais deste mês? Folgas fixas, férias e CO automáticos serão preservados.")) return;
      const removed = clearMonth();
      alert(`${removed} alterações manuais removidas.`);
      renderCurrent(container);
    });

    container.querySelector("#exportScaleExcel").addEventListener("click", () => {
      exportExcel(employees, days, data);
    });

    container.querySelector("#previewScalePrint").addEventListener("click", () => {
      scaleState.previewVisible = true;
      renderCurrent(container);
      container.querySelector(".scale-print-preview-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    container.querySelector("#printScale").addEventListener("click", () => {
      scaleState.previewVisible = true;
      renderCurrent(container);
      printScale();
    });

    container.querySelector("#closeScalePreview")?.addEventListener("click", () => {
      scaleState.previewVisible = false;
      renderCurrent(container);
    });

    bindPrintFields(container);
  }

  function render(container, currentMonth = scaleState.yearMonth) {
    if (renderLock) {
      pendingRender = true;
      return;
    }
    renderLock = true;
    const t0 = SCALE_DEBUG ? performance.now() : 0;

    try {
      scaleState.yearMonth = currentMonth;
      if (!AppData.state.companies[scaleState.viewCompany]) {
        scaleState.viewCompany = AppData.getPrimaryPageCompany("escala");
      }
      AppData.setEscalaSelectedYearMonth(scaleState.yearMonth, { save: false });

      const viewCompany = getViewCompany();
      scaleLog("render start", viewCompany, scaleState.yearMonth);

      if (window.ScaleRules?.getCoveragePrincipalStatus) {
        try {
          window.ScaleRules.getCoveragePrincipalStatus(AppData.state);
        } catch (bindError) {
          console.warn("[Escala] Vínculo de principais:", bindError);
        }
      }

      const data = AppData.ensureCompanyDataShape(viewCompany);
      if (!data) throw new Error(`Dados da empresa "${viewCompany}" indisponíveis.`);
      ensureValidDepartment(data);
      syncPrintDefaults(data);
      const employees = getFilteredEmployees(data);
      const days = AppData.getDaysInMonth(scaleState.yearMonth);
      const coverageAlerts = getAlertsForView();
      const alertLookups = buildAlertLookups(coverageAlerts);
      const absenceConflicts = collectAbsenceConflicts(data, employees, days);

      container.innerHTML = `
        ${renderCoverageAlerts(coverageAlerts)}
        ${renderAbsenceConflictAlerts(absenceConflicts)}
        <article class="card scale-card card-compact ${companyClass()}">
          <div class="card-header card-header-compact scale-card-header">
            <div>
              <p class="eyebrow">Escala mensal</p>
              <h2>${formatMonthYear(scaleState.yearMonth)}</h2>
            </div>
          </div>
          ${renderToolbar(data)}
          ${renderStats(employees, days, data, coverageAlerts.length)}
          <details class="scale-legend-details">
            <summary>Legenda de códigos</summary>
            <div class="legend legend-compact">${renderLegend()}</div>
          </details>
          ${renderScaleTable(data, employees, days, alertLookups)}
        </article>
        ${renderPrintArea(data, employees, days)}
      `;

      bindEvents(container, employees, days, data);
      if (SCALE_DEBUG) scaleLog("render done", (performance.now() - t0).toFixed(0) + "ms", employees.length, "func.");
    } catch (error) {
      console.error("[Escala] Falha ao renderizar:", error);
      container.innerHTML = `
        <section id="scaleCoveragePanel" class="scale-coverage-alerts scale-coverage-error-block">
          <h3>Alertas de cobertura</h3>
          <p><strong>Não foi possível carregar a escala.</strong> ${esc(error.message)}</p>
          <p class="help-text">Atualize com Ctrl+F5. Se persistir, verifique o cadastro de funcionários.</p>
        </section>
      `;
    } finally {
      renderLock = false;
      if (pendingRender) {
        pendingRender = false;
        window.requestAnimationFrame(() => render(container, scaleState.yearMonth));
      }
    }
  }

  function softRefreshFromSync() {
    const container = document.getElementById("escala");
    if (!container) return;
    if (renderLock) {
      pendingRender = true;
      return;
    }
    if (Date.now() - lastCompanySwitchAt < 600) return;

    window.clearTimeout(syncRefreshTimer);
    syncRefreshTimer = window.setTimeout(() => {
      if (renderLock) {
        pendingRender = true;
        return;
      }
      const nextCompany = AppData.getPrimaryPageCompany("escala");
      scaleState.viewCompany = nextCompany;
      scaleLog("softRefreshFromSync", scaleState.viewCompany);
      renderCurrent(container);
    }, 250);
  }

  window.EscalaModule = { render, softRefreshFromSync, getViewCompany };
})();
