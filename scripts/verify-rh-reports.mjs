/**
 * Validação: relatórios PDF de Cargos e Salários e Quadro de Vagas
 * (js/rh-reports.js). Fixtures em memória (vm) — nunca toca a base real.
 *
 * Cobre: seções escolhidas; dados por empresa; insalubridade com base e valor;
 * folha estimada; inativos opcionais; vagas concluídas opcionais; texto do
 * usuário escapado (sem injeção de HTML); somente leitura (estado idêntico).
 *
 * Uso: node scripts/verify-rh-reports.mjs
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

const store = {};
const ctx = {
  window: {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  console, setTimeout, clearTimeout, queueMicrotask: (fn) => fn(),
  Date, JSON, Math, Object, Array, Set, Map, String, Number, parseInt, parseFloat, isNaN, undefined, navigator: { onLine: true }
};
ctx.window = ctx;
const sb = vm.createContext(ctx);
for (const file of ["js/import-utils.js", "js/data.js", "js/rh-catalog.js", "js/rh-reports.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sb, { filename: file });
}
const { AppData, RhCatalog, RhReports } = sb;
const CO = "Chez Pitu";
const PG = "Pengold";

const co = AppData.getCompanyData(CO);
co.companyInfo.legalName = "Chez Pitu Hotelaria Ltda";
co.companyInfo.cnpj = "12345678000190";
["cargos", "comissoes", "vagas", "candidatos", "admissoes"].forEach((c) => { co[c] = []; AppData.getCompanyData(PG)[c] = []; });
const limp = RhCatalog.saveCargo(CO, { name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "40", insalubridadeBase: "1.518,00", commissions: ["walk-in"], notes: "Obs <script>alert(1)</script>" }).cargo;
const recep = RhCatalog.saveCargo(CO, { name: "Recepcionista", cbo: "4221-05", salary: "2000" }).cargo;
RhCatalog.saveComissao(CO, { id: "walk-in", name: "Walk-in", description: "5% da diária <b>sem reserva</b>" });
co.employees = [
  { id: "e1", name: "Ana Limpeza", role: limp.name, roleId: limp.id, department: "Governança", status: "Ativo", admissionDate: "2024-01-10" },
  { id: "e2", name: "Bia Limpeza", role: limp.name, roleId: limp.id, department: "Governança", status: "Inativo", deactivatedAt: "2026-10-01", admissionDate: "2023-01-10" },
  { id: "e3", name: "Caio Recepção", role: "recepcionista", department: "Recepção", status: "Ativo", admissionDate: "2025-05-01" },
  { id: "e4", name: "Davi Legado", role: "Lavanderia", department: "Lavanderia", status: "Ativo", admissionDate: "2025-05-01" }
];
const vAberta = RhCatalog.saveVaga(CO, { cargoId: recep.id, department: "Recepção", quantity: 2, status: "Entrevistas", priority: "Urgente", notes: "Turno <i>noite</i>" });
RhCatalog.saveVaga(CO, { cargoId: limp.id, department: "Governança", quantity: 1, status: "Concluída" });
RhCatalog.saveCandidato(CO, { vagaId: vAberta.id, name: "João Candidato", contact: "(22) 99999-0000", situation: "Agendado" });
RhCatalog.saveAdmissao(CO, { name: "Mariana Admitida", vagaId: vAberta.id, situation: "Iniciou", date: "2026-11-18" });
RhCatalog.saveCargo(PG, { name: "Garçom Pengold", cbo: "5134-05", salary: "1700" });

const snapshot = JSON.stringify(AppData.state);

console.log("[1] Cargos e Salários — todas as seções");
const all = RhReports.buildCargosReportHTML(CO, { today: "2026-11-22" });
assert(all.includes("<title>Cargos e Salários</title>") && all.includes("Chez Pitu Hotelaria Ltda") && all.includes("12.345.678/0001-90"), "cabeçalho com razão social e CNPJ formatado");
assert(all.includes("Funções e salários") && all.includes("Comissões") && all.includes("Funcionários por função"), "três seções");
assert(all.includes("Auxiliar de Limpeza") && all.includes("5143-20") && all.includes("40% (grau máximo)"), "função, CBO e insalubridade");
assert(/607,20/.test(all) && /1\.518,00/.test(all), "valor da insalubridade (40% de R$ 1.518,00 = R$ 607,20) e base");
assert(!all.includes("Garçom Pengold"), "não mistura funções da outra empresa");
assert(/folha estimada[^<]*4\.207,20/.test(all), "folha estimada dos ativos = (1.600 + 607,20) + 2.000");
assert(all.includes("Ana Limpeza") && !all.includes("Bia Limpeza"), "sem inativos por padrão");
assert(all.includes("Caio Recepção") && all.includes("Davi Legado") && all.includes("fora de Cargos e Salários"), "legado pelo nome e cargo fora do catálogo aparecem");
assert(/2\.207,20/.test(all), "salário + insalubridade por funcionário");

console.log("[2] Escape e opções");
assert(!all.includes("<script>alert(1)</script>") && all.includes("&lt;script&gt;"), "observação com HTML é escapada");
assert(!all.includes("<b>sem reserva</b>") && all.includes("&lt;b&gt;sem reserva"), "explicação da comissão escapada");
const onlyCom = RhReports.buildCargosReportHTML(CO, { sections: ["comissoes"] });
assert(onlyCom.includes("Walk-in") && !onlyCom.includes("Funcionários por função") && !onlyCom.includes("<th style=\"width:24%\">Função</th>"), "só a seção escolhida");
const withInactive = RhReports.buildCargosReportHTML(CO, { sections: ["funcionarios"], includeInactive: true });
assert(withInactive.includes("Bia Limpeza") && withInactive.includes("Inativo desde 01/10/2026"), "inativos quando pedido, com data de desligamento");

console.log("[3] Quadro de Vagas");
const vg = RhReports.buildVagasReportHTML(CO, { today: "2026-11-22" });
assert(vg.includes('<body class="landscape">') && vg.includes("Painel RH") && vg.includes("Recrutamento e Seleção") && vg.includes("Admissões"), "paisagem com as seções");
assert(vg.includes("Recepcionista") && vg.includes("CBO 4221-05") && vg.includes("Urgente"), "vaga com CBO e prioridade");
assert(!vg.includes("Governança</td>"), "vaga concluída oculta por padrão");
assert(RhReports.buildVagasReportHTML(CO, { sections: ["vagas"], includeClosed: true }).includes("Concluída"), "concluídas quando pedido");
assert(vg.includes("João Candidato") && vg.includes("Mariana Admitida") && vg.includes("1 admitido(s)"), "candidato, admissão e admitidos da vaga");
assert(!vg.includes("<i>noite</i>") && vg.includes("&lt;i&gt;noite"), "observação da vaga escapada");
assert(RhReports.buildVagasReportHTML(PG, {}).includes("Nenhuma vaga"), "outra empresa sem vagas");

console.log("[4] Somente leitura");
assert(JSON.stringify(AppData.state) === snapshot, "montar relatórios não altera nada");

console.log(`\nResultado: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
