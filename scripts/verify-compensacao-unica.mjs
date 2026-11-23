/**
 * REGRA FIXA (2026-11-23): a mesma data de compensação não pode servir a dois
 * feriados diferentes do mesmo funcionário. Aviso: "A data informada para
 * compensação (dd/mm/aaaa) já está cadastrada com o vínculo do feriado X".
 *
 * Uso: node scripts/verify-compensacao-unica.mjs
 *
 * Sandbox em memória (fixtures) — nunca toca localStorage/Firebase reais.
 * Cobre:
 *  [1] findCompensationDateConflict / mensagem
 *  [2] Escala: CO em data já usada por outro feriado é recusado (lançamento anterior intacto)
 *  [3] Escala: trocar o feriado de um CO existente desfaz o vínculo anterior (sem duplicar)
 *  [4] Importação recusa a linha e não cria feriado vazio
 *  [5] Controle de Feriados (feriados.js): tabela e formulário usam a regra (checagem de fonte)
 *  [6] Réplica do caso Carlos Mathews (Pengold): plano de correção + reconcile fica estável
 *  [7] Dados já registrados com data repetida não são alterados pela regra
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    parseInt, parseFloat, isNaN, undefined, RegExp,
    navigator: { onLine: true }, performance: { now: () => 0 }
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  for (const file of ["js/version.js", "js/import-utils.js", "js/data.js", "js/scale-rules.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.window.AppData;
}

const EMP = "e-carlos";
const EMP2 = "e-andre";

function lfs(date, holidayId) {
  return { employeeId: EMP, compensationDate: date, scheduledCoDate: date, scaleCoDate: date, linkedFromScale: true, linkedHolidayId: holidayId, status: "Compensado" };
}
function man(date, emp = EMP) {
  return { employeeId: emp, compensationDate: date, scheduledCoDate: date, scaleCoDate: "", linkedFromScale: false, status: "Compensado" };
}

function buildState() {
  const employees = [
    { id: EMP, name: "Carlos Teste", company: "Pengold", status: "Ativo", department: "BAR", admissionDate: "2024-01-01" },
    { id: EMP2, name: "Andre Teste", company: "Pengold", status: "Ativo", department: "BAR", admissionDate: "2024-01-01" }
  ];
  // Réplica do estado de produção de Carlos Mathews (Pengold) em 2026-11-23.
  const holidays = [
    { id: "h-trab", name: "Trabalhador", date: "2026-05-01", workedEmployees: [man("2026-06-10")] },
    { id: "h-corpus", name: "Corpus Christi", date: "2026-06-04", workedEmployees: [lfs("2026-06-12", "h-corpus")] },
    { id: "h-padroeira", name: "Padroeira de Búzios", date: "2026-07-26", workedEmployees: [lfs("2026-06-13", "h-padroeira")] },
    { id: "h-comercio", name: "Comércio Hoteleiro", date: "2026-07-29", workedEmployees: [man("2026-06-13")] },
    { id: "h-brasil", name: "Padroeira do Brasil", date: "2026-10-12", workedEmployees: [man("2026-06-15")] },
    { id: "h-finados", name: "Finados", date: "2026-11-02", workedEmployees: [lfs("2026-08-23", "h-finados")] },
    { id: "h-aniv", name: "Aniversário de Búzios", date: "2026-11-12", workedEmployees: [man("2026-08-23")] },
    { id: "h-consc", name: "Consciência Negra", date: "2026-11-20", workedEmployees: [lfs("2026-10-26", "h-consc")] },
    { id: "h-natal", name: "Natal", date: "2026-12-25", workedEmployees: [man("2026-10-26")] },
    { id: "h-ano", name: "Ano Novo", date: "2027-01-01", workedEmployees: [man("2026-11-05")] },
    { id: "h-carnaval", name: "Carnaval 2027", date: "2027-02-09", workedEmployees: [man("2026-11-16")] },
    { id: "h-pend", name: "Feriado Pendente", date: "2026-11-15", workedEmployees: [{ employeeId: EMP, compensationDate: "", status: "Pendente" }, { employeeId: EMP2, compensationDate: "", status: "Pendente" }] }
  ];
  const manualScale = {
    [`${EMP}|2026-06-10`]: { code: "CO", linkedHolidayId: "h-corpus" },
    [`${EMP}|2026-06-12`]: { code: "CO", linkedHolidayId: "h-corpus" },
    [`${EMP}|2026-06-13`]: { code: "CO", linkedHolidayId: "h-padroeira" },
    [`${EMP}|2026-08-23`]: { code: "CO", linkedHolidayId: "h-finados" },
    [`${EMP}|2026-10-26`]: { code: "CO", linkedHolidayId: "h-consc" }
  };
  return {
    calendarHolidays: [],
    companies: {
      "Chez Pitu": { employees: [], vacations: [], absences: [], manualScale: {}, holidays: [] },
      Pengold: { employees, vacations: [], absences: [], manualScale, holidays }
    }
  };
}

let pass = 0, fail = 0;
function check(desc, cond) {
  if (cond) { pass++; console.log(`  ✓ ${desc}`); }
  else { fail++; console.log(`  ✗ ${desc}`); }
}

function boot() {
  const storage = createStorage();
  storage.setItem("chezPituHolidaySeed2026.v2", new Date().toISOString());
  const first = loadCore(storage);
  storage.setItem(first.STORAGE_KEY, JSON.stringify(buildState()));
  return loadCore(storage);
}

const comp = (data, id, emp = EMP) =>
  (data.holidays.find((h) => h.id === id)?.workedEmployees || []).find((w) => w.employeeId === emp)?.compensationDate;

console.log("\n=== VERIFICAÇÃO: data de compensação única por funcionário ===\n");

// [1] -----------------------------------------------------------------------
console.log("[1] findCompensationDateConflict");
{
  const App = boot();
  const data = App.getCompanyData("Pengold");
  const c = App.findCompensationDateConflict(data, EMP, "2026-10-26", { excludeHolidayId: "h-pend" });
  check("data usada por outro feriado → conflito", Boolean(c));
  check("conflito aponta o primeiro feriado que usa a data", c?.holiday?.id === "h-consc");
  check("excluindo o próprio feriado não conflita consigo", !App.findCompensationDateConflict(data, EMP, "2026-11-16", { excludeHolidayId: "h-carnaval" }));
  check("data livre → sem conflito", !App.findCompensationDateConflict(data, EMP, "2026-12-01"));
  check("outro funcionário não conflita", !App.findCompensationDateConflict(data, EMP2, "2026-10-26"));
  const msg = App.compensationDateConflictMessage("2026-11-16", App.findCompensationDateConflict(data, EMP, "2026-11-16"));
  check(`mensagem: "${msg}"`, msg === "A data informada para compensação (16/11/2026) já está cadastrada com o vínculo do feriado Carnaval 2027 (09/02/2027).");
}

// [2] -----------------------------------------------------------------------
console.log("\n[2] Escala: CO em data já usada é recusado");
{
  const App = boot();
  const data = App.getCompanyData("Pengold");
  const before = JSON.stringify(data.holidays);
  const r = App.applyManualScaleBatch([{ employeeId: EMP, date: "2026-11-16", code: "CO", linkedHolidayId: "h-pend" }], "Pengold");
  const after = App.getCompanyData("Pengold");
  check("aviso cita o feriado que já usa a data", r.warnings.some((w) => w.includes("Carnaval 2027") && w.includes("já está cadastrada")));
  check("feriado pendente continua sem compensação", !comp(after, "h-pend"));
  check("Carnaval continua com 16/11", comp(after, "h-carnaval") === "2026-11-16");
  check("nenhum CO manual criado em 16/11", !after.manualScale[`${EMP}|2026-11-16`]);
  check("vínculos de feriado não mudaram", JSON.stringify(after.holidays.filter((h) => h.id !== "h-pend").map((h) => [h.id, comp(after, h.id)])) ===
    JSON.stringify(JSON.parse(before).filter((h) => h.id !== "h-pend").map((h) => [h.id, (h.workedEmployees.find((w) => w.employeeId === EMP) || {}).compensationDate])));

  const ok = App.applyManualScaleBatch([{ employeeId: EMP, date: "2026-12-01", code: "CO", linkedHolidayId: "h-pend" }], "Pengold");
  check("data livre: CO vinculado sem aviso de conflito", !ok.warnings.some((w) => w.includes("já está cadastrada")) && comp(App.getCompanyData("Pengold"), "h-pend") === "2026-12-01");

  const again = App.applyManualScaleBatch([{ employeeId: EMP, date: "2026-12-01", code: "CO", linkedHolidayId: "h-pend" }], "Pengold");
  check("regravar o mesmo CO no mesmo feriado não acusa conflito", !again.warnings.some((w) => w.includes("já está cadastrada")));
}

// [3] -----------------------------------------------------------------------
console.log("\n[3] Escala: trocar o feriado de um CO existente");
{
  const App = boot();
  // CO de 12/06 hoje aponta Corpus; trocar para Padroeira? Padroeira usa 13/06 (LFS) — conflito não existe em 12/06.
  // Usa feriado pendente para isolar: CO 12/06 → h-pend.
  const r = App.applyManualScaleBatch([{ employeeId: EMP, date: "2026-06-12", code: "CO", linkedHolidayId: "h-pend" }], "Pengold");
  const data = App.getCompanyData("Pengold");
  check("sem aviso de conflito (é o próprio CO sendo trocado)", !r.warnings.some((w) => w.includes("já está cadastrada")));
  check("feriado novo recebe 12/06", comp(data, "h-pend") === "2026-06-12");
  check("feriado antigo (Corpus) não fica com 12/06", comp(data, "h-corpus") !== "2026-06-12");
  const users = data.holidays.filter((h) => !h.isDeleted && (h.workedEmployees || []).some((w) => w.employeeId === EMP && w.compensationDate === "2026-06-12"));
  check("12/06 usado por um único feriado", users.length === 1);
}

// [4] -----------------------------------------------------------------------
console.log("\n[4] Importação");
{
  const App = boot();
  const countBefore = App.getCompanyData("Pengold").holidays.length;
  const res = App.importHolidaysBatch(
    [{ employeeName: "Carlos Teste", holidayName: "Feriado Novo Importado", workedDate: "2026-11-01", compensationDate: "2026-11-05", company: "Pengold" }],
    { fallbackCompany: "Pengold" }
  );
  const data = App.getCompanyData("Pengold");
  check("linha recusada", res.imported === 0 && res.skipped === 1);
  check("mensagem cita Ano Novo", res.messages.some((m) => m.includes("Ano Novo") && m.includes("05/11/2026")));
  check("nenhum feriado vazio criado", data.holidays.length === countBefore);
  const ok = App.importHolidaysBatch(
    [{ employeeName: "Carlos Teste", holidayName: "Ano Novo", workedDate: "2027-01-01", compensationDate: "2026-11-05", company: "Pengold" }],
    { fallbackCompany: "Pengold" }
  );
  check("reimportar o mesmo feriado com a mesma data é aceito", ok.imported === 1);
}

// [5] -----------------------------------------------------------------------
console.log("\n[5] Controle de Feriados (fonte de js/feriados.js)");
{
  const src = fs.readFileSync(path.join(root, "js/feriados.js"), "utf8");
  const setFn = src.slice(src.indexOf("function setCompensationDate"), src.indexOf("function confirmUnlinkWorkedEmployee"));
  check("setCompensationDate consulta findCompensationDateConflict", setFn.includes("AppData.findCompensationDateConflict"));
  check("setCompensationDate recusa antes de gravar", setFn.indexOf("findCompensationDateConflict") < setFn.indexOf("workedEmployee.compensationDate = compensationDate"));
  check("campo da tabela volta ao valor anterior quando recusado", /result\.ok === false[\s\S]{0,80}input\.value = input\.defaultValue/.test(src));
  const formFn = src.slice(src.indexOf("function submitWorkedHolidayForm"), src.indexOf("function submitCalendarHolidayForm"));
  check("formulário de vínculo consulta a regra antes de gravar", formFn.includes("findCompensationDateConflict") && formFn.indexOf("findCompensationDateConflict") < formFn.indexOf("AppData.saveState"));
}

// [6] -----------------------------------------------------------------------
console.log("\n[6] Réplica Carlos Mathews: correção + reconcile estável");
{
  const App = boot();
  const data = App.getCompanyData("Pengold");
  const target = {
    "h-trab": "2026-06-10", "h-corpus": "2026-06-11", "h-padroeira": "2026-06-12", "h-comercio": "2026-06-13",
    "h-brasil": "2026-06-15", "h-finados": "2026-06-29", "h-aniv": "2026-08-23", "h-consc": "2026-10-05",
    "h-natal": "2026-10-26", "h-ano": "2026-11-05", "h-carnaval": "2026-11-16"
  };
  // Plano: COs da escala passam a apontar o feriado correto da data;
  // feriados sem CO na escala na nova data ficam como compensação manual.
  const relink = { "2026-06-10": "h-trab", "2026-06-12": "h-padroeira", "2026-06-13": "h-comercio", "2026-08-23": "h-aniv", "2026-10-26": "h-natal" };
  Object.entries(relink).forEach(([d, hid]) => { data.manualScale[`${EMP}|${d}`] = { code: "CO", linkedHolidayId: hid }; });
  Object.entries(target).forEach(([hid, d]) => {
    const h = data.holidays.find((x) => x.id === hid);
    const w = h.workedEmployees.find((x) => x.employeeId === EMP);
    const viaScale = relink[d] === hid;
    Object.assign(w, { compensationDate: d, scheduledCoDate: d, scaleCoDate: viaScale ? d : "", linkedFromScale: viaScale, linkedHolidayId: viaScale ? hid : "" });
    App.syncWorkedEmployeeStatus(w, h.date);
  });
  App.reconcileCoCompensationLinks(data);
  App.reconcileCoCompensationLinks(data);
  const okAll = Object.entries(target).every(([hid, d]) => comp(data, hid) === d);
  check("após reconcile todas as datas ficam como pedidas", okAll);
  const dates = Object.keys(target).map((hid) => comp(data, hid));
  check("nenhuma data de compensação repetida", new Set(dates).size === dates.length);
  check("feriado sem vínculo pedido (pendente) intacto", !comp(data, "h-pend"));
}

// [7] -----------------------------------------------------------------------
console.log("\n[7] Dados antigos com data repetida não são alterados");
{
  const App = boot();
  const data = App.getCompanyData("Pengold");
  const before = JSON.stringify(data.holidays);
  App.findCompensationDateConflict(data, EMP, "2026-06-13");
  App.findCompensationDateConflict(data, EMP, "2026-08-23", { excludeHolidayId: "h-aniv" });
  check("a regra só lê (nenhum vínculo alterado)", JSON.stringify(App.getCompanyData("Pengold").holidays) === before);
}

console.log(`\nResultado: ${pass} OK, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
