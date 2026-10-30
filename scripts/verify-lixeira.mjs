/**
 * Validação: LIXEIRA (arquivo de exclusões) — REGRA FIXA "nada some do sistema".
 *
 * Cobre (fixtures em memória — nunca toca a base real):
 *  - "Excluir vínculo" guarda o vínculo completo (status, compensação, CO da
 *    escala) e "Restaurar" devolve tudo, limpando o tombstone;
 *  - a restauração vence o tombstone que volta pelo merge de outro PC;
 *  - feriado cadastrado não se exclui (nada vai à lixeira); uma exclusão ANTIGA
 *    de feriado (tombstone + CO órfão) é recuperável por entrada "feriado";
 *  - férias, ausência e funcionário (dentro das 24h) também vão para a lixeira;
 *  - restauração não sobrescreve dado lançado depois e não restaura duas vezes;
 *  - normalizeWorkedEmployeeRefs não descarta mais vínculo sem funcionário;
 *  - merge une as lixeiras (nada some) e o Firebase a transporta aninhada.
 *
 * Uso: node scripts/verify-lixeira.mjs
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

function makeSandbox(files) {
  const store = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
    Date, JSON, Math, Object, Array, Set, Map, String, Number,
    parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const sandbox = makeSandbox(["js/import-utils.js", "js/data.js", "js/firebase-sync.js"]);
const AppData = sandbox.AppData;
const FirebaseSync = sandbox.FirebaseSync;
const CO = "Chez Pitu";
const PG = "Pengold";

// Datas relativas a hoje (fixture com data fixa é dívida — PROJECT_RULES.md).
function shiftISO(days) {
  const d = new Date(`${AppData.todayISO()}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const HOL_DATE = shiftISO(-30);
const CO_DATE = shiftISO(-10);
const CO_KEY = `e1|${CO_DATE}`;

function resetFixture() {
  const block = AppData.state.companies[CO];
  block.employees = [
    { id: "e1", name: "CARLOS TESTE", status: "Ativo", company: CO, admissionDate: "2020-01-01" },
    { id: "e2", name: "MARIA TESTE", status: "Ativo", company: CO, admissionDate: "2020-01-01" }
  ];
  block.holidays = [
    {
      id: "hSJ", name: "São Jorge", date: HOL_DATE,
      workedEmployees: [
        { employeeId: "e1", status: "Compensado", compensationDate: CO_DATE, scheduledCoDate: CO_DATE,
          scaleCoDate: CO_DATE, linkedFromScale: true, linkedHolidayId: "hSJ", origin: "Manual" },
        { employeeId: "e2", status: "Pendente", compensationDate: "", origin: "Automático pela escala" }
      ]
    }
  ];
  block.manualScale = { [CO_KEY]: { code: "CO", linkedHolidayId: "hSJ" } };
  block.vacations = [];
  block.absences = [];
  AppData.state.calendarHolidays = [
    { id: "calSJ", name: "São Jorge", date: HOL_DATE, companies: ["ambas"] }
  ];
  AppData.state.companies[PG].holidays = [
    { id: "pgSJ", name: "São Jorge", date: HOL_DATE, workedEmployees: [{ employeeId: "p1", status: "Pendente" }] }
  ];
  AppData.state.deletedArchive = {};
  AppData.state.holidayTombstones = {};
  AppData.state.workedLinkTombstones = {};
  AppData.state.tombstones = { employees: {}, vacations: {}, absences: {} };
}

const holidayOf = (company, id) => AppData.getCompanyData(company).holidays.find((h) => h.id === id);

console.log("\n=== TESTE: Lixeira (nada some do sistema) ===\n");

// ── 1. Excluir vínculo → lixeira → restaurar ──────────────────────────────────
console.log("[1] Vínculo");
{
  resetFixture();
  AppData.removeWorkedEmployeeFromHoliday("hSJ", "e1", { company: CO });
  const h = holidayOf(CO, "hSJ");
  assert(!h.workedEmployees.some((w) => w.employeeId === "e1"), "vínculo removido da tela");
  assert(AppData.getCompanyData(CO).manualScale[CO_KEY] === "CO", "CO da escala perde só o vínculo (comportamento antigo)");

  const list = AppData.listDeletedArchive({ company: CO, kinds: ["vinculo"] });
  assert(list.length === 1, "vínculo guardado na lixeira");
  const entry = list[0];
  assert(entry.payload.item.compensationDate === CO_DATE && entry.payload.item.status === "Compensado",
    "lixeira guarda compensação e status");
  assert(entry.summary.includes("CARLOS TESTE") && entry.summary.includes("São Jorge"), "resumo nomeia funcionário e feriado");
  assert(entry.payload.scaleLinks.length === 1 && entry.payload.scaleLinks[0].key === CO_KEY,
    "lixeira guarda o CO da escala ligado ao feriado");
  assert(Boolean(entry.deletedAt) && Boolean(entry.deletedBy), "lixeira registra quando e quem");

  const res = AppData.restoreDeletedArchiveEntry(entry.id, { recompute: false });
  assert(res.ok === true, "restauração do vínculo OK");
  const back = holidayOf(CO, "hSJ").workedEmployees.find((w) => w.employeeId === "e1");
  assert(back && back.compensationDate === CO_DATE && back.status === "Compensado",
    "vínculo volta com compensação e status");
  assert(AppData.getCompanyData(CO).manualScale[CO_KEY]?.linkedHolidayId === "hSJ",
    "CO da escala volta a apontar para o feriado");
  assert(!AppData.isWorkedLinkTombstoned(CO, HOL_DATE, "São Jorge", "e1"), "tombstone do vínculo limpo");
  assert(Number(back.restoredAt) > 0, "vínculo carimbado com restoredAt");

  const again = AppData.restoreDeletedArchiveEntry(entry.id, { recompute: false });
  assert(again.ok === false, "não restaura duas vezes");
  assert(AppData.listDeletedArchive({ company: CO }).length === 1, "entrada continua na lixeira (só marcada)");
  assert(AppData.listDeletedArchive({ company: CO, includeRestored: false }).length === 0,
    "contador de pendentes zera após restaurar");
}

// ── 2. Restauração vence o tombstone que volta pelo merge de outro PC ────────
console.log("[2] Merge com outro PC");
{
  const local = JSON.parse(JSON.stringify(AppData.state));
  const deletedAt = Number(Object.values(local.deletedArchive)[0].deletedAt);
  const remote = JSON.parse(JSON.stringify(local));
  // Outro PC ainda tem o tombstone e NÃO tem o vínculo.
  remote.workedLinkTombstones = { [CO]: { [`${HOL_DATE}|sao jorge|e1`]: deletedAt } };
  remote.companies[CO].holidays[0].workedEmployees =
    remote.companies[CO].holidays[0].workedEmployees.filter((w) => w.employeeId !== "e1");
  remote.deletedArchive = {};
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const h = merged.companies[CO].holidays.find((x) => x.id === "hSJ");
  assert(h.workedEmployees.some((w) => w.employeeId === "e1"), "vínculo restaurado sobrevive ao merge");
  assert(!merged.workedLinkTombstones?.[CO]?.[`${HOL_DATE}|sao jorge|e1`], "tombstone obsoleto descartado no merge");
  assert(Object.keys(merged.deletedArchive || {}).length === 1, "lixeira local preservada no merge");

  // Exclusão normal (sem restauração) continua valendo no merge.
  const remote2 = JSON.parse(JSON.stringify(remote));
  remote2.workedLinkTombstones[CO][`${HOL_DATE}|sao jorge|e2`] = Date.now() + 60000;
  const merged2 = AppData.mergeRemoteIntoLocal(JSON.parse(JSON.stringify(AppData.state)), remote2);
  assert(!merged2.companies[CO].holidays.find((x) => x.id === "hSJ").workedEmployees.some((w) => w.employeeId === "e2"),
    "exclusão sem restauração continua vencendo (não ressuscita)");
}

// ── 3. Feriado cadastrado não se exclui: nada vai à lixeira ─────────────────
console.log("[3] Feriado — exclusão bloqueada");
{
  resetFixture();
  const before = JSON.stringify(AppData.getCompanyData(CO).holidays);
  const res = AppData.removeHolidayEverywhere(HOL_DATE, "São Jorge", { companies: [CO], recompute: false });
  const res2 = AppData.removeCompanyHolidayPermanently("hSJ", { company: CO });
  assert(res.blocked && res2.blocked, "exclusão de feriado recusada");
  assert(JSON.stringify(AppData.getCompanyData(CO).holidays) === before, "feriado e vínculos intactos");
  assert(AppData.listDeletedArchive({}).length === 0, "nada vai para a lixeira");
}

// ── 4. Exclusão ANTIGA de feriado (antes da regra) é recuperável ─────────────
// Reproduz o caso real: feriado removido, tombstone gravado, CO da escala
// ainda apontando para o id antigo. A entrada "feriado" devolve tudo.
console.log("[4] Feriado — recuperação de exclusão antiga");
{
  resetFixture();
  const record = JSON.parse(JSON.stringify(holidayOf(CO, "hSJ")));
  const deletedAt = Date.now() - 86400000;
  AppData.getCompanyData(CO).holidays = [];
  AppData.state.holidayTombstones = { [CO]: { [`${HOL_DATE}|sao jorge`]: deletedAt } };
  AppData.state.deletedArchive = {
    legado1: {
      id: "legado1", kind: "feriado", company: CO, summary: `São Jorge (${HOL_DATE})`,
      deletedAt, deletedBy: "recuperação", restoredAt: 0, restoredBy: "",
      payload: { date: HOL_DATE, name: "São Jorge", holidays: [{ company: CO, record }], calendar: [], scaleLinks: [] }
    }
  };
  const r = AppData.restoreDeletedArchiveEntry("legado1", { recompute: false });
  assert(r.ok, "restauração do feriado antigo OK");
  const h = holidayOf(CO, "hSJ");
  assert(h && h.workedEmployees.length === 2, "feriado volta com o mesmo id e os 2 vínculos");
  assert(h.workedEmployees.find((w) => w.employeeId === "e1").compensationDate === CO_DATE,
    "compensação do vínculo preservada");
  assert(AppData.getCompanyData(CO).manualScale[CO_KEY]?.linkedHolidayId === "hSJ",
    "CO órfão da escala volta a encontrar o feriado (mesmo id)");
  assert(!AppData.isHolidayTombstoned(CO, HOL_DATE, "São Jorge"), "tombstone do feriado limpo");
  assert(AppData.getCompanyData(PG).holidays.length === 1, "Pengold não é tocada");

  // Outro PC ainda com o tombstone antigo: a restauração vence.
  const remote = JSON.parse(JSON.stringify(AppData.state));
  remote.holidayTombstones = { [CO]: { [`${HOL_DATE}|sao jorge`]: deletedAt } };
  remote.companies[CO].holidays = [];
  const merged = AppData.mergeRemoteIntoLocal(JSON.parse(JSON.stringify(AppData.state)), remote);
  assert(merged.companies[CO].holidays.some((x) => x.id === "hSJ" && x.workedEmployees.length === 2),
    "feriado restaurado sobrevive ao merge com outro PC");
}

// ── 5. Restauração não sobrescreve dado lançado depois ───────────────────────
console.log("[5] Não sobrescreve");
{
  resetFixture();
  AppData.removeWorkedEmployeeFromHoliday("hSJ", "e2", { company: CO });
  const entry = AppData.listDeletedArchive({ kinds: ["vinculo"] })[0];
  // Depois da exclusão o usuário revinculou e-2 com compensação nova.
  const LATER = shiftISO(-2);
  holidayOf(CO, "hSJ").workedEmployees.push({ employeeId: "e2", status: "Compensado", compensationDate: LATER });
  AppData.restoreDeletedArchiveEntry(entry.id, { recompute: false });
  const rows = holidayOf(CO, "hSJ").workedEmployees.filter((w) => w.employeeId === "e2");
  assert(rows.length === 1 && rows[0].compensationDate === LATER, "compensação lançada depois é mantida, sem duplicar");

  // Célula da escala alterada depois da exclusão não é sobrescrita.
  resetFixture();
  AppData.removeWorkedEmployeeFromHoliday("hSJ", "e1", { company: CO });
  AppData.getCompanyData(CO).manualScale[CO_KEY] = "FOLGA";
  AppData.restoreDeletedArchiveEntry(AppData.listDeletedArchive({ kinds: ["vinculo"] })[0].id, { recompute: false });
  assert(AppData.getCompanyData(CO).manualScale[CO_KEY] === "FOLGA", "lançamento posterior na escala preservado");

  // Vínculo cujo feriado não existe mais: recusa sem alterar nada.
  resetFixture();
  AppData.removeWorkedEmployeeFromHoliday("hSJ", "e1", { company: CO });
  const linkEntry = AppData.listDeletedArchive({ kinds: ["vinculo"] })[0];
  AppData.getCompanyData(CO).holidays = [];
  const r = AppData.restoreDeletedArchiveEntry(linkEntry.id, { recompute: false });
  assert(r.ok === false && /Restaure primeiro o feriado/.test(r.error), "pede para restaurar o feriado antes");
  assert(!AppData.state.deletedArchive[linkEntry.id].restoredAt, "entrada continua pendente");
}

// ── 6. Férias, ausência e funcionário ─────────────────────────────────────────
console.log("[6] Férias, ausência e funcionário");
{
  resetFixture();
  const data = AppData.getCompanyData(CO);
  data.vacations = [{ id: "v1", employeeId: "e1", startDate: shiftISO(5), endDate: shiftISO(10), note: "x", updatedAt: 1 }];
  data.absences = [{ id: "a1", employeeId: "e1", type: "Atestado médico", startDate: shiftISO(1), endDate: shiftISO(2), updatedAt: 1 }];
  AppData.removeVacation("v1", CO);
  AppData.removeAbsence("a1", CO);
  assert(!data.vacations.length && !data.absences.length, "férias e ausência removidas");
  const fer = AppData.listDeletedArchive({ kinds: ["ferias"] })[0];
  const aus = AppData.listDeletedArchive({ kinds: ["ausencia"] })[0];
  assert(fer && aus, "férias e ausência guardadas na lixeira");
  AppData.restoreDeletedArchiveEntry(fer.id, { recompute: false });
  AppData.restoreDeletedArchiveEntry(aus.id, { recompute: false });
  const d2 = AppData.getCompanyData(CO);
  assert(d2.vacations.some((v) => v.id === "v1") && d2.absences.some((a) => a.id === "a1"), "férias e ausência restauradas");

  // Tombstone por id não as apaga de novo (updatedAt > deletedAt).
  const merged = AppData.mergeRemoteIntoLocal(JSON.parse(JSON.stringify(AppData.state)), JSON.parse(JSON.stringify(AppData.state)));
  assert(merged.companies[CO].vacations.some((v) => v.id === "v1"), "férias restauradas sobrevivem ao merge");

  // Funcionário (dentro das 24h) com vínculo, férias e escala.
  resetFixture();
  const block = AppData.getCompanyData(CO);
  block.employees.push({ id: "e9", name: "NOVO TESTE", status: "Ativo", company: CO, createdAt: Date.now() });
  block.holidays[0].workedEmployees.push({ employeeId: "e9", status: "Pendente" });
  block.manualScale[`e9|${CO_DATE}`] = "FOLGA";
  AppData.removeEmployee("e9", CO);
  assert(!block.employees.some((e) => e.id === "e9") || !AppData.getCompanyData(CO).employees.some((e) => e.id === "e9"),
    "funcionário removido");
  const emp = AppData.listDeletedArchive({ kinds: ["funcionario"] })[0];
  assert(emp && emp.payload.links.length === 1 && emp.payload.manualScale.length === 1,
    "lixeira guarda funcionário + vínculo + escala");
  AppData.restoreDeletedArchiveEntry(emp.id, { recompute: false });
  const d3 = AppData.getCompanyData(CO);
  assert(d3.employees.some((e) => e.id === "e9"), "funcionário restaurado");
  assert(d3.holidays[0].workedEmployees.some((w) => w.employeeId === "e9"), "vínculo do funcionário restaurado");
  assert(d3.manualScale[`e9|${CO_DATE}`] === "FOLGA", "escala do funcionário restaurada");
}

// ── 7. normalizeWorkedEmployeeRefs não descarta vínculo sem funcionário ──────
console.log("[7] Vínculo sem funcionário no cadastro");
{
  const block = {
    employees: [{ id: "e1", name: "CARLOS TESTE" }],
    holidays: [{ id: "h", name: "X", date: HOL_DATE, workedEmployees: [{ employeeId: "e1" }, { employeeId: "orfao", status: "Compensado" }] }],
    manualScale: {}
  };
  // normalizeCompanyHolidays roda normalizeWorkedEmployeeRefs (via finalizeIncomingState).
  const st = JSON.parse(JSON.stringify(AppData.state));
  st.companies[CO] = { ...st.companies[CO], ...block };
  const fin = AppData.finalizeIncomingState(st);
  const h = fin.companies[CO].holidays.find((x) => x.id === "h");
  assert(h && h.workedEmployees.some((w) => w.employeeId === "orfao"), "vínculo órfão preservado (antes sumia)");
  assert(h.workedEmployees.some((w) => w.employeeId === "e1"), "vínculo normal mantido");
}

// ── 8. Merge e Firebase ───────────────────────────────────────────────────────
console.log("[8] Merge e Firebase");
{
  const a = { x1: { id: "x1", kind: "ferias", deletedAt: 1, restoredAt: 0 } };
  const b = { x1: { id: "x1", kind: "ferias", deletedAt: 1, restoredAt: 50, restoredBy: "b@x" },
              x2: { id: "x2", kind: "vinculo", deletedAt: 2, restoredAt: 0 } };
  const m = AppData.mergeDeletedArchives(a, b);
  assert(Object.keys(m).length === 2, "merge une as lixeiras dos dois PCs");
  assert(m.x1.restoredAt === 50, "merge mantém o restoredAt mais recente");

  const st = {
    companies: { [CO]: { companyInfo: { legalName: CO }, employees: [], holidays: [], vacations: [], absences: [], manualScale: {}, contadorLancamentos: {} } },
    calendarHolidays: [],
    tombstones: { employees: {}, vacations: {}, absences: {} },
    holidayTombstones: {}, workedLinkTombstones: {},
    deletedArchive: { x2: b.x2 },
    valeTransporte: { deductionDays: {}, discountValues: {} },
    auditLog: []
  };
  const fb = FirebaseSync.stateToFirebase(st);
  assert(fb.tombstones?.__deletedArchive?.x2 && fb.deletedArchive === undefined,
    "Firebase: lixeira aninhada em tombstones (sem nó de topo novo)");
  const back = FirebaseSync.firebaseToState(fb);
  assert(back.deletedArchive?.x2?.kind === "vinculo", "Firebase: lixeira volta no firebaseToState");
  assert(!("__deletedArchive" in back.tombstones), "Firebase: tombstones por id sem a chave aninhada");
}

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
