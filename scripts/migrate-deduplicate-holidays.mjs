/**
 * MIGRAÇÃO: Deduplicação de Feriados
 *
 * Script para detectar e corrigir feriados duplicados em dados existentes.
 * Executa ao carregar o app (opcional, pode ser triggers manual).
 *
 * Uso: node scripts/migrate-deduplicate-holidays.mjs
 */

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    _dump() {
      return store;
    }
  };
}

function loadAppData(storage, navigator) {
  const context = {
    window: {},
    localStorage: storage,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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
    navigator
  };
  context.window = context;
  const sandbox = vm.createContext(context);

  for (const file of ["js/import-utils.js", "js/data.js"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }

  return sandbox;
}

function runMigration() {
  console.log("\n=== MIGRAÇÃO: Deduplicação de Feriados ===\n");

  const navigator = { onLine: true };
  const storage = createStorage();
  const app = loadAppData(storage, navigator);
  const AppData = app.AppData;

  console.log("Analisando dados existentes...\n");

  // Calendário global (state.calendarHolidays) — dedup por nome + data, unindo empresas.
  const calendarChanged = AppData.dedupeCalendarHolidays(AppData.state);
  if (calendarChanged) {
    AppData.saveState();
    console.log("✓ Calendário global deduplicado (feriados repetidos mesclados).\n");
  }

  // Registros por empresa (data.holidays) — preserva vínculos compensados/agendados e CO.
  const results = AppData.deduplicateAllHolidays({ save: true });

  if (Object.keys(results).length === 0) {
    if (!calendarChanged) {
      console.log("✓ Nenhuma duplicata encontrada. Sistema já está limpo!");
    }
    return;
  }

  console.log("Duplicatas corrigidas por empresa:\n");
  let totalMerged = 0;
  Object.entries(results).forEach(([company, data]) => {
    console.log(`${company}:`);
    console.log(`  Mesclados: ${data.merged}`);
    if (data.details.length > 0) {
      data.details.forEach((detail) => {
        console.log(`    - ${detail.date} ${detail.name}: manteve ${detail.keptCount} funcionário(s)`);
      });
    }
    totalMerged += data.merged;
  });

  console.log(`\nTotal de duplicatas corrigidas: ${totalMerged}`);
  console.log("\n✓ Migração concluída com sucesso!");
  console.log("  Use 'npm run validate' para verificar integridade.\n");
}

runMigration();
