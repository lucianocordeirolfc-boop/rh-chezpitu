(function () {
  const filterState = {
    search: "",
    employeeId: "todos",
    holidayId: "todos",
    department: "todos",
    status: "todos",
    prazo: "todos",
    compDateFrom: "",
    compDateTo: ""
  };

  let searchDelegationReady = false;

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function formatDateBR(isoDate) {
    if (!isoDate) return "—";
    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
  }

  function alertLabel(daysLeft) {
    if (daysLeft < 0) return "Vencido";
    if (daysLeft <= 5) return "Faltam 5 dias";
    if (daysLeft <= 10) return "Faltam 10 dias";
    if (daysLeft <= 20) return "Faltam 20 dias";
    return "No prazo";
  }

  function resolveLineStatus(line) {
    const workedItem = line.workedItem || null;
    const holidayDate = line.holiday?.date;
    if (!workedItem || !holidayDate) {
      if (line.daysLeft < 0) return { key: "vencido", label: "Vencido", daysLeft: line.daysLeft };
      return { key: "pendente", label: "Pendente", daysLeft: line.daysLeft };
    }
    return AppData.resolveWorkedHolidayStatus(workedItem, holidayDate);
  }

  function statusKey(line) {
    return resolveLineStatus(line).key;
  }

  function statusLabel(line) {
    return resolveLineStatus(line).label;
  }

  function statusClass(line) {
    const key = statusKey(line);
    if (key === "compensado") return "success";
    if (key === "agendado") return "info";
    if (key === "vencido") return "danger";
    if (key === "pendente") return "warning";
    return "warning";
  }

  function alertClass(daysLeft) {
    if (daysLeft < 0) return "danger";
    if (daysLeft <= 5) return "danger";
    if (daysLeft <= 20) return "warning";
    return "success";
  }

  /** Tons da barra de prazo: azul >20d, amarelo 11–20, laranja 6–10, laranja intenso 1–5, vermelho vencido. */
  function progressBarTone(line) {
    const key = statusKey(line);
    if (key === "compensado") return "progress-tone-success";
    if (key === "agendado") return "progress-tone-info";

    const daysLeft = line.daysLeft;
    if (daysLeft < 0) return "progress-tone-danger";
    if (daysLeft <= 5) return "progress-tone-orange-strong";
    if (daysLeft <= 10) return "progress-tone-orange";
    if (daysLeft <= 20) return "progress-tone-yellow";
    return "progress-tone-blue";
  }

  function progressBarWidth(line) {
    if (statusKey(line) === "compensado") return 100;
    if (line.daysLeft < 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((120 - line.daysLeft) / 120) * 100)));
  }

  function progressBarHint(line) {
    const key = statusKey(line);
    if (key === "compensado") return "Compensado";
    if (key === "agendado") return `Agendado · ${alertLabel(line.daysLeft)}`;
    return alertLabel(line.daysLeft);
  }

  function getEmployee(employeeId, data) {
    return data.employees.find((employee) => employee.id === employeeId);
  }

  function buildLines(data) {
    return (data.holidays || []).flatMap((holiday) => {
      const dueDate = AppData.addDays(holiday.date, 120);
      const today = AppData.todayISO();

      if (!holiday.workedEmployees?.length) {
        const daysLeft = AppData.diffDays(today, dueDate);
        return [
          {
            holiday,
            employee: null,
            employeeName: "Nenhum funcionário marcado",
            department: "",
            compensationDate: "",
            dueDate,
            daysLeft,
            workedItem: null,
            company: AppData.state.selectedCompany
          }
        ];
      }

      return holiday.workedEmployees
        .filter((item) => {
          const emp = getEmployee(item.employeeId, data);
          if (!emp || !emp.admissionDate) return true;
          return holiday.date >= emp.admissionDate;
        })
        .map((item) => {
          const employee = getEmployee(item.employeeId, data);
          AppData.syncWorkedEmployeeStatus(item, holiday.date);
          const resolved = AppData.resolveWorkedHolidayStatus(item, holiday.date, today);
          return {
            holiday,
            employee,
            employeeId: item.employeeId,
            employeeName: employee?.name || "Funcionário não encontrado",
            department: employee?.department || "",
            compensationDate: item.compensationDate || "",
            scheduledCoDate: item.scheduledCoDate || item.compensationDate || "",
            dueDate,
            daysLeft: resolved.daysLeft,
            workedItem: item,
            company: AppData.state.selectedCompany
          };
        });
    });
  }

  function hasActiveFilters() {
    return (
      Boolean(String(filterState.search || "").trim()) ||
      filterState.employeeId !== "todos" ||
      filterState.holidayId !== "todos" ||
      filterState.department !== "todos" ||
      filterState.status !== "todos" ||
      filterState.prazo !== "todos" ||
      Boolean(filterState.compDateFrom) ||
      Boolean(filterState.compDateTo)
    );
  }

  function matchesSearch(line, search) {
    if (!search) return true;
    const normalizedSearch = AppData.normalizeSearchText(search);
    if (!normalizedSearch) return true;

    const haystack = AppData.normalizeSearchText(
      [
        line.employeeName,
        line.holiday?.name,
        line.department,
        line.company,
        line.holiday?.date,
        line.dueDate,
        line.compensationDate,
        line.scheduledCoDate,
        statusLabel(line),
        line.workedItem?.status,
        line.workedItem?.origin
      ].join(" ")
    );

    const tokens = normalizedSearch.split(/\s+/).filter(Boolean);
    return tokens.every((token) => haystack.includes(token));
  }

  function matchesStatusFilter(line) {
    if (filterState.status === "todos") return true;
    const key = statusKey(line);
    if (filterState.status === key) return true;
    if (filterState.status === "alerta20") {
      return (key === "pendente" || key === "agendado") && line.daysLeft <= 20 && line.daysLeft > 10;
    }
    if (filterState.status === "alerta10") {
      return (key === "pendente" || key === "agendado") && line.daysLeft <= 10 && line.daysLeft > 5;
    }
    if (filterState.status === "alerta5") {
      return (key === "pendente" || key === "agendado") && line.daysLeft <= 5 && line.daysLeft >= 0;
    }
    return false;
  }

  function matchesPrazoFilter(line) {
    if (filterState.prazo === "todos") return true;
    const d = line.daysLeft;
    const key = statusKey(line);
    switch (filterState.prazo) {
      case "vencido": return key === "vencido" || (key !== "compensado" && d < 0);
      case "5dias": return key !== "compensado" && d >= 0 && d <= 5;
      case "10dias": return key !== "compensado" && d > 5 && d <= 10;
      case "20dias": return key !== "compensado" && d > 10 && d <= 20;
      case "noprazo": return key !== "compensado" && d > 20;
      case "compensado": return key === "compensado";
      default: return true;
    }
  }

  function matchesCompDateFilter(line) {
    var cd = line.compensationDate || line.scheduledCoDate || "";
    if (filterState.compDateFrom && (!cd || cd < filterState.compDateFrom)) return false;
    if (filterState.compDateTo && (!cd || cd > filterState.compDateTo)) return false;
    return true;
  }

  function applyFilters(lines) {
    return lines.filter((line) => {
      if (!matchesSearch(line, filterState.search)) return false;
      if (filterState.employeeId !== "todos" && line.employeeId !== filterState.employeeId) return false;
      if (filterState.holidayId !== "todos" && line.holiday.id !== filterState.holidayId) return false;
      if (filterState.department !== "todos" && line.department !== filterState.department) return false;
      if (!matchesStatusFilter(line)) return false;
      if (!matchesPrazoFilter(line)) return false;
      if (!matchesCompDateFilter(line)) return false;
      return true;
    });
  }

  function options(items, selected, label) {
    return [`<option value="todos">${label}</option>`].concat(
      items.map((item) => `<option value="${esc(item.value)}" ${item.value === selected ? "selected" : ""}>${esc(item.label)}</option>`)
    ).join("");
  }

  function employeeCheckboxes(employees) {
    if (!employees.length) return `<p class="help-text">Cadastre funcionários ativos para lançar feriados trabalhados.</p>`;
    return employees
      .map(
        (employee) => `
      <label class="check-line">
        <input type="checkbox" name="workedEmployees" value="${employee.id}">
        ${esc(employee.name)}
      </label>
    `
      )
      .join("");
  }

  function rows(lines, context = {}) {
    if (!lines.length) {
      if (context.totalHolidays === 0) {
        return `<tr><td colspan="8">Nenhum feriado cadastrado. Use o formulário acima ou importe dados.</td></tr>`;
      }
      if (context.hasActiveFilter) {
        return `<tr><td colspan="8">Nenhum resultado para os filtros informados.</td></tr>`;
      }
      return `<tr><td colspan="8">Nenhum registro na tabela.</td></tr>`;
    }

    return lines
      .map((line) => {
        const status = statusLabel(line);
        const badgeClass = statusClass(line);
        const progress = progressBarWidth(line);
        const progressTone = progressBarTone(line);
        const compensationDisplay = line.compensationDate ? formatDateBR(line.compensationDate) : "—";
        const originNote = line.workedItem?.origin
          ? `<small class="help-text">${esc(line.workedItem.origin)}</small>`
          : "";

        return `
        <tr>
          <td>${esc(line.employeeName)}${originNote}</td>
          <td>${esc(line.holiday.name)}</td>
          <td>${esc(line.department || "-")} / ${esc(line.company)}</td>
          <td>${formatDateBR(line.holiday.date)}</td>
          <td>
            <strong>${formatDateBR(line.dueDate)}</strong>
            <div class="progress-bar ${progressTone}" aria-label="Progresso do prazo: ${esc(progressBarHint(line))}">
              <span style="width: ${progress}%"></span>
            </div>
            <small class="progress-hint ${progressTone}">${esc(progressBarHint(line))}</small>
          </td>
          <td>${compensationDisplay}</td>
          <td><span class="pill ${badgeClass}">${status}</span></td>
          <td class="actions holiday-actions">
            ${line.employeeId ? `<input class="compact-date" type="date" data-compensation-date="${line.holiday.id}|${line.employeeId}" value="${esc(line.compensationDate)}" title="Data de compensação">` : ""}
            <button class="link-button" data-edit-holiday="${line.holiday.id}" type="button">Editar</button>
            <button class="link-button danger" data-remove-holiday="${line.holiday.id}">Excluir</button>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  function renderFilters(data) {
    const employees = data.employees
      .filter((employee) => employee.status === "Ativo")
      .map((employee) => ({ value: employee.id, label: employee.name }));
    const holidays = data.holidays.map((holiday) => ({ value: holiday.id, label: holiday.name }));
    const departments = [...new Set(data.employees.map((employee) => employee.department).filter(Boolean))]
      .sort()
      .map((department) => ({ value: department, label: department }));
    const statuses = [
      { value: "pendente", label: "Pendente" },
      { value: "agendado", label: "Agendado" },
      { value: "compensado", label: "Compensado" },
      { value: "vencido", label: "Vencido" },
      { value: "alerta20", label: "Alerta 20 dias" },
      { value: "alerta10", label: "Alerta 10 dias" },
      { value: "alerta5", label: "Alerta 5 dias" }
    ];

    const prazos = [
      { value: "noprazo", label: "No prazo (>20 dias)" },
      { value: "20dias", label: "Faltam 11–20 dias" },
      { value: "10dias", label: "Faltam 6–10 dias" },
      { value: "5dias", label: "Faltam ≤5 dias" },
      { value: "vencido", label: "Vencido" },
      { value: "compensado", label: "Compensado" }
    ];

    return `
      <div class="filter-panel filter-panel-compact" data-holiday-filters>
        <label class="full">Buscar
          <input id="holidaySearch" type="text" autocomplete="off" value="${esc(filterState.search)}" placeholder="Nome do funcionário, feriado, setor, empresa, data ou status">
        </label>
        <label>Funcionário<select id="holidayEmployeeFilter">${options(employees, filterState.employeeId, "Todos")}</select></label>
        <label>Feriado<select id="holidayNameFilter">${options(holidays, filterState.holidayId, "Todos")}</select></label>
        <label>Setor<select id="holidayDepartmentFilter">${options(departments, filterState.department, "Todos")}</select></label>
        <label>Status<select id="holidayStatusFilter">${options(statuses, filterState.status, "Todos")}</select></label>
        <label>Prazo / Progresso<select id="holidayPrazoFilter">${options(prazos, filterState.prazo, "Todos")}</select></label>
        <label>Comp. prev. de<input id="holidayCompDateFrom" type="date" value="${esc(filterState.compDateFrom)}"></label>
        <label>Comp. prev. até<input id="holidayCompDateTo" type="date" value="${esc(filterState.compDateTo)}"></label>
        <button id="clearHolidayFilters" class="secondary btn-sm" type="button">Limpar</button>
      </div>
    `;
  }

  function renderAlerts(lines) {
    const alerts = lines
      .filter((line) => {
        const key = statusKey(line);
        return (key === "pendente" || key === "agendado") && line.daysLeft <= 20;
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (!alerts.length) {
      return `<div class="empty-state compact"><strong>Nenhum alerta de vencimento.</strong></div>`;
    }

    return `<ul class="clean-list">${alerts
      .map(
        (line) => `
      <li>
        <strong>${esc(line.employeeName)}</strong>
        <span>${esc(line.holiday.name)} · ${formatDateBR(line.dueDate)} · <span class="pill ${alertClass(line.daysLeft)}">${alertLabel(line.daysLeft)}</span></span>
      </li>
    `
      )
      .join("")}</ul>`;
  }

  function computeStatsFromLines(allLines) {
    const stats = { pending: 0, agendado: 0, compensado: 0, vencido: 0, deadlineAlerts: 0 };
    allLines.forEach(function (line) {
      if (!line.workedItem) return;
      var key = statusKey(line);
      if (key === "pendente") stats.pending += 1;
      if (key === "agendado") stats.agendado += 1;
      if (key === "compensado") stats.compensado += 1;
      if (key === "vencido") stats.vencido += 1;
      if ((key === "pendente" || key === "agendado") && line.daysLeft <= 20) {
        stats.deadlineAlerts += 1;
      }
    });
    return stats;
  }

  function renderMetrics(container, allLines, autoPendingCount) {
    const metrics = container.querySelector("[data-holiday-metrics]");
    if (!metrics) return;
    const stats = computeStatsFromLines(allLines);
    metrics.innerHTML = `
      <article class="stat-chip"><span>Registros</span><strong>${allLines.length}</strong></article>
      <article class="stat-chip"><span>Pendentes</span><strong>${stats.pending}</strong></article>
      <article class="stat-chip chip-info"><span>Agendados</span><strong>${stats.agendado}</strong></article>
      <article class="stat-chip"><span>Compensados</span><strong>${stats.compensado}</strong></article>
      <article class="stat-chip chip-danger"><span>Vencidos</span><strong>${stats.vencido}</strong></article>
      <article class="stat-chip"><span>Alertas prazo</span><strong>${stats.deadlineAlerts}</strong></article>
      <article class="stat-chip"><span>Auto escala pend.</span><strong>${autoPendingCount}</strong></article>
    `;
  }

  function refreshTable(container) {
    const data = AppData.getCompanyData();
    const allLines = buildLines(data);
    const filteredLines = applyFilters(allLines);
    const tbody = container.querySelector("[data-holiday-tbody]");
    if (tbody) {
      tbody.innerHTML = rows(filteredLines, {
        totalHolidays: (data.holidays || []).length,
        hasActiveFilter: hasActiveFilters()
      });
    }

    const autoPendingCount = window.ScaleRules?.countAutoPendingHolidays(AppData.state.selectedCompany) || 0;
    renderMetrics(container, allLines, autoPendingCount);

    const alertsPanel = container.querySelector("[data-holiday-alerts]");
    if (alertsPanel) alertsPanel.innerHTML = renderAlerts(allLines);

    bindTableActions(container);
  }

  function setCompensationDate(holidayId, employeeId, compensationDate) {
    const data = AppData.getCompanyData();
    const holiday = data.holidays.find((item) => item.id === holidayId);
    if (!holiday) return { ok: true };

    const workedEmployee = holiday.workedEmployees.find((item) => item.employeeId === employeeId);
    if (!workedEmployee) return { ok: true };

    if (compensationDate && AppData.diffDays(holiday.date, compensationDate) > 120) {
      window.App?.toast?.("Compensação agendada fora do prazo de 120 dias.", "warning", 5000);
    }

    workedEmployee.compensationDate = compensationDate;
    workedEmployee.scheduledCoDate = compensationDate;
    workedEmployee.linkedFromScale = false;
    workedEmployee.scaleCoDate = "";
    AppData.syncWorkedEmployeeStatus(workedEmployee, holiday.date);
    AppData.saveState();
    return { ok: true };
  }

  function bindTableActions(container) {
    function showEditHolidayModal(holidayId) {
      document.getElementById("holidayEditPicker")?.remove();

      const data = AppData.getCompanyData();
      const holiday = (data.holidays || []).find((item) => item.id === holidayId);
      if (!holiday) return;

      const picker = document.createElement("div");
      picker.id = "holidayEditPicker";
      picker.className = "co-holiday-picker";
      picker.innerHTML = `
        <p class="co-picker-title">Editar feriado</p>
        <p class="co-picker-hint">A alteração da data reflete para todos os funcionários vinculados a este feriado.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
            Nome do feriado
            <input id="editHolidayName" class="field-select" value="${esc(holiday.name)}" autocomplete="off">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
            Data do feriado
            <input id="editHolidayDate" type="date" class="field-select" value="${esc(holiday.date)}">
          </label>
        </div>
        <div class="co-picker-actions">
          <button id="editHolidayCancel" class="secondary btn-sm" type="button">Cancelar</button>
          <button id="editHolidaySave" class="primary btn-sm" type="button">Salvar</button>
        </div>
      `;

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      const wrapper = document.createElement("div");
      wrapper.className = "modal-center";
      wrapper.appendChild(picker);
      backdrop.appendChild(wrapper);
      document.body.appendChild(backdrop);

      picker.querySelector("#editHolidayCancel").addEventListener("click", () => {
        backdrop.remove();
      });

      picker.querySelector("#editHolidaySave").addEventListener("click", () => {
        const nextName = String(picker.querySelector("#editHolidayName").value || "").trim();
        const nextDate = String(picker.querySelector("#editHolidayDate").value || "").trim();
        if (!nextName || !nextDate) {
          alert("Preencha nome e data do feriado.");
          return;
        }
        AppData.updateHoliday(holidayId, { name: nextName, date: nextDate });
        backdrop.remove();
        window.App.renderCurrent();
      });

      setTimeout(() => {
        const outsideClick = (e) => {
          if (!wrapper.contains(e.target)) {
            backdrop.remove();
            document.removeEventListener("mousedown", outsideClick);
          }
        };
        document.addEventListener("mousedown", outsideClick);
      }, 0);
    }

    container.querySelectorAll("[data-remove-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        AppData.removeHoliday(button.dataset.removeHoliday);
        window.App.renderCurrent();
      });
    });

    container.querySelectorAll("[data-edit-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        showEditHolidayModal(button.dataset.editHoliday);
      });
    });

    container.querySelectorAll("[data-compensation-date]").forEach((input) => {
      input.addEventListener("change", () => {
        const [holidayId, employeeId] = input.dataset.compensationDate.split("|");
        setCompensationDate(holidayId, employeeId, input.value);
        refreshTable(container);
      });
    });
  }

  function ensureSearchDelegation() {
    if (searchDelegationReady) return;
    searchDelegationReady = true;
    document.addEventListener(
      "input",
      (event) => {
        if (event.target.id !== "holidaySearch") return;
        const container = document.getElementById("feriados");
        if (!container?.contains(event.target)) return;
        filterState.search = event.target.value;
        refreshTable(container);
      },
      true
    );
  }

  function bindFilterEvents(container) {
    container.querySelector("#holidayEmployeeFilter")?.addEventListener("change", (event) => {
      filterState.employeeId = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayNameFilter")?.addEventListener("change", (event) => {
      filterState.holidayId = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayDepartmentFilter")?.addEventListener("change", (event) => {
      filterState.department = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayStatusFilter")?.addEventListener("change", (event) => {
      filterState.status = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayPrazoFilter")?.addEventListener("change", (event) => {
      filterState.prazo = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayCompDateFrom")?.addEventListener("change", (event) => {
      filterState.compDateFrom = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#holidayCompDateTo")?.addEventListener("change", (event) => {
      filterState.compDateTo = event.target.value;
      refreshTable(container);
    });

    container.querySelector("#clearHolidayFilters")?.addEventListener("click", () => {
      filterState.search = "";
      filterState.employeeId = "todos";
      filterState.holidayId = "todos";
      filterState.department = "todos";
      filterState.status = "todos";
      filterState.prazo = "todos";
      filterState.compDateFrom = "";
      filterState.compDateTo = "";
      const searchInput = container.querySelector("#holidaySearch");
      if (searchInput) searchInput.value = "";
      const employeeFilter = container.querySelector("#holidayEmployeeFilter");
      const nameFilter = container.querySelector("#holidayNameFilter");
      const departmentFilter = container.querySelector("#holidayDepartmentFilter");
      const statusFilter = container.querySelector("#holidayStatusFilter");
      const prazoFilter = container.querySelector("#holidayPrazoFilter");
      const compFrom = container.querySelector("#holidayCompDateFrom");
      const compTo = container.querySelector("#holidayCompDateTo");
      if (employeeFilter) employeeFilter.value = "todos";
      if (nameFilter) nameFilter.value = "todos";
      if (departmentFilter) departmentFilter.value = "todos";
      if (statusFilter) statusFilter.value = "todos";
      if (prazoFilter) prazoFilter.value = "todos";
      if (compFrom) compFrom.value = "";
      if (compTo) compTo.value = "";
      refreshView(container);
    });
  }

  function refreshView(container) {
    if (!container) return;
    refreshTable(container);
    bindTableActions(container);
  }

  async function getHolidayImportPayload(container) {
    const fileInput = container.querySelector("#importHolidayFile");
    const textarea = container.querySelector("#importHolidayText");
    const file = fileInput?.files?.[0];

    if (file) {
      return ImportUtils.readFileAsText(file);
    }

    return textarea?.value || "";
  }

  function runHolidayImport(container) {
    return getHolidayImportPayload(container)
      .then((text) => {
        const rows = ImportUtils.parseImportText(text);
        if (!rows.length) {
          alert("Nenhum registro encontrado no arquivo ou texto informado.");
          return;
        }

        const result = AppData.importHolidaysBatch(rows, {
          fallbackCompany: AppData.state.selectedCompany,
          mapRow: ImportUtils.mapHolidayRow
        });

        const fileInput = container.querySelector("#importHolidayFile");
        const textarea = container.querySelector("#importHolidayText");
        if (fileInput) fileInput.value = "";
        if (textarea) textarea.value = "";

        alert(ImportUtils.formatImportSummary(result));
        window.App.renderCurrent();
      })
      .catch(() => {
        alert("Não foi possível importar os feriados. Verifique o formato JSON ou CSV.");
      });
  }

  function bindStaticEvents(container) {
    bindWorkedHolidayNameField(container);

    container.querySelector("#holidayForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const name = resolveWorkedHolidayName(formData);
      if (!name) return;
      const date = formData.get("date");
      const compensationDate = formData.get("compensationDate");

      if (compensationDate && AppData.diffDays(date, compensationDate) > 120) {
        window.App?.toast?.("Compensação agendada fora do prazo de 120 dias.", "warning", 5000);
      }

      const workedEmployees = formData.getAll("workedEmployees").map((employeeId) => {
        const item = { employeeId, compensationDate: compensationDate || "" };
        if (compensationDate) {
          AppData.syncWorkedEmployeeStatus(item, date);
        } else {
          item.status = "Pendente";
        }
        return item;
      });

      const data = AppData.getCompanyData();
      const existing = data.holidays.find(
        (holiday) => holiday.date === date && AppData.normalizeSearchText(holiday.name) === AppData.normalizeSearchText(name)
      );

      if (existing) {
        workedEmployees.forEach((item) => {
          const prev = (existing.workedEmployees || []).find((row) => row.employeeId === item.employeeId);
          if (prev) {
            Object.assign(prev, item);
          } else {
            existing.workedEmployees.push(item);
          }
        });
        AppData.saveState();
      } else {
        AppData.addHoliday({
          name,
          date,
          workedEmployees
        });
      }
      window.App.renderCurrent();
    });

    bindCalendarHolidayNameField(container);

    container.querySelector("#calendarHolidayForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const name = resolveCalendarHolidayName(formData);
      if (!name) return;
      const scope = formData.get("companyScope");
      const date = String(formData.get("date") || "").trim();
      const companies = scope === "ambas" ? ["ambas"] : [scope];
      ScaleRules.addCalendarHoliday({
        name,
        date,
        type: formData.get("type"),
        companies
      });
      AppData.syncCompanyHolidaysFromCalendarEntry({ name, date, companies }, { save: false });
      AppData.runScaleIntegrations([date.slice(0, 7)]);
      AppData.saveState();
      window.App.renderCurrent();
    });

    container.querySelectorAll("[data-remove-calendar-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        ScaleRules.removeCalendarHoliday(button.dataset.removeCalendarHoliday);
        AppData.runScaleIntegrations([AppData.monthKey()]);
        window.App.renderCurrent();
      });
    });

    ImportUtils.bindImportModal(container, "holidayImportModal", {
      buttonId: "importOldHolidays",
      run: () => runHolidayImport(container)
    });

    container.querySelector("#downloadHolidayTemplateFeriados")?.addEventListener("click", () => {
      ImportUtils.downloadCSV(
        "modelo-feriados.csv",
        [
          "empresa",
          "funcionario",
          "nomeFeriado",
          "dataTrabalhada",
          "prazoCompensacao",
          "dataCompensacao",
          "status",
          "observacoes"
        ],
        [
          AppData.state.selectedCompany,
          AppData.getCompanyData().employees[0]?.name || "Nome do funcionário",
          "Natal",
          "2025-12-25",
          "",
          "",
          "Pendente",
          ""
        ]
      );
    });

    container.querySelector("#exportCurrentJsonFeriados")?.addEventListener("click", () => {
      ImportUtils.downloadJSON("chez-pitu-dados.json", JSON.parse(AppData.exportCurrentDataJSON()));
    });
  }

  function collectRegisteredHolidayNames() {
    const names = new Set();
    (AppData.state.calendarHolidays || []).forEach((holiday) => {
      const label = String(holiday.name || "").trim();
      if (label) names.add(label);
    });
    AppData.COMPANIES.forEach((company) => {
      (AppData.getCompanyData(company).holidays || []).forEach((holiday) => {
        const label = String(holiday.name || "").trim();
        if (label) names.add(label);
      });
    });
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function renderCalendarHolidayNameField() {
    const names = collectRegisteredHolidayNames();
    if (!names.length) {
      return `<label>Nome do feriado<input name="name" required placeholder="Ex.: Corpus Christi"></label>`;
    }

    const options = [
      `<option value="" disabled selected>Selecione o feriado</option>`,
      ...names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`),
      `<option value="__novo__">— Outro nome —</option>`
    ].join("");

    return `
      <label>Nome do feriado
        <select name="name" id="calendarHolidayNameSelect" required>
          ${options}
        </select>
        <input type="text" name="nameCustom" id="calendarHolidayNameCustom" placeholder="Ex.: Corpus Christi" hidden>
      </label>
    `;
  }

  function bindCalendarHolidayNameField(container) {
    const select = container.querySelector("#calendarHolidayNameSelect");
    const custom = container.querySelector("#calendarHolidayNameCustom");
    if (!select || !custom) return;

    const sync = () => {
      const isOther = select.value === "__novo__";
      custom.hidden = !isOther;
      custom.required = isOther;
      select.required = !isOther;
      if (!isOther) custom.value = "";
    };

    select.addEventListener("change", sync);
    sync();
  }

  function resolveCalendarHolidayName(formData) {
    let name = String(formData.get("name") || "").trim();
    if (name === "__novo__") {
      name = String(formData.get("nameCustom") || "").trim();
      if (!name) {
        alert("Informe o nome do feriado.");
        return null;
      }
    }
    return name;
  }

  function collectHolidayOptionsForWorkedForm() {
    const map = new Map();

    (AppData.state.calendarHolidays || []).forEach((holiday) => {
      const name = String(holiday.name || "").trim();
      if (!name) return;
      map.set(AppData.normalizeSearchText(name), { name, date: holiday.date });
    });

    (AppData.getCompanyData().holidays || []).forEach((holiday) => {
      const name = String(holiday.name || "").trim();
      if (!name) return;
      const key = AppData.normalizeSearchText(name);
      if (!map.has(key)) map.set(key, { name, date: holiday.date });
    });

    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt-BR"));
  }

  function renderWorkedHolidayNameField(data) {
    const options = collectHolidayOptionsForWorkedForm();
    if (!options.length) {
      return `<label>Nome do feriado<input name="name" required placeholder="Ex.: Natal"></label>`;
    }

    const selectOptions = [
      `<option value="" disabled selected>Selecione o feriado</option>`,
      ...options.map(
        (item) =>
          `<option value="${esc(item.name)}" data-holiday-date="${esc(item.date)}">${esc(item.name)} (${esc(item.date)})</option>`
      ),
      `<option value="__novo__">— Outro nome —</option>`
    ].join("");

    return `
      <label>Nome do feriado
        <select name="name" id="holidayWorkedNameSelect" required>
          ${selectOptions}
        </select>
        <input type="text" name="nameCustom" id="holidayWorkedNameCustom" placeholder="Ex.: Natal" hidden>
      </label>
    `;
  }

  function bindWorkedHolidayNameField(container) {
    const select = container.querySelector("#holidayWorkedNameSelect");
    const custom = container.querySelector("#holidayWorkedNameCustom");
    const dateInput = container.querySelector("#holidayWorkedDate");
    if (!select) return;

    const sync = () => {
      const isOther = select.value === "__novo__";
      if (custom) {
        custom.hidden = !isOther;
        custom.required = isOther;
      }
      select.required = !isOther;
      if (!isOther) {
        if (custom) custom.value = "";
        const selected = select.selectedOptions[0];
        const holidayDate = selected?.dataset?.holidayDate;
        if (holidayDate && dateInput) dateInput.value = holidayDate;
      }
    };

    select.addEventListener("change", sync);
    sync();
  }

  function resolveWorkedHolidayName(formData) {
    let name = String(formData.get("name") || "").trim();
    if (name === "__novo__") {
      name = String(formData.get("nameCustom") || "").trim();
      if (!name) {
        alert("Informe o nome do feriado.");
        return null;
      }
    }
    return name;
  }

  function renderCalendarHolidays() {
    const holidays = AppData.state.calendarHolidays || [];
    if (!holidays.length) {
      return `<p class="help-text compact-help">Nenhum feriado de calendário cadastrado. Cadastre feriados nacionais, estaduais, municipais ou internos para a automação da escala.</p>`;
    }

    return `
      <div class="table-wrap table-compact">
        <table>
          <thead>
            <tr><th>Data</th><th>Nome</th><th>Tipo</th><th>Empresas</th><th></th></tr>
          </thead>
          <tbody>
            ${holidays
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(
                (holiday) => `
              <tr>
                <td>${esc(holiday.date)}</td>
                <td>${esc(holiday.name)}</td>
                <td>${esc(holiday.type || "nacional")}</td>
                <td>${esc((holiday.companies || []).join(", ") || "Ambas")}</td>
                <td><button class="link-button danger" data-remove-calendar-holiday="${esc(holiday.id)}" type="button">Excluir</button></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render(container) {
    ensureSearchDelegation();
    AppData.syncAllCalendarHolidaysToCompanies();

    const data = AppData.getCompanyData();
    const employees = (data.employees || []).filter((employee) => employee.status === "Ativo");
    const allLines = buildLines(data);
    const filteredLines = applyFilters(allLines);
    const lineStats = computeStatsFromLines(allLines);
    const autoPendingCount = window.ScaleRules?.countAutoPendingHolidays(AppData.state.selectedCompany) || 0;

    container.innerHTML = `
      <div class="dash-metrics" data-holiday-metrics>
        <article class="stat-chip"><span>Registros</span><strong>${allLines.length}</strong></article>
        <article class="stat-chip"><span>Pendentes</span><strong>${lineStats.pending}</strong></article>
        <article class="stat-chip chip-info"><span>Agendados</span><strong>${lineStats.agendado}</strong></article>
        <article class="stat-chip"><span>Compensados</span><strong>${lineStats.compensado}</strong></article>
        <article class="stat-chip chip-danger"><span>Vencidos</span><strong>${lineStats.vencido}</strong></article>
        <article class="stat-chip"><span>Alertas prazo</span><strong>${lineStats.deadlineAlerts}</strong></article>
        <article class="stat-chip"><span>Auto escala pend.</span><strong>${autoPendingCount}</strong></article>
      </div>

      <article class="card card-compact">
        <div class="card-header card-header-compact">
          <div>
            <p class="eyebrow">Calendário</p>
            <h2>Feriados do mês / calendário</h2>
          </div>
        </div>
        <form id="calendarHolidayForm" class="form-grid form-grid-compact">
          ${renderCalendarHolidayNameField()}
          <label>Data<input type="date" name="date" required value="${AppData.todayISO()}"></label>
          <label>Tipo
            <select name="type">
              <option value="nacional">Nacional</option>
              <option value="estadual">Estadual</option>
              <option value="municipal">Municipal</option>
              <option value="interno">Interno</option>
            </select>
          </label>
          <label>Empresa aplicável
            <select name="companyScope">
              <option value="ambas">Chez Pitu e Pengold</option>
              <option value="Chez Pitu">Chez Pitu</option>
              <option value="Pengold">Pengold</option>
            </select>
          </label>
          <button class="primary btn-sm" type="submit">Cadastrar feriado</button>
        </form>
        ${renderCalendarHolidays()}
      </article>

      <div class="grid two-columns compact-module">
        <article class="card card-compact">
          <div class="card-header">
            <div>
              <p class="eyebrow">Feriado trabalhado</p>
              <h2>Lançar feriado</h2>
            </div>
          </div>
          <form id="holidayForm" class="form-grid form-grid-compact">
            ${renderWorkedHolidayNameField(data)}
            <label>Data do feriado<input id="holidayWorkedDate" type="date" name="date" required value="${AppData.todayISO()}"></label>
            <label class="full">Data de compensação<input type="date" name="compensationDate"></label>
            <fieldset class="full checkbox-group checkbox-group-compact">
              <legend>Funcionários que trabalharam</legend>
              ${employeeCheckboxes(employees)}
            </fieldset>
            <button class="primary btn-sm" type="submit">Salvar feriado</button>
          </form>
        </article>

        <article class="card card-compact info-card-compact">
          <p class="eyebrow">Prazo</p>
          <h2>120 dias corridos</h2>
          <p class="help-text compact-help">CO na escala vincula automaticamente ao feriado pendente mais antigo. Status: Pendente, Agendado, Compensado ou Vencido.</p>
        </article>
      </div>

      <article class="card card-compact">
        <div class="card-header">
          <div>
            <p class="eyebrow">Alertas</p>
            <h2>Alertas de vencimento</h2>
          </div>
        </div>
        <div data-holiday-alerts>${renderAlerts(allLines)}</div>
      </article>

      <article class="card card-compact">
        <div class="card-header card-header-compact">
          <div>
            <p class="eyebrow">Controle</p>
            <h2>Histórico de feriados</h2>
          </div>
        </div>
        ${renderFilters(data)}
        <div class="table-wrap table-compact">
          <table>
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Feriado</th>
                <th>Setor / Empresa</th>
                <th>Data trabalhada</th>
                <th>Prazo / Progresso</th>
                <th>Data de compensação prevista</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody data-holiday-tbody>${rows(filteredLines, {
              totalHolidays: (data.holidays || []).length,
              hasActiveFilter: hasActiveFilters()
            })}</tbody>
          </table>
        </div>
      </article>

      <div class="page-footer-actions">
        <button type="button" class="secondary btn-sm" data-open-modal="holidayImportModal" title="Aceita arquivos CSV e JSON">Importar dados</button>
        <span class="footer-hint">CSV e JSON</span>
      </div>

      ${ImportUtils.importModalMarkup({
        modalId: "holidayImportModal",
        title: "Importar feriados",
        description: "Campos: empresa, funcionario, nomeFeriado, dataTrabalhada, prazoCompensacao, dataCompensacao, status e observacoes.",
        fileInputId: "importHolidayFile",
        textareaId: "importHolidayText",
        importButtonId: "importOldHolidays",
        extraActions: `
          <button id="downloadHolidayTemplateFeriados" class="secondary" type="button">Modelo CSV</button>
          <button id="exportCurrentJsonFeriados" class="secondary" type="button">Exportar JSON</button>
        `
      })}
    `;

    bindStaticEvents(container);
    bindFilterEvents(container);
    bindTableActions(container);
  }

  function softRefreshFromSync(container) {
    refreshView(container);
  }

  ensureSearchDelegation();

  window.FeriadosModule = {
    render,
    refreshView,
    softRefreshFromSync,
    alertLabel,
    alertClass,
    progressBarTone,
    progressBarHint,
    statusKey,
    statusLabel,
    statusClass
  };
})();
