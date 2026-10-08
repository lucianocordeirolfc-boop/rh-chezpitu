/**
 * Relatório de feriados em PDF (Controle de Feriados → "Imprimir / PDF").
 *
 * Gera, a partir dos MESMOS filtros da tela, um relatório por funcionário com:
 *  1. Histórico — feriados já trabalhados (vínculos visíveis na tabela), com
 *     prazo, compensação e status;
 *  2. Projeção — próximos feriados cadastrados (hoje em diante) e a previsão de
 *     cada funcionário naquele dia, lida da escala (getScaleCode).
 *
 * SOMENTE LEITURA: nada aqui grava estado, chama saveState, recompute de escala
 * ou busca/persiste logo. A impressão acontece num <iframe> isolado, então o
 * print.css global (Escala, Contador, VT) não é tocado.
 *
 * A lógica de montagem (buildReport / buildReportHTML) não depende do DOM e é
 * homologada em scripts/verify-feriados-pdf.mjs.
 */
(function () {
  const CONTENT_TITLES = {
    ambos: "Relatório de feriados",
    historico: "Feriados trabalhados",
    projecao: "Projeção de feriados"
  };

  const STATUS_LABELS = {
    pendente: "Pendente",
    agendado: "Agendado",
    compensado: "Compensado",
    vencido: "Vencido"
  };

  function escHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmt(iso) {
    return iso ? AppData.formatDateBR(iso) : "—";
  }

  function normalize(value) {
    return AppData.normalizeSearchText(String(value || ""));
  }

  /** Filtros que recortam o histórico por situação (não fazem sentido na projeção). */
  function hasSituationFilter(filters) {
    return (
      (filters.quickView && filters.quickView !== "registros") ||
      (filters.status && filters.status !== "todos") ||
      (filters.prazo && filters.prazo !== "todos") ||
      Boolean(filters.compDateFrom) ||
      Boolean(filters.compDateTo)
    );
  }

  /**
   * Funcionários que entram na projeção, a partir dos filtros da tela:
   *  - filtro Funcionário → só ele;
   *  - senão, ativos (+ inativos exibidos) do Setor filtrado, estreitados pela
   *    Busca quando ela casar com nomes (busca por nome de feriado não estreita);
   *  - com filtro de situação (status/prazo/compensação), só quem aparece no
   *    histórico filtrado.
   */
  function resolveScopeEmployees(data, filters, historyLines) {
    const employees = data.employees || [];
    if (filters.employeeId && filters.employeeId !== "todos") {
      return employees.filter((employee) => employee.id === filters.employeeId);
    }

    const visibleInactive = filters.visibleInactiveIds || new Set();
    let scope = employees.filter(
      (employee) => AppData.isEmployeeActive(employee) || visibleInactive.has(employee.id)
    );
    if (filters.department && filters.department !== "todos") {
      scope = scope.filter((employee) => employee.department === filters.department);
    }

    const tokens = normalize(filters.search).split(/\s+/).filter(Boolean);
    if (tokens.length) {
      const byName = scope.filter((employee) => {
        const name = normalize(employee.name);
        return tokens.every((token) => name.includes(token));
      });
      if (byName.length) scope = byName;
    }

    if (hasSituationFilter(filters)) {
      const inHistory = new Set(historyLines.map((line) => line.employeeId));
      scope = scope.filter((employee) => inHistory.has(employee.id));
    }
    return scope;
  }

  function findLinkedEntry(data, employeeId, date) {
    for (const holiday of data.holidays || []) {
      if (holiday.isDeleted || holiday.date !== date) continue;
      const item = (holiday.workedEmployees || []).find((entry) => entry.employeeId === employeeId);
      if (item) return { holiday, item };
    }
    return null;
  }

  /**
   * Previsão de um funcionário num feriado futuro (leitura pura da escala).
   * key: vinculado | folga | previsto | provavel
   */
  function projectEmployeeOnHoliday(employee, holiday, data, today) {
    const linked = findLinkedEntry(data, employee.id, holiday.date);
    if (linked) {
      const status = AppData.resolveWorkedHolidayStatus(linked.item, holiday.date, today);
      const compensationDate = linked.item.compensationDate || linked.item.scheduledCoDate || "";
      // Folga compensatória tirada ANTES do feriado (prática comum na escala).
      const anticipated = Boolean(compensationDate) && compensationDate < holiday.date;
      const label =
        status.key === "compensado"
          ? `Lançado · compensado${anticipated ? " antecipado" : ""}`
          : status.key === "agendado"
            ? "Lançado · compensação agendada"
            : "Lançado · a compensar";
      return {
        key: "vinculado",
        statusKey: status.key,
        label,
        anticipated,
        code: "",
        dueDate: AppData.getHolidayCompensationDueDate(holiday.date),
        compensationDate
      };
    }

    const code = String(AppData.getScaleCode(employee, holiday.date, data) || "").trim();
    if (code && !window.ScaleRules?.isScaleCodeWorked?.(code, AppData.state)) {
      return { key: "folga", label: `Não trabalha (${code})`, code, dueDate: "", compensationDate: "" };
    }

    const monthHasScale = window.ScaleRules?.monthHasScaleData?.(holiday.date.slice(0, 7), data);
    return {
      key: monthHasScale ? "previsto" : "provavel",
      label: monthHasScale ? "Trabalha (pela escala)" : "Provável trabalho (escala não lançada)",
      code,
      dueDate: AppData.getHolidayCompensationDueDate(holiday.date),
      compensationDate: ""
    };
  }

  function employeeWorksOn(employee, date) {
    if (employee.admissionDate && date < employee.admissionDate) return false;
    if (!AppData.isEmployeeActive(employee)) {
      const end = String(employee.deactivatedAt || "").trim();
      if (!end || date > end) return false;
    }
    return true;
  }

  function futureHolidays(company, filters, data, today) {
    let list = AppData.listRegisteredHolidays(company).filter((holiday) => holiday.date >= today);
    if (filters.holidayId && filters.holidayId !== "todos") {
      const selected = (data.holidays || []).find((holiday) => holiday.id === filters.holidayId);
      list = selected
        ? list.filter(
            (holiday) => holiday.date === selected.date && normalize(holiday.name) === normalize(selected.name)
          )
        : [];
    }
    return list;
  }

  function summarizeHistory(rows) {
    const summary = { total: rows.length, compensado: 0, agendado: 0, pendente: 0, vencido: 0 };
    rows.forEach((row) => {
      if (summary[row.statusKey] !== undefined) summary[row.statusKey] += 1;
    });
    summary.aCompensar = summary.pendente + summary.agendado + summary.vencido;
    return summary;
  }

  /**
   * Monta o relatório (sem DOM).
   * @param {object} params
   *  - company, data: empresa da página e seu bloco de dados
   *  - lines: linhas JÁ filtradas pela tela (applyFilters)
   *  - filters: snapshot do filterState
   *  - resolveStatus(line) → { key, label, daysLeft }
   *  - today (opcional, ISO) — para homologação determinística
   *  - content (opcional): "ambos" (padrão) | "historico" | "projecao"
   */
  function buildReport(params) {
    const { company, data, filters } = params;
    const today = params.today || AppData.todayISO();
    const resolveStatus = params.resolveStatus;
    const content = CONTENT_TITLES[params.content] ? params.content : "ambos";
    const withHistory = content !== "projecao";
    const withProjection = content !== "historico";

    // Só vínculos reais (linha "Nenhum funcionário marcado" não é feriado tirado).
    const linkedLines = (params.lines || []).filter((line) => line.workedItem && line.employeeId);
    // Histórico = feriados até hoje. Vínculo de feriado futuro aparece uma única
    // vez, na projeção, como "Já lançado".
    const historyLines = linkedLines.filter((line) => line.holiday.date <= today);

    const groups = new Map();
    function ensureGroup(id, name, department, inactive) {
      if (!groups.has(id)) {
        groups.set(id, { employeeId: id, name, department: department || "", inactive: Boolean(inactive), history: [], projection: [] });
      }
      return groups.get(id);
    }

    (withHistory ? historyLines : []).forEach((line) => {
      const status = resolveStatus(line);
      ensureGroup(line.employeeId, line.employeeName, line.department, line.employeeInactive).history.push({
        holidayName: line.holiday.name,
        holidayDate: line.holiday.date,
        dueDate: line.dueDate,
        compensationDate: line.compensationDate || line.scheduledCoDate || "",
        statusKey: status.key,
        statusLabel: status.label,
        daysLeft: status.daysLeft ?? line.daysLeft,
        origin: line.workedItem?.origin || ""
      });
    });

    const holidays = withProjection ? futureHolidays(company, filters, data, today) : [];
    const scope = withProjection ? resolveScopeEmployees(data, filters, linkedLines) : [];
    scope.forEach((employee) => {
      const group = ensureGroup(employee.id, employee.name, employee.department, !AppData.isEmployeeActive(employee));
      holidays
        .filter((holiday) => employeeWorksOn(employee, holiday.date))
        .forEach((holiday) => {
          group.projection.push({
            holidayName: holiday.name,
            holidayDate: holiday.date,
            ...projectEmployeeOnHoliday(employee, holiday, data, today)
          });
        });
    });

    const employees = [...groups.values()]
      .map((group) => {
        group.history.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate) || a.holidayName.localeCompare(b.holidayName, "pt-BR"));
        group.projection.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
        group.summary = summarizeHistory(group.history);
        group.projectionSummary = summarizeProjection(group.projection);
        group.projectedWork = group.projectionSummary.aTrabalhar;
        return group;
      })
      .filter((group) => group.history.length || group.projection.length)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return {
      company,
      today,
      content,
      totals: computeTotals(employees),
      companyInfo: data.companyInfo || {},
      filtersText: describeFilters(filters, data),
      futureHolidayCount: holidays.length,
      employees
    };
  }

  function computeTotals(employees) {
    const totals = summarizeHistory(employees.flatMap((group) => group.history));
    totals.projection = summarizeProjection(employees.flatMap((group) => group.projection));
    totals.projectedWork = totals.projection.aTrabalhar;
    return totals;
  }

  /** Recorte do relatório com um único funcionário (para "um PDF por funcionário"). */
  function sliceReport(report, employeeId) {
    const employees = report.employees.filter((group) => group.employeeId === employeeId);
    return { ...report, employees, totals: computeTotals(employees) };
  }

  /** Título do documento e nome sugerido do arquivo. */
  function reportTitle(report) {
    const base = CONTENT_TITLES[report.content] || CONTENT_TITLES.ambos;
    const single = report.employees.length === 1 ? report.employees[0] : null;
    return {
      heading: single ? `${base} — ${single.name}` : base,
      file: `${base} - ${single ? single.name : report.company} - ${report.today}`
    };
  }

  function describeFilters(filters, data) {
    const parts = [];
    const quickLabels = {
      pendentes: "Pendentes",
      agendados: "Agendados",
      compensados: "Compensados",
      vencidos: "Vencidos",
      alertas: "Alertas de prazo"
    };
    const statusLabels = {
      pendente: "Pendente",
      agendado: "Agendado",
      compensado: "Compensado",
      vencido: "Vencido",
      alerta20: "Alerta 20 dias",
      alerta10: "Alerta 10 dias",
      alerta5: "Alerta 5 dias"
    };
    const prazoLabels = {
      noprazo: "No prazo (>20 dias)",
      "20dias": "Faltam 11–20 dias",
      "10dias": "Faltam 6–10 dias",
      "5dias": "Faltam ≤5 dias",
      vencido: "Vencido",
      compensado: "Compensado"
    };

    if (filters.employeeId && filters.employeeId !== "todos") {
      const employee = (data.employees || []).find((item) => item.id === filters.employeeId);
      parts.push(`Funcionário: ${employee?.name || "—"}`);
    }
    if (filters.holidayId && filters.holidayId !== "todos") {
      const holiday = (data.holidays || []).find((item) => item.id === filters.holidayId);
      parts.push(`Feriado: ${holiday?.name || "—"}`);
    }
    if (filters.department && filters.department !== "todos") parts.push(`Setor: ${filters.department}`);
    if (filters.quickView && quickLabels[filters.quickView]) parts.push(`Visão: ${quickLabels[filters.quickView]}`);
    else if (filters.status && statusLabels[filters.status]) parts.push(`Status: ${statusLabels[filters.status]}`);
    if (filters.prazo && prazoLabels[filters.prazo]) parts.push(`Prazo: ${prazoLabels[filters.prazo]}`);
    if (filters.compDateFrom || filters.compDateTo) {
      parts.push(`Compensação: ${fmt(filters.compDateFrom)} a ${fmt(filters.compDateTo)}`);
    }
    if (String(filters.search || "").trim()) parts.push(`Busca: "${String(filters.search).trim()}"`);
    return parts.length ? parts.join(" · ") : "Sem filtros (todos os registros)";
  }

  // ── HTML do relatório ─────────────────────────────────────────────────────

  const STATUS_CLASS = {
    compensado: "ok",
    agendado: "info",
    pendente: "warn",
    vencido: "bad",
    folga: "muted",
    previsto: "warn",
    provavel: "soft"
  };

  /** Classe do selo: vínculo futuro herda a cor do status do vínculo. */
  function pillClass(row) {
    if (row.key === "vinculado") return STATUS_CLASS[row.statusKey] || "warn";
    return STATUS_CLASS[row.key] || "muted";
  }

  function pill(className, label) {
    return `<span class="pill ${className}">${escHTML(label)}</span>`;
  }

  const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  /** "12/10/2026 seg" — dia da semana na mesma linha, para a tabela ficar compacta. */
  function dateWithWeekday(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    const dow = WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${fmt(iso)} <span class="dow">${dow}</span>`;
  }

  /** Data de compensação, marcada quando a folga foi tirada antes do feriado. */
  function compensationCell(compensationDate, holidayDate) {
    if (!compensationDate) return "—";
    const anticipated = holidayDate && compensationDate < holidayDate;
    return `${fmt(compensationDate)}${anticipated ? ` <span class="tag">antecipada</span>` : ""}`;
  }

  function formatCnpj(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 14) return String(value || "");
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  function deadlineText(row) {
    if (row.statusKey === "compensado") return "—";
    if (row.daysLeft < 0) return `Vencido há ${Math.abs(row.daysLeft)} dia(s)`;
    return `${row.daysLeft} dia(s)`;
  }

  function historyTable(group) {
    if (!group.history.length) {
      return `<p class="empty">Nenhum feriado trabalhado registrado${group.inactive ? "" : " para os filtros informados"}.</p>`;
    }
    return `
      <table>
        <colgroup><col style="width:30%"><col style="width:14%"><col style="width:14%"><col style="width:12%"><col style="width:16%"><col style="width:14%"></colgroup>
        <thead><tr>
          <th>Feriado</th><th>Data trabalhada</th><th>Prazo p/ compensar</th>
          <th>Restam</th><th>Compensação</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${group.history
            .map(
              (row) => `<tr>
              <td>${escHTML(row.holidayName)}${row.origin ? `<small>${escHTML(row.origin)}</small>` : ""}</td>
              <td>${dateWithWeekday(row.holidayDate)}</td>
              <td>${fmt(row.dueDate)}</td>
              <td>${escHTML(deadlineText(row))}</td>
              <td>${compensationCell(row.compensationDate, row.holidayDate)}</td>
              <td>${pill(STATUS_CLASS[row.statusKey] || "muted", row.statusLabel)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function projectionTable(group) {
    if (!group.projection.length) return `<p class="empty">Nenhum feriado futuro cadastrado no período.</p>`;
    // Separador por ano quando a projeção atravessa a virada (2026 → 2027 → 2028).
    const multiYear = new Set(group.projection.map((row) => row.holidayDate.slice(0, 4))).size > 1;
    let currentYear = "";
    const body = group.projection
      .map((row) => {
        const year = row.holidayDate.slice(0, 4);
        const separator = multiYear && year !== currentYear ? `<tr class="year"><td colspan="5">${year}</td></tr>` : "";
        currentYear = year;
        return `${separator}<tr>
              <td>${escHTML(row.holidayName)}</td>
              <td>${dateWithWeekday(row.holidayDate)}</td>
              <td>${pill(pillClass(row), row.label)}</td>
              <td>${fmt(row.dueDate)}</td>
              <td>${compensationCell(row.compensationDate, row.holidayDate)}</td>
            </tr>`;
      })
      .join("");
    return `
      <table>
        <colgroup><col style="width:31%"><col style="width:14%"><col style="width:25%"><col style="width:12%"><col style="width:18%"></colgroup>
        <thead><tr>
          <th>Feriado</th><th>Data</th><th>Situação</th><th>Prazo p/ compensar</th><th>Compensação</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  }

  function summarizeProjection(rows) {
    const summary = {
      previsto: 0, provavel: 0, folga: 0, vinculado: 0,
      vincCompensado: 0, vincAntecipado: 0, vincACompensar: 0
    };
    rows.forEach((row) => {
      if (summary[row.key] !== undefined) summary[row.key] += 1;
      if (row.key !== "vinculado") return;
      if (row.statusKey === "compensado") {
        summary.vincCompensado += 1;
        if (row.anticipated) summary.vincAntecipado += 1;
      } else {
        summary.vincACompensar += 1; // pendente, agendado ou vencido: folga ainda não tirada
      }
    });
    // Feriados futuros em que o funcionário deve trabalhar (lançados + previstos pela escala).
    summary.aTrabalhar = summary.vinculado + summary.previsto + summary.provavel;
    // Folgas compensatórias que ainda vão nascer/ficar devidas por esses feriados.
    summary.aCompensarFuturo = summary.vincACompensar + summary.previsto + summary.provavel;
    return summary;
  }

  function kpi(label, value, detail, highlight) {
    return `<div class="kpi${highlight ? " hl" : ""}"><span class="kpi-label">${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ""}</div>`;
  }

  /** Quadro de resumo conforme o conteúdo escolhido. */
  function summaryBox(summary, projection, content) {
    const cards = [];
    if (content !== "projecao") {
      cards.push(
        kpi("Trabalhados até hoje", summary.total, `${summary.compensado} compensado(s) · ${summary.aCompensar} a compensar`),
        kpi("Pendentes / vencidos", summary.pendente + summary.vencido, `${summary.agendado} agendado(s)`)
      );
    }
    if (content !== "historico") {
      cards.push(
        kpi("Futuros já lançados", projection.vinculado,
          `${projection.vincCompensado} compensado(s)${projection.vincAntecipado ? ` (${projection.vincAntecipado} antecipado)` : ""} · ${projection.vincACompensar} a compensar`),
        kpi("Previstos pela escala", projection.previsto + projection.provavel,
          `${projection.previsto} trabalha · ${projection.provavel} provável · ${projection.folga} não trabalha`)
      );
    }
    if (content === "ambos") {
      cards.push(kpi("Saldo a compensar", summary.aCompensar + projection.aCompensarFuturo,
        `${summary.aCompensar} de feriados passados · ${projection.aCompensarFuturo} de futuros`, true));
    } else if (content === "historico") {
      cards.push(kpi("A compensar", summary.aCompensar, "folgas ainda não tiradas", true));
    } else {
      cards.push(kpi("A compensar (futuro)", projection.aCompensarFuturo, `${projection.aTrabalhar} feriado(s) a trabalhar`, true));
    }
    return `<div class="kpis">${cards.join("")}</div>`;
  }

  /** Texto seguro para `content:` do CSS (rodapé das páginas). */
  function cssString(value) {
    return `"${String(value).replace(/[\\"]/g, "\\$&").replace(/[\r\n<>]/g, " ")}"`;
  }

  const REPORT_CSS = `
    @page { size: A4 portrait; margin: 9mm 10mm 12mm;
      @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8px "Segoe UI", Arial, sans-serif; color: #8a817a; } }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 10px; color: #2c2a26; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header.report { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
      border-bottom: 3px solid #133169; padding-bottom: 7px; margin-bottom: 8px; }
    header.report h1 { margin: 0 0 2px; font-size: 16px; color: #133169; }
    header.report p { margin: 1px 0; }
    header.report .logo { max-height: 48px; max-width: 150px; object-fit: contain; }
    .meta { color: #6b625a; }
    .filters { background: #eef2f8; border-left: 4px solid #FFBC7D; padding: 4px 8px; margin-bottom: 8px; }
    .totals { margin-bottom: 12px; }
    /* Sem "avoid" no bloco inteiro: ele é maior que uma página e deixava a 1ª em branco.
       Só o título, o resumo e os subtítulos ficam presos ao que vem depois. */
    section.employee { margin-bottom: 14px; }
    body.page-per-employee section.employee + section.employee { break-before: page; }
    section.employee h2, .kpis, h3 { break-after: avoid; }
    section.employee h2 { margin: 0; padding: 5px 8px; font-size: 12px; color: #fff; background: #133169; border-radius: 3px 3px 0 0; }
    section.employee h2 small { font-weight: 400; color: #FFBC7D; margin-left: 6px; }
    h3 { font-size: 10.5px; color: #133169; margin: 8px 0 3px; text-transform: uppercase; letter-spacing: .03em; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: 0;
      border: 1px solid #e6ddcd; border-top: 0; background: #f7f4ee; }
    .totals .kpis { border-top: 1px solid #e6ddcd; }
    .kpi { padding: 5px 8px; border-left: 1px solid #e6ddcd; display: flex; flex-direction: column; }
    .kpi:first-child { border-left: 0; }
    .kpi-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .03em; color: #6b625a; }
    .kpi b { font-size: 15px; color: #2c2a26; line-height: 1.2; }
    .kpi small { font-size: 8.5px; color: #6b625a; }
    .kpi.hl { background: #fff1e3; }
    .kpi.hl b { color: #133169; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #d9d2c5; padding: 2px 5px; text-align: left; vertical-align: middle; }
    th { background: #eef2f8; color: #133169; font-weight: 600; font-size: 9.5px; }
    tr { break-inside: avoid; }
    td small { display: block; color: #8a817a; font-size: 8.5px; }
    tr.year td { background: #133169; color: #FFBC7D; font-weight: 700; padding: 2px 6px; font-size: 9.5px; letter-spacing: .05em; }
    .dow { color: #8a817a; font-size: 8.5px; margin-left: 3px; }
    td:has(.tag) { white-space: nowrap; }
    .tag { display: inline-block; font-size: 8px; color: #1f5e45; background: #dcefe6; border-radius: 6px; padding: 0 4px; margin-left: 2px; }
    .pill { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 600; white-space: nowrap; }
    .pill.ok { background: #dcefe6; color: #1f5e45; }
    .pill.info { background: #dce8f7; color: #1d3f73; }
    .pill.warn { background: #ffe8d2; color: #8a4b12; }
    .pill.bad { background: #f6dcd9; color: #8e3a33; }
    .pill.soft { background: #fff4e6; color: #8a6a3a; border: 1px dashed #d9b98a; }
    .pill.muted { background: #ece9e4; color: #5d5750; }
    .empty { margin: 4px 0; color: #8a817a; font-style: italic; }
    .legend { margin-top: 10px; color: #6b625a; font-size: 8.5px; border-top: 1px solid #e6ddcd; padding-top: 5px; break-inside: avoid; }
    .legend p { margin: 2px 0; }
  `;

  /**
   * @param {object} report  resultado de buildReport (ou sliceReport)
   * @param {object} options { pagePerEmployee } — cada funcionário começa numa folha nova
   */
  function buildReportHTML(report, options = {}) {
    const info = report.companyInfo || {};
    const legalName = info.legalName || report.company;
    const cnpj = formatCnpj(AppData.resolveCompanyCnpj ? AppData.resolveCompanyCnpj(info) : info.cnpj);
    const logo = info.logoDataUrl ? `<img class="logo" src="${escHTML(info.logoDataUrl)}" alt="Logo">` : "";
    const content = report.content || "ambos";
    const title = reportTitle(report).heading;
    const footer = `${legalName} · ${title} · emitido em ${fmt(report.today)}`;

    const sections = report.employees.length
      ? report.employees
          .map(
            (group) => `
        <section class="employee">
          <h2>${escHTML(group.name)}<small>${escHTML(group.department || "Sem setor")}${group.inactive ? " · Inativo" : ""}</small></h2>
          ${summaryBox(group.summary, group.projectionSummary, content)}
          ${content !== "projecao" ? `<h3>Feriados trabalhados (até ${fmt(report.today)})</h3>${historyTable(group)}` : ""}
          ${content !== "historico" ? `<h3>Projeção — próximos feriados</h3>${projectionTable(group)}` : ""}
        </section>`
          )
          .join("")
      : `<p class="empty">Nenhum registro para os filtros informados.</p>`;

    const legend = [];
    if (content !== "historico") {
      legend.push(
        `<p><b>Projeção:</b> feriados cadastrados de ${fmt(report.today)} em diante (${report.futureHolidayCount}), lidos da escala atual.${content === "ambos" ? " Filtros de status, prazo e compensação valem só para os feriados trabalhados." : ""} A projeção é uma previsão e muda se a escala for alterada.</p>`,
        `<p><b>Lançado</b>: feriado futuro já registrado no Controle de Feriados (compensado, agendado ou a compensar) · <b>Trabalha (pela escala)</b>: mês com escala lançada e dia sem folga · <b>Provável trabalho</b>: escala do mês ainda não lançada (considera folga fixa, férias e ausências) · <b>Não trabalha</b>: folga, férias ou ausência no dia · <b>antecipada</b>: folga compensatória tirada antes do feriado.</p>`
      );
    } else {
      legend.push(`<p>Feriados trabalhados até ${fmt(report.today)}. Prazo de compensação: ${AppData.HOLIDAY_COMPENSATION_DAYS} dias após o feriado · <b>antecipada</b>: folga compensatória tirada antes do feriado.</p>`);
    }

    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escHTML(title)}</title>
<style>${REPORT_CSS}</style>
<style>@page { @bottom-left { content: ${cssString(footer)}; font: 8px "Segoe UI", Arial, sans-serif; color: #8a817a; } }</style></head>
<body class="${options.pagePerEmployee ? "page-per-employee" : ""}">
  <header class="report">
    <div>
      <h1>${escHTML(title)}</h1>
      <p><b>${escHTML(legalName)}</b>${cnpj ? ` · CNPJ ${escHTML(cnpj)}` : ""}</p>
      <p class="meta">Emitido em ${fmt(report.today)} · Prazo legal de compensação: ${AppData.HOLIDAY_COMPENSATION_DAYS} dias</p>
    </div>
    ${logo}
  </header>
  <div class="filters"><b>Filtros aplicados:</b> ${escHTML(report.filtersText)}</div>
  ${report.employees.length > 1 ? `<div class="totals"><h3>Totais do relatório (${report.employees.length} funcionários)</h3>${summaryBox(report.totals, report.totals.projection, content)}</div>` : ""}
  ${sections}
  <div class="legend">${legend.join("")}</div>
</body></html>`;
  }

  // ── Impressão (navegador) ─────────────────────────────────────────────────

  function printHTML(html, title) {
    document.getElementById("holidayReportFrame")?.remove();
    const frame = document.createElement("iframe");
    frame.id = "holidayReportFrame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    // O nome sugerido do PDF vem do título do documento principal.
    const previousTitle = document.title;
    const restoreTitle = () => { document.title = previousTitle; };
    const cleanup = () => {
      restoreTitle();
      setTimeout(() => frame.remove(), 500);
    };

    const images = [...doc.images];
    const ready = Promise.all(
      images.map((img) =>
        img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve; })
      )
    );
    Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 3000))]).then(() => {
      document.title = title;
      frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      // Devolve o foco à página (senão Esc/atalhos ficam presos no iframe oculto).
      window.focus();
      // O título só é lido na abertura do diálogo; o iframe fica até o afterprint
      // (rede de segurança de 60s para navegadores que não disparam o evento).
      setTimeout(restoreTitle, 1000);
      setTimeout(cleanup, 60000);
    });
  }

  /** Imprime um relatório já montado (inteiro ou recortado por funcionário). */
  function printBuiltReport(report, options = {}) {
    printHTML(buildReportHTML(report, options), reportTitle(report).file);
  }

  /**
   * Impressão direta, sem a janela de opções.
   * params: os de buildReport + pagePerEmployee (opcional).
   */
  function printReport(params) {
    const report = buildReport(params);
    if (!report.employees.length) {
      window.App?.toast?.("Nenhum registro para imprimir com os filtros atuais.", "warning");
      return report;
    }
    printBuiltReport(report, { pagePerEmployee: Boolean(params.pagePerEmployee) });
    return report;
  }

  // ── Janela de opções ("Imprimir / PDF") ───────────────────────────────────

  const CONTENT_OPTIONS = [
    { value: "ambos", label: "Ambos", hint: "feriados trabalhados + projeção" },
    { value: "historico", label: "Somente feriados trabalhados", hint: "histórico até hoje" },
    { value: "projecao", label: "Somente projeção", hint: "próximos feriados pela escala" }
  ];
  const FORMAT_OPTIONS = [
    { value: "unico", label: "Arquivo único", hint: "funcionários em sequência" },
    { value: "pagina", label: "Arquivo único — uma página por funcionário", hint: "cada funcionário começa numa folha nova" },
    { value: "separado", label: "Um PDF por funcionário", hint: "um arquivo para cada, com o nome dele" }
  ];

  // Última escolha da sessão (preferência de tela — nada é gravado).
  const lastChoice = { content: "ambos", format: "unico" };

  function radioGroup(name, items, selected) {
    return items
      .map(
        (item) => `
        <label class="check-line" style="font-weight:500">
          <input type="radio" name="${name}" value="${item.value}" ${item.value === selected ? "checked" : ""}>
          <span><strong>${escHTML(item.label)}</strong> <small style="color:var(--muted,#888)">— ${escHTML(item.hint)}</small></span>
        </label>`
      )
      .join("");
  }

  /**
   * Janela "Imprimir / PDF": Conteúdo (ambos / só trabalhados / só projeção) e
   * Formato (arquivo único, uma página por funcionário ou um PDF por
   * funcionário). Somente leitura.
   */
  function openPrintOptions(params) {
    document.getElementById("holidayPrintOptions")?.closest(".modal-backdrop")?.remove();

    const picker = document.createElement("div");
    picker.id = "holidayPrintOptions";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <style>#holidayPrintOptions [hidden] { display: none !important; }</style>
      <p class="co-picker-title">Imprimir / PDF — Controle de Feriados</p>
      <p class="co-picker-hint" data-print-filters></p>
      <div data-print-setup style="display:flex;flex-direction:column;gap:14px;margin:12px 0">
        <fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
          <legend style="font-weight:700;font-size:0.85rem;margin-bottom:4px">Conteúdo</legend>
          ${radioGroup("printContent", CONTENT_OPTIONS, lastChoice.content)}
        </fieldset>
        <fieldset data-print-format style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
          <legend style="font-weight:700;font-size:0.85rem;margin-bottom:4px">Formato</legend>
          ${radioGroup("printFormat", FORMAT_OPTIONS, lastChoice.format)}
        </fieldset>
        <p class="help-text" data-print-count style="margin:0"></p>
      </div>
      <div data-print-list hidden style="margin:12px 0">
        <p class="help-text" style="margin:0 0 8px">Clique em <strong>Gerar PDF</strong> em cada funcionário (ou em <strong>Gerar próximo</strong>). O navegador abre uma janela de impressão por arquivo: escolha <strong>Salvar como PDF</strong> — o nome já vem sugerido.</p>
        <ul data-print-employees style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:45vh;overflow-y:auto"></ul>
      </div>
      <div class="co-picker-actions">
        <button data-print-close class="secondary btn-sm" type="button">Cancelar</button>
        <button data-print-back class="secondary btn-sm" type="button" hidden>Voltar</button>
        <button data-print-next class="primary btn-sm" type="button" hidden>Gerar próximo</button>
        <button data-print-go class="primary btn-sm" type="button">Gerar PDF</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    const $ = (selector) => picker.querySelector(selector);
    const onKey = (event) => { if (event.key === "Escape") close(); };
    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }
    document.addEventListener("keydown", onKey);

    let report = null;
    const generated = new Set();

    function selected(name) {
      return picker.querySelector(`input[name="${name}"]:checked`)?.value;
    }

    function refresh() {
      lastChoice.content = selected("printContent") || "ambos";
      lastChoice.format = selected("printFormat") || "unico";
      report = buildReport({ ...params, content: lastChoice.content });
      const count = report.employees.length;
      $("[data-print-filters]").textContent = `Filtros: ${report.filtersText}`;
      $("[data-print-format]").hidden = count <= 1;
      $("[data-print-count]").textContent = count
        ? `${count} funcionário(s) no relatório.`
        : "Nenhum registro para este conteúdo com os filtros atuais.";
      $("[data-print-go]").disabled = !count;
    }

    function renderEmployeeList() {
      $("[data-print-employees]").innerHTML = report.employees
        .map((group) => {
          const done = generated.has(group.employeeId);
          return `
          <li style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span>${done ? "✓ " : ""}${escHTML(group.name)}</span>
            <button class="${done ? "secondary" : "primary"} btn-sm" type="button" data-print-employee="${escHTML(group.employeeId)}">${done ? "Gerar de novo" : "Gerar PDF"}</button>
          </li>`;
        })
        .join("");
      const pending = report.employees.filter((group) => !generated.has(group.employeeId)).length;
      $("[data-print-next]").textContent = pending ? `Gerar próximo (${pending} restante(s))` : "Todos gerados";
      $("[data-print-next]").disabled = !pending;
    }

    function printEmployee(employeeId) {
      generated.add(employeeId);
      renderEmployeeList();
      printBuiltReport(sliceReport(report, employeeId));
    }

    function showList(show) {
      $("[data-print-setup]").hidden = show;
      $("[data-print-list]").hidden = !show;
      $("[data-print-go]").hidden = show;
      $("[data-print-back]").hidden = !show;
      $("[data-print-next]").hidden = !show;
      $("[data-print-close]").textContent = show ? "Fechar" : "Cancelar";
      if (show) renderEmployeeList();
    }

    picker.addEventListener("change", (event) => {
      if (event.target.name === "printContent" || event.target.name === "printFormat") refresh();
    });
    $("[data-print-close]").addEventListener("click", close);
    $("[data-print-back]").addEventListener("click", () => showList(false));
    $("[data-print-go]").addEventListener("click", () => {
      if (!report?.employees.length) return;
      const many = report.employees.length > 1;
      if (many && lastChoice.format === "separado") {
        generated.clear();
        showList(true);
        return;
      }
      close();
      printBuiltReport(report, { pagePerEmployee: many && lastChoice.format === "pagina" });
    });
    $("[data-print-next]").addEventListener("click", () => {
      const next = report.employees.find((group) => !generated.has(group.employeeId));
      if (next) printEmployee(next.employeeId);
    });
    $("[data-print-employees]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-print-employee]");
      if (button) printEmployee(button.dataset.printEmployee);
    });

    refresh();
    return { picker, close };
  }

  window.FeriadosReport = {
    buildReport,
    buildReportHTML,
    sliceReport,
    reportTitle,
    printReport,
    openPrintOptions,
    STATUS_LABELS
  };
})();
