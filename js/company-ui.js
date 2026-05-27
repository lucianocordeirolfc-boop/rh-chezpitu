(function () {
  const SELECT_IDS = {
    dashboard: "dashboardPageCompany",
    funcionarios: "cadastroPageCompany",
    escala: "scaleCompany",
    ferias: "ausenciasPageCompany",
    "vale-transporte": "vtPageCompany",
    feriados: "feriadosPageCompany",
    contador: "contadorPageCompany"
  };

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function pageLabel(moduleId) {
    const value = AppData.getPageCompany(moduleId);
    if (AppData.isPageCompanyAll(value)) return "Todas as empresas";
    return value;
  }

  /**
   * Seletor de empresa no estilo Escala de Folga.
   * @param {string} moduleId
   * @param {{ allowAll?: boolean, selectId?: string, className?: string }} options
   */
  function renderToolbar(moduleId, options = {}) {
    const allowAll = Boolean(options.allowAll);
    const selectId = options.selectId || SELECT_IDS[moduleId] || `${moduleId}PageCompany`;
    const selected = AppData.getPageCompany(moduleId);
    const companies = AppData.getCompanies();
    const allValue = AppData.PAGE_COMPANY_ALL;

    const optionsHtml = (allowAll
      ? `<option value="${allValue}" ${AppData.isPageCompanyAll(selected) ? "selected" : ""}>Todas</option>`
      : "") +
      companies
        .map(
          (company) =>
            `<option value="${esc(company)}" ${company === selected ? "selected" : ""}>${esc(company)}</option>`
        )
        .join("");

    const extraClass = options.className ? ` ${options.className}` : "";

    return `
      <div class="page-company-toolbar${extraClass}" data-page-toolbar="${esc(moduleId)}">
        <label class="module-company-select-label">Empresa
          <select id="${esc(selectId)}" class="module-company-select" data-page-module="${esc(moduleId)}">
            ${optionsHtml}
          </select>
        </label>
      </div>
    `;
  }

  function bindToolbar(container, moduleId, onChange) {
    if (!container) return;
    const selectId = SELECT_IDS[moduleId] || `${moduleId}PageCompany`;
    const select =
      container.querySelector(`#${selectId}`) || container.querySelector(`[data-page-module="${moduleId}"]`);
    if (!select) return;

    if (select.dataset.pageBound === moduleId) return;
    select.dataset.pageBound = moduleId;

    select.addEventListener("change", () => {
      AppData.setPageCompany(moduleId, select.value);
      if (typeof onChange === "function") onChange(select.value);
      else window.App?.renderCurrent?.();
    });
  }

  /** @deprecated use renderToolbar */
  function renderCompanyBar() {
    return "";
  }

  /** @deprecated use bindToolbar */
  function bindCompanyBar() {
    /* noop */
  }

  /** @deprecated */
  function renderCompanySelect(id, selected, allowAll = false) {
    const moduleId =
      id === "scaleCompany"
        ? "escala"
        : Object.entries(SELECT_IDS).find(([, v]) => v === id)?.[0] || "escala";
    return renderToolbar(moduleId, { allowAll, selectId: id }).replace(
      '<div class="page-company-toolbar"',
      '<label class="module-company-select-label">Empresa'
    );
  }

  /** @deprecated */
  function bindCompanySelect(container, selectId, onChange) {
    const moduleId =
      selectId === "scaleCompany"
        ? "escala"
        : Object.entries(SELECT_IDS).find(([, v]) => v === selectId)?.[0];
    if (moduleId) bindToolbar(container, moduleId, onChange);
  }

  function listCompanies() {
    return AppData.getCompanies();
  }

  window.CompanyUI = {
    listCompanies,
    pageLabel,
    renderToolbar,
    bindToolbar,
    renderCompanyBar,
    bindCompanyBar,
    renderCompanySelect,
    bindCompanySelect,
    SELECT_IDS
  };
})();
