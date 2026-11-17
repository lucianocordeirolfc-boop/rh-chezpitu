/**
 * 2ª folga semanal (escala 5x2) — lógica.
 *
 * Cobre:
 *  - cadastro: secondFixedDay vira histórico {day, from, extraSundays}, a partir
 *    da próxima segunda (nunca antes de 21/12/2026); trocar antes de começar
 *    substitui, não acumula; demais campos do funcionário intactos;
 *  - escala (getScaleCode): 2ª folga só nas semanas sem domingo de folga e só a
 *    partir da data; domingo adicional (regime feminino) idem — meses passados
 *    NÃO mudam;
 *  - 5x2 cumprida com folga fixa + 2ª folga/domingo;
 *  - sugestão por setor: ≤ 2 por dia quando possível, evita sexta/sábado,
 *    nunca no dia da folga fixa, domingo quinzenal (1º+3º / 2º+4º) no regime
 *    feminino, 1 domingo para quem não tem nenhum, respeita escolha travada;
 *  - alerta de setor com mais de 2 de folga no mesmo dia.
 *
 * Fixtures em memória — nunca a base de produção.
 * Uso: node scripts/verify-segunda-folga.mjs
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ FALHOU: ${msg}`); }
}

function load(fakeToday) {
  const store = {};
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(`${fakeToday}T12:00:00`);
    }
    static now() { return new RealDate(`${fakeToday}T12:00:00`).getTime(); }
  }
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
    Date: fakeToday ? FakeDate : Date, JSON, Math, Object, Array, Set, Map, String, Number, parseInt, parseFloat, isNaN, undefined,
    navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of ["js/import-utils.js", "js/data.js", "js/scale-rules.js", "js/scale-5x2.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const CO = "Chez Pitu";
const sb = load("2026-11-17");
const { AppData, Scale5x2 } = sb;
const data = AppData.getCompanyData(CO);
data.employees = [];
data.manualScale = {};
data.vacations = [];
data.absences = [];
data.holidays = [];

console.log("\n=== TESTE: 2ª folga semanal (5x2) ===\n");

// ── 1. Cadastro com histórico ───────────────────────────────────────────────
const base = {
  id: "emp-a", name: "Ana Fixture", cpf: "", ctps: "1", role: "Camareira", department: "GOVERNANÇA",
  status: "Ativo", admissionDate: "2024-01-01", fixedDay: "Segunda-feira", sundayOffWeeks: "4",
  doubleSundayOff: "false", defaultShift: "07h às 15:20h", vtDaily: 10, notes: "obs"
};
let emp = AppData.upsertEmployee({ ...base }, CO);
assert(!AppData.getSecondFixedDay(emp), "Sem 2ª folga por padrão");
emp = AppData.upsertEmployee({ ...emp, secondFixedDay: "Quarta-feira" }, CO);
assert(AppData.getSecondFixedDay(emp) === "Quarta-feira", "2ª folga gravada");
assert(AppData.getSecondFixedDayFrom(emp) === "2026-12-21", `Vale a partir de 21/12/2026 (obtido ${AppData.getSecondFixedDayFrom(emp)})`);
emp = AppData.upsertEmployee({ ...emp, secondFixedDay: "Quinta-feira" }, CO);
assert(emp.secondFixedDayHistory.length === 1 && AppData.getSecondFixedDay(emp) === "Quinta-feira", "Troca antes de começar substitui (não acumula)");
assert(emp.fixedDay === "Segunda-feira" && emp.notes === "obs" && emp.sundayOffWeeks === "4" && emp.defaultShift === "07h às 15:20h", "Demais campos intactos");
emp = AppData.upsertEmployee({ ...emp, name: "Ana Fixture" }, CO);
assert(AppData.getSecondFixedDay(emp) === "Quinta-feira", "Editar sem o campo preserva a 2ª folga");

// ── 2. Escala: só semanas sem domingo de folga, só a partir da data ─────────
emp = AppData.upsertEmployee({ ...emp, secondFixedDay: "Quarta-feira" }, CO);
const code = (date) => AppData.getScaleCode(emp, date, data);
assert(code("2026-12-16") === "", "Antes de 21/12/2026 a 2ª folga não existe (quarta 16/12 trabalhada)");
assert(code("2026-12-21") === "FOLGA", "Segunda 21/12: folga fixa");
assert(code("2026-12-27") === "DOM", "27/12/2026 (4º domingo) é DOM");
assert(code("2026-12-23") === "", "Semana 21–27/12 já tem domingo de folga: quarta 23/12 trabalhada");
assert(code("2026-12-30") === "FOLGA", "Semana 28/12–03/01 sem domingo de folga: quarta 30/12 é FOLGA");
assert(code("2027-01-24") === "DOM" && code("2027-01-20") === "", "Jan/2027: 4º domingo (24/01) DOM e quarta 20/01 trabalhada");
assert(code("2027-01-27") === "FOLGA", "Semana 25–31/01 (31 = 5º domingo, não é de folga): quarta 27/01 FOLGA");
assert(code("2026-11-18") === "", "Mês passado não muda (quarta 18/11/2026)");

// ── 3. Domingo adicional (regime feminino) só daqui para frente ─────────────
emp = AppData.upsertEmployee({ ...emp, secondExtraSundays: "2", doubleSundayOff: "true" }, CO);
assert(AppData.getSecondExtraSundays(emp).join() === "2", "2º domingo adicional gravado no histórico");
assert(emp.sundayOffWeeks === "4", "Campo 'Domingos de folga' do cadastro não é alterado (sem histórico)");
assert(code("2026-11-08") === "", "2º domingo de nov/2026 (passado) continua trabalhado");
assert(code("2027-01-10") === "DOM", "2º domingo de jan/2027: DOM");
assert(code("2027-01-06") === "", "Semana com 2º domingo de folga: quarta 06/01 trabalhada (domingo cobre)");

const rule = Scale5x2.validateMonth({ yearMonth: "2027-01", employees: [emp], getCode: (e, d) => AppData.getScaleCode(e, d, data) });
assert(rule.violations.length === 0, `Jan/2027 cumpre a 5x2 só com o cadastro (${rule.violations.map((v) => v.message).join(" | ")})`);
const ruleDec = Scale5x2.validateMonth({ yearMonth: "2026-12", employees: [emp], getCode: (e, d) => AppData.getScaleCode(e, d, data) });
assert(ruleDec.violations.length === 0, "Dez/2026 cumpre a 5x2 só com o cadastro");

// ── 4. Sugestão por setor ───────────────────────────────────────────────────
{
  const mk = (id, sector, fixedDay, sundayWeeks, double = false, lockedSecond = "") => ({ id, name: id, sector, fixedDay, sundayWeeks, double, lockedSecond });
  const result = Scale5x2.suggestSecondFolgas({
    employees: [
      mk("g1", "GOV", "Segunda-feira", "2", true),
      mk("g2", "GOV", "Terça-feira", "1", true),
      mk("g3", "GOV", "Terça-feira", "3"),
      mk("g4", "GOV", "Quarta-feira", "4"),
      mk("m1", "MAN", "Quinta-feira", ""),
      mk("m2", "MAN", "Segunda-feira", "1", false, "Sábado")
    ]
  });
  const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
  assert(result.rows.every((r) => r.secondDay), "Todos recebem 2ª folga");
  assert(result.rows.every((r) => r.secondDay !== { g1: "Segunda-feira", g2: "Terça-feira", g3: "Terça-feira", g4: "Quarta-feira", m1: "Quinta-feira", m2: "Segunda-feira" }[r.id]), "2ª folga nunca no dia da folga fixa");
  assert(byId.g1.sundayWeeks.join() === "2,4" && byId.g2.sundayWeeks.join() === "1,3", "Regime feminino: domingo quinzenal (2→4, 1→3)");
  assert(byId.m1.sundayWeeks.length === 1, "Quem não tinha domingo de folga recebe 1 (Lei 10.101)");
  assert(byId.m2.secondDay === "Sábado", "Escolha travada pelo usuário é respeitada");
  assert(result.sectors.GOV.maxPerDay <= 2, `GOV: no máximo 2 por dia (obtido ${result.sectors.GOV.maxPerDay})`);
  assert(["g1", "g2", "g3", "g4"].every((id) => !["Sexta-feira", "Sábado"].includes(byId[id].secondDay)), "GOV: com vaga de seg a qui, nada em sexta/sábado");
  assert(byId.g1.activeWeeks < byId.g3.activeWeeks, "Regime feminino usa a 2ª folga em menos semanas");

  // Setor cheio: 6 pessoas com folga fixa ocupando seg–qui → sobra para sex/sáb, sem passar de 2.
  const bar = Scale5x2.suggestSecondFolgas({
    employees: [
      mk("b1", "BAR", "Quarta-feira", "2"), mk("b2", "BAR", "Quarta-feira", "3"), mk("b3", "BAR", "Terça-feira", "3"),
      mk("b4", "BAR", "Segunda-feira", "4"), mk("b5", "BAR", "Quinta-feira", "1"), mk("b6", "BAR", "Terça-feira", "1")
    ]
  });
  assert(bar.sectors.BAR.maxPerDay <= 2, `BAR (6 pessoas): ainda no máximo 2 por dia (obtido ${bar.sectors.BAR.maxPerDay})`);
  assert(bar.rows.filter((r) => ["Sexta-feira", "Sábado"].includes(r.secondDay)).length === 4, "BAR: só as 4 que não cabem de seg a qui vão para sex/sáb");
}

// ── 5. Alerta de setor ──────────────────────────────────────────────────────
{
  const people = [{ id: "x1", name: "X1", dep: "GOV" }, { id: "x2", name: "X2", dep: "GOV" }, { id: "x3", name: "X3", dep: "GOV" }, { id: "y1", name: "Y1", dep: "MAN" }];
  const off = { "x1|2026-12-22": "FOLGA", "x2|2026-12-22": "DOM", "x3|2026-12-22": "CO", "y1|2026-12-22": "FOLGA", "x1|2026-12-23": "FOLGA", "x2|2026-12-23": "FOLGA" };
  const list = Scale5x2.sectorDayOverload({
    days: ["2026-12-22", "2026-12-23"],
    employees: people,
    sectorOf: (e) => e.dep,
    getCode: (e, d) => off[`${e.id}|${d}`] || ""
  });
  assert(list.length === 1 && list[0].sector === "GOV" && list[0].count === 3 && list[0].date === "2026-12-22", "Alerta só quando passa de 2 no mesmo setor/dia");
}

// ── 6. Fonte ────────────────────────────────────────────────────────────────
{
  const func = fs.readFileSync(path.join(root, "js/funcionarios.js"), "utf8");
  const esc = fs.readFileSync(path.join(root, "js/escala.js"), "utf8");
  assert(/name="secondFixedDay"/.test(func) && /id="btnSuggestSecondFolga"/.test(func), "Cadastro: campo 2ª folga e botão Sugerir");
  assert(/renderSectorOverloadBanner\(data, days\)/.test(esc), "Escala mostra o alerta de setor");
  assert(!/sectorDayOverload[\s\S]{0,400}show5x2ViolationsPopup\(/.test(esc.slice(esc.indexOf("function saveScaleDraft"))), "Alerta de setor não bloqueia o Salvar");
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
