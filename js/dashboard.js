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

  function render(container) {
    const data = AppData.getCompanyData();
    const today = AppData.todayISO();
    const counts = AppData.getEmployeeCounts();
    const companyCount = counts.byCompany.find((item) => item.company === AppData.state.selectedCompany);
    const activeEmployees = data.employees.filter((employee) => employee.status === "Ativo");
    const todayOff = activeEmployees.filter((employee) => AppData.getScaleCode(employee, today, data) === "FOLGA");
    const currentVacations = data.vacations.filter((vacation) => AppData.isBetween(today, vacation.startDate, vacation.endDate));
    const holidayStats = AppData.getHolidayStats();
    const pendingCompensations = compensationLines(data);
    const nearDue = pendingCompensations.filter((item) => item.daysLeft <= 20);
    const deadlineAlerts = pendingCompensations.filter((item) => item.daysLeft <= 20 || item.daysLeft < 0);
    const coverageAlertCount = window.ScaleRules?.getCoverageAlertCount() || 0;
    const autoHolidayPending = window.ScaleRules?.countAutoPendingHolidays(AppData.state.selectedCompany) || 0;
    const coverageAlertsPreview = (AppData.state.coverageAlerts || []).slice(0, 6);
    const agendadosPreview = (data.holidays || []).flatMap((holiday) =>
      (holiday.workedEmployees || [])
        .filter((item) => AppData.resolveWorkedHolidayStatus(item, holiday.date).key === "agendado")
        .map((item) => ({
          employee: AppData.getEmployeeName(item.employeeId, data),
          holiday: holiday.name,
          date: item.compensationDate
        }))
    ).slice(0, 6);

    container.innerHTML = `
      ${window.CompanyUI?.renderCompanyBar?.() || ""}
      <div class="dash-metrics">
        <article class="stat-chip chip-default"><span>Ativos</span><strong>${companyCount?.active || 0}</strong></article>
        <article class="stat-chip chip-info"><span>Folgas hoje</span><strong>${todayOff.length}</strong></article>
        <article class="stat-chip chip-success"><span>Férias</span><strong>${currentVacations.length}</strong></article>
        <article class="stat-chip chip-warning"><span>Feriados pend.</span><strong>${holidayStats.pending}</strong></article>
        <article class="stat-chip chip-info"><span>Feriados agend.</span><strong>${holidayStats.agendado}</strong></article>
        <article class="stat-chip chip-danger"><span>Feriados venc.</span><strong>${holidayStats.vencido}</strong></article>
        <article class="stat-chip ${coverageAlertCount > 0 ? "chip-danger" : "chip-default"}"><span>Alertas cobertura</span><strong>${coverageAlertCount}</strong></article>
        <article class="stat-chip ${autoHolidayPending > 0 ? "chip-warning" : "chip-default"}"><span>Feriados auto pend.</span><strong>${autoHolidayPending}</strong></article>
        <article class="stat-chip highlight"><span>Total empresa</span><strong>${companyCount?.total || 0}</strong></article>
        <article class="stat-chip ${deadlineAlerts.length > 0 ? "chip-danger" : "chip-default"}"><span>Alertas prazo</span><strong>${holidayStats.deadlineAlerts}</strong></article>
      </div>

      <div class="dash-grid">
        <article class="card card-compact dash-panel">
          <h3>Folgas do dia <small>${today}</small></h3>
          ${listItems(todayOff, (employee) => `<li><strong>${esc(employee.name)}</strong></li>`)}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Férias em andamento</h3>
          ${listItems(currentVacations, (vacation) => `<li><strong>${esc(AppData.getEmployeeName(vacation.employeeId, data))}</strong><span>${vacation.startDate} – ${vacation.endDate}</span></li>`)}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Compensações próximas</h3>
          ${listItems(nearDue.slice(0, 6), (item) => `<li><strong>${esc(item.employee)}</strong><span>${esc(item.holiday)} · ${item.dueDate}</span></li>`)}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Feriados agendados (CO)</h3>
          ${listItems(
            agendadosPreview,
            (item) => `<li><strong>${esc(item.employee)}</strong><span>${esc(item.holiday)} · CO em ${esc(item.date)}</span></li>`
          )}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Alertas de cobertura</h3>
          ${listItems(
            coverageAlertsPreview,
            (alert) => `<li><strong>${esc(alert.principalName || alert.message)}</strong><span>${esc(alert.message)}</span></li>`
          )}
        </article>
        <article class="card card-compact dash-panel">
          <h3>Alertas de prazo</h3>
          ${listItems(deadlineAlerts.slice(0, 6), (item) => `<li><strong>${esc(item.employee)}</strong><span class="pill ${window.FeriadosModule?.alertClass(item.daysLeft) || "warning"}">${window.FeriadosModule?.alertLabel(item.daysLeft) || item.daysLeft}</span></li>`)}
        </article>
      </div>
    `;

    window.CompanyUI?.bindCompanyBar?.(container, () => render(container));
  }

  window.DashboardModule = { render };
})();
