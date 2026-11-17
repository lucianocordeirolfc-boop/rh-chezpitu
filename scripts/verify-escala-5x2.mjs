/**
 * Validação da regra 5x2 (EC 141/2026) da Escala de Folga — lógica.
 *
 * Cobre:
 *  - js/scale-5x2.js: início (semana de 21/12/2026), semanas avaliadas por mês
 *    (a semana pertence ao mês do domingo), contagem F/D (CO não conta),
 *    dispensas (férias/atestado/licença/suspensão, admissão/desligamento),
 *    semana que atravessa o mês lendo o mês anterior, texto do aviso;
 *  - AppData.getScaleCode com rascunho (manualOverride) — férias prevalecem;
 *  - AppData.applyManualScaleBatch: grava o rascunho (inclusive "__AUTO__" e CO
 *    com vínculo do feriado) e carimba manualScaleMeta;
 *  - Cobertura: só Rosana (MR); alertas antigos de Catherina (TR) e André (TM)
 *    gravados na base deixam de aparecer (nada é apagado).
 *
 * Fixtures em memória — nunca a base de produção.
 * Uso: node scripts/verify-escala-5x2.mjs
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

function load() {
  const store = {};
  const ctx = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      }
    },
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask: (fn) => fn(),
    Date,
    JSON,
    Math,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of ["js/import-utils.js", "js/data.js", "js/scale-rules.js", "js/scale-5x2.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const sb = load();
const { AppData, Scale5x2, ScaleRules } = sb;
const CO = "Chez Pitu";

console.log("\n=== TESTE: Escala 5x2 (EC 141/2026) ===\n");

// ── 1. Calendário da regra ──────────────────────────────────────────────────
assert(Scale5x2.RULE_START === "2026-12-16", "Vigência 16/12/2026");
assert(Scale5x2.firstEnforcedMonday() === "2026-12-21", "Primeira semana cobrada: 21/12/2026 (1ª semana completa)");
assert(Scale5x2.enforcedWeeksForMonth("2026-11").length === 0, "Novembro/2026 não é cobrado");
assert(
  Scale5x2.enforcedWeeksForMonth("2026-12").join() === "2026-12-21",
  "Dezembro/2026: só a semana de 21 a 27/12 (a de 14 a 20/12 começa antes da vigência)"
);
assert(
  Scale5x2.enforcedWeeksForMonth("2027-01").join() === "2026-12-28,2027-01-04,2027-01-11,2027-01-18,2027-01-25",
  "Janeiro/2027: semanas que terminam em janeiro (inclui 28/12 a 03/01)"
);
assert(Scale5x2.mondayOf("2026-12-27") === "2026-12-21", "Domingo pertence à semana iniciada na segunda anterior");

// ── 2. Validação ────────────────────────────────────────────────────────────
function codesFor(map) {
  return (employee, date) => (map[employee.id] || {})[date] || "";
}
const ativo = (id, name, extra = {}) => ({ id, name, status: "Ativo", admissionDate: "2020-01-01", ...extra });
{
  const employees = [
    ativo("a", "André Justo de Barros"),
    ativo("b", "Bia Duas Folgas"),
    ativo("c", "Caio CO"),
    ativo("d", "Dani Férias"),
    ativo("e", "Edu Admitido", { admissionDate: "2026-12-23" }),
    { id: "f", name: "Fábio Desligado", status: "Inativo", deactivatedAt: "2026-12-24" },
    ativo("g", "Gabi Dom+Folga")
  ];
  const codes = {
    a: { "2026-12-22": "FOLGA" },
    b: { "2026-12-22": "FOLGA", "2026-12-23": "FOLGA" },
    c: { "2026-12-22": "FOLGA", "2026-12-23": "CO" },
    d: { "2026-12-24": "FÉRIAS" },
    e: {},
    f: {},
    g: { "2026-12-21": "FOLGA", "2026-12-27": "DOM" }
  };
  const result = Scale5x2.validateMonth({ yearMonth: "2026-12", employees, getCode: codesFor(codes) });
  const ids = result.violations.map((item) => item.employeeId).sort().join();
  assert(result.enforced === true, "Dezembro/2026 é cobrado");
  assert(ids === "a,c", `Violações só de André (1 folga) e Caio (CO não conta) — obtido: ${ids}`);
  const andre = result.violations.find((item) => item.employeeId === "a");
  assert(andre?.missing === 1 && andre?.restDays === 1, "André: tem 1, falta 1");
  assert(
    /André Justo de Barros: falta 1 folga semanal na semana de 21\/12\/2026 a 27\/12\/2026/.test(andre?.message || ""),
    "Mensagem no formato pedido: 'André Justo de Barros: falta 1 folga semanal …'"
  );
  const none = Scale5x2.validateMonth({ yearMonth: "2026-12", employees: [ativo("z", "Zé Sem Folga")], getCode: () => "" });
  assert(none.violations[0]?.missing === 2 && /faltam 2 folgas/.test(none.violations[0].message), "Sem folga: faltam 2");
  const nov = Scale5x2.validateMonth({ yearMonth: "2026-11", employees: [ativo("z", "Zé")], getCode: () => "" });
  assert(!nov.enforced && nov.violations.length === 0, "Mês antes da vigência: nunca bloqueia");
}

// ── 3. Semana que atravessa o mês (28/12 a 03/01) avaliada em janeiro ───────
{
  const emp = ativo("x", "Xavier");
  const okCodes = { x: { "2026-12-29": "FOLGA", "2027-01-02": "FOLGA" } };
  const getCode = (e, d) => {
    if (d >= "2027-01-04") return ["2027-01-05", "2027-01-06", "2027-01-12", "2027-01-13", "2027-01-19", "2027-01-20", "2027-01-26", "2027-01-27"].includes(d) ? "FOLGA" : "";
    return (okCodes[e.id] || {})[d] || "";
  };
  const jan = Scale5x2.validateMonth({ yearMonth: "2027-01", employees: [emp], getCode });
  assert(jan.violations.length === 0, "Folga de dezembro conta na semana 28/12–03/01 avaliada em janeiro");
  const dez = Scale5x2.validateMonth({ yearMonth: "2026-12", employees: [emp], getCode: () => "" });
  assert(
    !dez.violations.some((v) => v.weekStart === "2026-12-28"),
    "Semana 28/12–03/01 não é cobrada em dezembro (sem cobrança dupla)"
  );
}

// ── 4. getScaleCode com rascunho ────────────────────────────────────────────
{
  const data = AppData.getCompanyData(CO);
  data.employees = [ativo("k", "Kátia", { fixedDay: "Segunda" })];
  data.manualScale = { "k|2026-12-22": "FOLGA" };
  data.manualScaleMeta = {};
  data.vacations = [{ id: "v1", employeeId: "k", startDate: "2026-12-26", endDate: "2026-12-26" }];
  data.absences = [];
  data.holidays = [];
  const emp = data.employees[0];
  assert(AppData.getScaleCode(emp, "2026-12-22", data) === "FOLGA", "Sem rascunho: usa o gravado");
  assert(AppData.getScaleCode(emp, "2026-12-22", data, "__AUTO__") === "", "Rascunho __AUTO__ ignora o manual gravado");
  assert(AppData.getScaleCode(emp, "2026-12-23", data, "DOM") === "DOM", "Rascunho com código simula o lançamento");
  assert(AppData.getScaleCode(emp, "2026-12-26", data, "FOLGA") === "FÉRIAS", "Férias prevalecem sobre o rascunho");
  assert(AppData.getManualScaleEntry("k", "2026-12-23", data) === undefined, "Simular rascunho não grava nada");
}

// ── 5. Gravação em lote (botão Salvar) ──────────────────────────────────────
{
  const data = AppData.getCompanyData(CO);
  data.employees = [ativo("k", "Kátia")];
  data.manualScale = { "k|2026-12-22": "FOLGA", "k|2026-12-24": "TM" };
  data.manualScaleMeta = {};
  data.vacations = [];
  data.absences = [];
  data.holidays = [
    { id: "hol-1", name: "Feriado Fixture", date: "2026-12-08", workedEmployees: [{ employeeId: "k", compensationDate: "", status: "Pendente" }] }
  ];
  const out = AppData.applyManualScaleBatch(
    [
      { employeeId: "k", date: "2026-12-23", code: "FOLGA" },
      { employeeId: "k", date: "2026-12-24", code: "__AUTO__" },
      { employeeId: "k", date: "2026-12-25", code: "CO", linkedHolidayId: "hol-1" }
    ],
    CO
  );
  assert(out.applied === 3, `Lote aplica 3 lançamentos (obtido ${out.applied})`);
  assert(data.manualScale["k|2026-12-23"] === "FOLGA", "FOLGA do rascunho gravada");
  assert(!("k|2026-12-24" in data.manualScale), "__AUTO__ remove o manual gravado");
  assert(data.manualScale["k|2026-12-22"] === "FOLGA", "Lançamento fora do rascunho intacto");
  assert(data.manualScale["k|2026-12-25"]?.code === "CO", "CO gravado com vínculo");
  const item = data.holidays[0].workedEmployees[0];
  assert(Boolean(item.scaleCoDate || item.compensationDate), "CO do lote vincula a compensação no feriado (mesma regra do setManualScale)");
  assert(
    Number(data.manualScaleMeta?.["k|2026-12-23"]) > 0,
    "Lançamento do lote carimba manualScaleMeta (newer-wins entre PCs)"
  );
}

// ── 6. Coberturas: só Rosana (MR) ───────────────────────────────────────────
{
  const codes = ScaleRules.COVERAGE_PRINCIPALS.map((p) => p.coverageCode).join();
  const names = ScaleRules.COVERAGE_PRINCIPALS.map((p) => p.displayName).join();
  assert(codes === "", `Nenhuma regra de cobertura ativa (obtido "${codes}")`);
  assert(ScaleRules.hasCoverageRules() === false, "hasCoverageRules() = false");
  assert(!/Catherina|André/.test(names), "Catherina e André fora das regras de cobertura");
  AppData.state.coverageAlerts = [
    { id: "1", yearMonth: "2026-12", coverageCode: "TR", principalCompany: CO, message: "Catherina ..." },
    { id: "2", yearMonth: "2026-12", coverageCode: "TM", principalCompany: CO, message: "André ..." },
    { id: "3", yearMonth: "2026-12", coverageCode: "MR", principalCompany: CO, message: "Rosana ..." }
  ];
  const visible = ScaleRules.getCoverageAlertsForMonth("2026-12").map((a) => a.coverageCode).join();
  assert(visible === "", "Alertas antigos TR/TM/MR gravados não aparecem mais");
  assert(ScaleRules.getCoverageAlertCount() === 0, "Contador de alertas ignora os antigos");
  assert(AppData.state.coverageAlerts.length === 3, "Nada é apagado da base na leitura");
  const labels = AppData.SCALE_CODES.filter((c) => c.code === "TR" || c.code === "TM").map((c) => c.label).join();
  assert(!/cobertura/i.test(labels), "Legenda de TR/TM sem '(cobertura)'");
}

// ── 7. Fonte da tela ────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(path.join(root, "js/escala.js"), "utf8");
  const code = src.replace(/\/\/.*$/gm, "");
  assert(!/AppData\.setManualScale\(/.test(code), "Grade não grava direto: nenhuma chamada a setManualScale na Escala");
  assert(/id="editScale"/.test(src) && /id="saveScale"/.test(src), "Botões Editar escala e Salvar escala");
  assert(/show5x2ViolationsPopup\(result\)/.test(src), "Salvar abre pop-up quando a 5x2 não é cumprida");
  assert(!/Catherina|André|Rosana/.test(src), "Tela da Escala sem menção a Catherina/André/Rosana");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(
    index.indexOf("js/scale-5x2.js") > index.indexOf("js/scale-rules.js") &&
      index.indexOf("js/scale-5x2.js") < index.indexOf("js/escala.js"),
    "index.html carrega scale-5x2.js antes de escala.js"
  );
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
