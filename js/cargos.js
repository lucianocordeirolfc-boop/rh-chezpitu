/**
 * CARGOS E SALÁRIOS (2026-11-22) — uma aba por empresa (aba superior ativa).
 *
 * Sub-abas:
 *  - Funções e Salários: função, CBO, salário e comissões. Regras (fonte única
 *    em js/rh-catalog.js / AppData.findCargoConflict): uma função = um salário
 *    (nome único); CBO já usado por outra função só com aviso + confirmação.
 *  - Comissões: as 6 comissões do grupo (+ criadas pelo usuário), cada uma com
 *    a explicação editável.
 *
 * "Padronizar e importar do cadastro" traz os cargos digitados no Cadastro de
 * Funcionários com a grafia padrão sugerida (editável) e só grava depois da
 * confirmação do usuário (a grafia antiga fica em employee.roleHistory).
 */
(function () {
  let activeTab = "funcoes";

  function esc(value) {
    return window.App?.escapeHTML(value) ?? String(value ?? "");
  }

  function company() {
    return AppData.getActiveCompany();
  }

  function toast(message, type = "success") {
    window.App?.toast?.(message, type);
  }

  // ── Funções ───────────────────────────────────────────────────────────────

  function commissionPills(cargo) {
    const names = (cargo.commissions || []).map((id) => RhCatalog.comissaoName(company(), id)).filter(Boolean);
    if (!names.length) return `<span class="help-text">—</span>`;
    return names.map((name) => `<span class="pill info rh-pill">${esc(name)}</span>`).join(" ");
  }

  /** Aviso discreto quando o CBO também está em outra função (confirmado). */
  function sharedCboHTML(co, cargo) {
    const shared = AppData.findCboShared(RhCatalog.listCargos(co), cargo);
    if (!shared.length) return "";
    return `<small class="help-text role-catalog-warn" title="${esc(cargo.cboShared ? `Confirmado por ${cargo.cboShared.by}` : "")}">⚠ também em ${esc(shared.map((c) => c.name).join(", "))}</small>`;
  }

  function cargoRows() {
    const co = company();
    const cargos = RhCatalog.listCargos(co);
    if (!cargos.length) {
      return `<tr><td colspan="8" class="rh-empty">Nenhuma função cadastrada para ${esc(co)}. Use "Padronizar e importar do cadastro" para trazer os cargos já usados no Cadastro de Funcionários, ou "+ Nova função".</td></tr>`;
    }
    return cargos
      .map((cargo) => {
        const linked = RhCatalog.employeesForCargo(co, cargo);
        const active = linked.filter((e) => AppData.isEmployeeActive(e)).length;
        return `
          <tr>
            <td><strong>${esc(cargo.name)}</strong>${cargo.notes ? `<small class="help-text">${esc(cargo.notes)}</small>` : ""}</td>
            <td>${cargo.cbo ? esc(cargo.cbo) : `<span class="pill warning rh-pill">a definir</span>`}${sharedCboHTML(co, cargo)}</td>
            <td class="rh-num">${cargo.salary != null ? esc(RhCatalog.formatMoney(cargo.salary)) : `<span class="pill warning rh-pill">a definir</span>`}</td>
            <td class="rh-num">${cargo.gratificacao != null ? esc(RhCatalog.formatMoney(cargo.gratificacao)) : `<span class="help-text">—</span>`}</td>
            <td>${cargo.insalubridade != null ? `<span class="pill warning rh-pill">${esc(RhCatalog.insalubridadeLabel(cargo.insalubridade))}</span>${insalubridadeValueHTML(cargo)}` : `<span class="help-text">—</span>`}</td>
            <td>${commissionPills(cargo)}</td>
            <td class="rh-num" title="${active} ativo(s) de ${linked.length} vinculado(s)">${active}<small class="help-text">${linked.length} no total</small></td>
            <td class="actions">
              <button type="button" class="link-button" data-edit-cargo="${esc(cargo.id)}">Editar</button>
              <button type="button" class="link-button danger-link" data-remove-cargo="${esc(cargo.id)}">Excluir</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function renderStats() {
    const co = company();
    const cargos = RhCatalog.listCargos(co);
    const pending = RhCatalog.buildRoleStandardizationPlan(co).reduce((sum, g) => sum + g.employees, 0);
    return [
      ["Funções", cargos.length, "highlight"],
      ["Sem salário", cargos.filter((c) => c.salary == null).length, ""],
      ["Sem CBO", cargos.filter((c) => !c.cbo).length, ""],
      ["Cargos a padronizar", pending, pending ? "warn" : ""]
    ]
      .map(([label, value, cls]) => `<article class="stat-chip ${cls}"><span>${esc(label)}</span><strong>${value}</strong></article>`)
      .join("");
  }

  function funcoesTabHTML() {
    const co = company();
    const plan = RhCatalog.buildRoleStandardizationPlan(co);
    const pendingEmployees = plan.reduce((sum, g) => sum + g.employees, 0);
    return `
      <article class="card">
        <div class="card-header card-header-compact">
          <div>
            <p class="eyebrow">${esc(co)}</p>
            <h2>Funções e salários</h2>
            <p class="help-text">Cada função tem um único salário. Se o CBO já estiver em outra função, o sistema avisa e pede confirmação (níveis da mesma função, como Cozinheiro I e II, não geram aviso). O Cadastro de Funcionários escolhe a função desta lista e herda salário, gratificação, CBO e insalubridade (não editáveis lá).</p>
          </div>
          <div class="rh-actions">
            ${plan.length ? `<button type="button" class="secondary btn-sm" id="btnStandardizeRoles" title="Traz os cargos do Cadastro de Funcionários com grafia padronizada">Padronizar e importar do cadastro (${pendingEmployees})</button>` : ""}
            <button type="button" class="secondary btn-sm" data-rh-report title="Gera relatório para impressão ou PDF">Relatório PDF</button>
            <button type="button" class="primary btn-sm" id="btnNewCargo">+ Nova função</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table-premium rh-table">
            <thead><tr><th>Função</th><th>CBO</th><th>Salário</th><th>Gratificação</th><th>Insalubridade</th><th>Comissões</th><th>Funcionários ativos</th><th>Ações</th></tr></thead>
            <tbody>${cargoRows()}</tbody>
          </table>
        </div>
      </article>`;
  }

  function commissionChecklist(selected) {
    const chosen = new Set(selected || []);
    const items = RhCatalog.listComissoes(company())
      .map(
        (c) => `<label class="rh-check"><input type="checkbox" name="commissions" value="${esc(c.id)}" ${chosen.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`
      )
      .join("");
    return `
      <details class="rh-dropdown" id="cargoCommissionDropdown">
        <summary><span id="cargoCommissionSummary">${chosen.size ? `${chosen.size} selecionada(s)` : "Selecionar comissões"}</span></summary>
        <div class="rh-dropdown-menu">${items}</div>
      </details>`;
  }

  /** Insalubridade: Não / graus da CLT / outro percentual (CCT ou laudo). */
  function insalubridadeFieldHTML(cargo) {
    const current = cargo?.insalubridade ?? null;
    const isGrau = RhCatalog.INSALUBRIDADE_GRAUS.some((g) => g.percent === current);
    const mode = current === null ? "" : isGrau ? String(current) : "outro";
    const opts = [
      `<option value="" ${mode === "" ? "selected" : ""}>Não</option>`,
      ...RhCatalog.INSALUBRIDADE_GRAUS.map(
        (g) => `<option value="${g.percent}" ${mode === String(g.percent) ? "selected" : ""}>${esc(g.label)} — ${g.percent}%</option>`
      ),
      `<option value="outro" ${mode === "outro" ? "selected" : ""}>Outro percentual (CCT/laudo)</option>`
    ].join("");
    return `
      <label>Insalubridade
        <select id="cargoInsalubridadeMode">${opts}</select>
        <input id="cargoInsalubridadeOutro" inputmode="decimal" autocomplete="off" placeholder="Percentual, ex.: 25"
          value="${mode === "outro" ? esc(String(current).replace(".", ",")) : ""}" style="${mode === "outro" ? "" : "display:none"}">
        <small class="help-text">CLT art. 192: mínimo 10%, médio 20%, máximo 40%.</small>
      </label>
      <label>Salário base para cálculo (R$)
        <input id="cargoInsalubridadeBase" inputmode="decimal" autocomplete="off" placeholder="Ex.: salário mínimo ou piso"
          value="${esc(RhCatalog.formatMoneyInput(cargo?.insalubridadeBase))}" ${current === null ? "disabled" : ""}>
        <small class="help-text">Base sobre a qual o percentual é aplicado.</small>
      </label>
      <label>Valor da insalubridade
        <input id="cargoInsalubridadeValor" readonly tabindex="-1" class="func-readonly-input" value="${esc(RhCatalog.formatMoney(RhCatalog.insalubridadeValor(cargo)) || "")}" placeholder="—">
        <small class="help-text">Calculado: base × percentual.</small>
      </label>`;
  }

  function insalubridadeValueHTML(cargo) {
    const valor = RhCatalog.insalubridadeValor(cargo);
    if (valor == null) return `<small class="help-text">base a definir</small>`;
    return `<small class="help-text">${esc(RhCatalog.formatMoney(valor))} sobre ${esc(RhCatalog.formatMoney(cargo.insalubridadeBase))}</small>`;
  }

  function insalubridadeHistoryHTML(cargo) {
    const history = (cargo?.insalubridadeHistory || []).slice().reverse();
    if (!history.length) return "";
    return `
      <div class="rh-history">
        <p class="eyebrow">Histórico de insalubridade</p>
        <ul>${history
          .map((h) => `<li>${esc(AppData.formatDateBR(h.from))} — ${h.percent != null ? esc(RhCatalog.insalubridadeLabel(h.percent)) : "sem insalubridade"}${h.base != null ? ` · base ${esc(RhCatalog.formatMoney(h.base))}` : ""} <small class="help-text">${esc(h.by || "")}</small></li>`)
          .join("")}</ul>
      </div>`;
  }

  function gratificacaoHistoryHTML(cargo) {
    const history = (cargo?.gratificacaoHistory || []).slice().reverse();
    if (!history.length) return "";
    return `
      <div class="rh-history">
        <p class="eyebrow">Histórico de gratificação</p>
        <ul>${history
          .map((h) => `<li>${esc(AppData.formatDateBR(h.from))} — ${h.value != null ? esc(RhCatalog.formatMoney(h.value)) : "sem gratificação"} <small class="help-text">${esc(h.by || "")}</small></li>`)
          .join("")}</ul>
      </div>`;
  }

  function salaryHistoryHTML(cargo) {
    const history = (cargo?.salaryHistory || []).slice().reverse();
    if (!history.length) return "";
    return `
      <div class="rh-history">
        <p class="eyebrow">Histórico de salário</p>
        <ul>${history
          .map(
            (h) => `<li>${esc(AppData.formatDateBR(h.from))} — ${h.salary != null ? esc(RhCatalog.formatMoney(h.salary)) : "a definir"} <small class="help-text">${esc(h.by || "")}</small></li>`
          )
          .join("")}</ul>
      </div>`;
  }

  function closePopup() {
    document.getElementById("rhPopup")?.remove();
  }

  function openPopup(title, bodyHTML, wide = false) {
    closePopup();
    const overlay = document.createElement("div");
    overlay.id = "rhPopup";
    overlay.className = "popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="popup-card rh-popup ${wide ? "rh-popup-wide" : ""}">
        <div class="popup-header">
          <h3>${esc(title)}</h3>
          <button class="popup-close" type="button" data-rh-close aria-label="Fechar">✕</button>
        </div>
        ${bodyHTML}
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-rh-close]").forEach((b) => b.addEventListener("click", closePopup));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePopup();
    });
    return overlay;
  }

  function openCargoForm(container, cargoId) {
    const co = company();
    const cargo = cargoId ? RhCatalog.getCargo(co, cargoId) : null;
    const linked = cargo ? RhCatalog.employeesForCargo(co, cargo) : [];
    const overlay = openPopup(cargo ? `Editar função — ${cargo.name}` : "Nova função", `
      <form id="cargoForm" class="popup-form func-popup-form">
        <div class="func-form-row cols-3">
          <label>Função<input name="name" required autocomplete="off" value="${esc(cargo?.name || "")}" placeholder="Ex.: Recepcionista"></label>
          <label>CBO<input name="cbo" inputmode="numeric" autocomplete="off" value="${esc(cargo?.cbo || "")}" placeholder="0000-00" maxlength="7"></label>
          <label>Salário (R$)<input name="salary" inputmode="decimal" autocomplete="off" value="${esc(RhCatalog.formatMoneyInput(cargo?.salary))}" placeholder="0,00"></label>
        </div>
        <div class="func-form-row cols-3">
          <label>Gratificação (R$)<input name="gratificacao" inputmode="decimal" autocomplete="off" value="${esc(RhCatalog.formatMoneyInput(cargo?.gratificacao))}" placeholder="0,00"></label>
        </div>
        <div class="func-form-row cols-3">
          ${insalubridadeFieldHTML(cargo)}
        </div>
        <div class="func-form-row">
          <label class="full">Comissões${commissionChecklist(cargo?.commissions)}</label>
        </div>
        <div class="func-form-row">
          <label class="full">Observações<textarea name="notes" rows="2">${esc(cargo?.notes || "")}</textarea></label>
        </div>
        ${cargo ? `<p class="help-text">${linked.length} funcionário(s) vinculado(s). Renomear a função atualiza o cargo deles; salário e CBO valem para todos.</p>` : ""}
        ${salaryHistoryHTML(cargo)}
        ${gratificacaoHistoryHTML(cargo)}
        ${insalubridadeHistoryHTML(cargo)}
        <div class="popup-actions">
          <button type="button" class="btn btn-cancel" data-rh-close>Cancelar</button>
          <button class="primary btn-sm" type="submit">Salvar função</button>
        </div>
      </form>`);
    const form = overlay.querySelector("#cargoForm");
    form.querySelector("[data-rh-close]").addEventListener("click", closePopup);
    const cboInput = form.elements.cbo;
    cboInput.addEventListener("input", () => {
      const d = cboInput.value.replace(/\D/g, "").slice(0, 6);
      cboInput.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
    });
    form.elements.salary.addEventListener("blur", () => {
      const v = RhCatalog.parseMoney(form.elements.salary.value);
      if (v != null && !Number.isNaN(v)) form.elements.salary.value = RhCatalog.formatMoneyInput(v);
    });
    const insalMode = form.querySelector("#cargoInsalubridadeMode");
    const insalOutro = form.querySelector("#cargoInsalubridadeOutro");
    const insalBase = form.querySelector("#cargoInsalubridadeBase");
    const insalValor = form.querySelector("#cargoInsalubridadeValor");
    const refreshInsalValor = () => {
      const pct = RhCatalog.parsePercent(insalMode.value === "outro" ? insalOutro.value : insalMode.value);
      const base = RhCatalog.parseMoney(insalBase.value);
      insalBase.disabled = !insalMode.value;
      insalValor.value =
        pct != null && !Number.isNaN(pct) && base != null && !Number.isNaN(base)
          ? RhCatalog.formatMoney(RhCatalog.insalubridadeValor({ insalubridade: pct, insalubridadeBase: base }))
          : "";
    };
    insalMode.addEventListener("change", () => {
      const outro = insalMode.value === "outro";
      insalOutro.style.display = outro ? "" : "none";
      if (outro) insalOutro.focus();
      else insalOutro.value = "";
      refreshInsalValor();
    });
    insalOutro.addEventListener("input", refreshInsalValor);
    insalBase.addEventListener("input", refreshInsalValor);
    insalBase.addEventListener("blur", () => {
      const v = RhCatalog.parseMoney(insalBase.value);
      if (v != null && !Number.isNaN(v)) insalBase.value = RhCatalog.formatMoneyInput(v);
    });
    form.querySelectorAll("input[name='commissions']").forEach((cb) =>
      cb.addEventListener("change", () => {
        const n = form.querySelectorAll("input[name='commissions']:checked").length;
        form.querySelector("#cargoCommissionSummary").textContent = n ? `${n} selecionada(s)` : "Selecionar comissões";
      })
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = {
        id: cargo?.id || "",
        name: form.elements.name.value,
        cbo: form.elements.cbo.value,
        salary: form.elements.salary.value,
        gratificacao: form.elements.gratificacao.value,
        notes: form.elements.notes.value,
        commissions: [...form.querySelectorAll("input[name='commissions']:checked")].map((cb) => cb.value),
        insalubridade: insalMode.value === "outro" ? insalOutro.value : insalMode.value,
        insalubridadeBase: insalMode.value ? insalBase.value : ""
      };
      if (insalMode.value === "outro" && !String(insalOutro.value).trim()) {
        alert("Informe o percentual de insalubridade.");
        insalOutro.focus();
        return;
      }
      const newName = payload.name.replace(/\s+/g, " ").trim();
      if (cargo && newName && newName !== cargo.name && linked.length) {
        if (!window.confirm(`Renomear "${cargo.name}" para "${newName}" atualiza o cargo de ${linked.length} funcionário(s). A grafia anterior fica no histórico de cada um. Continuar?`)) return;
      }
      if (cargo && cargo.salary != null) {
        const nextSalary = RhCatalog.parseMoney(payload.salary);
        if (nextSalary !== cargo.salary && linked.length && !Number.isNaN(nextSalary)) {
          if (!window.confirm(`O salário de "${cargo.name}" passa de ${RhCatalog.formatMoney(cargo.salary)} para ${nextSalary != null ? RhCatalog.formatMoney(nextSalary) : "a definir"} — vale para os ${linked.length} funcionário(s) da função. Continuar?`)) return;
        }
      }
      const save = (extra = {}) => {
        const result = RhCatalog.saveCargo(company(), { ...payload, ...extra });
        closePopup();
        toast(result.renamedEmployees ? `Função salva. ${result.renamedEmployees} funcionário(s) atualizado(s).` : "Função salva.");
        render(container);
      };
      try {
        save();
      } catch (error) {
        if (error.code === "CBO_SHARED") {
          // CBO em outra função: avisa e só grava com a confirmação do usuário.
          if (!window.confirm(`Atenção: ${error.message}\n\nDeseja atribuir o mesmo CBO a "${newName}" também?`)) return;
          try {
            save({ confirmCboShared: true });
          } catch (again) {
            alert(again.message || "Não foi possível salvar a função.");
          }
          return;
        }
        alert(error.message || "Não foi possível salvar a função.");
      }
    });
    form.elements.name.focus();
  }

  function openStandardization(container) {
    const co = company();
    const plan = RhCatalog.buildRoleStandardizationPlan(co);
    if (!plan.length) {
      alert("Todos os cargos do cadastro já estão vinculados a uma função padronizada.");
      return;
    }
    const rows = plan
      .map(
        (group, index) => `
        <tr>
          <td>${group.variants.map((v) => `<div><code>${esc(v.text)}</code> <small class="help-text">(${v.count})</small></div>`).join("")}</td>
          <td><input class="rh-std-input" data-std-index="${index}" value="${esc(group.name)}" ${group.cargoId ? "readonly" : ""}>
            ${group.cargoId ? `<small class="help-text">já cadastrada em Cargos e Salários</small>` : ""}</td>
          <td class="rh-num">${group.employees}</td>
        </tr>`
      )
      .join("");
    const overlay = openPopup(`Padronizar cargos do cadastro — ${co}`, `
      <div class="popup-form">
        <p class="help-text">Os cargos digitados no Cadastro de Funcionários (ativos e inativos) foram agrupados pela grafia padrão sugerida: abreviações por extenso, acentuação e iniciais maiúsculas. Ajuste o nome se quiser — dois grupos com o mesmo nome viram uma só função. Nada é gravado até você confirmar.</p>
        <div class="table-wrap rh-std-wrap">
          <table class="table-premium rh-table">
            <thead><tr><th>Grafia hoje no cadastro (funcionários)</th><th>Função padronizada</th><th>Funcionários</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="help-text">Salário e CBO ficam "a definir" e são preenchidos depois, em Editar.</p>
        <div class="popup-actions">
          <button type="button" class="btn btn-cancel" data-rh-close>Cancelar</button>
          <button type="button" class="primary btn-sm" id="btnApplyStandardization">Aplicar padronização</button>
        </div>
      </div>`, true);
    overlay.querySelector(".popup-actions [data-rh-close]").addEventListener("click", closePopup);
    overlay.querySelector("#btnApplyStandardization").addEventListener("click", () => {
      const groups = plan.map((group, index) => ({
        ...group,
        name: overlay.querySelector(`[data-std-index="${index}"]`).value
      }));
      if (groups.some((g) => !g.name.trim())) {
        alert("Informe o nome padronizado de todas as funções.");
        return;
      }
      const changes = groups.flatMap((g) => g.variants.filter((v) => v.text !== g.name.trim()).map((v) => `• ${v.text} → ${g.name.trim()} (${v.count})`));
      const newFunctions = new Set(groups.filter((g) => !RhCatalog.findCargoByName(co, g.name)).map((g) => g.name.trim().toLocaleLowerCase("pt-BR"))).size;
      const total = groups.reduce((sum, g) => sum + g.employees, 0);
      const message =
        `Confirma a padronização em ${co}?\n\n` +
        `• ${newFunctions} função(ões) nova(s) em Cargos e Salários\n` +
        `• ${total} funcionário(s) vinculado(s) à função\n` +
        (changes.length ? `\nGrafias alteradas no cadastro:\n${changes.slice(0, 25).join("\n")}${changes.length > 25 ? `\n… e mais ${changes.length - 25}` : ""}\n` : "") +
        `\nA grafia anterior fica guardada no histórico de cada funcionário.`;
      if (!window.confirm(message)) return;
      try {
        const result = RhCatalog.applyRoleStandardization(co, groups);
        closePopup();
        toast(`Padronização aplicada: ${result.created} função(ões) criada(s), ${result.updatedEmployees} funcionário(s) atualizado(s).`);
        render(container);
      } catch (error) {
        alert(error.message || "Não foi possível aplicar a padronização.");
      }
    });
  }

  // ── Comissões ─────────────────────────────────────────────────────────────

  function comissoesTabHTML() {
    const co = company();
    const cargos = RhCatalog.listCargos(co);
    const cards = RhCatalog.listComissoes(co)
      .map((c) => {
        const receivers = cargos.filter((cargo) => (cargo.commissions || []).includes(c.id));
        return `
          <article class="card rh-commission-card">
            <div class="rh-commission-head">
              <h3>${esc(c.name)}</h3>
              ${c.isDefault ? "" : `<button type="button" class="link-button" data-rename-comissao="${esc(c.id)}">Renomear</button>`}
            </div>
            <label class="rh-commission-label">Como funciona
              <textarea rows="4" data-comissao-desc="${esc(c.id)}" placeholder="Explique a regra: base de cálculo, percentual, quem recebe, periodicidade…">${esc(c.description || "")}</textarea>
            </label>
            <div class="rh-commission-foot">
              <span class="help-text">${receivers.length ? `Funções: ${receivers.map((r) => esc(r.name)).join(", ")}` : "Nenhuma função recebe esta comissão."}</span>
              <button type="button" class="primary btn-sm" data-save-comissao="${esc(c.id)}">Salvar explicação</button>
            </div>
          </article>`;
      })
      .join("");
    return `
      <div class="rh-commission-toolbar">
        <p class="help-text">Explique cada comissão. As funções que recebem cada uma são marcadas em "Funções e Salários".</p>
        <div class="rh-actions">
          <button type="button" class="secondary btn-sm" data-rh-report title="Gera relatório para impressão ou PDF">Relatório PDF</button>
          <button type="button" class="secondary btn-sm" id="btnNewComissao">+ Nova comissão</button>
        </div>
      </div>
      <div class="rh-commission-grid">${cards}</div>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render(container) {
    if (!container) return;
    const co = company();
    container.innerHTML = `
      <div class="rh-page">
        <header class="func-page-intro">
          <div class="func-page-intro-head">
            <h2 class="func-module-title">Cargos e Salários</h2>
            <p class="func-module-subtitle">Funções, salários, CBO e comissões — ${esc(co)}</p>
          </div>
          <div class="func-stats-row stat-row">${renderStats()}</div>
        </header>
        <div class="ausencias-tabs-bar">
          <div class="ausencias-tabs" role="tablist">
            <button type="button" class="ausencias-tab-btn ${activeTab === "funcoes" ? "active" : ""}" data-rh-tab="funcoes">Funções e Salários</button>
            <button type="button" class="ausencias-tab-btn ${activeTab === "comissoes" ? "active" : ""}" data-rh-tab="comissoes">Comissões</button>
          </div>
        </div>
        ${activeTab === "comissoes" ? comissoesTabHTML() : funcoesTabHTML()}
      </div>`;
    bind(container);
  }

  function bind(container) {
    const co = company();
    container.querySelectorAll("[data-rh-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.rhTab;
        render(container);
      })
    );
    container.querySelector("#btnNewCargo")?.addEventListener("click", () => openCargoForm(container));
    container.querySelector("[data-rh-report]")?.addEventListener("click", () => window.RhReports?.openCargosReport(co));
    container.querySelector("#btnStandardizeRoles")?.addEventListener("click", () => openStandardization(container));
    container.querySelectorAll("[data-edit-cargo]").forEach((btn) =>
      btn.addEventListener("click", () => openCargoForm(container, btn.dataset.editCargo))
    );
    container.querySelectorAll("[data-remove-cargo]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const cargo = RhCatalog.getCargo(co, btn.dataset.removeCargo);
        if (!cargo) return;
        if (!window.confirm(`Excluir a função "${cargo.name}"?`)) return;
        const result = RhCatalog.removeCargo(co, cargo.id);
        if (!result.ok) {
          alert(result.error);
          return;
        }
        // A cópia continua guardada em deletedArchive (regra fixa: nada some),
        // mas a tela de Cargos não exibe Lixeira (decisão do usuário, 2026-11-22).
        toast(`Função "${cargo.name}" excluída.`);
        render(container);
      })
    );
    container.querySelectorAll("[data-save-comissao]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.saveComissao;
        const current = RhCatalog.listComissoes(co).find((c) => c.id === id);
        const textarea = container.querySelector(`[data-comissao-desc="${CSS.escape(id)}"]`);
        try {
          RhCatalog.saveComissao(co, { id, name: current.name, description: textarea.value });
          toast(`Explicação de "${current.name}" salva.`);
          render(container);
        } catch (error) {
          alert(error.message);
        }
      })
    );
    container.querySelectorAll("[data-rename-comissao]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const current = RhCatalog.listComissoes(co).find((c) => c.id === btn.dataset.renameComissao);
        const name = window.prompt("Novo nome da comissão:", current?.name || "");
        if (!name) return;
        try {
          RhCatalog.saveComissao(co, { id: current.id, name, description: current.description });
          render(container);
        } catch (error) {
          alert(error.message);
        }
      })
    );
    container.querySelector("#btnNewComissao")?.addEventListener("click", () => {
      const name = window.prompt("Nome da nova comissão:");
      if (!name) return;
      try {
        RhCatalog.saveComissao(co, { name, description: "" });
        toast("Comissão criada.");
        render(container);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  window.CargosModule = { render };
})();
