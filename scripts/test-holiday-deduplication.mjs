/**
 * TESTE: Deduplicação de Feriados
 *
 * Valida:
 * 1. Feriados duplicados são detectados e mesclados
 * 2. workedEmployees únicos são preservados
 * 3. Caso CAMILA (Pengold) - Corpus Christi não aparece duas vezes
 */

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${message}`);
}

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

function testDeduplication() {
  console.log("\n=== TESTE: Deduplicação de Feriados ===\n");

  const navigator = { onLine: true };
  const storage = createStorage();
  const app = loadAppData(storage, navigator);
  const AppData = app.AppData;

  // Setup: Criar estado com feriados duplicados
  console.log("[Setup] Inicializando com feriados duplicados (Corpus Christi)...");

  const pengoldData = AppData.getCompanyData("Pengold");
  pengoldData.employees.push({
    id: "e-camila",
    name: "CAMILA DE SOUZA PEREIRA",
    role: "Garçonete",
    department: "Café da Manhã",
    admissionDate: "2020-01-01",
    company: "Pengold",
    status: "Ativo"
  });

  // Criar dois registros de Corpus Christi (04/06/2026) - DUPLICADO
  const holiday1 = {
    id: "holiday-1",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      {
        employeeId: "e-camila",
        compensationDate: "2026-06-12",
        status: "Agendado",
        linkedFromScale: true,
        scaleCoDate: "2026-06-12"
      }
    ]
  };

  const holiday2 = {
    id: "holiday-2",
    name: "Corpus Christi",
    date: "2026-06-04",
    workedEmployees: [
      {
        employeeId: "e-camila",
        compensationDate: "",
        status: "Pendente",
        autoCreated: true,
        origin: "Automático pela escala"
      }
    ]
  };

  pengoldData.holidays.push(holiday1, holiday2);
  AppData.saveState();

  // Teste 1: Detectar duplicatas
  console.log("\n[Teste 1] Detectar feriados duplicados");
  const beforeCount = pengoldData.holidays.filter((h) =>
    h.name === "Corpus Christi" && h.date === "2026-06-04"
  ).length;
  assert(
    beforeCount === 2,
    `Deve existir 2 registros de Corpus Christi (encontrado: ${beforeCount})`
  );

  // Teste 2: Deduplicar
  console.log("\n[Teste 2] Executar deduplicação");
  const result = AppData.findOrMergeDuplicateHolidays("Pengold", { save: true });
  assert(result.merged === 1, `Deve mesclar 1 duplicata (mesclado: ${result.merged})`);

  // Teste 3: Verificar consolidação
  console.log("\n[Teste 3] Validar consolidação após merge");
  const corpusChristiRecords = pengoldData.holidays.filter((h) =>
    !h.isDeleted && h.name === "Corpus Christi" && h.date === "2026-06-04"
  );
  assert(
    corpusChristiRecords.length === 1,
    `Deve existir apenas 1 Corpus Christi ativo (encontrado: ${corpusChristiRecords.length})`
  );

  if (corpusChristiRecords.length === 1) {
    const consolidated = corpusChristiRecords[0];
    assert(
      consolidated.workedEmployees.length === 1,
      `Deve ter 1 funcionário trabalhado (encontrado: ${consolidated.workedEmployees.length})`
    );

    const camilaRecord = consolidated.workedEmployees.find((w) => w.employeeId === "e-camila");
    assert(
      camilaRecord && camilaRecord.compensationDate === "2026-06-12",
      `Deve manter compensação agendada (12/06/2026), encontrado: ${camilaRecord?.compensationDate}`
    );

    assert(
      camilaRecord && camilaRecord.status === "Agendado",
      `Deve manter status Agendado (não Pendente), encontrado: ${camilaRecord?.status}`
    );
  }

  // Teste 4: Soft delete registrado
  console.log("\n[Teste 4] Validar soft delete");
  const deleted = pengoldData.holidays.filter((h) => h.isDeleted && h.name === "Corpus Christi");
  assert(
    deleted.length === 1,
    `Deve ter 1 registro marcado como deletado (encontrado: ${deleted.length})`
  );

  // Teste 5: Deduplicação de múltiplas empresas
  console.log("\n[Teste 5] Deduplicação global");
  const globalResult = AppData.deduplicateAllHolidays({ save: true });
  assert(
    typeof globalResult === "object",
    `deduplicateAllHolidays deve retornar objeto com resultados`
  );

  // Teste 6: Múltiplos funcionários não têm conflito
  console.log("\n[Teste 6] Múltiplos funcionários em mesmo feriado (sem conflito)");
  pengoldData.employees.push({
    id: "e-joao",
    name: "JOÃO DA SILVA",
    role: "Garçom",
    department: "Restaurante",
    admissionDate: "2020-01-01",
    company: "Pengold",
    status: "Ativo"
  });

  // Restaurar holiday para adicionar segundo funcionário
  const corpusAfter = pengoldData.holidays.find((h) =>
    !h.isDeleted && h.name === "Corpus Christi" && h.date === "2026-06-04"
  );
  if (corpusAfter) {
    corpusAfter.workedEmployees.push({
      employeeId: "e-joao",
      compensationDate: "2026-06-13",
      status: "Agendado"
    });
    AppData.saveState();

    assert(
      corpusAfter.workedEmployees.length === 2,
      `Deve ter 2 funcionários (Camila + João)`
    );
  }
}

function seedEmployee(data, id, name, department = "Café da Manhã", company = "Pengold") {
  data.employees.push({
    id,
    name,
    role: "Garçonete",
    department,
    admissionDate: "2020-01-01",
    company,
    status: "Ativo"
  });
}

// Req 10 — Ano Novo 2026 duplicado mesclado corretamente
function testAnoNovoMerge() {
  console.log("\n=== TESTE: Ano Novo 2026 duplicado ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Chez Pitu");
  seedEmployee(data, "e-ana", "ANA LIMA", "Recepção", "Chez Pitu");

  // Isola o teste do seed retroativo (Ano Novo 01/01/2026 é semeado no load):
  // remove qualquer feriado pré-existente nesta data para medir apenas as
  // duplicatas fabricadas abaixo.
  data.holidays = data.holidays.filter((h) => h.date !== "2026-01-01");

  data.holidays.push(
    { id: "an-1", name: "Ano Novo", date: "2026-01-01", workedEmployees: [
      { employeeId: "e-ana", compensationDate: "", status: "Pendente" }
    ] },
    { id: "an-2", name: "ANO NOVO", date: "2026-01-01", workedEmployees: [
      { employeeId: "e-ana", compensationDate: "2026-03-01", status: "Compensado" }
    ] }
  );

  const result = AppData.findOrMergeDuplicateHolidays("Chez Pitu", { save: true });
  assert(result.merged === 1, `Deve mesclar 1 Ano Novo duplicado (mesclado: ${result.merged})`);

  const active = data.holidays.filter((h) => !h.isDeleted && h.date === "2026-01-01");
  assert(active.length === 1, `Deve restar 1 Ano Novo ativo (encontrado: ${active.length})`);
  const ana = active[0]?.workedEmployees.find((w) => w.employeeId === "e-ana");
  assert(ana?.status === "Compensado", `Compensado deve prevalecer sobre Pendente (status: ${ana?.status})`);
  assert(ana?.compensationDate === "2026-03-01", `Deve preservar data de compensação (${ana?.compensationDate})`);
}

// Req 5/6 — vínculo compensado nunca vira pendente, independente da ordem
function testCompensadoNaoViraPendente() {
  console.log("\n=== TESTE: Compensado não vira Pendente ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Pengold");
  seedEmployee(data, "e-bia", "BIANCA ROCHA");

  // Ordem invertida: pendente primeiro, compensado depois
  data.holidays.push(
    { id: "tp-1", name: "Tiradentes", date: "2026-04-21", workedEmployees: [
      { employeeId: "e-bia", compensationDate: "", status: "Pendente" }
    ] },
    { id: "tp-2", name: "Tiradentes", date: "2026-04-21", workedEmployees: [
      { employeeId: "e-bia", compensationDate: "2026-05-01", scaleCoDate: "2026-05-01", linkedFromScale: true, status: "Compensado" }
    ] }
  );

  AppData.findOrMergeDuplicateHolidays("Pengold", { save: true });
  const active = data.holidays.filter((h) => !h.isDeleted && h.date === "2026-04-21");
  assert(active.length === 1, `Deve restar 1 Tiradentes ativo (encontrado: ${active.length})`);
  const bia = active[0]?.workedEmployees.find((w) => w.employeeId === "e-bia");
  assert(bia?.status === "Compensado", `Deve manter Compensado mesmo entrando depois (status: ${bia?.status})`);
}

// Req 9 — idempotência: rodar várias vezes não muda o resultado
function testIdempotencia() {
  console.log("\n=== TESTE: Idempotência ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Pengold");
  seedEmployee(data, "e-cau", "CAUÊ DIAS");
  data.holidays.push(
    { id: "nat-1", name: "Natal", date: "2026-12-25", workedEmployees: [{ employeeId: "e-cau", status: "Pendente" }] },
    { id: "nat-2", name: "Natal", date: "2026-12-25", workedEmployees: [{ employeeId: "e-cau", status: "Pendente" }] }
  );

  const first = AppData.findOrMergeDuplicateHolidays("Pengold", { save: true });
  const second = AppData.findOrMergeDuplicateHolidays("Pengold", { save: true });
  assert(first.merged === 1, `Primeira passada mescla 1 (mesclado: ${first.merged})`);
  assert(second.merged === 0, `Segunda passada não mescla nada (mesclado: ${second.merged})`);
  const active = data.holidays.filter((h) => !h.isDeleted && h.date === "2026-12-25");
  assert(active.length === 1, `Continua com 1 Natal ativo (encontrado: ${active.length})`);
}

// Req 1/7 — dedup do calendário global (state.calendarHolidays) une empresas
function testCalendarDedup() {
  console.log("\n=== TESTE: Calendário global deduplicado ===\n");
  const storage = createStorage();
  let app = loadAppData(storage, { onLine: true });
  let AppData = app.AppData;
  AppData.state.calendarHolidays = [
    { id: "c1", name: "Corpus Christi", date: "2026-06-04", companies: ["Chez Pitu"] },
    { id: "c2", name: "CORPUS CHRISTI", date: "2026-06-04", companies: ["Pengold"] }
  ];
  AppData.saveState();

  // Recarrega: finalizeIncomingState deve deduplicar o calendário
  app = loadAppData(storage, { onLine: true });
  AppData = app.AppData;
  const corpus = AppData.state.calendarHolidays.filter((h) => h.date === "2026-06-04");
  assert(corpus.length === 1, `Calendário deve ter 1 Corpus Christi (encontrado: ${corpus.length})`);
  assert(
    corpus[0] && corpus[0].companies.includes("Chez Pitu") && corpus[0].companies.includes("Pengold"),
    `Deve unir as empresas (companies: ${JSON.stringify(corpus[0]?.companies)})`
  );
}

// Req 7 — dedup automático ao carregar (persistido) + filtro exibe único
function testAutoDedupOnLoad() {
  console.log("\n=== TESTE: Dedup automático ao carregar ===\n");
  const storage = createStorage();
  let app = loadAppData(storage, { onLine: true });
  let AppData = app.AppData;
  const data = AppData.getCompanyData("Pengold");
  seedEmployee(data, "e-dora", "DORA MELO");
  data.holidays.push(
    { id: "px-1", name: "Proclamação da República", date: "2026-11-15", workedEmployees: [{ employeeId: "e-dora", status: "Pendente" }] },
    { id: "px-2", name: "Proclamação da República", date: "2026-11-15", workedEmployees: [{ employeeId: "e-dora", compensationDate: "2026-11-20", status: "Agendado" }] }
  );
  AppData.saveState();

  // Recarrega do zero — normalizeCompanyHolidays deve deduplicar sozinho
  app = loadAppData(storage, { onLine: true });
  AppData = app.AppData;
  const reloaded = AppData.getCompanyData("Pengold");
  const active = reloaded.holidays.filter((h) => !h.isDeleted && h.date === "2026-11-15");
  assert(active.length === 1, `Após reload deve haver 1 feriado ativo (encontrado: ${active.length})`);

  // Simula o filtro "Feriado": deve listar cada feriado uma única vez
  const seen = new Set();
  const dropdown = reloaded.holidays
    .filter((h) => !h.isDeleted)
    .filter((h) => {
      const key = `${h.date}|${AppData.normalizeSearchText(h.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const reprCount = dropdown.filter((h) => h.date === "2026-11-15").length;
  assert(reprCount === 1, `Filtro deve listar feriado uma única vez (encontrado: ${reprCount})`);
}

// Req 8 — CO não oferece feriado soft-deletado; vínculo CO é religado ao canônico
function testCoExcludesDeletedAndRelinks() {
  console.log("\n=== TESTE: CO ignora soft-delete e religa vínculo ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Pengold");
  seedEmployee(data, "e-edu", "EDUARDA SÁ");

  // Registro pendente (será o canônico por ter CO ligado depois) + registro extra
  data.holidays.push(
    { id: "co-keep", name: "Finados", date: "2026-11-02", workedEmployees: [
      { employeeId: "e-edu", compensationDate: "2026-11-10", scaleCoDate: "2026-11-10", linkedFromScale: true, status: "Agendado", linkedHolidayId: "co-old" }
    ] },
    { id: "co-old", name: "Finados", date: "2026-11-02", workedEmployees: [
      { employeeId: "e-edu", status: "Pendente" }
    ] }
  );
  // CO na escala apontando para o registro que será removido
  data.manualScale["e-edu|2026-11-10"] = { code: "CO", linkedHolidayId: "co-old" };
  AppData.saveState();

  const result = AppData.findOrMergeDuplicateHolidays("Pengold", { save: true });
  assert(result.merged === 1, `Deve mesclar 1 Finados (mesclado: ${result.merged})`);

  const survivor = data.holidays.find((h) => !h.isDeleted && h.date === "2026-11-02");
  const removed = data.holidays.find((h) => h.isDeleted && h.date === "2026-11-02");
  assert(Boolean(survivor) && Boolean(removed), "Deve haver 1 sobrevivente e 1 soft-deletado");

  // O vínculo CO deve apontar para o sobrevivente, não para o id removido
  const coEntry = data.manualScale["e-edu|2026-11-10"];
  assert(
    coEntry.linkedHolidayId === survivor.id,
    `Vínculo CO deve religar para o canônico (${coEntry.linkedHolidayId} === ${survivor.id})`
  );

  // CO não deve oferecer o feriado soft-deletado
  const pending = AppData.getPendingCoHolidaysForEmployee("e-edu", "2026-11-10", { data });
  const offersDeleted = pending.some((p) => p.holiday.isDeleted);
  assert(!offersDeleted, "Modal CO não deve listar feriado soft-deletado");
}

// Req 10 — funcionário/empresa diferentes podem ter o mesmo feriado sem conflito
function testCrossCompanyAndEmployeeNoConflict() {
  console.log("\n=== TESTE: Mesmo feriado em empresas/funcionários diferentes ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;

  const pengold = AppData.getCompanyData("Pengold");
  const chez = AppData.getCompanyData("Chez Pitu");
  seedEmployee(pengold, "e-f1", "FLAVIA P", "Café da Manhã", "Pengold");
  seedEmployee(chez, "e-f2", "FERNANDO C", "Cozinha", "Chez Pitu");

  pengold.holidays.push({ id: "ind-p", name: "Independência", date: "2026-09-07", workedEmployees: [{ employeeId: "e-f1", status: "Pendente" }] });
  chez.holidays.push({ id: "ind-c", name: "Independência", date: "2026-09-07", workedEmployees: [{ employeeId: "e-f2", status: "Pendente" }] });

  const global = AppData.deduplicateAllHolidays({ save: true });
  assert(Object.keys(global).length === 0, `Empresas diferentes não devem mesclar (mesclas: ${JSON.stringify(global)})`);
  assert(pengold.holidays.filter((h) => !h.isDeleted && h.date === "2026-09-07").length === 1, "Pengold mantém seu feriado");
  assert(chez.holidays.filter((h) => !h.isDeleted && h.date === "2026-09-07").length === 1, "Chez Pitu mantém seu feriado");
}

// Dropdown do modal CO (Escala): só feriados realmente disponíveis para compensação
function testCoDropdownAvailability() {
  console.log("\n=== TESTE: Dropdown do modal CO (Escala) ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Chez Pitu");
  seedEmployee(data, "e-cris", "CRISTIANE DA S. AZEVEDO", "Salão", "Chez Pitu");

  const coDate = "2026-07-01"; // data do CO sendo lançado (distinta dos vínculos)

  // A) Pendente genuíno → DEVE aparecer
  data.holidays.push({ id: "d-natal", name: "Natal", date: "2025-12-25", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "", status: "Pendente" }
  ] });
  // B) Agendado (compensação futura) → NÃO deve aparecer
  data.holidays.push({ id: "d-tira", name: "Tiradentes", date: "2026-04-21", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "2026-08-01", status: "Agendado" }
  ] });
  // C) CO já lançado na escala (data futura) → NÃO deve aparecer
  data.holidays.push({ id: "d-fin", name: "Finados", date: "2026-11-02", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "2026-12-10", scaleCoDate: "2026-12-10", linkedFromScale: true, linkedHolidayId: "d-fin", status: "Agendado" }
  ] });
  data.manualScale["e-cris|2026-12-10"] = { code: "CO", linkedHolidayId: "d-fin" };
  // D) Soft-deleted pendente → NÃO deve aparecer
  data.holidays.push({ id: "d-santa", name: "Sexta-Feira Santa", date: "2026-04-03", isDeleted: true, deletedAt: "2026-06-01", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "", status: "Pendente" }
  ] });
  // E) Duplicados mesma chave: Agendado + Pendente → NÃO deve aparecer o Pendente
  data.holidays.push(
    { id: "d-corpus-a", name: "Corpus Christi", date: "2026-06-04", workedEmployees: [
      { employeeId: "e-cris", compensationDate: "2026-08-15", status: "Agendado" }
    ] },
    { id: "d-corpus-b", name: "CORPUS CHRISTI", date: "2026-06-04", workedEmployees: [
      { employeeId: "e-cris", compensationDate: "", status: "Pendente" }
    ] }
  );

  const options = AppData.getAvailableCoHolidayOptions("e-cris", coDate, { company: "Chez Pitu", data });
  const ids = options.map((o) => o.holiday.id);

  assert(ids.includes("d-natal"), `Pendente genuíno (Natal) deve aparecer (ids: ${ids.join(",")})`);
  assert(!ids.includes("d-tira"), "Agendado (Tiradentes) NÃO deve aparecer");
  assert(!ids.includes("d-fin"), "Feriado com CO futuro na escala (Finados) NÃO deve aparecer");
  assert(!ids.includes("d-santa"), "Feriado soft-deleted (Sexta-Feira Santa) NÃO deve aparecer");
  assert(
    !ids.includes("d-corpus-a") && !ids.includes("d-corpus-b"),
    "Duplicado Pendente não aparece quando existe Agendado para a mesma chave"
  );
  assert(options.every((o) => o.item.employeeId === "e-cris"), "Todas as opções pertencem ao employeeId");
  assert(
    options.every((o) => o.status.key === "pendente" || o.status.key === "vencido"),
    "Todas as opções têm status Pendente ou Vencido"
  );

  // Edição: reabrir um CO já vinculado deve manter o feriado selecionável
  const editOptions = AppData.getAvailableCoHolidayOptions("e-cris", "2026-12-10", { company: "Chez Pitu", data });
  assert(
    editOptions.some((o) => o.holiday.id === "d-fin"),
    "Ao editar o próprio CO, o feriado vinculado (Finados) permanece disponível"
  );
}

// Outra empresa pode ter o mesmo feriado pendente sem ser afetada
function testCoDropdownCrossCompany() {
  console.log("\n=== TESTE: Dropdown CO — empresas/funcionários distintos ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const pengold = AppData.getCompanyData("Pengold");
  const chez = AppData.getCompanyData("Chez Pitu");
  seedEmployee(pengold, "e-cam", "CAMILA DE SOUZA PEREIRA", "Café da Manhã", "Pengold");
  seedEmployee(chez, "e-raq", "RAQUEL R. DA COSTA", "Cozinha", "Chez Pitu");

  // Camila: Natal compensado (não deve aparecer). Raquel: mesmo Natal pendente (deve aparecer).
  pengold.holidays.push({ id: "x-cam", name: "Natal", date: "2025-12-25", workedEmployees: [
    { employeeId: "e-cam", compensationDate: "2026-01-05", status: "Compensado" }
  ] });
  chez.holidays.push({ id: "x-raq", name: "Natal", date: "2025-12-25", workedEmployees: [
    { employeeId: "e-raq", compensationDate: "", status: "Pendente" }
  ] });

  const camOpts = AppData.getAvailableCoHolidayOptions("e-cam", "2026-07-01", { company: "Pengold", data: pengold });
  const raqOpts = AppData.getAvailableCoHolidayOptions("e-raq", "2026-07-01", { company: "Chez Pitu", data: chez });

  assert(!camOpts.some((o) => o.holiday.id === "x-cam"), "Camila: Natal compensado NÃO aparece");
  assert(raqOpts.some((o) => o.holiday.id === "x-raq"), "Raquel: mesmo Natal pendente APARECE (sem conflito entre empresas)");
}

// Natal 2025 legado: invisível no Histórico (antes da admissão) não pode aparecer no CO
function testNatal2025NotVisibleBeforeAdmission() {
  console.log("\n=== TESTE: Natal 2025 anterior à admissão (CO == Histórico) ===\n");
  const app = loadAppData(createStorage(), { onLine: true });
  const AppData = app.AppData;
  const data = AppData.getCompanyData("Chez Pitu");

  // Funcionária admitida DEPOIS do Natal 2025
  data.employees.push({
    id: "e-cris",
    name: "CRISTIANE DA S. AZEVEDO",
    role: "Garçonete",
    department: "Salão",
    admissionDate: "2026-02-01",
    company: "Chez Pitu",
    status: "Ativo"
  });

  // Natal 2025 (anterior à admissão) — legado pendente/vencido
  data.holidays.push({ id: "h-natal-2025", name: "Natal", date: "2025-12-25", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "", status: "Pendente" }
  ] });
  // Feriado válido após a admissão — deve continuar aparecendo
  data.holidays.push({ id: "h-tira-2026", name: "Tiradentes", date: "2026-04-21", workedEmployees: [
    { employeeId: "e-cris", compensationDate: "", status: "Pendente" }
  ] });

  // Predicado de visibilidade do Histórico
  const natal = data.holidays.find((h) => h.id === "h-natal-2025");
  const tira = data.holidays.find((h) => h.id === "h-tira-2026");
  assert(
    !AppData.isWorkedEntryVisibleInHistory(natal, natal.workedEmployees[0], data),
    "Natal 2025 NÃO é visível no Histórico (anterior à admissão)"
  );
  assert(
    AppData.isWorkedEntryVisibleInHistory(tira, tira.workedEmployees[0], data),
    "Tiradentes 2026 É visível no Histórico (após a admissão)"
  );

  // Dropdown do modal CO deve refletir exatamente o Histórico
  const options = AppData.getAvailableCoHolidayOptions("e-cris", "2026-07-01", { company: "Chez Pitu", data });
  const ids = options.map((o) => o.holiday.id);
  assert(!ids.includes("h-natal-2025"), "Natal 2025 NÃO aparece no dropdown do modal CO");
  assert(ids.includes("h-tira-2026"), "Feriado válido (Tiradentes 2026) continua aparecendo no modal CO");

  // Garantia explícita: dropdown CO ⊆ Histórico válido
  const historyValidIds = new Set(
    data.holidays
      .filter((h) => !h.isDeleted)
      .flatMap((h) => (h.workedEmployees || [])
        .filter((it) => it.employeeId === "e-cris" && AppData.isWorkedEntryVisibleInHistory(h, it, data))
        .map(() => h.id))
  );
  assert(
    ids.every((id) => historyValidIds.has(id)),
    "Toda opção do modal CO existe no Histórico válido (subconjunto)"
  );
}

// Executar testes
testDeduplication();
testNatal2025NotVisibleBeforeAdmission();
testCoDropdownAvailability();
testCoDropdownCrossCompany();
testAnoNovoMerge();
testCompensadoNaoViraPendente();
testIdempotencia();
testCalendarDedup();
testAutoDedupOnLoad();
testCoExcludesDeletedAndRelinks();
testCrossCompanyAndEmployeeNoConflict();

console.log(`\n=== RESUMO ===`);
console.log(`Aprovadas: ${passed}`);
console.log(`Erros: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
