/**
 * Cadastro — "Sugerir 2ª folga (5x2)" no Chrome real.
 *
 * Módulos verdadeiros (data.js, scale-5x2.js, funcionarios.js) numa página
 * file:// com perfil temporário e sem Firebase: nenhum dado de produção.
 *
 * Cobre: quadro abre com todos os ativos e resumo por setor; marcar regime
 * feminino recalcula (domingo quinzenal); escolha manual travada; "Aplicar"
 * grava a 2ª folga/domingos no histórico (a partir de 21/12/2026) sem mexer
 * em "Domingos de folga" nem em outros campos; Cancelar não grava; campo no
 * formulário de edição.
 *
 * Uso: node scripts/verify-segunda-folga-ui.mjs
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-2folga-"));
const fileUrl = (rel) => pathToFileURL(path.join(root, rel)).href;
const htmlPath = path.join(tmp, "cadastro.html");
fs.writeFileSync(
  htmlPath,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl("css/style.css")}">
</head><body>
<div id="toastContainer"></div>
<section id="funcionarios"></section>
<script>
  window.__confirmAnswer = true;
  window.__alerts = [];
  window.confirm = () => window.__confirmAnswer;
  window.alert = (m) => window.__alerts.push(m);
  window.App = {
    renderCurrent: () => {},
    toast: () => {},
    formatDisplayName: (n) => String(n || ""),
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  };
</script>
<script src="${fileUrl("js/import-utils.js")}"></script>
<script src="${fileUrl("js/data.js")}"></script>
<script src="${fileUrl("js/scale-5x2.js")}"></script>
<script src="${fileUrl("js/funcionarios.js")}"></script>
</body></html>`
);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-2folga-profile-"));
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", userDataDir, args: ["--no-sandbox", "--allow-file-access-from-files"] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

  await page.evaluate(() => {
    const A = window.AppData;
    const company = "Chez Pitu";
    A.setActiveCompany?.(company);
    A.setPageCompany?.("funcionarios", company);
    const data = A.getCompanyData(company);
    const base = { cpf: "", ctps: "1", role: "Camareira", status: "Ativo", admissionDate: "2020-01-01", vtDaily: 10, source: "manual", doubleSundayOff: "false", notes: "nota" };
    data.employees = [
      { ...base, id: "g1", name: "Gov Um", department: "GOVERNANÇA", fixedDay: "Segunda-feira", sundayOffWeeks: "2" },
      { ...base, id: "g2", name: "Gov Dois", department: "GOVERNANÇA", fixedDay: "Terça-feira", sundayOffWeeks: "1" },
      { ...base, id: "g3", name: "Gov Tres", department: "GOVERNANÇA", fixedDay: "Terça-feira", sundayOffWeeks: "3" },
      { ...base, id: "m1", name: "Man Um", department: "MANUTENÇÃO", role: "Manutenção", fixedDay: "Quinta-feira", sundayOffWeeks: "" },
      { ...base, id: "x9", name: "Inativo Fixture", department: "GOVERNANÇA", status: "Inativo", deactivatedAt: "2026-01-10", fixedDay: "Segunda-feira", sundayOffWeeks: "" }
    ];
    window.__snapshot = () => JSON.stringify(A.getCompanyData(company).employees);
    window.FuncionariosModule.render(document.getElementById("funcionarios"));
  });

  const open = () => page.evaluate(() => document.getElementById("btnSuggestSecondFolga").click());
  const modal = () =>
    page.evaluate(() => {
      const el = document.getElementById("secondFolgaPopup");
      if (!el) return null;
      const rows = [...el.querySelectorAll("[data-sf-row]")].map((tr) => ({
        id: tr.dataset.sfRow,
        second: tr.querySelector("[data-sf-second]").value,
        sundays: tr.children[4].textContent.trim(),
        double: tr.querySelector("[data-sf-double]").checked
      }));
      return { rows, summary: el.querySelector("[data-sf-summary]").textContent };
    });

  console.log("[1] Quadro de sugestão");
  const before = await page.evaluate(() => window.__snapshot());
  await open();
  let m = await modal();
  assert(m && m.rows.length === 4, `Lista só os 4 ativos (obtido ${m?.rows.length})`);
  assert(m.rows.every((r) => r.second), "Todos com 2ª folga sugerida");
  assert(/GOVERNANÇA: máx\. 2/.test(m.summary) && /MANUTENÇÃO/.test(m.summary), "Resumo por setor (máx. por dia, sexta/sábado)");
  const man = m.rows.find((r) => r.id === "m1");
  assert(/\+ \dº/.test(man.sundays), "Quem não tem domingo de folga recebe 1 (destacado)");

  console.log("[2] Regime feminino recalcula");
  await page.evaluate(() => {
    const cb = document.querySelector('[data-sf-double="g1"]');
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  });
  m = await modal();
  const g1 = m.rows.find((r) => r.id === "g1");
  assert(g1.double && /2º/.test(g1.sundays) && /\+ 4º/.test(g1.sundays), "Regime feminino: 2º domingo quinzenal (2º → + 4º)");

  console.log("[3] Escolha manual travada");
  await page.evaluate(() => {
    const sel = document.querySelector('[data-sf-second="g3"]');
    sel.value = "Sábado";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  m = await modal();
  assert(m.rows.find((r) => r.id === "g3").second === "Sábado", "Valor escolhido pelo usuário mantido após recálculo");
  await page.evaluate(() => {
    const sel = document.querySelector('[data-sf-second="g2"]');
    sel.value = "Terça-feira";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert((await page.evaluate(() => window.__alerts.join("|"))).includes("mesmo dia da folga fixa"), "Bloqueia 2ª folga no dia da folga fixa");

  console.log("[4] Cancelar não grava");
  await page.evaluate(() => document.querySelector("[data-sf-close]").click());
  assert((await page.evaluate(() => window.__snapshot())) === before, "Cancelar: cadastro idêntico");

  console.log("[5] Aplicar grava no histórico, só para frente");
  await open();
  await page.evaluate(() => {
    const cb = document.querySelector('[data-sf-double="g1"]');
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  });
  m = await modal();
  await page.evaluate(() => document.querySelector("[data-sf-apply]").click());
  const saved = await page.evaluate(() => {
    const A = window.AppData;
    return A.getCompanyData("Chez Pitu").employees.map((e) => ({
      id: e.id, second: A.getSecondFixedDay(e), from: A.getSecondFixedDayFrom(e), extra: A.getSecondExtraSundays(e).join(","),
      sundayOffWeeks: e.sundayOffWeeks, double: e.doubleSundayOff, notes: e.notes, fixedDay: e.fixedDay, status: e.status
    }));
  });
  const s = Object.fromEntries(saved.map((e) => [e.id, e]));
  assert(["g1", "g2", "g3", "m1"].every((id) => s[id].second === m.rows.find((r) => r.id === id).second), "2ª folga gravada como mostrada no quadro");
  assert(["g1", "g2", "g3", "m1"].every((id) => s[id].from === "2026-12-21"), "Vale a partir de 21/12/2026");
  assert(s.g1.extra === "4" && s.g1.double === "true" && s.g1.sundayOffWeeks === "2", "Regime feminino: + 4º domingo no histórico; 'Domingos de folga' intacto");
  assert(s.m1.extra.length === 1 && s.m1.sundayOffWeeks === "", "Domingo incluído para quem não tinha, no histórico");
  assert(["g1", "g2", "g3", "m1"].every((id) => s[id].notes === "nota" && s[id].status === "Ativo"), "Demais campos intactos");
  assert(!s.x9.second && s.x9.status === "Inativo", "Inativo não é alterado");
  assert(!(await page.evaluate(() => Boolean(document.getElementById("secondFolgaPopup")))), "Quadro fecha após aplicar");

  console.log("[6] Formulário de edição mostra a 2ª folga");
  await page.evaluate(() => window.FuncionariosModule.render(document.getElementById("funcionarios")));
  await page.evaluate(() => document.querySelector('[data-edit="g2"]').click());
  const formValue = await page.evaluate(() => document.getElementById("secondFixedDaySelect")?.value);
  assert(formValue === s.g2.second, `Campo '2ª folga semanal' preenchido (${formValue})`);
  const listText = await page.evaluate(() => document.querySelector(".func-employees-table")?.textContent || "");
  assert(/\+ 2ª:/.test(listText), "Lista mostra '+ 2ª' ao lado da folga fixa");

  assert(pageErrors.length === 0, `Sem erros de JavaScript (${pageErrors.join(" | ")})`);
} finally {
  await browser.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
if (failed) process.exit(1);
