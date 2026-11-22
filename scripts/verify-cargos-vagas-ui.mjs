/**
 * Cargos e Salários + Quadro de Vagas + Cadastro de Funcionários, no Chrome real.
 *
 * Carrega os módulos VERDADEIROS numa página file:// com perfil temporário:
 * o localStorage é do navegador de teste e não há Firebase — nenhum dado de
 * produção é lido ou gravado.
 *
 * Cobre: padronização pela tela (com confirmação); edição de função com CBO e
 * salário; CBO repetido recusado; sub-aba Comissões; Cadastro de Funcionários
 * com Cargo em lista suspensa vinda do catálogo, CBO/salário somente leitura e
 * vínculo roleId; cargo legado sinalizado e preservado; Quadro de Vagas
 * (vaga, Painel RH, R&S, Admissões); separação por empresa.
 *
 * Uso: node scripts/verify-cargos-vagas-ui.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-cargos-ui-"));
const fileUrl = (rel) => pathToFileURL(path.join(root, rel)).href;
const htmlPath = path.join(tmp, "cargos.html");
const scripts = [
  "js/import-utils.js", "js/data.js", "js/lixeira.js", "js/inactive-employees.js", "js/xlsx-export.js",
  "js/rh-catalog.js", "js/funcionarios.js", "js/cargos.js", "js/quadro-vagas.js", "js/rh-reports.js"
];
fs.writeFileSync(
  htmlPath,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
${["css/style.css", "css/funcionarios.css", "css/ausencias.css", "css/rh-catalog.css"].map((c) => `<link rel="stylesheet" href="${fileUrl(c)}">`).join("\n")}
</head><body>
<div id="toastContainer"></div>
<main class="app-content">
<section id="cargos" class="module active"></section>
<section id="funcionarios" class="module"></section>
<section id="quadro-vagas" class="module"></section>
</main>
<script>
  window.__toasts = [];
  window.__alerts = [];
  window.__confirms = [];
  window.confirm = (m) => { window.__confirms.push(m); return !window.__confirmNo; };
  window.alert = (m) => window.__alerts.push(m);
  window.prompt = () => null;
  window.App = {
    renderCurrent: () => {},
    toast: (m, t) => window.__toasts.push({ m, t }),
    formatDisplayName: (n) => String(n || ""),
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  };
</script>
${scripts.map((s) => `<script src="${fileUrl(s)}"></script>`).join("\n")}
</body></html>`
);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-cargos-profile-"));
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  userDataDir,
  args: ["--no-sandbox", "--allow-file-access-from-files"]
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

  await page.evaluate(() => {
    const A = window.AppData;
    A.setActiveCompany("Chez Pitu");
    const base = { cpf: "", ctps: "1", admissionDate: "2020-01-01", fixedDay: "", defaultShift: "", vtDaily: 0, source: "manual" };
    const co = A.getCompanyData("Chez Pitu");
    co.employees = [
      { ...base, id: "e1", cpf: "529.982.247-25", name: "Ana Fixture", role: "GARÇON", department: "BAR", status: "Ativo" },
      { ...base, id: "e2", cpf: "111.444.777-35", name: "Bia Fixture", role: "Enc. De Manutenção", department: "MANUTENÇÃO", status: "Ativo" },
      { ...base, id: "e3", cpf: "123.456.789-09", name: "Caio Fixture", role: "Garçom", department: "BAR", status: "Inativo" }
    ];
    ["cargos", "comissoes", "vagas", "candidatos", "admissoes"].forEach((c) => { co[c] = []; A.getCompanyData("Pengold")[c] = []; });
    A.getCompanyData("Pengold").employees = [{ ...base, id: "p1", name: "Eva Pengold", role: "BARMAN", department: "BAR", status: "Ativo" }];
    window.__render = (id, mod) => {
      document.querySelectorAll(".module").forEach((sec) => sec.classList.toggle("active", sec.id === id));
      window[mod].render(document.getElementById(id));
    };
  });

  const $eval = (fn, ...args) => page.evaluate(fn, ...args);

  console.log("[1] Cargos e Salários — padronizar pela tela");
  await $eval(() => window.__render("cargos", "CargosModule"));
  let s = await $eval(() => ({
    title: document.querySelector("#cargos .func-module-title")?.textContent,
    std: document.getElementById("btnStandardizeRoles")?.textContent || "",
    tabs: [...document.querySelectorAll("#cargos [data-rh-tab]")].map((b) => b.textContent.trim()),
    empty: Boolean(document.querySelector("#cargos .rh-empty"))
  }));
  assert(s.title === "Cargos e Salários" && s.tabs.join("|") === "Funções e Salários|Comissões", "aba com sub-abas Funções e Salários / Comissões");
  assert(/\(3\)/.test(s.std) && s.empty, "botão de padronização com 3 funcionários pendentes e tabela vazia");
  await $eval(() => document.getElementById("btnStandardizeRoles").click());
  s = await $eval(() => [...document.querySelectorAll("#rhPopup .rh-std-input")].map((i) => i.value));
  assert(s.join("|") === "Encarregado de Manutenção|Garçom", `grafias sugeridas: ${s.join(", ")}`);
  const untouched = await $eval(() => JSON.stringify(AppData.getCompanyData("Chez Pitu").employees));
  assert(!untouched.includes("roleId"), "abrir o quadro não grava nada");
  await $eval(() => document.getElementById("btnApplyStandardization").click());
  s = await $eval(() => ({
    confirm: window.__confirms.at(-1) || "",
    rows: [...document.querySelectorAll("#cargos .rh-table tbody tr")].map((tr) => tr.querySelector("td strong")?.textContent),
    emp: AppData.getCompanyData("Chez Pitu").employees.map((e) => `${e.role}|${Boolean(e.roleId)}`)
  }));
  assert(/GARÇON → Garçom/.test(s.confirm) && /2 função/.test(s.confirm), "confirmação lista as grafias alteradas e as funções novas");
  assert(s.rows.join("|") === "Encarregado de Manutenção|Garçom", "funções criadas na tabela");
  assert(s.emp.join(",") === "Garçom|true,Encarregado de Manutenção|true,Garçom|true", "funcionários padronizados e vinculados (inclusive inativo)");

  console.log("[2] Editar função: CBO, salário, comissões; CBO repetido recusado");
  const editCargo = async (name, cbo, salary, commissions = []) => {
    await $eval((n) => {
      const id = RhCatalog.findCargoByName("Chez Pitu", n).id;
      document.querySelector(`[data-edit-cargo="${id}"]`).click();
    }, name);
    await $eval((c, sal, coms) => {
      const f = document.getElementById("cargoForm");
      f.elements.cbo.value = c;
      f.elements.cbo.dispatchEvent(new Event("input"));
      f.elements.salary.value = sal;
      coms.forEach((id) => { f.querySelector(`input[name="commissions"][value="${id}"]`).checked = true; });
      f.requestSubmit();
    }, cbo, salary, commissions);
  };
  await editCargo("Garçom", "513405", "1.850,00", ["taxa-servico-bar"]);
  s = await $eval(() => RhCatalog.findCargoByName("Chez Pitu", "Garçom"));
  assert(s.cbo === "5134-05" && s.salary === 1850 && s.commissions[0] === "taxa-servico-bar", "função salva com CBO mascarado, salário e comissão");
  s = await $eval(() => document.querySelector("#cargos .rh-table tbody").textContent);
  assert(s.includes("5134-05") && s.includes("1.850,00") && s.includes("Taxa de Serviço Bar"), "tabela mostra CBO, salário e comissão");
  await $eval(() => { window.__confirmNo = true; });
  await editCargo("Encarregado de Manutenção", "5134-05", "2500");
  s = await $eval(() => ({ confirm: window.__confirms.at(-1) || "", open: Boolean(document.getElementById("cargoForm")), cbo: RhCatalog.findCargoByName("Chez Pitu", "Encarregado de Manutenção").cbo }));
  await $eval(() => { window.__confirmNo = false; });
  assert(/CBO 5134-05 já está atribuído à função "Garçom"/.test(s.confirm) && /Deseja atribuir o mesmo CBO/.test(s.confirm), "CBO de outra função: avisa e pede confirmação");
  assert(s.open && s.cbo === "", "recusando, nada é gravado e o formulário continua aberto");
  await $eval(() => {
    const f = document.getElementById("cargoForm");
    f.elements.cbo.value = "9101-05";
    const mode = document.getElementById("cargoInsalubridadeMode");
    mode.value = "outro";
    mode.dispatchEvent(new Event("change"));
    window.__outroVisible = document.getElementById("cargoInsalubridadeOutro").style.display !== "none";
    document.getElementById("cargoInsalubridadeOutro").value = "";
    f.requestSubmit();
  });
  s = await $eval(() => ({ alert: window.__alerts.at(-1), open: Boolean(document.getElementById("cargoForm")), outro: window.__outroVisible }));
  assert(s.outro && /percentual de insalubridade/.test(s.alert) && s.open, "insalubridade 'Outro percentual' exige o valor");
  await $eval(() => {
    const mode = document.getElementById("cargoInsalubridadeMode");
    mode.value = "40";
    mode.dispatchEvent(new Event("change"));
    const base = document.getElementById("cargoInsalubridadeBase");
    window.__baseEnabled = !base.disabled;
    base.value = "1.518,00";
    base.dispatchEvent(new Event("input"));
    window.__valorPreview = document.getElementById("cargoInsalubridadeValor").value;
    document.getElementById("cargoForm").requestSubmit();
  });
  s = await $eval(() => ({ en: window.__baseEnabled, prev: window.__valorPreview }));
  assert(s.en && /607,20/.test(s.prev), "salário base ao lado da insalubridade; valor calculado na hora (R$ 607,20)");
  s = await $eval(() => RhCatalog.findCargoByName("Chez Pitu", "Encarregado de Manutenção"));
  assert(s.cbo === "9101-05" && s.salary === 2500 && s.insalubridade === 40, "corrigido o CBO, a função é salva com insalubridade grau máximo 40%");
  s = await $eval(() => document.querySelector("#cargos .rh-table tbody").textContent);
  assert(s.includes("40% (grau máximo)") && /607,20 sobre R\$\s1\.518,00/.test(s), "tabela mostra a insalubridade, o valor e a base");

  await $eval(() => {
    document.querySelector(`[data-edit-cargo="${RhCatalog.findCargoByName("Chez Pitu", "Garçom").id}"]`).click();
    const f = document.getElementById("cargoForm");
    f.elements.gratificacao.value = "300,00";
    f.requestSubmit();
  });
  s = await $eval(() => ({ g: RhCatalog.findCargoByName("Chez Pitu", "Garçom").gratificacao, body: document.querySelector("#cargos .rh-table tbody").textContent }));
  assert(s.g === 300 && /300,00/.test(s.body), "gratificação salva no formato do salário e exibida na tabela");

  console.log("[2b] Relatório PDF — Cargos e Salários");
  await $eval(() => {
    window.__printed = [];
    window.RhReports.printHTML = (html, title) => window.__printed.push({ html, title });
    document.querySelector("#cargos [data-rh-report]").click();
  });
  s = await $eval(() => [...document.querySelectorAll("#rhReportOptions input[name='rhReportSection']")].map((i) => i.value));
  assert(s.join("|") === "funcoes|comissoes|funcionarios", "janela com as seções do relatório");
  await $eval(() => document.querySelector("#rhReportOptions [data-report-go]").click());
  s = await $eval(() => window.__printed[0]);
  assert(s && /^cargos-e-salarios-chez-pitu-\d{4}-\d{2}-\d{2}$/.test(s.title) && s.html.includes("Encarregado de Manutenção") && s.html.includes("607,20"), "Gerar PDF monta o relatório com nome de arquivo sugerido");
  assert(s.html.includes("Gratificação") && /300,00/.test(s.html), "relatório traz a gratificação");
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(s.html, { waitUntil: "load" });
  const pdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(tmp, "cargos.pdf"), pdf);
  await pdfPage.setViewport({ width: 900, height: 1100 });
  await pdfPage.emulateMediaType("print");
  await pdfPage.screenshot({ path: path.join(tmp, "relatorio-cargos.png"), fullPage: true });
  await pdfPage.close();
  assert(pdf.length > 5000 && Buffer.from(pdf).subarray(0, 4).toString() === "%PDF", `PDF gerado pelo Chrome (${pdf.length} bytes)`);
  await page.screenshot({ path: path.join(tmp, "funcoes.png") });

  console.log("[3] Sub-aba Comissões");
  await $eval(() => document.querySelector('[data-rh-tab="comissoes"]').click());
  s = await $eval(() => [...document.querySelectorAll(".rh-commission-card h3")].map((h) => h.textContent));
  assert(s.length === 6 && s.includes("Taxa de Serviço Frigobar") && s.includes("Extensão de Diária"), "6 comissões com campo editável");
  await $eval(() => {
    document.querySelector('[data-comissao-desc="walk-in"]').value = "Comissão sobre venda de diária sem reserva.";
    document.querySelector('[data-save-comissao="walk-in"]').click();
  });
  s = await $eval(() => RhCatalog.listComissoes("Chez Pitu").find((c) => c.id === "walk-in").description);
  assert(s === "Comissão sobre venda de diária sem reserva.", "explicação da comissão salva");
  s = await $eval(() => document.querySelector('[data-comissao-desc="taxa-servico-bar"]').closest(".rh-commission-card").textContent);
  assert(s.includes("Funções: Garçom"), "comissão mostra as funções que a recebem");
  await page.screenshot({ path: path.join(tmp, "comissoes.png") });

  console.log("[4] Cadastro de Funcionários — Cargo do catálogo, salário/CBO somente leitura");
  await $eval(() => window.__render("funcionarios", "FuncionariosModule"));
  await $eval(() => document.querySelector('[data-edit="e1"]').click());
  s = await $eval(() => {
    const sel = document.getElementById("roleSelect");
    return {
      options: [...sel.options].map((o) => o.value),
      value: sel.value,
      cbo: document.getElementById("roleCboDisplay")?.value,
      salary: document.getElementById("roleSalaryDisplay")?.value,
      readonly: document.getElementById("roleCboDisplay")?.readOnly && document.getElementById("roleSalaryDisplay")?.readOnly,
      named: Boolean(document.querySelector("#employeeForm [name='salary'], #employeeForm [name='cbo']"))
    };
  });
  assert(s.options.join("|") === "|Encarregado de Manutenção|Garçom", "lista suspensa só com as funções de Cargos e Salários (sem 'Cadastrar novo cargo')");
  assert(s.value === "Garçom" && s.cbo === "5134-05" && /1\.850,00/.test(s.salary), "função vinculada com CBO e salário exibidos");
  assert(s.readonly && !s.named, "CBO e salário são somente leitura e não fazem parte do formulário");
  await page.screenshot({ path: path.join(tmp, "cadastro.png") });
  await $eval(() => {
    const sel = document.getElementById("roleSelect");
    sel.value = "Encarregado de Manutenção";
    sel.dispatchEvent(new Event("change"));
  });
  s = await $eval(() => ({ cbo: document.getElementById("roleCboDisplay").value, salary: document.getElementById("roleSalaryDisplay").value, insal: document.getElementById("roleInsalubridadeDisplay") }));
  assert(s.cbo === "9101-05" && /2\.500,00/.test(s.salary), "trocar a função atualiza CBO e salário na hora");
  s = await $eval(() => ({ v: document.getElementById("roleInsalubridadeDisplay").value, ro: document.getElementById("roleInsalubridadeDisplay").readOnly, named: Boolean(document.querySelector("#employeeForm [name='insalubridade']")) }));
  assert(/^40% \(grau máximo\) — R\$\s607,20$/.test(s.v) && s.ro && !s.named, "insalubridade e valor da função exibidos somente leitura, fora do formulário");
  s = await $eval(() => {
    const sel = document.getElementById("roleSelect");
    sel.value = "Garçom";
    sel.dispatchEvent(new Event("change"));
    const el = document.getElementById("roleGratificacaoDisplay");
    const out = { v: el.value, ro: el.readOnly, named: Boolean(document.querySelector("#employeeForm [name='gratificacao']")) };
    sel.value = "Encarregado de Manutenção";
    sel.dispatchEvent(new Event("change"));
    return out;
  });
  assert(/300,00/.test(s.v) && s.ro && !s.named, "gratificação da função exibida somente leitura, fora do formulário");
  await $eval(() => document.getElementById("employeeForm").requestSubmit());
  s = await $eval(() => AppData.getCompanyData("Chez Pitu").employees.find((e) => e.id === "e1"));
  const enc = await $eval(() => RhCatalog.findCargoByName("Chez Pitu", "Encarregado de Manutenção").id);
  assert(s.role === "Encarregado de Manutenção" && s.roleId === enc, "salvar grava função e roleId");
  assert(!("salary" in s) && !("cbo" in s), "nenhum salário/CBO gravado no funcionário");
  s = await $eval(() => {
    const sheet = window.FuncionariosModule.buildEmployeeExportSheet("Chez Pitu");
    const row = sheet.rows.find((r) => r[3]?.value === "e1");
    const col = (h) => row[sheet.columns.findIndex((c) => c.header === h)];
    return { headers: ["CBO", "Salário (Cargos e Salários)"].filter((h) => sheet.columns.some((c) => c.header === h)), cbo: col("CBO"), salary: col("Salário (Cargos e Salários)"), insal: col("Insalubridade (%)"), insalHeader: "Insalubridade (%)", base: col("Base insalubridade"), valor: col("Valor insalubridade") };
  });
  assert(s.headers.join("|") === "CBO|Salário (Cargos e Salários)" && s.cbo?.value === "9101-05" && s.salary?.type === "currency" && s.salary.value === 2500, "Exportar Excel traz CBO e salário da função");
  assert(s.insalHeader === "Insalubridade (%)" && s.insal === "40% (grau máximo)", "Exportar Excel traz a insalubridade da função");
  assert(s.base?.value === 1518 && s.valor?.value === 607.2, "Exportar Excel traz base e valor da insalubridade");
  s = await $eval(() => {
    const sheet = window.FuncionariosModule.buildEmployeeExportSheet("Chez Pitu");
    const i = sheet.columns.findIndex((c) => c.header === "Gratificação");
    return sheet.rows.find((r) => r[3]?.value === "e3")?.[i];
  });
  assert(s?.type === "currency" && s.value === 300, "Exportar Excel traz a gratificação da função");

  console.log("[5] Cargo legado fora do catálogo é preservado e sinalizado");
  await $eval(() => {
    const co = AppData.getCompanyData("Chez Pitu");
    co.employees.push({ id: "e9", name: "Davi Legado", role: "Lavanderia", department: "LAV", status: "Ativo", cpf: "935.411.347-80", ctps: "1", admissionDate: "2020-01-01" });
    window.__render("funcionarios", "FuncionariosModule");
    document.querySelector('[data-edit="e9"]').click();
  });
  s = await $eval(() => ({
    value: document.getElementById("roleSelect").value,
    hint: document.getElementById("roleCatalogHint").textContent,
    warn: document.getElementById("roleCatalogHint").classList.contains("role-catalog-warn")
  }));
  assert(s.value === "Lavanderia" && s.warn && /não está em Cargos e Salários/.test(s.hint), "cargo legado selecionado com aviso");
  await $eval(() => document.getElementById("employeeForm").requestSubmit());
  s = await $eval(() => AppData.getCompanyData("Chez Pitu").employees.find((e) => e.id === "e9"));
  assert(s.role === "Lavanderia" && !s.roleId, "salvar outros campos não perde o cargo legado");

  console.log("[6] Novo funcionário na Pengold (catálogo vazio = comportamento anterior)");
  await $eval(() => {
    AppData.setActiveCompany("Pengold");
    window.__render("funcionarios", "FuncionariosModule");
    document.getElementById("btnNewEmployee").click();
  });
  s = await $eval(() => ({
    options: [...document.getElementById("roleSelect").options].map((o) => o.value),
    row: Boolean(document.getElementById("roleCatalogRow"))
  }));
  assert(s.options.includes("__new_role__") && !s.row, "Pengold sem catálogo: lista antiga (com 'Cadastrar novo cargo') e sem linha de CBO/salário");
  await $eval(() => document.getElementById("employeePopupCancel")?.click());

  console.log("[7] Quadro de Vagas");
  await $eval(() => {
    AppData.setActiveCompany("Chez Pitu");
    window.__render("quadro-vagas", "QuadroVagasModule");
  });
  s = await $eval(() => [...document.querySelectorAll("[data-vagas-tab]")].map((b) => b.textContent.trim()));
  assert(s.join("|") === "Vagas em aberto|Painel RH|Recrutamento e Seleção|Admissões", "4 sub-abas (guias da planilha)");
  await $eval(() => document.getElementById("btnNewVaga").click());
  s = await $eval(() => [...document.querySelector("#vagasForm [name='cargoId']").options].map((o) => o.textContent));
  assert(s.includes("Garçom") && s.includes("Encarregado de Manutenção"), "cargo da vaga vem de Cargos e Salários");
  await $eval(() => {
    const f = document.getElementById("vagasForm");
    f.elements.cargoId.value = RhCatalog.findCargoByName("Chez Pitu", "Garçom").id;
    f.elements.department.value = "Restaurante";
    f.elements.quantity.value = "2";
    f.elements.contractType.value = "Temporário";
    f.elements.reason.value = "Sazonalidade";
    f.elements.priority.value = "Urgente";
    f.elements.status.value = "Entrevistas";
    f.elements.manager.value = "Jorge";
    f.elements.escolaridade.value = "Ensino médio completo";
    f.elements.atribuicoes.value = "Atender mesas\nServir pratos e bebidas";
    f.elements.requisitosObrigatorios.value = "Experiência como garçom";
    f.elements.requisitosDesejaveis.value = "Inglês básico";
    f.elements.requisitosDiferenciais.value = "Experiência em hotel";
    f.elements.notes.value = "Disponibilidade 08h às 22h. Ensino médio, boa apresentação, experiência em atendimento ao público, preferência por quem já trabalhou em hotel ou restaurante a la carte, residir próximo e ter disponibilidade aos fins de semana e feriados.";
    f.requestSubmit();
  });
  s = await $eval(() => AppData.getCompanyData("Chez Pitu").vagas[0]);
  assert(s.escolaridade === "Ensino médio completo" && s.atribuicoes === "Atender mesas\nServir pratos e bebidas" && s.requisitosObrigatorios === "Experiência como garçom" && s.requisitosDesejaveis === "Inglês básico" && s.requisitosDiferenciais === "Experiência em hotel", "escolaridade, atribuições e os 3 tipos de requisito gravados na vaga");
  s = await $eval(() => document.querySelector("#quadro-vagas .vaga-card-list").textContent);
  assert(s.includes("Garçom") && s.includes("CBO 5134-05") && s.includes("Urgente") && s.includes("Entrevistas") && s.includes("Ensino médio completo"), "vaga em cartão com CBO, prioridade, status e escolaridade");
  assert(["Atribuições do cargo", "Requisitos obrigatórios", "Requisitos desejáveis", "Requisitos diferenciais", "Observações / próxima ação"].every((t) => s.includes(t)), "cartão mostra atribuições, requisitos e observações em blocos");
  s = await $eval(() => {
    const card = document.querySelector(".vaga-card");
    const r = (el) => el.getBoundingClientRect();
    const actions = r(card.querySelector(".vaga-card-actions"));
    const notes = r(card.querySelector(".vaga-perfil-notes"));
    const text = card.querySelector(".vaga-perfil-notes .vaga-perfil-text");
    const overlap = !(actions.right <= notes.left || notes.right <= actions.left || actions.bottom <= notes.top || notes.bottom <= actions.top);
    return { overlap, wraps: r(text).height > 25, inside: r(text).right <= r(card).right + 1, pre: getComputedStyle(card.querySelector(".vaga-perfil-text")).whiteSpace };
  });
  assert(!s.overlap && s.wraps && s.inside, "observação longa quebra linha dentro do cartão, sem encostar em Editar/Excluir");
  assert(s.pre === "pre-line", "quebras de linha digitadas são respeitadas");
  s = await $eval(() => {
    const card = document.querySelector(".vaga-card");
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const qtd = [...card.querySelectorAll(".vaga-card-meta div")].find((d) => d.querySelector("dt").textContent === "Quantidade");
    return {
      cbo: size(card.querySelector(".vaga-card-cbo")),
      title: size(card.querySelector("h3")),
      urgent: size(card.querySelector(".vaga-card-priority .rh-pill")),
      status: size(card.querySelector(".vaga-card-title > .rh-pill")),
      qtd: qtd?.querySelector("dd").textContent,
      admitidos: card.textContent.includes("admitido")
    };
  });
  assert(s.cbo < 12 && s.cbo < s.title, `CBO com fonte menor (${s.cbo}px; título ${s.title}px)`);
  assert(s.urgent >= 13 && s.urgent > s.status, `"Urgente" com fonte maior (${s.urgent}px; status ${s.status}px)`);
  assert(s.qtd === "2" && !s.admitidos, `Quantidade mostra só o número ("${s.qtd}"), sem admitidos nesta aba`);
  const metaRows = () =>
    $eval(() => {
      const items = [...document.querySelectorAll(".vaga-card .vaga-card-meta > div")];
      const tops = [...new Set(items.map((d) => Math.round(d.getBoundingClientRect().top)))];
      const cut = items.map((d) => d.querySelector("dt")).filter((dt) => dt.scrollWidth > dt.clientWidth + 1).map((dt) => dt.textContent);
      return { n: items.length, rows: tops.length, perRow: tops.map((t) => items.filter((d) => Math.round(d.getBoundingClientRect().top) === t).length), cut, last: items.at(-1).querySelector("dt").textContent };
    });
  s = await metaRows();
  assert(s.n === 8 && s.rows === 1 && s.last === "Escolaridade" && !s.cut.length, `1500px: as 8 informações (até Escolaridade) na mesma linha, rótulos inteiros (${JSON.stringify(s)})`);
  await page.setViewport({ width: 1280, height: 900 });
  s = await metaRows();
  assert(s.rows === 1 && !s.cut.length, `1280px: continua uma linha só, rótulos inteiros (${JSON.stringify(s)})`);
  await page.setViewport({ width: 1000, height: 900 });
  s = await metaRows();
  assert(s.rows === 2 && s.perRow.join(",") === "4,4", `tela estreita: 2 linhas completas de 4, sem item sozinho (${JSON.stringify(s)})`);
  await page.setViewport({ width: 1500, height: 1000 });
  const vagaId = await $eval(() => AppData.getCompanyData("Chez Pitu").vagas[0].id);
  await page.screenshot({ path: path.join(tmp, "vagas.png"), fullPage: true });

  await $eval(() => document.getElementById("btnNewVaga").click());
  s = await $eval(() => {
    const f = document.getElementById("vagasForm");
    f.elements.cargoId.value = RhCatalog.findCargoByName("Chez Pitu", "Garçom").id;
    f.elements.cargoId.dispatchEvent(new Event("change"));
    return { at: f.elements.atribuicoes.value, esc: f.elements.escolaridade.value, hint: document.getElementById("vagaPerfilHint").textContent };
  });
  assert(s.at === "Atender mesas\nServir pratos e bebidas" && s.esc === "Ensino médio completo" && /última vaga desta função/.test(s.hint), "vaga nova da mesma função sugere o perfil da última (editável)");
  await $eval(() => document.querySelector("#vagasPopup [data-close]").click());
  s = await $eval(() => AppData.getCompanyData("Chez Pitu").vagas.length);
  assert(s === 1, "cancelar a sugestão não grava nada");

  await $eval(() => document.querySelector('[data-vagas-tab="rs"]').click());
  await $eval(() => document.getElementById("btnNewCand").click());
  await $eval((vid) => {
    const f = document.getElementById("vagasForm");
    f.elements.vagaId.value = vid;
    f.elements.name.value = "Jorge Candidato";
    f.elements.situation.value = "Agendado";
    f.requestSubmit();
  }, vagaId);
  s = await $eval(() => document.querySelector("#quadro-vagas .rh-table tbody").textContent);
  assert(s.includes("Jorge Candidato") && s.includes("Garçom · Restaurante"), "candidato listado com a vaga");

  console.log("[7b] Etiqueta de entrevista agendada no cartão da vaga");
  await $eval(() => document.querySelector('[data-vagas-tab="vagas"]').click());
  s = await $eval(() => document.querySelector(".vaga-interview-badge")?.textContent.replace(/\s+/g, " ").trim());
  assert(/Entrevista · Jorge · sem data/.test(s || ""), `candidato 'Agendado' sem data vira etiqueta (${s})`);
  await $eval(() => {
    const c = AppData.getCompanyData("Chez Pitu").candidatos.find((x) => x.name === "Jorge Candidato");
    RhCatalog.saveCandidato("Chez Pitu", { ...c, date: RhCatalog.localTodayISO(), time: "09:00" });
    RhCatalog.saveCandidato("Chez Pitu", { vagaId: c.vagaId, name: "Paula Segunda", situation: "Agendado", date: "2099-01-10", time: "15:00" });
    window.__render("quadro-vagas", "QuadroVagasModule");
  });
  s = await $eval(() => {
    const card = document.querySelector(".vaga-card");
    const badge = card.querySelector(".vaga-interview-badge");
    const r = (el) => el.getBoundingClientRect();
    const b = r(badge), a = r(card.querySelector(".vaga-card-actions")), t = r(card.querySelector(".vaga-card-title")), h = r(card.querySelector(".vaga-card-head"));
    const hit = (x, y) => !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top);
    return {
      text: badge.textContent.replace(/\s+/g, " ").trim(),
      today: badge.classList.contains("is-today"),
      title: badge.getAttribute("title"),
      inHead: b.top >= h.top && b.bottom <= h.bottom,
      sameLine: Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) < 12,
      overlap: hit(b, a) || hit(b, t),
      gap: a.left - b.right
    };
  });
  assert(/Entrevista · Jorge · Hoje às 09:00/.test(s.text) && /\+1/.test(s.text) && s.today, `etiqueta de hoje em destaque, com +1 (${s.text})`);
  assert(/Paula Segunda — 10\/01 às 15:00/.test(s.title), "dica lista todas as entrevistas");
  assert(s.inHead && s.sameLine && !s.overlap && s.gap >= 0, `etiqueta na linha de Editar/Excluir, sem sobrepor título nem botões (${JSON.stringify(s)})`);
  await page.screenshot({ path: path.join(tmp, "vaga-entrevista.png") });
  await $eval(() => document.querySelector(".vaga-interview-badge").click());
  s = await $eval(() => document.querySelector("#quadro-vagas .ausencias-tab-btn.active")?.textContent.trim());
  assert(s === "Recrutamento e Seleção", "clique na etiqueta abre Recrutamento e Seleção");
  s = await $eval(() => document.querySelector("#quadro-vagas .rh-table tbody").textContent);
  assert(/às 09:00/.test(s), "R&S mostra o horário da entrevista");
  await $eval(() => {
    const p = AppData.getCompanyData("Chez Pitu").candidatos.find((x) => x.name === "Paula Segunda");
    RhCatalog.saveCandidato("Chez Pitu", { ...p, situation: "Desistiu" });
    window.__render("quadro-vagas", "QuadroVagasModule");
  });

  await $eval(() => document.querySelector('[data-vagas-tab="admissoes"]').click());
  await $eval(() => document.getElementById("btnNewAdm").click());
  s = await $eval(() => ({
    steps: [...document.querySelectorAll("#vagasForm input[name^='step_']")].map((i) => i.name),
    situation: Boolean(document.querySelector("#vagasForm [name='situation']")),
    employees: AppData.getCompanyData("Chez Pitu").employees.length
  }));
  assert(s.steps.join("|") === "step_docsRecebidos|step_asoAgendado|step_asoLiberado|step_contabilidade|step_inicio" && !s.situation, "Nova admissão mostra as etapas do processo (não abre o cadastro)");
  const employeesBefore = s.employees;
  s = await $eval(() => {
    const f = document.getElementById("vagasForm");
    const opts = () => [...f.elements.vagaId.options].map((o) => o.textContent.trim());
    const pick = (name) => {
      f.elements.cargoId.value = name ? RhCatalog.findCargoByName("Chez Pitu", name).id : "";
      f.elements.cargoId.dispatchEvent(new Event("change"));
    };
    const out = { inicial: opts() };
    pick("Encarregado de Manutenção");
    out.encarregado = opts();
    pick("Garçom");
    out.garcom = opts();
    f.elements.vagaId.value = f.elements.vagaId.options[1].value;
    pick("Encarregado de Manutenção");
    out.trocaLimpa = f.elements.vagaId.value;
    pick("");
    f.elements.vagaId.value = f.elements.vagaId.options[1].value;
    f.elements.vagaId.dispatchEvent(new Event("change"));
    out.funcaoDaVaga = f.elements.cargoId.selectedOptions[0].textContent;
    pick("");
    return out;
  });
  assert(s.encarregado.length === 1 && /Nenhuma vaga para esta função/.test(s.encarregado[0]), "função sem vaga: lista mostra 'Nenhuma vaga para esta função'");
  assert(s.garcom.length === 2 && s.garcom[1].startsWith("Garçom"), `função escolhida: só as vagas dela (${s.garcom.join(" | ")})`);
  assert(s.trocaLimpa === "", "trocar para outra função limpa a vaga que não é dela");
  assert(s.funcaoDaVaga === "Garçom", "escolher a vaga sem função preenche a função da vaga");
  await $eval((vid) => {
    const f = document.getElementById("vagasForm");
    f.elements.name.value = "Mariana Admitida";
    f.elements.vagaId.value = vid;
    f.elements.step_docsRecebidos.value = "2026-11-10";
    f.elements.step_asoAgendado.value = "2026-11-19";
    f.requestSubmit();
  }, vagaId);
  s = await $eval(() => {
    const card = document.querySelector("[data-adm-card]");
    return {
      text: card.textContent.replace(/\s+/g, " "),
      done: card.querySelectorAll(".adm-step.is-done").length,
      next: card.querySelector(".adm-step.is-next .adm-step-label")?.textContent,
      button: Boolean(card.querySelector("[data-register-adm]")),
      employees: AppData.getCompanyData("Chez Pitu").employees.length
    };
  });
  assert(s.text.includes("Mariana Admitida") && s.text.includes("Garçom") && /Exame agendado/.test(s.text), "admissão herda a função da vaga; situação vem das etapas (Exame agendado)");
  assert(s.done === 2 && s.next === "ASO liberado" && /19\/11\/2026/.test(s.text), "linha do tempo: 2 etapas cumpridas com data, próxima destacada");
  assert(!s.button && /Etapa 2 de 5/.test(s.text) && s.employees === employeesBefore, "processo incompleto: sem botão de cadastro e nenhum funcionário criado");
  await $eval(() => {
    document.querySelector("[data-edit-adm]").click();
    const f = document.getElementById("vagasForm");
    f.elements.step_asoLiberado.value = "2026-11-20";
    f.elements.step_contabilidade.value = "2026-11-21";
    f.elements.step_inicio.value = "2026-12-01";
    f.requestSubmit();
  });
  s = await $eval(() => ({
    text: document.querySelector("[data-adm-card]").textContent.replace(/\s+/g, " "),
    button: Boolean(document.querySelector("[data-register-adm]"))
  }));
  assert(s.button && /Pronta para cadastro/.test(s.text) && /pronto para o cadastro/.test(s.text), "todas as etapas cumpridas: \"Cadastrar funcionário\" liberado");
  await page.screenshot({ path: path.join(tmp, "admissoes.png") });

  await $eval(() => document.querySelector("[data-register-adm]").click());
  s = await $eval(() => {
    const f = document.getElementById("employeeForm");
    return {
      title: document.getElementById("employeePopupTitle")?.textContent,
      name: f.elements.name.value,
      role: document.getElementById("roleSelect").value,
      cbo: document.getElementById("roleCboDisplay")?.value,
      dept: document.getElementById("departmentSelect").value,
      newDept: document.getElementById("newDepartmentInput").value,
      adm: f.elements.admissionDate.value,
      banner: Boolean(document.querySelector(".admission-prefill-banner"))
    };
  });
  assert(/admissão de Mariana Admitida/.test(s.title) && s.name === "Mariana Admitida" && s.role === "Garçom" && s.cbo === "5134-05", "cadastro completo aberto com nome e função (CBO) da admissão");
  assert(s.adm === "2026-12-01" && (s.dept === "Restaurante" || (s.dept === "__new__" && s.newDept === "Restaurante")) && s.banner, "data de admissão = início e setor da vaga, com aviso para completar");
  await $eval(() => document.getElementById("employeePopupClose").click());
  s = await $eval(() => ({ n: AppData.getCompanyData("Chez Pitu").employees.length, adm: AppData.getCompanyData("Chez Pitu").admissoes[0] }));
  assert(s.n === employeesBefore && !s.adm.employeeId && s.adm.situation === "Pronta para cadastro", "fechar o cadastro sem salvar não cria funcionário nem conclui a admissão");
  await $eval(() => {
    document.querySelector("[data-register-adm]").click();
    const f = document.getElementById("employeeForm");
    f.elements.cpf.value = "862.471.680-04";
    f.elements.ctps.value = "123";
    f.requestSubmit();
  });
  s = await $eval(() => {
    const co = AppData.getCompanyData("Chez Pitu");
    const emp = co.employees.find((e) => e.name === "Mariana Admitida");
    return { emp, adm: co.admissoes[0], n: co.employees.length };
  });
  assert(s.emp && s.emp.roleId && s.emp.admissionDate === "2026-12-01" && s.n === employeesBefore + 1, "salvar cria o funcionário com função e admissão");
  assert(s.adm.employeeId === s.emp.id && s.adm.situation === "Iniciou", "admissão concluída e vinculada ao funcionário (conta como admitido)");
  await $eval(() => window.__render("quadro-vagas", "QuadroVagasModule"));
  s = await $eval(() => ({ text: document.querySelector("[data-adm-card]").textContent, button: Boolean(document.querySelector("[data-register-adm]")) }));
  assert(/Funcionário cadastrado/.test(s.text) && !s.button, "cartão mostra cadastrado e não permite cadastrar de novo");

  await $eval(() => document.querySelector('[data-vagas-tab="painel"]').click());
  s = await $eval(() => Object.fromEntries([...document.querySelectorAll(".rh-kpi")].map((k) => [k.querySelector("span").textContent, k.querySelector("strong").textContent])));
  assert(s["Vagas em andamento"] === "1" && s["Posições previstas"] === "2" && s["Posições em aberto"] === "1" && s["Admitidos (iniciaram)"] === "1" && s["Vagas urgentes"] === "1", `Painel RH calculado: ${JSON.stringify(s)}`);
  await page.screenshot({ path: path.join(tmp, "painel.png") });
  await $eval(() => {
    window.__printed = [];
    document.getElementById("btnVagasReport").click();
  });
  await $eval(() => {
    document.querySelector("#rhReportOptions input[value='painel']").checked = false;
    document.querySelector("#rhReportOptions [data-report-go]").click();
  });
  s = await $eval(() => window.__printed[0]);
  assert(s && s.html.includes("Mariana Admitida") && s.html.includes("Jorge Candidato") && !s.html.includes("<h2>Painel RH</h2>"), "Relatório PDF do Quadro de Vagas respeita as seções escolhidas");
  assert(s.html.includes("Ensino médio completo") && s.html.includes("Requisitos obrigatórios") && s.html.includes("Experiência em hotel"), "relatório traz escolaridade, atribuições e requisitos");
  const vPage = await browser.newPage();
  await vPage.setContent(s.html, { waitUntil: "load" });
  const vPdf = await vPage.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(tmp, "vagas.pdf"), vPdf);
  await vPage.setViewport({ width: 1200, height: 850 });
  await vPage.emulateMediaType("print");
  await vPage.screenshot({ path: path.join(tmp, "relatorio-vagas.png"), fullPage: true });
  await vPage.close();
  assert(Buffer.from(vPdf).subarray(0, 4).toString() === "%PDF", "PDF do Quadro de Vagas gerado");

  console.log("[8] Separação por empresa e Lixeira");
  await $eval(() => {
    AppData.setActiveCompany("Pengold");
    window.__render("quadro-vagas", "QuadroVagasModule");
    document.querySelector('[data-vagas-tab="vagas"]').click();
  });
  s = await $eval(() => document.querySelector("#quadro-vagas .vaga-card-list").textContent);
  assert(s.includes("Nenhuma vaga") && !s.includes("Garçom"), "Pengold não vê as vagas da Chez Pitu");
  await $eval(() => {
    AppData.setActiveCompany("Chez Pitu");
    window.__render("quadro-vagas", "QuadroVagasModule");
    document.querySelector("[data-remove-vaga]").click();
  });
  s = await $eval(() => ({
    vagas: AppData.getCompanyData("Chez Pitu").vagas.length,
    lixeira: AppData.listDeletedArchive({ company: "Chez Pitu", kinds: ["vaga"] }).length,
    btn: document.querySelector('[id^="btnVagasArchive"]')?.textContent || ""
  }));
  assert(s.vagas === 0 && s.lixeira === 1 && /Lixeira \(1\)/.test(s.btn), "excluir vaga (com confirmação) leva à Lixeira");

  console.log("[9] Cargos: excluir função sai da lista, sem botão Lixeira");
  s = await $eval(() => {
    AppData.setActiveCompany("Chez Pitu");
    const co = "Chez Pitu";
    const extra = RhCatalog.saveCargo(co, { name: "Função Teste Exclusão", cbo: "", salary: "1500" }).cargo;
    const archiveBefore = AppData.listDeletedArchive({ company: co, kinds: ["cargo"] }).length;
    window.__render("cargos", "CargosModule");
    document.querySelector('#cargos [data-rh-tab="funcoes"]').click();
    const root = document.getElementById("cargos");
    const hadRow = root.textContent.includes("Função Teste Exclusão");
    const hasLixeiraBtn = !!root.querySelector("#btnCargoArchive") || /Lixeira/.test(root.querySelector(".rh-actions")?.textContent || "");
    window.__confirms = [];
    root.querySelector(`[data-remove-cargo="${extra.id}"]`).click();
    const after = document.getElementById("cargos");
    return {
      hadRow,
      hasLixeiraBtn,
      gone: !after.textContent.includes("Função Teste Exclusão") && !RhCatalog.getCargo(co, extra.id),
      archived: AppData.listDeletedArchive({ company: co, kinds: ["cargo"] }).length === archiveBefore + 1,
      confirmText: window.__confirms[0] || ""
    };
  });
  assert(s.hadRow && !s.hasLixeiraBtn, "tela de Cargos sem botão Lixeira");
  assert(s.gone, "função excluída some da lista na hora");
  assert(s.archived, "cópia continua guardada (regra fixa: nada some)");
  assert(/Excluir a função/.test(s.confirmText) && !/Lixeira/.test(s.confirmText), "confirmação sem mencionar Lixeira");

  console.log("[10] Cargos: coluna de ativos mostra +N inativo(s)");
  s = await $eval(() => {
    const co = "Chez Pitu";
    const block = AppData.getCompanyData(co);
    const mk = (name) => RhCatalog.saveCargo(co, { name, cbo: "", salary: "1500" }).cargo;
    const a = mk("Teste Ativos Só"), b = mk("Teste Um Inativo"), c = mk("Teste Dois Inativos");
    const emp = (id, cargo, status) => ({ id, name: id, role: cargo.name, roleId: cargo.id, status, admissionDate: "2024-01-01" });
    block.employees.push(
      emp("tA1", a, "Ativo"),
      emp("tB1", b, "Ativo"), emp("tB2", b, "Ativo"), emp("tB3", b, "Inativo"),
      emp("tC1", c, "Ativo"), emp("tC2", c, "Inativo"), emp("tC3", c, "Inativo")
    );
    window.__render("cargos", "CargosModule");
    document.querySelector('#cargos [data-rh-tab="funcoes"]').click();
    const cell = (cargo) => {
      const tr = document.querySelector(`#cargos [data-edit-cargo="${cargo.id}"]`).closest("tr");
      return tr.children[6].textContent.replace(/\s+/g, " ").trim();
    };
    return { a: cell(a), b: cell(b), c: cell(c), old: document.getElementById("cargos").textContent.includes("no total") };
  });
  assert(s.a === "1", `sem inativos: só o número (${s.a})`);
  assert(s.b === "2+1 inativo", `um inativo: "+1 inativo" (${s.b})`);
  assert(s.c === "1+2 inativos", `dois inativos: "+2 inativos" (${s.c})`);
  assert(!s.old, "texto \"no total\" não aparece mais");

  assert(pageErrors.length === 0, `sem erros de JavaScript na página${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
  console.log(`\nCapturas: ${tmp}`);
} finally {
  await browser.close();
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
