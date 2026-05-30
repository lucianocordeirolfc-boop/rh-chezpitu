(function () {
  let activeTab = "ferias"; // "ferias" | "ausencias"

  const ABSENCE_TYPES = [
    "Atestado médico",
    "Licença maternidade",
    "Licença paternidade",
    "Licença INSS / Afastamento",
    "Licença não remunerada",
    "Falta justificada",
    "Outro"
  ];

  const vacationFilterState = {
    employeeId: "todos",
    status: "todos",
    month: "todos",
    year: "todos",
    department: "todos"
  };

  const absenceFilterState = {
    employeeId: "todos",
    type: "todos",
    status: "todos",
    month: "todos",
    year: "todos",
    department: "todos"
  };

  const MONTHS = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" }
  ];

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function vacationStatus(vacation) {
    const today = AppData.todayISO();
    if (today < vacation.startDate) return "Programada";
    if (today > vacation.endDate) return "Concluída";
    return "Em andamento";
  }

  function absenceStatus(absence) {
    const today = AppData.todayISO();
    if (today < absence.startDate) return "Programado";
    if (today > absence.endDate) return "Encerrado";
    return "Em andamento";
  }

  function getEmployee(employeeId, data) {
    return data.employees.find((employee) => employee.id === employeeId);
  }

  function employeeOptions(employees) {
    if (!employees.length) return `<option value="">Cadastre um funcionário ativo</option>`;
    return employees.map((employee) => `<option value="${employee.id}">${esc(employee.name)}</option>`).join("");
  }

  function filterOptions(items, selected, allLabel) {
    return [`<option value="todos">${allLabel}</option>`]
      .concat(
        items.map(
          (item) =>
            `<option value="${esc(item.value)}" ${item.value === selected ? "selected" : ""}>${esc(item.label)}</option>`
        )
      )
      .join("");
  }

  function vacationOverlapsFilter(vacation) {
    const { year, month } = vacationFilterState;
    if (year === "todos" && month === "todos") return true;
    const startDate = vacation.startDate;
    const endDate = vacation.endDate;
    if (year !== "todos" && month !== "todos") {
      const monthStart = `${year}-${month}-01`;
      const monthEnd = AppData.getDaysInMonth(`${year}-${month}`).slice(-1)[0];
      return startDate <= monthEnd && endDate >= monthStart;
    }
    if (year !== "todos") {
      return startDate <= `${year}-12-31` && endDate >= `${year}-01-01`;
    }
    return (
      startDate.slice(5, 7) === month ||
      endDate.slice(5, 7) === month ||
      (startDate.slice(5, 7) < month && endDate.slice(5, 7) > month)
    );
  }

  function absenceOverlapsFilter(absence) {
    const { year, month } = absenceFilterState;
    if (year === "todos" && month === "todos") return true;
    const startDate = absence.startDate;
    const endDate = absence.endDate;
    if (year !== "todos" && month !== "todos") {
      const monthStart = `${year}-${month}-01`;
      const monthEnd = AppData.getDaysInMonth(`${year}-${month}`).slice(-1)[0];
      return startDate <= monthEnd && endDate >= monthStart;
    }
    if (year !== "todos") {
      return startDate <= `${year}-12-31` && endDate >= `${year}-01-01`;
    }
    return (
      startDate.slice(5, 7) === month ||
      endDate.slice(5, 7) === month ||
      (startDate.slice(5, 7) < month && endDate.slice(5, 7) > month)
    );
  }

  function applyVacationFilters(vacations, data) {
    return vacations.filter((vacation) => {
      const employee = getEmployee(vacation.employeeId, data);
      const status = vacationStatus(vacation);
      if (vacationFilterState.employeeId !== "todos" && vacation.employeeId !== vacationFilterState.employeeId) return false;
      if (vacationFilterState.status !== "todos" && status !== vacationFilterState.status) return false;
      if (!vacationOverlapsFilter(vacation)) return false;
      if (vacationFilterState.department !== "todos" && employee?.department !== vacationFilterState.department) return false;
      return true;
    });
  }

  function applyAbsenceFilters(absences, data) {
    return absences.filter((absence) => {
      const employee = getEmployee(absence.employeeId, data);
      const status = absenceStatus(absence);
      if (absenceFilterState.employeeId !== "todos" && absence.employeeId !== absenceFilterState.employeeId) return false;
      if (absenceFilterState.type !== "todos" && absence.type !== absenceFilterState.type) return false;
      if (absenceFilterState.status !== "todos" && status !== absenceFilterState.status) return false;
      if (!absenceOverlapsFilter(absence)) return false;
      if (absenceFilterState.department !== "todos" && employee?.department !== absenceFilterState.department) return false;
      return true;
    });
  }

  function vacationRows(vacations, data) {
    if (!vacations.length) {
      return `<tr><td colspan="7">Nenhuma férias encontrada.</td></tr>`;
    }
    return vacations
      .map((vacation) => {
        const employee = getEmployee(vacation.employeeId, data);
        const days = AppData.diffDays(vacation.startDate, vacation.endDate) + 1;
        const status = vacationStatus(vacation);
        const employeeLabel = employee?.name || AppData.getEmployeeName(vacation.employeeId, data) || "Vínculo inválido";
        return `
          <tr>
            <td>${esc(employeeLabel)}</td>
            <td>${esc(employee?.department || "—")}</td>
            <td>${esc(AppData.formatDateBR(vacation.startDate))}</td>
            <td>${esc(AppData.formatDateBR(vacation.endDate))}</td>
            <td>${days}</td>
            <td><span class="pill ${status === "Em andamento" ? "warning" : "muted"}">${status}</span></td>
            <td class="actions"><button class="link-button danger" data-remove-vacation="${vacation.id}">Excluir</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function absenceRows(absences, data) {
    if (!absences.length) {
      return `<tr><td colspan="9">Nenhum registro encontrado.</td></tr>`;
    }
    return absences
      .map((absence) => {
        const employee = getEmployee(absence.employeeId, data);
        const days = AppData.diffDays(absence.startDate, absence.endDate) + 1;
        const status = absenceStatus(absence);
        const statusClass = status === "Em andamento" ? "warning" : status === "Programado" ? "info" : "muted";
        return `
          <tr>
            <td>${esc(employee?.name || "—")}</td>
            <td>${esc(employee?.department || "—")}</td>
            <td><span class="absence-type-badge">${esc(absence.type)}</span></td>
            <td>${esc(AppData.formatDateBR(absence.startDate))}</td>
            <td>${esc(AppData.formatDateBR(absence.endDate))}</td>
            <td>${days}</td>
            <td>${absence.cid ? `<code class="cid-code">${esc(absence.cid)}</code>` : "—"}</td>
            <td><span class="pill ${statusClass}">${status}</span></td>
            <td class="actions"><button class="link-button danger" data-remove-absence="${absence.id}">Excluir</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function bindDaySync(form, startName, endName, daysName) {
    const startField = form.elements[startName];
    const endField = form.elements[endName];
    const daysField = form.elements[daysName];
    if (!startField || !endField || !daysField) return;
    let daysManual = false;

    const syncDaysFromDates = () => {
      if (!startField.value || !endField.value) return;
      if (endField.value < startField.value) return;
      daysField.value = AppData.diffDays(startField.value, endField.value) + 1;
      daysManual = false;
    };

    const syncEndFromDays = () => {
      if (!daysManual || !startField.value) return;
      const days = Number(daysField.value);
      if (!Number.isFinite(days) || days < 1) return;
      endField.value = AppData.addDays(startField.value, days - 1);
    };

    startField.addEventListener("change", () => {
      if (daysManual) syncEndFromDays();
      else syncDaysFromDates();
    });
    endField.addEventListener("change", () => {
      daysManual = false;
      syncDaysFromDates();
    });
    daysField.addEventListener("input", () => {
      daysManual = true;
      syncEndFromDays();
    });
    syncDaysFromDates();
  }

  function bindEvents(container) {
    const pageCompany = AppData.getPrimaryPageCompany("ferias");

    // ── Tab switching ──────────────────────────────────────────
    container.querySelectorAll(".ausencias-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        render(container);
      });
    });

    // ── Férias tab ─────────────────────────────────────────────
    const vacationForm = container.querySelector("#vacationForm");
    if (vacationForm) {
      bindDaySync(vacationForm, "startDate", "endDate", "consecutiveDays");

      vacationForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(vacationForm);
        const vacation = Object.fromEntries(formData.entries());
        if (vacation.endDate < vacation.startDate) {
          alert("A data final das férias não pode ser anterior à data inicial.");
          return;
        }
        AppData.addVacation(vacation, pageCompany);
        window.App.renderCurrent();
      });
    }

    container.querySelectorAll("[data-remove-vacation]").forEach((button) => {
      button.addEventListener("click", () => {
        AppData.removeVacation(button.dataset.removeVacation, pageCompany);
        render(container);
      });
    });

    container.querySelector("#vacationEmployeeFilter")?.addEventListener("change", (e) => { vacationFilterState.employeeId = e.target.value; render(container); });
    container.querySelector("#vacationStatusFilter")?.addEventListener("change", (e) => { vacationFilterState.status = e.target.value; render(container); });
    container.querySelector("#vacationMonthFilter")?.addEventListener("change", (e) => { vacationFilterState.month = e.target.value; render(container); });
    container.querySelector("#vacationYearFilter")?.addEventListener("change", (e) => { vacationFilterState.year = e.target.value; render(container); });
    container.querySelector("#vacationDepartmentFilter")?.addEventListener("change", (e) => { vacationFilterState.department = e.target.value; render(container); });
    container.querySelector("#clearVacationFilters")?.addEventListener("click", () => {
      vacationFilterState.employeeId = "todos";
      vacationFilterState.status = "todos";
      vacationFilterState.month = "todos";
      vacationFilterState.year = "todos";
      vacationFilterState.department = "todos";
      render(container);
    });

    // ── Ausências tab ──────────────────────────────────────────
    const absenceForm = container.querySelector("#absenceForm");
    if (absenceForm) {
      bindDaySync(absenceForm, "absStartDate", "absEndDate", "absDays");

      absenceForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(absenceForm);
        const payload = Object.fromEntries(formData.entries());
        if (payload.absEndDate < payload.absStartDate) {
          alert("A data final não pode ser anterior à data inicial.");
          return;
        }
        AppData.addAbsence({
          employeeId: payload.absEmployeeId,
          type: payload.absType,
          startDate: payload.absStartDate,
          endDate: payload.absEndDate,
          cid: payload.absCid || "",
          note: payload.absNote || ""
        }, pageCompany);
        window.App.renderCurrent();
      });
    }

    container.querySelectorAll("[data-remove-absence]").forEach((button) => {
      button.addEventListener("click", () => {
        AppData.removeAbsence(button.dataset.removeAbsence, pageCompany);
        render(container);
      });
    });

    container.querySelector("#absenceEmployeeFilter")?.addEventListener("change", (e) => { absenceFilterState.employeeId = e.target.value; render(container); });
    container.querySelector("#absenceTypeFilter")?.addEventListener("change", (e) => { absenceFilterState.type = e.target.value; render(container); });
    container.querySelector("#absenceStatusFilter")?.addEventListener("change", (e) => { absenceFilterState.status = e.target.value; render(container); });
    container.querySelector("#absenceMonthFilter")?.addEventListener("change", (e) => { absenceFilterState.month = e.target.value; render(container); });
    container.querySelector("#absenceYearFilter")?.addEventListener("change", (e) => { absenceFilterState.year = e.target.value; render(container); });
    container.querySelector("#absenceDepartmentFilter")?.addEventListener("change", (e) => { absenceFilterState.department = e.target.value; render(container); });
    container.querySelector("#clearAbsenceFilters")?.addEventListener("click", () => {
      absenceFilterState.employeeId = "todos";
      absenceFilterState.type = "todos";
      absenceFilterState.status = "todos";
      absenceFilterState.month = "todos";
      absenceFilterState.year = "todos";
      absenceFilterState.department = "todos";
      render(container);
    });
  }

  function render(container) {
    const company = AppData.getPrimaryPageCompany("ferias");
    const data = AppData.getCompanyData(company);
    const activeEmployees = AppData.sortEmployeesByName(
      data.employees.filter((employee) => AppData.isEmployeeActive(employee))
    );
    const absences = data.absences || [];

    const employees = activeEmployees.map((employee) => ({ value: employee.id, label: employee.name }));
    const departments = [...new Set(data.employees.map((employee) => employee.department).filter(Boolean))]
      .sort()
      .map((department) => ({ value: department, label: department }));

    let tabContent = "";

    // ── Férias tab content ─────────────────────────────────────
    if (activeTab === "ferias") {
      const inProgress = data.vacations.filter((vacation) => vacationStatus(vacation) === "Em andamento").length;
      const filteredVacations = applyVacationFilters(data.vacations, data);
      const vacationYears = [...new Set(data.vacations.map((v) => v.startDate.slice(0, 4)))].sort().reverse();
      const vacationStatuses = [
        { value: "Programada", label: "Programada" },
        { value: "Em andamento", label: "Em andamento" },
        { value: "Concluída", label: "Concluída" }
      ];

      tabContent = `
        <div class="ferias-layout">
          <article class="card card-compact ferias-form-card">
            <div class="card-header card-header-compact">
              <div>
                <p class="eyebrow">Programação</p>
                <h2>Lançar férias</h2>
              </div>
              <span class="metric-badge">${inProgress} ativas</span>
            </div>
            <form id="vacationForm" class="form-grid form-grid-compact ferias-form">
              <label class="full">Funcionário<select name="employeeId" required>${employeeOptions(activeEmployees)}</select></label>
              <label>Início<input type="date" name="startDate" required value="${AppData.todayISO()}"></label>
              <label>Fim<input type="date" name="endDate" required value="${AppData.todayISO()}"></label>
              <label>Dias corridos<input type="number" name="consecutiveDays" min="1" step="1" value="1" title="Calculado automaticamente; pode editar manualmente"></label>
              <label class="full">Observação<textarea name="note" rows="2"></textarea></label>
              <button class="primary btn-sm" type="submit" ${activeEmployees.length ? "" : "disabled"}>Salvar</button>
            </form>
          </article>

          <article class="card card-compact ferias-table-card">
            <div class="card-header card-header-compact">
              <div>
                <p class="eyebrow">Histórico</p>
                <h2>Férias cadastradas</h2>
              </div>
              <span class="metric-badge">${filteredVacations.length} registro(s)</span>
            </div>
            <div class="filter-panel-compact ferias-filters">
              <label>Funcionário<select id="vacationEmployeeFilter">${filterOptions(employees, vacationFilterState.employeeId, "Todos")}</select></label>
              <label>Status<select id="vacationStatusFilter">${filterOptions(vacationStatuses, vacationFilterState.status, "Todos")}</select></label>
              <label>Mês<select id="vacationMonthFilter">${filterOptions(MONTHS, vacationFilterState.month, "Todos")}</select></label>
              <label>Ano<select id="vacationYearFilter">${filterOptions(vacationYears.map((y) => ({ value: y, label: y })), vacationFilterState.year, "Todos")}</select></label>
              <label>Setor<select id="vacationDepartmentFilter">${filterOptions(departments, vacationFilterState.department, "Todos")}</select></label>
              <button id="clearVacationFilters" class="secondary btn-sm" type="button">Limpar</button>
            </div>
            <div class="table-wrap table-compact">
              <table class="table-premium">
                <thead>
                  <tr><th>Funcionário</th><th>Setor</th><th>Início</th><th>Fim</th><th>Dias</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>${vacationRows(filteredVacations, data)}</tbody>
              </table>
            </div>
          </article>
        </div>
      `;

    // ── Ausências tab content ──────────────────────────────────
    } else {
      const inProgressAbs = absences.filter((a) => absenceStatus(a) === "Em andamento").length;
      const filteredAbsences = applyAbsenceFilters(absences, data);
      const absenceYears = [...new Set(absences.map((a) => a.startDate.slice(0, 4)))].sort().reverse();
      const absenceTypeOpts = ABSENCE_TYPES.map((t) => ({ value: t, label: t }));
      const absenceStatuses = [
        { value: "Programado", label: "Programado" },
        { value: "Em andamento", label: "Em andamento" },
        { value: "Encerrado", label: "Encerrado" }
      ];

      tabContent = `
        <div class="ferias-layout">
          <article class="card card-compact ferias-form-card">
            <div class="card-header card-header-compact">
              <div>
                <p class="eyebrow">Lançamento</p>
                <h2>Registrar ausência</h2>
              </div>
              <span class="metric-badge">${inProgressAbs} em andamento</span>
            </div>
            <form id="absenceForm" class="form-grid form-grid-compact ferias-form">
              <label class="full">Funcionário
                <select name="absEmployeeId" required>${employeeOptions(activeEmployees)}</select>
              </label>
              <label class="full">Tipo de ausência
                <select name="absType" required>
                  ${ABSENCE_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}
                </select>
              </label>
              <label>Início<input type="date" name="absStartDate" required value="${AppData.todayISO()}"></label>
              <label>Fim<input type="date" name="absEndDate" required value="${AppData.todayISO()}"></label>
              <label>Dias<input type="number" name="absDays" min="1" step="1" value="1" title="Calculado automaticamente"></label>
              <label>CID <small class="field-hint">Opcional</small>
                <input name="absCid" placeholder="Ex.: Z00.0" autocomplete="off">
              </label>
              <label class="full">Observação<textarea name="absNote" rows="2"></textarea></label>
              <button class="primary btn-sm" type="submit" ${activeEmployees.length ? "" : "disabled"}>Salvar</button>
            </form>
          </article>

          <article class="card card-compact ferias-table-card">
            <div class="card-header card-header-compact">
              <div>
                <p class="eyebrow">Histórico</p>
                <h2>Atestados &amp; Licenças</h2>
              </div>
              <span class="metric-badge">${filteredAbsences.length} registro(s)</span>
            </div>
            <div class="filter-panel-compact ferias-filters">
              <label>Funcionário<select id="absenceEmployeeFilter">${filterOptions(employees, absenceFilterState.employeeId, "Todos")}</select></label>
              <label>Tipo<select id="absenceTypeFilter">${filterOptions(absenceTypeOpts, absenceFilterState.type, "Todos")}</select></label>
              <label>Status<select id="absenceStatusFilter">${filterOptions(absenceStatuses, absenceFilterState.status, "Todos")}</select></label>
              <label>Mês<select id="absenceMonthFilter">${filterOptions(MONTHS, absenceFilterState.month, "Todos")}</select></label>
              <label>Ano<select id="absenceYearFilter">${filterOptions(absenceYears.map((y) => ({ value: y, label: y })), absenceFilterState.year, "Todos")}</select></label>
              <label>Setor<select id="absenceDepartmentFilter">${filterOptions(departments, absenceFilterState.department, "Todos")}</select></label>
              <button id="clearAbsenceFilters" class="secondary btn-sm" type="button">Limpar</button>
            </div>
            <div class="table-wrap table-compact">
              <table class="table-premium">
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Setor</th>
                    <th>Tipo</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Dias</th>
                    <th>CID</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${absenceRows(filteredAbsences, data)}</tbody>
              </table>
            </div>
          </article>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="ausencias-module">
        ${window.CompanyUI?.renderToolbar?.("ferias") || ""}
        <div class="ausencias-tabs-bar">
          <div class="ausencias-tabs">
            <button class="ausencias-tab-btn ${activeTab === "ferias" ? "active" : ""}" data-tab="ferias">
              <svg class="tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 17a5 5 0 00-10 0"/>
                <line x1="10" y1="8" x2="10" y2="2"/>
                <line x1="3.5" y1="9" x2="4.8" y2="10.3"/>
                <line x1="16.5" y1="9" x2="15.2" y2="10.3"/>
              </svg>
              Férias
            </button>
            <button class="ausencias-tab-btn ${activeTab === "ausencias" ? "active" : ""}" data-tab="ausencias">
              <svg class="tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7 2v3M13 2v3"/>
                <rect x="2" y="4" width="16" height="14" rx="2"/>
                <line x1="2" y1="9" x2="18" y2="9"/>
                <path d="M7 13h2M11 13h2"/>
              </svg>
              Atestados &amp; Licenças
            </button>
          </div>
        </div>
        ${tabContent}
      </div>
    `;

    bindEvents(container);
    window.CompanyUI?.bindToolbar?.(container, "ferias", () => render(container));
  }

  window.FeriasModule = { render };
})();
