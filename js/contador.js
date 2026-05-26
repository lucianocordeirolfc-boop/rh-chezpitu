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

  function getActiveTab() {
    return "lancamentos";
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

    var existing = data.contadorLancamentos[yearMonth].findIndex(function (l) {
      return l.employeeId === lancamento.employeeId;
    });

    if (existing >= 0) {
      data.contadorLancamentos[yearMonth][existing] = lancamento;
    } else {
      data.contadorLancamentos[yearMonth].push(lancamento);
    }

    AppData.saveState();
    if (window.FirebaseSync?.isReady()) {
      window.FirebaseSync.save(AppData.state);
    }
  }

  function deleteLancamento(company, yearMonth, employeeId) {
    var data = AppData.getCompanyData(company);
    if (!data.contadorLancamentos || !data.contadorLancamentos[yearMonth]) return;
    data.contadorLancamentos[yearMonth] = data.contadorLancamentos[yearMonth].filter(function (l) {
      return l.employeeId !== employeeId;
    });
    AppData.saveState();
    if (window.FirebaseSync?.isReady()) {
      window.FirebaseSync.save(AppData.state);
    }
  }

  function getEmployeesForCompany(company) {
    var data = AppData.getCompanyData(company);
    if (!data || !data.employees) return [];
    return data.employees
      .filter(function (e) { return e.status === "Ativo"; })
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
        '<span>Clique em "Novo Lançamento" para adicionar.</span></div>';
    }

    var headerCells = '<th>Funcionário</th>';
    LANCAMENTO_FIELDS.forEach(function (f) {
      headerCells += '<th>' + f.label.split(" (")[0] + '</th>';
    });
    headerCells += '<th>Ações</th>';

    var rows = lancamentos.map(function (l) {
      var name = App.formatDisplayName(getEmployeeName(company, l.employeeId));
      var cells = '<td class="cell-name">' + App.escapeHTML(name) + '</td>';
      LANCAMENTO_FIELDS.forEach(function (f) {
        cells += '<td class="cell-number">' + formatCellValue(l[f.key], f) + '</td>';
      });
      cells += '<td class="cell-actions">' +
        '<button class="btn-icon btn-edit-lancamento" data-emp="' + l.employeeId + '" title="Editar">✎</button>' +
        '<button class="btn-icon btn-delete-lancamento" data-emp="' + l.employeeId + '" title="Excluir">✕</button>' +
        '</td>';
      return '<tr>' + cells + '</tr>';
    }).join("");

    return '<div class="table-scroll"><table class="data-table contador-table">' +
      '<thead><tr>' + headerCells + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  function renderPopupFields(company, lancamento) {
    var employees = getEmployeesForCompany(company);
    var empOptions = '<option value="">— Selecione —</option>' +
      employees.map(function (e) {
        var sel = lancamento && lancamento.employeeId === e.id ? " selected" : "";
        return '<option value="' + e.id + '"' + sel + '>' + App.formatDisplayName(e.name) + '</option>';
      }).join("");

    var companyOptions = AppData.COMPANIES.map(function (c) {
      return '<option value="' + c + '"' + (c === company ? " selected" : "") + '>' + c + '</option>';
    }).join("");

    var fieldsHTML = LANCAMENTO_FIELDS.map(function (f) {
      var val = lancamento ? (lancamento[f.key] || "") : "";
      if (f.type === "time") {
        var timeVal = val || "00:00";
        return '<label class="popup-field">' + f.label +
          '<input type="time" name="' + f.key + '" value="' + timeVal + '">' +
          '</label>';
      }
      return '<label class="popup-field">' + f.label +
        '<input type="number" step="any" min="0" name="' + f.key + '" value="' + val + '" placeholder="0">' +
        '</label>';
    }).join("");

    return '<div class="popup-overlay" id="lancamentoPopup">' +
      '<div class="popup-card">' +
        '<div class="popup-header">' +
          '<h3>' + (lancamento ? "Editar Lançamento" : "Novo Lançamento") + '</h3>' +
          '<button class="popup-close" id="popupClose" type="button">✕</button>' +
        '</div>' +
        '<form id="lancamentoForm" class="popup-form">' +
          '<label class="popup-field">Empresa' +
            '<select id="popupCompany" name="company">' + companyOptions + '</select>' +
          '</label>' +
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

  function openPopup(container, company, yearMonth, lancamento) {
    var existing = document.getElementById("lancamentoPopup");
    if (existing) existing.remove();

    document.body.insertAdjacentHTML("beforeend", renderPopupFields(company, lancamento));

    var popup = document.getElementById("lancamentoPopup");
    var form = document.getElementById("lancamentoForm");
    var companySelect = document.getElementById("popupCompany");
    var employeeSelect = document.getElementById("popupEmployee");

    function closePopup() { popup.remove(); }

    document.getElementById("popupClose").addEventListener("click", closePopup);
    document.getElementById("popupCancel").addEventListener("click", closePopup);
    popup.addEventListener("click", function (e) {
      if (e.target === popup) closePopup();
    });

    companySelect.addEventListener("change", function () {
      var newCompany = companySelect.value;
      var emps = getEmployeesForCompany(newCompany);
      employeeSelect.innerHTML = '<option value="">— Selecione —</option>' +
        emps.map(function (e) {
          return '<option value="' + e.id + '">' + App.formatDisplayName(e.name) + '</option>';
        }).join("");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var empId = employeeSelect.value;
      if (!empId) {
        App.toast("Selecione um funcionário.", "warning");
        return;
      }

      var record = { employeeId: empId };
      LANCAMENTO_FIELDS.forEach(function (f) {
        var input = form.querySelector('[name="' + f.key + '"]');
        if (f.type === "time") {
          record[f.key] = input ? (input.value || "00:00") : "00:00";
        } else {
          record[f.key] = input ? parseFloat(input.value) || 0 : 0;
        }
      });

      var targetCompany = companySelect.value;
      saveLancamento(targetCompany, yearMonth, record);
      App.toast("Lançamento salvo.", "success");

      if (targetCompany === AppData.state.selectedCompany) {
        renderContent(container, yearMonth);
      }

      employeeSelect.value = "";
      LANCAMENTO_FIELDS.forEach(function (f) {
        var input = form.querySelector('[name="' + f.key + '"]');
        if (input) input.value = f.type === "time" ? "00:00" : "0";
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

    return '<div class="resumo-grid-header">' +
      '<div class="resumo-grid-title"><h3>' + App.escapeHTML(company) + '</h3></div>' +
      logoHTML +
    '</div>' +
    '<div class="table-scroll resumo-scroll">' +
      '<table class="data-table resumo-table">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
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
      '</table>' +
    '</div>';
  }

  function renderResumoTab(container, yearMonth) {
    var companyOptions = AppData.COMPANIES.map(function (c) {
      var sel = c === AppData.state.selectedCompany ? " selected" : "";
      return '<option value="' + c + '"' + sel + '>' + c + '</option>';
    }).join("");

    var selectedCompany = AppData.state.selectedCompany;

    var html =
      '<div class="resumo-toolbar">' +
        '<label class="resumo-company-label">Empresa ' +
          '<select id="resumoCompanySelect" class="field-select">' + companyOptions + '</select>' +
        '</label>' +
        '<button class="btn btn-primary" id="btnPrintResumo">Imprimir / PDF</button>' +
      '</div>' +
      '<div id="resumoGridContainer">' +
        renderResumoGrid(selectedCompany, yearMonth) +
      '</div>' +
      '';

    return html;
  }

  function bindResumoEvents(container, yearMonth) {
    var companySel = document.getElementById("resumoCompanySelect");
    if (companySel) {
      companySel.addEventListener("change", function () {
        var gridContainer = document.getElementById("resumoGridContainer");
        if (gridContainer) {
          gridContainer.innerHTML = renderResumoGrid(companySel.value, yearMonth);
        }
      });
    }

    var printBtn = document.getElementById("btnPrintResumo");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        var company = companySel ? companySel.value : AppData.state.selectedCompany;

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
        setTimeout(function () {
          window.print();
          document.body.classList.remove("printing-contador");
          printContainer.remove();
          var s = document.getElementById("contador-page-override");
          if (s) s.remove();
        }, 200);
      });
    }
  }

  function renderContent(container, yearMonth) {
    var company = AppData.state.selectedCompany;
    var activeTab = container._contadorActiveTab || "lancamentos";

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
        (activeTab === "lancamentos" ? '<button class="btn btn-primary" id="btnNovoLancamento">+ Novo Lançamento</button>' : '') +
      '</div>' +
      '<div id="contadorTabContent">' +
        (activeTab === "lancamentos" ? renderLancamentosTable(company, yearMonth) : renderResumoTab(container, yearMonth)) +
      '</div>';

    container.innerHTML = html;

    if (activeTab === "resumo") {
      bindResumoEvents(container, yearMonth);
    }

    var novoBtn = document.getElementById("btnNovoLancamento");
    if (novoBtn) {
      novoBtn.addEventListener("click", function () {
        openPopup(container, company, yearMonth, null);
      });
    }

    container.addEventListener("click", function (e) {
      var editBtn = e.target.closest(".btn-edit-lancamento");
      if (editBtn) {
        var empId = editBtn.dataset.emp;
        var lancs = getLancamentos(company, yearMonth);
        var existing = lancs.find(function (l) { return l.employeeId === empId; });
        openPopup(container, company, yearMonth, existing || null);
        return;
      }
      var deleteBtn = e.target.closest(".btn-delete-lancamento");
      if (deleteBtn) {
        if (!confirm("Excluir este lançamento?")) return;
        deleteLancamento(company, yearMonth, deleteBtn.dataset.emp);
        renderContent(container, yearMonth);
        App.toast("Lançamento excluído.", "info");
      }
    });

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
