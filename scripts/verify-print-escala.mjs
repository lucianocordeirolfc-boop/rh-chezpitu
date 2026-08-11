/**
 * Validação automatizada da IMPRESSÃO da Escala de Folga (PDF A4 paisagem).
 * Homologação temporária — não versionar.
 *
 * Renderiza a MESMA marcação de `renderPrintArea` (js/escala.js) com o CSS REAL
 * (style.css + print.css + escala-print.css), emula mídia `print`, replica o
 * auto-fit de `applyPrintFitScale` (mede a altura e aplica --scale-print-fit),
 * gera PDF via Chrome instalado (puppeteer-core) e verifica:
 *   - SEMPRE 1 única página A4 paisagem (qualquer tamanho de quadro);
 *   - todos os funcionários renderizados E visíveis dentro da página (sem corte);
 *   - nenhum setor cortado (todas as faixas de setor presentes);
 *   - legenda, observações e assinatura presentes e dentro da folha;
 *   - container travado em 210mm (overflow hidden) e área escalada (auto-fit).
 *
 * Uso: node scripts/verify-print-escala.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(os.tmpdir(), "rh-print-validation");
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ];
  return candidates.find((p) => fs.existsSync(p));
}

// ── Junho/2026 ────────────────────────────────────────────────────────────
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const dd = String(i + 1).padStart(2, "0");
  return `2026-06-${dd}`;
});
const WD_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom
}

const SECTORS = ["RECEPÇÃO", "COZINHA", "LIMPEZA", "MANUTENÇÃO", "SALÃO", "ADMINISTRAÇÃO"];

function buildEmployees(total) {
  const list = [];
  for (let i = 0; i < total; i++) {
    list.push({
      name: `Funcionário Sobrenome ${String(i + 1).padStart(2, "0")}`,
      department: SECTORS[i % SECTORS.length],
      shift: i % 2 ? "Manhã" : "Tarde"
    });
  }
  // Agrupar por setor (como groupEmployeesByDepartment faz)
  const order = [...new Set(list.map((e) => e.department))];
  return order.map((dep) => [dep, list.filter((e) => e.department === dep)]);
}

function densityClass(count) {
  if (count >= 22) return "scale-print-density-dense";
  if (count >= 14) return "scale-print-density-compact";
  return "scale-print-density-normal";
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const SAMPLE_CODES = ["", "", "", "F", "D", "CO", "FÉRIAS", "TR", "TM", "ATESTADO"];
function codeClass(code) {
  const map = {
    F: "code-folga", D: "code-folga", "FÉRIAS": "code-ferias", CO: "code-co",
    TR: "code-tm", TM: "code-tm", ATESTADO: "code-atestado", "": "code-work"
  };
  return map[code] || "code-work";
}

// Reproduz fielmente a estrutura de renderPrintArea (js/escala.js)
function buildPrintArea({ companyClass, legalName, cnpj, employeesByDept, totalCount }) {
  const colSpan = DAYS.length + 1;
  const density = densityClass(totalCount);

  const headerDays = DAYS.map((day) => {
    const wd = weekday(day);
    const isSunday = wd === 0;
    const dd = day.split("-")[2];
    return `<th class="${isSunday ? "print-day-sunday" : ""}"><span>${dd}</span><small>${WD_INITIALS[wd]}</small></th>`;
  }).join("");

  let r = 0;
  const rows = employeesByDept
    .map(([dept, emps]) => {
      const sectorRow = `<tr class="sector-row-print"><th class="sector-divider-print" colspan="${colSpan}">${esc(dept)}</th></tr>`;
      const empRows = emps
        .map((emp) => {
          const cells = DAYS.map((day) => {
            const wd = weekday(day);
            const code = SAMPLE_CODES[(r += 1) % SAMPLE_CODES.length];
            return `<td class="${codeClass(code)} ${wd === 0 ? "print-day-sunday" : ""}">${esc(code)}</td>`;
          }).join("");
          return `<tr><th class="print-employee-name"><span class="print-emp-name-text">${esc(emp.name)}</span><small class="print-emp-shift">${esc(emp.shift)}</small></th>${cells}</tr>`;
        })
        .join("");
      return sectorRow + empRows;
    })
    .join("");

  const colgroup = `<colgroup><col class="print-col-name">${DAYS.map(() => `<col class="print-col-day">`).join("")}</colgroup>`;

  return `
  <div id="scalePrintContainer">
    <section class="scale-print-area ${companyClass} ${density}">
      <header class="scale-print-header scale-print-header-corporate">
        <div class="scale-print-brand">
          <p class="scale-print-legal-name">${esc(legalName)}</p>
          <div class="scale-print-logo-slot" aria-hidden="true">LOGO</div>
          <p class="scale-print-cnpj">CNPJ: ${esc(cnpj)}</p>
        </div>
        <div class="scale-print-title">
          <h2>ESCALA DE FOLGA</h2>
          <p class="scale-print-month-display no-screen">JUNHO / 2026</p>
        </div>
        <div class="scale-print-meta-side">
          <p class="scale-print-issue-print">Emissão: 17/06/2026</p>
        </div>
      </header>
      <div class="scale-print-table-wrap">
        <table class="scale-print-table">
          ${colgroup}
          <thead>
            <tr><th>Funcionários</th>${headerDays}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <section class="scale-print-footer">
        <div class="scale-print-observations">
          <h3>OBSERVAÇÕES</h3>
          <div class="scale-print-notes-print">Observações de teste de impressão.</div>
        </div>
        <div class="scale-print-signature scale-print-signature-simple">
          <div class="scale-print-sign-block">
            <div class="scale-print-sign-line" aria-hidden="true"></div>
            <p class="scale-print-sign-name">Responsável Teste</p>
            <p class="scale-print-sign-role">Responsável pela empresa</p>
          </div>
        </div>
      </section>
      <section class="scale-print-bottom">
        <div class="scale-print-legend"><strong>Legenda</strong><span>F = Folga Semanal</span><span>CO = Compensação</span></div>
        <div class="scale-print-instructions"><strong>Instruções</strong><span>Imprimir em A4 horizontal.</span></div>
      </section>
    </section>
  </div>`;
}

/**
 * CSS REAL do projeto, lido UMA vez e embutido no HTML de cada caso.
 *
 * Antes eram três <link href="file://…">: o Chrome abria uma requisição por
 * arquivo e o `goto` esperava `networkidle0` (500ms de ociosidade após a última
 * resposta), custando ~0,9s por caso. Embutir é idêntico em cascata — a ordem
 * dos arquivos é preservada e nenhum dos três usa `url(...)`, então não há
 * caminho relativo para resolver.
 */
const CSS_FILES = ["style.css", "print.css", "escala-print.css"];
const INLINE_CSS = CSS_FILES.map(
  (file) => `/* ===== css/${file} ===== */\n${fs.readFileSync(path.join(root, "css", file), "utf8")}`
).join("\n");

function buildHtml(areaHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>${INLINE_CSS}</style>
  <style>@page { size: A4 landscape; margin: 0; }</style>
  </head><body class="printing-scale">${areaHtml}</body></html>`;
}

function countPdfPages(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const txt = buf.toString("latin1");
  const matches = txt.match(/\/Type\s*\/Page[^s]/g) || [];
  return matches.length;
}

let pass = 0, fail = 0;

/** Abre uma aba só para este caso e garante o fechamento dela. */
async function validateCase(browser, label, cfg) {
  const page = await browser.newPage();
  try {
    return await runCase(page, label, cfg);
  } finally {
    await page.close();
  }
}

/**
 * Devolve o relatório pronto (linhas + contagens) em vez de imprimir na hora:
 * os casos rodam em paralelo e a saída precisa sair agrupada, na ordem em que
 * foram declarados.
 */
async function runCase(page, label, cfg) {
  const lines = [`\n[${label}]`];
  let casePass = 0, caseFail = 0;
  const check = (desc, cond) => {
    if (cond) { casePass += 1; lines.push(`  ✓ ${desc}`); }
    else { caseFail += 1; lines.push(`  ✗ ${desc}`); }
  };

  const totalCount = cfg.employeesByDept.reduce((n, [, e]) => n + e.length, 0);
  const html = buildHtml(buildPrintArea({ ...cfg, totalCount }));
  const htmlPath = path.join(outDir, `${label.replace(/[^a-z0-9]+/gi, "-")}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");

  // "load" basta: com o CSS embutido a página não faz nenhuma requisição, e
  // `load` só dispara depois de aplicar todas as folhas de estilo.
  await page.goto("file:///" + htmlPath.replace(/\\/g, "/"), { waitUntil: "load" });
  await page.emulateMediaType("print");

  // Replica applyPrintFitScale (js/escala.js): mede a altura natural do conteúdo
  // e calcula o fator de auto-fit para caber em UMA folha A4 paisagem.
  const fit = await page.evaluate(() => {
    const MM = 96 / 25.4;
    const pageW = 297 * MM, pageH = 210 * MM, safety = 6;
    const area = document.querySelector(".scale-print-area");
    const contentH = area.scrollHeight;
    const contentW = area.scrollWidth;
    const scale = Math.min(
      1,
      contentH > 0 ? (pageH - safety) / contentH : 1,
      contentW > 0 ? pageW / contentW : 1
    );
    area.style.setProperty("--scale-print-fit", String(scale));
    document.getElementById("scalePrintContainer")?.style.setProperty("--scale-print-fit", String(scale));
    return { scale, contentH, pageH: Math.round(pageH) };
  });

  // Com a escala aplicada, mede visibilidade real dentro da página (sem corte).
  const m = await page.evaluate(() => {
    const pageH = Math.round(210 * 96 / 25.4);
    const area = document.querySelector(".scale-print-area");
    const cont = document.getElementById("scalePrintContainer");
    const cs = getComputedStyle(area);
    const contCs = getComputedStyle(cont);
    const names = [...document.querySelectorAll(".print-employee-name")];
    const sectors = [...document.querySelectorAll(".sector-divider-print")];
    // getBoundingClientRect já considera o transform: scale aplicado à área.
    const overflowing = names.filter((n) => n.getBoundingClientRect().bottom > pageH + 1);
    // Geometria das colunas (a escala se cancela na razão nome/dia).
    const headThs = [...document.querySelectorAll(".scale-print-table thead tr:last-child th")];
    const tableRect = document.querySelector(".scale-print-table").getBoundingClientRect();
    const nameW = headThs[0].getBoundingClientRect().width;
    const day01W = headThs[1].getBoundingClientRect().width;
    const dayLastRect = headThs[headThs.length - 1].getBoundingClientRect();
    const nameToDayRatio = day01W > 0 ? nameW / day01W : 0;
    const gridFillPct = Math.round(((dayLastRect.right - tableRect.left) / tableRect.width) * 100);
    const lastBottoms = {
      legend: document.querySelector(".scale-print-legend")?.getBoundingClientRect().bottom || 0,
      instructions: document.querySelector(".scale-print-instructions")?.getBoundingClientRect().bottom || 0,
      sign: document.querySelector(".scale-print-sign-name")?.getBoundingClientRect().bottom || 0
    };
    return {
      areaOverflow: cs.overflowY,
      contOverflow: contCs.overflowY,
      areaMaxHeight: cs.maxHeight,
      contHeight: Math.round(parseFloat(contCs.height)),
      employeeRows: names.length,
      overflowingRows: overflowing.length,
      sectorCount: sectors.length,
      hasLegend: !!document.querySelector(".scale-print-legend"),
      hasObs: !!document.querySelector(".scale-print-notes-print"),
      hasSign: !!document.querySelector(".scale-print-sign-name"),
      footerBottom: Math.round(Math.max(lastBottoms.legend, lastBottoms.instructions, lastBottoms.sign)),
      nameToDayRatio: Math.round(nameToDayRatio * 10) / 10,
      gridFillPct,
      pageH
    };
  });

  const pdfPath = path.join(outDir, `${label.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  const pages = countPdfPages(pdfPath);

  lines.push(`  (funcionários=${totalCount}, escala=${fit.scale.toFixed(3)}, conteúdo=${Math.round(fit.contentH)}px, páginas PDF=${pages}, rodapé.bottom=${m.footerBottom}px, pageH=${m.pageH}px, razão nome/dia=${m.nameToDayRatio}, grade preenche=${m.gridFillPct}%) -> ${pdfPath}`);

  check(`Todos os ${totalCount} funcionários renderizados`, m.employeeRows === totalCount);
  check(`Nenhum funcionário cortado (todos dentro da página)`, m.overflowingRows === 0);
  check(`Coluna de funcionários sem inchar (razão nome/dia ${m.nameToDayRatio} < 5)`, m.nameToDayRatio > 0 && m.nameToDayRatio < 5);
  check(`Grade aproveita a largura (dia 01 logo após o nome; preenche ${m.gridFillPct}% ≥ 97%)`, m.gridFillPct >= 97);
  check(`Todos os ${cfg.employeesByDept.length} setores presentes (nenhum cortado)`, m.sectorCount === cfg.employeesByDept.length);
  check("Container travado em 210mm (overflow hidden)", m.contOverflow === "hidden" && m.contHeight === m.pageH);
  check("Área com max-height livre para o auto-fit (max-height: none)", m.areaMaxHeight === "none");
  check("Legenda presente e dentro da folha", m.hasLegend && m.footerBottom <= m.pageH + 1);
  check("Observações presentes", m.hasObs);
  check("Assinatura presente", m.hasSign);
  check(`PDF em 1 ÚNICA página A4 paisagem`, pages === 1);
  return { lines, casePass, caseFail };
}

(async () => {
  const exe = findChrome();
  if (!exe) { console.error("Chrome/Edge não encontrado."); process.exit(2); }
  console.log("Chrome:", exe);
  console.log("Saída (HTML/PDF):", outDir);

  const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox"] });

  // Cada caso deve resultar em 1 ÚNICA página A4 paisagem, sem cortar ninguém.
  // Chez Pitu e Pengold, com quadro grande (auto-fit reduz) e pequeno (não reduz).
  const CHEZ = {
    companyClass: "scale-company-chez-pitu",
    legalName: "Chez Pitu Restaurante LTDA",
    cnpj: "00.000.000/0001-00"
  };
  const PENGOLD = {
    companyClass: "scale-company-pengold",
    legalName: "Pengold Comércio LTDA",
    cnpj: "11.111.111/0001-11"
  };
  const CASES = [
    ["Chez Pitu Junho-2026 (48 func.)", { ...CHEZ, employeesByDept: buildEmployees(48) }],
    ["Chez Pitu Junho-2026 (20 func.)", { ...CHEZ, employeesByDept: buildEmployees(20) }],
    ["Chez Pitu Junho-2026 (8 func.)", { ...CHEZ, employeesByDept: buildEmployees(8) }],
    ["Pengold Junho-2026 (40 func.)", { ...PENGOLD, employeesByDept: buildEmployees(40) }],
    ["Pengold Junho-2026 (8 func.)", { ...PENGOLD, employeesByDept: buildEmployees(8) }]
  ];

  // Os casos são independentes (aba própria, arquivo próprio), então rodam em
  // PARALELO: o custo dominante é o page.pdf() do Chrome (~0,5s cada), que em
  // série somava ~2,6s. A saída é impressa depois, na ordem declarada acima.
  const reports = await Promise.all(
    CASES.map(([label, cfg]) => validateCase(browser, label, cfg))
  );
  reports.forEach((report) => {
    report.lines.forEach((line) => console.log(line));
    pass += report.casePass;
    fail += report.caseFail;
  });

  await browser.close();
  console.log(`\n=== RESUMO IMPRESSÃO: ${pass} passou, ${fail} falhou ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
