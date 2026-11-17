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

  // ── Sugestão da 2ª folga semanal (por setor) ────────────────────────────
  // Regras pedidas pelo usuário (2026-11-17):
  //  - no máximo MAX_OFF_PER_DAY funcionários do MESMO SETOR de folga no dia;
  //  - sexta e sábado com o mínimo possível de folga;
  //  - regime feminino: 2 domingos de folga no mês (CLT art. 386) — o 2º
  //    domingo cobre a 5x2 daquela semana; sugere o domingo "par" (1↔3, 2↔4);
  //  - quem não tem nenhum domingo de folga (e não folga fixa no domingo)
  //    recebe 1 domingo por mês (Lei 10.101/2000, art. 6º);
  //  - a 2ª folga vale só nas semanas sem domingo de folga.
  // Avalia semana a semana num horizonte de 52 semanas a partir de 21/12/2026.
  const MAX_OFF_PER_DAY = 2;
  const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const SECOND_CANDIDATES = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const FRI_SAT = new Set(["Sexta-feira", "Sábado"]);

  function nthSunday(iso) {
    return Math.ceil(Number(String(iso).slice(8, 10)) / 7);
  }

  function horizonWeeks(start, count) {
    const first = mondayOf(start || firstEnforcedMonday());
    return Array.from({ length: count || 52 }, (_, index) => {
      const monday = addDays(first, index * 7);
      return { monday, nth: nthSunday(addDays(monday, 6)) };
    });
  }

  function hasDom(row, week) {
    return row.fixedDay !== "Domingo" && row.sundayWeeks.includes(String(week.nth));
  }

  function sundayLoadByNth(rows) {
    const load = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach((row) => {
      if (row.fixedDay === "Domingo") {
        Object.keys(load).forEach((n) => (load[n] += 1));
        return;
      }
      row.sundayWeeks.forEach((n) => {
        if (load[n] !== undefined) load[n] += 1;
      });
    });
    return load;
  }

  function suggestSundays(rows) {
    const load = sundayLoadByNth(rows);
    const cost = (ns) => ns.reduce((max, n) => Math.max(max, load[n] + 1), 0);
    rows.forEach((row) => {
      if (row.fixedDay === "Domingo") return;
      const current = row.sundayWeeks.filter((n) => ["1", "2", "3", "4", "5"].includes(n));
      const add = (n) => {
        current.push(n);
        load[n] += 1;
        row.sundayAdded.push(n);
      };
      if (row.double) {
        // CLT art. 386: domingos QUINZENAIS (1º+3º ou 2º+4º) — o par é obrigatório.
        const regular = current.filter((n) => n !== "5");
        if (regular.length === 1) {
          const base = Number(regular[0]);
          const partner = String(base <= 2 ? base + 2 : base - 2);
          if (!current.includes(partner)) add(partner);
        } else if (regular.length === 0) {
          const pairs = [["1", "3"], ["2", "4"]].sort((a, b) => cost(a) - cost(b) || Number(a[0]) - Number(b[0]));
          pairs[0].forEach(add);
        }
      } else if (current.length === 0) {
        // Lei 10.101/2000, art. 6º: ao menos um domingo de folga no período.
        const n = ["1", "2", "3", "4"].sort((a, b) => load[a] - load[b] || Number(a) - Number(b))[0];
        add(n);
      }
      row.sundayWeeks = [...new Set(current)].sort();
    });
  }

  function weekdayLoads(rows, week) {
    const load = {};
    WEEKDAY_NAMES.forEach((day) => (load[day] = 0));
    rows.forEach((row) => {
      if (row.fixedDay && load[row.fixedDay] !== undefined) load[row.fixedDay] += 1;
      if (row.fixedDay !== "Domingo" && hasDom(row, week)) load.Domingo += 1;
      if (row.secondDay && !hasDom(row, week)) load[row.secondDay] += 1;
    });
    return load;
  }

  /**
   * options: { employees: [{ id, name, sector, fixedDay, sundayWeeks, double, lockedSecond }],
   *            start?, weeks? }
   * Retorna { rows: [{ id, secondDay, sundayWeeks, sundayAdded, overLimit, activeWeeks }],
   *           sectors: { [setor]: { maxPerDay, friSatPerWeek, overLimitDays } } }.
   */
  function suggestSecondFolgas(options = {}) {
    const weeks = horizonWeeks(options.start, options.weeks);
    const rows = (options.employees || []).map((employee) => ({
      id: employee.id,
      name: employee.name || employee.id,
      sector: String(employee.sector || "Sem setor").trim() || "Sem setor",
      fixedDay: String(employee.fixedDay || "").trim(),
      sundayWeeks: String(Array.isArray(employee.sundayWeeks) ? employee.sundayWeeks.join(",") : employee.sundayWeeks || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
      double: Boolean(employee.double),
      secondDay: String(employee.lockedSecond || "").trim(),
      locked: Boolean(employee.lockedSecond),
      sundayAdded: [],
      overLimit: false,
      activeWeeks: 0
    }));

    const bySector = new Map();
    rows.forEach((row) => {
      if (!bySector.has(row.sector)) bySector.set(row.sector, []);
      bySector.get(row.sector).push(row);
    });

    const sectors = {};
    bySector.forEach((list, sector) => {
      suggestSundays(list);
      list.forEach((row) => {
        row.activeWeeks = weeks.filter((week) => !hasDom(row, week)).length;
      });
      const pending = list
        .filter((row) => !row.locked)
        .sort((a, b) => b.activeWeeks - a.activeWeeks || a.name.localeCompare(b.name, "pt-BR"));
      pending.forEach((row) => {
        const scored = SECOND_CANDIDATES.filter((day) => day !== row.fixedDay).map((day) => {
          row.secondDay = day;
          let max = 0;
          let total = 0;
          weeks.forEach((week) => {
            const value = weekdayLoads(list, week)[day];
            max = Math.max(max, value);
            total += value;
          });
          return { day, cost: [max > MAX_OFF_PER_DAY ? 1 : 0, FRI_SAT.has(day) ? 1 : 0, max, total, SECOND_CANDIDATES.indexOf(day)] };
        });
        scored.sort((a, b) => {
          for (let i = 0; i < a.cost.length; i += 1) if (a.cost[i] !== b.cost[i]) return a.cost[i] - b.cost[i];
          return 0;
        });
        row.secondDay = scored[0].day;
        row.overLimit = scored[0].cost[0] === 1;
      });

      let maxPerDay = 0;
      let friSat = 0;
      const overLimitDays = new Set();
      weeks.forEach((week) => {
        const load = weekdayLoads(list, week);
        Object.entries(load).forEach(([day, value]) => {
          maxPerDay = Math.max(maxPerDay, value);
          if (value > MAX_OFF_PER_DAY) overLimitDays.add(day);
        });
        friSat += load["Sexta-feira"] + load["Sábado"];
      });
      sectors[sector] = {
        maxPerDay,
        friSatPerWeek: Math.round((friSat / weeks.length) * 10) / 10,
        overLimitDays: [...overLimitDays]
      };
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        secondDay: row.secondDay,
        sundayWeeks: row.sundayWeeks,
        sundayAdded: row.sundayAdded,
        overLimit: row.overLimit,
        activeWeeks: row.activeWeeks
      })),
      sectors
    };
  }

  /**
   * Alerta (não bloqueia): dias em que mais de MAX_OFF_PER_DAY funcionários do
   * mesmo setor estão de folga (F, D ou CO).
   * options: { days: [iso], employees, sectorOf(employee), getCode(employee, date) }
   */
  function sectorDayOverload(options = {}) {
    const OFF = new Set(["FOLGA", "DOM", "CO"]);
    const result = [];
    (options.days || []).forEach((date) => {
      const bySector = new Map();
      (options.employees || []).forEach((employee) => {
        if (!OFF.has(String(options.getCode(employee, date) || "").trim())) return;
        const sector = String(options.sectorOf(employee) || "Sem setor").trim() || "Sem setor";
        if (!bySector.has(sector)) bySector.set(sector, []);
        bySector.get(sector).push(employee.name || employee.id);
      });
      bySector.forEach((names, sector) => {
        if (names.length > MAX_OFF_PER_DAY) result.push({ date, sector, count: names.length, names });
      });
    });
    return result;
  }

  const api = {
    MAX_OFF_PER_DAY,
    suggestSecondFolgas,
    sectorDayOverload,
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
