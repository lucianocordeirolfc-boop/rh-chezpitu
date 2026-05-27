if (window.firebase && firebase.apps.length) {
  window.firebaseDB = firebase.database();
}

(function () {
  const ROOT = "sistemaRH";
  const COMPANIES = ["Chez Pitu", "Pengold"];
  const DEFAULT_SELECTED_COMPANY = "Pengold";

  function companiesInState(state) {
    const keys = Object.keys(state?.companies || {});
    const ordered = [];
    COMPANIES.forEach((company) => {
      if (state?.companies?.[company] || keys.includes(company)) ordered.push(company);
    });
    keys.forEach((company) => {
      if (!ordered.includes(company)) ordered.push(company);
    });
    return ordered;
  }
  const PUSH_GUARD_MS = 900;

  let db = null;
  let ready = false;
  let listening = false;
  let pushing = false;
  let lastPushedAt = 0;
  let unsubscribe = null;

  function init() {
    if (!window.firebase || !window.firebaseDB) {
      console.warn("[FirebaseSync] Firebase não disponível.");
      return false;
    }
    if (!window.AppAuth?.isLoggedIn()) {
      console.warn("[FirebaseSync] Usuário não autenticado.");
      return false;
    }
    db = window.firebaseDB;
    ready = true;
    return true;
  }

  function isReady() {
    return ready;
  }

  function isOnline() {
    return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  }

  function setStatus(status, detail) {
    const el = document.getElementById("syncStatus");
    if (!el) return;
    el.dataset.status = status;
    el.title = detail || "";
    const labels = {
      online: "Sincronizado",
      offline: "Offline — cache local",
      syncing: "Sincronizando…",
      error: "Erro de sincronização"
    };
    el.textContent = labels[status] || status;
  }

  function defaultCompanyData(companyName) {
    return {
      companyInfo: {
        legalName: companyName,
        cnpj: "",
        responsibleName: "",
        logoDataUrl: ""
      },
      employees: [],
      vacations: [],
      absences: [],
      holidays: [],
      manualScale: {}
    };
  }

  function stateToFirebase(state) {
    const empresas = {};
    const funcionarios = {};
    const escalas = {};
    const ferias = {};
    const feriados = {};

    const vtDescontos = {};
    const contadorLancamentos = {};
    companiesInState(state).forEach((company) => {
      const block = state.companies?.[company] || defaultCompanyData(company);
      empresas[company] = block.companyInfo || defaultCompanyData(company).companyInfo;
      funcionarios[company] = block.employees || [];
      escalas[company] = block.manualScale || {};
      ferias[company] = {
        vacations: block.vacations || [],
        absences: block.absences || []
      };
      feriados[company] = block.holidays || [];
      vtDescontos[company] = block.vtDeductions || {};
      contadorLancamentos[company] = block.contadorLancamentos || {};
    });

    return {
      configuracoes: {
        selectedCompany:
          state.selectedCompany || (COMPANIES.includes(DEFAULT_SELECTED_COMPANY) ? DEFAULT_SELECTED_COMPANY : COMPANIES[0]),
        escalaYearMonth: state.escalaSelectedYearMonth || "",
        updatedAt: Date.now()
      },
      empresas,
      funcionarios,
      escalas,
      ferias,
      feriados,
      vtDescontos,
      holidaysWorked: buildHolidaysWorkedIndex(state),
      feriadosCalendario: state.calendarHolidays || [],
      coverageAlerts: state.coverageAlerts || [],
      coveragePrincipalBindings: state.coveragePrincipalBindings || {},
      scaleCodeConfig: state.scaleCodeConfig || {},
      valeTransporte: state.valeTransporte || {},
      contadorLancamentos
    };
  }

  function buildHolidaysWorkedIndex(state) {
    const index = {};
    companiesInState(state).forEach((company) => {
      const holidays = state.companies?.[company]?.holidays || [];
      index[company] = holidays.flatMap((holiday) =>
        (holiday.workedEmployees || []).map((item) => ({
          holidayId: holiday.id,
          holidayName: holiday.name,
          date: holiday.date,
          employeeId: item.employeeId,
          compensationDate: item.compensationDate || "",
          origin: item.origin || "",
          autoCreated: Boolean(item.autoCreated),
          status: item.status || (item.compensationDate ? "Compensado" : "Pendente")
        }))
      );
    });
    return index;
  }

  function firebaseToState(data) {
    if (!data || typeof data !== "object") return null;

    if (data.state && typeof data.state === "object" && !data.empresas) {
      return data.state;
    }

    const companies = {};
    const remoteCompanyKeys = new Set([
      ...COMPANIES,
      ...Object.keys(data.empresas || {}),
      ...Object.keys(data.funcionarios || {}),
      ...Object.keys(data.escalas || {})
    ]);
    [...remoteCompanyKeys].forEach((company) => {
      const base = defaultCompanyData(company);
      const feriasBlock = data.ferias?.[company];
      let vacations = [];
      let absences = [];

      if (Array.isArray(feriasBlock)) {
        vacations = feriasBlock;
      } else if (feriasBlock && typeof feriasBlock === "object") {
        vacations = feriasBlock.vacations || [];
        absences = feriasBlock.absences || [];
      }

      companies[company] = {
        companyInfo: { ...base.companyInfo, ...(data.empresas?.[company] || {}) },
        employees: data.funcionarios?.[company] || [],
        manualScale: data.escalas?.[company] || {},
        vacations,
        absences,
        holidays: data.feriados?.[company] || [],
        vtDeductions: data.vtDescontos?.[company] || {},
        contadorLancamentos: data.contadorLancamentos?.[company] || {}
      };
    });

    return {
      selectedCompany:
        data.configuracoes?.selectedCompany ||
        (COMPANIES.includes(DEFAULT_SELECTED_COMPANY) ? DEFAULT_SELECTED_COMPANY : COMPANIES[0]),
      escalaSelectedYearMonth: data.configuracoes?.escalaYearMonth || "",
      companies,
      valeTransporte: data.valeTransporte || {},
      calendarHolidays: data.feriadosCalendario || data.calendarHolidays || [],
      coverageAlerts: data.coverageAlerts || [],
      coveragePrincipalBindings: data.coveragePrincipalBindings || {},
      scaleCodeConfig: data.scaleCodeConfig || {}
    };
  }

  function buildUpdates(payload) {
    const updates = {};
    Object.keys(payload).forEach((key) => {
      updates[`${ROOT}/${key}`] = payload[key];
    });
    return updates;
  }

  function loadFromFirebase() {
    if (!ready) return Promise.resolve(null);
    setStatus("syncing", "Carregando dados do servidor…");
    return db
      .ref(ROOT)
      .once("value")
      .then((snap) => {
        const val = snap.val();
        if (!val) return null;
        return firebaseToState(val);
      })
      .catch((error) => {
        console.warn("[FirebaseSync] Falha ao carregar:", error);
        setStatus("error", error.message);
        return null;
      });
  }

  function save(state) {
    if (!ready || !isOnline() || !window.AppAuth?.isLoggedIn()) {
      return Promise.resolve();
    }

    pushing = true;
    lastPushedAt = Date.now();
    setStatus("syncing", "Enviando alterações…");

    const payload = stateToFirebase(state);
    payload.configuracoes.updatedAt = lastPushedAt;

    return db
      .ref()
      .update(buildUpdates(payload))
      .then(() => {
        setStatus("online", "Dados sincronizados em tempo real");
      })
      .catch((error) => {
        console.warn("[FirebaseSync] Falha ao salvar:", error);
        setStatus("error", error.message);
      })
      .finally(() => {
        window.setTimeout(() => {
          pushing = false;
        }, PUSH_GUARD_MS);
      });
  }

  function bootstrap(getLocalState, applyRemote) {
    if (!ready) return Promise.resolve(false);

    if (!isOnline()) {
      setStatus("offline", "Sem internet — usando dados locais");
      return Promise.resolve(false);
    }

    return loadFromFirebase()
      .then((remoteState) => {
        const localState = getLocalState?.();

        if (remoteState && localState && window.AppData?.mergeRemoteIntoLocal) {
          const merged = window.AppData.mergeRemoteIntoLocal(localState, remoteState);
          applyRemote(merged, false);
          setStatus("online", "Dados mesclados (local + Firebase)");
          return save(merged).then(() => true).catch(() => true);
        }

        if (remoteState) {
          applyRemote(remoteState, true);
          setStatus("online", "Dados carregados do Firebase");
          return true;
        }

        if (localState && hasLocalData(localState)) {
          return save(localState).then(() => {
            setStatus("online", "Dados locais enviados ao Firebase");
            return true;
          }).catch(() => true);
        }

        setStatus("online", "Aguardando primeiro cadastro");
        return false;
      })
      .catch((error) => {
        console.error("[FirebaseSync] Bootstrap error:", error);
        setStatus("error", error?.message || "Erro ao inicializar");
        return false;
      });
  }

  function hasLocalData(state) {
    if (!state?.companies) return false;
    return COMPANIES.some((company) => {
      const block = state.companies[company];
      if (!block) return false;
      return (
        (block.employees?.length || 0) > 0 ||
        (block.holidays?.length || 0) > 0 ||
        (block.vacations?.length || 0) > 0 ||
        (block.absences?.length || 0) > 0 ||
        Object.keys(block.manualScale || {}).length > 0 ||
        Boolean(block.companyInfo?.cnpj) ||
        Boolean(block.companyInfo?.responsibleName)
      );
    });
  }

  function startSync(applyRemote, onUiRefresh) {
    if (!ready || listening) return;
    listening = true;

    const handler = (snap) => {
      if (pushing) return;

      const raw = snap.val();
      if (!raw) return;

      const remoteUpdatedAt = raw.configuracoes?.updatedAt || 0;
      if (remoteUpdatedAt && remoteUpdatedAt === lastPushedAt) return;

      const remoteState = firebaseToState(raw);
      if (!remoteState) return;

      applyRemote(remoteState);
      setStatus("online", "Atualizado em tempo real");
      if (typeof onUiRefresh === "function") onUiRefresh();
    };

    const ref = db.ref(ROOT);
    ref.on(
      "value",
      handler,
      (error) => {
        console.warn("[FirebaseSync] Listener erro:", error);
        setStatus("error", error?.message || "Erro no listener");
      }
    );
    unsubscribe = () => ref.off("value", handler);

    window.addEventListener("online", () => {
      setStatus("syncing", "Reconectando…");
      loadFromFirebase().then((remoteState) => {
        if (remoteState) {
          applyRemote(remoteState);
          if (typeof onUiRefresh === "function") onUiRefresh();
        } else if (window.AppData?.state) {
          save(window.AppData.state);
        }
        setStatus("online", "Conexão restaurada");
      });
    });

    window.addEventListener("offline", () => {
      setStatus("offline", "Sem internet — alterações salvas localmente");
    });
  }

  function stopSync() {
    if (typeof unsubscribe === "function") {
      unsubscribe();
      unsubscribe = null;
    }
    listening = false;
  }

  window.FirebaseSync = {
    init,
    isReady,
    isOnline,
    save,
    loadFromFirebase,
    bootstrap,
    startSync,
    stopSync,
    firebaseToState,
    stateToFirebase
  };
})();
