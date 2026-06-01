(function () {
  const moduleTitles = {
    empresa: "Dados da Empresa",
    dashboard: "Dashboard",
    funcionarios: "Cadastro de Funcionários",
    escala: "Escala de Folga",
    ferias: "Ausências",
    "vale-transporte": "Recibo de Vale Transporte",
    feriados: "Controle de Feriados",
    contador: "Informações do Contador"
  };

  const renderers = {
    empresa: () => window.EmpresaModule?.render,
    dashboard: () => window.DashboardModule?.render,
    funcionarios: () => window.FuncionariosModule?.render,
    escala: () => window.EscalaModule?.render,
    ferias: () => window.FeriasModule?.render,
    "vale-transporte": () => window.ValeTransporteModule?.render,
    feriados: () => window.FeriadosModule?.render,
    contador: () => window.ContadorModule?.render
  };

  function activeModuleId() {
    return document.querySelector(".ribbon-item.active")?.dataset.module || "dashboard";
  }

  function render(moduleId = activeModuleId()) {
    document.querySelectorAll(".module").forEach((section) => {
      section.classList.toggle("active", section.id === moduleId);
    });
    document.querySelectorAll(".ribbon-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.module === moduleId);
    });

    document.body.dataset.activeModule = moduleId;
    const titleEl = document.getElementById("pageTitle");
    if (titleEl) titleEl.textContent = moduleTitles[moduleId] || "";
    const container = document.getElementById(moduleId);

    if (!container) return;

    if (moduleId === "vale-transporte") {
      const yearMonth = AppData.getVtSelectedYearMonth() || AppData.getEscalaSelectedYearMonth();
      window.ValeTransporteModule.render(container, yearMonth);
      return;
    }

    const renderFn = renderers[moduleId]?.();
    if (typeof renderFn === "function") {
      renderFn(container);
    }
  }

  function renderCurrent() {
    render(activeModuleId());
  }

  function flushModuleBeforeLeave() {
    if (activeModuleId() === "vale-transporte" && window.ValeTransporteModule?.flushPersist) {
      window.ValeTransporteModule.flushPersist();
    }
  }

  /** Menu horizontal (ribbon) — troca de módulo dentro da empresa ativa. */
  function setupRibbon() {
    document.querySelectorAll(".ribbon-item").forEach((button) => {
      button.addEventListener("click", () => {
        flushModuleBeforeLeave();
        render(button.dataset.module);
      });
    });
  }

  function updateCompanyTabsUI() {
    const active = AppData.getActiveCompany();
    document.querySelectorAll(".company-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.company === active);
      tab.setAttribute("aria-selected", tab.dataset.company === active ? "true" : "false");
    });
  }

  /** Abas superiores de empresa — definem o contexto único de todo o sistema. */
  function setupCompanyTabs() {
    document.querySelectorAll(".company-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const company = tab.dataset.company;
        if (!company || company === AppData.getActiveCompany()) return;
        flushModuleBeforeLeave();
        AppData.setActiveCompany(company);
        updateCompanyTabsUI();
        renderCurrent();
      });
    });
  }

  function toast(message, type, duration) {
    type = type || "info";
    duration = duration !== undefined ? duration : 3500;
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    const icons = { success: "✓", danger: "✕", warning: "!", info: "i" };
    el.innerHTML =
      '<span class="toast-badge">' + (icons[type] || "i") + "</span>" +
      "<span>" + String(message).replace(/</g, "&lt;") + "</span>";
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add("toast-out");
      setTimeout(function () { el.remove(); }, 350);
    }, duration);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const NAME_LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

  function formatDisplayName(name) {
    return String(name || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        if (index > 0 && NAME_LOWER_WORDS.has(word)) return word;
        return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
      })
      .join(" ");
  }

  window.App = {
    escapeHTML,
    esc: escapeHTML,
    formatDisplayName,
    renderCurrent,
    render,
    updateCompanyTabsUI,
    toast
  };

  function collectScaleMonths() {
    const months = new Set([AppData.monthKey()]);
    AppData.COMPANIES.forEach((company) => {
      Object.keys(AppData.getCompanyData(company).manualScale || {}).forEach((key) => {
        const date = key.split("|")[1];
        if (date) months.add(date.slice(0, 7));
      });
    });
    return [...months];
  }

  function refreshScaleIntegrations(persist = true) {
    const month = AppData.getEscalaSelectedYearMonth() || AppData.monthKey();
    const company = AppData.getPrimaryPageCompany("escala");
    AppData.runScaleIntegrations([month], { companies: [company], save: persist });
  }

  function refreshActiveModuleUI() {
    const moduleId = activeModuleId();

    if (moduleId === "escala") {
      const container = document.getElementById("escala");
      if (container && window.EscalaModule?.softRefreshFromSync) {
        window.EscalaModule.softRefreshFromSync();
        return;
      }
    }

    if (moduleId === "feriados") {
      const container = document.getElementById("feriados");
      if (container?.querySelector("[data-holiday-tbody]") && window.FeriadosModule?.refreshView) {
        window.FeriadosModule.refreshView(container);
        return;
      }
    }

    if (moduleId === "vale-transporte") {
      const container = document.getElementById("vale-transporte");
      if (container?.querySelector("#vtMonth") && window.ValeTransporteModule?.softRefreshFromSync) {
        window.ValeTransporteModule.softRefreshFromSync(container);
        return;
      }
    }

    render(moduleId);
  }

  function applyRemoteState(remoteState, fromRemote = false) {
    let payload = remoteState;
    if (fromRemote) {
      const localSnapshot = AppData.readLocalStateSnapshot() || JSON.parse(JSON.stringify(AppData.state));
      payload = AppData.mergeRemoteIntoLocal(localSnapshot, remoteState);
    } else {
      payload = AppData.finalizeIncomingState(remoteState);
    }
    AppData.setRemoteState(payload);
    updateCompanyTabsUI();
    refreshActiveModuleUI();
  }

  function initSync() {
    if (!window.FirebaseSync?.init()) return;

    window.FirebaseSync.startSync((remoteState) => applyRemoteState(remoteState, true));
  }

  let appBooted = false;

  function bootApp() {
    if (appBooted) return;
    appBooted = true;

    setupCompanyTabs();
    setupRibbon();

    // Fase 2 — propaga a empresa ativa (aba) para todo o sistema, sem apagar dados.
    AppData.setActiveCompany(AppData.getActiveCompany(), { save: false });
    updateCompanyTabsUI();

    let booted = false;
    const boot = () => {
      if (booted) return;
      booted = true;
      refreshScaleIntegrations();
      updateCompanyTabsUI();
      render("dashboard");
      initSync();
    };

    if (window.FirebaseSync?.init()) {
      const timeout = setTimeout(boot, 5000);
      window.FirebaseSync.bootstrap(
        () => JSON.parse(JSON.stringify(AppData.state)),
        (remoteState, fromRemote = true) => applyRemoteState(remoteState, fromRemote)
      ).finally(() => {
        clearTimeout(timeout);
        boot();
      });
    } else {
      boot();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.AppAuth) {
      window.AppAuth.onLogin(() => bootApp());
      if (window.AppAuth.isLoggedIn()) bootApp();
    } else {
      bootApp();
    }
  });
})();
