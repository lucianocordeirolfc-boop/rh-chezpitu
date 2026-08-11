(function () {
  const filterState = {
    quickView: "registros",
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
    return AppData.formatDateBR(isoDate);
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
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((AppData.HOLIDAY_COMPENSATION_DAYS - line.daysLeft) / AppData.HOLIDAY_COMPENSATION_DAYS) * 100
        )
      )
    );
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

  function buildLines(data, companyKey) {
    const companyLabel = companyKey || AppData.getPrimaryPageCompany("feriados");
    // Fase 3A — Filtrar feriados deletados (soft delete)
    return (data.holidays || [])
      .filter((h) => !h.isDeleted)
      .flatMap((holiday) => {
        const dueDate = AppData.getHolidayCompensationDueDate(holiday.date);
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
            company: companyLabel
          }
        ];
      }

      return holiday.workedEmployees
        // Fonte única compartilhada com o modal CO: só vínculos visíveis no Histórico
        // oficial (descarta, p.ex., feriado anterior à admissão do funcionário).
        .filter((item) => AppData.isWorkedEntryVisibleInHistory(holiday, item, data))
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
            company: companyLabel
          };
        });
    });
  }

  function hasActiveFilters() {
    return (
      filterState.quickView !== "registros" ||
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

  function matchesQuickView(line) {
    if (filterState.quickView === "registros") return true;
    if (!line.workedItem) return false;
    const key = statusKey(line);
    if (filterState.quickView === "pendentes") return key === "pendente";
    if (filterState.quickView === "agendados") return key === "agendado";
    if (filterState.quickView === "compensados") return key === "compensado";
    if (filterState.quickView === "vencidos") return key === "vencido";
    if (filterState.quickView === "alertas") {
      return (key === "pendente" || key === "agendado") && line.daysLeft <= 20;
    }
    return true;
  }

  function setQuickView(view) {
    filterState.quickView = view;
    const statusMap = {
      pendentes: "pendente",
      agendados: "agendado",
      compensados: "compensado",
      vencidos: "vencido",
      alertas: "alerta20",
      registros: "todos"
    };
    filterState.status = statusMap[view] || "todos";
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
      if (!matchesQuickView(line)) return false;
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
        return `<tr><td colspan="8">Nenhum feriado cadastrado. Use <strong>Cadastrar feriado</strong> ou importe dados.</td></tr>`;
      }
      if (context.hasActiveFilter) {
        return `<tr><td colspan="8">Nenhum resultado para os filtros informados.</td></tr>`;
      }
      return `<tr><td colspan="8">Nenhum registro na tabela.</td></tr>`;
    }

    const seenHoliday = new Set();
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
        const isFirstHolidayRow = !seenHoliday.has(line.holiday.id);
        if (isFirstHolidayRow) seenHoliday.add(line.holiday.id);

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
            ${isFirstHolidayRow ? `<button class="link-button" data-add-worked-employee="${esc(line.holiday.id)}" type="button">+ Funcionário</button>` : ""}
            ${line.employeeId ? `<input class="compact-date" type="date" data-compensation-date="${line.holiday.id}|${line.employeeId}" value="${esc(line.compensationDate)}" title="Data de compensação">` : ""}
            ${line.employeeId ? `<button class="link-button danger" data-unlink-holiday="${line.holiday.id}|${line.employeeId}" type="button">Excluir vínculo</button>` : ""}
            ${isFirstHolidayRow ? `<button class="link-button danger" data-remove-holiday-perm="${esc(line.holiday.id)}" type="button" title="Excluir o feriado e todos os vínculos, definitivamente">Excluir feriado</button>` : ""}
          </td>
        </tr>
      `;
      })
      .join("");
  }

  function renderFilters(data) {
    const employees = data.employees
      .filter((employee) => AppData.isEmployeeActive(employee))
      .map((employee) => ({ value: employee.id, label: employee.name }));
    // Filtro "Feriado": cada feriado uma única vez — ignora soft-deletados e
    // deduplica por nome + data (defensivo, mesmo antes do dedup persistir).
    const seenHolidayKeys = new Set();
    const holidays = data.holidays
      .filter((holiday) => !holiday.isDeleted)
      .filter((holiday) => {
        const key = `${holiday.date}|${AppData.normalizeSearchText(holiday.name)}`;
        if (seenHolidayKeys.has(key)) return false;
        seenHolidayKeys.add(key);
        return true;
      })
      .map((holiday) => ({ value: holiday.id, label: holiday.name }));
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

  function renderQuickNav(allLines, lineStats, autoPendingCount) {
    const q = filterState.quickView;
    const items = [
      { id: "registros", label: "Registros", count: allLines.length, chipClass: "" },
      { id: "pendentes", label: "Pendentes", count: lineStats.pending, chipClass: "" },
      { id: "agendados", label: "Agendados", count: lineStats.agendado, chipClass: "chip-info" },
      { id: "compensados", label: "Compensados", count: lineStats.compensado, chipClass: "" },
      { id: "vencidos", label: "Vencidos", count: lineStats.vencido, chipClass: "chip-danger" },
      { id: "alertas", label: "Alertas prazo", count: lineStats.deadlineAlerts, chipClass: "" }
    ];
    return items
      .map(
        (item) => `
      <button
        type="button"
        class="stat-chip feriados-nav-chip ${item.chipClass} ${q === item.id ? "is-active" : ""}"
        data-feriados-view="${item.id}"
      >
        <span>${item.label}</span>
        <strong>${item.count}</strong>
      </button>
    `
      )
      .concat(
        `<article class="stat-chip" title="Pendências automáticas na escala"><span>Auto escala</span><strong>${autoPendingCount}</strong></article>`
      )
      .join("");
  }

  function updateQuickNavActive(container) {
    const q = filterState.quickView;
    container.querySelectorAll("[data-feriados-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.feriadosView === q);
    });
  }

  function refreshTable(container) {
    const company = AppData.getPrimaryPageCompany("feriados");
    const data = AppData.getCompanyData(company);
    const allLines = buildLines(data, company);
    const filteredLines = applyFilters(allLines);
    const tbody = container.querySelector("[data-holiday-tbody]");
    if (tbody) {
      tbody.innerHTML = rows(filteredLines, {
        totalHolidays: (data.holidays || []).length,
        hasActiveFilter: hasActiveFilters()
      });
    }

    updateQuickNavActive(container);
    bindTableActions(container);
  }

  function setCompensationDate(holidayId, employeeId, compensationDate) {
    const data = AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados"));
    const holiday = data.holidays.find((item) => item.id === holidayId);
    if (!holiday) return { ok: true };

    const workedEmployee = AppData.resolveWorkedEmployeeEntry(data, employeeId, holiday);
    if (!workedEmployee) return { ok: true };

    if (compensationDate && !AppData.isCompensationWithinDeadline(holiday.date, compensationDate)) {
      window.App?.toast?.(
        `Compensação agendada fora do prazo de ${AppData.HOLIDAY_COMPENSATION_DAYS} dias.`,
        "warning",
        5000
      );
    }

    workedEmployee.compensationDate = compensationDate;
    workedEmployee.scheduledCoDate = compensationDate;
    workedEmployee.linkedFromScale = false;
    workedEmployee.scaleCoDate = "";
    AppData.syncWorkedEmployeeStatus(workedEmployee, holiday.date);
    AppData.saveState();
    return { ok: true };
  }

  // Editar/Excluir feriado vivem no modal "Cadastrar feriado" (não no contexto do funcionário).
  function confirmDeleteHoliday(holidayId) {
    const data = AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados"));
    const holiday = (data.holidays || []).find((item) => item.id === holidayId);
    const total = holiday?.workedEmployees?.length || 0;

    // Fase 3A — Soft delete: não é definitivo, pode ser restaurado
    const msg = total
      ? `Marcar o feriado "${holiday?.name || ""}" (${formatDateBR(holiday?.date || "")}) como excluído?\n\n` +
        `Isso afetará ${total} vínculo(s) de funcionários.\n\n` +
        `Nota: Esta ação não é definitiva. O feriado pode ser restaurado depois se necessário.`
      : `Marcar o feriado "${holiday?.name || ""}" como excluído?\n\n` +
        `Nota: Esta ação não é definitiva. O feriado pode ser restaurado depois se necessário.`;

    return window.confirm(msg);
  }

  // Exclusão DEFINITIVA (irreversível): remove o feriado e TODOS os vínculos e
  // impede que ele volte por seed/sincronização. Confirmação explícita e forte.
  function confirmDeleteHolidayPermanent(holiday) {
    const total = holiday?.workedEmployees?.length || 0;
    const linhas = total
      ? `\n\nIsto vai excluir também ${total} vínculo(s) de funcionário(s) neste feriado.`
      : "";
    const msg =
      `EXCLUIR DEFINITIVAMENTE o feriado "${holiday?.name || ""}" (${formatDateBR(holiday?.date || "")})?` +
      linhas +
      `\n\nEsta ação é PERMANENTE e NÃO pode ser desfeita. ` +
      `O feriado não voltará por sincronização nem por cadastro automático.`;
    return window.confirm(msg);
  }

  function showEditHolidayModal(holidayId, onDone) {
    document.getElementById("holidayEditPicker")?.remove();

    const data = AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados"));
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
      if (typeof onDone === "function") onDone();
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

  /**
   * Foca o Histórico do Controle de Feriados exatamente no vínculo existente
   * (mesmo feriado + mesmo funcionário), para o usuário ver onde ele está.
   */
  function focusExistingLink(existing) {
    filterState.quickView = "registros";
    filterState.status = "todos";
    filterState.prazo = "todos";
    filterState.search = "";
    filterState.department = "todos";
    filterState.compDateFrom = "";
    filterState.compDateTo = "";
    filterState.holidayId = existing.holidayId || "todos";
    filterState.employeeId = existing.employeeId || "todos";
    window.App?.renderCurrent?.();
  }

  /**
   * Diálogo "Vínculo já existente": mostra onde o vínculo está (feriado, data,
   * status, origem, compensação) e oferece "Ver vínculo existente" (foca o
   * Histórico). Substitui o antigo bloqueio sem explicação.
   */
  function showExistingLinkDialog(existing, note) {
    document.getElementById("existingLinkDialog")?.remove();
    const fmt = (d) => (d ? formatDateBR(d) : "—");

    const picker = document.createElement("div");
    picker.id = "existingLinkDialog";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">Vínculo já existente</p>
      <p class="co-picker-hint">Este funcionário já está vinculado a este feriado. Vínculo atual:</p>
      <ul style="list-style:none;margin:12px 0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:0.85rem">
        <li><strong>Feriado:</strong> ${esc(existing.holidayName)}</li>
        <li><strong>Data trabalhada:</strong> ${esc(fmt(existing.holidayDate))}</li>
        <li><strong>Status:</strong> ${esc(existing.status)}</li>
        <li><strong>Origem:</strong> ${esc(existing.origin)}</li>
        <li><strong>Compensação:</strong> ${esc(fmt(existing.compensationDate))}</li>
      </ul>
      ${note ? `<p style="font-size:0.8rem;color:var(--text-muted,#888);margin:0 0 6px">${esc(note)}</p>` : ""}
      <div class="co-picker-actions">
        <button id="existingLinkClose" class="secondary btn-sm" type="button">Fechar</button>
        <button id="existingLinkView" class="primary btn-sm" type="button">Ver vínculo existente</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    picker.querySelector("#existingLinkClose").addEventListener("click", close);
    picker.querySelector("#existingLinkView").addEventListener("click", () => {
      close();
      focusExistingLink(existing);
    });
  }

  /**
   * Trata o retorno de addManualWorkedEmployee de forma única para os 3 pontos
   * de vínculo manual:
   *  - ok:true  → fecha modal, atualiza tabela e mostra toast (já visível no Histórico).
   *  - bloqueado com detalhes (Agendado/Compensado) → diálogo "Ver vínculo existente".
   *  - erro genérico → alerta.
   */
  function handleManualLinkResult(result, { container, close } = {}) {
    if (result?.ok) {
      close?.();
      if (container) refreshTable(container);
      else window.App?.renderCurrent?.();
      window.App?.toast?.(result.message || "Vínculo criado com sucesso.", "success");
      return;
    }
    if (result?.existing) {
      close?.();
      if (container) refreshTable(container);
      showExistingLinkDialog(result.existing, result.message || result.error);
      return;
    }
    alert(result?.error || "Não foi possível criar o vínculo.");
  }

  function showAddWorkedEmployeeModal(holidayId, container) {
    document.getElementById("addWorkedEmployeePicker")?.remove();

    const company = AppData.getPrimaryPageCompany("feriados");
    const data = AppData.getCompanyData(company);
    const holiday = (data.holidays || []).find((h) => h.id === holidayId);
    if (!holiday) return;

    const linkedIds = new Set((holiday.workedEmployees || []).map((item) => item.employeeId));
    const available = (data.employees || []).filter(
      (emp) => AppData.isEmployeeActive(emp) && !linkedIds.has(emp.id)
    );

    if (!available.length) {
      alert("Todos os funcionários ativos já estão vinculados a este feriado.");
      return;
    }

    const empOptions = available
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((emp) => `<option value="${esc(emp.id)}">${esc(emp.name)}</option>`)
      .join("");

    const picker = document.createElement("div");
    picker.id = "addWorkedEmployeePicker";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">Adicionar funcionário ao feriado</p>
      <p class="co-picker-hint"><strong>${esc(holiday.name)}</strong> · ${esc(formatDateBR(holiday.date))} · ${esc(company)}</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Funcionário
          <select id="addWorkedEmpSelect" class="field-select">
            <option value="" disabled selected>Selecione o funcionário</option>
            ${empOptions}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Data trabalhada
          <input type="date" value="${esc(holiday.date)}" readonly style="background:var(--bg-alt,#f5f5f5);cursor:not-allowed">
        </label>
        <p style="font-size:0.8rem;color:var(--text-muted,#888);margin:0">Status inicial: <strong>Pendente</strong> · Origem: <strong>Manual</strong></p>
      </div>
      <div class="co-picker-actions">
        <button id="addWorkedEmpCancel" class="secondary btn-sm" type="button">Cancelar</button>
        <button id="addWorkedEmpSave" class="primary btn-sm" type="button">Salvar vínculo</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    picker.querySelector("#addWorkedEmpCancel").addEventListener("click", close);

    picker.querySelector("#addWorkedEmpSave").addEventListener("click", () => {
      const employeeId = picker.querySelector("#addWorkedEmpSelect").value;
      if (!employeeId) {
        alert("Selecione um funcionário.");
        return;
      }
      const result = AppData.addManualWorkedEmployee(holidayId, employeeId, { company });
      handleManualLinkResult(result, { container, close });
    });

    setTimeout(() => {
      const outsideClick = (e) => {
        if (!wrapper.contains(e.target)) {
          close();
          document.removeEventListener("mousedown", outsideClick);
        }
      };
      document.addEventListener("mousedown", outsideClick);
    }, 0);
  }

  /**
   * Modal global "+ Vincular funcionário a feriado".
   * Disponível sempre no topo do Controle de Feriados, mesmo sem linhas na tabela.
   * Permite escolher o feriado (cadastrado na empresa da aba ativa) E o funcionário
   * (ativo, da mesma empresa) num único passo. A data trabalhada é a do feriado.
   */
  function showLinkEmployeeToHolidayModal(container) {
    document.getElementById("linkEmployeeHolidayPicker")?.remove();

    const company = AppData.getPrimaryPageCompany("feriados");
    const data = AppData.getCompanyData(company);

    const holidays = (data.holidays || [])
      .filter((h) => !h.isDeleted)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const employees = (data.employees || [])
      .filter((emp) => AppData.isEmployeeActive(emp))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    if (!holidays.length) {
      alert(`Nenhum feriado cadastrado para ${company}. Use "+ Cadastrar feriado" antes de vincular funcionários.`);
      return;
    }
    if (!employees.length) {
      alert(`Nenhum funcionário ativo em ${company}.`);
      return;
    }

    const holidayOptions = [
      `<option value="" disabled selected>Selecione o feriado</option>`,
      ...holidays.map(
        (h) => `<option value="${esc(h.id)}" data-holiday-date="${esc(h.date)}">${esc(h.name)} (${esc(formatDateBR(h.date))})</option>`
      )
    ].join("");

    const employeeOptions = [
      `<option value="" disabled selected>Selecione o funcionário</option>`,
      ...employees.map((emp) => `<option value="${esc(emp.id)}">${esc(emp.name)}</option>`)
    ].join("");

    const picker = document.createElement("div");
    picker.id = "linkEmployeeHolidayPicker";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">Vincular funcionário a feriado</p>
      <p class="co-picker-hint">Empresa da aba ativa: <strong>${esc(company)}</strong>.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Feriado
          <select id="linkHolidaySelect" class="field-select">${holidayOptions}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Funcionário
          <select id="linkEmployeeSelect" class="field-select">${employeeOptions}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Data trabalhada
          <input id="linkWorkedDate" type="date" readonly class="field-select" style="background:var(--bg-alt,#f5f5f5);cursor:not-allowed">
        </label>
        <p style="font-size:0.8rem;color:var(--text-muted,#888);margin:0">Status inicial: <strong>Pendente</strong> · Origem: <strong>Manual</strong> · Sem data de compensação.</p>
      </div>
      <div class="co-picker-actions">
        <button id="linkEmployeeHolidayCancel" class="secondary btn-sm" type="button">Cancelar</button>
        <button id="linkEmployeeHolidaySave" class="primary btn-sm" type="button">Salvar vínculo</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    const holidaySelect = picker.querySelector("#linkHolidaySelect");
    const dateInput = picker.querySelector("#linkWorkedDate");

    const syncDate = () => {
      const selected = holidaySelect.selectedOptions[0];
      dateInput.value = selected?.dataset?.holidayDate || "";
    };
    holidaySelect.addEventListener("change", syncDate);

    picker.querySelector("#linkEmployeeHolidayCancel").addEventListener("click", close);

    picker.querySelector("#linkEmployeeHolidaySave").addEventListener("click", () => {
      const holidayId = holidaySelect.value;
      const employeeId = picker.querySelector("#linkEmployeeSelect").value;
      if (!holidayId) {
        alert("Selecione o feriado.");
        return;
      }
      if (!employeeId) {
        alert("Selecione o funcionário.");
        return;
      }
      const result = AppData.addManualWorkedEmployee(holidayId, employeeId, { company });
      handleManualLinkResult(result, { container, close });
    });

    setTimeout(() => {
      const outsideClick = (e) => {
        if (!wrapper.contains(e.target)) {
          close();
          document.removeEventListener("mousedown", outsideClick);
        }
      };
      document.addEventListener("mousedown", outsideClick);
    }, 0);
  }

  function bindTableActions(container) {

    container.querySelectorAll("[data-add-worked-employee]").forEach((button) => {
      button.addEventListener("click", () => {
        showAddWorkedEmployeeModal(button.dataset.addWorkedEmployee, container);
      });
    });

    container.querySelectorAll("[data-unlink-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        const [holidayId, employeeId] = String(button.dataset.unlinkHoliday || "").split("|");
        if (!holidayId || !employeeId) return;
        if (!window.confirm("Remover o vínculo deste funcionário com este feriado?")) return;
        AppData.removeWorkedEmployeeFromHoliday(holidayId, employeeId);
        refreshTable(container);
        window.App.renderCurrent();
      });
    });

    container.querySelectorAll("[data-remove-holiday-perm]").forEach((button) => {
      button.addEventListener("click", () => {
        const holidayId = button.dataset.removeHolidayPerm;
        const company = AppData.getPrimaryPageCompany("feriados");
        const data = AppData.getCompanyData(company);
        const holiday = (data.holidays || []).find((item) => item.id === holidayId);
        if (!holiday) return;
        if (!confirmDeleteHolidayPermanent(holiday)) return;
        const result = AppData.removeCompanyHolidayPermanently(holidayId, { company });
        if (result?.ok) {
          window.App?.toast?.(
            `Feriado "${result.name}" excluído definitivamente.`,
            "success"
          );
        }
        refreshTable(container);
        window.App.renderCurrent();
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

    container.querySelector("[data-holiday-quick-nav]")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-feriados-view]");
      if (!btn) return;
      setQuickView(btn.dataset.feriadosView);
      const statusFilter = container.querySelector("#holidayStatusFilter");
      if (statusFilter) statusFilter.value = filterState.status;
      updateQuickNavActive(container);
      refreshTable(container);
    });

    container.querySelector("#clearHolidayFilters")?.addEventListener("click", () => {
      setQuickView("registros");
      filterState.search = "";
      filterState.employeeId = "todos";
      filterState.holidayId = "todos";
      filterState.department = "todos";
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
          fallbackCompany: AppData.getPrimaryPageCompany("feriados"),
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

  function submitWorkedHolidayForm(form) {
    const formData = new FormData(form);
    const name = resolveWorkedHolidayName(formData);
    if (!name) return false;

    const date = formData.get("date");
    const compensationDate = formData.get("compensationDate");
    const selectedEmployees = formData.getAll("workedEmployees");
    if (!selectedEmployees.length) {
      alert("Selecione ao menos um funcionário que trabalhou no feriado.");
      return false;
    }

    if (compensationDate && !AppData.isCompensationWithinDeadline(date, compensationDate)) {
      window.App?.toast?.(
        `Compensação agendada fora do prazo de ${AppData.HOLIDAY_COMPENSATION_DAYS} dias.`,
        "warning",
        5000
      );
    }

    const workedEmployees = selectedEmployees.map((employeeId) => {
      const item = { employeeId, compensationDate: compensationDate || "" };
      if (compensationDate) {
        AppData.syncWorkedEmployeeStatus(item, date);
      } else {
        item.status = "Pendente";
      }
      return item;
    });

    const data = AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados"));
    const existing = data.holidays.find(
      (holiday) =>
        holiday.date === date && AppData.normalizeSearchText(holiday.name) === AppData.normalizeSearchText(name)
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
      AppData.addHoliday({ name, date, workedEmployees });
    }
    return true;
  }

  function submitCalendarHolidayForm(form) {
    const formData = new FormData(form);
    const name = resolveCalendarHolidayName(formData);
    if (!name) return false;
    let date = String(formData.get("date") || "").trim();
    if (AppData.isPadroeiraBuziosName(name)) date = AppData.correctPadroeiraBuziosDate(date);
    // Recriação explícita pelo usuário: limpa tombstone anterior (empresa + calendário)
    // para que o feriado recadastrado não seja removido pela regra de exclusão definitiva.
    AppData.clearHolidayTombstones?.(name, date);
    // Vinculado à empresa da aba ativa (sem seletor de empresa — evita dados cruzados).
    const companies = [AppData.getActiveCompany()];
    ScaleRules.addCalendarHoliday({
      name,
      date,
      type: formData.get("type"),
      companies
    });
    AppData.syncCompanyHolidaysFromCalendarEntry({ name, date, companies }, { save: false });
    AppData.runScaleIntegrations([date.slice(0, 7)]);
    AppData.saveState();
    return true;
  }

  function refreshPopupCalendarList(overlay) {
    const list = overlay.querySelector("[data-calendar-holiday-list]");
    if (list) list.innerHTML = renderCalendarHolidays();
    bindCalendarHolidayRemoveButtons(overlay);
  }

  /** Identidade do feriado (data + nome) guardada na célula de ações da linha. */
  function readRegisteredHolidayRef(button) {
    const cell = button.closest("[data-holiday-date][data-holiday-name]");
    if (!cell) return null;
    const date = String(cell.dataset.holidayDate || "").trim();
    const name = String(cell.dataset.holidayName || "").trim();
    if (!date || !name) return null;
    return { date, name };
  }

  function bindCalendarHolidayRemoveButtons(root) {
    root.querySelectorAll("[data-holiday-year-filter]").forEach((select) => {
      if (select.dataset.boundYearFilter) return;
      select.dataset.boundYearFilter = "1";
      select.addEventListener("change", () => {
        registeredHolidayYearFilter = String(select.value || "");
        refreshPopupCalendarList(root);
      });
    });

    root.querySelectorAll("[data-link-employee-cal]").forEach((button) => {
      if (button.dataset.boundLinkEmployeeCal) return;
      button.dataset.boundLinkEmployeeCal = "1";
      button.addEventListener("click", () => {
        const ref = readRegisteredHolidayRef(button);
        if (!ref) return;
        const company = AppData.getPrimaryPageCompany("feriados");
        // Garante que o feriado da empresa existe antes de abrir o modal
        AppData.syncCompanyHolidaysFromCalendarEntry(
          { name: ref.name, date: ref.date, companies: [company] },
          { save: true }
        );
        const data = AppData.getCompanyData(company);
        const companyHoliday = (data.holidays || []).find(
          (h) =>
            h.date === ref.date &&
            AppData.normalizeSearchText(h.name) === AppData.normalizeSearchText(ref.name)
        );
        if (!companyHoliday) {
          alert("Não foi possível localizar o feriado nesta empresa. Recarregue a página e tente novamente.");
          return;
        }
        showAddWorkedEmployeeModal(companyHoliday.id, null);
      });
    });

    root.querySelectorAll("[data-remove-calendar-holiday]").forEach((button) => {
      if (button.dataset.boundRemoveCalendar) return;
      button.dataset.boundRemoveCalendar = "1";
      button.addEventListener("click", () => {
        const ref = readRegisteredHolidayRef(button);
        if (!ref) return;

        // Exclusão sempre no escopo da empresa da aba ativa (a outra empresa
        // mantém o feriado e os vínculos dela).
        const company = AppData.getActiveCompany();
        const links = AppData.countHolidayLinksAllCompanies(ref.date, ref.name);
        const detalhe = links.byCompany[company]
          ? `\n\nIsto vai excluir também ${links.byCompany[company]} vínculo(s) de funcionário(s) desta empresa.`
          : "";
        const message =
          `EXCLUIR DEFINITIVAMENTE o feriado ${ref.name} (${formatDateBR(ref.date)}) de ${company}?` +
          detalhe +
          `\n\nEsta ação é PERMANENTE e NÃO pode ser desfeita. ` +
          `O feriado não voltará por sincronização nem por cadastro automático.`;
        if (!window.confirm(message)) return;

        const result = AppData.removeHolidayEverywhere(ref.date, ref.name, { companies: [company] });
        if (result?.ok) {
          const vinculos = result.removedLinks
            ? ` (${result.removedLinks} vínculo(s) removido(s))`
            : "";
          window.App?.toast?.(
            `Feriado "${result.name}" excluído definitivamente${vinculos}.`,
            "success"
          );
        }
        refreshPopupCalendarList(root);
        window.App.renderCurrent();
      });
    });

    root.querySelectorAll("[data-edit-calendar-holiday]").forEach((button) => {
      if (button.dataset.boundEditCalendar) return;
      button.dataset.boundEditCalendar = "1";
      button.addEventListener("click", () => {
        const ref = readRegisteredHolidayRef(button);
        if (!ref) return;
        showEditCalendarHolidayModal(ref, () => refreshPopupCalendarList(root));
      });
    });
  }

  /**
   * Edição de um feriado cadastrado, identificado por data + nome (e não por id),
   * porque a mesma identidade pode existir no calendário e no bloco da empresa.
   * A alteração é aplicada nas duas fontes, preservando os vínculos existentes.
   */
  function showEditCalendarHolidayModal(ref, onDone) {
    document.getElementById("calendarEditPicker")?.remove();
    if (!ref?.date || !ref?.name) return;

    const company = AppData.getActiveCompany();
    const holiday =
      AppData.listRegisteredHolidays(company).find(
        (item) =>
          item.date === ref.date &&
          AppData.normalizeSearchText(item.name) === AppData.normalizeSearchText(ref.name)
      ) || { ...ref, type: "nacional", workedCount: 0 };

    const typeOptions = ["nacional", "estadual", "municipal", "interno"]
      .map((t) => `<option value="${t}" ${(holiday.type || "nacional") === t ? "selected" : ""}>${t[0].toUpperCase() + t.slice(1)}</option>`)
      .join("");

    const picker = document.createElement("div");
    picker.id = "calendarEditPicker";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">Editar feriado cadastrado</p>
      <p class="co-picker-hint">Vinculado a <strong>${esc(company)}</strong>.${
        holiday.workedCount
          ? ` Os ${holiday.workedCount} vínculo(s) de funcionários são preservados.`
          : ""
      }</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Nome do feriado
          <input id="calEditName" class="field-select" value="${esc(holiday.name)}" autocomplete="off">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Data
          <input id="calEditDate" type="date" class="field-select" value="${esc(holiday.date)}">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.85rem;font-weight:600">
          Tipo
          <select id="calEditType" class="field-select">${typeOptions}</select>
        </label>
      </div>
      <div class="co-picker-actions">
        <button id="calEditCancel" class="secondary btn-sm" type="button">Cancelar</button>
        <button id="calEditSave" class="primary btn-sm" type="button">Salvar</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    picker.querySelector("#calEditCancel").addEventListener("click", () => backdrop.remove());

    picker.querySelector("#calEditSave").addEventListener("click", () => {
      const name = String(picker.querySelector("#calEditName").value || "").trim();
      const date = String(picker.querySelector("#calEditDate").value || "").trim();
      const type = picker.querySelector("#calEditType").value;
      if (!name || !date) {
        alert("Preencha nome e data do feriado.");
        return;
      }

      const result = AppData.updateHolidayEverywhere(
        ref.date,
        ref.name,
        { name, date, type },
        { companies: [company] }
      );
      if (!result?.ok) {
        alert(result?.error || "Não foi possível salvar o feriado.");
        return;
      }
      // Garante que o feriado editado continua existindo no bloco da empresa ativa.
      AppData.syncCompanyHolidaysFromCalendarEntry(
        { name: result.name, date: result.date, companies: [company] },
        { save: true }
      );
      backdrop.remove();
      window.App?.toast?.(`Feriado "${result.name}" atualizado.`, "success");
      window.App.renderCurrent();
      if (typeof onDone === "function") onDone();
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

  function closeHolidayRegisterPopup() {
    document.getElementById("holidayRegisterPopup")?.remove();
  }


  function renderHolidayRegisterPopupBody(data) {
    const company = AppData.getActiveCompany();
    return `
      <div class="feriados-register-content">
        <form id="calendarHolidayForm" class="popup-form feriados-popup-form feriados-panel-form">
          <div class="feriados-panel-body">
            <p class="help-text compact-help">Calendário vinculado à empresa da aba ativa: <strong>${esc(company)}</strong>.</p>
            <div class="popup-grid">
              ${renderCalendarHolidayNameField()}
              <label class="popup-field">Data<input type="date" name="date" required value="${AppData.todayISO()}"></label>
              <label class="popup-field">Tipo
                <select name="type">
                  <option value="nacional">Nacional</option>
                  <option value="estadual">Estadual</option>
                  <option value="municipal">Municipal</option>
                  <option value="interno">Interno</option>
                </select>
              </label>
            </div>
          </div>
          <div class="popup-actions feriados-panel-footer feriados-panel-footer-compact">
            <button class="secondary btn-sm" type="button" data-close-holiday-popup>Cancelar</button>
            <button class="primary btn-sm" type="submit">Salvar feriado</button>
          </div>
        </form>
        <div class="feriados-register-list">
          <h4 class="feriados-register-title">Feriados cadastrados</h4>
          <div class="feriados-popup-calendar-list" data-calendar-holiday-list>${renderCalendarHolidays()}</div>
        </div>
      </div>
    `;
  }

  function renderWorkedEmployeesList(data) {
    const company = AppData.getActiveCompany();
    const rows = [];
    (data.holidays || []).forEach((holiday) => {
      (holiday.workedEmployees || []).forEach((item) => {
        if (!item?.employeeId) return;
        const name = AppData.getEmployeeName(item.employeeId, data);
        const status = AppData.resolveWorkedHolidayStatus(item, holiday.date);
        rows.push({ holiday, item, name, status });
      });
    });
    rows.sort((a, b) => String(b.holiday.date).localeCompare(String(a.holiday.date)) || a.name.localeCompare(b.name, "pt-BR"));

    const header = `<h4 class="feriados-manager-title">Funcionários no feriado — ${esc(company)} <span class="feriados-manager-badge">${rows.length}</span></h4>`;
    if (!rows.length) {
      return `${header}<p class="help-text compact-help">Nenhum funcionário vinculado a feriados ainda. Os vínculos aparecem automaticamente ao lançar o trabalho no feriado pela Escala de Folga.</p>`;
    }

    return `
      ${header}
      <div class="table-wrap table-compact feriados-manager-table">
        <table>
          <thead>
            <tr><th>Data</th><th>Feriado</th><th>Funcionário</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                <td>${formatDateBR(row.holiday.date)}</td>
                <td>${esc(row.holiday.name)}</td>
                <td>${esc(row.name)}</td>
                <td><span class="pill ${esc(row.status.key)}">${esc(row.status.label)}</span></td>
                <td class="actions">
                  <button class="link-button danger" type="button" data-remove-worked="${esc(row.holiday.id)}|${esc(row.item.employeeId)}">Excluir vínculo</button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function refreshPopupWorkedList(overlay) {
    const host = overlay?.querySelector("[data-worked-list]");
    if (!host) return;
    const data = AppData.getCompanyData(AppData.getActiveCompany());
    host.innerHTML = renderWorkedEmployeesList(data);
    bindWorkedEmployeesActions(overlay);
  }

  function bindWorkedEmployeesActions(overlay) {
    overlay.querySelectorAll("[data-remove-worked]").forEach((button) => {
      if (button.dataset.boundRemoveWorked) return;
      button.dataset.boundRemoveWorked = "1";
      button.addEventListener("click", () => {
        const [holidayId, employeeId] = String(button.dataset.removeWorked || "").split("|");
        if (!holidayId || !employeeId) return;
        if (!window.confirm("Remover o vínculo deste funcionário com este feriado?")) return;
        AppData.removeWorkedEmployeeFromHoliday(holidayId, employeeId);
        refreshPopupWorkedList(overlay);
        window.App.renderCurrent();
      });
    });
  }

  function bindHolidayPopupEvents(overlay, container) {
    const close = () => closeHolidayRegisterPopup();
    overlay.querySelectorAll("[data-close-holiday-popup]").forEach((btn) => btn.addEventListener("click", close));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });

    const onKey = (event) => {
      if (event.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        close();
      }
    };
    document.addEventListener("keydown", onKey);


    bindWorkedHolidayNameField(overlay);
    bindCalendarHolidayNameField(overlay);
    bindCalendarHolidayRemoveButtons(overlay);
    bindCompanyHolidayManager(overlay);

    overlay.querySelector("#holidayForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!submitWorkedHolidayForm(event.currentTarget)) return;
      closeHolidayRegisterPopup();
      window.App.renderCurrent();
    });

    overlay.querySelector("#calendarHolidayForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!submitCalendarHolidayForm(event.currentTarget)) return;
      event.currentTarget.reset();
      refreshPopupCalendarList(overlay);
      bindWorkedHolidayNameField(overlay);
      window.App.renderCurrent();
    });
  }

  function openHolidayRegisterPopup(container, tab) {
    closeHolidayRegisterPopup();
    const company = AppData.getPrimaryPageCompany("feriados");
    const data = AppData.getCompanyData(company);
    const employees = (data.employees || []).filter((employee) => AppData.isEmployeeActive(employee));
    const companyList = window.CompanyUI?.listCompanies?.() || AppData.COMPANIES;
    const calendarCompanyOptions = [
      `<option value="ambas">Todas as empresas</option>`,
      ...companyList.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`)
    ].join("");

    const overlay = document.createElement("div");
    overlay.id = "holidayRegisterPopup";
    overlay.className = "popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="popup-card feriados-register-popup">
        <div class="popup-header">
          <h3>Gerenciar Feriados</h3>
          <button class="popup-close" type="button" data-close-holiday-popup aria-label="Fechar">✕</button>
        </div>
        ${renderHolidayRegisterPopupBody(data, employees, calendarCompanyOptions)}
      </div>
    `;
    document.body.appendChild(overlay);
    bindHolidayPopupEvents(overlay, container);
  }

  function bindStaticEvents(container) {
    container.querySelector("#openLinkEmployeeHoliday")?.addEventListener("click", () => {
      showLinkEmployeeToHolidayModal(container);
    });

    container.querySelector("#openHolidayRegister")?.addEventListener("click", () => {
      openHolidayRegisterPopup(container);
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
          AppData.getPrimaryPageCompany("feriados"),
          AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados")).employees[0]?.name || "Nome do funcionário",
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
    (window.CompanyUI?.listCompanies?.() || AppData.COMPANIES).forEach((company) => {
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

    (AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados")).holidays || []).forEach((holiday) => {
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

  function renderCompanyHolidaysManager(data) {
    const company = AppData.getPrimaryPageCompany("feriados");
    const holidays = [...(data.holidays || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const rows = holidays.length
      ? holidays
          .map((holiday) => {
            const vinculos = (holiday.workedEmployees || []).length;
            return `
              <tr>
                <td>${formatDateBR(holiday.date)}</td>
                <td>${esc(holiday.name)}</td>
                <td class="feriados-manager-count">${vinculos}</td>
                <td class="actions">
                  <button class="link-button" type="button" data-popup-edit-holiday="${esc(holiday.id)}">Editar</button>
                  <button class="link-button danger" type="button" data-popup-remove-holiday="${esc(holiday.id)}">Excluir</button>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="4" class="help-text">Nenhum feriado cadastrado para ${esc(company)}.</td></tr>`;

    return `
      <h4 class="feriados-manager-title">Feriados cadastrados — ${esc(company)} <span class="feriados-manager-badge">${holidays.length}</span></h4>
      <p class="help-text compact-help">Editar ou excluir afeta todos os funcionários vinculados a este feriado.</p>
      <div class="table-wrap table-compact feriados-manager-table">
        <table>
          <thead>
            <tr><th>Data</th><th>Nome do Feriado</th><th>Funcionários Vinculados</th><th>Ações</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function refreshPopupCompanyHolidayList(overlay) {
    const host = overlay?.querySelector("[data-company-holiday-manager]");
    if (!host) return;
    const data = AppData.getCompanyData(AppData.getPrimaryPageCompany("feriados"));
    host.innerHTML = renderCompanyHolidaysManager(data);
    bindCompanyHolidayManager(overlay);
  }

  function bindCompanyHolidayManager(overlay) {
    overlay.querySelectorAll("[data-popup-edit-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        showEditHolidayModal(button.dataset.popupEditHoliday, () => refreshPopupCompanyHolidayList(overlay));
      });
    });
    overlay.querySelectorAll("[data-popup-remove-holiday]").forEach((button) => {
      button.addEventListener("click", () => {
        const holidayId = button.dataset.popupRemoveHoliday;
        const company = AppData.getPrimaryPageCompany("feriados");
        const data = AppData.getCompanyData(company);
        const holiday = (data.holidays || []).find((item) => item.id === holidayId);
        if (!holiday) return;
        if (!confirmDeleteHolidayPermanent(holiday)) return;
        const result = AppData.removeCompanyHolidayPermanently(holidayId, { company });
        if (result?.ok) {
          window.App?.toast?.(`Feriado "${result.name}" excluído definitivamente.`, "success");
        }
        refreshPopupCompanyHolidayList(overlay);
        window.App.renderCurrent();
      });
    });
  }

  // O recorte por empresa do calendário agora vive em AppData.listRegisteredHolidays
  // (calendarHolidayTargetsCompany), que une calendário + feriados da empresa.

  // Filtro de ano da lista "Feriados cadastrados" ("" = todos os anos).
  // Guardado em memória para sobreviver ao refresh da lista dentro do popup.
  let registeredHolidayYearFilter = "";

  /**
   * Lista "Feriados cadastrados" do popup Gerenciar Feriados.
   *
   * Mostra TODOS os feriados cadastrados da empresa ativa, de qualquer ano,
   * somando as duas fontes (calendário global + feriados do bloco da empresa).
   * Antes lia só o calendário, então feriados de outros anos que existiam
   * apenas no bloco da empresa não apareciam.
   */
  function renderCalendarHolidays() {
    const company = AppData.getActiveCompany();
    const all = AppData.listRegisteredHolidays(company);
    const years = [...new Set(all.map((item) => item.year))].sort();
    if (registeredHolidayYearFilter && !years.includes(registeredHolidayYearFilter)) {
      registeredHolidayYearFilter = "";
    }
    const rows = registeredHolidayYearFilter
      ? all.filter((item) => item.year === registeredHolidayYearFilter)
      : all;

    const yearOptions = [
      `<option value="" ${registeredHolidayYearFilter ? "" : "selected"}>Todos os anos (${all.length})</option>`,
      ...years.map((year) => {
        const total = all.filter((item) => item.year === year).length;
        const selected = registeredHolidayYearFilter === year ? "selected" : "";
        return `<option value="${esc(year)}" ${selected}>${esc(year)} (${total})</option>`;
      })
    ].join("");

    const header = `
      <div class="feriados-manager-head">
        <h4 class="feriados-manager-title">Feriados — ${esc(company)} <span class="feriados-manager-badge">${rows.length}</span></h4>
        ${
          years.length > 1
            ? `<label class="feriados-manager-filter">Ano
                 <select class="field-select btn-sm" data-holiday-year-filter>${yearOptions}</select>
               </label>`
            : ""
        }
      </div>
    `;

    if (!all.length) {
      return `${header}<p class="help-text compact-help">Nenhum feriado cadastrado para ${esc(company)}.</p>`;
    }
    if (!rows.length) {
      return `${header}<p class="help-text compact-help">Nenhum feriado cadastrado em ${esc(registeredHolidayYearFilter)} para ${esc(company)}.</p>`;
    }

    return `
      ${header}
      <div class="table-wrap table-compact feriados-manager-table">
        <table>
          <thead>
            <tr><th>Data</th><th>Nome</th><th>Tipo</th><th>Vínculos</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (holiday) => `
              <tr>
                <td>${formatDateBR(holiday.date)}</td>
                <td>${esc(holiday.name)}</td>
                <td>${esc(holiday.type)}</td>
                <td class="feriados-manager-count">${holiday.workedCount}</td>
                <td class="actions" data-holiday-date="${esc(holiday.date)}" data-holiday-name="${esc(holiday.name)}">
                  <button class="link-button success" data-link-employee-cal type="button">+ Funcionário</button>
                  <button class="link-button" data-edit-calendar-holiday type="button">Editar</button>
                  <button class="link-button danger" data-remove-calendar-holiday type="button">Excluir</button>
                </td>
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

    const company = AppData.getPrimaryPageCompany("feriados");
    const data = AppData.getCompanyData(company);
    const allLines = buildLines(data, company);
    const filteredLines = applyFilters(allLines);
    const lineStats = computeStatsFromLines(allLines);
    const autoPendingCount = window.ScaleRules?.countAutoPendingHolidays(company) || 0;

    container.innerHTML = `
      ${window.CompanyUI?.renderToolbar?.("feriados") || ""}
      <div class="feriados-page-toolbar">
        <div class="dash-metrics feriados-quick-nav" data-holiday-quick-nav>
          ${renderQuickNav(allLines, lineStats, autoPendingCount)}
        </div>
        <div class="feriados-toolbar-actions">
          <button type="button" class="primary" id="openLinkEmployeeHoliday">+ Vincular funcionário a feriado</button>
          <button type="button" class="primary" id="openHolidayRegister">+ Cadastrar feriado</button>
        </div>
      </div>

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
    window.CompanyUI?.bindToolbar?.(container, "feriados", () => render(container));
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
