/**
 * RhCatalog — regras de negócio de CARGOS E SALÁRIOS e QUADRO DE VAGAS
 * (2026-11-22). Sem DOM: usado pelas telas (js/cargos.js, js/quadro-vagas.js,
 * js/funcionarios.js) e pelos testes (scripts/verify-cargos-salarios.mjs,
 * scripts/verify-quadro-vagas.mjs).
 *
 * Dados por empresa (bloco state.companies[empresa]):
 *   cargos     [{ id, name, cbo, salary, commissions[], notes, salaryHistory[] }]
 *   comissoes  [{ id, name, description }]   (só o que o usuário editou/criou)
 *   vagas      [{ id, cargoId, role, department, quantity, contractType, reason,
 *                 openDate, priority, deadline, status, manager, notes }]
 *   candidatos [{ id, vagaId, vagaLabel, name, contact, situation, date,
 *                 parecer, feedbackSent, notes }]
 *   admissoes  [{ id, name, contact, cargoId, role, vagaId, date, situation, notes }]
 *
 * REGRAS FIXAS (PROJECT_RULES.md → "Cargos e Salários"):
 *  - Uma função tem UM salário: nome único por empresa (caixa/acento/espaço).
 *  - CBO já usado por outra função: aviso + confirmação (CBO_SHARED); níveis da mesma função (Cozinheiro I / II) sem aviso.
 *  - Funcionário guarda roleId + role (nome); salário e CBO vêm SEMPRE da
 *    função — nunca são gravados nem editados pelo Cadastro de Funcionários.
 *  - Exclusão arquiva antes na Lixeira (archiveDeletion) + tombstone.
 */
(function () {
  const COMMISSION_DEFAULTS = [
    { id: "taxa-servico-bar", name: "Taxa de Serviço Bar" },
    { id: "taxa-servico-frigobar", name: "Taxa de Serviço Frigobar" },
    { id: "comissao-ocupacao", name: "Comissão Ocupação" },
    { id: "walk-in", name: "Walk-in" },
    { id: "extensao-diaria", name: "Extensão de Diária" },
    { id: "pl-anual", name: "PL Anual" }
  ];

  const VAGA_STATUS = ["Aberta", "Triagem", "Entrevistas", "Proposta", "Admissão", "Concluída", "Suspensa", "Cancelada"];
  const VAGA_STATUS_CLOSED = ["Concluída", "Cancelada"];
  const CONTRACT_TYPES = ["CLT (fixo)", "Temporário", "Estágio", "Aprendiz", "PJ", "Outro"];
  const VAGA_REASONS = ["Substituição", "Aumento de quadro", "Sazonalidade", "Nova função", "Escala 5x2", "Outro"];
  const VAGA_PRIORITIES = ["Urgente", "Normal", "Sem pressa"];
  const ESCOLARIDADES = [
    "Não exigida",
    "Ensino fundamental incompleto",
    "Ensino fundamental completo",
    "Ensino médio incompleto",
    "Ensino médio completo",
    "Curso técnico",
    "Ensino superior incompleto",
    "Ensino superior completo",
    "Pós-graduação"
  ];
  /** Textos do perfil da vaga (2026-11-22): campo → rótulo. */
  const VAGA_PERFIL_FIELDS = [
    { key: "atribuicoes", label: "Atribuições do cargo" },
    { key: "requisitosObrigatorios", label: "Requisitos obrigatórios" },
    { key: "requisitosDesejaveis", label: "Requisitos desejáveis" },
    { key: "requisitosDiferenciais", label: "Requisitos diferenciais" }
  ];
  const CANDIDATE_SITUATIONS = [
    "Buscar candidatos",
    "Agendar",
    "Agendado",
    "Entrevistado",
    "Aprovado",
    "Reprovado",
    "Desistiu",
    "Standby"
  ];
  const CANDIDATE_CLOSED = ["Aprovado", "Reprovado", "Desistiu"];
  const ADMISSION_SITUATIONS = [
    "Documentação",
    "Agendar exame",
    "Exame agendado",
    "ASO liberado",
    "Enviado à contabilidade",
    "Iniciou",
    "Pendente",
    "Cancelada"
  ];
  const ADMISSION_DONE = "Iniciou";

  function data(company) {
    return AppData.getCompanyData(company);
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return AppData.normalizeSearchText(clean(value));
  }

  function byName(a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
  }

  // ── Dinheiro / CBO ────────────────────────────────────────────────────────

  /** "1.518,00" | "R$ 1518,5" | "1518.50" | 1518 → 1518.5; vazio → null. */
  function parseMoney(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    let s = String(value).replace(/R\$/gi, "").replace(/\s/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "";
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // ── Insalubridade (CLT art. 192: 10% mínimo, 20% médio, 40% máximo) ──────
  const INSALUBRIDADE_GRAUS = [
    { percent: 10, label: "Grau mínimo" },
    { percent: 20, label: "Grau médio" },
    { percent: 40, label: "Grau máximo" }
  ];

  /** "20" | "20,5" | "20%" → 20.5; vazio/0 → null (sem insalubridade); inválido → NaN. */
  function parsePercent(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).replace("%", "").replace(/\s/g, "").replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    if (n === 0) return null;
    return n > 0 && n <= 100 ? Math.round(n * 100) / 100 : NaN;
  }

  function formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
    return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }

  /** "20% (grau médio)" | "25% (CCT/laudo)" | "" quando a função não tem. */
  function insalubridadeLabel(value) {
    if (value === null || value === undefined) return "";
    const grau = INSALUBRIDADE_GRAUS.find((g) => g.percent === Number(value));
    return `${formatPercent(value)} (${grau ? grau.label.toLocaleLowerCase("pt-BR") : "CCT/laudo"})`;
  }

  /** Remuneração da função: salário + insalubridade (valor) + gratificação. */
  function remuneracaoCargo(cargo) {
    if (!cargo || cargo.salary == null) return null;
    return Math.round((cargo.salary + (insalubridadeValor(cargo) || 0) + (cargo.gratificacao || 0)) * 100) / 100;
  }

  /** Valor da insalubridade = base × percentual; null sem percentual ou sem base. */
  function insalubridadeValor(cargo) {
    const pct = Number(cargo?.insalubridade);
    const base = Number(cargo?.insalubridadeBase);
    if (cargo?.insalubridade == null || cargo?.insalubridadeBase == null || !Number.isFinite(pct) || !Number.isFinite(base)) return null;
    return Math.round(base * pct) / 100;
  }

  function formatMoneyInput(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "";
    return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** CBO = 6 dígitos, exibido "0000-00". Vazio é permitido (a definir). */
  function formatCbo(value) {
    const digits = AppData.cboDigits(value);
    if (!digits) return "";
    if (digits.length !== 6) return null;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  // ── Padronização de grafia das funções ────────────────────────────────────

  const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o"]);
  const ABBREVIATIONS = { "enc.": "encarregado", "enc": "encarregado", "aux.": "auxiliar", "aux": "auxiliar", "ger.": "gerente", "sup.": "supervisor" };
  // Correções de grafia conhecidas (chave sem acento/caixa → grafia correta).
  const WORD_FIXES = {
    garcon: "garçom",
    garcom: "garçom",
    alimentacao: "alimentação",
    servicos: "serviços",
    servico: "serviço",
    manutencao: "manutenção",
    recepcao: "recepção",
    governanca: "governança",
    confeitaria: "confeitaria",
    almoxarifado: "almoxarifado",
    lavanderia: "lavanderia",
    tecnico: "técnico",
    mecanico: "mecânico",
    eletricista: "eletricista",
    administrativo: "administrativo",
    seguranca: "segurança"
  };
  const PHRASE_FIXES = [[/^sub[\s-]+gerente\b/, "subgerente"]];
  const ROMAN = /^(i|ii|iii|iv|v|vi)$/i;

  /** Sugestão de grafia padrão: abreviações por extenso, acentos e caixa de título. */
  function canonicalRoleName(raw) {
    let text = clean(raw).toLocaleLowerCase("pt-BR");
    if (!text) return "";
    PHRASE_FIXES.forEach(([re, to]) => { text = text.replace(re, to); });
    return text
      .split(" ")
      .map((word) => ABBREVIATIONS[word] || word)
      .join(" ")
      .split(" ")
      .map((word, index) => {
        const bare = AppData.normalizeSearchText(word);
        const fixed = WORD_FIXES[bare] || word;
        if (ROMAN.test(fixed)) return fixed.toUpperCase();
        if (index > 0 && LOWER_WORDS.has(fixed)) return fixed;
        return fixed.charAt(0).toLocaleUpperCase("pt-BR") + fixed.slice(1);
      })
      .join(" ");
  }

  // ── Comissões ─────────────────────────────────────────────────────────────

  /** As 6 comissões padrão (com a explicação salva, se houver) + as criadas. */
  function listComissoes(company) {
    const stored = data(company).comissoes || [];
    const byId = new Map(stored.map((row) => [row.id, row]));
    const defaults = COMMISSION_DEFAULTS.map((def) => ({
      ...def,
      description: "",
      isDefault: true,
      ...(byId.get(def.id) || {}),
      id: def.id
    }));
    const custom = stored
      .filter((row) => !COMMISSION_DEFAULTS.some((def) => def.id === row.id))
      .map((row) => ({ ...row, isDefault: false }))
      .sort(byName);
    return [...defaults, ...custom];
  }

  function saveComissao(company, input) {
    const name = clean(input?.name);
    if (!name) throw new Error("Informe o nome da comissão.");
    const all = listComissoes(company);
    const id = input.id || AppData.newId("comissao");
    if (all.some((row) => row.id !== id && key(row.name) === key(name))) {
      throw new Error(`Já existe a comissão "${name}".`);
    }
    const block = data(company);
    const stamp = AppData.now();
    const previous = block.comissoes.find((row) => row.id === id);
    const record = {
      id,
      name,
      description: String(input.description ?? previous?.description ?? "").trim(),
      createdAt: previous?.createdAt || stamp,
      updatedAt: stamp,
      updatedBy: AppData.currentUserEmail()
    };
    block.comissoes = [...block.comissoes.filter((row) => row.id !== id), record];
    AppData.saveState();
    return record;
  }

  function comissaoName(company, id) {
    return listComissoes(company).find((row) => row.id === id)?.name || "";
  }

  // ── Cargos (funções) ──────────────────────────────────────────────────────

  function listCargos(company) {
    return [...(data(company).cargos || [])].sort(byName);
  }

  function getCargo(company, id) {
    if (!id) return null;
    return (data(company).cargos || []).find((row) => row.id === id) || null;
  }

  function findCargoByName(company, name) {
    const k = key(name);
    if (!k) return null;
    return (data(company).cargos || []).find((row) => key(row.name) === k) || null;
  }

  /** Função do funcionário: pelo vínculo (roleId) ou, no legado, pelo nome. */
  function resolveEmployeeCargo(employee, company) {
    if (!employee) return null;
    return getCargo(company, employee.roleId) || findCargoByName(company, employee.role);
  }

  function employeesForCargo(company, cargo) {
    if (!cargo) return [];
    return (data(company).employees || []).filter((employee) => {
      if (employee.roleId) return employee.roleId === cargo.id;
      return key(employee.role) === key(cargo.name);
    });
  }

  /**
   * Cria/edita uma função. Valida nome único (um salário por função); CBO já
   * usado por outra função lança erro code "CBO_SHARED" até a confirmação. Renomear atualiza o nome do cargo nos funcionários vinculados
   * (histórico em roleHistory — a grafia antiga nunca se perde).
   */
  function saveCargo(company, input) {
    const block = data(company);
    const name = clean(input?.name);
    if (!name) throw new Error("Informe o nome da função.");
    const cbo = formatCbo(input.cbo);
    if (cbo === null) throw new Error("CBO inválido: informe 6 dígitos (ex.: 5134-05).");
    const salary = parseMoney(input.salary);
    if (Number.isNaN(salary)) throw new Error("Salário inválido.");

    const previous = input.id ? block.cargos.find((row) => row.id === input.id) : null;
    const id = previous?.id || input.id || AppData.newId("cargo");
    const validCommissions = new Set(listComissoes(company).map((row) => row.id));
    const commissions = [...new Set((input.commissions || []).filter((c) => validCommissions.has(c)))];

    const candidate = { id, name, cbo: cbo || "" };
    const conflict = AppData.findCargoConflict(block.cargos, candidate);
    if (conflict) throw new Error(conflict);

    // CBO já usado por função diferente: só avisa — grava com a confirmação
    // do usuário (input.confirmCboShared). Pergunta de novo só se o CBO mudar.
    const shared = AppData.findCboShared(block.cargos, candidate);
    const cboChanged = !previous || AppData.cboDigits(previous.cbo) !== AppData.cboDigits(cbo);
    if (shared.length && cboChanged && !input.confirmCboShared) {
      const error = new Error(
        `O CBO ${cbo} já está atribuído à função ${shared.map((c) => `"${c.name}"`).join(", ")}.`
      );
      error.code = "CBO_SHARED";
      error.sharedWith = shared.map((c) => c.name);
      throw error;
    }

    // Gratificação (R$, mesmo formato do salário). Ausente no input = mantém.
    const gratificacao = Object.prototype.hasOwnProperty.call(input, "gratificacao")
      ? parseMoney(input.gratificacao)
      : previous?.gratificacao ?? null;
    if (Number.isNaN(gratificacao)) throw new Error("Gratificação inválida.");

    const stamp = AppData.now();
    const user = AppData.currentUserEmail();
    const gratificacaoHistory = Array.isArray(previous?.gratificacaoHistory) ? [...previous.gratificacaoHistory] : [];
    if ((previous?.gratificacao ?? null) !== (gratificacao ?? null)) {
      const entry = { from: AppData.todayISO(), at: stamp, by: user };
      if (gratificacao !== null) entry.value = gratificacao; // ausência = removida
      gratificacaoHistory.push(entry);
    }
    const salaryHistory = Array.isArray(previous?.salaryHistory) ? [...previous.salaryHistory] : [];
    const previousSalary = previous ? (previous.salary ?? null) : null;
    if (previousSalary !== (salary ?? null)) {
      const entry = { from: AppData.todayISO(), at: stamp, by: user };
      if (salary !== null) entry.salary = salary; // RTDB: ausência = salário removido
      salaryHistory.push(entry);
    }

    // Insalubridade: ausente no input = mantém a atual (chamadas antigas).
    const insalubridade = Object.prototype.hasOwnProperty.call(input, "insalubridade")
      ? parsePercent(input.insalubridade)
      : previous?.insalubridade ?? null;
    if (Number.isNaN(insalubridade)) {
      throw new Error("Percentual de insalubridade inválido: informe um valor entre 0,01% e 100%.");
    }
    // Salário base para cálculo da insalubridade (só existe com insalubridade).
    let insalubridadeBase = Object.prototype.hasOwnProperty.call(input, "insalubridadeBase")
      ? parseMoney(input.insalubridadeBase)
      : previous?.insalubridadeBase ?? null;
    if (Number.isNaN(insalubridadeBase)) throw new Error("Salário base para cálculo da insalubridade inválido.");
    if (insalubridade === null) insalubridadeBase = null;
    const insalubridadeHistory = Array.isArray(previous?.insalubridadeHistory) ? [...previous.insalubridadeHistory] : [];
    if (
      (previous?.insalubridade ?? null) !== (insalubridade ?? null) ||
      (previous?.insalubridadeBase ?? null) !== (insalubridadeBase ?? null)
    ) {
      const entry = { from: AppData.todayISO(), at: stamp, by: user };
      if (insalubridade !== null) entry.percent = insalubridade; // ausência = removida
      if (insalubridadeBase !== null) entry.base = insalubridadeBase;
      insalubridadeHistory.push(entry);
    }

    const record = {
      id,
      name,
      cbo: cbo || "",
      salary: salary ?? null,
      insalubridadeHistory,
      gratificacaoHistory,
      commissions,
      notes: String(input.notes ?? previous?.notes ?? "").trim(),
      salaryHistory,
      createdAt: previous?.createdAt || stamp,
      updatedAt: stamp,
      updatedBy: user
    };
    if (record.salary === null) delete record.salary; // RTDB: ausência = sem salário
    if (insalubridade !== null) record.insalubridade = insalubridade;
    if (insalubridadeBase !== null) record.insalubridadeBase = insalubridadeBase;
    if (gratificacao !== null) record.gratificacao = gratificacao;
    if (shared.length) {
      // Registro de quem confirmou o CBO compartilhado (mantido enquanto valer).
      record.cboShared = cboChanged || !previous?.cboShared
        ? { with: shared.map((c) => c.name).join(", "), by: user, at: stamp }
        : { ...previous.cboShared, with: shared.map((c) => c.name).join(", ") };
    }

    let renamed = 0;
    if (previous && previous.name !== name) {
      employeesForCargo(company, previous).forEach((employee) => {
        renameEmployeeRole(employee, record, stamp, user, "Função renomeada em Cargos e Salários");
        renamed += 1;
      });
    }

    block.cargos = [...block.cargos.filter((row) => row.id !== id), record];
    AppData.saveState();
    return { cargo: record, renamedEmployees: renamed };
  }

  function renameEmployeeRole(employee, cargo, stamp, user, reason) {
    const from = String(employee.role || "");
    if (from !== cargo.name) {
      employee.roleHistory = [
        ...(Array.isArray(employee.roleHistory) ? employee.roleHistory : []),
        { from, to: cargo.name, at: stamp, by: user, reason }
      ];
    }
    employee.role = cargo.name;
    employee.roleId = cargo.id;
    employee.updatedAt = stamp;
  }

  /** Exclui uma função SEM funcionários (ativos ou inativos). Vai para a Lixeira. */
  function removeCargo(company, id) {
    const block = data(company);
    const cargo = block.cargos.find((row) => row.id === id);
    if (!cargo) return { ok: false, error: "Função não encontrada." };
    const linked = employeesForCargo(company, cargo);
    if (linked.length) {
      return {
        ok: false,
        error: `A função "${cargo.name}" tem ${linked.length} funcionário(s) vinculado(s) (ativos e inativos). Altere o cargo deles antes de excluir.`
      };
    }
    const openVagas = (block.vagas || []).filter(
      (vaga) => vaga.cargoId === id && !VAGA_STATUS_CLOSED.includes(vaga.status)
    );
    if (openVagas.length) {
      return { ok: false, error: `A função "${cargo.name}" tem ${openVagas.length} vaga(s) em andamento no Quadro de Vagas.` };
    }
    return removeRecord(company, "cargos", "cargo", id, `${cargo.name}${cargo.cbo ? ` · CBO ${cargo.cbo}` : ""}`);
  }

  /**
   * Plano de padronização: agrupa os cargos digitados no cadastro da empresa
   * (ativos e inativos) pela grafia padrão sugerida. Só leitura.
   */
  function buildRoleStandardizationPlan(company) {
    const groups = new Map();
    (data(company).employees || []).forEach((employee) => {
      const raw = clean(employee.role);
      if (!raw) return;
      const linked = getCargo(company, employee.roleId);
      if (linked && linked.name === employee.role) return; // já vinculado e padronizado
      const existing = linked || findCargoByName(company, canonicalRoleName(raw)) || findCargoByName(company, raw);
      const suggested = existing?.name || canonicalRoleName(raw);
      const groupKey = key(suggested);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { name: suggested, cargoId: existing?.id || "", variants: new Map(), employees: 0 });
      }
      const group = groups.get(groupKey);
      group.variants.set(employee.role, (group.variants.get(employee.role) || 0) + 1);
      group.employees += 1;
    });
    return [...groups.values()]
      .map((group) => ({
        name: group.name,
        cargoId: group.cargoId,
        employees: group.employees,
        variants: [...group.variants.entries()].map(([text, count]) => ({ text, count }))
      }))
      .sort(byName);
  }

  /**
   * Aplica a padronização aprovada pelo usuário: cria as funções que faltam
   * (sem salário/CBO — preenchidos depois na tela) e vincula os funcionários,
   * guardando a grafia antiga em roleHistory. Grupos com o mesmo nome final são
   * unidos. Ação explícita do usuário, com confirmação na tela.
   */
  function applyRoleStandardization(company, groups) {
    const block = data(company);
    const stamp = AppData.now();
    const user = AppData.currentUserEmail();
    let created = 0;
    let updatedEmployees = 0;
    (groups || []).forEach((group) => {
      const name = clean(group.name);
      if (!name) throw new Error("Há função sem nome na padronização.");
    });
    (groups || []).forEach((group) => {
      const name = clean(group.name);
      let cargo = findCargoByName(company, name);
      if (!cargo) {
        cargo = { id: AppData.newId("cargo"), name, cbo: "", commissions: [], notes: "", salaryHistory: [], createdAt: stamp, updatedAt: stamp, updatedBy: user };
        block.cargos.push(cargo);
        created += 1;
      }
      const variants = new Set((group.variants || []).map((v) => (typeof v === "string" ? v : v.text)));
      block.employees.forEach((employee) => {
        if (!variants.has(employee.role)) return;
        if (employee.roleId === cargo.id && employee.role === cargo.name) return;
        renameEmployeeRole(employee, cargo, stamp, user, "Padronização de grafia (Cargos e Salários)");
        updatedEmployees += 1;
      });
    });
    AppData.saveState();
    return { created, updatedEmployees };
  }

  // ── Quadro de Vagas ───────────────────────────────────────────────────────

  function listRecords(company, col) {
    return [...(data(company)[col] || [])];
  }

  function upsertRecord(company, col, record) {
    const block = data(company);
    const stamp = AppData.now();
    const previous = record.id ? block[col].find((row) => row.id === record.id) : null;
    const out = {};
    Object.entries({ ...record }).forEach(([k, v]) => {
      if (v !== undefined && !(typeof v === "number" && !Number.isFinite(v))) out[k] = v;
    });
    out.id = previous?.id || record.id || AppData.newId(col.slice(0, -1));
    out.createdAt = previous?.createdAt || stamp;
    out.updatedAt = stamp;
    out.updatedBy = AppData.currentUserEmail();
    block[col] = [...block[col].filter((row) => row.id !== out.id), out];
    AppData.saveState();
    return out;
  }

  /** Exclusão definitiva: arquiva na Lixeira + tombstone ANTES de remover. */
  function removeRecord(company, col, kind, id, summary) {
    const block = data(company);
    const record = block[col].find((row) => row.id === id);
    if (!record) return { ok: false, error: "Registro não encontrado." };
    AppData.archiveDeletion(kind, company, summary, { record });
    AppData.recordTombstone(col, company, id);
    block[col] = block[col].filter((row) => row.id !== id);
    AppData.saveState();
    return { ok: true };
  }

  function saveVaga(company, input) {
    const cargo = getCargo(company, input.cargoId);
    const role = cargo?.name || clean(input.role);
    if (!role) throw new Error("Informe o cargo / função da vaga.");
    const quantity = Math.max(1, parseInt(input.quantity, 10) || 1);
    const status = VAGA_STATUS.includes(input.status) ? input.status : "Aberta";
    return upsertRecord(company, "vagas", {
      id: input.id || "",
      cargoId: cargo?.id || "",
      role,
      department: clean(input.department),
      quantity,
      contractType: clean(input.contractType),
      reason: clean(input.reason),
      openDate: clean(input.openDate) || AppData.todayISO(),
      priority: clean(input.priority),
      deadline: clean(input.deadline),
      status,
      manager: clean(input.manager),
      // Escolaridade fora da lista (valor antigo) é mantida como veio.
      escolaridade: clean(input.escolaridade),
      ...Object.fromEntries(VAGA_PERFIL_FIELDS.map((f) => [f.key, String(input[f.key] || "").trim()])),
      notes: String(input.notes || "").trim()
    });
  }

  /** Perfil da vaga mais recente da mesma função (sugestão para vaga nova). */
  function lastVagaPerfil(company, cargoId) {
    if (!cargoId) return null;
    const last = listRecords(company, "vagas")
      .filter((v) => v.cargoId === cargoId)
      .sort((a, b) => String(b.openDate).localeCompare(String(a.openDate)) || (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (!last) return null;
    const perfil = { escolaridade: last.escolaridade || "" };
    VAGA_PERFIL_FIELDS.forEach((f) => { perfil[f.key] = last[f.key] || ""; });
    return Object.values(perfil).some(Boolean) ? perfil : null;
  }

  function vagaLabel(vaga) {
    if (!vaga) return "";
    return `${vaga.role}${vaga.department ? ` · ${vaga.department}` : ""}`;
  }

  function admittedForVaga(company, vagaId) {
    return (data(company).admissoes || []).filter((row) => row.vagaId === vagaId && row.situation === ADMISSION_DONE).length;
  }

  function removeVaga(company, id) {
    const vaga = data(company).vagas.find((row) => row.id === id);
    if (!vaga) return { ok: false, error: "Vaga não encontrada." };
    return removeRecord(company, "vagas", "vaga", id, `${vagaLabel(vaga)} (aberta em ${vaga.openDate || "—"})`);
  }

  function saveCandidato(company, input) {
    const name = clean(input.name);
    if (!name) throw new Error("Informe o nome do candidato.");
    const vaga = data(company).vagas.find((row) => row.id === input.vagaId);
    return upsertRecord(company, "candidatos", {
      id: input.id || "",
      vagaId: vaga?.id || "",
      vagaLabel: vaga ? vagaLabel(vaga) : clean(input.vagaLabel),
      name,
      contact: clean(input.contact),
      situation: CANDIDATE_SITUATIONS.includes(input.situation) ? input.situation : "Agendar",
      date: clean(input.date),
      parecer: String(input.parecer || "").trim(),
      feedbackSent: Boolean(input.feedbackSent),
      notes: String(input.notes || "").trim()
    });
  }

  function removeCandidato(company, id) {
    const row = data(company).candidatos.find((item) => item.id === id);
    if (!row) return { ok: false, error: "Candidato não encontrado." };
    return removeRecord(company, "candidatos", "candidato", id, `${row.name}${row.vagaLabel ? ` — ${row.vagaLabel}` : ""}`);
  }

  function saveAdmissao(company, input) {
    const name = clean(input.name);
    if (!name) throw new Error("Informe o nome do admitido.");
    const cargo = getCargo(company, input.cargoId);
    const vaga = data(company).vagas.find((row) => row.id === input.vagaId);
    return upsertRecord(company, "admissoes", {
      id: input.id || "",
      name,
      contact: clean(input.contact),
      cargoId: cargo?.id || vaga?.cargoId || "",
      role: cargo?.name || vaga?.role || clean(input.role),
      vagaId: vaga?.id || "",
      date: clean(input.date),
      situation: ADMISSION_SITUATIONS.includes(input.situation) ? input.situation : "Documentação",
      notes: String(input.notes || "").trim()
    });
  }

  function removeAdmissao(company, id) {
    const row = data(company).admissoes.find((item) => item.id === id);
    if (!row) return { ok: false, error: "Admissão não encontrada." };
    return removeRecord(company, "admissoes", "admissao", id, `${row.name}${row.role ? ` — ${row.role}` : ""}`);
  }

  /** Indicadores do Painel RH (mesma base das tabelas — nada é gravado). */
  function computePanel(company) {
    const vagas = listRecords(company, "vagas");
    const candidatos = listRecords(company, "candidatos");
    const admissoes = listRecords(company, "admissoes");
    const active = vagas.filter((v) => !VAGA_STATUS_CLOSED.includes(v.status));
    const notCancelled = vagas.filter((v) => v.status !== "Cancelada");
    const admitted = admissoes.filter((a) => a.situation === ADMISSION_DONE).length;
    const openPositions = active.reduce(
      (sum, v) => sum + Math.max(0, (Number(v.quantity) || 0) - admittedForVaga(company, v.id)),
      0
    );
    const byStatus = VAGA_STATUS.map((status) => ({ status, total: vagas.filter((v) => v.status === status).length }))
      .filter((row) => row.total);
    const sectors = new Map();
    active.forEach((v) => {
      const k = v.department || "Sem setor";
      sectors.set(k, (sectors.get(k) || 0) + (Number(v.quantity) || 0));
    });
    return {
      vagasCadastradas: vagas.length,
      vagasEmAndamento: active.length,
      vagasConcluidas: vagas.filter((v) => v.status === "Concluída").length,
      vagasUrgentes: active.filter((v) => v.priority === "Urgente").length,
      posicoesPrevistas: notCancelled.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0),
      posicoesEmAberto: openPositions,
      candidatosEmProcesso: candidatos.filter((c) => !CANDIDATE_CLOSED.includes(c.situation)).length,
      candidatosTotal: candidatos.length,
      admissoesRegistradas: admissoes.length,
      admissoesEmAndamento: admissoes.filter((a) => a.situation !== ADMISSION_DONE && a.situation !== "Cancelada").length,
      admitidos: admitted,
      byStatus,
      bySector: [...sectors.entries()].map(([department, total]) => ({ department, total })).sort((a, b) => b.total - a.total)
    };
  }

  window.RhCatalog = {
    COMMISSION_DEFAULTS,
    VAGA_STATUS,
    VAGA_STATUS_CLOSED,
    CONTRACT_TYPES,
    VAGA_REASONS,
    VAGA_PRIORITIES,
    ESCOLARIDADES,
    VAGA_PERFIL_FIELDS,
    lastVagaPerfil,
    CANDIDATE_SITUATIONS,
    ADMISSION_SITUATIONS,
    ADMISSION_DONE,
    parseMoney,
    INSALUBRIDADE_GRAUS,
    parsePercent,
    formatPercent,
    insalubridadeLabel,
    insalubridadeValor,
    remuneracaoCargo,
    formatMoney,
    formatMoneyInput,
    formatCbo,
    canonicalRoleName,
    listComissoes,
    saveComissao,
    comissaoName,
    listCargos,
    getCargo,
    findCargoByName,
    resolveEmployeeCargo,
    employeesForCargo,
    saveCargo,
    removeCargo,
    buildRoleStandardizationPlan,
    applyRoleStandardization,
    listRecords,
    saveVaga,
    removeVaga,
    vagaLabel,
    admittedForVaga,
    saveCandidato,
    removeCandidato,
    saveAdmissao,
    removeAdmissao,
    computePanel
  };
})();
