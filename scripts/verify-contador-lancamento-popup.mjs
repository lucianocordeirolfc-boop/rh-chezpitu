/**
 * Validação do pop-up "+ Lançamento" (Informações Contador) no Chrome real.
 *
 * Cobre a frente entregue em 29/08/2026:
 *  - botão passa a se chamar "+ Lançamento" (sem "Novo");
 *  - o pop-up nasce com base no mês selecionado na barra de ferramentas: ao
 *    escolher o funcionário, os campos vêm preenchidos com o que já está
 *    lançado naquele mês;
 *  - salvar grava só o funcionário selecionado — os lançamentos dos demais
 *    permanecem byte a byte iguais (REGRA FIXA de imutabilidade);
 *  - depois de salvar, o formulário recarrega os valores gravados;
 *  - a tabela principal não tem mais coluna "Ações" nem botões editar/excluir.
 *
 * Roda sobre um AppData de mentira, 100% em memória (fixture): nenhuma base de
 * produção — localStorage real ou Firebase — é lida ou escrita.
 *
 * Uso: node scripts/verify-contador-lancamento-popup.mjs
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

const FIXTURE = {
  employees: [
    { id: "emp-jefferson", name: "Jefferson Teste", status: "Ativo" },
    { id: "emp-ana", name: "Ana Teste", status: "Ativo" },
    { id: "emp-bruno", name: "Bruno Teste", status: "Ativo" },
    { id: "emp-antigo", name: "Antigo Teste", status: "Inativo", deactivatedAt: "2026-05-31" }
  ],
  contadorLancamentos: {
    "2026-08": [
      {
        employeeId: "emp-jefferson",
        falta: 0, horaExtra: "00:00", gratificacao: 0, comissoes: 0,
        consumoInterno: 212.25, domingoMulher: 0, adNoturno: "00:00", vales: 250,
        updatedAt: 1000,
        // Campo legado, fora do formulário: precisa sobreviver ao salvamento.
        observacaoLegada: "não pode sumir"
      },
      {
        employeeId: "emp-ana",
        falta: 1, horaExtra: "10:30", gratificacao: 100, comissoes: 0,
        consumoInterno: 33.5, domingoMulher: 0, adNoturno: "02:00", vales: 80,
        updatedAt: 1000
      }
    ],
    "2026-07": [
      {
        employeeId: "emp-jefferson",
        falta: 0, horaExtra: "05:00", gratificacao: 0, comissoes: 0,
        consumoInterno: 99.9, domingoMulher: 0, adNoturno: "00:00", vales: 120,
        updatedAt: 900
      }
    ]
  },
  companyInfo: { legalName: "Chez Pitu LTDA", cnpj: "00.000.000/0001-00" }
};

const moduleSrc = fs.readFileSync(path.join(root, "js/contador.js"), "utf8");

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>
<div id="host"></div>
<script>
  // ── AppData de mentira: só o que o módulo Contador consome, tudo em memória.
  window.__state = { "Chez Pitu": ${JSON.stringify(FIXTURE)} };
  window.__saveCount = 0;
  window.AppData = {
    getCompanyData: (c) => window.__state[c],
    saveState: () => { window.__saveCount += 1; },
    isEmployeeActive: (e) => String((e && e.status) || "").trim().toLowerCase() === "ativo",
    getPrimaryPageCompany: () => "Chez Pitu",
    getActiveCompany: () => "Chez Pitu",
    monthKey: () => "2026-08"
  };
  window.__toasts = [];
  window.App = {
    escapeHTML: (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])),
    formatDisplayName: (v) => String(v == null ? "" : v),
    toast: (msg, kind) => { window.__toasts.push({ msg, kind }); }
  };
  window.__lanc = (ym, id) => (window.__state["Chez Pitu"].contadorLancamentos[ym] || []).find((l) => l.employeeId === id) || null;
</script>
<script>${moduleSrc}</script>
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

  // Guarda o estado inicial para provar, no fim, que nada além do alvo mudou.
  await page.evaluate(() => {
    window.__antes = JSON.parse(JSON.stringify(window.__state["Chez Pitu"].contadorLancamentos));
    window.ContadorModule.render(document.getElementById("host"));
  });

  // ── 1. Botão e toolbar ──
  console.log("[1] Botão da barra de ferramentas");
  const btn = await page.evaluate(() => {
    const b = document.getElementById("btnLancamento");
    return { existe: Boolean(b), texto: b ? b.textContent : "", antigo: Boolean(document.getElementById("btnNovoLancamento")) };
  });
  assert(btn.existe, "botão #btnLancamento existe");
  assert(btn.texto === "+ Lançamento", `rótulo é "+ Lançamento" (veio "${btn.texto}")`);
  assert(!/novo/i.test(btn.texto), 'a palavra "Novo" saiu do rótulo');
  assert(!btn.antigo, "o botão antigo #btnNovoLancamento não existe mais");

  // ── 2. Tabela principal sem coluna Ações ──
  console.log("[2] Tabela de lançamentos");
  const tabela = await page.evaluate(() => {
    const heads = [...document.querySelectorAll(".contador-table thead th")].map((th) => th.textContent.trim());
    return {
      heads,
      colunas: heads.length,
      celulasPorLinha: [...document.querySelectorAll(".contador-table tbody tr")].map((tr) => tr.children.length),
      editar: document.querySelectorAll(".btn-edit-lancamento").length,
      excluir: document.querySelectorAll(".btn-delete-lancamento").length,
      acoes: document.querySelectorAll(".contador-table .cell-actions").length
    };
  });
  assert(!tabela.heads.includes("Ações"), `coluna "Ações" saiu do cabeçalho (${tabela.heads.join(" | ")})`);
  assert(tabela.colunas === 9, `cabeçalho com Funcionário + 8 campos (${tabela.colunas})`);
  assert(tabela.celulasPorLinha.every((n) => n === 9), `todas as linhas com 9 células (${tabela.celulasPorLinha.join(",")})`);
  assert(tabela.editar === 0 && tabela.excluir === 0, "nenhum botão de editar/excluir na tela principal");
  assert(tabela.acoes === 0, "nenhuma célula de ações na tabela");

  // ── 3. Pop-up abre com base no mês selecionado ──
  console.log("[3] Pop-up carregado com o mês selecionado");
  const abertura = await page.evaluate(() => {
    document.getElementById("btnLancamento").click();
    const sel = document.getElementById("popupEmployee");
    return {
      aberto: Boolean(document.getElementById("lancamentoPopup")),
      titulo: document.querySelector("#lancamentoPopup .popup-header h3").textContent,
      opcoes: [...sel.options].map((o) => o.textContent),
      valorInicial: sel.value,
      camposVazios: [...document.querySelectorAll("#lancamentoForm .popup-grid input")].every((i) => i.value === "")
    };
  });
  assert(abertura.aberto, "pop-up abriu");
  assert(abertura.titulo.includes("Agosto 2026"), `título mostra o mês-base (${abertura.titulo})`);
  assert(abertura.valorInicial === "", "abre sem funcionário escolhido");
  assert(abertura.camposVazios, "campos começam em branco até escolher o funcionário");
  assert(abertura.opcoes.some((o) => o.startsWith("Jefferson Teste") && o.endsWith(" •")),
    "quem já tem lançamento no mês vem marcado com •");
  assert(abertura.opcoes.some((o) => o === "Bruno Teste"),
    "quem não tem lançamento aparece sem marcação");
  assert(!abertura.opcoes.some((o) => o.startsWith("Antigo Teste")),
    "funcionário inativo não entra na lista");

  // ── 4. Selecionar Jefferson traz os valores de agosto ──
  console.log("[4] Seleção do funcionário preenche os campos");
  const jeff = await page.evaluate(() => {
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-jefferson";
    sel.dispatchEvent(new Event("change"));
    const val = (name) => document.querySelector('#lancamentoForm [name="' + name + '"]').value;
    return {
      consumoInterno: val("consumoInterno"),
      vales: val("vales"),
      falta: val("falta"),
      horaExtra: val("horaExtra")
    };
  });
  assert(jeff.consumoInterno === "212.25", `consumo interno veio 212,25 (${jeff.consumoInterno})`);
  assert(jeff.vales === "250", `vale veio 250,00 (${jeff.vales})`);
  assert(jeff.falta === "" && jeff.horaExtra === "", "campos zerados aparecem em branco, não como 0");

  // Trocar para outro funcionário troca os valores exibidos.
  const ana = await page.evaluate(() => {
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-ana";
    sel.dispatchEvent(new Event("change"));
    const val = (name) => document.querySelector('#lancamentoForm [name="' + name + '"]').value;
    return { consumoInterno: val("consumoInterno"), vales: val("vales"), horaExtra: val("horaExtra"), falta: val("falta") };
  });
  assert(ana.consumoInterno === "33.5" && ana.vales === "80", "trocar de funcionário troca os valores");
  assert(ana.horaExtra === "10:30" && ana.falta === "1", "campos de hora e de falta também são carregados");

  const bruno = await page.evaluate(() => {
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-bruno";
    sel.dispatchEvent(new Event("change"));
    return [...document.querySelectorAll("#lancamentoForm .popup-grid input")].every((i) => i.value === "");
  });
  assert(bruno, "funcionário sem lançamento no mês abre com campos em branco");

  // ── 5. Salvar altera só o funcionário selecionado ──
  console.log("[5] Salvar o vale do Jefferson em 300,00");
  const salvo = await page.evaluate(() => {
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-jefferson";
    sel.dispatchEvent(new Event("change"));
    document.querySelector('#lancamentoForm [name="vales"]').value = "300";
    document.getElementById("lancamentoForm").dispatchEvent(new Event("submit", { cancelable: true }));
    return {
      registro: window.__lanc("2026-08", "emp-jefferson"),
      ana: window.__lanc("2026-08", "emp-ana"),
      julhoIntacto: JSON.stringify(window.__state["Chez Pitu"].contadorLancamentos["2026-07"]) === JSON.stringify(window.__antes["2026-07"]),
      anaIntacta: JSON.stringify(window.__lanc("2026-08", "emp-ana")) === JSON.stringify(window.__antes["2026-08"].find((l) => l.employeeId === "emp-ana")),
      totalAgosto: window.__state["Chez Pitu"].contadorLancamentos["2026-08"].length,
      valorNoForm: document.querySelector('#lancamentoForm [name="vales"]').value,
      consumoNoForm: document.querySelector('#lancamentoForm [name="consumoInterno"]').value,
      selecionado: document.getElementById("popupEmployee").value,
      aindaAberto: Boolean(document.getElementById("lancamentoPopup")),
      toasts: window.__toasts.map((t) => t.msg)
    };
  });
  assert(salvo.registro && salvo.registro.vales === 300, `vale gravado como 300 (${salvo.registro && salvo.registro.vales})`);
  assert(salvo.registro && salvo.registro.consumoInterno === 212.25, "consumo interno não alterado permanece 212,25");
  assert(salvo.registro && salvo.registro.observacaoLegada === "não pode sumir", "campo legado fora do formulário foi preservado");
  assert(salvo.registro && salvo.registro.updatedAt > 1000, "updatedAt foi recarimbado (merge entre PCs)");
  assert(salvo.anaIntacta, "lançamento da Ana permaneceu idêntico");
  assert(salvo.julhoIntacto, "lançamentos de julho permaneceram idênticos");
  assert(salvo.totalAgosto === 2, `nenhum registro extra criado em agosto (${salvo.totalAgosto})`);
  assert(salvo.valorNoForm === "300" && salvo.consumoNoForm === "212.25", "formulário recarrega os valores salvos");
  assert(salvo.selecionado === "emp-jefferson", "funcionário continua selecionado depois de salvar");
  assert(salvo.aindaAberto, "pop-up continua aberto para o próximo lançamento");
  assert(salvo.toasts.includes("Lançamento salvo."), "usuário recebe confirmação de gravação");

  // A tabela de fundo já mostra o novo valor.
  const tabelaAtualizada = await page.evaluate(() =>
    [...document.querySelectorAll(".contador-table tbody tr")]
      .map((tr) => [...tr.children].map((td) => td.textContent.trim()))
  );
  const linhaJeff = tabelaAtualizada.find((l) => l[0] === "Jefferson Teste");
  assert(Boolean(linhaJeff) && linhaJeff[linhaJeff.length - 1] === "300,00",
    `tabela principal reflete o valor salvo (${linhaJeff ? linhaJeff[linhaJeff.length - 1] : "linha ausente"})`);

  // ── 6. Novo lançamento para quem não tinha nada ──
  console.log("[6] Lançamento novo não mexe nos demais");
  const novo = await page.evaluate(() => {
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-bruno";
    sel.dispatchEvent(new Event("change"));
    document.querySelector('#lancamentoForm [name="comissoes"]').value = "45.5";
    document.getElementById("lancamentoForm").dispatchEvent(new Event("submit", { cancelable: true }));
    return {
      bruno: window.__lanc("2026-08", "emp-bruno"),
      jeff: window.__lanc("2026-08", "emp-jefferson"),
      anaIntacta: JSON.stringify(window.__lanc("2026-08", "emp-ana")) === JSON.stringify(window.__antes["2026-08"].find((l) => l.employeeId === "emp-ana")),
      total: window.__state["Chez Pitu"].contadorLancamentos["2026-08"].length,
      marcado: [...document.getElementById("popupEmployee").options].find((o) => o.value === "emp-bruno").textContent
    };
  });
  assert(novo.bruno && novo.bruno.comissoes === 45.5, "lançamento novo foi criado com o valor digitado");
  assert(novo.bruno && novo.bruno.horaExtra === "00:00", "campos de hora em branco viram 00:00");
  assert(novo.jeff && novo.jeff.vales === 300, "lançamento do Jefferson seguiu com 300");
  assert(novo.anaIntacta, "lançamento da Ana continua intacto");
  assert(novo.total === 3, `agosto passou a ter 3 lançamentos (${novo.total})`);
  assert(novo.marcado.endsWith(" •"), "opção do funcionário passa a exibir o • depois de salvar");

  // ── 7. Trocar o mês na barra troca a base do pop-up ──
  console.log("[7] Base do pop-up acompanha o mês selecionado");
  const julho = await page.evaluate(() => {
    document.getElementById("lancamentoPopup").remove();
    const mes = document.getElementById("contadorMonth");
    mes.value = "07";
    mes.dispatchEvent(new Event("change"));
    document.getElementById("btnLancamento").click();
    const sel = document.getElementById("popupEmployee");
    sel.value = "emp-jefferson";
    sel.dispatchEvent(new Event("change"));
    const val = (name) => document.querySelector('#lancamentoForm [name="' + name + '"]').value;
    return {
      titulo: document.querySelector("#lancamentoPopup .popup-header h3").textContent,
      consumoInterno: val("consumoInterno"),
      vales: val("vales"),
      horaExtra: val("horaExtra")
    };
  });
  assert(julho.titulo.includes("Julho 2026"), `título acompanha o mês (${julho.titulo})`);
  assert(julho.consumoInterno === "99.9" && julho.vales === "120", "pop-up traz os valores de julho, não os de agosto");
  assert(julho.horaExtra === "05:00", "hora extra de julho carregada");

  // ── 8. Nada foi salvo sem o usuário mandar ──
  console.log("[8] Imutabilidade");
  const final = await page.evaluate(() => ({
    agosto: window.__state["Chez Pitu"].contadorLancamentos["2026-08"].map((l) => l.employeeId).sort(),
    julho: JSON.stringify(window.__state["Chez Pitu"].contadorLancamentos["2026-07"]) === JSON.stringify(window.__antes["2026-07"]),
    saves: window.__saveCount
  }));
  assert(final.julho, "abrir o pop-up em julho não gravou nada");
  assert(final.agosto.join(",") === "emp-ana,emp-bruno,emp-jefferson", `base final íntegra (${final.agosto.join(",")})`);
  assert(final.saves === 2, `saveState chamado só nas duas gravações do usuário (${final.saves})`);
} finally {
  await browser.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
