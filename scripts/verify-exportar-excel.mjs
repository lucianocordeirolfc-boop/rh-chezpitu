/**
 * Cadastro → "Exportar Excel" (js/xlsx-export.js + js/funcionarios.js), no Chrome real.
 *
 * Roda os módulos verdadeiros com um AppData em memória: nenhum dado de produção
 * é lido ou gravado. Confere que a planilha traz uma linha por funcionário, com
 * todos os campos na coluna certa, e que exportar não altera nenhum registro.
 *
 * Opcional: XLSX_OUT=caminho.xlsx grava o arquivo gerado para inspeção manual.
 *
 * Uso: node scripts/verify-exportar-excel.mjs
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

const DATA = {
  "Chez Pitu": {
    companyInfo: { legalName: "Chez Pitu Hotelaria Ltda", cnpj: "12.345.678/0001-90" },
    employees: [
      {
        id: "e1", name: "Ana Fixture", cpf: "012.345.678-90", ctps: "0001234", role: "Garçom",
        department: "Salão", status: "Ativo", admissionDate: "2024-01-15", fixedDay: "Segunda",
        defaultShift: "07h às 15:20h", sundayOffWeeks: "1,3", doubleSundayOff: "true", vtDaily: 17.3,
        notes: 'Obs com "aspas" & <tags>\nsegunda linha', source: "manual",
        createdAt: Date.UTC(2024, 0, 15, 12, 0), updatedAt: Date.UTC(2026, 10, 1, 12, 0)
      },
      {
        id: "e2", name: "Caio Fixture", cpf: "", ctps: "", role: "Camareira", department: "Governança",
        status: "Inativo", admissionDate: "2023-03-01", deactivatedAt: "2026-08-20", fixedDay: "",
        defaultShift: "", sundayOffWeeks: "", doubleSundayOff: "false", vtDaily: 0, notes: "", source: "imported"
      },
      {
        id: "e3", name: "Bia Fixture", cpf: "987.654.321-00", ctps: "55", role: "Recepcionista",
        department: "Recepção", status: "Ativo", admissionDate: "2025-06-10", fixedDay: "Terça",
        defaultShift: "14h às 22:20h", sundayOffWeeks: "2", doubleSundayOff: "false", vtDaily: 8.65,
        notes: "", source: "manual", __pending: { currentDay: "Quarta", nextDay: "Terça", effectiveFrom: "2026-12-01" }
      }
    ]
  },
  Pengold: {
    companyInfo: { legalName: "Pengold SA", cnpj: "99.999.999/0001-99" },
    employees: [{ id: "p1", name: "Eva Pengold", role: "Cozinheiro", status: "Ativo", admissionDate: "2024-02-02" }]
  }
};

const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const dataSource = read("js/data.js");
const normalizeSource = dataSource.match(/function normalizeSearchText\(value\) \{[\s\S]*?\n {2}\}/)?.[0];
if (!normalizeSource) {
  console.error("normalizeSearchText não encontrada em js/data.js.");
  process.exit(1);
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>
<div id="host"></div>
<script>
  ${normalizeSource}
  window.__data = ${JSON.stringify(DATA)};
  window.__writes = 0;
  window.__alerts = [];
  window.__toasts = [];
  window.alert = (m) => window.__alerts.push(m);
  const write = () => { window.__writes += 1; };
  window.AppData = {
    COMPANIES: ["Chez Pitu", "Pengold"], WEEK_DAYS: ["Segunda"], SCALE_CODES: [],
    normalizeSearchText,
    getCompanies: () => ["Chez Pitu", "Pengold"],
    getCompanyData: (c) => window.__data[c] || { employees: [], companyInfo: {} },
    getActiveCompany: () => window.__active || "Chez Pitu",
    getPageCompany: () => window.__active || "Chez Pitu",
    getPrimaryPageCompany: () => window.__active || "Chez Pitu",
    isPageCompanyAll: () => false,
    sortEmployeesByName: (l) => [...l].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    isEmployeeActive: (e) => e.status === "Ativo",
    canDeleteEmployee: () => false,
    todayISO: () => "2026-11-10",
    formatDateBR: (v) => v || "",
    formatVtInput: (v) => String(v ?? ""),
    formatVtCurrency: (v) => String(v ?? ""),
    parseVtDaily: (v) => Number(String(v).replace(",", ".")) || 0,
    getFixedDayChangeInfo: (e) => e.__pending || null,
    resolveFixedDayForDate: (e) => (e.__pending ? e.__pending.currentDay : e.fixedDay || ""),
    getNextMonthFirstDay: () => "2026-12-01",
    upsertEmployee: write, setEmployeeStatus: write, removeEmployee: write, importEmployeesBatch: write
  };
  window.ImportUtils = { importModalMarkup: () => "", bindImportModal: () => {} };
  window.App = {
    renderCurrent: () => {},
    toast: (m) => window.__toasts.push(m),
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  };
</script>
<script>${read("js/xlsx-export.js")}</script>
<script>${read("js/funcionarios.js")}</script>
<script>
  // Intercepta o download: guarda nome e bytes em vez de baixar.
  const realBuild = window.XlsxExport.build;
  window.__downloads = [];
  window.XlsxExport.download = (filename, sheet) => {
    const bytes = realBuild(sheet);
    window.__downloads.push({ filename, bytes: Array.from(bytes) });
    return bytes.length;
  };
  window.FuncionariosModule.render(document.getElementById("host"));
</script>
</body></html>`;

/** Lê um zip "stored" (o gerador não comprime) e devolve { nome: texto }. */
function unzipStored(buffer) {
  const files = {};
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 0;
  while (pos + 4 <= buffer.length && view.getUint32(pos, true) === 0x04034b50) {
    const method = view.getUint16(pos + 8, true);
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = buffer.subarray(pos + 30, pos + 30 + nameLen).toString("utf8");
    const start = pos + 30 + nameLen + extraLen;
    files[name] = { method, text: buffer.subarray(start, start + size).toString("utf8") };
    pos = start + size;
  }
  return files;
}

/** Extrai as linhas da sheet1 como matriz { "A1": {t, s, v} }. */
function parseCells(sheetXml) {
  const cells = {};
  const re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(sheetXml))) {
    const attrs = m[2];
    const t = attrs.match(/t="([^"]+)"/)?.[1] || "n";
    const s = Number(attrs.match(/s="(\d+)"/)?.[1] || 0);
    const raw = t === "inlineStr" ? m[3].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] : m[3].match(/<v>([^<]*)<\/v>/)?.[1];
    const v = String(raw ?? "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    cells[m[1]] = { t, s, v };
  }
  return cells;
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const before = await page.evaluate(() => JSON.stringify(window.__data));

  console.log("[1] Botão na lista de funcionários");
  const hasButton = await page.evaluate(() => Boolean(document.getElementById("btnExportEmployeesExcel")));
  assert(hasButton, "botão 'Exportar Excel' presente no Cadastro");

  // Filtro de tela ativo não pode reduzir a exportação.
  await page.evaluate(() => {
    const f = document.getElementById("employeeFilterStatus");
    f.value = "Ativo";
    f.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("btnExportEmployeesExcel").click();
  });
  const dl = await page.evaluate(() => window.__downloads[0]);
  assert(dl?.filename === "funcionarios-chez-pitu-2026-11-10.xlsx", `nome do arquivo (${dl?.filename})`);

  const buffer = Buffer.from(dl.bytes);
  if (process.env.XLSX_OUT) fs.writeFileSync(process.env.XLSX_OUT, buffer);

  console.log("[2] Pacote .xlsx válido");
  assert(buffer.subarray(0, 2).toString() === "PK", "arquivo é um zip (assinatura PK)");
  const files = unzipStored(buffer);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert(Boolean(files[part]), `contém ${part}`);
  }
  const sheetXml = files["xl/worksheets/sheet1.xml"].text;
  assert(/<sheet name="Funcionários Chez Pitu"/.test(files["xl/workbook.xml"].text), "aba nomeada com a empresa");
  assert(/state="frozen"/.test(sheetXml) && /<autoFilter ref="A1:W4"\/>/.test(sheetXml), "cabeçalho congelado e autofiltro A1:W4");

  console.log("[3] Conteúdo linear: 1 cabeçalho + 1 linha por funcionário");
  const cells = parseCells(sheetXml);
  const rowCount = (sheetXml.match(/<row /g) || []).length;
  assert(rowCount === 4, `4 linhas = cabeçalho + 3 funcionários, inclusive o inativo e apesar do filtro (${rowCount})`);
  assert(cells.A1.v === "Empresa" && cells.E1.v === "Nome" && cells.W1.v === "Atualizado em", "cabeçalhos A..W");
  assert(cells.E2.v === "Ana Fixture" && cells.E3.v === "Bia Fixture" && cells.E4.v === "Caio Fixture", "ordem alfabética por nome");
  assert(!Object.values(cells).some((c) => c.v === "Eva Pengold"), "não mistura funcionário de outra empresa");

  console.log("[4] Campos na coluna certa (Ana)");
  assert(cells.A2.v === "Chez Pitu" && cells.B2.v === "Chez Pitu Hotelaria Ltda" && cells.C2.v === "12.345.678/0001-90", "empresa, razão social e CNPJ");
  assert(cells.D2.v === "e1", "ID interno (employeeId)");
  assert(cells.F2.v === "012.345.678-90" && cells.F2.s === 5, "CPF como texto, zero à esquerda preservado");
  assert(cells.G2.v === "0001234" && cells.G2.s === 5, "CTPS como texto, zeros preservados");
  assert(cells.H2.v === "Garçom" && cells.I2.v === "Salão" && cells.J2.v === "Ativo", "cargo, setor e status (acentos intactos)");
  assert(cells.K2.t === "n" && cells.K2.v === "45306" && cells.K2.s === 2, "admissão 15/01/2024 como data real do Excel");
  assert(!cells.L2, "ativo sem data de desligamento");
  assert(cells.M2.v === "Segunda" && !cells.N2 && !cells.O2, "folga vigente, sem troca agendada");
  assert(cells.P2.v === "07h às 15:20h", "horário");
  assert(cells.Q2.v === "1º, 3º" && cells.R2.v === "Sim", "domingos de folga e regime 2 domingos");
  assert(cells.S2.t === "n" && cells.S2.v === "17.3" && cells.S2.s === 3, "VT como número em formato R$");
  assert(cells.T2.v === "Manual", "origem");
  assert(cells.U2.v === 'Obs com "aspas" & <tags>\nsegunda linha', "observações com caracteres especiais intactas");
  assert(cells.V2.t === "n" && cells.V2.s === 4 && cells.W2.s === 4, "cadastrado/atualizado em como data e hora");

  console.log("[5] Troca de folga agendada (Bia) e inativo (Caio)");
  assert(cells.M3.v === "Quarta" && cells.N3.v === "Terça" && cells.O3.v === "46357", "vigente Quarta, nova Terça a partir de 01/12/2026");
  assert(cells.S3.v === "8.65", "VT 8,65 sem arredondar");
  assert(cells.J4.v === "Inativo" && cells.L4.v === "46254" && cells.L4.s === 2, "inativo com desligamento 20/08/2026");
  assert(!cells.F4 && !cells.G4, "CPF/CTPS vazios ficam em branco, sem inventar valor");
  assert(cells.R4.v === "Não" && cells.S4.v === "0" && cells.T4.v === "Importado", "regime, VT zero e origem importado");
  assert(!cells.V4 && !cells.W4, "registro legado sem carimbos fica em branco");

  console.log("[6] Somente leitura");
  const after = await page.evaluate(() => JSON.stringify(window.__data));
  const writes = await page.evaluate(() => window.__writes);
  assert(after === before, "dados do cadastro idênticos antes e depois da exportação");
  assert(writes === 0, "nenhuma função de gravação chamada");
  const toasts = await page.evaluate(() => window.__toasts);
  assert(toasts.some((t) => t.includes("3 funcionário(s)")), "aviso informa a quantidade exportada");

  console.log("[7] Outra empresa e empresa vazia");
  await page.evaluate(() => {
    window.__active = "Pengold";
    window.FuncionariosModule.render(document.getElementById("host"));
    document.getElementById("btnExportEmployeesExcel").click();
  });
  const dl2 = await page.evaluate(() => window.__downloads[1]);
  const cells2 = parseCells(unzipStored(Buffer.from(dl2.bytes))["xl/worksheets/sheet1.xml"].text);
  assert(dl2.filename === "funcionarios-pengold-2026-11-10.xlsx" && cells2.E2.v === "Eva Pengold" && !cells2.E3, "Pengold exporta só os seus");
  await page.evaluate(() => {
    window.__active = "Vazia";
    window.FuncionariosModule.render(document.getElementById("host"));
    document.getElementById("btnExportEmployeesExcel").click();
  });
  const empty = await page.evaluate(() => ({ n: window.__downloads.length, alerts: window.__alerts }));
  assert(empty.n === 2 && empty.alerts.length === 1, "empresa sem funcionários avisa e não gera arquivo");
} finally {
  await browser.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
