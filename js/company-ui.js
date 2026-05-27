(function () {
  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function listCompanies() {
    if (typeof AppData.getCompanies === "function") {
      const list = AppData.getCompanies();
      if (list.length) return list;
    }
    return AppData.COMPANIES || [];
  }

  /** Barra de empresa (padrão Cadastro): chips clicáveis + empresa ativa. */
  function renderCompanyBar() {
    const active = AppData.state.selectedCompany;
    const counts = AppData.getEmployeeCounts();
    const byCompany = new Map(counts.byCompany.map((item) => [item.company, item.total]));

    return `
      <div class="module-company-bar" data-company-bar>
        <div class="module-company-bar-meta">
          <span class="module-company-bar-eyebrow">Empresa ativa no sistema</span>
          <strong class="module-company-bar-name">${esc(active)}</strong>
        </div>
        <div class="module-company-chips stat-row">
          ${listCompanies()
            .map((company) => {
              const isActive = company === active;
              const total = byCompany.get(company) ?? 0;
              return `
                <button
                  type="button"
                  class="stat-chip module-company-chip ${isActive ? "is-active" : ""}"
                  data-select-company="${esc(company)}"
                  title="${isActive ? "Empresa ativa" : "Exibir dados de " + company}"
                >
                  <span>${esc(company)}</span>
                  <strong>${total}</strong>
                </button>`;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  /** Seletor compacto no estilo Escala de Folga. */
  function renderCompanySelect(id, selected) {
    const value = selected || AppData.state.selectedCompany;
    return `
      <label class="module-company-select-label">Empresa
        <select id="${esc(id)}" class="module-company-select" data-company-select="${esc(id)}">
          ${listCompanies()
            .map(
              (company) =>
                `<option value="${esc(company)}" ${company === value ? "selected" : ""}>${esc(company)}</option>`
            )
            .join("")}
        </select>
      </label>
    `;
  }

  function bindCompanyBar(container, onChange) {
    if (!container) return;
    container.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-select-company]");
      if (!btn || !container.contains(btn)) return;
      event.preventDefault();
      const company = btn.dataset.selectCompany;
      if (!company || company === AppData.state.selectedCompany) return;
      AppData.setSelectedCompany(company);
      if (typeof onChange === "function") onChange(company);
      else window.App?.renderCurrent?.();
    });
  }

  function bindCompanySelect(container, selectId, onChange) {
    const select = container.querySelector(`#${selectId}`);
    if (!select || select.dataset.bound) return;
    select.dataset.bound = "1";
    select.addEventListener("change", () => {
      const company = select.value;
      if (!company) return;
      AppData.setSelectedCompany(company);
      if (typeof onChange === "function") onChange(company);
      else window.App?.renderCurrent?.();
    });
  }

  window.CompanyUI = {
    listCompanies,
    renderCompanyBar,
    renderCompanySelect,
    bindCompanyBar,
    bindCompanySelect
  };
})();
