/**
 * Validação: QUADRO DE VAGAS (2026-11-22).
 *
 * Fixtures em memória (vm) — nunca toca a base real. Cobre:
 *  - vaga com a função de Cargos e Salários (nome/CBO vêm da função);
 *  - candidatos (R&S) e admissões ligados à vaga;
 *  - Painel RH calculado das tabelas (sem gravar nada);
 *  - separação por empresa;
 *  - exclusão vai para a Lixeira (vaga, candidato, admissão) e restaura;
 *  - merge entre PCs e transporte no Firebase (ferias/{empresa}.__rh).
 *
 * Uso: node scripts/verify-quadro-vagas.mjs
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
const sb = vm.createContext(ctx);
for (const file of ["js/import-utils.js", "js/data.js", "js/firebase-sync.js", "js/rh-catalog.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sb, { filename: file });
}
const { AppData, RhCatalog, FirebaseSync } = sb;
const CO = "Chez Pitu";
const PG = "Pengold";
const clone = (v) => JSON.parse(JSON.stringify(v));

["vagas", "candidatos", "admissoes", "cargos"].forEach((col) => {
  AppData.getCompanyData(CO)[col] = [];
  AppData.getCompanyData(PG)[col] = [];
});
const employeesBefore = JSON.stringify(AppData.getCompanyData(CO).employees);

console.log("[1] Vaga com função de Cargos e Salários");
const recep = RhCatalog.saveCargo(CO, { name: "Recepcionista", cbo: "4221-05", salary: "1900" }).cargo;
const manut = RhCatalog.saveCargo(CO, { name: "Manutencionista", cbo: "5143-25", salary: "1800" }).cargo;
let threw = false;
try { RhCatalog.saveVaga(CO, { quantity: 1 }); } catch (e) { threw = /cargo/i.test(e.message); }
assert(threw, "vaga sem função é recusada");
const v1 = RhCatalog.saveVaga(CO, { cargoId: recep.id, department: "Recepção", quantity: "2", contractType: "CLT (fixo)", reason: "Escala 5x2", openDate: "2026-11-11", priority: "Urgente", status: "Aberta", manager: "Luciano", notes: "Folguista 06h–15:20 e 13h–22:20" });
assert(v1.role === "Recepcionista" && v1.cargoId === recep.id && v1.quantity === 2, "nome da vaga vem da função; quantidade numérica");
const vp = RhCatalog.saveVaga(CO, { cargoId: recep.id, quantity: 1, escolaridade: "Ensino médio completo", atribuicoes: " Atender hóspedes\nCheck-in ", requisitosObrigatorios: "Ensino médio", requisitosDesejaveis: "Inglês", requisitosDiferenciais: "Espanhol", openDate: "2026-11-20" });
assert(vp.escolaridade === "Ensino médio completo" && vp.atribuicoes === "Atender hóspedes\nCheck-in" && vp.requisitosObrigatorios === "Ensino médio" && vp.requisitosDesejaveis === "Inglês" && vp.requisitosDiferenciais === "Espanhol", "escolaridade, atribuições e requisitos gravados (texto aparado, quebras mantidas)");
assert(RhCatalog.ESCOLARIDADES.includes("Ensino superior completo") && RhCatalog.ESCOLARIDADES[0] === "Não exigida", "lista de escolaridade");
const sug = RhCatalog.lastVagaPerfil(CO, recep.id);
assert(sug && sug.atribuicoes === "Atender hóspedes\nCheck-in" && sug.escolaridade === "Ensino médio completo", "perfil da última vaga da função para sugestão");
assert(RhCatalog.lastVagaPerfil(CO, manut.id) === null, "função sem vaga anterior não sugere nada");
RhCatalog.removeVaga(CO, vp.id);
const v2 = RhCatalog.saveVaga(CO, { cargoId: manut.id, department: "Manutenção", quantity: 1, status: "Suspensa", priority: "Normal" });
const v3 = RhCatalog.saveVaga(CO, { cargoId: manut.id, department: "Manutenção", quantity: 1, status: "Concluída" });
const v4 = RhCatalog.saveVaga(CO, { cargoId: recep.id, quantity: 3, status: "Cancelada" });
const vx = RhCatalog.saveVaga(CO, { cargoId: recep.id, quantity: 1, status: "Inventado" });
assert(vx.status === "Aberta", "status fora da lista vira Aberta");
assert(!JSON.stringify(vx).includes("undefined"), "registro sem undefined");
const v1e = RhCatalog.saveVaga(CO, { ...v1, status: "Entrevistas" });
assert(v1e.id === v1.id && v1e.createdAt === v1.createdAt && v1e.status === "Entrevistas", "editar mantém id/createdAt");
assert(RhCatalog.listRecords(CO, "vagas").length === 5, "edição não duplica");
const blockedCargo = RhCatalog.removeCargo(CO, recep.id);
assert(!blockedCargo.ok && /vaga/.test(blockedCargo.error), "função com vaga em andamento não se exclui");

console.log("[2] Candidatos e admissões");
const c1 = RhCatalog.saveCandidato(CO, { vagaId: v1.id, name: "João Teste", contact: "(21) 90000-0000", situation: "Agendado", date: "2026-11-17" });
const c2 = RhCatalog.saveCandidato(CO, { vagaId: v1.id, name: "Paulo Teste", situation: "Reprovado", feedbackSent: true });
assert(c1.vagaLabel === "Recepcionista · Recepção" && c2.feedbackSent === true, "candidato guarda a vaga e o feedback");
let threwC = false;
try { RhCatalog.saveCandidato(CO, { vagaId: v1.id, name: " " }); } catch (_) { threwC = true; }
assert(threwC, "candidato sem nome é recusado");
const a1 = RhCatalog.saveAdmissao(CO, { name: "Cleyton Teste", vagaId: v1.id, situation: "Iniciou", date: "2026-11-18" });
const a2 = RhCatalog.saveAdmissao(CO, { name: "Ryan Teste", cargoId: manut.id, situation: "Agendar exame" });
assert(a1.cargoId === recep.id && a1.role === "Recepcionista", "admissão herda a função da vaga");
assert(a2.role === "Manutencionista", "admissão com função escolhida");
assert(RhCatalog.admittedForVaga(CO, v1.id) === 1, "admitidos da vaga = admissões 'Iniciou'");

console.log("[3] Painel RH");
const snapshot = JSON.stringify(AppData.state.companies);
const p = RhCatalog.computePanel(CO);
assert(JSON.stringify(AppData.state.companies) === snapshot, "painel não grava nada");
assert(p.vagasCadastradas === 5 && p.vagasEmAndamento === 3 && p.vagasConcluidas === 1, `vagas: 5 cadastradas, 3 em andamento, 1 concluída (${p.vagasCadastradas}/${p.vagasEmAndamento}/${p.vagasConcluidas})`);
assert(p.posicoesPrevistas === 5, `posições previstas sem canceladas = 2+1+1+1 (${p.posicoesPrevistas})`);
assert(p.posicoesEmAberto === 3, `posições em aberto = (2-1)+1+1 (${p.posicoesEmAberto})`);
assert(p.vagasUrgentes === 1, `urgentes = vagas em andamento com prioridade Urgente (${p.vagasUrgentes})`);
assert(p.candidatosEmProcesso === 1 && p.admitidos === 1 && p.admissoesEmAndamento === 1, "candidatos em processo, admitidos e admissões em andamento");
assert(p.bySector.find((s) => s.department === "Recepção")?.total === 2, "posições por setor");

console.log("[4] Separação por empresa");
assert(RhCatalog.listRecords(PG, "vagas").length === 0 && RhCatalog.computePanel(PG).vagasCadastradas === 0, "Pengold não vê as vagas da Chez Pitu");
const pgCargo = RhCatalog.saveCargo(PG, { name: "Garçom", cbo: "5134-05", salary: "1700" }).cargo;
RhCatalog.saveVaga(PG, { cargoId: pgCargo.id, quantity: 1 });
assert(RhCatalog.listRecords(CO, "vagas").length === 5 && RhCatalog.listRecords(PG, "vagas").length === 1, "cada empresa com suas vagas");
let crossThrew = false;
try { RhCatalog.saveVaga(PG, { cargoId: recep.id, quantity: 1, role: "" }); } catch (_) { crossThrew = true; }
assert(crossThrew && RhCatalog.listRecords(PG, "vagas").length === 1, "função de outra empresa não é aceita na vaga");

console.log("[5] Lixeira");
const before = AppData.listDeletedArchive({ kinds: ["vaga", "candidato", "admissao"], company: CO }).length;
assert(RhCatalog.removeCandidato(CO, c2.id).ok, "excluir candidato");
assert(RhCatalog.removeAdmissao(CO, a2.id).ok, "excluir admissão");
assert(RhCatalog.removeVaga(CO, v4.id).ok, "excluir vaga");
const entries = AppData.listDeletedArchive({ kinds: ["vaga", "candidato", "admissao"], company: CO });
assert(entries.length === before + 3, "3 itens na Lixeira");
assert(Number(AppData.state.tombstones.candidatos?.[CO]?.[c2.id]) > 0 && Number(AppData.state.tombstones.vagas?.[CO]?.[v4.id]) > 0, "tombstones gravados");
const candEntry = entries.find((e) => e.kind === "candidato");
assert(candEntry.payload.record.name === "Paulo Teste" && candEntry.payload.record.feedbackSent === true, "cópia completa do candidato");
const res = AppData.restoreDeletedArchiveEntry(candEntry.id, { recompute: false });
assert(res.ok && RhCatalog.listRecords(CO, "candidatos").some((c) => c.id === c2.id), "candidato restaurado");
const again = AppData.restoreDeletedArchiveEntry(candEntry.id, { recompute: false });
assert(!again.ok, "não restaura duas vezes");
const fin = AppData.finalizeIncomingState(clone(AppData.state));
assert(fin.companies[CO].candidatos.some((c) => c.id === c2.id) && !fin.companies[CO].vagas.some((v) => v.id === v4.id), "restaurado vence tombstone; excluído continua fora");

console.log("[6] Merge e Firebase");
const local = clone(AppData.state);
const remote = clone(AppData.state);
remote.companies[CO].vagas.push({ id: "vaga-remota", role: "Camareira", quantity: 1, status: "Aberta", updatedAt: AppData.now() });
const merged = AppData.mergeRemoteIntoLocal(local, remote);
assert(merged.companies[CO].vagas.some((v) => v.id === "vaga-remota") && merged.companies[CO].vagas.length === 5, "vaga de outro PC chega pela união");
const payload = FirebaseSync.stateToFirebase(AppData.state);
assert(payload.ferias[CO].__rh.vagas.length === 4 && payload.ferias[CO].__rh.candidatos.length === 2 && payload.ferias[CO].__rh.admissoes.length === 1, "vagas/candidatos/admissões em ferias/Chez Pitu/__rh");
const back = FirebaseSync.firebaseToState(JSON.parse(JSON.stringify(payload)));
assert(back.companies[CO].vagas.length === 4 && back.companies[PG].vagas.length === 1, "ida e volta do Firebase preservam as duas empresas");

console.log("[7] Imutabilidade");
assert(JSON.stringify(AppData.getCompanyData(CO).employees) === employeesBefore, "Quadro de Vagas não altera o cadastro de funcionários");

console.log(`\nResultado: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
