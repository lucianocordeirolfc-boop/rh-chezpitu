(function () {
  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function compensationLines(data) {
    return data.holidays.flatMap((holiday) => {
      const dueDate = AppData.addDays(holiday.date, 120);
      return holiday.workedEmployees
        .filter((item) => {
          const emp = data.employees.find((e) => e.id === item.employeeId);
          if (emp && emp.admissionDate && holiday.date < emp.admissionDate) return false;
          const resolved = AppData.resolveWorkedHolidayStatus(item, holiday.date);
          return resolved.key === "pendente" || resolved.key === "agendado";
        })
        .map((item) => {
          const daysLeft = AppData.diffDays(AppData.todayISO(), dueDate);
          return {
            holiday: holiday.name,
            employee: AppData.getEmployeeName(item.employeeId, data),
            dueDate,
            daysLeft,
            statusKey: AppData.resolveWorkedHolidayStatus(item, holiday.date).key
          };
        });
    });
  }

  function listItems(items, renderer) {
    if (!items.length) return `<p class="dash-empty">Nenhum registro.</p>`;
    return `<ul class="dash-list">${items.map(renderer).join("")}</ul>`;
  }

  function aggregateDashboardMetrics(companies) {
    const today = AppData.todayISO();
    let activeTotal = 0;
    let todayOff = [];
    let currentVacations = [];
    let pendingCompensations = [];
    let agendadosPreview = [];
    const holidayStats = { pending: 0, agendado: 0, vencido: 0, compensado: 0, deadlineAlerts: 0 };
    let coverageAlertCount = window.ScaleRules?.getCoverageAlertCount() || 0;
    let autoHolidayPending = 0;
    let totalEmployees = 0;

    companies.forEach((company) => {
      const data = AppData.getCompanyData(company);
      if (!data) return;
      const activeEmployees = data.employees.filter((employee) => employee.status === "Ativo");
      activeTotal += activeEmployees.length;
      totalEmployees += data.employees.length;
      todayOff = todayOff.concat(
        activeEmployees.filter((employee) => AppData.getScaleCode(employee, today, data) === "FOLGA")
      );
      currentVacations = currentVacations.concat(
        data.vacations.filter((vacation) => AppData.isBetween(today, vacation.startDate, vacation.endDate))
      );
      pendingCompensations = pendingCompensations.concat(compensationLines(data));
      autoHolidayPending += window.ScaleRules?.countAutoPendingHolidays(company) || 0;
      const stats = AppData.getHolidayStats(company);
      holidayStats.pending += stats.pending;
      holidayStats.agendado += stats.agendado;
      holidayStats.vencido += stats.vencido;
      holidayStats.compensado += stats.compensado;
      holidayStats.deadlineAlerts += stats.deadlineAlerts;
      agendadosPreview = agendadosPreview.concat(
        (data.holidays || []).flatMap((holiday) =>
          (holiday.workedEmployees || [])
            .filter((item) => AppData.resolveWorkedHolidayStatus(item, holiday.date).key === "agendado")
            .map((item) => ({
              employee: AppData.getEmployeeName(item.employeeId, data),
              holiday: holiday.name,
              date: item.compensationDate
            }))
        )
      );
    });

    const nearDue = pendingCompensations.filter((item) => item.daysLeft <= 20);
    const deadlineAlerts = pendingCompensations.filter((item) => item.daysLeft <= 20 || item.daysLeft < 0);
    const coverageAlertsPreview = (AppData.state.coverageAlerts || []).slice(0, 6);

    return {
      today,
      activeTotal,
      todayOff,
      currentVacations,
      holidayStats,
      nearDue,
      deadlineAlerts,
      coverageAlertCount,
      autoHolidayPending,
      totalEmployees,
      agendadosPreview,
      coverageAlertsPreview
    };
  }

  function render(container) {
    const pageCo = AppData.getPageCompany("dashboard");
    const isAll = AppData.isPageCompanyAll(pageCo);
    const companies = AppData.resolveCompaniesForPage("dashboard", { allowAll: true });
    const metrics = aggregateDashboardMetrics(companies);

    container.innerHTML = `
      ${window.CompanyUI?.renderToolbar?.("dashboard", { allowAll: true }) || ""}
      <div class="dash-metrics">
        <article class="stat-chip chip-default"><span>Ativos</span><strong>${metrics.activeTotal}</strong></article>
        <article class="stat-chip chip-info"><span>Folgas hoje</span><strong>${metrics.todayOff.length}</strong></article>
        <article class="stat-chip chip-success"><span>Férias</span><strong>${metrics.currentVacations.length}</strong></article>
        <article class="stat-chip chip-warning"><span>Feriados pend.</span><strong>${metrics.holidayStats.pending}</strong></article>
        <article class="stat-chip chip-info"><span>Feriados agend.</span><strong>${metrics.holidayStats.agendado}</strong></article>
        <article class="stat-chip chip-danger"><span>Feriados venc.</span><strong>${metrics.holidayStats.vencido}</strong></article>
        <article class="stat-chip ${metrics.coverageAlertCount > 0 ? "chip-danger" : "chip-default"}"><span>Alertas cobertura</span><strong>${metrics.coverageAlertCount}</strong></article>
        <article class="stat-chip ${metrics.autoHolidayPending > 0 ? "chip-warning" : "chip-default"}"><span>Feriados auto pend.</span><strong>${metrics.autoHolidayPending}</strong></article>
        <article class="stat-chip highlight"><span>${isAll ? "Total grupo" : "Total empresa"}</span><strong>${metrics.totalEmployees}</strong></article>
        <article class="stat-chip ${metrics.deadlineAlerts.length > 0 ? "chip-danger" : "chip-default"}"><span>Alertas prazo</span><strong>${metrics.holidayStats.deadlineAlerts}</strong></article>
      </div>

      <div class="dash-grid">
        <article class="card card-compact dash-panel">
          <h3>Folgas do dia <small>${metrics.today}</small></h3>
          ${listItems(metrics.todayOff, (employee) => `<li><strong>${esc(employee.name)}</strong></li>`)}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Férias em andamento</h3>
          ${listItems(metrics.currentVacations, (vacation) => {
            const found = AppData.findEmployeeRecord(vacation.employeeId);
            const name = found?.employee?.name || vacation.employeeId;
            return `<li><strong>${esc(name)}</strong><span>${vacation.startDate} – ${vacation.endDate}</span></li>`;
          })}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Compensações próximas</h3>
          ${listItems(
            metrics.nearDue.slice(0, 6),
            (item) => `<li><strong>${esc(item.employee)}</strong><span>${esc(item.holiday)} · ${item.dueDate}</span></li>`
          )}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Feriados agendados (CO)</h3>
          ${listItems(
            metrics.agendadosPreview.slice(0, 6),
            (item) => `<li><strong>${esc(item.employee)}</strong><span>${esc(item.holiday)} · CO em ${esc(item.date)}</span></li>`
          )}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Alertas de cobertura</h3>
          ${listItems(
            metrics.coverageAlertsPreview,
            (alert) => `<li><strong>${esc(alert.principalName || alert.message)}</strong><span>${esc(alert.message)}</span></li>`
          )}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Alertas de prazo</h3>
          ${listItems(
            metrics.deadlineAlerts.slice(0, 6),
            (item) =>
              `<li><strong>${esc(item.employee)}</strong><span class="pill ${window.FeriadosModule?.alertClass(item.daysLeft) || "warning"}">${window.FeriadosModule?.alertLabel(item.daysLeft) || item.daysLeft}</span></li>`
          )}
        </article>
      </div>
    `;

    window.CompanyUI?.bindToolbar?.(container, "dashboard", () => render(container));
  }

  window.DashboardModule = { render };
})();
