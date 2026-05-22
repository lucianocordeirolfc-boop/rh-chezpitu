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

  const scaleState = {
    yearMonth: AppData.getEscalaSelectedYearMonth(),
    department: "todos",
    search: "",
    previewVisible: false,
    printSector: "",
    printMonthYear: "",
    printIssueDate: AppData.todayISO(),
    printNotes: ""
  };

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
    const isManual = manualCode !== undefined && finalCode !== "FÉRIAS";
    const linkedHolidayName = finalCode === "CO" ? getLinkedHolidayName(employee.id, date, data) : null;

    return {
      finalCode,
      isManual,
      linkedHolidayName,
      receivesVT: AppData.VT_WORKED_CODES.has(finalCode)
    };
  }

  function isActiveEmployee(employee) {
    return String(employee?.status || "").trim().toLocaleLowerCase("pt-BR") === "ativo";
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
      .map((employee) => ({ ...employee, _scaleCompany: AppData.state.selectedCompany }));

    getPrincipalEmployeesExtra().forEach((employee) => {
      const matchesDepartment =
        scaleState.department === "todos" || employee.department === scaleState.department;
      const matchesSearch =
        !search ||
        [employee.name, employee.role, employee.department].some((field) => normalizeSearch(field).includes(search));

      if (!matchesDepartment || !matchesSearch) return;
      if (rows.some((item) => item.id === employee.id && item._scaleCompany === employee._scaleCompany)) return;
      rows.push(employee);
    });

    return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
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
      return ScaleRules.getHolidayDatesForCompany(AppData.state.selectedCompany, AppData.state);
    }
    return new Set(data.holidays.map((holiday) => holiday.date));
  }

  function runIntegrationsForView() {
    try {
      if (!window.ScaleRules?.recomputeScaleIntegrations) {
        return [];
      }

      const month = scaleState.yearMonth;
      const before = JSON.stringify(window.ScaleRules.getCoverageAlertsForMonth(month));
      const result = AppData.runScaleIntegrations([month]);
      const alerts = window.ScaleRules.getCoverageAlertsForMonth(month) || [];
      const after = JSON.stringify(alerts);

      if (result?.created > 0 || before !== after) {
        AppData.saveState();
      }

      return alerts;
    } catch (error) {
      console.error("[Escala] Erro ao calcular alertas de cobertura:", error);
      return [];
    }
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
      legalName: info.legalName || AppData.state.selectedCompany,
      cnpj: info.cnpj || "",
      responsibleName: info.responsibleName || "",
      logoDataUrl: info.logoDataUrl || ""
    };
  }

  function companyClass() {
    const name = AppData.state.selectedCompany || "";
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
        <label>Empresa
          <select id="scaleCompany">
            ${AppData.COMPANIES.map((company) => `<option value="${company}" ${company === AppData.state.selectedCompany ? "selected" : ""}>${company}</option>`).join("")}
          </select>
        </label>
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
            const scaleCompany = employee._scaleCompany || AppData.state.selectedCompany;
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
                const title = `${employee.name} - ${day}: ${code || "Trabalho normal"}${linkedName ? ` (${linkedName})` : ""}`;

                return `
                  <td class="scale-cell ${codeClass(code)} ${dayClasses} ${cell.isManual ? "manual-cell" : ""}" title="${esc(title)}">
                    <select class="scale-select" data-employee="${employee.id}" data-date="${day}" data-scale-company="${esc(scaleCompany)}" aria-label="Escala de ${esc(employee.name)} em ${day}">
                      ${codeOptions(code, cell.isManual)}
                    </select>
                    <span class="scale-cell-code">${esc(displayCode(code))}</span>
                    ${linkedName ? `<span class="co-holiday-tag" title="${esc(linkedName)}">${esc(linkedName)}</span>` : ""}
                  </td>
                `;
              })
              .join("");

            const companyTag = employee._isCoveragePrincipal && employee._scaleCompany !== AppData.state.selectedCompany
              ? `<small class="emp-company-tag">${esc(employee._scaleCompany)}</small>`
              : "";

            return `
              <tr>
                <th class="employee-sticky employee-name-only">
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
    render(container, scaleState.yearMonth);
  }

  function copyPreviousScale() {
    const data = AppData.getCompanyData();
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
    const data = AppData.getCompanyData();
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
      ["Empresa", AppData.state.selectedCompany],
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
    link.download = `escala-${AppData.state.selectedCompany}-${scaleState.yearMonth}.csv`;
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
    container.querySelector("#scaleCompany").addEventListener("change", (event) => {
      AppData.setSelectedCompany(event.target.value);
      document.getElementById("companySelect").value = event.target.value;
      scaleState.department = "todos";
      scaleState.printSector = "";
      renderCurrent(container);
    });

    container.querySelector("#scaleMonth").addEventListener("change", () => {
      setPeriodFromControls(container);
      renderCurrent(container);
    });

    container.querySelector("#scaleYear").addEventListener("change", () => {
      setPeriodFromControls(container);
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

      const data = AppData.getCompanyData(scaleCompany || AppData.state.selectedCompany);
      const holidays = data.holidays || [];
      const currentEntry = AppData.getManualScaleEntry(employeeId, date, data);
      const currentLinkedId = typeof currentEntry === "object" ? currentEntry.linkedHolidayId : null;

      const holidayOpts = holidays.length
        ? holidays.map((h) => `<option value="${esc(h.id)}" ${h.id === currentLinkedId ? "selected" : ""}>${esc(h.name || h.date)}</option>`).join("")
        : `<option value="" disabled>Nenhum feriado cadastrado</option>`;

      const picker = document.createElement("div");
      picker.id = "coHolidayPicker";
      picker.className = "co-holiday-picker";
      picker.innerHTML = `
        <p class="co-picker-title">Feriado trabalhado — CO</p>
        <p class="co-picker-hint">Selecione o feriado que originou esta compensação:</p>
        <select id="coHolidaySelect" class="co-picker-select">
          <option value="">— Sem vínculo específico —</option>
          ${holidayOpts}
        </select>
        <div class="co-picker-actions">
          <button id="coPickerCancel" class="secondary btn-sm" type="button">Cancelar CO</button>
          <button id="coPickerConfirm" class="primary btn-sm" type="button">Confirmar CO</button>
        </div>
      `;

      const cellRect = cell.getBoundingClientRect();
      picker.style.position = "fixed";
      picker.style.top = `${cellRect.bottom + 4}px`;
      picker.style.left = `${Math.min(cellRect.left, window.innerWidth - 280)}px`;
      document.body.appendChild(picker);

      picker.querySelector("#coPickerCancel").addEventListener("click", () => {
        picker.remove();
        AppData.setManualScale(employeeId, date, "__AUTO__", null, scaleCompany);
        renderCurrent(container);
      });

      picker.querySelector("#coPickerConfirm").addEventListener("click", () => {
        const linkedId = picker.querySelector("#coHolidaySelect").value || null;
        picker.remove();
        const result = AppData.setManualScale(employeeId, date, "CO", linkedId, scaleCompany);
        if (result?.coWarning) window.App?.toast?.(result.coWarning, "warning", 5000);
        renderCurrent(container);
        window.App.renderCurrent();
      });

      setTimeout(() => {
        const outsideClick = (e) => {
          if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener("mousedown", outsideClick);
            // Reverte se não confirmou
            const entry = AppData.getManualScaleEntry(employeeId, date, data);
            if (typeof entry !== "object") {
              AppData.setManualScale(employeeId, date, "__AUTO__", null, scaleCompany);
              renderCurrent(container);
            }
          }
        };
        document.addEventListener("mousedown", outsideClick);
      }, 0);
    }

    container.querySelectorAll(".scale-select").forEach((select) => {
      select.addEventListener("change", () => {
        const scaleCompany = select.dataset.scaleCompany || AppData.state.selectedCompany;
        if (select.value === "CO") {
          showCoHolidayPicker(
            select.closest(".scale-cell"),
            select.dataset.employee,
            select.dataset.date,
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

      select.closest(".scale-cell").addEventListener("click", () => {
        select.focus();
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
    try {
      scaleState.yearMonth = currentMonth;
      AppData.setEscalaSelectedYearMonth(scaleState.yearMonth, { save: false });
      if (window.ScaleRules?.getCoveragePrincipalStatus) {
        try {
          window.ScaleRules.getCoveragePrincipalStatus(AppData.state);
        } catch (bindError) {
          console.warn("[Escala] Vínculo de principais:", bindError);
        }
      }

      const data = AppData.getCompanyData();
      if (!data.employees) data.employees = [];
      ensureValidDepartment(data);
      syncPrintDefaults(data);
      const employees = getFilteredEmployees(data);
      const days = AppData.getDaysInMonth(scaleState.yearMonth);
      const coverageAlerts = runIntegrationsForView();
      const alertLookups = buildAlertLookups(coverageAlerts);

      container.innerHTML = `
        ${renderCoverageAlerts(coverageAlerts)}
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
    } catch (error) {
      console.error("[Escala] Falha ao renderizar:", error);
      container.innerHTML = `
        <section id="scaleCoveragePanel" class="scale-coverage-alerts scale-coverage-error-block">
          <h3>Alertas de cobertura</h3>
          <p><strong>Não foi possível carregar a escala.</strong> ${esc(error.message)}</p>
          <p class="help-text">Atualize com Ctrl+F5. Se persistir, verifique o cadastro de funcionários.</p>
        </section>
      `;
    }
  }

  window.EscalaModule = { render };
})();
