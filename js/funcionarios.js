(function () {
  const SHIFT_PRESETS_KEY = "chezPituShiftPresets";
  const DEFAULT_SHIFT_PRESETS = [
    "06h às 14:20h",
    "07h às 15:20h",
    "09h às 17:20h",
    "10h às 18:20h",
    "14h às 22:20h",
    "15h às 23:20h",
    "22h às 06:20h"
  ];

  function parseShiftStart(preset) {
    const match = String(preset).match(/^(\d+)h/i);
    return match ? parseInt(match[1], 10) : 99;
  }

  function sortShiftPresets(presets) {
    return [...presets].sort((a, b) => parseShiftStart(a) - parseShiftStart(b));
  }

  // Corrige formatos como "1920h" → "19:20h" (dois pontos ausentes após "às")
  function repairShiftPreset(preset) {
    return String(preset).replace(/às\s+(\d{2})(\d{2})h/g, "às $1:$2h");
  }

  function getShiftPresets() {
    try {
      const saved = localStorage.getItem(SHIFT_PRESETS_KEY);
      const presets = saved ? JSON.parse(saved) : [...DEFAULT_SHIFT_PRESETS];
      const repaired = presets.map(repairShiftPreset);
      // Se algum foi corrigido, persiste a versão reparada
      if (JSON.stringify(repaired) !== JSON.stringify(presets)) {
        localStorage.setItem(SHIFT_PRESETS_KEY, JSON.stringify(sortShiftPresets(repaired)));
      }
      return sortShiftPresets(repaired);
    } catch { return [...DEFAULT_SHIFT_PRESETS]; }
  }

  function addShiftPreset(preset) {
    const presets = getShiftPresets();
    const trimmed = preset.trim();
    if (trimmed && !presets.includes(trimmed)) {
      presets.push(trimmed);
      const sorted = sortShiftPresets(presets);
      localStorage.setItem(SHIFT_PRESETS_KEY, JSON.stringify(sorted));
      return sorted;
    }
    return presets;
  }

  function shiftSelectOptions(presets, selected) {
    // Exclui entradas que sejam exatamente um código de escala (ex: TM, MM, NM…)
    const scaleCodes = new Set((AppData.SCALE_CODES || []).map((c) => c.code).filter(Boolean));
    const filtered = presets.filter((p) => !scaleCodes.has(p.trim()));
    return (
      `<option value="">— Selecionar horário —</option>` +
      filtered.map((p) => `<option value="${esc(p)}" ${p === selected ? "selected" : ""}>${esc(p)}</option>`).join("") +
      `<option value="__new_shift__">➕ Adicionar horário</option>`
    );
  }

  const listFilters = {
    search: "",
    company: "todos",
    department: "todos",
    role: "todos",
    status: "todos",
    source: "todos"
  };

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function dayOptions(selected) {
    return [`<option value="" ${!selected ? "selected" : ""}>—</option>`]
      .concat(
        AppData.WEEK_DAYS.map(
          (day) => `<option value="${day}" ${day === selected ? "selected" : ""}>${day}</option>`
        )
      )
      .join("");
  }

  function statusOptions(selected) {
    return ["Ativo", "Inativo"].map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join("");
  }

  function originBadge(employee) {
    if (employee.source === "imported") {
      return `<span class="pill info" title="Dados importados de arquivo">Importado</span>`;
    }
    return `<span class="pill muted" title="Cadastrado manualmente no sistema">Manual</span>`;
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function normalizeSearchDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function listCompanies() {
    if (typeof AppData.getCompanies === "function") {
      const list = AppData.getCompanies();
      if (list.length) return list;
    }
    const keys = Object.keys(AppData.state?.companies || {});
    if (keys.length) {
      return keys.sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return AppData.COMPANIES;
  }

  function getAllEmployeesFlat() {
    const seen = new Set();
    const flat = [];
    listCompanies().forEach((company) => {
      (AppData.getCompanyData(company)?.employees || []).forEach((employee) => {
        if (!employee?.id || seen.has(employee.id)) return;
        seen.add(employee.id);
        flat.push({ ...employee, company });
      });
    });
    if (flat.length) return flat;
    Object.keys(AppData.state?.companies || {}).forEach((company) => {
      (AppData.state.companies[company]?.employees || []).forEach((employee) => {
        if (!employee?.id || seen.has(employee.id)) return;
        seen.add(employee.id);
        flat.push({ ...employee, company });
      });
    });
    return flat;
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function filterEmployees(employees) {
    const search = normalizeSearch(listFilters.search);
    const searchDigits = normalizeSearchDigits(listFilters.search);

    return employees.filter((employee) => {
      const searchable = normalizeSearch(
        [employee.name, employee.cpf, employee.role, employee.department, employee.company, employee.ctps].join(" ")
      );
      const cpfDigits = normalizeSearchDigits(employee.cpf);
      const matchesSearch =
        !search ||
        searchable.includes(search) ||
        (searchDigits.length >= 3 && cpfDigits.includes(searchDigits));
      if (!matchesSearch) return false;
      if (listFilters.company !== "todos" && employee.company !== listFilters.company) return false;
      if (listFilters.department !== "todos" && employee.department !== listFilters.department) return false;
      if (listFilters.role !== "todos" && employee.role !== listFilters.role) return false;
      if (listFilters.status !== "todos" && employee.status !== listFilters.status) return false;
      if (listFilters.source !== "todos" && (employee.source || "manual") !== listFilters.source) return false;
      return true;
    });
  }

  function renderEmployeeStats() {
    const counts = AppData.getEmployeeCounts();
    return counts.byCompany
      .map(
        (item) => `
        <article class="stat-chip">
          <span>${esc(item.company)}</span>
          <strong>${item.total}</strong>
        </article>
      `
      )
      .concat(`<article class="stat-chip highlight"><span>Total</span><strong>${counts.total}</strong></article>`)
      .join("");
  }

  function renderTopbarFilters(employees) {
    const departments = uniqueSorted(employees.map((item) => item.department));
    const roles = uniqueSorted(employees.map((item) => item.role));
    const companyOptions = [`<option value="todos">Todas</option>`].concat(
      listCompanies().map(
        (company) =>
          `<option value="${esc(company)}" ${listFilters.company === company ? "selected" : ""}>${esc(company)}</option>`
      )
    );
    const departmentOptions = [`<option value="todos">Todos</option>`].concat(
      departments.map(
        (department) =>
          `<option value="${esc(department)}" ${listFilters.department === department ? "selected" : ""}>${esc(department)}</option>`
      )
    );
    const roleOptions = [`<option value="todos">Todos</option>`].concat(
      roles.map((role) => `<option value="${esc(role)}" ${listFilters.role === role ? "selected" : ""}>${esc(role)}</option>`)
    );

    return `
      <label class="func-list-toolbar-search">Buscar
        <input id="employeeListSearch" type="search" value="${esc(listFilters.search)}" placeholder="Nome, CPF, cargo, setor ou empresa">
      </label>
      <div class="func-list-toolbar-filters">
        <label>Empresa<select id="employeeFilterCompany">${companyOptions.join("")}</select></label>
        <label>Setor<select id="employeeFilterDepartment">${departmentOptions.join("")}</select></label>
        <label>Cargo<select id="employeeFilterRole">${roleOptions.join("")}</select></label>
        <label>Status<select id="employeeFilterStatus">
          <option value="todos">Todos</option>
          <option value="Ativo" ${listFilters.status === "Ativo" ? "selected" : ""}>Ativo</option>
          <option value="Inativo" ${listFilters.status === "Inativo" ? "selected" : ""}>Inativo</option>
        </select></label>
        <label>Origem<select id="employeeFilterSource">
          <option value="todos">Todas</option>
          <option value="imported" ${listFilters.source === "imported" ? "selected" : ""}>Importado</option>
          <option value="manual" ${listFilters.source === "manual" ? "selected" : ""}>Manual</option>
        </select></label>
        <button id="clearEmployeeFilters" class="secondary btn-sm" type="button">Limpar filtros</button>
      </div>
    `;
  }

  function renderListToolbar(allEmployees, filteredCount, companyCount, totalCount) {
    return `
      <div class="func-list-toolbar">
        <div class="func-list-toolbar-meta">
          <span class="func-list-toolbar-eyebrow">Empresa ativa no sistema</span>
          <strong class="func-list-toolbar-company">${esc(AppData.state.selectedCompany)}</strong>
          <small id="employeeListCount" class="func-list-toolbar-count">${filteredCount} exibidos · ${companyCount} na empresa · ${totalCount} no grupo</small>
        </div>
        <div class="func-list-toolbar-controls">
          ${renderTopbarFilters(allEmployees)}
        </div>
      </div>
    `;
  }

  function companyFormOptions(selected) {
    return listCompanies().map(
      (company) => `<option value="${esc(company)}" ${company === selected ? "selected" : ""}>${esc(company)}</option>`
    ).join("");
  }

  function closeCompanyPopup() {
    document.getElementById("companyPopup")?.remove();
  }

  function renderCompanyFormHTML(isEdit, companyKey) {
    const nameField = isEdit
      ? `<label>Nome no sistema<input value="${esc(companyKey)}" readonly disabled></label>`
      : `<label>Nome no sistema<input name="companyKey" required placeholder="Ex.: Chez Pitu" autocomplete="off"></label>`;
    return `
      ${nameField}
      <div class="func-form-row cols-3">
        <label>Razão social<input name="legalName" required></label>
        <label>CNPJ<input name="cnpj" required placeholder="00.000.000/0000-00" autocomplete="off"></label>
        <label>Responsável<input name="responsibleName" placeholder="Nome completo do responsável"></label>
      </div>
      <div class="func-logo-section func-popup-logo-section">
        <p class="func-logo-label">Logo (escala e recibos)</p>
        <div class="func-logo-row">
          <div class="func-logo-preview" id="companyPopupLogoPreview">
            <span class="func-logo-placeholder">Sem logo</span>
          </div>
          <div class="func-logo-controls">
            <label class="btn secondary btn-sm func-logo-upload-btn">
              Selecionar imagem
              <input type="file" id="companyPopupLogoInput" accept="image/*" style="display:none">
            </label>
            <button id="companyPopupRemoveLogo" class="secondary btn-sm" type="button" style="display:none">Remover logo</button>
          </div>
        </div>
      </div>
      <div class="popup-actions func-form-actions">
        <button type="button" class="btn btn-cancel" id="companyPopupCancel">Cancelar</button>
        <button class="primary btn-sm" type="submit">Salvar empresa</button>
      </div>
    `;
  }

  function fillCompanyPopupForm(form, companyKey) {
    const info = AppData.getCompanyData(companyKey)?.companyInfo || {};
    form.elements.legalName.value = info.legalName || companyKey;
    form.elements.cnpj.value = info.cnpj || "";
    if (form.elements.responsibleName) form.elements.responsibleName.value = info.responsibleName || "";
    updateCompanyPopupLogoPreview(form, info.logoDataUrl || "");
  }

  function readCompanyPopupLogo(form) {
    const img = form.closest(".popup-card")?.querySelector("#companyPopupLogoPreview img");
    return img?.src || "";
  }

  function updateCompanyPopupLogoPreview(form, logoDataUrl) {
    const preview = form.closest(".popup-card")?.querySelector("#companyPopupLogoPreview");
    const removeBtn = form.closest(".popup-card")?.querySelector("#companyPopupRemoveLogo");
    if (!preview) return;
    preview.replaceChildren();
    const safeUrl = String(logoDataUrl || "").trim();
    if (safeUrl.startsWith("data:image/")) {
      const img = document.createElement("img");
      img.src = safeUrl;
      img.alt = "Logo";
      img.className = "func-logo-img";
      preview.appendChild(img);
      if (removeBtn) removeBtn.style.display = "";
      return;
    }
    const placeholder = document.createElement("span");
    placeholder.className = "func-logo-placeholder";
    placeholder.textContent = "Sem logo";
    preview.appendChild(placeholder);
    if (removeBtn) removeBtn.style.display = "none";
  }

  function bindCompanyPopupForm(form, options = {}) {
    const isEdit = Boolean(options.companyKey);
    const companyKey = options.companyKey || "";

    const logoInput = form.querySelector("#companyPopupLogoInput");
    logoInput?.addEventListener("change", () => {
      const file = logoInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        updateCompanyPopupLogoPreview(form, event.target.result);
      };
      reader.readAsDataURL(file);
    });

    form.querySelector("#companyPopupRemoveLogo")?.addEventListener("click", () => {
      if (logoInput) logoInput.value = "";
      updateCompanyPopupLogoPreview(form, "");
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      try {
        let targetKey = companyKey;
        if (!isEdit) {
          targetKey = AppData.registerCompany(payload.companyKey);
        }
        AppData.updateCompanyInfo(
          {
            legalName: payload.legalName,
            cnpj: payload.cnpj,
            responsibleName: payload.responsibleName
          },
          targetKey
        );
        AppData.updateCompanyLogo(readCompanyPopupLogo(form), targetKey);
        if (!isEdit || targetKey === AppData.state.selectedCompany) {
          AppData.setSelectedCompany(targetKey);
        }
        closeCompanyPopup();
        window.App.renderCurrent();
        window.App?.toast?.("Dados da empresa salvos.", "success");
      } catch (error) {
        alert(error.message || "Não foi possível salvar a empresa.");
      }
    });
  }

  function openCompanyPopup(options = {}) {
    closeCompanyPopup();
    const isEdit = Boolean(options.companyKey);
    const overlay = document.createElement("div");
    overlay.id = "companyPopup";
    overlay.className = "popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="popup-card popup-card-company">
        <div class="popup-header">
          <h3>${isEdit ? "Editar empresa" : "Nova empresa"}</h3>
          <button class="popup-close" id="companyPopupClose" type="button" aria-label="Fechar">✕</button>
        </div>
        <form id="companyPopupForm" class="popup-form func-popup-form func-form-horizontal">
          ${renderCompanyFormHTML(isEdit, options.companyKey || "")}
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#companyPopupForm");
    bindCompanyPopupForm(form, options);
    if (isEdit) fillCompanyPopupForm(form, options.companyKey);

    overlay.querySelector("#companyPopupClose").addEventListener("click", closeCompanyPopup);
    overlay.querySelector("#companyPopupCancel").addEventListener("click", closeCompanyPopup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCompanyPopup();
    });

    (isEdit ? form.elements.legalName : form.elements.companyKey)?.focus();
  }

  function companyRows() {
    const active = AppData.state.selectedCompany;
    return listCompanies()
      .map((companyKey) => {
        const block = AppData.getCompanyData(companyKey);
        const info = block?.companyInfo || {};
        const employeeCount = block?.employees?.length || 0;
        const isActive = companyKey === active;
        return `
          <tr class="${isActive ? "func-company-row-active" : ""}">
            <td>
              ${isActive ? `<span class="pill success">Ativa</span>` : `<button type="button" class="link-button" data-activate-company="${esc(companyKey)}">Definir ativa</button>`}
            </td>
            <td><strong>${esc(companyKey)}</strong></td>
            <td>${esc(info.legalName || companyKey)}</td>
            <td>${esc(info.cnpj || "—")}</td>
            <td>${esc(info.responsibleName || "—")}</td>
            <td>${employeeCount}</td>
            <td class="actions">
              <button type="button" class="link-button" data-edit-company="${esc(companyKey)}">Editar</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function departmentSelectOptions(allEmployees, selected) {
    const depts = uniqueSorted(allEmployees.map((e) => e.department).filter(Boolean));
    return (
      `<option value="">— Selecionar setor —</option>` +
      depts.map((d) => `<option value="${esc(d)}" ${d === selected ? "selected" : ""}>${esc(d)}</option>`).join("") +
      `<option value="__new__">➕ Cadastrar novo setor</option>`
    );
  }

  function sundaySelectorHTML(sundayOffWeeks, doubleSundayOff) {
    const weeks = String(sundayOffWeeks || "").split(",").map((s) => s.trim()).filter(Boolean);
    const isDouble = doubleSundayOff === "true" || doubleSundayOff === true;
    const pills = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<label class="sunday-pill">
            <input type="checkbox" class="sunday-off-check" value="${n}" ${weeks.includes(String(n)) ? "checked" : ""}>
            <span>${n}º Dom</span>
          </label>`
      )
      .join("");
    return `
      <div class="sunday-field-wrapper">
        <span class="sunday-field-label">Domingos de folga no mês</span>
        <div class="sunday-selector">${pills}</div>
        <label class="double-sunday-label">
          <input type="checkbox" class="double-sunday-check" ${isDouble ? "checked" : ""}>
          <span>2 domingos/mês</span>
          <small>— regime feminino</small>
        </label>
        <input type="hidden" name="sundayOffWeeks" id="sundayOffWeeksHidden" value="${esc(weeks.join(","))}">
        <input type="hidden" name="doubleSundayOff" id="doubleSundayOffHidden" value="${isDouble ? "true" : "false"}">
      </div>
    `;
  }

  function setupSundayCheckboxes(form) {
    const checks = form.querySelectorAll(".sunday-off-check");
    const doubleToggle = form.querySelector(".double-sunday-check");
    const hiddenWeeks = form.querySelector("#sundayOffWeeksHidden");
    const hiddenDouble = form.querySelector("#doubleSundayOffHidden");

    function syncHidden() {
      if (hiddenWeeks) hiddenWeeks.value = [...checks].filter((c) => c.checked).map((c) => c.value).join(",");
      if (hiddenDouble) hiddenDouble.value = doubleToggle?.checked ? "true" : "false";
    }

    checks.forEach((cb) => {
      cb.addEventListener("change", () => {
        const max = doubleToggle?.checked ? 2 : 1;
        const checked = [...checks].filter((c) => c.checked);
        if (checked.length > max) {
          if (max === 1) {
            checks.forEach((c) => { if (c !== cb) c.checked = false; });
          } else {
            cb.checked = false;
          }
        }
        syncHidden();
      });
    });

    doubleToggle?.addEventListener("change", () => {
      if (!doubleToggle.checked) {
        const checked = [...checks].filter((c) => c.checked);
        checked.slice(1).forEach((c) => { c.checked = false; });
      }
      syncHidden();
    });
  }

  function closeEmployeePopup() {
    document.getElementById("employeePopup")?.remove();
  }

  function renderEmployeeFormHTML(allEmployees) {
    return `
      <input type="hidden" name="id">
      <div class="func-form-row cols-3">
        <label>Nome completo<input name="name" required autocomplete="name"></label>
        <label>CPF<input name="cpf" required placeholder="000.000.000-00" autocomplete="off"></label>
        <label>CTPS<input name="ctps" required autocomplete="off"></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Cargo<input name="role" required></label>
        <label class="func-dept-label">Setor
          <select id="departmentSelect" name="department" required>
            ${departmentSelectOptions(allEmployees, "")}
          </select>
          <input id="newDepartmentInput" class="func-dept-new-input" placeholder="Nome do novo setor" style="display:none" autocomplete="off">
        </label>
        <label>Status<select name="status">${statusOptions("Ativo")}</select></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Admissão<input type="date" name="admissionDate" required value="${AppData.todayISO()}"></label>
        <label>Folga fixa
          <select name="fixedDay" id="fixedDaySelect">${dayOptions("")}</select>
          <small id="fixedDayScheduleHint" class="help-text compact-help" style="display:none"></small>
        </label>
        <label class="func-shift-label">Horário
          <select id="shiftSelect" name="defaultShift">
            ${shiftSelectOptions(getShiftPresets(), "")}
          </select>
          <input id="newShiftInput" class="func-dept-new-input" placeholder="Ex.: 14h às 22:20h" style="display:none" autocomplete="off">
        </label>
      </div>
      <div class="func-form-row">
        ${sundaySelectorHTML("", "false")}
      </div>
      <div class="func-form-row cols-vt">
        <label>Valor diário VT<input name="vtDaily" inputmode="decimal" placeholder="17,30" autocomplete="off"></label>
        <label>Origem<span id="employeeOriginDisplay" class="func-origin-readonly">Manual</span></label>
        <label>Empresa<select name="employeeCompany">${companyFormOptions(AppData.state.selectedCompany)}</select></label>
      </div>
      <div class="func-form-row">
        <label class="full">Observações<textarea name="notes" rows="2"></textarea></label>
      </div>
      <div class="popup-actions func-form-actions">
        <button type="button" class="btn btn-cancel" id="employeePopupCancel">Cancelar</button>
        <button class="primary btn-sm" type="submit">Salvar funcionário</button>
      </div>
    `;
  }

  function resetEmployeeForm(form) {
    form.reset();
    const originEl = form.querySelector("#employeeOriginDisplay");
    if (originEl) originEl.textContent = "Manual";
    const companyField = form.elements.employeeCompany;
    if (companyField) companyField.value = AppData.state.selectedCompany;
    if (form.elements.admissionDate) form.elements.admissionDate.value = AppData.todayISO();

    const shiftSelect = form.querySelector("#shiftSelect");
    const newShiftInput = form.querySelector("#newShiftInput");
    if (shiftSelect) shiftSelect.value = "";
    if (newShiftInput) { newShiftInput.style.display = "none"; newShiftInput.value = ""; }

    const deptSelect = form.querySelector("#departmentSelect");
    const newDeptInput = form.querySelector("#newDepartmentInput");
    if (deptSelect) deptSelect.value = "";
    if (newDeptInput) { newDeptInput.style.display = "none"; newDeptInput.value = ""; }

    form.querySelectorAll(".sunday-off-check").forEach((cb) => { cb.checked = false; });
    const doubleCheck = form.querySelector(".double-sunday-check");
    if (doubleCheck) doubleCheck.checked = false;
    const hiddenWeeks = form.querySelector("#sundayOffWeeksHidden");
    const hiddenDouble = form.querySelector("#doubleSundayOffHidden");
    if (hiddenWeeks) hiddenWeeks.value = "";
    if (hiddenDouble) hiddenDouble.value = "false";

    const fixedDayHint = form.querySelector("#fixedDayScheduleHint");
    if (fixedDayHint) { fixedDayHint.style.display = "none"; fixedDayHint.textContent = ""; }
  }

  function fillEmployeeForm(form, employee, company) {
    const companyField = form.elements.employeeCompany;
    if (companyField) companyField.value = company;

    Object.entries(employee).forEach(([key, value]) => {
      if (["department", "sundayOffWeeks", "doubleSundayOff", "fixedDayHistory"].includes(key)) return;
      const field = form.elements[key];
      if (!field) return;
      field.value = key === "vtDaily" ? AppData.formatVtInput(value) : value ?? "";
    });

    const fixedDayHint = form.querySelector("#fixedDayScheduleHint");
    const fixedDaySelect = form.querySelector("#fixedDaySelect");
    const pendingInfo = AppData.getFixedDayChangeInfo(employee);
    if (fixedDayHint) {
      if (pendingInfo) {
        fixedDayHint.style.display = "";
        fixedDayHint.textContent =
          `Até ${pendingInfo.effectiveFromLabel}: ${pendingInfo.currentDay || "sem folga"}. ` +
          `A partir dessa data: ${pendingInfo.nextDay || "sem folga"}.`;
      } else {
        fixedDayHint.style.display = "none";
        fixedDayHint.textContent = "";
      }
    }
    if (fixedDaySelect) {
      fixedDaySelect.onchange = () => {
        if (!form.elements.id?.value) {
          if (fixedDayHint) fixedDayHint.style.display = "none";
          return;
        }
        const current = AppData.resolveFixedDayForDate(employee, AppData.todayISO());
        const selected = fixedDaySelect.value || "";
        if (selected && selected !== current) {
          const fromLabel = AppData.formatDateBR(AppData.getNextMonthFirstDay());
          fixedDayHint.style.display = "";
          fixedDayHint.textContent =
            `Alteração agendada: mantém ${current || "sem folga"} até o mês atual. ` +
            `Nova folga (${selected}) vale a partir de ${fromLabel}.`;
        } else if (fixedDayHint) {
          fixedDayHint.style.display = pendingInfo ? "" : "none";
          fixedDayHint.textContent = pendingInfo
            ? `Até ${pendingInfo.effectiveFromLabel}: ${pendingInfo.currentDay || "sem folga"}. ` +
              `A partir dessa data: ${pendingInfo.nextDay || "sem folga"}.`
            : "";
        }
      };
    }

    const shiftSelect = form.querySelector("#shiftSelect");
    const newShiftInput = form.querySelector("#newShiftInput");
    if (shiftSelect) {
      const shift = employee.defaultShift || "";
      const presets = getShiftPresets();
      if (presets.includes(shift)) {
        shiftSelect.value = shift;
        if (newShiftInput) { newShiftInput.style.display = "none"; newShiftInput.value = ""; }
      } else if (shift) {
        shiftSelect.value = "__new_shift__";
        if (newShiftInput) { newShiftInput.style.display = ""; newShiftInput.value = shift; }
      } else {
        shiftSelect.value = "";
        if (newShiftInput) { newShiftInput.style.display = "none"; newShiftInput.value = ""; }
      }
    }

    const deptSelect = form.querySelector("#departmentSelect");
    const newDeptInput = form.querySelector("#newDepartmentInput");
    if (deptSelect) {
      const dept = employee.department || "";
      const optionExists = [...deptSelect.options].some(
        (o) => o.value === dept && o.value !== "" && o.value !== "__new__"
      );
      if (optionExists) {
        deptSelect.value = dept;
        if (newDeptInput) { newDeptInput.style.display = "none"; newDeptInput.value = ""; }
      } else if (dept) {
        deptSelect.value = "__new__";
        if (newDeptInput) { newDeptInput.style.display = ""; newDeptInput.value = dept; }
      } else {
        deptSelect.value = "";
        if (newDeptInput) { newDeptInput.style.display = "none"; newDeptInput.value = ""; }
      }
    }

    const sundayWeeks = String(employee.sundayOffWeeks || "").split(",").map((s) => s.trim()).filter(Boolean);
    form.querySelectorAll(".sunday-off-check").forEach((cb) => {
      cb.checked = sundayWeeks.includes(cb.value);
    });
    const doubleCheck = form.querySelector(".double-sunday-check");
    if (doubleCheck) {
      doubleCheck.checked = employee.doubleSundayOff === "true" || employee.doubleSundayOff === true;
    }
    const hiddenWeeks = form.querySelector("#sundayOffWeeksHidden");
    const hiddenDouble = form.querySelector("#doubleSundayOffHidden");
    if (hiddenWeeks) hiddenWeeks.value = sundayWeeks.join(",");
    if (hiddenDouble) hiddenDouble.value = doubleCheck?.checked ? "true" : "false";

    const originEl = form.querySelector("#employeeOriginDisplay");
    if (originEl) originEl.textContent = employee.source === "imported" ? "Importado" : "Manual";
  }

  function bindEmployeeForm(form, pageContainer) {
    const shiftSelect = form.querySelector("#shiftSelect");
    const newShiftInput = form.querySelector("#newShiftInput");
    shiftSelect?.addEventListener("change", () => {
      if (shiftSelect.value === "__new_shift__") {
        newShiftInput.style.display = "";
        newShiftInput.focus();
      } else {
        newShiftInput.style.display = "none";
        newShiftInput.value = "";
      }
    });

    const deptSelect = form.querySelector("#departmentSelect");
    const newDeptInput = form.querySelector("#newDepartmentInput");
    deptSelect?.addEventListener("change", () => {
      if (deptSelect.value === "__new__") {
        newDeptInput.style.display = "";
        newDeptInput.focus();
      } else {
        newDeptInput.style.display = "none";
        newDeptInput.value = "";
      }
    });

    setupSundayCheckboxes(form);

    const vtField = form.elements.vtDaily;
    if (vtField) {
      vtField.addEventListener("blur", () => {
        if (!vtField.value.trim()) return;
        vtField.value = AppData.formatVtInput(AppData.parseVtDaily(vtField.value));
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      if (!payload.fixedDay) payload.fixedDay = "";

      if (payload.defaultShift === "__new_shift__") {
        const newShift = (newShiftInput?.value || "").trim();
        if (!newShift) {
          alert("Informe o horário.");
          newShiftInput?.focus();
          return;
        }
        addShiftPreset(newShift);
        payload.defaultShift = newShift;
      }

      if (payload.department === "__new__") {
        const newDept = (newDeptInput?.value || "").trim();
        if (!newDept) {
          alert("Informe o nome do novo setor.");
          newDeptInput?.focus();
          return;
        }
        payload.department = newDept;
      }

      const targetCompany = payload.employeeCompany || AppData.state.selectedCompany;
      delete payload.employeeCompany;
      const existing = AppData.getCompanyData(targetCompany).employees.find((item) => item.id === payload.id);
      const previousFixedDay = existing?.fixedDay || "";
      payload.source = existing?.source === "imported" ? "imported" : "manual";
      payload.vtDaily = AppData.parseVtDaily(payload.vtDaily);
      try {
        AppData.upsertEmployee(payload, targetCompany);
        if (existing && String(previousFixedDay).trim() !== String(payload.fixedDay || "").trim()) {
          const fromLabel = AppData.formatDateBR(AppData.getNextMonthFirstDay());
          window.App?.toast?.(
            `Folga fixa atualizada. A nova regra vale a partir de ${fromLabel} (mês seguinte).`,
            "info",
            6000
          );
        }
        closeEmployeePopup();
        window.App.renderCurrent();
      } catch (error) {
        alert(error.message || "Não foi possível salvar o funcionário.");
      }
    });
  }

  function openEmployeePopup(pageContainer, options = {}) {
    closeEmployeePopup();
    const allEmployees = getAllEmployeesFlat();
    const isEdit = Boolean(options.employee);
    const overlay = document.createElement("div");
    overlay.id = "employeePopup";
    overlay.className = "popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="popup-card popup-card-employee">
        <div class="popup-header">
          <h3 id="employeePopupTitle">${isEdit ? "Editar funcionário" : "Novo cadastro"}</h3>
          <button class="popup-close" id="employeePopupClose" type="button" aria-label="Fechar">✕</button>
        </div>
        <form id="employeeForm" class="popup-form func-popup-form func-form-horizontal">
          ${renderEmployeeFormHTML(allEmployees)}
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#employeeForm");
    bindEmployeeForm(form, pageContainer);

    if (isEdit) {
      fillEmployeeForm(form, options.employee, options.company || AppData.state.selectedCompany);
    } else {
      resetEmployeeForm(form);
    }

    overlay.querySelector("#employeePopupClose").addEventListener("click", closeEmployeePopup);
    overlay.querySelector("#employeePopupCancel").addEventListener("click", closeEmployeePopup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeEmployeePopup();
    });

    form.querySelector("[name='name']")?.focus();
  }

  function employeeRows(employees) {
    if (!employees.length) {
      return `<tr><td colspan="13">Nenhum funcionário encontrado.</td></tr>`;
    }

    return employees
      .map(
        (employee) => `
      <tr>
        <td>${originBadge(employee)}</td>
        <td>${esc(employee.company)}</td>
        <td>${esc(employee.name)}</td>
        <td>${esc(employee.cpf || "")}</td>
        <td>${esc(employee.ctps || "")}</td>
        <td>${esc(employee.role)}</td>
        <td>${esc(employee.department)}</td>
        <td><span class="pill ${employee.status === "Ativo" ? "success" : "muted"}">${esc(employee.status)}</span></td>
        <td>${esc(employee.admissionDate)}</td>
        <td>${esc(employee.fixedDay || "—")}</td>
        <td>${esc(employee.defaultShift || "—")}</td>
        <td>${esc(AppData.formatVtCurrency(employee.vtDaily))}</td>
        <td class="actions">
          <button class="link-button" data-edit="${employee.id}" data-company="${esc(employee.company)}">Editar</button>
          <button class="link-button danger" data-remove="${employee.id}" data-company="${esc(employee.company)}">Excluir</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  function updateEmployeeList(container) {
    const allEmployees = getAllEmployeesFlat();
    const filtered = filterEmployees(allEmployees);
    const tbody = container.querySelector("#employeeListBody");
    const countEl = container.querySelector("#employeeListCount");
    if (tbody) tbody.innerHTML = employeeRows(filtered);
    if (countEl) {
      const companyTotal = allEmployees.filter((item) => item.company === AppData.state.selectedCompany).length;
      countEl.textContent = `${filtered.length} exibidos · ${companyTotal} na empresa · ${allEmployees.length} no grupo`;
    }
  }

  async function getImportPayload(container) {
    const fileInput = container.querySelector("#importEmployeeFile");
    const textarea = container.querySelector("#importText");
    const file = fileInput?.files?.[0];

    if (file) {
      return ImportUtils.readFileAsText(file);
    }

    return textarea?.value || "";
  }

  function runEmployeeImport(container) {
    return getImportPayload(container)
      .then((text) => {
        const rows = ImportUtils.parseImportText(text);
        if (!rows.length) {
          alert("Nenhum registro encontrado no arquivo ou texto informado.");
          return;
        }

        const result = AppData.importEmployeesBatch(rows, {
          fallbackCompany: AppData.state.selectedCompany,
          mapRow: ImportUtils.mapEmployeeRow
        });

        const fileInput = container.querySelector("#importEmployeeFile");
        const textarea = container.querySelector("#importText");
        if (fileInput) fileInput.value = "";
        if (textarea) textarea.value = "";

        alert(ImportUtils.formatImportSummary(result));
        window.App.renderCurrent();
      })
      .catch(() => {
        alert("Não foi possível importar os dados. Verifique o formato JSON ou CSV.");
      });
  }

  function bindListFilters(container) {
    let searchTimer;

    const applyList = () => updateEmployeeList(container);

    container.querySelector("#employeeListSearch")?.addEventListener("input", (event) => {
      listFilters.search = event.target.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyList, 120);
    });

    container.querySelector("#employeeFilterCompany")?.addEventListener("change", (event) => {
      listFilters.company = event.target.value;
      applyList();
    });

    container.querySelector("#employeeFilterDepartment")?.addEventListener("change", (event) => {
      listFilters.department = event.target.value;
      applyList();
    });

    container.querySelector("#employeeFilterRole")?.addEventListener("change", (event) => {
      listFilters.role = event.target.value;
      applyList();
    });

    container.querySelector("#employeeFilterStatus")?.addEventListener("change", (event) => {
      listFilters.status = event.target.value;
      applyList();
    });

    container.querySelector("#employeeFilterSource")?.addEventListener("change", (event) => {
      listFilters.source = event.target.value;
      applyList();
    });

    container.querySelector("#clearEmployeeFilters")?.addEventListener("click", () => {
      listFilters.search = "";
      listFilters.company = "todos";
      listFilters.department = "todos";
      listFilters.role = "todos";
      listFilters.status = "todos";
      listFilters.source = "todos";
      window.App.renderCurrent();
    });
  }

  function bindEvents(container) {
    container.querySelector("#btnNewCompany")?.addEventListener("click", () => {
      openCompanyPopup();
    });

    container.querySelector("#btnNewEmployee")?.addEventListener("click", () => {
      openEmployeePopup(container);
    });

    if (!container.dataset.companyActionsBound) {
      container.dataset.companyActionsBound = "1";
      container.addEventListener("click", (event) => {
        const editCompany = event.target.closest("[data-edit-company]");
        if (editCompany) {
          event.preventDefault();
          openCompanyPopup({ companyKey: editCompany.dataset.editCompany });
          return;
        }
        const activateBtn = event.target.closest("[data-activate-company]");
        if (activateBtn) {
          event.preventDefault();
          AppData.setSelectedCompany(activateBtn.dataset.activateCompany);
          window.App.renderCurrent();
        }
      });
    }

    if (!container.dataset.employeeActionsBound) {
      container.dataset.employeeActionsBound = "1";
      container.addEventListener("click", (event) => {
        const editBtn = event.target.closest("[data-edit]");
        if (editBtn) {
          event.preventDefault();
          const company = editBtn.dataset.company || AppData.state.selectedCompany;
          if (company !== AppData.state.selectedCompany) {
            AppData.setSelectedCompany(company);
          }
          const employee = AppData.getCompanyData(company).employees.find((item) => item.id === editBtn.dataset.edit);
          if (employee) openEmployeePopup(container, { employee, company });
          return;
        }

        const removeBtn = event.target.closest("[data-remove]");
        if (removeBtn) {
          event.preventDefault();
          if (!confirm("Excluir este funcionário e seus vínculos de escala, férias e feriados?")) return;
          const company = removeBtn.dataset.company || AppData.state.selectedCompany;
          AppData.removeEmployee(removeBtn.dataset.remove, company);
          closeEmployeePopup();
          window.App.renderCurrent();
        }
      });
    }

    ImportUtils.bindImportModal(container, "employeeImportModal", {
      buttonId: "importLovable",
      run: () => runEmployeeImport(container)
    });

    container.querySelector("#downloadEmployeeTemplate")?.addEventListener("click", () => {
      ImportUtils.downloadCSV(
        "modelo-funcionarios.csv",
        ["nome", "cpf", "ctps", "cargo", "setor", "status", "admissao", "folgaFixa", "vt", "empresa", "turnoPadrao"],
        ["", "", "", "Recepcionista", "Recepção", "Ativo", "2024-01-15", "", "17,30", AppData.state.selectedCompany, ""]
      );
    });

    container.querySelector("#downloadHolidayTemplate")?.addEventListener("click", () => {
      ImportUtils.downloadCSV(
        "modelo-feriados.csv",
        ["empresa", "funcionario", "nomeFeriado", "dataTrabalhada", "prazoCompensacao", "dataCompensacao", "status", "observacoes"],
        [AppData.state.selectedCompany, "", "Natal", "2025-12-25", "", "", "Pendente", ""]
      );
    });

    container.querySelector("#exportCurrentJson")?.addEventListener("click", () => {
      ImportUtils.downloadJSON("chez-pitu-dados.json", JSON.parse(AppData.exportCurrentDataJSON()));
    });

    bindListFilters(container);
  }

  function render(container) {
    if (!container) return;
    let allEmployees = [];
    let filteredEmployees = [];
    let companyCount = 0;
    try {
      allEmployees = getAllEmployeesFlat();
      filteredEmployees = filterEmployees(allEmployees);
      companyCount = allEmployees.filter((item) => item.company === AppData.state.selectedCompany).length;
    } catch (error) {
      console.error("[Cadastro] Falha ao carregar funcionários:", error);
      container.innerHTML = `
        <div class="card" style="padding:20px">
          <h2>Cadastro</h2>
          <p class="help-text">Não foi possível carregar os dados. Atualize a página (Ctrl+F5). Se persistir, verifique o console do navegador.</p>
          <p class="help-text"><small>${esc(error.message || error)}</small></p>
        </div>`;
      return;
    }
    const importExtra = `
      <button id="downloadEmployeeTemplate" class="secondary" type="button">Modelo CSV</button>
      <button id="downloadHolidayTemplate" class="secondary" type="button">Modelo Feriados</button>
      <button id="exportCurrentJson" class="secondary" type="button">Exportar JSON</button>
    `;

    container.innerHTML = `
      <div class="func-page">
        <header class="func-page-intro">
          <div class="func-page-intro-head">
            <h2 class="func-module-title">Cadastro</h2>
            <p class="func-module-subtitle">Empresas do grupo e colaboradores</p>
          </div>
          <div class="func-stats-row stat-row">${renderEmployeeStats()}</div>
        </header>

        <article class="card func-companies-card">
          <div class="card-header card-header-compact func-table-card-header">
            <div>
              <p class="eyebrow">Empresas pagadoras</p>
              <h2>Cadastro de empresa</h2>
            </div>
            <button type="button" class="primary btn-sm" id="btnNewCompany">+ Nova empresa</button>
          </div>
          <div class="table-wrap">
            <table class="table-premium func-companies-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Empresa</th>
                  <th>Razão social</th>
                  <th>CNPJ</th>
                  <th>Responsável</th>
                  <th>Funcionários</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>${companyRows()}</tbody>
            </table>
          </div>
        </article>

        <article class="card func-table-card">
          <div class="card-header card-header-compact func-table-card-header">
            <div>
              <p class="eyebrow">Consulta</p>
              <h2>Lista de funcionários</h2>
            </div>
            <button type="button" class="primary btn-sm" id="btnNewEmployee">+ Novo cadastro</button>
          </div>
          ${renderListToolbar(allEmployees, filteredEmployees.length, companyCount, allEmployees.length)}
          <div class="table-wrap">
            <table class="table-premium">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Empresa</th>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>CTPS</th>
                  <th>Cargo</th>
                  <th>Setor</th>
                  <th>Status</th>
                  <th>Admissão</th>
                  <th>Folga</th>
                  <th>Turno</th>
                  <th>VT/dia</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="employeeListBody">${employeeRows(filteredEmployees)}</tbody>
            </table>
          </div>
        </article>

        <div class="page-footer-actions">
          <button type="button" class="secondary btn-sm" data-open-modal="employeeImportModal" title="Aceita arquivos CSV e JSON">Importar dados</button>
          <span class="footer-hint">CSV e JSON</span>
        </div>
      </div>

      ${ImportUtils.importModalMarkup({
        modalId: "employeeImportModal",
        title: "Importar funcionários",
        description: "Importe dados reais dos projetos Lovable. Campos: nome, cpf, ctps, cargo, setor, status, admissao, folgaFixa, vt, empresa e turnoPadrao.",
        fileInputId: "importEmployeeFile",
        textareaId: "importText",
        importButtonId: "importLovable",
        extraActions: importExtra
      })}
    `;

    try {
      bindEvents(container);
    } catch (error) {
      console.error("[Cadastro] Falha ao vincular eventos:", error);
    }
  }

  window.FuncionariosModule = { render };
})();
