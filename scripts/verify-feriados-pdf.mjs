/**
 * Homologação: relatório "Imprimir / PDF" do Controle de Feriados
 * (js/feriados-report.js).
 *
 * Cobre:
 *  - filtro de funcionário → relatório só dele, com histórico e projeção;
 *  - projeção lida da escala: folga manual, férias, mês com escala (Trabalha),
 *    mês sem escala (Provável), feriado futuro já lançado (Já lançado);
 *  - admissão posterior ao feriado e inativos fora da projeção;
 *  - filtros de situação (Compensados) e de feriado recortando o escopo;
 *  - totais (a compensar / previstos a trabalhar);
 *  - HTML escapado (nome com tag não vira HTML);
 *  - SOMENTE LEITURA: estado idêntico e nenhuma gravação no storage;
 *  - amarras de fonte: botão na tela, script no index.html antes de feriados.js.
 *
 * Usa fixture em memória — nunca a base real.
 * Uso: node scripts/verify-feriados-pdf.mjs
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

function createStorage(initial = {}) {
  const store = { ...initial };
  const api = {
    writes: 0,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { api.writes += 1; store[k] = String(v); },
    removeItem: (k) => { api.writes += 1; delete store[k]; }
  };
  return api;
}

function loadCore(storage) {
  const context = {
    window: {}, localStorage: storage, console, setTimeout, clearTimeout,
    Date, JSON, Math, Object, Array, Set, Map, String, Number,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    navigator: { onLine: true }, performance: { now: () => 0 }
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  for (const file of ["js/version.js", "js/import-utils.js", "js/data.js", "js/scale-rules.js", "js/feriados-report.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const CO = "Chez Pitu";
const TODAY = "2026-10-08";

function buildState() {
  const employees = [
    { id: "e-cris", name: "Cristiane da S. Azevedo", status: "Ativo", department: "Recepção", admissionDate: "2024-01-01" },
    { id: "e-renan", name: "Renan Gonçalves", status: "Ativo", department: "Cozinha", admissionDate: "2026-12-01" },
    { id: "e-xss", name: "<b>Teste</b> & Cia", status: "Ativo", department: "Salão", admissionDate: "2024-01-01" },
    { id: "e-ina", name: "Inativo Antigo", status: "Inativo", deactivatedAt: "2026-06-30", department: "Recepção", admissionDate: "2024-01-01" }
  ];
  const cal = (id, date, name) => ({ id, date, name, type: "nacional", companies: ["ambas"] });
  return {
    calendarHolidays: [
      cal("c-tira", "2026-04-21", "Tiradentes"),
      cal("c-indep", "2026-09-07", "Independência"),
      cal("c-apar", "2026-10-12", "N. Sra. Aparecida"),
      cal("c-fin", "2026-11-02", "Finados"),
      cal("c-cons", "2026-11-20", "Consciência Negra"),
      cal("c-natal", "2026-12-25", "Natal")
    ],
    companies: {
      [CO]: {
        employees,
        vacations: [{ id: "v1", employeeId: "e-cris", startDate: "2026-11-16", endDate: "2026-11-25" }],
        absences: [],
        manualScale: {
          "e-cris|2026-10-12": "FOLGA",
          "e-xss|2026-10-05": "MM",
          "e-cris|2026-11-05": "MM"
        },
        holidays: [
          { id: "h-tira", name: "Tiradentes", date: "2026-04-21", workedEmployees: [
            { employeeId: "e-cris", compensationDate: "2026-05-10", status: "Compensado", origin: "Manual" },
            { employeeId: "e-ina", compensationDate: "", status: "Pendente", origin: "Manual" }
          ] },
          { id: "h-indep", name: "Independência", date: "2026-09-07", workedEmployees: [
            { employeeId: "e-cris", compensationDate: "", status: "Pendente", origin: "Automático pela escala" },
            { employeeId: "e-xss", compensationDate: "", status: "Pendente", origin: "Manual" }
          ] },
          { id: "h-natal", name: "Natal", date: "2026-12-25", workedEmployees: [
            { employeeId: "e-xss", compensationDate: "2027-01-10", status: "Agendado", origin: "Manual" }
          ] },
          // Folga compensatória tirada ANTES do feriado (caso real da escala).
          { id: "h-fin", name: "Finados", date: "2026-11-02", workedEmployees: [
            { employeeId: "e-xss", compensationDate: "2026-08-20", status: "Compensado", origin: "Automático pela escala" }
          ] }
        ]
      },
      Pengold: { employees: [], vacations: [], absences: [], manualScale: {}, holidays: [] }
    }
  };
}

// Sobe o núcleo com a fixture (mesmo padrão de verify-vinculo-manual.mjs).
const boot = createStorage({ "chezPituHolidaySeed2026.v2": new Date().toISOString() });
const STORAGE_KEY = loadCore(boot).window.AppData.STORAGE_KEY;
const storage = createStorage({
  "chezPituHolidaySeed2026.v2": new Date().toISOString(),
  [STORAGE_KEY]: JSON.stringify(buildState())
});
const sb = loadCore(storage);
const AppData = sb.window.AppData;
const Report = sb.window.FeriadosReport;
const data = AppData.getCompanyData(CO);

// Espelha buildLines() + applyInactiveVisibility() de js/feriados.js (só o que o relatório lê).
function buildLines(visibleInactive = new Set()) {
  return data.holidays.filter((h) => !h.isDeleted).flatMap((holiday) =>
    (holiday.workedEmployees || []).map((item) => {
      const employee = data.employees.find((e) => e.id === item.employeeId);
      const resolved = AppData.resolveWorkedHolidayStatus(item, holiday.date, TODAY);
      return {
        holiday, employee, employeeId: item.employeeId, employeeName: employee?.name || "?",
        employeeInactive: Boolean(employee) && !AppData.isEmployeeActive(employee),
        department: employee?.department || "", compensationDate: item.compensationDate || "",
        scheduledCoDate: item.scheduledCoDate || item.compensationDate || "",
        dueDate: AppData.getHolidayCompensationDueDate(holiday.date), daysLeft: resolved.daysLeft, workedItem: item
      };
    })
  ).filter((line) => !line.employeeInactive || visibleInactive.has(line.employeeId));
}
const resolveStatus = (line) => AppData.resolveWorkedHolidayStatus(line.workedItem, line.holiday.date, TODAY);
const baseFilters = {
  quickView: "registros", search: "", employeeId: "todos", holidayId: "todos", department: "todos",
  status: "todos", prazo: "todos", compDateFrom: "", compDateTo: "", visibleInactiveIds: new Set()
};
function run(filters, lines) {
  return Report.buildReport({ company: CO, data, lines, filters: { ...baseFilters, ...filters }, resolveStatus, today: TODAY });
}

const snapshotBefore = JSON.stringify(AppData.getCompanyData(CO));
const writesBefore = storage.writes;

// ── 1. Filtro Cristiane ──
console.log("[1] Filtro de funcionário: Cristiane");
const crisLines = buildLines().filter((l) => l.employeeId === "e-cris");
let r = run({ employeeId: "e-cris" }, crisLines);
assert(r.employees.length === 1 && r.employees[0].name.startsWith("Cristiane"), "relatório só da Cristiane");
const cris = r.employees[0];
assert(cris.history.length === 2, `histórico com 2 feriados trabalhados (${cris.history.length})`);
assert(cris.history[0].holidayName === "Tiradentes" && cris.history[0].statusKey === "compensado", "Tiradentes compensado, em ordem de data");
assert(cris.history[1].statusKey === "pendente", "Independência pendente");
assert(cris.summary.aCompensar === 1 && cris.summary.compensado === 1, "resumo: 1 compensado, 1 a compensar");

console.log("[2] Projeção pela escala");
const proj = Object.fromEntries(cris.projection.map((p) => [p.holidayDate, p]));
assert(cris.projection.length === 4, `4 feriados futuros (${cris.projection.length})`);
assert(!proj["2026-09-07"] && !proj["2026-04-21"], "feriados passados fora da projeção");
assert(proj["2026-10-12"]?.key === "folga" && proj["2026-10-12"].code === "FOLGA", "12/10 com FOLGA na escala → Não trabalha");
assert(proj["2026-11-02"]?.key === "previsto", "02/11 em mês com escala e dia livre → Trabalha");
assert(proj["2026-11-02"]?.dueDate === AppData.getHolidayCompensationDueDate("2026-11-02"), "02/11 traz prazo de compensação projetado");
assert(proj["2026-11-20"]?.key === "folga" && proj["2026-11-20"].code === "FÉRIAS", "20/11 em férias → Não trabalha (FÉRIAS)");
assert(proj["2026-12-25"]?.key === "provavel", "25/12 em mês sem escala → Provável trabalho");
assert(cris.projectedWork === 2, `2 previstos a trabalhar (${cris.projectedWork})`);

// ── 3. Feriado futuro já lançado ──
console.log("[3] Feriado futuro já lançado aparece como 'Já lançado'");
r = run({ employeeId: "e-xss" }, buildLines().filter((l) => l.employeeId === "e-xss"));
const xssNatal = r.employees[0].projection.find((p) => p.holidayDate === "2026-12-25");
assert(xssNatal?.key === "vinculado" && xssNatal.statusKey === "agendado" && /compensação agendada/.test(xssNatal.label), `Natal já vinculado (${xssNatal?.label})`);
const xssFin = r.employees[0].projection.find((p) => p.holidayDate === "2026-11-02");
assert(xssFin?.statusKey === "compensado" && xssFin.anticipated === true && xssFin.label === "Lançado · compensado antecipado", `folga tirada antes do feriado = compensado antecipado (${xssFin?.label})`);
const xps = r.employees[0].projectionSummary;
assert(xps.vinculado === 2 && xps.vincCompensado === 1 && xps.vincAntecipado === 1 && xps.vincACompensar === 1, `resumo dos lançados futuros (${JSON.stringify(xps)})`);
assert(xps.aCompensarFuturo === xps.vincACompensar + xps.previsto + xps.provavel, "a compensar no futuro = lançados não compensados + previstos");
assert(xssNatal.compensationDate === "2027-01-10", "traz a compensação agendada");
// Feriado futuro já lançado = funcionário escalado para trabalhar nele (antes o
// resumo mostrava "0 previsto(s) a trabalhar" com 20 lançados — relato do usuário).
assert(r.employees[0].projectedWork === r.employees[0].projection.filter((p) => p.key !== "folga").length, "feriado futuro lançado conta como 'a trabalhar'");
assert(!r.employees[0].history.some((h) => h.holidayDate === "2026-12-25"), "Natal futuro não se repete no histórico");

// ── 4. Sem filtros ──
console.log("[4] Sem filtros: ativos, admissão e inativos");
r = run({}, buildLines());
const names = r.employees.map((g) => g.employeeId).sort();
assert(JSON.stringify(names) === JSON.stringify(["e-cris", "e-renan", "e-xss"]), `ativos no relatório (${names})`);
const renan = r.employees.find((g) => g.employeeId === "e-renan");
assert(renan.projection.length === 1 && renan.projection[0].holidayDate === "2026-12-25", "Renan (admitido 01/12) só projeta o Natal");
assert(r.totals.total === 3, `totais somam o histórico visível (${r.totals.total})`);
r = run({ visibleInactiveIds: new Set(["e-ina"]) }, buildLines(new Set(["e-ina"])));
const ina = r.employees.find((g) => g.employeeId === "e-ina");
assert(ina && ina.history.length === 1 && ina.projection.length === 0, "inativo exibido: histórico sim, projeção não (desligado)");

// ── 5. Filtros de situação e feriado ──
console.log("[5] Filtros de situação e de feriado");
const compensados = buildLines().filter((l) => resolveStatus(l).key === "compensado");
r = run({ quickView: "compensados", status: "compensado" }, compensados);
assert(JSON.stringify(r.employees.map((g) => g.employeeId).sort()) === JSON.stringify(["e-cris", "e-xss"]), "Compensados: só quem tem vínculo compensado (Cristiane + Finados antecipado)");
r = run({ holidayId: "h-natal" }, buildLines().filter((l) => l.holiday.id === "h-natal"));
assert(r.employees.every((g) => g.projection.every((p) => p.holidayDate === "2026-12-25")), "filtro Feriado=Natal: projeção só do Natal");
r = run({ department: "Cozinha" }, buildLines().filter((l) => l.department === "Cozinha"));
assert(r.employees.length === 1 && r.employees[0].employeeId === "e-renan", "filtro Setor=Cozinha: só Renan");
r = run({ search: "cristiane" }, crisLines);
assert(r.employees.length === 1 && r.employees[0].employeeId === "e-cris", "busca por nome estreita a projeção");

// ── 6. HTML ──
console.log("[6] HTML do relatório");
let html = Report.buildReportHTML(run({ employeeId: "e-cris" }, crisLines));
assert(html.includes("Relatório de feriados — Cristiane da S. Azevedo"), "título com o nome do funcionário");
assert(html.includes("Feriados trabalhados") && html.includes("Projeção — próximos feriados"), "duas seções");
assert(html.includes("Funcionário: Cristiane da S. Azevedo"), "filtros aplicados descritos");
assert(html.includes("@page { size: A4 portrait"), "folha A4");
html = Report.buildReportHTML(run({ employeeId: "e-xss" }, buildLines().filter((l) => l.employeeId === "e-xss")));
assert(!html.includes("<b>Teste</b>") && html.includes("&lt;b&gt;Teste&lt;/b&gt; &amp; Cia"), "nome escapado (sem injeção de HTML)");

// ── 6b. Conteúdo: ambos / somente histórico / somente projeção ──
console.log("[6b] Conteúdo do relatório");
const allLines = buildLines();
const runContent = (content, filters = {}, lines = allLines) =>
  Report.buildReport({ company: CO, data, lines, filters: { ...baseFilters, ...filters }, resolveStatus, today: TODAY, content });
r = runContent("historico", { employeeId: "e-cris" }, crisLines);
assert(r.content === "historico" && r.employees[0].history.length === 2 && r.employees[0].projection.length === 0, "Somente histórico: sem projeção");
html = Report.buildReportHTML(r);
assert(html.includes("<h1>Feriados trabalhados — Cristiane") && !html.includes("Projeção — próximos feriados"), "Somente histórico: título e só a seção de trabalhados");
assert(!html.includes("previsto(s) a trabalhar"), "Somente histórico: resumo sem previsão");
r = runContent("projecao", { employeeId: "e-cris" }, crisLines);
assert(r.employees[0].history.length === 0 && r.employees[0].projection.length === 4, "Somente projeção: sem histórico");
const ps = r.employees[0].projectionSummary;
assert(ps.previsto === 1 && ps.provavel === 1 && ps.folga === 2 && ps.vinculado === 0, `resumo da projeção (${JSON.stringify(ps)})`);
html = Report.buildReportHTML(r);
assert(html.includes("<h1>Projeção de feriados — Cristiane") && !html.includes("<h3>Feriados trabalhados</h3>"), "Somente projeção: título e só a seção de projeção");
r = runContent("historico");
assert(!r.employees.some((g) => g.employeeId === "e-renan"), "Somente histórico: quem não trabalhou feriado fica de fora");
r = runContent("projecao", { quickView: "compensados", status: "compensado" }, compensados);
assert(JSON.stringify(r.employees.map((g) => g.employeeId).sort()) === JSON.stringify(["e-cris", "e-xss"]), "Somente projeção respeita o escopo do filtro de situação");
r = runContent("xyz", { employeeId: "e-cris" }, crisLines);
assert(r.content === "ambos", "conteúdo inválido cai em Ambos");

// ── 6c. Uma página por funcionário / um PDF por funcionário ──
console.log("[6c] Formatos");
r = runContent("ambos");
html = Report.buildReportHTML(r, { pagePerEmployee: true });
assert(/<body class="page-per-employee">/.test(html) && html.includes("section.employee + section.employee { break-before: page; }"), "uma página por funcionário: quebra de página entre blocos");
assert(/<body class="">/.test(Report.buildReportHTML(r)), "arquivo único padrão: sem quebra forçada");
assert(html.includes(`Totais do relatório (${r.employees.length} funcionários)`), "arquivo único traz os totais");
const slice = Report.sliceReport(r, "e-cris");
assert(slice.employees.length === 1 && slice.totals.total === 2 && slice.totals.projectedWork === 2, "recorte por funcionário com totais próprios");
assert(r.employees.length === 3, "recorte não altera o relatório original");
const t = Report.reportTitle(slice);
assert(t.file === "Relatório de feriados - Cristiane da S. Azevedo - 2026-10-08", `nome do arquivo por funcionário (${t.file})`);
assert(Report.reportTitle({ ...slice, content: "projecao" }).file.startsWith("Projeção de feriados - Cristiane"), "nome do arquivo reflete o conteúdo");
html = Report.buildReportHTML(slice);
assert(!html.includes("Totais do relatório") && html.includes("Cristiane da S. Azevedo") && !html.includes("Renan"), "PDF individual só com o funcionário");

// ── 6d. Correções de layout do PDF (relato do usuário, 2026-10-08) ──
console.log("[6d] Layout do PDF");
html = Report.buildReportHTML(run({ employeeId: "e-cris" }, crisLines));
assert(!/section\.employee\s*\{[^}]*break-inside:\s*avoid/.test(html), "bloco do funcionário pode quebrar (1ª página não fica em branco)");
assert(/section\.employee h2, \.kpis, h3 \{ break-after: avoid; \}/.test(html), "título, resumo e subtítulos presos ao conteúdo seguinte");
assert(/thead \{ display: table-header-group; \}/.test(html), "cabeçalho da tabela repete em cada página");
assert(/counter\(page\)[^;]*counter\(pages\)/.test(html), "rodapé com Página X de Y");
assert(html.includes('class="kpis"') && html.includes("Saldo a compensar"), "resumo em quadros com saldo a compensar");
assert(/<span class="dow">seg<\/span>/.test(html), "dia da semana abreviado na mesma linha da data (12/10/2026 seg)");
const xssHtml = Report.buildReportHTML(run({ employeeId: "e-xss" }, buildLines().filter((l) => l.employeeId === "e-xss")));
assert(/20\/08\/2026 <span class="tag">antecipada<\/span>/.test(xssHtml), "compensação antes do feriado marcada como antecipada");
assert(xssHtml.includes("Lançado · compensado antecipado"), "situação do feriado futuro já compensado");
// Separador de ano quando a projeção atravessa a virada.
const multi = Report.buildReport({
  company: CO, data, lines: [], resolveStatus, today: TODAY, content: "projecao",
  filters: { ...baseFilters, employeeId: "e-cris" }
});
multi.employees[0].projection.push({ holidayName: "Ano Novo", holidayDate: "2027-01-01", key: "provavel", label: "Provável trabalho", dueDate: "", compensationDate: "" });
const multiHtml = Report.buildReportHTML(multi);
assert(/<tr class="year"><td colspan="5">2026<\/td><\/tr>/.test(multiHtml) && /<tr class="year"><td colspan="5">2027<\/td><\/tr>/.test(multiHtml), "separador por ano na projeção (2026 / 2027)");
assert(!/<tr class="year">/.test(Report.buildReportHTML(run({ employeeId: "e-cris" }, crisLines))), "sem separador quando a projeção é de um ano só");
// CNPJ com máscara.
const cnpjHtml = Report.buildReportHTML({ ...run({ employeeId: "e-cris" }, crisLines), companyInfo: { legalName: "Chez Pitu", cnpj: "10263290000110" } });
assert(cnpjHtml.includes("CNPJ 10.263.290/0001-10"), "CNPJ formatado 00.000.000/0000-00");
assert(/@bottom-left \{ content: "Chez Pitu · Relatório de feriados — Cristiane da S. Azevedo · emitido em 08\/10\/2026"/.test(cnpjHtml), "rodapé com empresa, título e data de emissão");

// ── 7. Somente leitura ──
console.log("[7] Somente leitura");
assert(JSON.stringify(AppData.getCompanyData(CO)) === snapshotBefore, "dados da empresa idênticos após gerar os relatórios");
assert(storage.writes === writesBefore, `nenhuma gravação no storage (${storage.writes - writesBefore})`);
const src = fs.readFileSync(path.join(root, "js/feriados-report.js"), "utf8");
assert(!/\b(saveState|runScaleIntegrations|recomputeScaleIntegrations|updateCompanyLogo|syncAutoHolidays\w*)\s*\(/.test(src), "módulo não chama gravação/recompute/logo");

// ── 8. Amarras de fonte ──
console.log("[8] Amarras de fonte");
const feriadosSrc = fs.readFileSync(path.join(root, "js/feriados.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(/id="printHolidayReport"/.test(feriadosSrc), "botão Imprimir / PDF presente");
// O botão vive no cabeçalho do card "Histórico de feriados", junto dos filtros
// (na toolbar do topo ele sumia de vista ao rolar até a tabela).
assert(
  /<h2>Histórico de feriados<\/h2>\s*<\/div>\s*<button[^>]*id="printHolidayReport"/.test(feriadosSrc),
  "botão no cabeçalho do Histórico de feriados, acima dos filtros"
);
assert((feriadosSrc.match(/id="printHolidayReport"/g) || []).length === 1, "um único botão (sem duplicata na toolbar)");
assert(/FeriadosReport\.openPrintOptions\(/.test(feriadosSrc) && /lines: applyFilters\(buildVisibleLines/.test(feriadosSrc), "usa as mesmas linhas filtradas da tabela");
const iReport = indexSrc.indexOf("js/feriados-report.js");
const iFeriados = indexSrc.indexOf("js/feriados.js");
assert(iReport > 0 && iReport < iFeriados, "feriados-report.js carregado antes de feriados.js");

console.log(`\nResultado: ${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
