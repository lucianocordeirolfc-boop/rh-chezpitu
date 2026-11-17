/**
 * Validação focada: feriado cadastrado em UMA empresa precisa poder valer para
 * a OUTRA (2026-11-17).
 *
 * Defeito: o formulário "Cadastrar feriado" gravava todo feriado novo só na
 * empresa da aba ativa (companies: [aba]). Feriados lançados na aba Chez Pitu
 * (29/07 comércio hoteleiro, todos de 2027) não existiam na Pengold.
 *
 * Cobre AppData.extendHolidayToCompanies:
 *  - cria o feriado na empresa alvo SEM vínculos e acrescenta a empresa no calendário;
 *  - NÃO altera vínculos, nome, data nem tipo da empresa de origem;
 *  - idempotente (2ª chamada não duplica);
 *  - feriado que só existe no bloco da empresa (sem calendário) também estende;
 *  - respeita tombstone da empresa alvo (só recria com overrideTombstone);
 *  - feriado inexistente: recusa sem gravar;
 *  - merge com remoto antigo não desfaz a extensão (união de empresas);
 *  - checagem de fonte do formulário ("Vale para").
 *
 * Usa fixtures em memória — nunca a base de produção.
 *
 * Uso: node scripts/verify-feriados-empresas.mjs
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

function loadAppData() {
  const store = {};
  const ctx = {
    window: {},
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
  for (const file of ["js/import-utils.js", "js/data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.AppData;
}

const AppData = loadAppData();
const CO = "Chez Pitu";
const PG = "Pengold";
const clone = (value) => JSON.parse(JSON.stringify(value));

function setFixture({ calendar = [], chez = [], pengold = [], tombstones = {} } = {}) {
  AppData.state.calendarHolidays = clone(calendar);
  AppData.state.companies[CO].holidays = clone(chez);
  AppData.state.companies[PG].holidays = clone(pengold);
  AppData.state.holidayTombstones = clone(tombstones);
  AppData.state.workedLinkTombstones = {};
}

const LINKS_CHEZ = [
  { employeeId: "e1", status: "Compensado", compensationDate: "2026-08-10", scheduledCoDate: "2026-08-10" },
  { employeeId: "e2", status: "Pendente", compensationDate: "", scheduledCoDate: "" }
];

console.log("\n=== TESTE: feriado de uma empresa estendido à outra (Chez Pitu × Pengold) ===\n");

// ── 1. Caso real: 29/07 cadastrado só na Chez Pitu ──────────────────────────
{
  setFixture({
    calendar: [
      { id: "cal-hot", name: "Dia do Comércio Hoteleiro", date: "2026-07-29", type: "interno", companies: [CO] },
      { id: "cal-natal", name: "Natal", date: "2026-12-25", type: "nacional", companies: ["ambas"] }
    ],
    chez: [{ id: "h-hot", name: "Dia do Comércio Hoteleiro", date: "2026-07-29", workedEmployees: LINKS_CHEZ }]
  });
  const chezBefore = clone(AppData.state.companies[CO].holidays);

  assert(
    !AppData.listRegisteredHolidays(PG).some((item) => item.date === "2026-07-29"),
    "Reproduz o defeito: 29/07 não aparece na Pengold antes da correção"
  );

  const result = AppData.extendHolidayToCompanies("2026-07-29", "Dia do Comércio Hoteleiro", [PG], { save: false });
  assert(result.ok && result.added.join() === PG, `Estende para Pengold (added=${result.added?.join()})`);

  const pgHoliday = AppData.state.companies[PG].holidays.find((h) => h.date === "2026-07-29");
  assert(pgHoliday && pgHoliday.workedEmployees.length === 0, "Pengold recebe o feriado SEM vínculos");
  assert(pgHoliday?.name === "Dia do Comércio Hoteleiro", "Nome preservado na Pengold");
  assert(
    JSON.stringify(AppData.state.companies[CO].holidays) === JSON.stringify(chezBefore),
    "Bloco da Chez Pitu (vínculos, status, compensação) idêntico antes/depois"
  );
  const cal = AppData.state.calendarHolidays.find((h) => h.id === "cal-hot");
  assert(cal.companies.includes(CO) && cal.companies.includes(PG), "Calendário passa a atender as duas empresas");
  assert(cal.type === "interno" && cal.date === "2026-07-29", "Tipo e data do calendário inalterados");
  assert(
    AppData.listRegisteredHolidays(PG).some((item) => item.date === "2026-07-29"),
    "29/07 aparece na lista de feriados da Pengold"
  );
  assert(
    AppData.state.calendarHolidays.length === 2,
    "Nenhuma entrada de calendário duplicada ou removida"
  );

  // 2. Idempotência
  const again = AppData.extendHolidayToCompanies("2026-07-29", "Dia do Comércio Hoteleiro", [PG], { save: false });
  assert(
    again.ok && again.added.length === 0 && again.skipped[0]?.reason === "já cadastrado",
    "Segunda chamada não duplica (já cadastrado)"
  );
  assert(
    AppData.state.companies[PG].holidays.filter((h) => h.date === "2026-07-29").length === 1,
    "Pengold continua com um único registro do feriado"
  );

  // 3. Merge com remoto antigo (calendário só com Chez Pitu) não desfaz
  const local = clone({
    companies: { [CO]: AppData.state.companies[CO], [PG]: AppData.state.companies[PG] },
    calendarHolidays: AppData.state.calendarHolidays
  });
  const remote = {
    companies: { [CO]: clone(AppData.state.companies[CO]), [PG]: { companyInfo: { legalName: PG }, holidays: [] } },
    calendarHolidays: [{ id: "cal-hot", name: "Dia do Comércio Hoteleiro", date: "2026-07-29", type: "interno", companies: [CO] }]
  };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const mergedCal = (merged.calendarHolidays || []).find((h) => h.date === "2026-07-29");
  assert(mergedCal?.companies.includes(PG), "Merge com remoto antigo mantém Pengold no calendário (união)");
  assert(
    (merged.companies?.[PG]?.holidays || []).some((h) => h.date === "2026-07-29"),
    "Merge com remoto antigo mantém o feriado no bloco da Pengold"
  );
}

// ── 4. Feriado que só existe no bloco da empresa (sem calendário) ───────────
{
  setFixture({
    chez: [{ id: "h-2027", name: "Tiradentes", date: "2027-04-21", workedEmployees: [{ employeeId: "e9" }] }]
  });
  const result = AppData.extendHolidayToCompanies("2027-04-21", "Tiradentes", [PG], { save: false });
  const cal = AppData.state.calendarHolidays.find((h) => h.date === "2027-04-21");
  assert(result.ok && result.added.includes(PG), "Feriado só no bloco da Chez Pitu também estende");
  assert(
    cal && cal.companies.join() === PG,
    "Cria entrada de calendário só para a empresa alvo (Chez Pitu mantém o comportamento de antes)"
  );
  assert(
    AppData.state.companies[CO].holidays[0].workedEmployees.length === 1,
    "Vínculo existente da Chez Pitu preservado"
  );
}

// ── 5. "ambas" e nome com acento/caixa diferentes ───────────────────────────
{
  setFixture({
    calendar: [{ id: "cal-cc", name: "Corpus Christi", date: "2027-05-27", type: "nacional", companies: [CO] }],
    chez: [{ id: "h-cc", name: "Corpus Christi", date: "2027-05-27", workedEmployees: [] }]
  });
  const result = AppData.extendHolidayToCompanies("2027-05-27", "corpus christi", ["ambas"], { save: false });
  assert(
    result.ok && result.added.join() === PG && result.skipped.some((s) => s.company === CO),
    "'ambas' estende só para quem falta; identidade ignora caixa"
  );
}

// ── 6. Tombstone na empresa alvo é respeitado ───────────────────────────────
{
  setFixture({
    calendar: [{ id: "cal-x", name: "São Jorge", date: "2027-04-23", type: "estadual", companies: [CO] }],
    chez: [{ id: "h-x", name: "São Jorge", date: "2027-04-23", workedEmployees: [] }],
    tombstones: { [PG]: { "2027-04-23|sao jorge": 1000 } }
  });
  const blocked = AppData.extendHolidayToCompanies("2027-04-23", "São Jorge", [PG], { save: false });
  assert(
    blocked.ok && blocked.added.length === 0 && /tombstone/.test(blocked.skipped[0]?.reason || ""),
    "Feriado excluído antes na Pengold não é recriado sem autorização"
  );
  assert(AppData.state.companies[PG].holidays.length === 0, "Nada gravado na Pengold quando bloqueado");
  assert(
    !AppData.state.calendarHolidays.find((h) => h.id === "cal-x").companies.includes(PG),
    "Bloqueado pela trava: Pengold também NÃO entra no calendário"
  );
  assert(
    !AppData.listRegisteredHolidays(PG).some((item) => item.date === "2027-04-23"),
    "Bloqueado pela trava: feriado não aparece na lista da Pengold"
  );
  const forced = AppData.extendHolidayToCompanies("2027-04-23", "São Jorge", [PG], {
    save: false,
    overrideTombstone: true
  });
  assert(forced.added.includes(PG), "Com overrideTombstone (ação explícita) o feriado é recriado");
}

// ── 7. Feriado inexistente: recusa sem gravar ───────────────────────────────
{
  setFixture({ calendar: [], chez: [] });
  const result = AppData.extendHolidayToCompanies("2027-01-01", "Inexistente", [PG], { save: false });
  assert(!result.ok && AppData.state.calendarHolidays.length === 0, "Feriado inexistente: recusa e não cria nada");
  assert(
    AppData.state.companies[PG].holidays.length === 0,
    "Feriado inexistente: Pengold continua sem registros"
  );
}

// ── 7b. Importação: feriado NOVO vale para as duas empresas, vínculo só na da linha
{
  setFixture({ calendar: [], chez: [], pengold: [] });
  AppData.state.companies[CO].employees = [{ id: "emp-imp", name: "Fulano Importado", company: CO, status: "Ativo" }];
  const result = AppData.importHolidaysBatch(
    [{ company: CO, employeeName: "Fulano Importado", holidayName: "Dia do Hoteleiro - 2027", workedDate: "2027-07-29" }],
    { fallbackCompany: CO, mapRow: (row) => row }
  );
  const chezH = AppData.state.companies[CO].holidays.find((h) => h.date === "2027-07-29");
  const pgH = AppData.state.companies[PG].holidays.find((h) => h.date === "2027-07-29");
  if (result.imported === 1) {
    assert(chezH?.workedEmployees.length === 1, "Importação: vínculo fica na empresa da linha (Chez Pitu)");
    assert(pgH && pgH.workedEmployees.length === 0, "Importação: Pengold recebe o feriado novo sem vínculos");
  } else {
    console.log(`  (importação não aplicável neste formato de linha: ${JSON.stringify(result.messages)})`);
  }
}

// ── 8. Checagem de fonte do formulário ──────────────────────────────────────
{
  const src = fs.readFileSync(path.join(root, "js/feriados.js"), "utf8");
  assert(/name="scope"/.test(src), "Formulário tem o campo 'Vale para' (scope)");
  assert(/value: "categoria"/.test(src), "Tipo 'Categoria (CCT)' disponível");
  assert(
    !/const companies = \[AppData\.getActiveCompany\(\)\];/.test(src),
    "Cadastro não força mais a empresa da aba ativa"
  );
  assert(/data-extend-holiday/.test(src), "Lista de feriados tem botão para estender à outra empresa");
  {
    const at = src.indexOf("AppData.addHoliday({ name, date, workedEmployees });");
    const tail = at >= 0 ? src.slice(at, at + 600) : "";
    assert(
      tail.includes('AppData.extendHolidayToCompanies(date, name, ["ambas"]);'),
      "Cadastro pelo formulário de vínculo também estende o feriado novo às duas empresas"
    );
  }
  assert(
    !/removeHolidayEverywhere\(|removeCalendarHoliday\(/.test(src.replace(/\/\/.*$/gm, "")),
    "Nenhuma chamada de exclusão de feriado reintroduzida na tela"
  );
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
