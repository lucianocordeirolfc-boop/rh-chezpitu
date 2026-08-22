/**
 * Validação de UI do seletor "Mostrar funcionários inativos"
 * (js/inactive-employees.js) no Chrome real.
 *
 * A suíte verify-inativos-visibilidade.mjs cobre as REGRAS (quem aparece, data
 * de desligamento). Esta cobre o COMPONENTE: que o botão sai do jeito certo,
 * que o modal abre com um checkbox por inativo, que "Marcar/Desmarcar todos"
 * funcionam e que o Aplicar devolve exatamente os ids marcados — nada disso é
 * demonstrável por leitura de fonte.
 *
 * Usa um HTML mínimo com o CSS real e um AppData mínimo (só isEmployeeActive e
 * formatDateBR): o componente não toca em base de dados, então não há fixture
 * de produção envolvida.
 *
 * Uso: node scripts/verify-inativos-picker-ui.mjs
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

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const EMPLOYEES = [
  { id: "a1", name: "Ativo Um", status: "Ativo", department: "Recepção", role: "Recepcionista" },
  { id: "i1", name: "Adonias Teste", status: "Inativo", department: "Cozinha", role: "Cozinheiro", deactivatedAt: "2026-07-31" },
  { id: "i2", name: "Beatriz Teste", status: "Inativo", department: "Governança", role: "Camareira" },
  { id: "a2", name: "Ativo Dois", status: "Ativo", department: "Salão", role: "Garçom" }
];

const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const module = fs.readFileSync(path.join(root, "js/inactive-employees.js"), "utf8");

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${css}</style></head><body>
<div id="host"></div>
<script>
  // AppData mínimo: o componente só precisa disso, e nada aqui grava dado.
  window.AppData = {
    isEmployeeActive: (e) => String(e && e.status || "").trim().toLowerCase() === "ativo",
    formatDateBR: (iso) => { if (!iso) return ""; const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
  };
  window.App = { escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) };
  window.__employees = ${JSON.stringify(EMPLOYEES)};
  window.__applied = null;
</script>
<script>${module}</script>
</body></html>`;

const chrome = findChrome();
if (!chrome) {
  console.error("Chrome/Edge não encontrado — instale o Chrome para rodar esta suíte.");
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  // ── 1. Botão ──
  console.log("[1] Botão da tela principal");
  const buttonHTML = await page.evaluate(() =>
    window.InactiveEmployeesUI.toggleButtonHTML({ id: "btnTest", total: 2, visibleCount: 0 })
  );
  assert(buttonHTML.includes("Mostrar funcionários inativos (2)"), "rótulo traz o total de inativos");
  assert(buttonHTML.includes('id="btnTest"'), "usa o id informado");

  const withVisible = await page.evaluate(() =>
    window.InactiveEmployeesUI.toggleButtonHTML({ id: "btnTest", total: 2, visibleCount: 1 })
  );
  assert(withVisible.includes("1 exibido(s)"), "mostra quantos inativos estão sendo exibidos");

  const noneInactive = await page.evaluate(() =>
    window.InactiveEmployeesUI.toggleButtonHTML({ id: "btnTest", total: 0, visibleCount: 0 })
  );
  assert(noneInactive === "", "sem inativos, o botão não é renderizado");

  // ── 2. Modal abre só com os inativos ──
  console.log("[2] Modal do seletor");
  await page.evaluate(() => {
    window.InactiveEmployeesUI.openPicker({
      employees: window.__employees,
      visibleIds: new Set(["i1"]),
      contextLabel: "Suíte de teste",
      onApply: (chosen) => { window.__applied = [...chosen]; }
    });
  });

  const info = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("#inactiveEmployeesPicker .inactive-picker-list input[type='checkbox']")];
    return {
      exists: Boolean(document.getElementById("inactiveEmployeesPicker")),
      ids: boxes.map((b) => b.value),
      checked: boxes.filter((b) => b.checked).map((b) => b.value),
      text: document.getElementById("inactiveEmployeesPicker").textContent
    };
  });
  assert(info.exists, "modal foi criado");
  assert(info.ids.length === 2, `um checkbox por inativo (${info.ids.length})`);
  assert(!info.ids.includes("a1") && !info.ids.includes("a2"), "funcionário ativo não entra na lista");
  assert(info.checked.length === 1 && info.checked[0] === "i1", "já vem marcado quem estava sendo exibido");
  assert(info.text.includes("Adonias Teste"), "lista traz o nome do inativo");
  assert(info.text.includes("31/07/2026"), "mostra a data de desligamento quando existe");
  assert(info.text.includes("não informado"), "sinaliza inativo sem data de desligamento");

  // ── 3. Marcar todos / desmarcar todos ──
  console.log("[3] Atalhos de seleção");
  const afterAll = await page.evaluate(() => {
    document.getElementById("inactivePickerAll").click();
    return [...document.querySelectorAll("#inactiveEmployeesPicker input[type='checkbox']")].filter((b) => b.checked).length;
  });
  assert(afterAll === 2, "Marcar todos seleciona os dois inativos");

  const afterNone = await page.evaluate(() => {
    document.getElementById("inactivePickerNone").click();
    return [...document.querySelectorAll("#inactiveEmployeesPicker input[type='checkbox']")].filter((b) => b.checked).length;
  });
  assert(afterNone === 0, "Desmarcar todos limpa a seleção");

  // ── 4. Aplicar devolve exatamente o que foi marcado ──
  console.log("[4] Aplicar");
  const applied = await page.evaluate(() => {
    const box = document.querySelector("#inactiveEmployeesPicker input[value='i2']");
    box.checked = true;
    document.getElementById("inactivePickerApply").click();
    return { chosen: window.__applied, stillOpen: Boolean(document.getElementById("inactiveEmployeesPicker")) };
  });
  assert(Array.isArray(applied.chosen) && applied.chosen.length === 1 && applied.chosen[0] === "i2",
    `onApply recebeu só o id marcado (${JSON.stringify(applied.chosen)})`);
  assert(!applied.stillOpen, "modal fecha ao aplicar");

  // ── 5. Cancelar não altera nada ──
  console.log("[5] Cancelar");
  const cancelled = await page.evaluate(() => {
    window.__applied = "intocado";
    window.InactiveEmployeesUI.openPicker({
      employees: window.__employees,
      visibleIds: new Set(),
      onApply: (chosen) => { window.__applied = [...chosen]; }
    });
    document.querySelector("#inactiveEmployeesPicker input[value='i1']").checked = true;
    document.getElementById("inactivePickerCancel").click();
    return { applied: window.__applied, stillOpen: Boolean(document.getElementById("inactiveEmployeesPicker")) };
  });
  assert(cancelled.applied === "intocado", "Cancelar não chama onApply");
  assert(!cancelled.stillOpen, "modal fecha ao cancelar");
} finally {
  await browser.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
