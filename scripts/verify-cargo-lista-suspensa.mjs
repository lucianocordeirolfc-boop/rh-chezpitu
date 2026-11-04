/**
 * Campo Cargo em lista suspensa no pop-up de funcionário (js/funcionarios.js),
 * no Chrome real.
 *
 * Roda o módulo verdadeiro com um AppData em memória: nenhum dado de produção é
 * lido ou gravado. upsertEmployee só captura o que o formulário enviaria.
 *
 * Uso: node scripts/verify-cargo-lista-suspensa.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ FALHOU: ${msg}`); }
}

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Chrome/Edge não encontrado — instale o Chrome para rodar esta suíte.");
  process.exit(1);
}

const base = { cpf: "", ctps: "1", department: "Salão", admissionDate: "2024-01-15", fixedDay: "", defaultShift: "", vtDaily: 0, source: "manual" };
const EMPLOYEES = {
  "Chez Pitu": [
    { ...base, id: "e1", name: "Ana Fixture", role: "Garçom", status: "Ativo" },
    { ...base, id: "e2", name: "Bia Fixture", role: "Recepcionista", status: "Ativo" },
    { ...base, id: "e3", name: "Caio Fixture", role: "Camareira", status: "Inativo" },
    { ...base, id: "e4", name: "Davi Fixture", role: "", status: "Ativo" }
  ],
  Pengold: [{ ...base, id: "p1", name: "Eva Fixture", role: "Cozinheiro", status: "Ativo" }]
};

const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const moduleSource = fs.readFileSync(path.join(root, "js/funcionarios.js"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
// Usa a normalização verdadeira de data.js, para o teste não divergir dela.
const normalizeSource = dataSource.match(/function normalizeSearchText\(value\) \{[\s\S]*?\n {2}\}/)?.[0];
if (!normalizeSource) {
  console.error("normalizeSearchText não encontrada em js/data.js.");
  process.exit(1);
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${css}</style></head><body>
<div id="host"></div>
<script>
  ${normalizeSource}
  window.__data = ${JSON.stringify(EMPLOYEES)};
  window.__saved = [];
  window.__alerts = [];
  window.alert = (m) => window.__alerts.push(m);
  window.AppData = {
    COMPANIES: ["Chez Pitu", "Pengold"],
    WEEK_DAYS: ["Segunda"],
    SCALE_CODES: [],
    normalizeSearchText,
    getCompanies: () => ["Chez Pitu", "Pengold"],
    getCompanyData: (c) => ({ employees: window.__data[c] || [], companyInfo: {} }),
    getActiveCompany: () => "Chez Pitu",
    getPageCompany: () => "Chez Pitu",
    getPrimaryPageCompany: () => "Chez Pitu",
    isPageCompanyAll: () => false,
    sortEmployeesByName: (l) => [...l].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    isEmployeeActive: (e) => e.status === "Ativo",
    canDeleteEmployee: () => false,
    todayISO: () => "2026-11-04",
    formatDateBR: (v) => v || "",
    formatVtInput: (v) => String(v ?? ""),
    formatVtCurrency: (v) => String(v ?? ""),
    parseVtDaily: (v) => Number(v) || 0,
    getFixedDayChangeInfo: () => null,
    resolveFixedDayForDate: (e) => e.fixedDay || "",
    getNextMonthFirstDay: () => "2026-12-01",
    upsertEmployee: (payload, company) => window.__saved.push({ payload, company })
  };
  window.ImportUtils = { importModalMarkup: () => "", bindImportModal: () => {} };
  window.App = {
    renderCurrent: () => {},
    toast: () => {},
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  };
</script>
<script>${moduleSource}</script>
<script>window.FuncionariosModule.render(document.getElementById("host"));</script>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  const openNew = () => page.evaluate(() => document.getElementById("btnNewEmployee").click());
  const openEdit = (id) => page.evaluate((empId) => document.querySelector(`[data-edit="${empId}"]`).click(), id);
  const roleState = () =>
    page.evaluate(() => {
      const select = document.getElementById("roleSelect");
      const input = document.getElementById("newRoleInput");
      return {
        tag: document.querySelector("#employeeForm [name='role']").tagName,
        options: [...select.options].map((o) => o.value),
        value: select.value,
        inputVisible: input.style.display !== "none",
        inputValue: input.value,
        valid: select.checkValidity()
      };
    });
  const choose = (value, typed) =>
    page.evaluate((v, t) => {
      const select = document.getElementById("roleSelect");
      select.value = v;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      if (t !== undefined) document.getElementById("newRoleInput").value = t;
    }, value, typed);
  const submit = (fields = {}) =>
    page.evaluate(async (values) => {
      window.__saved = [];
      window.__alerts = [];
      const form = document.getElementById("employeeForm");
      Object.entries(values).forEach(([k, v]) => { form.elements[k].value = v; });
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      return { saved: window.__saved, alerts: window.__alerts, open: Boolean(document.getElementById("employeePopup")) };
    }, fields);
  const NEW_FIELDS = { name: "Novo Fixture", cpf: "000", ctps: "1", department: "Salão" };

  console.log("[1] Formulário de novo funcionário");
  await openNew();
  let state = await roleState();
  assert(state.tag === "SELECT", "Cargo é lista suspensa, não campo de digitação");
  assert(
    JSON.stringify(state.options) ===
      JSON.stringify(["", "Camareira", "Cozinheiro", "Garçom", "Recepcionista", "__new_role__"]),
    `lista ordenada, sem vazios, incluindo inativos e as 2 empresas (${state.options.join(" | ")})`
  );
  assert(state.value === "" && !state.valid, "começa sem cargo e o campo obrigatório bloqueia o envio");
  assert(!state.inputVisible, "campo de novo cargo começa oculto");

  console.log("[2] Escolher da lista");
  await choose("Garçom");
  let result = await submit(NEW_FIELDS);
  assert(result.saved[0]?.payload.role === "Garçom", "salva exatamente o cargo escolhido");
  assert(result.saved[0]?.company === "Chez Pitu", "salva na empresa da aba ativa");

  console.log("[3] Cadastrar novo cargo");
  await openNew();
  await choose("__new_role__");
  state = await roleState();
  assert(state.inputVisible, "opção de novo cargo mostra o campo de digitação");
  result = await submit({ ...NEW_FIELDS });
  assert(result.saved.length === 0 && result.alerts.length === 1, "novo cargo vazio não salva e avisa");
  assert(result.open, "pop-up continua aberto após o aviso");

  await page.evaluate(() => { document.getElementById("newRoleInput").value = "  Chefe   de  Bar "; });
  result = await submit(NEW_FIELDS);
  assert(result.saved[0]?.payload.role === "Chefe de Bar", `cargo novo salvo sem espaços sobrando (${result.saved[0]?.payload.role})`);
  assert(!Object.values(result.saved[0]?.payload || {}).includes("__new_role__"), "marcador interno nunca chega ao dado");

  console.log("[4] Mesma palavra com outra grafia não duplica");
  for (const typed of ["garcom", "GARÇOM", " Garçom "]) {
    await openNew();
    await choose("__new_role__", typed);
    result = await submit(NEW_FIELDS);
    assert(result.saved[0]?.payload.role === "Garçom", `"${typed}" vira o "Garçom" da lista`);
  }

  console.log("[5] Trocar de novo cargo para a lista limpa o digitado");
  await openNew();
  await choose("__new_role__", "Rascunho");
  await choose("Recepcionista");
  state = await roleState();
  assert(!state.inputVisible && state.inputValue === "", "campo de novo cargo some e é limpo");
  result = await submit(NEW_FIELDS);
  assert(result.saved[0]?.payload.role === "Recepcionista", "vale o cargo escolhido na lista");

  console.log("[6] Edição preserva o cargo já salvo");
  await openEdit("e1");
  state = await roleState();
  assert(state.value === "Garçom" && !state.inputVisible, "abre com o cargo atual selecionado");
  result = await submit();
  assert(result.saved[0]?.payload.role === "Garçom", "salvar sem mexer mantém o cargo");
  assert(result.saved[0]?.payload.id === "e1", "edição mantém o id do funcionário");

  // Inativo fica fora da lista por regra: chega-se a ele pelo filtro de Status.
  const filterStatus = (value) =>
    page.evaluate((v) => {
      const filter = document.getElementById("employeeFilterStatus");
      filter.value = v;
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  await filterStatus("Inativo");
  await openEdit("e3");
  state = await roleState();
  assert(state.value === "Camareira", "funcionário inativo abre com o próprio cargo");
  await page.evaluate(() => document.getElementById("employeePopupCancel").click());
  await filterStatus("todos");

  await openEdit("e4");
  state = await roleState();
  assert(state.value === "" && !state.inputVisible, "cadastro antigo sem cargo abre em branco, sem inventar valor");
  await page.evaluate(() => document.getElementById("employeePopupCancel").click());

  console.log("[7] Cargo com caractere especial");
  await page.evaluate(() => {
    window.__data["Chez Pitu"][0].role = 'Aux. "A" & <B>';
    window.FuncionariosModule.render(document.getElementById("host"));
  });
  await openEdit("e1");
  state = await roleState();
  assert(state.value === 'Aux. "A" & <B>', "cargo com aspas e símbolos é selecionado intacto");
  result = await submit();
  assert(result.saved[0]?.payload.role === 'Aux. "A" & <B>', "e salvo intacto");
} finally {
  await browser.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
