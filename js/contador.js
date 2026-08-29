(function () {
  const LANCAMENTO_FIELDS = [
    { key: "falta",          label: "Falta (dias)",           type: "number" },
    { key: "horaExtra",      label: "Hora Extra",             type: "time" },
    { key: "gratificacao",   label: "Gratificação (R$)",      type: "number" },
    { key: "comissoes",      label: "Comissões (R$)",         type: "number" },
    { key: "consumoInterno", label: "Consumo Interno (R$)",   type: "number" },
    { key: "domingoMulher",  label: "Domingo da Mulher (R$)", type: "number" },
    { key: "adNoturno",      label: "Ad. Noturno",            type: "time" },
    { key: "vales",          label: "Vales (R$)",             type: "number" }
  ];

  // Normaliza um campo de horas no formato HH:MM aceitando de 00:00 até 200:00.
  // Aceita entradas como "8", "8:30", "120:00", "200:00". Retorna a string
  // normalizada "HH:MM" ou null quando o valor for inválido.
  var HORA_MAXIMA = 200;
  function normalizeHora(raw) {
    if (raw == null) return "00:00";
    var s = String(raw).trim();
    if (!s) return "00:00";
    var m = s.match(/^(\d{1,3})(?::(\d{1,2}))?$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = m[2] != null ? parseInt(m[2], 10) : 0;
    if (isNaN(h) || isNaN(min)) return null;
    if (min > 59) return null;
    if (h > HORA_MAXIMA || (h === HORA_MAXIMA && min > 0)) return null;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  // Máscara de digitação para campos de horas (padrão HHH:MM, até 200:00).
  // Regra única: os 2 últimos dígitos viram minutos e o restante (até 3 dígitos)
  // vira horas. Ex.: "1030" -> "10:30", "20000" -> "200:00", "030" -> "0:30",
  // "17845" -> "178:45". Se o usuário digitar o ":" manualmente, ele é respeitado;
  // e se continuar digitando além dos 2 minutos, os dígitos "transbordam" para as
  // horas (permite chegar a 3 dígitos de hora sem perder o que foi digitado).
  function maskHora(value) {
    var s = String(value || "");
    var idx = s.indexOf(":");
    if (idx >= 0) {
      var hhRaw = s.slice(0, idx).replace(/\D/g, "");
      var mmRaw = s.slice(idx + 1).replace(/\D/g, "");
      if (mmRaw.length <= 2) return hhRaw.slice(0, 3) + ":" + mmRaw;
      // Transbordo: reflui todos os dígitos com os 2 últimos como minutos.
      var all = (hhRaw + mmRaw).slice(0, 5);
      return all.slice(0, all.length - 2) + ":" + all.slice(-2);
    }
    var digits = s.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    digits = digits.slice(0, 5);
    return digits.slice(0, digits.length - 2) + ":" + digits.slice(-2);
  }

  // Converte "HH:MM" (ou só horas) em minutos; usado para somar totais.
  function horaToMinutes(val) {
    var s = String(val || "").trim();
    if (!s) return 0;
    var m = s.match(/^(\d{1,4})(?::(\d{1,2}))?$/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + (m[2] != null ? parseInt(m[2], 10) : 0);
  }

  function minutesToHora(total) {
    if (!total) return "—";
    var h = Math.floor(total / 60);
    var mm = total % 60;
    return h + ":" + String(mm).padStart(2, "0");
  }

  // Soma cada coluna sobre os funcionários exibidos: horas em HH:MM, valores em R$.
  function computeTotals(employees, lancMap) {
    var totals = {};
    LANCAMENTO_FIELDS.forEach(function (f) {
      var acc = 0;
      employees.forEach(function (emp) {
        var lanc = lancMap[emp.id];
        if (!lanc) return;
        if (f.type === "time") {
          acc += horaToMinutes(lanc[f.key]);
        } else {
          acc += parseFloat(lanc[f.key]) || 0;
        }
      });
      totals[f.key] = f.type === "time" ? minutesToHora(acc) : formatMoney(acc);
    });
    return totals;
  }

  function getLancamentos(company, yearMonth) {
    var data = AppData.getCompanyData(company);
    if (!data.contadorLancamentos) data.contadorLancamentos = {};
    if (!data.contadorLancamentos[yearMonth]) data.contadorLancamentos[yearMonth] = [];
    return data.contadorLancamentos[yearMonth];
  }

  function saveLancamento(company, yearMonth, lancamento) {
    var data = AppData.getCompanyData(company);
    if (!data.contadorLancamentos) data.contadorLancamentos = {};
    if (!data.contadorLancamentos[yearMonth]) data.contadorLancamentos[yearMonth] = [];

    // Carimbo de versão: permite que a sincronização em tempo real resolva
    // conflitos por "mais recente vence" (ver mergeLancamentosMaps em data.js).
    // Sem ele, o merge "prefere local" descartava a edição remota em outros PCs.
    lancamento.updatedAt = Date.now();

    var existing = data.contadorLancamentos[yearMonth].findIndex(function (l) {
      return l.employeeId === lancamento.employeeId;
    });

    if (existing >= 0) {
      data.contadorLancamentos[yearMonth][existing] = lancamento;
    } else {
      data.contadorLancamentos[yearMonth].push(lancamento);
    }

    AppData.saveState();
  }

  // Sem gatilho na interface desde a retirada da coluna "Ações" (a edição passa
  // a ser feita pelo pop-up "+ Lançamento"). Mantida para uso programático /
  // recuperação, jamais chamada automaticamente.
  function deleteLancamento(company, yearMonth, employeeId) {
    var data = AppData.getCompanyData(company);
    if (!data.contadorLancamentos || !data.contadorLancamentos[yearMonth]) return;
    data.contadorLancamentos[yearMonth] = data.contadorLancamentos[yearMonth].filter(function (l) {
      return l.employeeId !== employeeId;
    });
    AppData.saveState();
  }

  function getEmployeesForCompany(company) {
    var data = AppData.getCompanyData(company);
    if (!data || !data.employees) return [];
    return data.employees
      .filter(function (e) { return AppData.isEmployeeActive(e); })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "pt-BR"); });
  }

  function getEmployeeName(company, employeeId) {
    var data = AppData.getCompanyData(company);
    if (!data || !data.employees) return employeeId;
    var emp = data.employees.find(function (e) { return e.id === employeeId; });
    return emp ? (emp.name || employeeId) : employeeId;
  }

  function currentYearMonth() {
    return AppData.monthKey ? AppData.monthKey() : new Date().toISOString().slice(0, 7);
  }

  function formatMoney(val) {
    var n = parseFloat(val);
    if (isNaN(n) || n === 0) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatCellValue(val, field) {
    if (field.type === "time") {
      if (!val || val === "0" || val === 0) return "—";
      return String(val);
    }
    return formatMoney(val);
  }

  function renderMonthSelector(selectedYM) {
    var parts = selectedYM.split("-");
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);

    var months = [
      "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
    ];

    var monthOpts = months.map(function (m, i) {
      var val = String(i + 1).padStart(2, "0");
      return '<option value="' + val + '"' + (i + 1 === month ? " selected" : "") + '>' + m + '</option>';
    }).join("");

    var yearOpts = "";
    for (var y = year - 2; y <= year + 2; y++) {
      yearOpts += '<option value="' + y + '"' + (y === year ? " selected" : "") + '>' + y + '</option>';
    }

    return '<div class="contador-period">' +
      '<select id="contadorMonth" class="field-select">' + monthOpts + '</select>' +
      '<select id="contadorYear" class="field-select">' + yearOpts + '</select>' +
      '</div>';
  }

  function renderLancamentosTable(company, yearMonth) {
    var lancamentos = getLancamentos(company, yearMonth);

    if (!lancamentos.length) {
      return '<div class="empty-state"><strong>Nenhum lançamento neste mês.</strong>' +
        '<span>Clique em "+ Lançamento" para adicionar.</span></div>';
    }

    var headerCells = '<th>Funcionário</th>';
    LANCAMENTO_FIELDS.forEach(function (f) {
      headerCells += '<th>' + f.label.split(" (")[0] + '</th>';
    });

    var rows = lancamentos.map(function (l) {
      var name = App.formatDisplayName(getEmployeeName(company, l.employeeId));
      var cells = '<td class="cell-name">' + App.escapeHTML(name) + '</td>';
      LANCAMENTO_FIELDS.forEach(function (f) {
        cells += '<td class="cell-number">' + formatCellValue(l[f.key], f) + '</td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join("");

    return '<div class="table-scroll"><table class="data-table contador-table">' +
      '<thead><tr>' + headerCells + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  // Mapa employeeId -> lancamento do mes: base para preencher o pop-up com o
  // que ja esta registrado no periodo selecionado na barra de ferramentas.
  function buildLancamentoMap(company, yearMonth) {
    var map = {};
    getLancamentos(company, yearMonth).forEach(function (l) {
      if (l && l.employeeId) map[l.employeeId] = l;
    });
    return map;
  }

  // Valor do lancamento pronto para o input (0 e vazio viram campo em branco).
  function fieldInputValue(lancamento, f) {
    if (!lancamento) return "";
    var val = lancamento[f.key];
    // "00:00" e 0 são ausência de lançamento: o campo aparece em branco (ao
    // salvar, normalizeHora devolve "00:00" para o campo vazio).
    if (f.type === "time") return val && val !== "00:00" ? String(val) : "";
    if (val === 0 || val == null || val === "") return "";
    return String(val);
  }

  function renderPopupFields(company, yearMonth, lancMap, selectedId) {
    var employees = getEmployeesForCompany(company);
    var selected = selectedId ? lancMap[selectedId] : null;
    var empOptions = '<option value="">— Selecione —</option>' +
      employees.map(function (e) {
        var sel = selectedId === e.id ? " selected" : "";
        var marca = lancMap[e.id] ? " •" : "";
        return '<option value="' + e.id + '"' + sel + '>' + App.formatDisplayName(e.name) + marca + '</option>';
      }).join("");

    var fieldsHTML = LANCAMENTO_FIELDS.map(function (f) {
      var val = fieldInputValue(selected, f);
      if (f.type === "time") {
        var timeVal = val || "";
        return '<label class="popup-field">' + f.label +
          '<input type="text" inputmode="numeric" class="hora-input" name="' + f.key + '" value="' + timeVal + '"' +
          ' placeholder="HHH:MM (até 200:00)" title="Digite os minutos no final — ex.: 1030 = 10:30, 17845 = 178:45, 20000 = 200:00" maxlength="7" autocomplete="off">' +
          '<span class="popup-hint">Digite os números (minutos no final): 1030 = 10:30, 17845 = 178:45 — máximo 200:00</span>' +
          '</label>';
      }
      return '<label class="popup-field">' + f.label +
        '<input type="number" step="any" min="0" name="' + f.key + '" value="' + val + '" placeholder="0">' +
        '</label>';
    }).join("");

    return '<div class="popup-overlay" id="lancamentoPopup">' +
      '<div class="popup-card">' +
        '<div class="popup-header">' +
          '<h3>Lançamento — ' + getMonthName(yearMonth) + '</h3>' +
          '<button class="popup-close" id="popupClose" type="button">✕</button>' +
        '</div>' +
        '<form id="lancamentoForm" class="popup-form">' +
          '<p class="popup-hint">Selecione o funcionário para ver e editar o que já está lançado em ' +
            getMonthName(yearMonth) + '. O sinal • marca quem já possui lançamento no mês. ' +
            'Salvar altera apenas o funcionário selecionado.</p>' +
          '<label class="popup-field">Funcionário' +
            '<select id="popupEmployee" name="employeeId" required>' + empOptions + '</select>' +
          '</label>' +
          '<div class="popup-grid">' + fieldsHTML + '</div>' +
          '<div class="popup-actions">' +
            '<button type="button" class="btn btn-cancel" id="popupCancel">Cancelar</button>' +
            '<button type="submit" class="btn btn-primary">Salvar</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  function openPopup(container, company, yearMonth) {
    var existing = document.getElementById("lancamentoPopup");
    if (existing) existing.remove();

    var lancMap = buildLancamentoMap(company, yearMonth);

    document.body.insertAdjacentHTML("beforeend", renderPopupFields(company, yearMonth, lancMap, ""));

    var popup = document.getElementById("lancamentoPopup");
    var form = document.getElementById("lancamentoForm");
    var employeeSelect = document.getElementById("popupEmployee");

    function closePopup() { popup.remove(); }

    // Espelha no formulario o lancamento ja registrado no mes para o funcionario.
    function fillFields(lanc) {
      LANCAMENTO_FIELDS.forEach(function (f) {
        var input = form.querySelector('[name="' + f.key + '"]');
        if (input) input.value = fieldInputValue(lanc, f);
      });
    }

    employeeSelect.addEventListener("change", function () {
      fillFields(lancMap[employeeSelect.value] || null);
    });

    // Máscara de digitação dos campos de horas (insere ":" automaticamente).
    form.querySelectorAll(".hora-input").forEach(function (input) {
      input.addEventListener("input", function () {
        input.value = maskHora(input.value);
      });
      input.addEventListener("blur", function () {
        var norm = normalizeHora(input.value);
        if (norm !== null) input.value = norm;
      });
    });

    document.getElementById("popupClose").addEventListener("click", closePopup);
    document.getElementById("popupCancel").addEventListener("click", closePopup);
    popup.addEventListener("click", function (e) {
      if (e.target === popup) closePopup();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var empId = employeeSelect.value;
      if (!empId) {
        App.toast("Selecione um funcionário.", "warning");
        return;
      }

      // Merge sobre o registro existente: os campos fora do formulário (ex.:
      // updatedAt e dados legados) são preservados, e os lançamentos dos demais
      // funcionários do mês nunca são tocados.
      var atual = lancMap[empId];
      var record = atual ? Object.assign({}, atual) : {};
      record.employeeId = empId;
      var erroCampo = null;
      LANCAMENTO_FIELDS.forEach(function (f) {
        var input = form.querySelector('[name="' + f.key + '"]');
        if (f.type === "time") {
          var norm = normalizeHora(input ? input.value : "");
          if (norm === null) {
            if (!erroCampo) erroCampo = f.label;
            return;
          }
          record[f.key] = norm;
        } else {
          record[f.key] = input ? parseFloat(input.value) || 0 : 0;
        }
      });

      if (erroCampo) {
        App.toast('Valor inválido em "' + erroCampo + '". Use o formato HH:MM (de 00:00 até 200:00).', "warning");
        return;
      }

      // Fase 2 — empresa definida pela aba ativa, nunca por seletor do pop-up.
      // Grava na mesma empresa de onde a lista e os valores foram lidos.
      saveLancamento(company, yearMonth, record);
      App.toast("Lançamento salvo.", "success");

      // Recarrega o mês e mantém o funcionário selecionado com os valores gravados.
      lancMap = buildLancamentoMap(company, yearMonth);
      renderContent(container, yearMonth);
      fillFields(lancMap[empId] || null);
      Array.prototype.forEach.call(employeeSelect.options, function (opt) {
        if (opt.value === empId && opt.textContent.slice(-2) !== " •") {
          opt.textContent += " •";
        }
      });
    });
  }

  function getCompanyInfo(company) {
    var data = AppData.getCompanyData(company);
    return data && data.companyInfo ? data.companyInfo : {};
  }

  function renderResumoGrid(company, yearMonth) {
    var employees = getEmployeesForCompany(company);
    var lancamentos = getLancamentos(company, yearMonth);
    var info = getCompanyInfo(company);

    var lancMap = {};
    lancamentos.forEach(function (l) { lancMap[l.employeeId] = l; });

    var logoHTML = info.logoDataUrl
      ? '<img src="' + info.logoDataUrl + '" alt="Logo" class="resumo-logo">'
      : '';

    if (!employees.length) {
      return '<div class="resumo-grid-header">' +
        '<div class="resumo-grid-title"><h3>' + App.escapeHTML(company) + '</h3></div>' +
        logoHTML +
      '</div>' +
      '<div class="empty-state"><strong>Nenhum funcionário ativo em ' + App.escapeHTML(company) + '.</strong></div>';
    }

    var shortLabels = LANCAMENTO_FIELDS.map(function (f) {
      return f.label.split(" (")[0];
    });

    var headerCells = '<th class="resumo-name-col">Funcionário</th>';
    shortLabels.forEach(function (label) {
      headerCells += '<th class="resumo-data-col">' + label + '</th>';
    });

    var rows = employees.map(function (emp) {
      var lanc = lancMap[emp.id];
      var cells = '<td class="resumo-name-cell">' + App.escapeHTML(App.formatDisplayName(emp.name)) + '</td>';
      LANCAMENTO_FIELDS.forEach(function (f) {
        var val = lanc ? lanc[f.key] : (f.type === "time" ? "" : 0);
        cells += '<td class="resumo-data-cell">' + formatCellValue(val, f) + '</td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join("");

    var totals = computeTotals(employees, lancMap);
    var totalCells = '<td class="resumo-name-cell resumo-total-label">Total</td>';
    LANCAMENTO_FIELDS.forEach(function (f) {
      totalCells += '<td class="resumo-data-cell resumo-total-cell">' + totals[f.key] + '</td>';
    });

    return '<div class="resumo-grid-header">' +
      '<div class="resumo-grid-title"><h3>' + App.escapeHTML(company) + '</h3></div>' +
      logoHTML +
    '</div>' +
    '<div class="table-scroll resumo-scroll">' +
      '<table class="data-table resumo-table">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr class="resumo-total-row">' + totalCells + '</tr></tfoot>' +
      '</table>' +
    '</div>';
  }

  function getMonthName(ym) {
    var months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    var parts = ym.split("-");
    return months[parseInt(parts[1]) - 1] + " " + parts[0];
  }

  function renderResumoPrintArea(company, yearMonth) {
    var employees = getEmployeesForCompany(company);
    var lancamentos = getLancamentos(company, yearMonth);
    var info = getCompanyInfo(company);
    var lancMap = {};
    lancamentos.forEach(function (l) { lancMap[l.employeeId] = l; });

    var shortLabels = LANCAMENTO_FIELDS.map(function (f) { return f.label.split(" (")[0]; });

    var headerCells = '<th class="resumo-print-name">Funcionário</th>';
    shortLabels.forEach(function (label) {
      headerCells += '<th>' + label + '</th>';
    });

    var rows = employees.map(function (emp) {
      var lanc = lancMap[emp.id];
      var cells = '<td class="resumo-print-name">' + App.escapeHTML(App.formatDisplayName(emp.name)) + '</td>';
      LANCAMENTO_FIELDS.forEach(function (f) {
        var val = lanc ? lanc[f.key] : (f.type === "time" ? "" : 0);
        cells += '<td>' + formatCellValue(val, f) + '</td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join("");

    var totals = computeTotals(employees, lancMap);
    var totalCells = '<td class="resumo-print-name resumo-print-total-label">Total</td>';
    LANCAMENTO_FIELDS.forEach(function (f) {
      totalCells += '<td>' + totals[f.key] + '</td>';
    });
    var totalRow = '<tr class="resumo-print-total">' + totalCells + '</tr>';

    var logoHTML = info.logoDataUrl
      ? '<img src="' + info.logoDataUrl + '" alt="Logo" class="resumo-print-logo">'
      : '';

    var legalName = info.legalName || company;
    var cnpj = info.cnpj || '';

    return '<div class="resumo-print-area">' +
      '<div class="resumo-print-header">' +
        '<div class="resumo-print-left">' +
          '<span class="resumo-print-title">Informações Fechamento Folha Salarial</span>' +
          '<p class="resumo-print-month">Mês: ' + getMonthName(yearMonth) + '</p>' +
          '<p class="resumo-print-company">' + App.escapeHTML(legalName) + '</p>' +
          (cnpj ? '<p class="resumo-print-cnpj">CNPJ: ' + App.escapeHTML(cnpj) + '</p>' : '') +
        '</div>' +
        '<div class="resumo-print-right">' +
          logoHTML +
        '</div>' +
      '</div>' +
      '<table class="resumo-print-table">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot>' + totalRow + '</tfoot>' +
      '</table>' +
    '</div>';
  }

  function renderResumoTabContent(container, yearMonth) {
    var selectedCompany = AppData.getPrimaryPageCompany("contador");
    return '<div id="resumoGridContainer">' +
      renderResumoGrid(selectedCompany, yearMonth) +
    '</div>';
  }

  function bindResumoEvents(container, yearMonth) {
    var printBtn = document.getElementById("btnPrintResumo");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        var company = AppData.getPrimaryPageCompany("contador");

        var existing = document.getElementById("resumoPrintContainer");
        if (existing) existing.remove();

        var printContainer = document.createElement("div");
        printContainer.id = "resumoPrintContainer";
        printContainer.innerHTML = renderResumoPrintArea(company, yearMonth);
        document.body.appendChild(printContainer);

        var pageStyle = document.createElement("style");
        pageStyle.id = "contador-page-override";
        pageStyle.textContent = "@page { size: A4 landscape; margin: 5mm; }";
        document.head.appendChild(pageStyle);

        document.body.classList.add("printing-contador");

        function cleanupPrint() {
          document.body.classList.remove("printing-contador");
          var pc = document.getElementById("resumoPrintContainer");
          if (pc) pc.remove();
          var s = document.getElementById("contador-page-override");
          if (s) s.remove();
          window.removeEventListener("afterprint", cleanupPrint);
        }

        window.addEventListener("afterprint", cleanupPrint);

        setTimeout(function () {
          window.print();
          cleanupPrint();
        }, 200);
      });
    }
  }

  function renderContent(container, yearMonth) {
    var company = AppData.getPrimaryPageCompany("contador");
    var activeTab = container._contadorActiveTab || "lancamentos";

    var toolbarRight = '';
    if (activeTab === "lancamentos") {
      toolbarRight = '<button class="btn btn-primary" id="btnLancamento">+ Lançamento</button>';
    } else {
      toolbarRight = '<button class="btn btn-primary btn-sm" id="btnPrintResumo">Imprimir / PDF</button>';
    }

    var html =
      '<div class="module-header">' +
        '<h2>Informações Contador</h2>' +
      '</div>' +
      '<div class="contador-tabs">' +
        '<button class="contador-tab' + (activeTab === "lancamentos" ? " active" : "") + '" data-tab="lancamentos">Lançamentos</button>' +
        '<button class="contador-tab' + (activeTab === "resumo" ? " active" : "") + '" data-tab="resumo">Resumo</button>' +
      '</div>' +
      '<div class="contador-toolbar">' +
        renderMonthSelector(yearMonth) +
        toolbarRight +
      '</div>' +
      '<div id="contadorTabContent">' +
        (activeTab === "lancamentos" ? renderLancamentosTable(company, yearMonth) : renderResumoTabContent(container, yearMonth)) +
      '</div>';

    container.innerHTML = html;
    container._contadorYearMonth = yearMonth;

    if (activeTab === "resumo") {
      bindResumoEvents(container, yearMonth);
    }

    var lancBtn = document.getElementById("btnLancamento");
    if (lancBtn) {
      lancBtn.addEventListener("click", function () {
        openPopup(container, company, yearMonth);
      });
    }

    var monthSel = document.getElementById("contadorMonth");
    var yearSel = document.getElementById("contadorYear");
    function updatePeriod() {
      var ym = yearSel.value + "-" + monthSel.value;
      renderContent(container, ym);
    }
    monthSel.addEventListener("change", updatePeriod);
    yearSel.addEventListener("change", updatePeriod);

    var tabs = container.querySelectorAll(".contador-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        container._contadorActiveTab = tab.dataset.tab;
        renderContent(container, yearMonth);
      });
    });
  }

  function render(container) {
    var ym = currentYearMonth();
    renderContent(container, ym);
  }

  window.ContadorModule = { render: render };
})();
