/**
 * QUADRO DE VAGAS (2026-11-22) — uma aba por empresa (aba superior ativa).
 * Baseado na planilha "Controle de Vagas" do RH; cada guia virou sub-aba:
 *  - Vagas em aberto  (cargo/função vem de Cargos e Salários)
 *  - Painel RH        (indicadores calculados — nada é gravado)
 *  - Recrutamento e Seleção (candidatos por vaga)
 *  - Admissões        (andamento até o início do funcionário)
 * Regras de negócio em js/rh-catalog.js. Exclusões vão para a Lixeira.
 */
(function () {
  let activeTab = "vagas";
  let showClosed = false;

  const TABS = [
    { id: "vagas", label: "Vagas em aberto" },
    { id: "painel", label: "Painel RH" },
    { id: "rs", label: "Recrutamento e Seleção" },
    { id: "admissoes", label: "Admissões" }
  ];

  const STATUS_CLASS = {
    Aberta: "info",
    Triagem: "info",
    Entrevistas: "info",
    Proposta: "warning",
    "Admissão": "warning",
    "Concluída": "success",
    Suspensa: "muted",
    Cancelada: "danger",
    Urgente: "danger",
    Aprovado: "success",
    Reprovado: "danger",
    Desistiu: "muted",
    Standby: "muted",
    Iniciou: "success",
    "ASO liberado": "success"
  };

  function esc(value) {
    return window.App?.escapeHTML(value) ?? String(value ?? "");
  }

  function company() {
    return AppData.getActiveCompany();
  }

  function pill(text) {
    if (!text) return `<span class="help-text">—</span>`;
    return `<span class="pill ${STATUS_CLASS[text] || "muted"} rh-pill">${esc(text)}</span>`;
  }

  function dateBR(iso) {
    return iso ? esc(AppData.formatDateBR(iso)) : "—";
  }

  function options(list, selected, placeholder = "— Selecionar —") {
    const values = [...list];
    if (selected && !values.includes(selected)) values.push(selected); // valor antigo nunca se perde
    return (
      `<option value="">${esc(placeholder)}</option>` +
      values.map((v) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("")
    );
  }

  function cargoOptions(selectedId, selectedRole) {
    const cargos = RhCatalog.listCargos(company());
    let html = `<option value="">— Selecionar função —</option>`;
    html += cargos.map((c) => `<option value="${esc(c.id)}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    if (!selectedId && selectedRole) html += `<option value="" selected>${esc(selectedRole)} (fora de Cargos e Salários)</option>`;
    return html;
  }

  function departments() {
    const set = new Set();
    (AppData.getCompanyData(company()).employees || []).forEach((e) => e.department && set.add(e.department));
    (AppData.getCompanyData(company()).vagas || []).forEach((v) => v.department && set.add(v.department));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function vagaOptions(selectedId) {
    const vagas = RhCatalog.listRecords(company(), "vagas").sort((a, b) => String(b.openDate).localeCompare(String(a.openDate)));
    return (
      `<option value="">— Selecionar vaga —</option>` +
      vagas
        .map((v) => `<option value="${esc(v.id)}" ${v.id === selectedId ? "selected" : ""}>${esc(RhCatalog.vagaLabel(v))}${RhCatalog.VAGA_STATUS_CLOSED.includes(v.status) ? ` (${esc(v.status)})` : ""}</option>`)
        .join("")
    );
  }

  // ── Pop-up genérico ───────────────────────────────────────────────────────

  function closePopup() {
    document.getElementById("vagasPopup")?.remove();
  }

  function openForm(title, fieldsHTML, onSubmit) {
    closePopup();
    const overlay = document.createElement("div");
    overlay.id = "vagasPopup";
    overlay.className = "popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="popup-card rh-popup rh-popup-wide">
        <div class="popup-header">
          <h3>${esc(title)}</h3>
          <button class="popup-close" type="button" data-close aria-label="Fechar">✕</button>
        </div>
        <form class="popup-form func-popup-form" id="vagasForm">
          ${fieldsHTML}
          <div class="popup-actions">
            <button type="button" class="btn btn-cancel" data-close>Cancelar</button>
            <button class="primary btn-sm" type="submit">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePopup));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePopup();
    });
    const form = overlay.querySelector("#vagasForm");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll("input[type='checkbox']").forEach((cb) => { payload[cb.name] = cb.checked; });
      try {
        onSubmit(payload);
        closePopup();
      } catch (error) {
        alert(error.message || "Não foi possível salvar.");
      }
    });
    form.querySelector("input, select, textarea")?.focus();
    return form;
  }

  // ── Vagas ─────────────────────────────────────────────────────────────────

  function vagaRows() {
    const co = company();
    let vagas = RhCatalog.listRecords(co, "vagas");
    const closed = vagas.filter((v) => RhCatalog.VAGA_STATUS_CLOSED.includes(v.status)).length;
    if (!showClosed) vagas = vagas.filter((v) => !RhCatalog.VAGA_STATUS_CLOSED.includes(v.status));
    vagas.sort((a, b) => (a.priority === "Urgente" ? -1 : 0) - (b.priority === "Urgente" ? -1 : 0) || String(a.openDate).localeCompare(String(b.openDate)));
    const rows = vagas.length
      ? vagas
          .map((v) => {
            const admitted = RhCatalog.admittedForVaga(co, v.id);
            const cargo = RhCatalog.getCargo(co, v.cargoId);
            return `
            <tr>
              <td><strong>${esc(v.role)}</strong>${cargo?.cbo ? `<small class="help-text">CBO ${esc(cargo.cbo)}</small>` : ""}</td>
              <td>${esc(v.department || "—")}</td>
              <td class="rh-num">${esc(v.quantity)}<small class="help-text">${admitted} admitido(s)</small></td>
              <td>${esc(v.contractType || "—")}</td>
              <td>${esc(v.reason || "—")}</td>
              <td>${dateBR(v.openDate)}</td>
              <td>${v.priority ? pill(v.priority) : ""}${v.deadline ? `<small class="help-text">até ${dateBR(v.deadline)}</small>` : ""}</td>
              <td>${pill(v.status)}</td>
              <td>${esc(v.manager || "—")}</td>
              <td class="rh-notes">${esc(v.notes || "")}</td>
              <td class="actions">
                <button type="button" class="link-button" data-edit-vaga="${esc(v.id)}">Editar</button>
                <button type="button" class="link-button danger-link" data-remove-vaga="${esc(v.id)}">Excluir</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="11" class="rh-empty">Nenhuma vaga ${showClosed ? "" : "em andamento "}para ${esc(co)}.</td></tr>`;
    return { rows, closed };
  }

  function vagasTabHTML() {
    const { rows, closed } = vagaRows();
    return `
      <article class="card">
        <div class="card-header card-header-compact">
          <div><p class="eyebrow">Controle interno do RH</p><h2>Vagas em aberto</h2></div>
          <div class="rh-actions">
            <label class="rh-inline-check"><input type="checkbox" id="vagasShowClosed" ${showClosed ? "checked" : ""}> Mostrar concluídas/canceladas (${closed})</label>
            ${lixeiraButton()}
            <button type="button" class="primary btn-sm" id="btnNewVaga">+ Nova vaga</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table-premium rh-table">
            <thead><tr><th>Cargo / Função</th><th>Setor</th><th>Qtd.</th><th>Contrato</th><th>Motivo</th><th>Abertura</th><th>Prazo</th><th>Status</th><th>Gestor</th><th>Observações / próxima ação</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
  }

  function openVagaForm(container, id) {
    const co = company();
    const v = id ? RhCatalog.listRecords(co, "vagas").find((row) => row.id === id) : null;
    const form = openForm(v ? "Editar vaga" : "Nova vaga", `
      <div class="func-form-row cols-3">
        <label>Cargo / Função<select name="cargoId">${cargoOptions(v?.cargoId, v?.role)}</select>
          <small class="help-text">Funções de Cargos e Salários (${esc(co)}).</small></label>
        <label>Setor<input name="department" list="vagaDeptList" value="${esc(v?.department || "")}" autocomplete="off">
          <datalist id="vagaDeptList">${departments().map((d) => `<option value="${esc(d)}">`).join("")}</datalist></label>
        <label>Quantidade<input name="quantity" type="number" min="1" value="${esc(v?.quantity || 1)}"></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Tipo de contrato<select name="contractType">${options(RhCatalog.CONTRACT_TYPES, v?.contractType)}</select></label>
        <label>Motivo da abertura<select name="reason">${options(RhCatalog.VAGA_REASONS, v?.reason)}</select></label>
        <label>Data de abertura<input type="date" name="openDate" value="${esc(v?.openDate || AppData.todayISO())}"></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Prioridade<select name="priority">${options(RhCatalog.VAGA_PRIORITIES, v?.priority)}</select></label>
        <label>Prazo desejado<input type="date" name="deadline" value="${esc(v?.deadline || "")}"></label>
        <label>Status<select name="status">${options(RhCatalog.VAGA_STATUS, v?.status || "Aberta", "Aberta")}</select></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Gestor solicitante<input name="manager" value="${esc(v?.manager || "")}" autocomplete="off"></label>
      </div>
      <div class="func-form-row">
        <label class="full">Observações / próxima ação (perfil, horário, requisitos)<textarea name="notes" rows="3">${esc(v?.notes || "")}</textarea></label>
      </div>`, (payload) => {
      if (!payload.cargoId && !v?.role) throw new Error("Selecione a função (cadastre-a antes em Cargos e Salários, se ainda não existir).");
      RhCatalog.saveVaga(co, { ...payload, id: v?.id, role: payload.cargoId ? "" : v?.role });
      window.App?.toast?.("Vaga salva.", "success");
      render(container);
    });
    return form;
  }

  // ── Painel RH ─────────────────────────────────────────────────────────────

  function painelTabHTML() {
    const p = RhCatalog.computePanel(company());
    const kpis = [
      ["Vagas cadastradas", p.vagasCadastradas],
      ["Vagas em andamento", p.vagasEmAndamento],
      ["Vagas urgentes", p.vagasUrgentes],
      ["Vagas concluídas", p.vagasConcluidas],
      ["Posições previstas", p.posicoesPrevistas],
      ["Posições em aberto", p.posicoesEmAberto],
      ["Candidatos em processo", p.candidatosEmProcesso],
      ["Admissões em andamento", p.admissoesEmAndamento],
      ["Admitidos (iniciaram)", p.admitidos]
    ];
    const table = (rows, a, b, empty) =>
      rows.length
        ? `<table class="table-premium rh-table"><thead><tr><th>${a}</th><th>${b}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
        : `<p class="help-text">${empty}</p>`;
    return `
      <div class="rh-kpi-grid">${kpis.map(([l, v]) => `<article class="rh-kpi"><span>${esc(l)}</span><strong>${v}</strong></article>`).join("")}</div>
      <div class="rh-panel-grid">
        <article class="card"><p class="eyebrow">Vagas</p><h2>Por status</h2>
          ${table(p.byStatus.map((r) => `<tr><td>${pill(r.status)}</td><td class="rh-num">${r.total}</td></tr>`), "Status", "Vagas", "Nenhuma vaga cadastrada.")}
        </article>
        <article class="card"><p class="eyebrow">Em andamento</p><h2>Posições por setor</h2>
          ${table(p.bySector.map((r) => `<tr><td>${esc(r.department)}</td><td class="rh-num">${r.total}</td></tr>`), "Setor", "Posições", "Nenhuma vaga em andamento.")}
        </article>
        <article class="card rh-instructions"><p class="eyebrow">Como usar</p><h2>Instruções de preenchimento</h2>
          <ol>
            <li>Registre cada vaga em "Vagas em aberto" — a função vem de Cargos e Salários.</li>
            <li>Use as listas de setor, contrato, motivo, prioridade e status.</li>
            <li>Quantidade = posições autorizadas; admitidos = admissões da vaga com situação "Iniciou".</li>
            <li>Atualize o status e a próxima ação a cada movimentação.</li>
            <li>Candidatos ficam em "Recrutamento e Seleção"; dados pessoais só o necessário (LGPD).</li>
            <li>Os indicadores são calculados das tabelas — nada aqui é digitado.</li>
          </ol>
        </article>
      </div>`;
  }

  // ── Recrutamento e Seleção ────────────────────────────────────────────────

  function rsTabHTML() {
    const co = company();
    const vagas = new Map(RhCatalog.listRecords(co, "vagas").map((v) => [v.id, v]));
    const list = RhCatalog.listRecords(co, "candidatos").sort(
      (a, b) => String(a.vagaLabel).localeCompare(String(b.vagaLabel), "pt-BR") || String(b.date).localeCompare(String(a.date))
    );
    const rows = list.length
      ? list
          .map(
            (c) => `
          <tr>
            <td>${esc(vagas.has(c.vagaId) ? RhCatalog.vagaLabel(vagas.get(c.vagaId)) : c.vagaLabel || "—")}</td>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.contact || "—")}</td>
            <td>${pill(c.situation)}</td>
            <td>${dateBR(c.date)}</td>
            <td class="rh-notes">${esc(c.parecer || "")}</td>
            <td>${c.feedbackSent ? pill("Enviado") : "—"}</td>
            <td class="rh-notes">${esc(c.notes || "")}</td>
            <td class="actions">
              <button type="button" class="link-button" data-edit-cand="${esc(c.id)}">Editar</button>
              <button type="button" class="link-button danger-link" data-remove-cand="${esc(c.id)}">Excluir</button>
            </td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="9" class="rh-empty">Nenhum candidato registrado.</td></tr>`;
    return `
      <article class="card">
        <div class="card-header card-header-compact">
          <div><p class="eyebrow">R&amp;S</p><h2>Recrutamento e Seleção</h2></div>
          <div class="rh-actions">${lixeiraButton()}<button type="button" class="primary btn-sm" id="btnNewCand">+ Novo candidato</button></div>
        </div>
        <div class="table-wrap">
          <table class="table-premium rh-table">
            <thead><tr><th>Vaga</th><th>Candidato</th><th>Contato</th><th>Situação</th><th>Data</th><th>Parecer</th><th>Feedback</th><th>Observações</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
  }

  function openCandForm(container, id) {
    const co = company();
    const c = id ? RhCatalog.listRecords(co, "candidatos").find((row) => row.id === id) : null;
    openForm(c ? "Editar candidato" : "Novo candidato", `
      <div class="func-form-row cols-3">
        <label>Vaga<select name="vagaId" required>${vagaOptions(c?.vagaId)}</select></label>
        <label>Nome do candidato<input name="name" required value="${esc(c?.name || "")}" autocomplete="off"></label>
        <label>Contato<input name="contact" value="${esc(c?.contact || "")}" placeholder="(22) 99999-9999" autocomplete="off"></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Situação<select name="situation">${options(RhCatalog.CANDIDATE_SITUATIONS, c?.situation || "Agendar", "Agendar")}</select></label>
        <label>Data (entrevista/contato)<input type="date" name="date" value="${esc(c?.date || "")}"></label>
        <label class="rh-inline-check rh-form-check"><input type="checkbox" name="feedbackSent" ${c?.feedbackSent ? "checked" : ""}> Feedback enviado ao candidato</label>
      </div>
      <div class="func-form-row">
        <label class="full">Parecer<textarea name="parecer" rows="2">${esc(c?.parecer || "")}</textarea></label>
      </div>
      <div class="func-form-row">
        <label class="full">Observações<textarea name="notes" rows="2">${esc(c?.notes || "")}</textarea></label>
      </div>`, (payload) => {
      RhCatalog.saveCandidato(co, { ...payload, id: c?.id, vagaLabel: c?.vagaLabel });
      window.App?.toast?.("Candidato salvo.", "success");
      render(container);
    });
  }

  // ── Admissões ─────────────────────────────────────────────────────────────

  function admissoesTabHTML() {
    const co = company();
    const list = RhCatalog.listRecords(co, "admissoes").sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const rows = list.length
      ? list
          .map((a) => {
            const cargo = RhCatalog.getCargo(co, a.cargoId);
            return `
          <tr>
            <td><strong>${esc(a.name)}</strong>${a.contact ? `<small class="help-text">${esc(a.contact)}</small>` : ""}</td>
            <td>${esc(cargo?.name || a.role || "—")}</td>
            <td>${dateBR(a.date)}</td>
            <td>${pill(a.situation)}</td>
            <td class="rh-notes">${esc(a.notes || "")}</td>
            <td class="actions">
              <button type="button" class="link-button" data-edit-adm="${esc(a.id)}">Editar</button>
              <button type="button" class="link-button danger-link" data-remove-adm="${esc(a.id)}">Excluir</button>
            </td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="rh-empty">Nenhuma admissão registrada.</td></tr>`;
    return `
      <article class="card">
        <div class="card-header card-header-compact">
          <div><p class="eyebrow">Andamento</p><h2>Admissões</h2>
            <p class="help-text">Ao concluir, cadastre o funcionário em Cadastro de Funcionários (a função já leva salário e CBO).</p></div>
          <div class="rh-actions">${lixeiraButton()}<button type="button" class="primary btn-sm" id="btnNewAdm">+ Nova admissão</button></div>
        </div>
        <div class="table-wrap">
          <table class="table-premium rh-table">
            <thead><tr><th>Admissão</th><th>Cargo</th><th>Prazo / data</th><th>Situação</th><th>Observações</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
  }

  function openAdmForm(container, id) {
    const co = company();
    const a = id ? RhCatalog.listRecords(co, "admissoes").find((row) => row.id === id) : null;
    openForm(a ? "Editar admissão" : "Nova admissão", `
      <div class="func-form-row cols-3">
        <label>Nome<input name="name" required value="${esc(a?.name || "")}" autocomplete="off"></label>
        <label>Contato<input name="contact" value="${esc(a?.contact || "")}" autocomplete="off"></label>
        <label>Cargo / Função<select name="cargoId">${cargoOptions(a?.cargoId, a?.role)}</select></label>
      </div>
      <div class="func-form-row cols-3">
        <label>Vaga (opcional)<select name="vagaId">${vagaOptions(a?.vagaId)}</select></label>
        <label>Prazo / data<input type="date" name="date" value="${esc(a?.date || "")}"></label>
        <label>Situação<select name="situation">${options(RhCatalog.ADMISSION_SITUATIONS, a?.situation || "Documentação", "Documentação")}</select></label>
      </div>
      <div class="func-form-row">
        <label class="full">Observações (exame, ASO, documentos, contabilidade)<textarea name="notes" rows="3">${esc(a?.notes || "")}</textarea></label>
      </div>`, (payload) => {
      RhCatalog.saveAdmissao(co, { ...payload, id: a?.id, role: payload.cargoId ? "" : a?.role });
      window.App?.toast?.("Admissão salva.", "success");
      render(container);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ARCHIVE_KINDS = ["vaga", "candidato", "admissao"];

  function lixeiraButton() {
    return window.LixeiraUI?.toggleButtonHTML({ id: `btnVagasArchive-${activeTab}`, company: company(), kinds: ARCHIVE_KINDS }) || "";
  }

  function render(container) {
    if (!container) return;
    const co = company();
    const p = RhCatalog.computePanel(co);
    const body = { vagas: vagasTabHTML, painel: painelTabHTML, rs: rsTabHTML, admissoes: admissoesTabHTML }[activeTab] || vagasTabHTML;
    container.innerHTML = `
      <div class="rh-page">
        <header class="func-page-intro">
          <div class="func-page-intro-head">
            <h2 class="func-module-title">Quadro de Vagas</h2>
            <p class="func-module-subtitle">Controle de vagas, seleção e admissões — ${esc(co)}</p>
          </div>
          <div class="func-stats-row stat-row">
            <article class="stat-chip highlight"><span>Vagas em andamento</span><strong>${p.vagasEmAndamento}</strong></article>
            <article class="stat-chip"><span>Posições em aberto</span><strong>${p.posicoesEmAberto}</strong></article>
            <article class="stat-chip ${p.vagasUrgentes ? "warn" : ""}"><span>Urgentes</span><strong>${p.vagasUrgentes}</strong></article>
          </div>
        </header>
        <div class="ausencias-tabs-bar">
          <div class="ausencias-tabs" role="tablist">
            ${TABS.map((t) => `<button type="button" class="ausencias-tab-btn ${activeTab === t.id ? "active" : ""}" data-vagas-tab="${t.id}">${esc(t.label)}</button>`).join("")}
          </div>
        </div>
        ${body()}
      </div>`;
    bind(container);
  }

  function confirmRemove(container, label, fn) {
    if (!window.confirm(`Excluir ${label}? O registro vai para a Lixeira e pode ser restaurado.`)) return;
    const result = fn();
    if (!result.ok) {
      alert(result.error);
      return;
    }
    window.App?.toast?.("Excluído (disponível na Lixeira).", "success");
    render(container);
  }

  function bind(container) {
    const co = company();
    container.querySelectorAll("[data-vagas-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.vagasTab;
        render(container);
      })
    );
    container.querySelector("#vagasShowClosed")?.addEventListener("change", (e) => {
      showClosed = e.target.checked;
      render(container);
    });
    container.querySelector(`#btnVagasArchive-${activeTab}`)?.addEventListener("click", () =>
      window.LixeiraUI?.open({ company: co, kinds: ARCHIVE_KINDS, onRestored: () => render(container) })
    );
    container.querySelector("#btnNewVaga")?.addEventListener("click", () => openVagaForm(container));
    container.querySelector("#btnNewCand")?.addEventListener("click", () => {
      if (!RhCatalog.listRecords(co, "vagas").length) {
        alert("Cadastre a vaga antes, em \"Vagas em aberto\".");
        return;
      }
      openCandForm(container);
    });
    container.querySelector("#btnNewAdm")?.addEventListener("click", () => openAdmForm(container));
    container.querySelectorAll("[data-edit-vaga]").forEach((b) => b.addEventListener("click", () => openVagaForm(container, b.dataset.editVaga)));
    container.querySelectorAll("[data-edit-cand]").forEach((b) => b.addEventListener("click", () => openCandForm(container, b.dataset.editCand)));
    container.querySelectorAll("[data-edit-adm]").forEach((b) => b.addEventListener("click", () => openAdmForm(container, b.dataset.editAdm)));
    container.querySelectorAll("[data-remove-vaga]").forEach((b) =>
      b.addEventListener("click", () => confirmRemove(container, "esta vaga", () => RhCatalog.removeVaga(co, b.dataset.removeVaga)))
    );
    container.querySelectorAll("[data-remove-cand]").forEach((b) =>
      b.addEventListener("click", () => confirmRemove(container, "este candidato", () => RhCatalog.removeCandidato(co, b.dataset.removeCand)))
    );
    container.querySelectorAll("[data-remove-adm]").forEach((b) =>
      b.addEventListener("click", () => confirmRemove(container, "esta admissão", () => RhCatalog.removeAdmissao(co, b.dataset.removeAdm)))
    );
  }

  window.QuadroVagasModule = { render };
})();
