/**
 * Runner das suítes de validação do projeto (`npm run validate`).
 *
 * Motivo: a cadeia anterior era `node a.mjs && node b.mjs && ...`. Bastava a
 * PRIMEIRA suíte falhar para todas as seguintes nem chegarem a rodar — o que
 * escondia o estado real do projeto (uma fixture vencida em
 * run-functional-validation.mjs mascarou as outras quatro suítes por dias).
 *
 * Aqui TODAS as suítes rodam sempre, cada uma em seu processo, com a saída
 * completa preservada. No fim é impresso um resumo e o código de saída é 1 se
 * qualquer suíte falhou — o portão de qualidade continua valendo.
 *
 * Uso:
 *   node scripts/run-validate.mjs              → roda todas as suítes
 *   node scripts/run-validate.mjs feriado vt   → roda só as que casam com os termos
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Suítes na ordem de execução. `name` é o rótulo do resumo.
 * Ao criar um novo `scripts/verify-*.mjs`, acrescente-o aqui — fora desta lista
 * o script apodrece sem ninguém notar (foi o que aconteceu com
 * verify-tombstones-sync.mjs, quebrado por uma regra nova por várias semanas).
 */
const SUITES = [
  { name: "Validação funcional (regras de negócio)", script: "scripts/run-functional-validation.mjs" },
  { name: "Recuperação offline", script: "scripts/test-offline-recovery.mjs" },
  { name: "Deduplicação de feriados", script: "scripts/test-holiday-deduplication.mjs" },
  { name: "Quota de armazenamento", script: "scripts/test-storage-quota.mjs" },
  { name: "Feriados — lista completa/editar/excluir", script: "scripts/verify-feriados-todos-anos.mjs" },
  { name: "Feriados — exclusão definitiva", script: "scripts/verify-exclusao-feriado-definitiva.mjs" },
  { name: "Feriados — vínculos retroativos", script: "scripts/verify-feriados-retroativos.mjs" },
  { name: "Feriados — auto-vínculo não nasce Vencido", script: "scripts/verify-auto-vinculo-vencido-guard.mjs" },
  { name: "Vínculo manual de funcionário", script: "scripts/verify-vinculo-manual.mjs" },
  { name: "Vínculo — tombstone de exclusão", script: "scripts/verify-vinculo-tombstone.mjs" },
  { name: "Tombstones em todos os módulos", script: "scripts/verify-tombstones-sync.mjs" },
  { name: "Sincronização newer-wins", script: "scripts/verify-sync-newer-wins.mjs" },
  { name: "Exclusão de funcionário em 24h", script: "scripts/verify-exclusao-24h.mjs" },
  { name: "Funcionário inativo na escala", script: "scripts/verify-inativo-escala.mjs" },
  { name: "Inativos — visibilidade e data de desligamento", script: "scripts/verify-inativos-visibilidade.mjs" },
  { name: "Inativos — seletor no navegador", script: "scripts/verify-inativos-picker-ui.mjs" },
  { name: "Contador — sincronização", script: "scripts/verify-contador-sync.mjs" },
  { name: "Auditoria de status", script: "scripts/verify-auditoria-status.mjs" },
  { name: "Impressão da escala", script: "scripts/verify-print-escala.mjs" }
];

/**
 * Guarda contra apodrecimento: avisa se existe um scripts/verify-*.mjs que
 * ninguém cadastrou em SUITES (não reprova a validação, só alerta).
 */
function warnAboutOrphanSuites() {
  const known = new Set(SUITES.map((suite) => path.basename(suite.script)));
  const orphans = fs
    .readdirSync(path.join(root, "scripts"))
    .filter((file) => /^verify-.*\.mjs$/.test(file) && !known.has(file));
  if (!orphans.length) return;
  console.warn(
    `\n⚠ Suíte(s) fora do npm run validate (adicione em SUITES de scripts/run-validate.mjs):`
  );
  orphans.forEach((file) => console.warn(`   - scripts/${file}`));
}

const filters = process.argv.slice(2).map((term) => term.toLocaleLowerCase("pt-BR"));
const selected = filters.length
  ? SUITES.filter((suite) =>
      filters.some(
        (term) =>
          suite.name.toLocaleLowerCase("pt-BR").includes(term) ||
          suite.script.toLocaleLowerCase("pt-BR").includes(term)
      )
    )
  : SUITES;

if (!selected.length) {
  console.error(`Nenhuma suíte casa com: ${filters.join(", ")}`);
  console.error(`Disponíveis:\n${SUITES.map((suite) => `  - ${suite.script}`).join("\n")}`);
  process.exit(1);
}

const results = [];

for (const suite of selected) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`▶ ${suite.name}  (${suite.script})`);
  console.log("═".repeat(70));

  const startedAt = Date.now();
  const run = spawnSync(process.execPath, [path.join(root, suite.script)], {
    cwd: root,
    stdio: "inherit"
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  // Falha de processo (crash/sinal) também conta como suíte reprovada.
  const code = run.status === null ? 1 : run.status;
  results.push({ ...suite, code, seconds, signal: run.signal || "" });
}

const failed = results.filter((result) => result.code !== 0);

console.log(`\n${"═".repeat(70)}`);
console.log("RESUMO DA VALIDAÇÃO");
console.log("═".repeat(70));
results.forEach((result) => {
  const mark = result.code === 0 ? "✓" : "✗";
  const extra = result.code === 0 ? "" : ` — saiu com ${result.signal || `código ${result.code}`}`;
  console.log(`  ${mark} ${result.name} (${result.seconds}s)${extra}`);
  if (result.code !== 0) console.log(`      ${result.script}`);
});

console.log(
  `\n${results.length} suíte(s): ${results.length - failed.length} aprovada(s), ${failed.length} com falha.`
);

if (!filters.length) warnAboutOrphanSuites();

if (failed.length) {
  console.error("\nValidação REPROVADA. Rode a suíte isolada para ver o detalhe:");
  failed.forEach((result) => console.error(`  node ${result.script}`));
  process.exit(1);
}

console.log("\nValidação APROVADA — todas as suítes passaram.\n");
