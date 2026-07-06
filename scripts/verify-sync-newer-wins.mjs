/**
 * Validação focada: sincronização instantânea (newer-wins) em TODOS os módulos.
 * Homologação temporária — não versionar.
 *
 * Reproduz, para cada tipo de registro, o cenário "edição em outro PC deve
 * prevalecer no PC que já tinha um valor antigo", exercitando o merge real
 * (AppData.mergeRemoteIntoLocal) usado pelo listener em tempo real do Firebase.
 *
 * Cobre: funcionários, ausências, férias, feriados (campo-base), lançamentos do
 * Contador, escala manual (mapa+meta) e Vale-transporte (descontos/valores).
 * Também valida que registros legados (sem updatedAt/meta) mantêm o local.
 *
 * Uso: node scripts/verify-sync-newer-wins.mjs
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

function loadAppData() {
  const ctx = {
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console, setTimeout, clearTimeout, Date, JSON, Math, Object, Array, Set, Map,
    String, Number, parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
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
const YM = "2026-06";
const co = (block) => ({ companies: { [CO]: { companyInfo: { legalName: CO }, ...block } } });
const getCo = (s) => s.companies?.[CO] || {};

console.log("\n=== TESTE: newer-wins em todos os módulos ===\n");

// ── Funcionários ────────────────────────────────────────────────────────────
{
  const local = co({ employees: [{ id: "e1", name: "Carlos Andrey", role: "Garçom", updatedAt: 1000 }] });
  const remote = co({ employees: [{ id: "e1", name: "Carlos Andrey", role: "Maître", updatedAt: 2000 }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const e = getCo(m).employees.find((x) => x.id === "e1");
  assert(e && e.role === "Maître", "Funcionário: edição remota mais recente prevalece (cargo Maître)");

  const m2 = AppData.mergeRemoteIntoLocal(
    co({ employees: [{ id: "e1", name: "Carlos", role: "Gerente", updatedAt: 9000 }] }),
    remote
  );
  assert(getCo(m2).employees.find((x) => x.id === "e1").role === "Gerente", "Funcionário: local mais novo não é sobrescrito");
}

// ── Ausências ────────────────────────────────────────────────────────────────
{
  const local = co({ absences: [{ id: "a1", employeeId: "e1", type: "Atestado médico", startDate: "2026-06-01", endDate: "2026-06-02", updatedAt: 1000 }] });
  const remote = co({ absences: [{ id: "a1", employeeId: "e1", type: "Falta", startDate: "2026-06-01", endDate: "2026-06-03", updatedAt: 2000 }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const a = getCo(m).absences.find((x) => x.id === "a1");
  assert(a && a.type === "Falta" && a.endDate === "2026-06-03", "Ausência: edição remota mais recente prevalece");
}

// ── Férias ───────────────────────────────────────────────────────────────────
{
  const local = co({ vacations: [{ id: "v1", employeeId: "e1", startDate: "2026-06-10", endDate: "2026-06-15", updatedAt: 1000 }] });
  const remote = co({ vacations: [{ id: "v1", employeeId: "e1", startDate: "2026-06-10", endDate: "2026-06-20", updatedAt: 2000 }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const v = getCo(m).vacations.find((x) => x.id === "v1");
  assert(v && v.endDate === "2026-06-20", "Férias: edição remota mais recente prevalece (fim 20)");
}

// ── Feriados (campo-base) + união de vínculos ───────────────────────────────
{
  const emps = [{ id: "e1", name: "Carlos", status: "Ativo" }, { id: "e2", name: "Ana", status: "Ativo" }];
  const local = co({ employees: emps, holidays: [{ id: "h1", name: "Corpus", date: "2026-06-04", updatedAt: 1000, workedEmployees: [{ employeeId: "e1", status: "Pendente" }] }] });
  const remote = co({ employees: emps, holidays: [{ id: "h1", name: "Corpus Christi", date: "2026-06-04", updatedAt: 2000, workedEmployees: [{ employeeId: "e2", status: "Pendente" }] }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const h = getCo(m).holidays.find((x) => x.id === "h1");
  assert(h && h.name === "Corpus Christi", "Feriado: nome editado no PC remoto prevalece (newer-wins)");
  const ids = (h.workedEmployees || []).map((w) => w.employeeId).sort();
  assert(ids.join(",") === "e1,e2", "Feriado: vínculos de funcionários permanecem por UNIÃO (e1+e2)");
}

// ── Lançamentos do Contador ──────────────────────────────────────────────────
{
  const local = co({ contadorLancamentos: { [YM]: [{ employeeId: "e1", adNoturno: "00:00", updatedAt: 1000 }] } });
  const remote = co({ contadorLancamentos: { [YM]: [{ employeeId: "e1", adNoturno: "45:00", updatedAt: 2000 }] } });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const l = getCo(m).contadorLancamentos[YM].find((x) => x.employeeId === "e1");
  assert(l && l.adNoturno === "45:00", "Contador: Ad. Noturno remoto mais recente prevalece");
}

// ── Escala manual (mapa + meta) ──────────────────────────────────────────────
{
  const key = "e1|2026-06-07";
  const local = co({ manualScale: { [key]: "FOLGA" }, manualScaleMeta: { [key]: 1000 } });
  const remote = co({ manualScale: { [key]: "ATESTADO" }, manualScaleMeta: { [key]: 2000 } });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  assert(getCo(m).manualScale[key] === "ATESTADO", "Escala manual: código remoto mais recente prevalece");

  // legado sem meta → mantém local
  const mLeg = AppData.mergeRemoteIntoLocal(
    co({ manualScale: { [key]: "FOLGA" } }),
    co({ manualScale: { [key]: "ATESTADO" } })
  );
  assert(getCo(mLeg).manualScale[key] === "FOLGA", "Escala manual: sem meta (legado) mantém o local");

  // chave nova só no remoto → propaga
  const mNew = AppData.mergeRemoteIntoLocal(
    co({ manualScale: {} }),
    co({ manualScale: { "e1|2026-06-09": "FÉRIAS" }, manualScaleMeta: { "e1|2026-06-09": 2000 } })
  );
  assert(getCo(mNew).manualScale["e1|2026-06-09"] === "FÉRIAS", "Escala manual: chave nova do remoto propaga");
}

// ── Vale-transporte: descontos (dias) e valores (R$) ─────────────────────────
{
  const key = "e1|2026-06";
  const local = {
    valeTransporte: {
      selectedYearMonth: YM,
      deductionDays: { [CO]: { [key]: 1 } }, deductionDaysMeta: { [CO]: { [key]: 1000 } },
      discountValues: { [CO]: { [key]: 10 } }, discountValuesMeta: { [CO]: { [key]: 1000 } }
    }
  };
  const remote = {
    valeTransporte: {
      selectedYearMonth: YM,
      deductionDays: { [CO]: { [key]: 3 } }, deductionDaysMeta: { [CO]: { [key]: 2000 } },
      discountValues: { [CO]: { [key]: 25 } }, discountValuesMeta: { [CO]: { [key]: 2000 } }
    }
  };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  assert(m.valeTransporte.deductionDays[CO][key] === 3, "VT descontos: edição remota mais recente prevalece (3 dias)");
  assert(m.valeTransporte.discountValues[CO][key] === 25, "VT valores: edição remota mais recente prevalece (R$25)");

  // local mais novo não é sobrescrito
  const local2 = JSON.parse(JSON.stringify(local));
  local2.valeTransporte.deductionDays[CO][key] = 5;
  local2.valeTransporte.deductionDaysMeta[CO][key] = 9000;
  const m2 = AppData.mergeRemoteIntoLocal(local2, remote);
  assert(m2.valeTransporte.deductionDays[CO][key] === 5, "VT descontos: local mais recente não é sobrescrito");
}

console.log(`\n=== RESUMO === ${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
