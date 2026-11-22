/**
 * Validação: CARGOS E SALÁRIOS (2026-11-22).
 *
 * Fixtures em memória (vm) — nunca toca a base real. Cobre:
 *  - função com nome único por empresa (um salário por função) e CBO único;
 *  - CBO/salário validados e formatados; histórico de salário;
 *  - padronização de grafia: plano só leitura, aplicação vincula funcionários
 *    (roleId), guarda a grafia antiga em roleHistory e não toca outra empresa
 *    nem outros campos/módulos;
 *  - funcionário herda salário/CBO da função; upsertEmployee nunca grava
 *    salário/CBO no cadastro;
 *  - renomear função atualiza os vinculados; excluir só sem vinculados, com
 *    Lixeira + tombstone + restauração (sem furar a regra de nome/CBO);
 *  - comissões padrão (grafia corrigida) com explicação editável;
 *  - merge entre PCs (união/newer-wins/tombstone) e transporte no Firebase
 *    aninhado em ferias/{empresa}.__rh (sem nó novo de topo).
 *
 * Uso: node scripts/verify-cargos-salarios.mjs
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
function throws(fn, pattern, msg) {
  try {
    fn();
    assert(false, `${msg} (não lançou)`);
  } catch (error) {
    assert(pattern.test(String(error.message)), `${msg} — "${error.message}"`);
  }
}

function makeSandbox() {
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
  for (const file of ["js/import-utils.js", "js/data.js", "js/firebase-sync.js", "js/rh-catalog.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox;
}

const sb = makeSandbox();
const { AppData, RhCatalog, FirebaseSync } = sb;
const CO = "Chez Pitu";
const PG = "Pengold";
const clone = (v) => JSON.parse(JSON.stringify(v));

function resetFixture() {
  const co = AppData.getCompanyData(CO);
  co.employees = [
    { id: "e1", name: "ANA", role: "GARÇON", department: "BAR", status: "Ativo", admissionDate: "2020-01-01" },
    { id: "e2", name: "BIA", role: "Garçom", department: "BAR", status: "Inativo", admissionDate: "2020-01-01" },
    { id: "e3", name: "CAIO", role: "Enc. De Manutenção", department: "MANUTENÇÃO", status: "Ativo", admissionDate: "2020-01-01" },
    { id: "e4", name: "DUDA", role: "AUXILIAR NOS SERVIÇOS DE ALIMENTACAO", department: "COZINHA", status: "Ativo", admissionDate: "2020-01-01" },
    { id: "e5", name: "EDU", role: "SUB GERENTE", department: "ADM", status: "Ativo", admissionDate: "2020-01-01" },
    { id: "e6", name: "FABI", role: "COZINHEIRA I", department: "COZINHA", status: "Ativo", admissionDate: "2020-01-01" },
    { id: "e7", name: "GUI", role: "", department: "COZINHA", status: "Ativo", admissionDate: "2020-01-01" }
  ];
  co.manualScale = { "e1|2026-12-01": "FOLGA" };
  co.holidays = [{ id: "h1", name: "Natal", date: "2026-12-25", workedEmployees: [{ employeeId: "e1", status: "Pendente" }] }];
  RhCatalog.listCargos(CO).forEach(() => {});
  co.cargos = [];
  co.comissoes = [];
  AppData.getCompanyData(PG).employees = [
    { id: "p1", name: "PEDRO", role: "GARÇON", department: "BAR", status: "Ativo", admissionDate: "2020-01-01" }
  ];
  AppData.getCompanyData(PG).cargos = [];
}

console.log("[1] Estrutura por empresa");
resetFixture();
["cargos", "comissoes", "vagas", "candidatos", "admissoes"].forEach((col) => {
  assert(Array.isArray(AppData.getCompanyData(CO)[col]) && Array.isArray(AppData.getCompanyData(PG)[col]), `bloco da empresa tem "${col}" (array) nas duas empresas`);
});

console.log("[2] Grafia padrão sugerida");
const canon = RhCatalog.canonicalRoleName;
assert(canon("GARÇON") === "Garçom", `GARÇON → ${canon("GARÇON")}`);
assert(canon("Enc. De Manutenção") === "Encarregado de Manutenção", `Enc. De Manutenção → ${canon("Enc. De Manutenção")}`);
assert(canon("Aux. De Almoxarifado") === "Auxiliar de Almoxarifado", `Aux. De Almoxarifado → ${canon("Aux. De Almoxarifado")}`);
assert(canon("AUXILIAR NOS SERVIÇOS DE ALIMENTACAO") === "Auxiliar nos Serviços de Alimentação", `ALIMENTACAO → ${canon("AUXILIAR NOS SERVIÇOS DE ALIMENTACAO")}`);
assert(canon("SUB GERENTE") === "Subgerente", `SUB GERENTE → ${canon("SUB GERENTE")}`);
assert(canon("COZINHEIRA I") === "Cozinheira I", `numeral romano maiúsculo → ${canon("COZINHEIRA I")}`);
assert(canon("Gerente de Recursos Humanos") === "Gerente de Recursos Humanos", "grafia já correta fica igual");
assert(canon("  recepcionista   noturno ") === "Recepcionista Noturno", "espaços e caixa");

console.log("[3] Plano de padronização é somente leitura");
const before = JSON.stringify(AppData.state.companies);
const plan = RhCatalog.buildRoleStandardizationPlan(CO);
assert(JSON.stringify(AppData.state.companies) === before, "montar o plano não altera nada");
const garcom = plan.find((g) => g.name === "Garçom");
assert(garcom && garcom.employees === 2 && garcom.variants.length === 2, "GARÇON (ativo) e Garçom (inativo) caem no mesmo grupo — inativos incluídos");
assert(plan.length === 5, `5 grupos (cargo vazio ignorado): ${plan.map((g) => g.name).join(", ")}`);

console.log("[4] Aplicar padronização");
const groups = plan.map((g) => (g.name === "Cozinheira I" ? { ...g, name: "Cozinheiro I" } : g));
const result = RhCatalog.applyRoleStandardization(CO, groups);
const co = AppData.getCompanyData(CO);
assert(result.created === 5 && result.updatedEmployees === 6, `5 funções criadas, 6 funcionários vinculados (${result.created}/${result.updatedEmployees})`);
const fGarcom = RhCatalog.findCargoByName(CO, "garcom");
assert(fGarcom && fGarcom.name === "Garçom" && !fGarcom.cbo && fGarcom.salary === undefined, "função criada sem salário/CBO (a definir)");
const e1 = co.employees.find((e) => e.id === "e1");
assert(e1.role === "Garçom" && e1.roleId === fGarcom.id, "funcionário com grafia padronizada e roleId");
assert(e1.roleHistory?.[0]?.from === "GARÇON" && e1.roleHistory[0].to === "Garçom", "grafia antiga guardada em roleHistory");
assert(co.employees.find((e) => e.id === "e6").role === "Cozinheiro I", "nome ajustado pelo usuário vale");
assert(co.employees.find((e) => e.id === "e7").role === "" && !co.employees.find((e) => e.id === "e7").roleId, "funcionário sem cargo não é tocado");
assert(e1.name === "ANA" && e1.department === "BAR" && e1.status === "Ativo", "demais campos intactos");
assert(co.manualScale["e1|2026-12-01"] === "FOLGA" && co.holidays[0].workedEmployees.length === 1, "escala e feriados intactos");
assert(AppData.getCompanyData(PG).employees[0].role === "GARÇON" && !AppData.getCompanyData(PG).cargos.length, "outra empresa não é tocada");
assert(RhCatalog.buildRoleStandardizationPlan(CO).length === 0, "depois de aplicar, nada pendente");
const again = RhCatalog.applyRoleStandardization(CO, groups);
assert(again.created === 0 && again.updatedEmployees === 0, "reaplicar não duplica nem regrava");

console.log("[5] Regras: um salário por função, um CBO por função");
const salvo = RhCatalog.saveCargo(CO, { id: fGarcom.id, name: "Garçom", cbo: "513405", salary: "1.850,50", commissions: ["taxa-servico-bar", "inexistente"] });
assert(salvo.cargo.cbo === "5134-05" && salvo.cargo.salary === 1850.5, "CBO formatado 0000-00 e salário em número");
assert(salvo.cargo.commissions.length === 1 && salvo.cargo.commissions[0] === "taxa-servico-bar", "só comissões válidas");
throws(() => RhCatalog.saveCargo(CO, { name: "garcom", cbo: "", salary: "2000" }), /Já existe a função/, "mesma função (caixa/acento) com outro salário é recusada");
throws(() => RhCatalog.saveCargo(CO, { name: "Barman", cbo: "5134-05", salary: "1900" }), /CBO 5134-05 já está atribuído/, "CBO de outra função é recusado");
throws(() => RhCatalog.saveCargo(CO, { name: "Barman", cbo: "123", salary: "1900" }), /CBO inválido/, "CBO com menos de 6 dígitos é recusado");
throws(() => RhCatalog.saveCargo(CO, { name: "Barman", cbo: "", salary: "abc" }), /Salário inválido/, "salário inválido é recusado");
throws(() => RhCatalog.saveCargo(CO, { name: "  ", cbo: "", salary: "" }), /nome da função/, "função sem nome é recusada");
console.log("[5b] Função igualitária: níveis da mesma função dividem o CBO");
const fam = AppData.cargoFamilyKey;
assert(fam("Cozinheiro I") === "cozinheiro" && fam("COZINHEIRO II") === "cozinheiro" && fam("Cozinheiro 3") === "cozinheiro", "I, II e 3 são níveis de Cozinheiro");
assert(fam("Recepcionista Júnior") === "recepcionista" && fam("Recepcionista Sênior") === "recepcionista" && fam("Recepcionista Pleno") === "recepcionista", "Júnior/Pleno/Sênior são níveis");
assert(fam("Recepcionista Noturno") === "recepcionista noturno" && fam("Vigia") === "vigia" && fam("I") === "i", "palavra que não é nível não é cortada");
const coz1 = RhCatalog.saveCargo(CO, { name: "Chapeiro I", cbo: "5132-05", salary: "1800" }).cargo;
const coz2 = RhCatalog.saveCargo(CO, { name: "Chapeiro II", cbo: "5132-05", salary: "2100" }).cargo;
assert(coz1.cbo === coz2.cbo && coz1.salary !== coz2.salary, "Chapeiro I e II com o mesmo CBO e salários próprios");
const coz3 = RhCatalog.saveCargo(CO, { name: "Chapeiro Sênior", cbo: "5132-05", salary: "2500" }).cargo;
assert(coz3.cbo === "5132-05", "Chapeiro Sênior também pode usar o CBO da família");
throws(() => RhCatalog.saveCargo(CO, { name: "Confeiteiro", cbo: "5132-05", salary: "1900" }), /Só níveis da mesma função/, "função de outra família continua não podendo usar o CBO");
throws(() => RhCatalog.saveCargo(CO, { name: "Chapeiro II", cbo: "5132-05", salary: "2200" }), /Já existe a função/, "mesmo nível com outro salário continua recusado");
[coz1, coz2, coz3].forEach((c) => RhCatalog.removeCargo(CO, c.id));

const barman = RhCatalog.saveCargo(CO, { name: "Barman", cbo: "5134-20", salary: 1900 }).cargo;
assert(barman.salaryHistory.length === 1 && barman.salaryHistory[0].salary === 1900, "histórico de salário inicial");
const pgBarman = RhCatalog.saveCargo(PG, { name: "Barman", cbo: "5134-20", salary: 2100 }).cargo;
assert(pgBarman && pgBarman.salary === 2100, "outra empresa tem catálogo próprio (mesmo nome/CBO permitido)");
const barman2 = RhCatalog.saveCargo(CO, { id: barman.id, name: "Barman", cbo: "5134-20", salary: "2.000,00" }).cargo;
assert(barman2.salaryHistory.length === 2 && barman2.salaryHistory[1].salary === 2000, "mudança de salário entra no histórico");
const barman3 = RhCatalog.saveCargo(CO, { id: barman.id, name: "Barman", cbo: "5134-20", salary: "2000", notes: "x" }).cargo;
assert(barman3.salaryHistory.length === 2, "salvar sem mudar o salário não cria histórico");
assert(co.cargos.filter((c) => c.id === barman.id).length === 1, "edição não duplica a função");

console.log("[5c] Insalubridade (percentual na função)");
assert(RhCatalog.parsePercent("20") === 20 && RhCatalog.parsePercent("12,5%") === 12.5 && RhCatalog.parsePercent("") === null && RhCatalog.parsePercent("0") === null, "percentual: 20, 12,5% / vazio e 0 = sem insalubridade");
assert(Number.isNaN(RhCatalog.parsePercent("150")) && Number.isNaN(RhCatalog.parsePercent("-5")) && Number.isNaN(RhCatalog.parsePercent("abc")), "acima de 100, negativo ou texto é inválido");
const insal = RhCatalog.saveCargo(CO, { name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "20" }).cargo;
assert(insal.insalubridade === 20 && RhCatalog.insalubridadeLabel(20) === "20% (grau médio)", "função com insalubridade grau médio 20%");
assert(insal.insalubridadeHistory.length === 1 && insal.insalubridadeHistory[0].percent === 20, "histórico de insalubridade");
const insal2 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600" }).cargo;
assert(insal2.insalubridade === 20 && insal2.insalubridadeHistory.length === 1, "edição sem o campo mantém a insalubridade");
const insal3 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "25,5" }).cargo;
assert(insal3.insalubridade === 25.5 && RhCatalog.insalubridadeLabel(25.5) === "25,5% (CCT/laudo)", "percentual próprio (CCT/laudo)");
throws(() => RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "120" }), /insalubridade inválido/, "percentual acima de 100% recusado");
const insal4 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "" }).cargo;
assert(!("insalubridade" in insal4) && insal4.insalubridadeHistory.length === 3 && insal4.insalubridadeHistory[2].percent === undefined, "retirar a insalubridade fica registrado no histórico");
assert(!JSON.stringify(insal4).includes("null"), "registro sem null (RTDB)");
const b1 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "40", insalubridadeBase: "1.518,00" }).cargo;
assert(b1.insalubridadeBase === 1518 && RhCatalog.insalubridadeValor(b1) === 607.2, "salário base R$ 1.518,00 × 40% = R$ 607,20");
assert(b1.insalubridadeHistory.at(-1).base === 1518 && b1.insalubridadeHistory.at(-1).percent === 40, "base entra no histórico");
const b2 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "40" }).cargo;
assert(b2.insalubridadeBase === 1518, "edição sem o campo mantém a base");
const b3 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "20", insalubridadeBase: "1.518,33" }).cargo;
assert(RhCatalog.insalubridadeValor(b3) === 303.67, "valor arredondado ao centavo (20% de 1.518,33 = 303,67)");
throws(() => RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "20", insalubridadeBase: "abc" }), /Salário base/, "base inválida recusada");
const b4 = RhCatalog.saveCargo(CO, { id: insal.id, name: "Auxiliar de Limpeza", cbo: "5143-20", salary: "1600", insalubridade: "", insalubridadeBase: "1518" }).cargo;
assert(!("insalubridadeBase" in b4) && RhCatalog.insalubridadeValor(b4) === null, "sem insalubridade, a base não é guardada");
assert(RhCatalog.insalubridadeValor({ insalubridade: 40 }) === null, "sem base, valor a definir");
RhCatalog.removeCargo(CO, insal.id);

console.log("[6] Funcionário herda salário/CBO; cadastro não grava salário/CBO");
assert(RhCatalog.resolveEmployeeCargo(e1, CO).salary === 1850.5, "salário do funcionário vem da função");
AppData.upsertEmployee({ id: "e8", name: "HELO", cpf: "", ctps: "1", role: "Barman", roleId: barman.id, department: "BAR", admissionDate: "2026-01-01", salary: 99999, cbo: "9999-99" }, CO);
const e8 = co.employees.find((e) => e.id === "e8");
assert(e8.roleId === barman.id && e8.role === "Barman", "upsertEmployee grava roleId");
assert(!("salary" in e8) && !("cbo" in e8), "salário/CBO enviados pelo cadastro são ignorados");
AppData.upsertEmployee({ id: "e8", name: "HELO", cpf: "", ctps: "1", department: "BAR", admissionDate: "2026-01-01" }, CO);
assert(co.employees.find((e) => e.id === "e8").roleId === barman.id, "edição sem roleId preserva o vínculo");
const legacyEmp = { id: "x", role: "barman" };
assert(RhCatalog.resolveEmployeeCargo(legacyEmp, CO)?.id === barman.id, "legado sem roleId resolve pelo nome normalizado");

console.log("[7] Renomear função atualiza vinculados");
const ren = RhCatalog.saveCargo(CO, { id: barman.id, name: "Bartender", cbo: "5134-20", salary: "2000" });
assert(ren.renamedEmployees === 1 && co.employees.find((e) => e.id === "e8").role === "Bartender", "funcionário vinculado recebe o novo nome");
assert(co.employees.find((e) => e.id === "e8").roleHistory.at(-1).from === "Barman", "nome anterior no histórico");

console.log("[8] Excluir função: só sem vinculados, com Lixeira");
const blocked = RhCatalog.removeCargo(CO, fGarcom.id);
assert(!blocked.ok && /2 funcionário/.test(blocked.error), "função com funcionários (inclusive inativo) não se exclui");
const vazia = RhCatalog.saveCargo(CO, { name: "Mensageiro", cbo: "5151-10", salary: "1600" }).cargo;
const archiveBefore = AppData.listDeletedArchive({ kinds: ["cargo"] }).length;
const removed = RhCatalog.removeCargo(CO, vazia.id);
assert(removed.ok && !RhCatalog.getCargo(CO, vazia.id), "função sem vinculados é excluída");
const entry = AppData.listDeletedArchive({ kinds: ["cargo"] })[0];
assert(AppData.listDeletedArchive({ kinds: ["cargo"] }).length === archiveBefore + 1 && entry.payload.record.name === "Mensageiro", "cópia completa na Lixeira");
assert(Number(AppData.state.tombstones.cargos?.[CO]?.[vazia.id]) > 0, "tombstone gravado");
const conflictCargo = RhCatalog.saveCargo(CO, { name: "Carregador", cbo: "5151-10", salary: "1600" }).cargo;
const blockedRestore = AppData.restoreDeletedArchiveEntry(entry.id, { recompute: false });
assert(!blockedRestore.ok && /CBO/.test(blockedRestore.error), "restaurar não fura a regra do CBO único");
RhCatalog.removeCargo(CO, conflictCargo.id);
const restored = AppData.restoreDeletedArchiveEntry(entry.id, { recompute: false });
assert(restored.ok && RhCatalog.getCargo(CO, vazia.id)?.salary === 1600, "restauração devolve a função completa");
AppData.finalizeIncomingState(AppData.state);
const afterFinalize = AppData.finalizeIncomingState(clone(AppData.state));
assert(afterFinalize.companies[CO].cargos.some((c) => c.id === vazia.id), "restaurada vence o tombstone");

console.log("[9] Comissões");
const comissoes = RhCatalog.listComissoes(CO);
assert(comissoes.map((c) => c.name).join("|") === "Taxa de Serviço Bar|Taxa de Serviço Frigobar|Comissão Ocupação|Walk-in|Extensão de Diária|PL Anual", "6 comissões padrão, grafia corrigida");
RhCatalog.saveComissao(CO, { id: "walk-in", name: "Walk-in", description: "5% sobre diária de hóspede sem reserva" });
assert(RhCatalog.listComissoes(CO).find((c) => c.id === "walk-in").description.startsWith("5%"), "explicação salva");
assert(RhCatalog.listComissoes(PG).find((c) => c.id === "walk-in").description === "", "explicação é por empresa");
throws(() => RhCatalog.saveComissao(CO, { name: "WALK-IN" }), /Já existe a comissão/, "comissão com nome repetido é recusada");
const nova = RhCatalog.saveComissao(CO, { name: "Comissão Eventos", description: "" });
assert(RhCatalog.listComissoes(CO).at(-1).id === nova.id, "comissão nova entra depois das padrão");

console.log("[10] Merge entre PCs");
const local = clone(AppData.state);
const remote = clone(AppData.state);
const t = AppData.now();
remote.companies[CO].cargos.push({ id: "cargo-remoto", name: "Porteiro", cbo: "5174-10", salary: 1700, updatedAt: t });
const lg = local.companies[CO].cargos.find((c) => c.id === fGarcom.id);
lg.salary = 1999; lg.updatedAt = t + 10;
const rg = remote.companies[CO].cargos.find((c) => c.id === fGarcom.id);
rg.salary = 1500; rg.updatedAt = t + 5;
const merged = AppData.mergeRemoteIntoLocal(local, remote);
assert(merged.companies[CO].cargos.some((c) => c.id === "cargo-remoto"), "união: função criada em outro PC chega");
assert(merged.companies[CO].cargos.find((c) => c.id === fGarcom.id).salary === 1999, "newer-wins por função");
const remote2 = clone(merged);
remote2.companies[CO].cargos.push({ id: vazia.id + "-zumbi", name: "Zumbi", updatedAt: 1 });
remote2.tombstones.cargos = { [CO]: { [vazia.id + "-zumbi"]: t + 100 } };
const merged2 = AppData.mergeRemoteIntoLocal(merged, remote2);
assert(!merged2.companies[CO].cargos.some((c) => c.id === vazia.id + "-zumbi"), "tombstone impede ressurreição pelo merge");

console.log("[11] Firebase: aninhado em ferias/{empresa}.__rh");
const payload = FirebaseSync.stateToFirebase(AppData.state);
assert(!("cargos" in payload) && !("vagas" in payload) && !("cargosSalarios" in payload), "nenhum nó novo de topo");
assert(Array.isArray(payload.ferias[CO].__rh.cargos) && payload.ferias[CO].__rh.cargos.length === co.cargos.length, "cargos em ferias/Chez Pitu/__rh");
assert(Array.isArray(payload.ferias[CO].vacations), "férias continuam no mesmo nó");
const json = JSON.stringify(payload);
assert(!json.includes("undefined"), "payload sem undefined");
const asRtdb = JSON.parse(json);
asRtdb.ferias[CO].__rh.cargos = Object.fromEntries(asRtdb.ferias[CO].__rh.cargos.map((c, i) => [String(i), c]));
delete asRtdb.ferias[PG].__rh.vagas; // RTDB não guarda lista vazia
const back = FirebaseSync.firebaseToState(asRtdb);
assert(back.companies[CO].cargos.length === co.cargos.length && back.companies[CO].cargos.some((c) => c.name === "Garçom"), "volta do Firebase (objeto indexado → lista)");
assert(Array.isArray(back.companies[PG].vagas) && back.companies[PG].vagas.length === 0, "lista ausente vira []");
const oldClient = clone(asRtdb);
delete oldClient.ferias[CO].__rh; // envio de versão antiga
const fromOld = FirebaseSync.firebaseToState(oldClient);
const healed = AppData.mergeRemoteIntoLocal(AppData.state, fromOld);
assert(healed.companies[CO].cargos.length === co.cargos.length, "remoto sem __rh (versão antiga) não apaga as funções locais");

console.log(`\nResultado: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
