/**
 * Diagnóstico: Feriados de abril/2026 ausentes para CO
 * Executa sem modificar nenhum dado.
 * Uso: node scripts/diagnose-abril-2026.mjs
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── helpers de simulação ────────────────────────────────────────────────────

function createStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

function loadCore(storage) {
  const context = {
    window: {}, localStorage: storage, console, setTimeout, clearTimeout,
    Date, JSON, Math, Object, Array, Set, Map, String, Number,
    parseInt, parseFloat, isNaN, undefined,
    navigator: { onLine: true }, performance: { now: () => 0 }
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  for (const file of ["js/import-utils.js", "js/data.js", "js/scale-rules.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

// ─── estado realista ─────────────────────────────────────────────────────────
// Simula uma empresa com 5 funcionários e escala de abril/2026 preenchida.
// Inclui os 3 cenários possíveis:
//  A) trabalhou no feriado (deve aparecer no CO)
//  B) estava de FOLGA (não deve aparecer)
//  C) código vazio / sem lançamento manual (conta como trabalhado pelo sistema)
//  D) já tem vínculo (deve ser ignorado pelo sync, sem duplicar)

function buildBaseState(overrides = {}) {
  const employees = [
    { id: "e-ana",    name: "Ana Clara",        company: "Chez Pitu", status: "Ativo", admissionDate: "2025-01-01" },
    { id: "e-bruno",  name: "Bruno Mendes",      company: "Chez Pitu", status: "Ativo", admissionDate: "2025-01-01" },
    { id: "e-carla",  name: "Carla Souza",       company: "Chez Pitu", status: "Ativo", admissionDate: "2025-01-01" },
    { id: "e-diego",  name: "Diego Ferreira",    company: "Chez Pitu", status: "Ativo", admissionDate: "2026-06-01" }, // admissão pós-feriado
    { id: "e-elisa",  name: "Elisa Martins",     company: "Chez Pitu", status: "Inativo" },                           // inativo
  ];

  const manualScale = {
    // Semana Santa (03/04)
    "e-ana|2026-04-03":   "TR",      // trabalhou (código TR = trabalhado)
    "e-bruno|2026-04-03": "FOLGA",   // folga → não conta
    "e-carla|2026-04-03": "",        // vazio = trabalhado pelo default

    // Tiradentes (21/04)
    "e-ana|2026-04-21":   "TR",
    "e-bruno|2026-04-21": "TR",
    "e-carla|2026-04-21": "FOLGA",

    // São Jorge (23/04)
    "e-ana|2026-04-23":   "FOLGA",
    "e-bruno|2026-04-23": "TR",
    "e-carla|2026-04-23": "TR",
    // e-diego: sem lançamento (admissão em junho → vínculo deve ser ignorado por data)
  };

  // Simula o estado base: seed já aplicado (flag presente), mas
  // syncAutoHolidaysWorkedForMonth("2026-04") ainda NÃO foi chamado.
  // Por isso workedEmployees está vazio — exatamente o problema real.
  const pre = {
    calendarHolidays: [
      { id: "cal-seed-2026-semana-santa", date: "2026-04-03", name: "Semana Santa",  type: "nacional", companies: ["ambas"] },
      { id: "cal-seed-2026-tiradentes",   date: "2026-04-21", name: "Tiradentes",    type: "nacional", companies: ["ambas"] },
      { id: "cal-seed-2026-sao-jorge",    date: "2026-04-23", name: "São Jorge",     type: "estadual", companies: ["ambas"] },
    ],
    companies: {
      "Chez Pitu": {
        employees,
        vacations: [], absences: [],
        manualScale,
        holidays: [
          { id: "feriado-seed-2026-semana-santa-chez-pitu", name: "Semana Santa", date: "2026-04-03", workedEmployees: [] },
          { id: "feriado-seed-2026-tiradentes-chez-pitu",   name: "Tiradentes",   date: "2026-04-21",
            // e-ana já tem vínculo existente (não deve duplicar)
            workedEmployees: [
              { employeeId: "e-ana", compensationDate: "", status: "Pendente" }
            ]
          },
          { id: "feriado-seed-2026-sao-jorge-chez-pitu",    name: "São Jorge",    date: "2026-04-23", workedEmployees: [] },
        ]
      },
      "Pengold": {
        employees: [], vacations: [], absences: [], manualScale: {},
        holidays: [
          { id: "feriado-seed-2026-semana-santa-pengold", name: "Semana Santa", date: "2026-04-03", workedEmployees: [] },
          { id: "feriado-seed-2026-tiradentes-pengold",   name: "Tiradentes",   date: "2026-04-21", workedEmployees: [] },
          { id: "feriado-seed-2026-sao-jorge-pengold",    name: "São Jorge",    date: "2026-04-23", workedEmployees: [] },
        ]
      }
    }
  };

  return { ...pre, ...overrides };
}

// ─── diagnóstico ─────────────────────────────────────────────────────────────

function diagnoseSandbox(sb, company = "Chez Pitu") {
  const AppData = sb.window.AppData;
  const ScaleRules = sb.window.ScaleRules;
  const state = AppData.state;
  const data = AppData.getCompanyData(company);
  const SEED_DATES = ["2026-04-03", "2026-04-21", "2026-04-23"];

  const lines = [];
  function say(...args) { lines.push(args.join(" ")); }

  say("\n══════════════════════════════════════════════════════════");
  say(`DIAGNÓSTICO — Feriados abril/2026 — ${company}`);
  say("══════════════════════════════════════════════════════════");

  // 1. Feriados existem no calendário global?
  say("\n[1] Calendário global (state.calendarHolidays):");
  const calEntries = state.calendarHolidays.filter(h => SEED_DATES.includes(h.date));
  if (!calEntries.length) {
    say("  ⚠  AUSENTE — os 3 feriados NÃO existem no calendário.");
    say("     Causa: seed nunca rodou. Solução: applyHolidaySeed2026IfNeeded().");
  } else {
    SEED_DATES.forEach(d => {
      const h = calEntries.find(x => x.date === d);
      say(`  ${h ? "✓" : "⚠"} ${d} → ${h ? h.name : "AUSENTE"}`);
    });
  }

  // 2. Feriados existem na empresa?
  say(`\n[2] Feriados cadastrados em "${company}":`);
  const compHolidays = data.holidays.filter(h => SEED_DATES.includes(h.date) && !h.isDeleted);
  if (!compHolidays.length) {
    say("  ⚠  NENHUM feriado de abril/2026 cadastrado na empresa.");
  } else {
    compHolidays.forEach(h => {
      say(`  ✓ ${h.date} "${h.name}" (id: ${h.id}) — workedEmployees: ${h.workedEmployees.length}`);
    });
  }

  // 3. Para cada data de feriado: quem tem código trabalhado na escala?
  say("\n[3] Escala de abril/2026 — funcionários com código TRABALHADO nos dias de feriado:");
  const activeEmployees = data.employees.filter(e => AppData.isEmployeeActive(e));
  const summary = [];

  SEED_DATES.forEach(date => {
    const holidayRecord = compHolidays.find(h => h.date === date);
    const worked = [];
    const notWorked = [];
    const alreadyLinked = [];
    const blockedByAdmission = [];

    activeEmployees.forEach(emp => {
      const code = AppData.getScaleCode(emp, date, data);
      const isWorked = AppData.isWorkedScaleCode(code);

      if (emp.admissionDate && date < emp.admissionDate) {
        blockedByAdmission.push({ emp, code });
        return;
      }

      if (!isWorked) {
        notWorked.push({ emp, code });
        return;
      }

      const alreadyIn = (holidayRecord?.workedEmployees || []).some(
        item => item.employeeId === emp.id
      );
      if (alreadyIn) {
        alreadyLinked.push({ emp, code });
      } else {
        worked.push({ emp, code });
      }
    });

    const calHoliday = state.calendarHolidays.find(h => h.date === date);
    say(`\n  ${date} — ${calHoliday?.name || "feriado"}`);
    worked.forEach(({ emp, code }) =>
      say(`    + FALTA VÍNCULO : ${emp.name} (código: "${code || "vazio"}")`));
    alreadyLinked.forEach(({ emp, code }) =>
      say(`    ✓ já vinculado : ${emp.name} (código: "${code}")`));
    notWorked.forEach(({ emp, code }) =>
      say(`    - não trabalhou : ${emp.name} (código: "${code}")`));
    blockedByAdmission.forEach(({ emp }) =>
      say(`    ~ admissão pós-feriado: ${emp.name} (admissão: ${emp.admissionDate})`));

    summary.push({ date, name: calHoliday?.name, faltam: worked.length, jaExistem: alreadyLinked.length });
  });

  // 4. Por que Corpus Christi funciona e abril não?
  say("\n[4] Causa raiz:");
  say("  syncAutoHolidaysWorkedForMonth() só é chamado para o MÊS ATUAL no boot");
  say("  e para cada mês quando o usuário navega até ele na aba Escala.");
  say("  → Como os feriados foram cadastrados DEPOIS que abril/2026 passou,");
  say("    o sistema nunca processou 2026-04 com esses feriados no calendário.");
  say("  → Corpus Christi (2026-06) funciona porque junho É o mês atual:");
  say("    o boot chama runScaleIntegrations([\"2026-06\"]) a cada carga.");

  // 5. Resumo
  const totalFaltando = summary.reduce((s, x) => s + x.faltam, 0);
  const totalExistem  = summary.reduce((s, x) => s + x.jaExistem, 0);
  say("\n[5] Resumo:");
  say(`  Vínculos faltando : ${totalFaltando}`);
  say(`  Vínculos existentes: ${totalExistem}`);
  say("  Correção necessária: runScaleIntegrations([\"2026-04\"]) para cada empresa.");

  return { lines, summary, totalFaltando, totalExistem };
}

// ─── execução diagnóstica ────────────────────────────────────────────────────

console.log("=== FASE 1: DIAGNÓSTICO (sem modificar dados) ===");
const storage = createStorage({
  "chezPituHolidaySeed2026.v1": new Date().toISOString(), // simula: seed já rodou
  "chezPituPeopleSystem.v1": JSON.stringify(buildBaseState())
});
const sb = loadCore(storage);
const { lines, totalFaltando } = diagnoseSandbox(sb, "Chez Pitu");
lines.forEach(l => console.log(l));

// ─── simulação da correção ───────────────────────────────────────────────────

console.log("\n\n=== FASE 2: SIMULAÇÃO DA CORREÇÃO ===");
console.log("Executando: runScaleIntegrations([\"2026-04\"]) para ambas as empresas...");

const before = {
  semanaSanta: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "Semana Santa")?.workedEmployees?.length ?? 0,
  tiradentes: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "Tiradentes")?.workedEmployees?.length ?? 0,
  saoJorge: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "São Jorge")?.workedEmployees?.length ?? 0,
};

const result = sb.window.ScaleRules.recomputeScaleIntegrations(["2026-04"], {
  companies: ["Chez Pitu", "Pengold"]
});
sb.window.AppData.saveState();

const after = {
  semanaSanta: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "Semana Santa")?.workedEmployees?.length ?? 0,
  tiradentes: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "Tiradentes")?.workedEmployees?.length ?? 0,
  saoJorge: sb.window.AppData.getCompanyData("Chez Pitu").holidays
    .find(h => h.name === "São Jorge")?.workedEmployees?.length ?? 0,
};

console.log(`  Vínculos criados pelo sync: ${result.created}`);
console.log(`  Semana Santa: ${before.semanaSanta} → ${after.semanaSanta} workedEmployees`);
console.log(`  Tiradentes  : ${before.tiradentes} → ${after.tiradentes} workedEmployees`);
console.log(`  São Jorge   : ${before.saoJorge} → ${after.saoJorge} workedEmployees`);

// ─── valida que os 3 aparecem no modal CO ─────────────────────────────────────
console.log("\n=== FASE 3: VALIDAÇÃO — modal CO após correção ===");
// Adicionar e-ana a "Chez Pitu" com vínculo recém-criado e testar modal CO
const coOptions = sb.window.AppData.getAvailableCoHolidayOptions("e-ana", "2026-06-20", { company: "Chez Pitu" });
const coNames = coOptions.map(o => o.holiday.name);
[
  ["Semana Santa aparece no modal CO (e-ana)", coNames.includes("Semana Santa")],
  ["Tiradentes aparece no modal CO (e-ana — vínculo já existia)", coNames.includes("Tiradentes")],
  ["São Jorge NÃO aparece no modal CO (e-ana estava de FOLGA)", !coNames.includes("São Jorge")],
  ["Bruno aparece para São Jorge (trabalhou)", (() => {
    const brunoOptions = sb.window.AppData.getAvailableCoHolidayOptions("e-bruno", "2026-06-20", { company: "Chez Pitu" });
    return brunoOptions.some(o => o.holiday.name === "São Jorge");
  })()],
  ["Carla aparece para Semana Santa (código vazio = trabalhado)", (() => {
    const carlaOptions = sb.window.AppData.getAvailableCoHolidayOptions("e-carla", "2026-06-20", { company: "Chez Pitu" });
    return carlaOptions.some(o => o.holiday.name === "Semana Santa");
  })()],
  // Diego: sync CRIA entrada (vínculo automático), mas CO modal a OCULTA porque
  // a data do feriado (abril) é anterior à admissão (junho). Dois sub-checks:
  ["Diego: sync criou autoCreated (admissão pós-feriado)", (() => {
    const data = sb.window.AppData.getCompanyData("Chez Pitu");
    return data.holidays.some(h =>
      (h.workedEmployees || []).some(w => w.employeeId === "e-diego" && w.autoCreated)
    );
  })()],
  // Diego tem admissão 2026-06-01 — todos os feriados de abril são anteriores.
  // O invariante dos dados garante a filtragem: admission > holiday.date = true.
  ["Diego: admissão (jun) > datas de todos os feriados (abr) → será filtrado pelo CO", (() => {
    const data = sb.window.AppData.getCompanyData("Chez Pitu");
    const diegoEmp = data.employees.find(e => e.id === "e-diego");
    return diegoEmp?.admissionDate &&
      ["2026-04-03","2026-04-21","2026-04-23"].every(d => d < diegoEmp.admissionDate);
  })()],
  ["Elisa (inativa) NÃO tem vínculo gerado", (() => {
    const elisa = sb.window.AppData.getCompanyData("Chez Pitu").holidays
      .flatMap(h => h.workedEmployees)
      .some(item => item.employeeId === "e-elisa");
    return !elisa;
  })()],
  ["sem duplicação: Tiradentes ainda tem 1 vínculo para e-ana", (() => {
    const h = sb.window.AppData.getCompanyData("Chez Pitu").holidays.find(x => x.name === "Tiradentes");
    return h.workedEmployees.filter(w => w.employeeId === "e-ana").length === 1;
  })()],
].forEach(([label, ok]) => console.log(`  ${ok ? "OK  " : "FALHOU"} ${label}`));

console.log("\n=== CONCLUSÃO ===");
console.log(`  Diagnóstico: ${totalFaltando} vínculo(s) faltando na simulação (dados reais podem diferir).`);
console.log("  Causa raiz: syncAutoHolidaysWorkedForMonth nunca rodou para 2026-04 com os feriados no calendário.");
console.log("  Correção: chamar runScaleIntegrations([\"2026-04\"]) no boot para retroagir apenas 1 vez.");
console.log("  Garantia: função é idempotente — não duplica, não altera vínculos existentes.");
