/**
 * Escala de Folga — fluxo Editar / Salvar com a regra 5x2, no Chrome real.
 *
 * Carrega os módulos VERDADEIROS (data.js, scale-rules.js, scale-5x2.js,
 * escala.js) numa página file:// com perfil temporário: o localStorage é do
 * navegador de teste e não há Firebase — nenhum dado de produção é tocado.
 *
 * Cobre: grade somente-leitura até "Editar escala"; alteração vai para o
 * rascunho (nada gravado); "Salvar" bloqueado com pop-up nomeando o
 * funcionário quando falta folga; salvar grava quando todos cumprem;
 * "Cancelar" descarta; mês antes da vigência salva sem cobrança; tela sem
 * Catherina/André nas coberturas; grade maior e cores nítidas.
 *
 * Uso: node scripts/verify-escala-editar-salvar.mjs
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-escala-5x2-"));
const fileUrl = (rel) => pathToFileURL(path.join(root, rel)).href;
const htmlPath = path.join(tmp, "escala.html");
fs.writeFileSync(
  htmlPath,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl("css/style.css")}">
</head><body>
<div id="toastContainer"></div>
<section id="escala"></section>
<script>
  window.__toasts = [];
  window.__confirmAnswer = true;
  window.confirm = () => window.__confirmAnswer;
  window.alert = () => {};
  window.App = {
    renderCurrent: () => {},
    toast: (m, t) => window.__toasts.push({ m, t }),
    formatDisplayName: (n) => String(n || ""),
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  };
</script>
<script src="${fileUrl("js/import-utils.js")}"></script>
<script src="${fileUrl("js/data.js")}"></script>
<script src="${fileUrl("js/scale-rules.js")}"></script>
<script src="${fileUrl("js/scale-5x2.js")}"></script>
<script src="${fileUrl("js/escala.js")}"></script>
</body></html>`
);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-escala-profile-"));
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  userDataDir,
  args: ["--no-sandbox", "--allow-file-access-from-files"]
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

  // Fixture em memória
  await page.evaluate(() => {
    const A = window.AppData;
    const company = "Chez Pitu";
    A.setActiveCompany?.(company);
    A.setPageCompany?.("escala", company);
    const data = A.getCompanyData(company);
    const base = { department: "Recepção", admissionDate: "2020-01-01", status: "Ativo", sundayOffWeeks: "" };
    data.employees = [
      { ...base, id: "emp-andre", name: "André Justo de Barros", fixedDay: "Segunda-feira" },
      { ...base, id: "emp-bia", name: "Bia Fixture", fixedDay: "Segunda-feira" }
    ];
    data.manualScale = { "emp-bia|2026-12-23": "FOLGA" };
    data.manualScaleMeta = {};
    data.vacations = [];
    data.absences = [];
    data.holidays = [];
    A.state.coverageAlerts = [
      { id: "old-tr", yearMonth: "2026-12", date: "2026-12-22", coverageCode: "TR", principalCompany: company, message: "Catherina Victoria de Azeredo está de FOLGA" },
      { id: "old-tm", yearMonth: "2026-12", date: "2026-12-22", coverageCode: "TM", principalCompany: company, message: "André Justo de Barros está de FOLGA" }
    ];
    window.__snapshot = () => JSON.stringify(A.getCompanyData(company).manualScale);
    window.__render = (ym) => window.EscalaModule.render(document.getElementById("escala"), ym);
    window.__render("2026-12");
  });

  const state = () =>
    page.evaluate(() => {
      const root = document.getElementById("escala");
      const select = root.querySelector('.scale-select[data-employee="emp-andre"][data-date="2026-12-23"]');
      return {
        editBtn: Boolean(root.querySelector("#editScale")),
        saveBtn: Boolean(root.querySelector("#saveScale")),
        disabled: select ? select.disabled : null,
        flag: root.querySelector(".scale-5x2-flag")?.textContent || "",
        banner: root.querySelector(".scale-5x2-banner")?.textContent || "",
        popup: document.getElementById("scale5x2Popup")?.textContent || "",
        text: root.textContent,
        coveragePanel: Boolean(document.getElementById("scaleCoveragePanel")),
        manual: window.__snapshot()
      };
    });
  const choose = (employee, date, value) =>
    page.evaluate((e, d, v) => {
      const select = document.querySelector(`.scale-select[data-employee="${e}"][data-date="${d}"]`);
      select.value = v;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, employee, date, value);
  const click = (id) => page.evaluate((sel) => document.querySelector(sel).click(), id);

  const document_has_panel = (st) => st.coveragePanel;
  const before = (await state()).manual;

  console.log("[1] Modo leitura");
  let s = await state();
  assert(s.editBtn && !s.saveBtn, "Botão 'Editar escala' visível; 'Salvar' só na edição");
  assert(s.disabled === true, "Grade somente-leitura antes de clicar em Editar");
  assert(/falta folga/.test(s.flag), "André marcado na grade: falta folga (5x2)");
  assert(/sem as 2 folgas/.test(s.banner), "Faixa 5x2 avisa funcionário(s) sem as 2 folgas");
  assert(!/Catherina|André Justo de Barros está de/.test(s.text.replace(/André Justo de Barros(?! está)/g, "")), "Sem alertas de cobertura de Catherina/André na tela");
  assert(!/Catherina/.test(s.text), "Nenhuma menção a Catherina na Escala");
  assert(!document_has_panel(s), "Painel 'Alertas de cobertura' oculto (sem regra ativa)");

  console.log("[2] Editar → Salvar bloqueado com pop-up");
  await click("#editScale");
  s = await state();
  assert(s.saveBtn && s.disabled === false, "Em edição: grade liberada e botão Salvar");
  await click("#saveScale");
  s = await state();
  assert(/Funcionário André Justo de Barros/.test(s.popup), "Pop-up nomeia 'Funcionário André Justo de Barros'");
  assert(/falta 1 folga semanal/.test(s.popup), "Pop-up: 'falta 1 folga semanal'");
  assert(/21\/12\/2026 a 27\/12\/2026/.test(s.popup), "Pop-up informa a semana (21/12/2026 a 27/12/2026)");
  assert(!/Bia Fixture/.test(s.popup), "Quem cumpre a regra não aparece no pop-up");
  assert(s.manual === before, "Salvar bloqueado: nada gravado");
  await page.evaluate(() => document.querySelector("[data-close-5x2]").click());

  console.log("[3] Ajuste vai para o rascunho e só grava no Salvar");
  await choose("emp-andre", "2026-12-23", "FOLGA");
  s = await state();
  assert(s.manual === before, "Alterar a célula NÃO grava (rascunho)");
  const draftCell = await page.evaluate(() =>
    document.querySelector('.scale-select[data-employee="emp-andre"][data-date="2026-12-23"]').closest("td").className
  );
  assert(/draft-cell/.test(draftCell) && /code-folga/.test(draftCell), "Célula alterada destacada e já como Folga");
  assert(!/falta folga/.test(s.flag), "Aviso 5x2 do André some assim que a folga entra no rascunho");
  await click("#saveScale");
  s = await state();
  const savedManual = JSON.parse(s.manual);
  assert(!s.popup, "Com a regra cumprida, nenhum pop-up");
  assert(savedManual["emp-andre|2026-12-23"] === "FOLGA", "Salvar grava a folga do André");
  assert(savedManual["emp-bia|2026-12-23"] === "FOLGA", "Lançamento existente da Bia preservado");
  assert(s.editBtn && !s.saveBtn && s.disabled === true, "Após salvar volta ao modo leitura");
  assert(/✓|success/.test(JSON.stringify(await page.evaluate(() => window.__toasts))), "Mensagem de escala salva");

  console.log("[4] Cancelar descarta o rascunho");
  const afterSave = (await state()).manual;
  await click("#editScale");
  await choose("emp-bia", "2026-12-24", "FOLGA");
  await page.evaluate(() => { window.__confirmAnswer = true; });
  await click("#cancelScaleEdit");
  s = await state();
  assert(s.manual === afterSave && s.editBtn, "Cancelar descarta e volta ao modo leitura sem gravar");

  console.log("[5] Trocar de mês com alteração pendente pergunta antes");
  await click("#editScale");
  await choose("emp-bia", "2026-12-24", "FOLGA");
  await page.evaluate(() => { window.__confirmAnswer = false; });
  await page.evaluate(() => {
    const m = document.getElementById("scaleMonth");
    m.value = "11";
    m.dispatchEvent(new Event("change", { bubbles: true }));
  });
  s = await state();
  assert(s.saveBtn && /2026-12/.test(await page.evaluate(() => window.AppData.getEscalaSelectedYearMonth())), "Recusou descartar: continua editando dezembro");
  await page.evaluate(() => { window.__confirmAnswer = true; });
  await click("#cancelScaleEdit");

  console.log("[6] Mês antes da vigência não é cobrado");
  await page.evaluate(() => window.__render("2026-11"));
  await click("#editScale");
  await choose("emp-andre", "2026-11-10", "DOM");
  await click("#saveScale");
  s = await state();
  assert(!s.popup && JSON.parse(s.manual)["emp-andre|2026-11-10"] === "DOM", "Novembro/2026 salva sem exigir 2 folgas");

  console.log("[7] Visual da grade");
  await page.evaluate(() => window.__render("2026-12"));
  const look = await page.evaluate(() => {
    const td = document.querySelector('.scale-select[data-employee="emp-andre"][data-date="2026-12-23"]').closest("td");
    const cs = getComputedStyle(td);
    const code = getComputedStyle(td.querySelector(".scale-cell-code"));
    return { h: td.getBoundingClientRect().height, w: td.getBoundingClientRect().width, bg: cs.backgroundColor, color: code.color, size: parseFloat(code.fontSize) };
  });
  assert(look.h >= 38 && look.w >= 38, `Células maiores (${Math.round(look.w)}x${Math.round(look.h)}px; antes 28x26)`);
  assert(look.bg === "rgb(19, 49, 105)" && look.color === "rgb(255, 255, 255)", `Folga em navy com texto branco (${look.bg} / ${look.color})`);
  assert(look.size >= 12, `Código legível (${look.size}px; antes ~9px)`);

  assert(pageErrors.length === 0, `Sem erros de JavaScript na página (${pageErrors.join(" | ")})`);
} finally {
  await browser.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
