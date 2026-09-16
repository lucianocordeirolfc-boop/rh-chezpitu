/**
 * Homologação: sincronização entre computadores (chaves do RTDB, payload,
 * resiliência a erro de envio, corrida do listener e relógio do servidor).
 *
 * Reproduz as CAUSAS que derrubavam a sincronização em outros computadores:
 *   1. chave de tombstone com caractere proibido (. # $ / [ ]) — nome de feriado
 *      digitado pelo usuário, ex.: "Sto. Antônio", "Carnaval 16/02";
 *   2. employeeId undefined no índice holidaysWorked (vínculo legado por nome);
 *   3. save() lançando de forma síncrona e deixando o PC "surdo" para sempre;
 *   4. alteração de outro PC descartada durante um save local;
 *   5. relógio do computador atrasado revertendo a edição recém-feita.
 *
 * Tudo em sandbox com FIXTURES — nenhum dado de produção é lido ou alterado.
 *
 * Uso: node scripts/verify-sync-chaves.mjs
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

const CO = "Chez Pitu";

/** Sandbox com AppData + FirebaseSync (sem rede; o db é injetado pelo teste). */
function loadSandbox(options = {}) {
  const store = new Map();
  const badge = { dataset: {}, title: "", textContent: "" };
  const ctx = {
    console: options.quiet ? { ...console, error() {}, warn() {} } : console,
    setTimeout, clearTimeout, queueMicrotask, Date, JSON, Math, Object, Array, Set, Map,
    String, Number, Boolean, Promise, Error, RegExp, parseInt, parseFloat, isNaN, isFinite,
    undefined, navigator: { onLine: true },
    document: { getElementById: (id) => (id === "syncStatus" ? badge : null), addEventListener() {}, readyState: "complete" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    addEventListener() {},
    firebase: options.firebase || { apps: [] },
    AppAuth: { isLoggedIn: () => true }
  };
  ctx.window = ctx;
  const sandbox = vm.createContext(ctx);
  for (const file of ["js/import-utils.js", "js/data.js", "js/firebase-sync.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  sandbox.__badge = badge;
  return sandbox;
}

/** Mesma validação que o SDK do Firebase aplica ao payload de ref.update(). */
const INVALID_KEY_RE = /[.$#\[\]\/\u0000-\u001f\u007f]/;
function findRtdbViolations(node, nodePath = "sistemaRH", out = []) {
  if (node === undefined) { out.push(`undefined em ${nodePath}`); return out; }
  if (typeof node === "function") { out.push(`função em ${nodePath}`); return out; }
  if (typeof node === "number" && !Number.isFinite(node)) { out.push(`número inválido em ${nodePath}`); return out; }
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((v, i) => findRtdbViolations(v, `${nodePath}/${i}`, out)); return out; }
  Object.keys(node).forEach((key) => {
    if (INVALID_KEY_RE.test(key)) out.push(`chave inválida em ${nodePath}/${key}`);
    findRtdbViolations(node[key], `${nodePath}/${key}`, out);
  });
  return out;
}
function violationsOfPayload(sandbox) {
  return findRtdbViolations(sandbox.FirebaseSync.stateToFirebase(sandbox.AppData.state));
}
/**
 * O que efetivamente vai ao servidor (já saneado por buildUpdatePaths). As chaves do
 * primeiro nível são CAMINHOS ("sistemaRH/feriados") — a barra é legítima ali,
 * então a validação começa no valor de cada caminho.
 */
function violationsOfSentUpdates(sandbox) {
  const captured = captureUpdates(sandbox);
  sandbox.FirebaseSync.save(sandbox.AppData.state);
  const out = [];
  Object.entries(captured.last || {}).forEach(([nodePath, value]) => findRtdbViolations(value, nodePath, out));
  return { violations: out, sent: captured.last || {} };
}
function captureUpdates(sandbox) {
  const captured = { last: null, calls: 0 };
  sandbox.window.firebaseDB = {
    ref: () => ({
      update: (values) => { captured.calls += 1; captured.last = values; return Promise.resolve(); },
      on() {}, off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sandbox.FirebaseSync.init();
  return captured;
}

console.log("\n=== HOMOLOGAÇÃO: sincronização entre computadores ===\n");

// ── 1. Escape de chave ────────────────────────────────────────────────────────
console.log("[1] Escape de chave do Realtime Database");
{
  const { escapeRtdbKey, hasForbiddenRtdbKeyChars } = loadSandbox().ImportUtils;
  assert(escapeRtdbKey("2026-06-13|sto. antonio") === "2026-06-13|sto%2E antonio", "ponto vira %2E");
  assert(escapeRtdbKey("carnaval 16/02") === "carnaval 16%2F02", "barra vira %2F");
  assert(escapeRtdbKey("a#b$c[d]e") === "a%23b%24c%5Bd%5De", "# $ [ ] escapados");
  assert(escapeRtdbKey("100%") === "100%25", "o próprio % é escapado (escape injetivo)");
  assert(escapeRtdbKey("2026-04-23|sao jorge") === "2026-04-23|sao jorge", "chave já válida não muda");
  assert(!hasForbiddenRtdbKeyChars(escapeRtdbKey("sto. antonio")), "chave escapada é aceita pelo RTDB");
  assert(
    escapeRtdbKey("a.b") !== escapeRtdbKey("a%2Eb") && escapeRtdbKey("a%2Eb") === "a%252Eb",
    "nomes diferentes não colidem na mesma chave"
  );
}

// ── 2. Exclusão definitiva de feriado com nome "perigoso" ─────────────────────
console.log("\n[2] Exclusão definitiva de feriado com . e / no nome");
for (const nome of ["Sto. Antônio", "Carnaval 16/02", "Aniversário [Búzios]"]) {
  const sb = loadSandbox();
  const A = sb.AppData;
  A.addHoliday({ name: nome, date: "2026-06-13" }, { company: CO });
  A.removeHolidayEverywhere("2026-06-13", nome, { companies: [CO] });
  const v = violationsOfPayload(sb);
  assert(v.length === 0, `"${nome}": payload aceito pelo RTDB${v.length ? " — " + v[0] : ""}`);
  assert(
    A.isHolidayTombstoned(CO, "2026-06-13", nome),
    `"${nome}": a exclusão continua valendo (tombstone encontrado)`
  );
  assert(
    !(A.getCompanyData(CO).holidays || []).some((h) => h.name === nome),
    `"${nome}": o feriado não volta`
  );
}

// ── 3. Exclusão definitiva de vínculo com nome "perigoso" ─────────────────────
console.log("\n[3] Exclusão definitiva de vínculo (feriado com ponto no nome)");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  A.upsertEmployee({ name: "João Silva", role: "Garçom", status: "Ativo" }, { company: CO });
  const emp = A.getCompanyData(CO).employees[0];
  A.addHoliday({ name: "N. Sra. dos Navegantes", date: "2026-02-02" }, { company: CO });
  const h = A.getCompanyData(CO).holidays.find((x) => x.date === "2026-02-02");
  A.addManualWorkedEmployee(h.id, emp.id, { company: CO });
  A.removeWorkedEmployeeFromHoliday(h.id, emp.id, { company: CO });
  assert(violationsOfPayload(sb).length === 0, "payload aceito pelo RTDB");
  assert(
    A.isWorkedLinkTombstoned(CO, "2026-02-02", "N. Sra. dos Navegantes", emp.id),
    "a exclusão do vínculo continua valendo"
  );
  A.addManualWorkedEmployee(h.id, emp.id, { company: CO });
  assert(
    !A.isWorkedLinkTombstoned(CO, "2026-02-02", "N. Sra. dos Navegantes", emp.id),
    "revincular pelo usuário limpa o tombstone (sem regressão)"
  );
}

// ── 4. Migração das chaves já gravadas no formato antigo ──────────────────────
console.log("\n[4] Migração não-destrutiva das chaves legadas");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  const legado = {
    companies: {
      [CO]: {
        companyInfo: { legalName: CO },
        employees: [],
        holidays: [{ id: "h1", name: "Sto. Antônio", date: "2026-06-13", workedEmployees: [] }]
      }
    },
    holidayTombstones: { [CO]: { "2026-06-13|sto. antonio": 1700000000000 } },
    workedLinkTombstones: { [CO]: { "2026-02-02|n. sra. dos navegantes|func-1": 1700000000000 } }
  };
  const finalizado = A.finalizeIncomingState(legado);
  const chavesFeriado = Object.keys(finalizado.holidayTombstones[CO] || {});
  const chavesVinculo = Object.keys(finalizado.workedLinkTombstones[CO] || {});
  assert(chavesFeriado.includes("2026-06-13|sto%2E antonio"), "chave legada de feriado migrada para o formato escapado");
  assert(chavesFeriado.length === 1, "não duplica a chave migrada");
  assert(chavesVinculo.includes("2026-02-02|n%2E sra%2E dos navegantes|func-1"), "chave legada de vínculo migrada");
  assert(
    Number(finalizado.holidayTombstones[CO]["2026-06-13|sto%2E antonio"]) === 1700000000000,
    "o deletedAt original é preservado na migração"
  );
  assert(
    !(finalizado.companies[CO].holidays || []).some((h) => h.name === "Sto. Antônio"),
    "a exclusão registrada antes da correção continua sendo aplicada"
  );
  assert(findRtdbViolations(finalizado.holidayTombstones).length === 0, "estado migrado já é válido para o RTDB");
}

// ── 5. Vínculo legado sem employeeId ──────────────────────────────────────────
console.log("\n[5] Vínculo legado sem employeeId (índice holidaysWorked)");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  A.addHoliday({ name: "Corpus Christi", date: "2026-06-04" }, { company: CO });
  const h = A.getCompanyData(CO).holidays[0];
  h.workedEmployees = [{ name: "Maria Legado", compensationDate: "" }];
  const v = violationsOfPayload(sb);
  assert(v.length === 0, `sem undefined no payload${v.length ? " — " + v[0] : ""}`);
  const idx = sb.FirebaseSync.stateToFirebase(A.state).holidaysWorked[CO];
  assert(idx.length === 1 && idx[0].employeeId === "", "employeeId ausente vira string vazia");
}

// ── 6. Rede de segurança do payload (buildUpdatePaths) ────────────────────────────
console.log("\n[6] Rede de segurança: payload saneado antes do envio");
{
  const sb = loadSandbox({ quiet: true });
  const A = sb.AppData;
  A.state.tombstones.employees["Chez Pitu"] = { "id.com.ponto": 1, ok: 2, ruim: undefined };
  A.state.coverageAlerts = [{ msg: "x", valor: NaN }];
  const { violations, sent } = violationsOfSentUpdates(sb);
  assert(violations.length === 0, `o que vai ao servidor não tem chave/valor inválido${violations.length ? " — " + violations[0] : ""}`);
  const tomb = sent["sistemaRH/tombstones"].employees["Chez Pitu"];
  assert(tomb["id%2Ecom%2Eponto"] === 1 && tomb.ok === 2, "chave inválida escapada sem perder o valor");
  assert(!("ruim" in tomb), "valor undefined é omitido (ausência tem o mesmo significado no RTDB)");
  assert(!("valor" in sent["sistemaRH/coverageAlerts"][0]), "NaN é omitido");
  const nosDoPayload = Object.keys(sb.FirebaseSync.stateToFirebase(A.state));
  const caminhosEnviados = Object.keys(sent);
  assert(
    nosDoPayload.every((no) => caminhosEnviados.some((caminho) => caminho === `sistemaRH/${no}` || caminho.startsWith(`sistemaRH/${no}/`))),
    "nenhum nó deixa de ser enviado (nada é apagado no servidor)"
  );
}

// ── 7. save() nunca lança e o PC não fica surdo ───────────────────────────────
console.log("\n[7] Erro de envio não pode deixar o computador surdo");
{
  const sb = loadSandbox({ quiet: true });
  let handler = null;
  sb.window.firebaseDB = {
    ref: (p) => ({
      update: () => { throw new Error("update failed: values argument contains an invalid key (x.y)"); },
      on: (evt, cb) => { if (p !== ".info/serverTimeOffset") handler = cb; },
      off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();
  let aplicados = 0;
  sb.FirebaseSync.startSync(() => { aplicados += 1; });

  let lancou = false;
  try { sb.FirebaseSync.save(sb.AppData.state); } catch (_) { lancou = true; }
  assert(!lancou, "save() não propaga a exceção para a ação do usuário");
  assert(sb.__badge.textContent === "Erro de sincronização", "o selo mostra 'Erro de sincronização' (não fica em 'Sincronizando…')");

  handler({ val: () => ({ configuracoes: { updatedAt: 777, updatedBy: "outro-pc" }, empresas: {} }) });
  assert(aplicados === 1, "mesmo após o erro, a alteração do outro computador é aplicada");
}

// ── 8. Corrida: alteração remota durante um save local ────────────────────────
console.log("\n[8] Alteração de outro PC durante um save local");
{
  const sb = loadSandbox({ quiet: true });
  let handler = null;
  sb.window.firebaseDB = {
    ref: (p) => ({
      update: () => new Promise(() => {}), // envio pendente (em andamento)
      on: (evt, cb) => { if (p !== ".info/serverTimeOffset") handler = cb; },
      off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();
  let aplicados = 0;
  sb.FirebaseSync.startSync(() => { aplicados += 1; });
  sb.FirebaseSync.save(sb.AppData.state); // save local em andamento
  handler({ val: () => ({ configuracoes: { updatedAt: 888, updatedBy: "outro-pc" }, empresas: {} }) });
  assert(aplicados === 1, "a alteração do outro PC NÃO é mais descartada durante o save");
}

// ── 9. Eco do próprio envio ───────────────────────────────────────────────────
console.log("\n[9] Eco do próprio envio continua sendo ignorado");
{
  const sb = loadSandbox({ quiet: true });
  let handler = null;
  let enviado = null;
  sb.window.firebaseDB = {
    ref: (p) => ({
      update: (values) => { enviado = values; return Promise.resolve(); },
      on: (evt, cb) => { if (p !== ".info/serverTimeOffset") handler = cb; },
      off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();
  let aplicados = 0;
  sb.FirebaseSync.startSync(() => { aplicados += 1; });
  sb.FirebaseSync.save(sb.AppData.state);
  const config = enviado["sistemaRH/configuracoes"];
  handler({ val: () => ({ configuracoes: config, empresas: {} }) });
  assert(aplicados === 0, "o próprio envio de volta não reprocessa o estado (sem laço)");
  handler({ val: () => ({ configuracoes: { updatedAt: config.updatedAt, updatedBy: "outro-pc" }, empresas: {} }) });
  assert(aplicados === 1, "mesmo carimbo vindo de OUTRO dispositivo é aplicado");
}

// ── 10. Relógio do servidor ───────────────────────────────────────────────────
console.log("\n[10] Relógio de referência do servidor");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  const antes = A.now();
  A.setSyncClockOffset(2 * 3600 * 1000); // PC 2h atrasado em relação ao servidor
  assert(A.getSyncClockOffset() === 7200000, "offset do servidor registrado");
  assert(A.now() - antes >= 7199000, "now() passa a usar o horário do servidor");
  A.setSyncClockOffset("texto inválido");
  assert(A.getSyncClockOffset() === 0, "offset inválido volta a 0 (comportamento anterior)");

  // PC atrasado 2h edita AGORA; o outro PC editou 1h atrás.
  const sbB = loadSandbox();
  const B = sbB.AppData;
  B.setSyncClockOffset(2 * 3600 * 1000);
  const pcB = { companies: { [CO]: { companyInfo: { legalName: CO }, employees: [{ id: "e1", name: "Ana", role: "CARGO NOVO", updatedAt: B.now() }] } } };
  const pcA = { companies: { [CO]: { companyInfo: { legalName: CO }, employees: [{ id: "e1", name: "Ana", role: "cargo antigo", updatedAt: Date.now() - 3600 * 1000 }] } } };
  const m = B.mergeRemoteIntoLocal(pcB, pcA);
  assert(
    m.companies[CO].employees.find((e) => e.id === "e1").role === "CARGO NOVO",
    "com o relógio corrigido, a edição recém-feita não é mais revertida"
  );
}

// ── 11. Regressão: fluxo normal continua igual ────────────────────────────────
console.log("\n[11] Regressão (nomes sem caractere especial)");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  A.upsertEmployee({ name: "Maria Souza", role: "Camareira", status: "Ativo" }, { company: CO });
  const emp = A.getCompanyData(CO).employees[0];
  A.addHoliday({ name: "São Jorge", date: "2026-04-23" }, { company: CO });
  const h = A.getCompanyData(CO).holidays[0];
  A.addManualWorkedEmployee(h.id, emp.id, { company: CO });
  A.setManualScale(emp.id, "2026-04-20", "FOLGA", { company: CO });
  assert(violationsOfPayload(sb).length === 0, "payload de um estado normal continua válido");
  A.removeHolidayEverywhere("2026-04-23", "São Jorge", { companies: [CO] });
  assert(A.isHolidayTombstoned(CO, "2026-04-23", "São Jorge"), "exclusão definitiva de nome simples continua funcionando");
  A.addHoliday({ name: "São Jorge", date: "2026-04-23" }, { company: CO });
  assert(!A.isHolidayTombstoned(CO, "2026-04-23", "São Jorge"), "recriar pelo usuário continua limpando o tombstone");
}

// ── 12. Envio incremental: só o que mudou ─────────────────────────────────────
console.log("\n[12] Envio incremental (só os nós alterados)");
{
  const sb = loadSandbox({ quiet: true });
  const A = sb.AppData;
  A.upsertEmployee({ name: "Maria Souza", role: "Camareira", status: "Ativo" }, { company: CO });
  A.upsertEmployee({ name: "Pedro Lima", role: "Garçom", status: "Ativo" }, { company: "Pengold" });

  const enviados = [];
  sb.window.firebaseDB = {
    ref: () => ({
      update: (values) => { enviados.push(values); return Promise.resolve(); },
      on() {}, off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();

  await sb.FirebaseSync.save(A.state);
  const primeiro = Object.keys(enviados[0] || {});
  assert(enviados.length === 1 && primeiro.length > 10, `1º envio da sessão vai completo (${primeiro.length} caminhos)`);
  assert(
    primeiro.includes("sistemaRH/funcionarios/Chez Pitu") && primeiro.includes("sistemaRH/funcionarios/Pengold"),
    "nós por empresa: sistemaRH/funcionarios/<empresa>"
  );
  assert(!primeiro.includes("sistemaRH/funcionarios"), "o nó inteiro não é mais reescrito (uma empresa não apaga a outra)");

  await sb.FirebaseSync.save(A.state);
  assert(enviados.length === 1, "salvar sem mudança nenhuma NÃO grava (não acorda os outros PCs)");

  const antes = enviados.length;
  // upsertEmployee já chama saveState() -> FirebaseSync.save(); o save explícito
  // logo depois não deve encontrar nada novo para enviar.
  A.upsertEmployee({ name: "Maria Souza", role: "Governanta", status: "Ativo" }, { company: CO });
  await sb.FirebaseSync.save(A.state);
  const segundo = Object.keys(enviados[enviados.length - 1] || {});
  assert(enviados.length === antes + 1, `alteração real grava uma única vez (${enviados.length - antes})`);
  assert(
    segundo.includes("sistemaRH/funcionarios/Chez Pitu") && !segundo.includes("sistemaRH/funcionarios/Pengold"),
    "só a empresa alterada é enviada (a outra fica intacta no servidor)"
  );
  assert(segundo.includes("sistemaRH/configuracoes"), "o carimbo de versão acompanha toda gravação real");
  assert(segundo.length < primeiro.length, `envio menor que o completo (${segundo.length} contra ${primeiro.length} caminhos)`);
  assert(
    !Object.values(enviados[enviados.length - 1]).some((v) => v === null),
    "nunca envia null (enviar null apagaria o nó no servidor)"
  );
}

// ── 13. Envio que falha é reenviado ───────────────────────────────────────────
console.log("\n[13] Envio que falha não é dado como enviado");
{
  const sb = loadSandbox({ quiet: true });
  const A = sb.AppData;
  A.upsertEmployee({ name: "Ana Reenvio", role: "Recepção", status: "Ativo" }, { company: CO });
  let falhar = true;
  const enviados = [];
  sb.window.firebaseDB = {
    ref: () => ({
      update: (values) => {
        enviados.push(values);
        return falhar ? Promise.reject(new Error("network error")) : Promise.resolve();
      },
      on() {}, off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();
  await sb.FirebaseSync.save(A.state);
  assert(sb.__badge.textContent === "Erro de sincronização", "falha de rede aparece no selo");
  falhar = false;
  await sb.FirebaseSync.save(A.state);
  assert(
    Object.keys(enviados[1] || {}).includes("sistemaRH/funcionarios/Chez Pitu"),
    "o que falhou é reenviado na gravação seguinte"
  );
  assert(sb.__badge.textContent === "Sincronizado", "após o reenvio o selo volta a Sincronizado");
}

// ── 14. Selo avisa relógio fora de hora ───────────────────────────────────────
console.log("\n[14] Selo avisa quando o relógio do PC está fora de hora");
{
  const sb = loadSandbox({ quiet: true });
  let clockCb = null;
  const toasts = [];
  sb.window.App = { toast: (msg, tipo) => toasts.push({ msg, tipo }) };
  sb.window.firebaseDB = {
    ref: (p) => ({
      update: () => Promise.resolve(),
      on: (evt, cb) => { if (p === ".info/serverTimeOffset") clockCb = cb; },
      off() {}, once: () => Promise.resolve({ val: () => null })
    })
  };
  sb.FirebaseSync.init();
  assert(typeof clockCb === "function", "o app assina .info/serverTimeOffset");

  clockCb({ val: () => 5000 }); // 5s de diferença: irrelevante
  assert(sb.__badge.dataset.clock === undefined, "desvio pequeno não polui o selo");
  assert(toasts.length === 0, "desvio pequeno não gera aviso");

  clockCb({ val: () => 2 * 3600 * 1000 + 15 * 60 * 1000 }); // 2h15 atrasado
  assert(sb.__badge.dataset.clock === "skew", "selo marcado com data-clock='skew' (cor de alerta)");
  assert(/relógio 2h 15min atrasado/.test(sb.__badge.textContent), `selo mostra o desvio: "${sb.__badge.textContent}"`);
  assert(/acertar a data\/hora do Windows/.test(sb.__badge.title), "a dica do selo explica o que fazer");
  assert(toasts.length === 1 && toasts[0].tipo === "warning", "um único aviso na tela (não repete)");
  assert(A_getSyncOffset(sb) === 8100000, "o desvio também alimenta o relógio de referência");

  sb.FirebaseSync.save(sb.AppData.state); // muda o status
  assert(/relógio 2h 15min atrasado/.test(sb.__badge.textContent), "o aviso sobrevive à troca de status");

  clockCb({ val: () => 0 }); // usuário acertou o relógio
  assert(sb.__badge.dataset.clock === undefined && !/relógio/.test(sb.__badge.textContent), "acertando a hora, o selo volta ao normal");
}
function A_getSyncOffset(sb) { return sb.AppData.getSyncClockOffset(); }

// ── 15. Escape estendido a toda chave montada com texto ───────────────────────
console.log("\n[15] Escape estendido: vínculo de cobertura (chave montada com nome)");
{
  const sb = loadSandbox();
  vm.runInContext(fs.readFileSync(path.join(root, "js/version.js"), "utf8"), sb, { filename: "js/version.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "js/scale-rules.js"), "utf8"), sb, { filename: "js/scale-rules.js" });
  const A = sb.AppData;
  A.state.coveragePrincipalBindings = {
    "maria de f. souza": { employeeId: "func-1", company: CO, matchedName: "Maria de F. Souza", updatedAt: 1700000000000 }
  };
  sb.ScaleRules.getCoveragePrincipalStatus(A.state); // passa por ensureBindings
  const chaves = Object.keys(A.state.coveragePrincipalBindings);
  assert(chaves.includes("maria de f%2E souza"), "chave legada de vínculo de cobertura migrada");
  assert(chaves.length === 1, "sem duplicar a chave migrada");
  assert(
    A.state.coveragePrincipalBindings["maria de f%2E souza"].employeeId === "func-1",
    "o vínculo gravado é preservado na migração"
  );
  assert(violationsOfPayload(sb).length === 0, "payload com vínculo de cobertura é aceito pelo RTDB");
}

// ── 16. Guarda contra regressão futura: texto perigoso em todo campo ──────────
console.log("\n[16] Guarda: texto perigoso em todos os campos digitáveis");
{
  const sb = loadSandbox();
  const A = sb.AppData;
  const perigoso = 'Jr. #1 [chefe] 50%/dia $';
  A.updateCompanyInfo({ legalName: `Chez Pitu ${perigoso}`, cnpj: "12.345.678/0001-90", responsibleName: perigoso }, CO);
  A.upsertEmployee({ name: `Maria ${perigoso}`, role: perigoso, status: "Ativo", admissionDate: "2025-01-10" }, { company: CO });
  const emp = A.getCompanyData(CO).employees[0];
  A.addHoliday({ name: `Feriado ${perigoso}`, date: "2026-06-13" }, { company: CO });
  const h = A.getCompanyData(CO).holidays[0];
  A.addManualWorkedEmployee(h.id, emp.id, { company: CO });
  A.setManualScale(emp.id, "2026-06-10", "FOLGA", { company: CO });
  A.addAbsence({ employeeId: emp.id, type: "Outro", reason: perigoso, startDate: "2026-06-01", endDate: "2026-06-02" }, { company: CO });
  A.removeWorkedEmployeeFromHoliday(h.id, emp.id, { company: CO });
  A.removeHolidayEverywhere("2026-06-13", `Feriado ${perigoso}`, { companies: [CO] });

  const v = violationsOfPayload(sb);
  assert(v.length === 0, `nenhuma chave é montada com texto do usuário sem escape${v.length ? " — " + v[0] : ""}`);
  assert(
    JSON.stringify(A.state.companies[CO].companyInfo).includes(perigoso),
    "o texto digitado continua íntegro no VALOR (só a CHAVE é escapada)"
  );
}

console.log(`\n=== RESULTADO: ${passed} asserções OK, ${failed} falha(s) ===\n`);
process.exit(failed ? 1 : 0);
