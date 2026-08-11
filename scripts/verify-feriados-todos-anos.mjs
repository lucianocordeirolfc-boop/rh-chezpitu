/**
 * Validação focada: lista COMPLETA de feriados cadastrados (todos os anos) e
 * edição/exclusão pela identidade do feriado (data + nome).
 *
 * Contexto do defeito corrigido: o popup "Gerenciar Feriados" listava apenas
 * state.calendarHolidays da empresa ativa. Feriados de outros anos (ex.: 2027)
 * que existiam só no bloco da empresa — ou cujo registro de calendário havia se
 * perdido no merge remoto (que descartava a lista local inteira) — ficavam
 * invisíveis, e por isso não podiam ser editados nem excluídos.
 *
 * Cobre:
 *  - listRegisteredHolidays: une calendário + bloco da empresa, sem duplicar,
 *    sem recorte de ano, com contagem de vínculos;
 *  - listRegisteredHolidays: respeita o recorte por empresa (companies);
 *  - merge do Firebase: UNIÃO do calendário (feriado local de 2027 não some);
 *  - merge: exclusão definitiva continua vencendo (tombstone);
 *  - updateHolidayEverywhere: edita calendário + empresas preservando vínculos;
 *  - removeHolidayEverywhere: remove feriado + TODOS os vínculos em todas as
 *    fontes, grava tombstones e não ressuscita via merge nem via auto-sync.
 *
 * Usa fixtures em memória — nunca a base de produção.
 *
 * Uso: node scripts/verify-feriados-todos-anos.mjs
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

function setFixture({ calendar = [], chez = [], pengold = [] } = {}) {
  AppData.state.calendarHolidays = calendar;
  AppData.state.companies[CO].holidays = chez;
  AppData.state.companies[PG].holidays = pengold;
  AppData.state.holidayTombstones = {};
  AppData.state.workedLinkTombstones = {};
}

console.log("\n=== TESTE: feriados cadastrados de todos os anos (lista/edição/exclusão) ===\n");

// ── 1. Lista une as duas fontes e mostra todos os anos ──────────────────────
{
  setFixture({
    calendar: [
      { id: "cal-1", name: "Ano Novo", date: "2026-01-01", type: "nacional", companies: [CO] },
      { id: "cal-2", name: "Ano Novo", date: "2027-01-01", type: "nacional", companies: [CO] }
    ],
    chez: [
      // Mesmo feriado do calendário (não pode duplicar na lista) + vínculo
      { id: "h-2026", name: "Ano Novo", date: "2026-01-01", workedEmployees: [{ employeeId: "e1" }] },
      // Só no bloco da empresa: era invisível na lista antiga
      { id: "h-2027", name: "Tiradentes", date: "2027-04-21", workedEmployees: [{ employeeId: "e1" }, { employeeId: "e2" }] }
    ]
  });

  const list = AppData.listRegisteredHolidays(CO);
  const years = [...new Set(list.map((item) => item.year))].sort();
  assert(list.length === 3, `Lista une calendário + empresa sem duplicar (3 feriados, obtido ${list.length})`);
  assert(
    years.join(",") === "2026,2027",
    `Lista traz todos os anos cadastrados (2026 e 2027, obtido ${years.join(",")})`
  );
  assert(
    list.some((item) => item.name === "Tiradentes" && item.date === "2027-04-21" && !item.inCalendar),
    "Feriado que existe só no bloco da empresa aparece na lista"
  );
  const anoNovo2026 = list.find((item) => item.date === "2026-01-01");
  assert(
    anoNovo2026 && anoNovo2026.inCalendar && anoNovo2026.inCompany && anoNovo2026.workedCount === 1,
    "Feriado presente nas duas fontes vira UMA linha, com a contagem de vínculos"
  );
  assert(
    list.find((item) => item.date === "2027-04-21")?.workedCount === 2,
    "Contagem de vínculos correta no feriado de 2027"
  );
}

// ── 2. Recorte por empresa continua valendo ─────────────────────────────────
{
  setFixture({
    calendar: [
      { id: "cal-chez", name: "Aniversário Chez", date: "2027-03-10", companies: [CO] },
      { id: "cal-peng", name: "Aniversário Pengold", date: "2027-03-11", companies: [PG] },
      { id: "cal-ambas", name: "Natal", date: "2027-12-25", companies: ["ambas"] }
    ]
  });
  const chezList = AppData.listRegisteredHolidays(CO).map((item) => item.name);
  const pengList = AppData.listRegisteredHolidays(PG).map((item) => item.name);
  assert(
    chezList.includes("Aniversário Chez") && !chezList.includes("Aniversário Pengold"),
    "Lista de Chez Pitu não mostra feriado exclusivo da Pengold"
  );
  assert(
    pengList.includes("Aniversário Pengold") && pengList.includes("Natal"),
    "Feriado 'ambas' aparece nas duas empresas"
  );
}

// ── 3. Merge do Firebase: união (feriado local de 2027 não some) ────────────
{
  const local = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] } },
    calendarHolidays: [
      { id: "cal-local-2027", name: "Corpus Christi", date: "2027-05-27", companies: [CO] }
    ]
  };
  const remote = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] } },
    calendarHolidays: [
      { id: "cal-remote-2026", name: "Ano Novo", date: "2026-01-01", companies: [CO] }
    ]
  };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  const names = (merged.calendarHolidays || []).map((item) => `${item.date}|${item.name}`);
  assert(
    names.includes("2027-05-27|Corpus Christi"),
    "Merge preserva o feriado de 2027 criado localmente (antes era descartado pelo remoto)"
  );
  assert(names.includes("2026-01-01|Ano Novo"), "Merge preserva o feriado que só existia no remoto");
}

// ── 4. Merge: exclusão definitiva continua vencendo ─────────────────────────
{
  const local = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] } },
    calendarHolidays: [],
    holidayTombstones: { __calendar__: { "2027-05-27|corpus christi": 9000 } }
  };
  const remote = {
    companies: { [CO]: { companyInfo: { legalName: CO }, holidays: [] } },
    calendarHolidays: [
      { id: "cal-remote", name: "Corpus Christi", date: "2027-05-27", companies: [CO] }
    ]
  };
  const merged = AppData.mergeRemoteIntoLocal(local, remote);
  assert(
    !(merged.calendarHolidays || []).some((item) => item.date === "2027-05-27"),
    "Merge por união não ressuscita feriado excluído definitivamente (tombstone vence)"
  );
}

// ── 5. Edição atinge calendário + empresa e preserva vínculos ───────────────
{
  setFixture({
    calendar: [{ id: "cal-e", name: "Feriado Teste", date: "2027-06-10", type: "interno", companies: [CO] }],
    chez: [
      {
        id: "h-e",
        name: "Feriado Teste",
        date: "2027-06-10",
        workedEmployees: [{ employeeId: "e1", compensationDate: "" }]
      }
    ]
  });

  const res = AppData.updateHolidayEverywhere(
    "2027-06-10",
    "Feriado Teste",
    { name: "Feriado Renomeado", date: "2027-06-11", type: "municipal" },
    { companies: [CO] }
  );
  assert(res.ok && res.changed, "updateHolidayEverywhere retorna ok/changed");

  const cal = AppData.state.calendarHolidays[0];
  assert(
    cal.name === "Feriado Renomeado" && cal.date === "2027-06-11" && cal.type === "municipal",
    "Calendário atualizado (nome, data e tipo)"
  );

  const holiday = AppData.state.companies[CO].holidays.find((item) => item.id === "h-e");
  assert(
    holiday && holiday.name === "Feriado Renomeado" && holiday.date === "2027-06-11",
    "Feriado da empresa atualizado com a mesma identidade"
  );
  assert(
    (holiday?.workedEmployees || []).length === 1 && holiday.workedEmployees[0].employeeId === "e1",
    "Vínculo do funcionário preservado na edição"
  );
  assert(
    AppData.listRegisteredHolidays(CO).length === 1,
    "Edição não cria linha duplicada na lista"
  );
}

// ── 5b. Edição de entrada compartilhada ("ambas") não afeta a outra empresa ─
{
  setFixture({
    calendar: [{ id: "cal-amb", name: "Feriado Comum", date: "2027-08-15", companies: ["ambas"] }],
    chez: [{ id: "h-amb-chez", name: "Feriado Comum", date: "2027-08-15", workedEmployees: [] }],
    pengold: [
      {
        id: "h-amb-peng",
        name: "Feriado Comum",
        date: "2027-08-15",
        workedEmployees: [{ employeeId: "p1" }]
      }
    ]
  });

  AppData.updateHolidayEverywhere(
    "2027-08-15",
    "Feriado Comum",
    { name: "Feriado Comum", date: "2027-08-16" },
    { companies: [CO] }
  );

  assert(
    AppData.state.companies[CO].holidays.some((item) => item.date === "2027-08-16"),
    "Edição aplica a nova data na empresa do escopo"
  );
  assert(
    AppData.state.companies[PG].holidays.some(
      (item) => item.date === "2027-08-15" && (item.workedEmployees || []).length === 1
    ),
    "Feriado e vínculo da outra empresa permanecem na data original"
  );
  const chezEntry = AppData.state.calendarHolidays.find((item) => item.date === "2027-08-16");
  const pengEntry = AppData.state.calendarHolidays.find((item) => item.date === "2027-08-15");
  assert(
    chezEntry?.companies.join(",") === CO && pengEntry?.companies.join(",") === PG,
    "Entrada compartilhada do calendário é dividida por empresa"
  );
}

// ── 6. Exclusão remove feriado + TODOS os vínculos da empresa do escopo ─────
{
  setFixture({
    calendar: [{ id: "cal-x", name: "Feriado X", date: "2027-09-07", companies: ["ambas"] }],
    chez: [
      {
        id: "h-x-chez",
        name: "Feriado X",
        date: "2027-09-07",
        workedEmployees: [{ employeeId: "e1" }, { employeeId: "e2" }]
      },
      { id: "h-keep", name: "Feriado Y", date: "2027-10-12", workedEmployees: [{ employeeId: "e3" }] }
    ],
    pengold: [
      { id: "h-x-peng", name: "Feriado X", date: "2027-09-07", workedEmployees: [{ employeeId: "p1" }] }
    ]
  });

  const counts = AppData.countHolidayLinksAllCompanies("2027-09-07", "Feriado X");
  assert(counts.total === 3, `Contagem prévia de vínculos por empresa (3, obtido ${counts.total})`);

  const res = AppData.removeHolidayEverywhere("2027-09-07", "Feriado X", { companies: [CO] });
  assert(
    res.ok && res.removedLinks === 2,
    `Exclusão remove os 2 vínculos da empresa do escopo (obtido ${res.removedLinks})`
  );
  assert(
    !AppData.state.companies[CO].holidays.some((item) => item.name === "Feriado X"),
    "Feriado e vínculos removidos da empresa do escopo"
  );
  assert(
    AppData.state.companies[PG].holidays.some(
      (item) => item.name === "Feriado X" && (item.workedEmployees || []).length === 1
    ),
    "Feriado e vínculo da OUTRA empresa preservados (sem dano colateral)"
  );
  const calX = AppData.state.calendarHolidays.find((item) => item.date === "2027-09-07");
  assert(
    calX && calX.companies.join(",") === PG,
    "Entrada compartilhada do calendário fica só com a outra empresa"
  );
  assert(
    AppData.state.companies[CO].holidays.some((item) => item.id === "h-keep"),
    "Outros feriados e seus vínculos não são afetados"
  );
  assert(
    AppData.isHolidayTombstoned(CO, "2027-09-07", "Feriado X") &&
      !AppData.isHolidayTombstoned("__calendar__", "2027-09-07", "Feriado X"),
    "Tombstone da empresa gravado; calendário sem tombstone (ainda vale p/ Pengold)"
  );
  assert(
    AppData.isWorkedLinkTombstoned(CO, "2027-09-07", "Feriado X", "e1"),
    "Tombstone de vínculo gravado (auto-vínculo da escala não recria)"
  );

  // Auto-sync do calendário não recria o feriado excluído
  AppData.syncCompanyHolidaysFromCalendarEntry(
    { name: "Feriado X", date: "2027-09-07", companies: ["ambas"] },
    { save: false }
  );
  assert(
    !AppData.state.companies[CO].holidays.some((item) => item.name === "Feriado X"),
    "Auto-sync do calendário não recria o feriado excluído"
  );

  // Excluindo também na outra empresa, a identidade sai do calendário de vez
  const res2 = AppData.removeHolidayEverywhere("2027-09-07", "Feriado X", { companies: [PG] });
  assert(
    res2.ok &&
      !AppData.state.calendarHolidays.some((item) => item.date === "2027-09-07") &&
      AppData.isHolidayTombstoned("__calendar__", "2027-09-07", "Feriado X"),
    "Excluída na última empresa, a entrada sai do calendário e ganha tombstone"
  );

  // E o merge remoto também não
  const merged = AppData.mergeRemoteIntoLocal(AppData.state, {
    companies: {
      [CO]: {
        companyInfo: { legalName: CO },
        holidays: [
          { id: "h-x-volta", name: "Feriado X", date: "2027-09-07", workedEmployees: [{ employeeId: "e1" }] }
        ]
      }
    },
    calendarHolidays: [{ id: "cal-x-volta", name: "Feriado X", date: "2027-09-07", companies: ["ambas"] }]
  });
  assert(
    !(merged.companies?.[CO]?.holidays || []).some((item) => item.name === "Feriado X") &&
      !(merged.calendarHolidays || []).some((item) => item.name === "Feriado X"),
    "Merge do Firebase não ressuscita o feriado excluído nem seus vínculos"
  );
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
process.exit(failed ? 1 : 0);
