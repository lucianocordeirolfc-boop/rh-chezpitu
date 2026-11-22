/**
 * Relatórios em PDF — Cargos e Salários e Quadro de Vagas (2026-11-22).
 *
 * Mesmo padrão do relatório de feriados (js/feriados-report.js): o HTML é
 * montado sem DOM (buildCargosReportHTML / buildVagasReportHTML, homologados
 * em scripts/verify-rh-reports.mjs) e impresso num <iframe> isolado — o
 * navegador oferece "Salvar como PDF". SOMENTE LEITURA: nada aqui grava.
 */
(function () {
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    return iso ? AppData.formatDateBR(iso) : "—";
  }

  function money(value) {
    return value === null || value === undefined ? "a definir" : RhCatalog.formatMoney(value);
  }

  function formatCnpj(value) {
    const d = String(value || "").replace(/\D/g, "");
    if (d.length !== 14) return String(value || "");
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function cssString(value) {
    return `"${String(value).replace(/[\\"]/g, "\\$&").replace(/[\r\n<>]/g, " ")}"`;
  }

  const REPORT_CSS = `
    @page { size: A4 portrait; margin: 9mm 10mm 12mm;
      @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8px "Segoe UI", Arial, sans-serif; color: #8a817a; } }
    @page wide { size: A4 landscape; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 10px; color: #2c2a26; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body.landscape { page: wide; }
    header.report { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
      border-bottom: 3px solid #133169; padding-bottom: 7px; margin-bottom: 10px; }
    header.report h1 { margin: 0 0 2px; font-size: 16px; color: #133169; }
    header.report p { margin: 1px 0; }
    header.report .logo { max-height: 48px; max-width: 150px; object-fit: contain; }
    .meta { color: #6b625a; }
    section { margin-bottom: 14px; }
    h2 { margin: 0 0 4px; padding: 5px 8px; font-size: 12px; color: #fff; background: #133169; border-radius: 3px; break-after: avoid; }
    h2 small { font-weight: 400; color: #FFBC7D; margin-left: 6px; }
    h3 { font-size: 10.5px; color: #133169; margin: 8px 0 3px; text-transform: uppercase; letter-spacing: .03em; break-after: avoid; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #d9d2c5; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { background: #eef2f8; color: #133169; font-weight: 600; font-size: 9.5px; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tr { break-inside: avoid; }
    tfoot td { font-weight: 700; background: #fff1e3; }
    td small { display: block; color: #8a817a; font-size: 8.5px; }
    tr.group td { background: #133169; color: #FFBC7D; font-weight: 700; font-size: 9.5px; }
    .pill { display: inline-block; padding: 0 6px; border-radius: 8px; font-size: 8.5px; font-weight: 600; background: #ece9e4; color: #5d5750; white-space: nowrap; }
    .pill.warn { background: #ffe8d2; color: #8a4b12; }
    .pill.bad { background: #f6dcd9; color: #8e3a33; }
    .pill.ok { background: #dcefe6; color: #1f5e45; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid #e6ddcd; background: #f7f4ee; margin-bottom: 6px; }
    .kpi { padding: 5px 8px; border-left: 1px solid #e6ddcd; }
    .kpi:nth-child(5n + 1) { border-left: 0; }
    .kpi span { display: block; font-size: 8.5px; text-transform: uppercase; color: #6b625a; }
    .kpi b { font-size: 15px; color: #133169; }
    .commission { border: 1px solid #e6ddcd; border-left: 4px solid #FFBC7D; padding: 5px 8px; margin-bottom: 6px; break-inside: avoid; }
    .commission b { color: #133169; }
    .commission p { margin: 3px 0 0; white-space: pre-line; }
    .empty { color: #8a817a; font-style: italic; margin: 4px 0; }
    .notes { white-space: pre-line; }
  `;

  function documentHTML(company, title, body, options = {}) {
    const info = AppData.getCompanyData(company)?.companyInfo || {};
    const legalName = info.legalName || company;
    const cnpj = formatCnpj(AppData.resolveCompanyCnpj ? AppData.resolveCompanyCnpj(info) : info.cnpj);
    const logo = info.logoDataUrl ? `<img class="logo" src="${esc(info.logoDataUrl)}" alt="Logo">` : "";
    const today = options.today || AppData.todayISO();
    const footer = `${legalName} · ${title} · emitido em ${fmtDate(today)}`;
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${REPORT_CSS}</style>
<style>@page { @bottom-left { content: ${cssString(footer)}; font: 8px "Segoe UI", Arial, sans-serif; color: #8a817a; } }</style></head>
<body class="${options.landscape ? "landscape" : ""}">
  <header class="report">
    <div>
      <h1>${esc(title)}</h1>
      <p><b>${esc(legalName)}</b>${cnpj ? ` · CNPJ ${esc(cnpj)}` : ""}</p>
      <p class="meta">Emitido em ${fmtDate(today)}${options.by ? ` por ${esc(options.by)}` : ""}</p>
    </div>
    ${logo}
  </header>
  ${body}
</body></html>`;
  }

  // ── Cargos e Salários ─────────────────────────────────────────────────────

  const CARGOS_SECTIONS = [
    { id: "funcoes", label: "Funções e salários", hint: "função, CBO, salário, gratificação, insalubridade, comissões e quantidade de funcionários" },
    { id: "comissoes", label: "Comissões", hint: "explicação de cada comissão e funções que a recebem" },
    { id: "funcionarios", label: "Funcionários por função", hint: "funcionários agrupados por função, com a remuneração da função" }
  ];

  function insalText(cargo) {
    if (cargo.insalubridade == null) return "—";
    const valor = RhCatalog.insalubridadeValor(cargo);
    return `${esc(RhCatalog.insalubridadeLabel(cargo.insalubridade))}<small>${
      valor != null ? `${esc(money(valor))} sobre ${esc(money(cargo.insalubridadeBase))}` : "base a definir"
    }</small>`;
  }

  function cargosFuncoesHTML(company, includeInactive) {
    const cargos = RhCatalog.listCargos(company);
    if (!cargos.length) return `<section><h2>Funções e salários</h2><p class="empty">Nenhuma função cadastrada.</p></section>`;
    let totalEmployees = 0;
    let folha = 0;
    const rows = cargos
      .map((cargo) => {
        const linked = RhCatalog.employeesForCargo(company, cargo).filter((e) => includeInactive || AppData.isEmployeeActive(e));
        totalEmployees += linked.length;
        const remuneracao = RhCatalog.remuneracaoCargo(cargo);
        if (remuneracao != null) folha += remuneracao * linked.length;
        const comissoes = (cargo.commissions || []).map((id) => RhCatalog.comissaoName(company, id)).filter(Boolean).join(", ");
        return `<tr>
          <td><b>${esc(cargo.name)}</b>${cargo.notes ? `<small>${esc(cargo.notes)}</small>` : ""}</td>
          <td>${esc(cargo.cbo || "a definir")}</td>
          <td class="num">${esc(money(cargo.salary))}</td>
          <td class="num">${cargo.gratificacao != null ? esc(money(cargo.gratificacao)) : "—"}</td>
          <td>${insalText(cargo)}</td>
          <td>${esc(comissoes || "—")}</td>
          <td class="num">${linked.length}</td>
        </tr>`;
      })
      .join("");
    return `<section>
      <h2>Funções e salários<small>${cargos.length} função(ões)</small></h2>
      <table>
        <thead><tr><th style="width:22%">Função</th><th style="width:9%">CBO</th><th class="num" style="width:10%">Salário</th><th class="num" style="width:10%">Gratificação</th><th style="width:18%">Insalubridade</th><th>Comissões</th><th class="num" style="width:9%">Funcionários${includeInactive ? "" : " ativos"}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="6">Total de funcionários · folha estimada (salário + gratificação + insalubridade): ${esc(RhCatalog.formatMoney(folha))}</td><td class="num">${totalEmployees}</td></tr></tfoot>
      </table>
    </section>`;
  }

  function cargosComissoesHTML(company) {
    const cargos = RhCatalog.listCargos(company);
    const items = RhCatalog.listComissoes(company)
      .map((c) => {
        const receivers = cargos.filter((cargo) => (cargo.commissions || []).includes(c.id)).map((cargo) => cargo.name);
        return `<div class="commission"><b>${esc(c.name)}</b>
          <p>${c.description ? esc(c.description) : "<i>Sem explicação cadastrada.</i>"}</p>
          <p class="meta">Funções: ${receivers.length ? esc(receivers.join(", ")) : "nenhuma"}</p></div>`;
      })
      .join("");
    return `<section><h2>Comissões</h2>${items}</section>`;
  }

  function cargosFuncionariosHTML(company, includeInactive) {
    const employees = AppData.sortEmployeesByName(
      (AppData.getCompanyData(company).employees || []).filter((e) => includeInactive || AppData.isEmployeeActive(e))
    );
    const groups = new Map();
    employees.forEach((employee) => {
      const cargo = RhCatalog.resolveEmployeeCargo(employee, company);
      const k = cargo ? cargo.id : `__${employee.role || ""}`;
      if (!groups.has(k)) groups.set(k, { cargo, role: cargo?.name || employee.role || "Sem cargo", list: [] });
      groups.get(k).list.push(employee);
    });
    const sorted = [...groups.values()].sort((a, b) => a.role.localeCompare(b.role, "pt-BR"));
    if (!sorted.length) return `<section><h2>Funcionários por função</h2><p class="empty">Nenhum funcionário.</p></section>`;
    const rows = sorted
      .map((g) => {
        const valor = g.cargo ? RhCatalog.insalubridadeValor(g.cargo) : null;
        const head = `<tr class="group"><td colspan="5">${esc(g.role)}${
          g.cargo
            ? ` · CBO ${esc(g.cargo.cbo || "a definir")} · ${esc(money(g.cargo.salary))}${g.cargo.gratificacao != null ? ` · gratificação ${esc(money(g.cargo.gratificacao))}` : ""}${g.cargo.insalubridade != null ? ` · insalubridade ${esc(RhCatalog.insalubridadeLabel(g.cargo.insalubridade))}${valor != null ? ` (${esc(money(valor))})` : ""}` : ""}`
            : " · fora de Cargos e Salários"
        } — ${g.list.length}</td></tr>`;
        return (
          head +
          g.list
            .map(
              (e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.department || "—")}</td><td>${fmtDate(e.admissionDate)}</td>
                <td>${AppData.isEmployeeActive(e) ? "Ativo" : `Inativo${e.deactivatedAt ? ` desde ${fmtDate(e.deactivatedAt)}` : ""}`}</td>
                <td class="num">${g.cargo ? esc(money(RhCatalog.remuneracaoCargo(g.cargo))) : "—"}</td></tr>`
            )
            .join("")
        );
      })
      .join("");
    return `<section>
      <h2>Funcionários por função<small>${employees.length} funcionário(s)${includeInactive ? ", inclui inativos" : ", somente ativos"}</small></h2>
      <table>
        <thead><tr><th style="width:34%">Funcionário</th><th>Setor</th><th style="width:12%">Admissão</th><th style="width:16%">Situação</th><th class="num" style="width:16%">Remuneração (salário + gratificação + insalubridade)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  function buildCargosReportHTML(company, options = {}) {
    const sections = options.sections?.length ? options.sections : CARGOS_SECTIONS.map((s) => s.id);
    const parts = [];
    if (sections.includes("funcoes")) parts.push(cargosFuncoesHTML(company, options.includeInactive));
    if (sections.includes("comissoes")) parts.push(cargosComissoesHTML(company));
    if (sections.includes("funcionarios")) parts.push(cargosFuncionariosHTML(company, options.includeInactive));
    return documentHTML(company, "Cargos e Salários", parts.join(""), options);
  }

  // ── Quadro de Vagas ───────────────────────────────────────────────────────

  const VAGAS_SECTIONS = [
    { id: "painel", label: "Painel RH", hint: "indicadores, vagas por status e posições por setor" },
    { id: "vagas", label: "Vagas", hint: "vagas em andamento (opcional: concluídas/canceladas)" },
    { id: "rs", label: "Recrutamento e Seleção", hint: "candidatos por vaga" },
    { id: "admissoes", label: "Admissões", hint: "andamento das admissões" }
  ];

  const PILL = { Urgente: "bad", "Concluída": "ok", Cancelada: "bad", Aprovado: "ok", Reprovado: "bad", Iniciou: "ok", Proposta: "warn", "Admissão": "warn" };
  const pill = (text) => (text ? `<span class="pill ${PILL[text] || ""}">${esc(text)}</span>` : "—");

  function painelHTML(company) {
    const p = RhCatalog.computePanel(company);
    const kpis = [
      ["Vagas cadastradas", p.vagasCadastradas], ["Em andamento", p.vagasEmAndamento], ["Urgentes", p.vagasUrgentes],
      ["Concluídas", p.vagasConcluidas], ["Posições previstas", p.posicoesPrevistas], ["Posições em aberto", p.posicoesEmAberto],
      ["Candidatos em processo", p.candidatosEmProcesso], ["Admissões em andamento", p.admissoesEmAndamento], ["Admitidos", p.admitidos],
      ["Candidatos (total)", p.candidatosTotal]
    ];
    const small = (rows, a, b) =>
      rows.length ? `<table><thead><tr><th>${a}</th><th class="num">${b}</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="empty">Sem dados.</p>`;
    return `<section><h2>Painel RH</h2>
      <div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><span>${esc(l)}</span><b>${v}</b></div>`).join("")}</div>
      <h3>Vagas por status</h3>${small(p.byStatus.map((r) => `<tr><td>${esc(r.status)}</td><td class="num">${r.total}</td></tr>`), "Status", "Vagas")}
      <h3>Posições em andamento por setor</h3>${small(p.bySector.map((r) => `<tr><td>${esc(r.department)}</td><td class="num">${r.total}</td></tr>`), "Setor", "Posições")}
    </section>`;
  }

  function vagasHTML(company, includeClosed) {
    let vagas = RhCatalog.listRecords(company, "vagas");
    if (!includeClosed) vagas = vagas.filter((v) => !RhCatalog.VAGA_STATUS_CLOSED.includes(v.status));
    vagas.sort((a, b) => String(a.openDate).localeCompare(String(b.openDate)));
    const rows = vagas
      .map((v) => {
        const cargo = RhCatalog.getCargo(company, v.cargoId);
        return `<tr><td><b>${esc(v.role)}</b>${cargo?.cbo ? `<small>CBO ${esc(cargo.cbo)}</small>` : ""}</td><td>${esc(v.department || "—")}</td>
          <td class="num">${esc(v.quantity)}<small>${RhCatalog.admittedForVaga(company, v.id)} admitido(s)</small></td>
          <td>${esc(v.contractType || "—")}</td><td>${esc(v.reason || "—")}</td><td>${fmtDate(v.openDate)}</td>
          <td>${pill(v.priority)}${v.deadline ? `<small>até ${fmtDate(v.deadline)}</small>` : ""}</td><td>${pill(v.status)}</td>
          <td>${esc(v.manager || "—")}</td><td class="notes">${esc(v.notes || "")}</td></tr>`;
      })
      .join("");
    return `<section><h2>Vagas<small>${includeClosed ? "todas" : "em andamento"} · ${vagas.length}</small></h2>
      ${vagas.length ? `<table><thead><tr><th>Função</th><th>Setor</th><th class="num">Qtd.</th><th>Contrato</th><th>Motivo</th><th>Abertura</th><th>Prazo</th><th>Status</th><th>Gestor</th><th style="width:24%">Observações / próxima ação</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Nenhuma vaga.</p>`}
    </section>`;
  }

  function rsHTML(company) {
    const vagas = new Map(RhCatalog.listRecords(company, "vagas").map((v) => [v.id, v]));
    const list = RhCatalog.listRecords(company, "candidatos").sort(
      (a, b) => String(a.vagaLabel).localeCompare(String(b.vagaLabel), "pt-BR") || String(a.name).localeCompare(String(b.name), "pt-BR")
    );
    const rows = list
      .map(
        (c) => `<tr><td>${esc(vagas.has(c.vagaId) ? RhCatalog.vagaLabel(vagas.get(c.vagaId)) : c.vagaLabel || "—")}</td><td><b>${esc(c.name)}</b></td>
          <td>${esc(c.contact || "—")}</td><td>${pill(c.situation)}</td><td>${fmtDate(c.date)}</td><td class="notes">${esc(c.parecer || "")}</td>
          <td>${c.feedbackSent ? "Enviado" : "—"}</td><td class="notes">${esc(c.notes || "")}</td></tr>`
      )
      .join("");
    return `<section><h2>Recrutamento e Seleção<small>${list.length} candidato(s)</small></h2>
      ${list.length ? `<table><thead><tr><th>Vaga</th><th>Candidato</th><th>Contato</th><th>Situação</th><th>Data</th><th>Parecer</th><th>Feedback</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Nenhum candidato.</p>`}
    </section>`;
  }

  function admissoesHTML(company) {
    const list = RhCatalog.listRecords(company, "admissoes").sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const rows = list
      .map((a) => {
        const cargo = RhCatalog.getCargo(company, a.cargoId);
        return `<tr><td><b>${esc(a.name)}</b>${a.contact ? `<small>${esc(a.contact)}</small>` : ""}</td><td>${esc(cargo?.name || a.role || "—")}</td>
          <td>${fmtDate(a.date)}</td><td>${pill(a.situation)}</td><td class="notes">${esc(a.notes || "")}</td></tr>`;
      })
      .join("");
    return `<section><h2>Admissões<small>${list.length}</small></h2>
      ${list.length ? `<table><thead><tr><th>Admissão</th><th>Cargo</th><th>Prazo / data</th><th>Situação</th><th style="width:40%">Observações</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Nenhuma admissão.</p>`}
    </section>`;
  }

  function buildVagasReportHTML(company, options = {}) {
    const sections = options.sections?.length ? options.sections : VAGAS_SECTIONS.map((s) => s.id);
    const parts = [];
    if (sections.includes("painel")) parts.push(painelHTML(company));
    if (sections.includes("vagas")) parts.push(vagasHTML(company, options.includeClosed));
    if (sections.includes("rs")) parts.push(rsHTML(company));
    if (sections.includes("admissoes")) parts.push(admissoesHTML(company));
    return documentHTML(company, "Quadro de Vagas", parts.join(""), { ...options, landscape: true });
  }

  // ── Impressão ─────────────────────────────────────────────────────────────

  function printHTML(html, fileTitle) {
    document.getElementById("rhReportFrame")?.remove();
    const frame = document.createElement("iframe");
    frame.id = "rhReportFrame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const previousTitle = document.title;
    const restoreTitle = () => { document.title = previousTitle; };
    const cleanup = () => {
      restoreTitle();
      setTimeout(() => frame.remove(), 500);
    };
    const ready = Promise.all(
      [...doc.images].map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve; })))
    );
    Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 3000))]).then(() => {
      document.title = fileTitle;
      frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      window.focus();
      setTimeout(restoreTitle, 1000);
      setTimeout(cleanup, 60000);
    });
  }

  function fileName(prefix, company) {
    const slug = AppData.normalizeSearchText(company).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${prefix}-${slug}-${AppData.todayISO()}`;
  }

  /** Janela de opções: seções (marcar/desmarcar) + uma opção extra. */
  function openOptions({ title, sections, extra, onGenerate }) {
    document.getElementById("rhReportOptions")?.closest(".modal-backdrop")?.remove();
    const picker = document.createElement("div");
    picker.id = "rhReportOptions";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">${esc(title)}</p>
      <p class="co-picker-hint">Escolha o que entra no relatório. Na janela de impressão, selecione <strong>Salvar como PDF</strong>.</p>
      <fieldset style="border:0;padding:0;margin:12px 0;display:flex;flex-direction:column;gap:6px">
        <legend style="font-weight:700;font-size:0.85rem;margin-bottom:4px">Seções</legend>
        ${sections
          .map(
            (s) => `<label class="check-line" style="font-weight:500"><input type="checkbox" name="rhReportSection" value="${s.id}" checked>
              <span><strong>${esc(s.label)}</strong> <small style="color:var(--muted,#888)">— ${esc(s.hint)}</small></span></label>`
          )
          .join("")}
      </fieldset>
      ${extra ? `<label class="check-line" style="font-weight:500"><input type="checkbox" id="rhReportExtra"> <span>${esc(extra)}</span></label>` : ""}
      <div class="co-picker-actions">
        <button type="button" class="secondary btn-sm" data-report-close>Cancelar</button>
        <button type="button" class="primary btn-sm" data-report-go>Gerar PDF</button>
      </div>`;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);
    const onKey = (event) => { if (event.key === "Escape") close(); };
    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }
    document.addEventListener("keydown", onKey);
    picker.querySelector("[data-report-close]").addEventListener("click", close);
    picker.querySelector("[data-report-go]").addEventListener("click", () => {
      const chosen = [...picker.querySelectorAll("input[name='rhReportSection']:checked")].map((cb) => cb.value);
      if (!chosen.length) {
        alert("Marque pelo menos uma seção.");
        return;
      }
      const extraOn = Boolean(picker.querySelector("#rhReportExtra")?.checked);
      close();
      onGenerate(chosen, extraOn);
    });
  }

  function openCargosReport(company) {
    openOptions({
      title: `Relatório PDF — Cargos e Salários (${company})`,
      sections: CARGOS_SECTIONS,
      extra: "Incluir funcionários inativos",
      onGenerate: (sections, includeInactive) =>
        window.RhReports.printHTML(
          buildCargosReportHTML(company, { sections, includeInactive, by: AppData.currentUserEmail?.() }),
          fileName("cargos-e-salarios", company)
        )
    });
  }

  function openVagasReport(company) {
    openOptions({
      title: `Relatório PDF — Quadro de Vagas (${company})`,
      sections: VAGAS_SECTIONS,
      extra: "Incluir vagas concluídas e canceladas",
      onGenerate: (sections, includeClosed) =>
        window.RhReports.printHTML(
          buildVagasReportHTML(company, { sections, includeClosed, by: AppData.currentUserEmail?.() }),
          fileName("quadro-de-vagas", company)
        )
    });
  }

  window.RhReports = {
    CARGOS_SECTIONS,
    VAGAS_SECTIONS,
    buildCargosReportHTML,
    buildVagasReportHTML,
    openCargosReport,
    openVagasReport,
    printHTML
  };
})();
