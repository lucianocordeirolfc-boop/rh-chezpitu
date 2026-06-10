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
   * Fase 2 — os seletores de empresa internos foram removidos.
   * A empresa é definida pela ABA superior (AppData.getActiveCompany()).
   * renderToolbar agora não desenha nada (mantido para compatibilidade dos módulos).
   */
  function renderToolbar() {
    return "";
  }

  /** Fase 2 — no-op: não há mais seletor interno para vincular. */
  function bindToolbar() {
    /* contexto de empresa vem da aba ativa */
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
