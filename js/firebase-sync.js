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
  // Identidade desta aba/computador: permite reconhecer o ECO do próprio envio
  // sem precisar ignorar tudo o que chega enquanto salvamos (o que fazia perder
  // alterações de outros computadores — ver OWN_PUSH_TTL_MS abaixo).
  const DEVICE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const OWN_PUSH_TTL_MS = 5 * 60 * 1000;

  let db = null;
  let ready = false;
  let listening = false;
  let unsubscribe = null;
  let clockOffsetRef = null;
  let clockSkewWarned = false;

  /** Carimbos (updatedAt) gerados por ESTE dispositivo, para descartar só o eco. */
  const ownPushes = new Map();

  /** Caminho → JSON do último envio confirmado (base do envio incremental). */
  let lastSentByPath = new Map();

  function registerOwnPush(stamp) {
    ownPushes.set(stamp, Date.now());
    ownPushes.forEach((at, key) => {
      if (Date.now() - at > OWN_PUSH_TTL_MS) ownPushes.delete(key);
    });
  }

  function isOwnEcho(raw) {
    const config = raw?.configuracoes || {};
    return config.updatedBy === DEVICE_ID && ownPushes.has(config.updatedAt);
  }

  /** Relógio de referência: servidor do Firebase quando disponível (ver data.js). */
  function syncNow() {
    return window.AppData?.now ? window.AppData.now() : Date.now();
  }

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
    // Sessão nova: o primeiro envio vai completo (nada consta como já enviado).
    lastSentByPath = new Map();
    startClockSync();
    return true;
  }

  /**
   * Alinha o relógio desta máquina ao do servidor do Firebase.
   * `.info/serverTimeOffset` é um nó local do SDK (não depende de regra de
   * leitura) com a diferença, em ms, entre o relógio do PC e o do servidor.
   * Com isso, todo carimbo de versão (updatedAt/deletedAt) passa a ser
   * comparável entre computadores, mesmo com a hora do Windows errada.
   */
  function startClockSync() {
    if (clockOffsetRef || !db || !window.AppData?.setSyncClockOffset) return;
    try {
      clockOffsetRef = db.ref(".info/serverTimeOffset");
      clockOffsetRef.on("value", (snap) => {
        const offset = Number(snap.val()) || 0;
        window.AppData.setSyncClockOffset(offset);
        clockSkewMs = offset;
        refreshStatusBadge();

        if (Math.abs(offset) > CLOCK_SKEW_ALERT_MS) {
          console.warn(
            `[FirebaseSync] Relógio deste computador está ${describeClockSkew(offset)} ` +
              "em relação ao servidor. Os carimbos de versão usarão o horário do servidor."
          );
          if (!clockSkewWarned) {
            clockSkewWarned = true;
            window.App?.toast?.(
              `⚠️ Relógio deste computador está ${describeClockSkew(offset)}. ` +
                "A sincronização usa o horário do servidor, mas vale acertar a data/hora do Windows.",
              "warning",
              8000
            );
          }
        }
      });
    } catch (error) {
      console.warn("[FirebaseSync] Não foi possível ler .info/serverTimeOffset:", error);
    }
  }

  function isReady() {
    return ready;
  }

  function isOnline() {
    return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  }

  // Relógio do PC fora do horário do servidor: acima deste limite o selo avisa.
  const CLOCK_SKEW_ALERT_MS = 60000;
  let clockSkewMs = 0;
  let lastStatus = "syncing";
  let lastDetail = "";

  /** "2min 15s atrasado" / "3h adiantado" — para o selo e a dica. */
  function describeClockSkew(offsetMs) {
    const atrasado = offsetMs > 0; // servidor à frente do PC
    const total = Math.round(Math.abs(offsetMs) / 1000);
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundos = total % 60;
    const partes = [];
    if (horas) partes.push(`${horas}h`);
    if (minutos) partes.push(`${minutos}min`);
    if (!horas && segundos) partes.push(`${segundos}s`);
    return `${partes.join(" ")} ${atrasado ? "atrasado" : "adiantado"}`;
  }

  function setStatus(status, detail) {
    lastStatus = status;
    lastDetail = detail || "";

    const el = document.getElementById("syncStatus");
    if (!el) return;
    el.dataset.status = status;
    const labels = {
      online: "Sincronizado",
      offline: "Offline — cache local",
      syncing: "Sincronizando…",
      error: "Erro de sincronização"
    };
    const label = labels[status] || status;

    // Relógio fora de hora não impede a sincronização (os carimbos usam o
    // horário do servidor), mas precisa ficar visível: hora errada no Windows
    // costuma vir acompanhada de outros sintomas na máquina.
    if (Math.abs(clockSkewMs) > CLOCK_SKEW_ALERT_MS) {
      const resumo = describeClockSkew(clockSkewMs);
      el.dataset.clock = "skew";
      el.textContent = `${label} ⚠ relógio ${resumo}`;
      el.title =
        `${lastDetail ? lastDetail + "\n" : ""}` +
        `O relógio deste computador está ${resumo} em relação ao servidor.\n` +
        "A sincronização usa o horário do servidor, então nada se perde — mas " +
        "vale acertar a data/hora do Windows.";
      return;
    }

    delete el.dataset.clock;
    el.textContent = label;
    el.title = lastDetail;
  }

  /** Reavalia o selo quando só o desvio de relógio mudou. */
  function refreshStatusBadge() {
    setStatus(lastStatus, lastDetail);
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
      manualScale: {},
      manualScaleMeta: {}
    };
  }

  function stateToFirebase(state) {
    const empresas = {};
    const funcionarios = {};
    const escalas = {};
    const escalasMeta = {};
    const ferias = {};
    const feriados = {};

    const vtDescontos = {};
    const contadorLancamentos = {};
    companiesInState(state).forEach((company) => {
      const block = state.companies?.[company] || defaultCompanyData(company);
      empresas[company] = block.companyInfo || defaultCompanyData(company).companyInfo;
      funcionarios[company] = block.employees || [];
      escalas[company] = block.manualScale || {};
      escalasMeta[company] = block.manualScaleMeta || {};
      ferias[company] = {
        vacations: block.vacations || [],
        absences: block.absences || []
      };
      feriados[company] = block.holidays || [];
      vtDescontos[company] = state.valeTransporte?.deductionDays?.[company] || {};
      contadorLancamentos[company] = block.contadorLancamentos || {};
    });

    return {
      configuracoes: {
        pageFilters: state.pageFilters || {},
        escalaYearMonth: state.escalaSelectedYearMonth || "",
        activeCompany: state.activeCompany || "",
        updatedAt: syncNow(),
        updatedBy: DEVICE_ID
      },
      empresas,
      empresasBackup: state.companyInfoBackup || {},
      empresasHistory: state.companyInfoHistory || {},
      funcionarios,
      escalas,
      escalasMeta,
      ferias,
      feriados,
      vtDescontos,
      holidaysWorked: buildHolidaysWorkedIndex(state),
      feriadosCalendario: state.calendarHolidays || [],
      coverageAlerts: state.coverageAlerts || [],
      coveragePrincipalBindings: state.coveragePrincipalBindings || {},
      scaleCodeConfig: state.scaleCodeConfig || {},
      valeTransporte: state.valeTransporte || {},
      // Exclusões (tombstones) para propagar remoções entre PCs sem ressuscitar.
      // Os tombstones de feriado e de vínculo trafegam ANINHADOS aqui (nó já
      // permitido pelas regras do RTDB) — evita depender de regra nova de Database.
      tombstones: {
        ...(state.tombstones || {}),
        __holidayTombstones: state.holidayTombstones || {},
        __workedLinkTombstones: state.workedLinkTombstones || {}
      },
      // Trilha de auditoria (cadastro/inativação/reativação/exclusão).
      auditLog: state.auditLog || [],
      contadorLancamentos
    };
  }

  function buildHolidaysWorkedIndex(state) {
    const index = {};
    companiesInState(state).forEach((company) => {
      const holidays = state.companies?.[company]?.holidays || [];
      index[company] = holidays.flatMap((holiday) =>
        (holiday.workedEmployees || []).map((item) => ({
          holidayId: holiday.id || "",
          holidayName: holiday.name || "",
          date: holiday.date || "",
          // Vínculo legado (migração por nome) pode não ter employeeId: sem o
          // fallback, o valor ia como undefined e o RTDB recusava o envio
          // INTEIRO, matando a sincronização do computador.
          employeeId: item.employeeId || "",
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
        manualScaleMeta: data.escalasMeta?.[company] || {},
        vacations,
        absences,
        holidays: data.feriados?.[company] || [],
        contadorLancamentos: data.contadorLancamentos?.[company] || {}
      };
    });

    const vtFromFirebase = data.valeTransporte || {};
    if (!vtFromFirebase.deductionDays && data.vtDescontos) {
      vtFromFirebase.deductionDays = { ...data.vtDescontos };
    }

    // Tombstones: separa os por id (employees/vacations/absences) dos aninhados
    // (feriado e vínculo), que trafegam dentro do nó "tombstones".
    const rawTombstones = data.tombstones || {};
    const nestedHolidayTombstones = rawTombstones.__holidayTombstones || null;
    const nestedWorkedLinkTombstones = rawTombstones.__workedLinkTombstones || null;
    const idTombstones = {};
    Object.keys(rawTombstones).forEach((k) => {
      if (k === "__holidayTombstones" || k === "__workedLinkTombstones") return;
      idTombstones[k] = rawTombstones[k];
    });

    return {
      pageFilters: data.configuracoes?.pageFilters || {},
      escalaSelectedYearMonth: data.configuracoes?.escalaYearMonth || "",
      activeCompany: data.configuracoes?.activeCompany || "",
      companies,
      companyInfoBackup: data.empresasBackup || {},
      companyInfoHistory: data.empresasHistory || {},
      valeTransporte: vtFromFirebase,
      calendarHolidays: data.feriadosCalendario || data.calendarHolidays || [],
      coverageAlerts: data.coverageAlerts || [],
      coveragePrincipalBindings: data.coveragePrincipalBindings || {},
      scaleCodeConfig: data.scaleCodeConfig || {},
      tombstones: idTombstones,
      // Extraídos do nó tombstones (com fallback ao formato antigo top-level).
      holidayTombstones: nestedHolidayTombstones || data.holidayTombstones || {},
      workedLinkTombstones: nestedWorkedLinkTombstones || {},
      auditLog: Array.isArray(data.auditLog) ? data.auditLog : []
    };
  }

  /**
   * Última linha de defesa antes do envio: o Realtime Database recusa de forma
   * SÍNCRONA (ref.update() lança) qualquer payload com valor `undefined`,
   * número não finito ou chave contendo . # $ / [ ] — e uma única ocorrência
   * derruba a sincronização inteira daquele computador.
   *
   * Aqui o payload é saneado: valores inválidos são omitidos (ausência tem o
   * mesmo significado no RTDB) e chaves inválidas são escapadas com o MESMO
   * escape usado em data.js, de modo que o round-trip continua consistente.
   * Toda ocorrência é registrada no console — em operação normal não deve
   * existir nenhuma.
   */
  function sanitizeForRtdb(value, path, report) {
    if (value === undefined || typeof value === "function") {
      report.push(`${path} (valor ${value === undefined ? "undefined" : "função"})`);
      return undefined;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      report.push(`${path} (número inválido: ${value})`);
      return undefined;
    }
    if (value === null || typeof value !== "object") return value;

    if (Array.isArray(value)) {
      // O RTDB grava array como objeto indexado; trocar undefined por null
      // preserva as posições em vez de deslocar a lista.
      return value.map((item, index) => {
        const clean = sanitizeForRtdb(item, `${path}/${index}`, report);
        return clean === undefined ? null : clean;
      });
    }

    const out = {};
    Object.keys(value).forEach((key) => {
      const clean = sanitizeForRtdb(value[key], `${path}/${key}`, report);
      if (clean === undefined) return;
      let safeKey = key;
      if (window.ImportUtils?.hasForbiddenRtdbKeyChars?.(key)) {
        safeKey = window.ImportUtils.escapeRtdbKey(key);
        report.push(`${path}/${key} (chave inválida → "${safeKey}")`);
      }
      out[safeKey] = clean;
    });
    return out;
  }

  /**
   * Nós indexados por empresa. São enviados POR EMPRESA
   * ("sistemaRH/funcionarios/Chez Pitu") em vez de inteiros, para que uma
   * alteração em uma empresa não reescreva a outra — e para que só o bloco
   * realmente alterado trafegue.
   */
  const COMPANY_SCOPED_NODES = new Set([
    "empresas",
    "empresasBackup",
    "empresasHistory",
    "funcionarios",
    "escalas",
    "escalasMeta",
    "ferias",
    "feriados",
    "vtDescontos",
    "holidaysWorked",
    "contadorLancamentos"
  ]);

  /** Carrega o carimbo de versão/dispositivo: acompanha todo envio real. */
  const CONFIG_PATH = `${ROOT}/configuracoes`;

  /** JSON com chaves ordenadas: mesma saída para o mesmo conteúdo. */
  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  /**
   * Caminho → valor já saneado. Um nó ausente simplesmente não entra no mapa:
   * nunca enviamos `null`, que apagaria o nó no servidor.
   */
  function buildUpdatePaths(payload) {
    const report = [];
    const paths = new Map();
    Object.keys(payload).forEach((key) => {
      const clean = sanitizeForRtdb(payload[key], `${ROOT}/${key}`, report);
      if (clean === undefined) return;
      const base = `${ROOT}/${key}`;
      if (COMPANY_SCOPED_NODES.has(key) && clean && typeof clean === "object" && !Array.isArray(clean)) {
        Object.keys(clean).forEach((scope) => paths.set(`${base}/${scope}`, clean[scope]));
        return;
      }
      paths.set(base, clean);
    });
    if (report.length) {
      console.error(
        `[FirebaseSync] ${report.length} ocorrência(s) saneada(s) antes do envio ao Firebase:`,
        report.slice(0, 20)
      );
    }
    return paths;
  }

  /**
   * Só o que mudou desde o último envio BEM-SUCEDIDO desta sessão. O primeiro
   * envio da sessão vai completo (o cache nasce vazio), e um envio que falha não
   * atualiza o cache — a alteração é reenviada na próxima gravação.
   */
  function buildChangedUpdates(payload) {
    const paths = buildUpdatePaths(payload);
    const updates = {};
    const serialized = new Map();
    let changed = 0;

    paths.forEach((value, path) => {
      if (path === CONFIG_PATH) return; // carimbo: só acompanha uma mudança real
      const json = stableStringify(value);
      serialized.set(path, json);
      if (lastSentByPath.get(path) === json) return;
      updates[path] = value;
      changed += 1;
    });

    if (changed) {
      const config = paths.get(CONFIG_PATH);
      if (config !== undefined) {
        updates[CONFIG_PATH] = config;
        serialized.set(CONFIG_PATH, stableStringify(config));
      }
    }
    return { updates, changed, serialized };
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

  /**
   * Envia o estado completo. NUNCA lança: um erro de envio não pode interromper
   * a ação do usuário nem deixar o computador "surdo" para as alterações dos
   * outros PCs (ref.update() pode lançar de forma síncrona ao validar o payload).
   */
  function save(state) {
    if (!ready || !isOnline() || !window.AppAuth?.isLoggedIn()) {
      return Promise.resolve();
    }

    const stamp = syncNow();

    let updates;
    let changed;
    let serialized;
    try {
      const payload = stateToFirebase(state);
      payload.configuracoes.updatedAt = stamp;
      payload.configuracoes.updatedBy = DEVICE_ID;
      ({ updates, changed, serialized } = buildChangedUpdates(payload));
    } catch (error) {
      console.error("[FirebaseSync] Falha ao montar o payload:", error);
      setStatus("error", error?.message || "Falha ao preparar os dados");
      return Promise.resolve();
    }

    // Nada mudou desde o último envio: não gravar. Evita tráfego inútil e evita
    // acordar os outros computadores com um snapshot idêntico ao que já têm.
    if (!changed) {
      setStatus("online", "Dados sincronizados em tempo real");
      return Promise.resolve();
    }

    setStatus("syncing", `Enviando ${changed} alteração(ões)…`);
    registerOwnPush(stamp);

    let request;
    try {
      request = db.ref().update(updates);
    } catch (error) {
      // Validação síncrona do SDK (chave inválida, undefined, etc.).
      console.error("[FirebaseSync] O Firebase recusou o envio:", error);
      setStatus("error", error?.message || "Envio recusado pelo Firebase");
      return Promise.resolve();
    }

    // Marca como enviado já no disparo: uma ação do usuário costuma chamar
    // saveState() mais de uma vez, e sem isso o mesmo bloco seria reenviado
    // enquanto o servidor não confirmasse o envio anterior.
    const enviadoAgora = new Map();
    Object.keys(updates).forEach((path) => {
      enviadoAgora.set(path, serialized.get(path));
      lastSentByPath.set(path, serialized.get(path));
    });

    return request
      .then(() => {
        setStatus("online", "Dados sincronizados em tempo real");
      })
      .catch((error) => {
        // Desfaz só o que ainda corresponde a ESTE envio, para que a alteração
        // volte a ser enviada na próxima gravação (sem desfazer um envio mais
        // novo que já tenha passado por cima).
        enviadoAgora.forEach((json, path) => {
          if (lastSentByPath.get(path) === json) lastSentByPath.delete(path);
        });
        console.warn("[FirebaseSync] Falha ao salvar:", error);
        setStatus("error", error.message);
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
      const raw = snap.val();
      if (!raw) return;

      // Descarta APENAS o eco do próprio envio (mesmo dispositivo + mesmo
      // carimbo). Antes, qualquer snapshot que chegasse durante um save local
      // era ignorado — e como o evento "value" só dispara quando o dado muda,
      // a alteração feita no outro computador se perdia para sempre.
      if (isOwnEcho(raw)) return;

      const remoteState = firebaseToState(raw);
      if (!remoteState) return;

      applyRemote(remoteState);
      setStatus("online", "Atualizado em tempo real");
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

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  const LOGO_IMAGE_RE = /\.(png|jpe?g|webp)$/i;

  function logoPermissionRule(digits) {
    return [
      `[Logo] ERRO DE PERMISSÃO ao ler logos/${digits}/.`,
      "Regra necessária no Firebase Storage (Console → Storage → Regras):",
      "  rules_version = '2';",
      "  service firebase.storage {",
      "    match /b/{bucket}/o {",
      "      match /logos/{cnpj}/{arquivo=**} {",
      "        allow read: if request.auth != null;",
      "      }",
      "    }",
      "  }"
    ].join("\n");
  }

  /**
   * Resolve a URL de download da logo da empresa a partir do Firebase Storage, na
   * estrutura real `logos/{CNPJ}/<arquivo>`: lista a pasta do CNPJ (somente dígitos)
   * e pega o PRIMEIRO arquivo de imagem (png/jpg/jpeg/webp), independente do nome.
   * Emite logs `[Logo] ...`. Retorna "" quando não encontra / sem permissão / SDK
   * ausente. Apenas leitura.
   */
  function resolveLogoUrlByCnpj(cnpj, company) {
    const digits = onlyDigits(cnpj);
    console.info(`[Logo] Empresa: ${company || "—"}`);
    console.info(`[Logo] CNPJ: ${digits || "—"}`);

    if (!digits) {
      console.warn("[Logo] CNPJ ausente — não é possível localizar a pasta no Storage.");
      return Promise.resolve("");
    }
    if (!window.firebase || typeof window.firebase.storage !== "function") {
      console.warn("[Logo] SDK de Storage indisponível (firebase-storage não carregado).");
      return Promise.resolve("");
    }

    const folder = `logos/${digits}`;
    return window.firebase
      .storage()
      .ref(folder)
      .listAll()
      .then((listing) => {
        const items = listing.items || [];
        const image = items.find((item) => LOGO_IMAGE_RE.test(item.name));

        if (!image) {
          if (items.length) {
            console.warn(`[Logo] Pasta ${folder}/ encontrada, mas sem imagem png/jpg/jpeg/webp (${items.length} arquivo(s)).`);
          } else {
            console.warn(`[Logo] Pasta ${folder}/ vazia ou inexistente — nenhuma imagem para a empresa "${company || ""}".`);
          }
          return "";
        }

        console.info(`[Logo] Pasta encontrada: ${folder}/`);
        console.info(`[Logo] Arquivo encontrado: ${image.name}`);
        return image.getDownloadURL().then((url) => {
          console.info(`[Logo] Download URL: ${url}`);
          return url;
        });
      })
      .catch((error) => {
        if (error && error.code === "storage/unauthorized") {
          console.error(logoPermissionRule(digits));
        } else {
          console.warn(`[Logo] Falha ao listar ${folder}/ no Storage:`, error);
        }
        return "";
      });
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
    stateToFirebase,
    resolveLogoUrlByCnpj
  };
})();
