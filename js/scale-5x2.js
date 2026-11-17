/**
 * Regra da escala 5x2 — EC 141/2026 (art. 7º, XV da CF: dois dias de repouso
 * semanal remunerado). Vigência da 1ª etapa: 16/12/2026.
 *
 * Regra aplicada pelo sistema (2026-11-17, pedido do usuário):
 *  - Semana de SEGUNDA a DOMINGO.
 *  - Exigida a partir da primeira semana COMPLETA dentro da vigência
 *    (segunda-feira >= 16/12/2026 → semana de 21/12/2026 a 27/12/2026).
 *  - Cada funcionário precisa de pelo menos 2 dias de repouso na semana.
 *    Contam como repouso: FOLGA (F) e DOM (D). CO (compensação de feriado) NÃO
 *    substitui o repouso semanal.
 *  - Semana dispensada para o funcionário quando houver, em qualquer dia dela,
 *    FÉRIAS, ATESTADO, LICENÇA ou SUSPENSÃO; ou quando ele foi admitido depois
 *    da segunda-feira ou desligado antes do domingo (semana incompleta).
 *  - Cada semana é avaliada no mês em que TERMINA (domingo), lendo também os
 *    dias do mês anterior — assim nenhuma semana fica sem avaliação nem é
 *    cobrada duas vezes.
 *
 * Módulo puro (sem DOM): recebe uma função getCode(employee, isoDate) para que a
 * tela valide o RASCUNHO da edição antes de gravar.
 */
(function (root) {
  const RULE_START = "2026-12-16";
  const REQUIRED_REST_DAYS = 2;
  const REST_CODES = new Set(["FOLGA", "DOM"]);
  const EXEMPT_CODES = new Set(["FÉRIAS", "ATESTADO", "LICENÇA", "SUSPENSÃO"]);

  function parseISO(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function toISO(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const date = parseISO(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return toISO(date);
  }

  /** Segunda-feira da semana (segunda a domingo) que contém a data. */
  function mondayOf(iso) {
    const weekday = parseISO(iso).getUTCDay(); // 0 = domingo
    return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
  }

  /** Primeira segunda-feira >= início da vigência. */
  function firstEnforcedMonday() {
    const monday = mondayOf(RULE_START);
    return monday >= RULE_START ? monday : addDays(monday, 7);
  }

  function weekDays(monday) {
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }

  /** Semanas (segundas-feiras) avaliadas no mês: as que terminam no mês. */
  function enforcedWeeksForMonth(yearMonth) {
    const first = firstEnforcedMonday();
    const [year, month] = String(yearMonth).split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weeks = [];
    for (let day = 1; day <= lastDay; day += 1) {
      const iso = `${yearMonth}-${String(day).padStart(2, "0")}`;
      if (parseISO(iso).getUTCDay() !== 0) continue; // só domingos
      const monday = addDays(iso, -6);
      if (monday >= first) weeks.push(monday);
    }
    return weeks;
  }

  function isMonthEnforced(yearMonth) {
    return enforcedWeeksForMonth(yearMonth).length > 0;
  }

  function employeeCoversWholeWeek(employee, monday) {
    const sunday = addDays(monday, 6);
    const admission = String(employee?.admissionDate || "").slice(0, 10);
    if (admission && admission > monday) return false;
    // Inativo (status diferente de "Ativo"): só é cobrado nas semanas que
    // terminaram antes do desligamento. Sem data de desligamento: dispensado.
    const active = String(employee?.status || "").trim().toLocaleLowerCase("pt-BR") === "ativo";
    if (!active) {
      const deactivated = String(employee?.deactivatedAt || "").slice(0, 10);
      if (!deactivated || deactivated < sunday) return false;
    }
    return true;
  }

  /**
   * Avalia uma semana de um funcionário.
   * Retorna { exempt, reason, restDays, missing, days: [{date, code}] }.
   */
  function evaluateWeek(employee, monday, getCode) {
    const days = weekDays(monday).map((date) => ({ date, code: String(getCode(employee, date) ?? "").trim() }));
    if (!employeeCoversWholeWeek(employee, monday)) {
      return { exempt: true, reason: "semana incompleta (admissão/desligamento)", restDays: 0, missing: 0, days };
    }
    const exemptDay = days.find((day) => EXEMPT_CODES.has(day.code));
    if (exemptDay) {
      return { exempt: true, reason: `${exemptDay.code} na semana`, restDays: 0, missing: 0, days };
    }
    const restDays = days.filter((day) => REST_CODES.has(day.code)).length;
    const missing = Math.max(0, REQUIRED_REST_DAYS - restDays);
    return { exempt: false, reason: "", restDays, missing, days };
  }

  /**
   * Valida o mês para a lista de funcionários.
   * options: { yearMonth, employees, getCode(employee, date), isApplicable?(employee) }
   * Retorna { enforced, weeks: [monday], violations: [{ employeeId, employeeName,
   *   weekStart, weekEnd, restDays, missing, message }] }.
   */
  function validateMonth(options = {}) {
    const weeks = enforcedWeeksForMonth(options.yearMonth);
    const violations = [];
    if (!weeks.length) return { enforced: false, weeks, violations };
    const getCode = options.getCode;
    const isApplicable = options.isApplicable || (() => true);

    (options.employees || []).forEach((employee) => {
      if (!isApplicable(employee)) return;
      weeks.forEach((monday) => {
        const result = evaluateWeek(employee, monday, getCode);
        if (result.exempt || !result.missing) return;
        const weekEnd = addDays(monday, 6);
        violations.push({
          employeeId: employee.id,
          employeeName: employee.name || employee.id,
          weekStart: monday,
          weekEnd,
          restDays: result.restDays,
          missing: result.missing,
          message: describeViolation(employee.name || employee.id, monday, weekEnd, result)
        });
      });
    });

    return { enforced: true, weeks, violations };
  }

  function formatBR(iso) {
    const [y, m, d] = String(iso).split("-");
    return `${d}/${m}/${y}`;
  }

  function describeViolation(name, monday, sunday, result) {
    const falta = result.missing === 1 ? "falta 1 folga semanal" : `faltam ${result.missing} folgas semanais`;
    return `${name}: ${falta} na semana de ${formatBR(monday)} a ${formatBR(sunday)} (tem ${result.restDays} de ${REQUIRED_REST_DAYS}).`;
  }

  const api = {
    RULE_START,
    REQUIRED_REST_DAYS,
    REST_CODES,
    EXEMPT_CODES,
    mondayOf,
    firstEnforcedMonday,
    enforcedWeeksForMonth,
    isMonthEnforced,
    evaluateWeek,
    validateMonth,
    addDays
  };

  root.Scale5x2 = api;
})(typeof window !== "undefined" ? window : globalThis);
