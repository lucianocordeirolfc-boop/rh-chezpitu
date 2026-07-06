/**
 * Validação focada: propagação de EXCLUSÕES (tombstones) entre PCs.
 * Homologação temporária — não versionar.
 *
 * Reproduz, para cada coleção por id, o cenário "registro excluído em um PC deve
 * sumir no outro PC que ainda o tinha", exercitando o merge real
 * (AppData.mergeRemoteIntoLocal) usado pelo listener em tempo real do Firebase.
 *
 * Cobre:
 *  - funcionários, férias e ausências: exclusão via tombstone (deletedAt);
 *  - "edição depois da exclusão prevalece" (updatedAt > deletedAt mantém o registro);
 *  - feriados: soft-delete (isDeleted) propaga via newer-wins;
 *  - cascata: excluir funcionário tomba também suas férias/ausências (funcional);
 *  - regressão: sem tombstones, nada é removido.
 *
 * Uso: node scripts/verify-tombstones-sync.mjs
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
const co = (block) => ({ companies: { [CO]: { companyInfo: { legalName: CO }, ...block } } });
const getCo = (s) => s.companies?.[CO] || {};
const tomb = (collection, ids) => ({ tombstones: { [collection]: { [CO]: ids } } });

console.log("\n=== TESTE: tombstones (exclusões) em todos os módulos ===\n");

// ── Funcionário: exclusão remota propaga ─────────────────────────────────────
{
  const local = co({ employees: [{ id: "e1", name: "Carlos Andrey", updatedAt: 1000 }] });
  const remote = { ...co({ employees: [] }), ...tomb("employees", { e1: 2000 }) };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const exists = (getCo(m).employees || []).some((e) => e.id === "e1");
  assert(!exists, "Funcionário: exclusão feita em outro PC remove o registro no merge");
}

// ── Funcionário: edição DEPOIS da exclusão prevalece (sem ressuscitar exclusão) ─
{
  const local = co({ employees: [{ id: "e1", name: "Carlos (reeditado)", updatedAt: 5000 }] });
  const remote = { ...co({ employees: [] }), ...tomb("employees", { e1: 2000 }) };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const e = (getCo(m).employees || []).find((x) => x.id === "e1");
  assert(e && e.name === "Carlos (reeditado)", "Funcionário: edição mais recente que a exclusão mantém o registro");
  const stillTombed = Number(m.tombstones?.employees?.[CO]?.e1) || 0;
  assert(!stillTombed, "Funcionário: tombstone obsoleto é descartado após reedição");
}

// ── Férias: exclusão remota propaga ──────────────────────────────────────────
{
  const local = co({ vacations: [{ id: "v1", employeeId: "e1", startDate: "2026-06-10", endDate: "2026-06-15", updatedAt: 1000 }] });
  const remote = { ...co({ vacations: [] }), ...tomb("vacations", { v1: 2000 }) };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  assert(!(getCo(m).vacations || []).some((v) => v.id === "v1"), "Férias: exclusão em outro PC remove o registro no merge");
}

// ── Ausências: exclusão remota propaga ───────────────────────────────────────
{
  const local = co({ absences: [{ id: "a1", employeeId: "e1", type: "Falta", startDate: "2026-06-01", endDate: "2026-06-02", updatedAt: 1000 }] });
  const remote = { ...co({ absences: [] }), ...tomb("absences", { a1: 2000 }) };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  assert(!(getCo(m).absences || []).some((a) => a.id === "a1"), "Ausência: exclusão em outro PC remove o registro no merge");
}

// ── União de tombstones: deletedAt mais recente prevalece (não ressuscita) ────
{
  const local = { ...co({ employees: [{ id: "e1", name: "X", updatedAt: 1500 }] }), ...tomb("employees", { e1: 1000 }) };
  const remote = { ...co({ employees: [] }), ...tomb("employees", { e1: 3000 }) };
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  assert(!(getCo(m).employees || []).some((e) => e.id === "e1"), "Tombstone: exclusão (3000) vence registro local antigo (1500)");
}

// ── Feriados: soft-delete (isDeleted) propaga via newer-wins ──────────────────
{
  const local = co({ holidays: [{ id: "h1", name: "Corpus", date: "2026-06-04", updatedAt: 1000 }] });
  const remote = co({ holidays: [{ id: "h1", name: "Corpus", date: "2026-06-04", updatedAt: 2000, isDeleted: true, deletedAt: "2026-06-20" }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const h = (getCo(m).holidays || []).find((x) => x.id === "h1");
  assert(h && h.isDeleted === true, "Feriado: soft-delete mais recente prevalece no merge (isDeleted)");
}

// ── Regressão: sem tombstones, nada é removido ───────────────────────────────
{
  const local = co({ employees: [{ id: "e1", name: "X", updatedAt: 1000 }] });
  const remote = co({ employees: [{ id: "e2", name: "Y", updatedAt: 1000 }] });
  const m = AppData.mergeRemoteIntoLocal(local, remote);
  const ids = (getCo(m).employees || []).map((e) => e.id).sort();
  assert(ids.join(",") === "e1,e2", "Regressão: sem tombstones, união normal preserva todos os registros");
}

// ── Funcional: removeEmployee tomba em cascata férias e ausências ─────────────
{
  AppData.state.companies[CO].employees = [{ id: "e9", name: "Cascata", status: "Ativo", updatedAt: 1 }];
  AppData.state.companies[CO].vacations = [{ id: "v9", employeeId: "e9", startDate: "2026-06-10", endDate: "2026-06-12", updatedAt: 1 }];
  AppData.state.companies[CO].absences = [{ id: "a9", employeeId: "e9", type: "Falta", startDate: "2026-06-01", endDate: "2026-06-01", updatedAt: 1 }];

  AppData.removeEmployee("e9", CO);

  const t = AppData.state.tombstones || {};
  assert(Number(t.employees?.[CO]?.e9) > 0, "Funcional: removeEmployee cria tombstone do funcionário");
  assert(Number(t.vacations?.[CO]?.v9) > 0, "Funcional: cascata cria tombstone das férias do funcionário");
  assert(Number(t.absences?.[CO]?.a9) > 0, "Funcional: cascata cria tombstone das ausências do funcionário");
  assert(!(AppData.state.companies[CO].employees || []).some((e) => e.id === "e9"), "Funcional: funcionário removido do array local");
}

// ── Funcional: removeVacation registra tombstone ─────────────────────────────
{
  AppData.state.companies[CO].vacations = [{ id: "v10", employeeId: "e1", startDate: "2026-06-10", endDate: "2026-06-12", updatedAt: 1 }];
  AppData.removeVacation("v10", CO);
  assert(Number(AppData.state.tombstones?.vacations?.[CO]?.v10) > 0, "Funcional: removeVacation cria tombstone");
  assert(!(AppData.state.companies[CO].vacations || []).some((v) => v.id === "v10"), "Funcional: férias removidas do array local");
}

console.log(`\n=== RESUMO === ${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
