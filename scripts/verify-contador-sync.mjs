/**
 * Validação focada: sincronização em tempo real dos LANÇAMENTOS do Contador.
 * Homologação temporária — não versionar.
 *
 * Reproduz o cenário do bug "Ad. Noturno do Carlos Andrey não reflete em outro PC":
 *   - PC B já possui um lançamento ANTIGO do funcionário (sem Ad. Noturno).
 *   - PC A edita o mesmo funcionário e adiciona Ad. Noturno (updatedAt mais novo).
 *   - O listener do PC B chama mergeRemoteIntoLocal(localB, remotoA).
 * Esperado (após a correção): vence o registro MAIS RECENTE → Ad. Noturno aparece.
 * Também valida o caso legado (sem updatedAt): mantém o local, sem regressão.
 *
 * Uso: node scripts/verify-contador-sync.mjs
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

function findCarlos(state, ym) {
  const arr = state.companies?.["Chez Pitu"]?.contadorLancamentos?.[ym] || [];
  return arr.find((l) => l.employeeId === "emp-carlos");
}

const AppData = loadAppData();
const YM = "2026-06";

console.log("\n=== TESTE: Sincronização do Contador (newer-wins) ===\n");

// PC B: cache local com lançamento ANTIGO do Carlos, sem Ad. Noturno.
const localB = {
  companies: {
    "Chez Pitu": {
      companyInfo: { legalName: "Chez Pitu" },
      employees: [{ id: "emp-carlos", name: "Carlos Andrey", status: "Ativo" }],
      contadorLancamentos: {
        [YM]: [{ employeeId: "emp-carlos", adNoturno: "00:00", horaExtra: "10:00", updatedAt: 1000 }]
      }
    }
  }
};

// PC A: edição recente — adicionou Ad. Noturno (updatedAt maior).
const remoteA = {
  companies: {
    "Chez Pitu": {
      companyInfo: { legalName: "Chez Pitu" },
      employees: [{ id: "emp-carlos", name: "Carlos Andrey", status: "Ativo" }],
      contadorLancamentos: {
        [YM]: [{ employeeId: "emp-carlos", adNoturno: "45:00", horaExtra: "10:00", updatedAt: 2000 }]
      }
    }
  }
};

const merged = AppData.mergeRemoteIntoLocal(localB, remoteA);
const carlos = findCarlos(merged, YM);

assert(!!carlos, "lançamento do Carlos presente após o merge");
assert(carlos && carlos.adNoturno === "45:00", "Ad. Noturno editado no PC A PREVALECE no PC B (45:00)");
assert(carlos && carlos.updatedAt === 2000, "vence o registro com updatedAt mais recente");

// Caso inverso: o local é mais novo que o remoto → mantém o local.
const localNewer = JSON.parse(JSON.stringify(localB));
localNewer.companies["Chez Pitu"].contadorLancamentos[YM][0] = {
  employeeId: "emp-carlos", adNoturno: "99:00", horaExtra: "10:00", updatedAt: 5000
};
const merged2 = AppData.mergeRemoteIntoLocal(localNewer, remoteA);
const carlos2 = findCarlos(merged2, YM);
assert(carlos2 && carlos2.adNoturno === "99:00", "edição local mais recente não é sobrescrita por remoto antigo");

// Legado: ambos sem updatedAt (registros antigos) → mantém o local (sem regressão).
const legacyLocal = {
  companies: { "Chez Pitu": { companyInfo: { legalName: "Chez Pitu" },
    employees: [{ id: "emp-carlos", name: "Carlos Andrey", status: "Ativo" }],
    contadorLancamentos: { [YM]: [{ employeeId: "emp-carlos", adNoturno: "01:00" }] } } }
};
const legacyRemote = {
  companies: { "Chez Pitu": { companyInfo: { legalName: "Chez Pitu" },
    employees: [{ id: "emp-carlos", name: "Carlos Andrey", status: "Ativo" }],
    contadorLancamentos: { [YM]: [{ employeeId: "emp-carlos", adNoturno: "02:00" }] } } }
};
const mergedLegacy = AppData.mergeRemoteIntoLocal(legacyLocal, legacyRemote);
const carlosLegacy = findCarlos(mergedLegacy, YM);
assert(carlosLegacy && carlosLegacy.adNoturno === "01:00", "registros legados sem updatedAt mantêm o local (sem regressão)");

console.log(`\n=== RESUMO === ${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
