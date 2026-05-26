(function () {
  const moduleTitles = {
    dashboard: "Dashboard",
    funcionarios: "Cadastro de Funcionários",
    escala: "Escala de Folga",
    ferias: "Ausências",
    "vale-transporte": "Recibo de Vale-transporte",
    feriados: "Controle de Feriados",
    contador: "Informações Contador"
  };

  const renderers = {
    dashboard: window.DashboardModule?.render,
    funcionarios: window.FuncionariosModule?.render,
    escala: window.EscalaModule?.render,
    ferias: window.FeriasModule?.render,
    "vale-transporte": window.ValeTransporteModule?.render,
    feriados: window.FeriadosModule?.render,
    contador: window.ContadorModule?.render
  };

  function activeModuleId() {
    return document.querySelector(".menu-item.active")?.dataset.module || "dashboard";
  }

  function render(moduleId = activeModuleId()) {
    document.querySelectorAll(".module").forEach((section) => {
      section.classList.toggle("active", section.id === moduleId);
    });
    document.querySelectorAll(".menu-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.module === moduleId);
    });

    document.getElementById("pageTitle").textContent = moduleTitles[moduleId];
    const container = document.getElementById(moduleId);

    if (moduleId === "vale-transporte") {
      const yearMonth = AppData.getVtSelectedYearMonth() || AppData.getEscalaSelectedYearMonth();
      window.ValeTransporteModule.render(container, yearMonth);
      return;
    }

    if (typeof renderers[moduleId] === "function") {
      renderers[moduleId](container);
    }
  }

  function renderCurrent() {
    render(activeModuleId());
  }

  function setupCompanySelect() {
    const select = document.getElementById("companySelect");
    select.innerHTML = AppData.COMPANIES.map((company) => `<option value="${company}">${company}</option>`).join("");
    select.value = AppData.state.selectedCompany;
    select.addEventListener("change", () => {
      AppData.setSelectedCompany(select.value);
      renderCurrent();
    });
  }

  function setupMenu() {
    document.querySelectorAll(".menu-item").forEach((button) => {
      button.addEventListener("click", () => {
        if (activeModuleId() === "vale-transporte" && window.ValeTransporteModule?.flushPersist) {
          window.ValeTransporteModule.flushPersist();
        }
        render(button.dataset.module);
      });
    });
  }

  function setupSidebarToggle() {
    const btn = document.getElementById("sidebarToggle");
    if (!btn) return;
    if (localStorage.getItem("sidebarCollapsed") === "true") {
      document.body.dataset.sidebar = "collapsed";
    }
    btn.addEventListener("click", () => {
      const collapsed = document.body.dataset.sidebar === "collapsed";
      if (collapsed) {
        delete document.body.dataset.sidebar;
        localStorage.setItem("sidebarCollapsed", "false");
      } else {
        document.body.dataset.sidebar = "collapsed";
        localStorage.setItem("sidebarCollapsed", "true");
      }
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
    formatDisplayName,
    renderCurrent,
    render,
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
    AppData.runScaleIntegrations(collectScaleMonths());
    if (persist) AppData.saveState();
  }

  function refreshActiveModuleUI() {
    const moduleId = activeModuleId();

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
    }
    AppData.setRemoteState(payload, {
      preserveLocalHolidays: true,
      localSnapshot: AppData.readLocalStateSnapshot()
    });
    const select = document.getElementById("companySelect");
    if (select && remoteState.selectedCompany) {
      select.value = remoteState.selectedCompany;
    }

    AppData.runScaleIntegrations(collectScaleMonths());
    if (!fromRemote) {
      AppData.saveState();
    }

    refreshActiveModuleUI();
  }

  function initSync() {
    if (!window.FirebaseSync?.init()) return;

    window.FirebaseSync.startSync(
      (remoteState) => applyRemoteState(remoteState, true),
      () => refreshActiveModuleUI()
    );
  }

  let appBooted = false;

  function bootApp() {
    if (appBooted) return;
    appBooted = true;

    setupCompanySelect();
    setupMenu();
    setupSidebarToggle();

    let booted = false;
    const boot = () => {
      if (booted) return;
      booted = true;
      refreshScaleIntegrations();
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
