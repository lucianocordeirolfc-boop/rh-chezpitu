(function () {
  const LANCAMENTO_FIELDS = [
    { key: "falta",          label: "Falta (dias)" },
    { key: "horaExtra",      label: "Hora Extra (horas)" },
    { key: "gratificacao",   label: "Gratificação (R$)" },
    { key: "comissoes",      label: "Comissões (R$)" },
    { key: "consumoInterno", label: "Consumo Interno (R$)" },
    { key: "domingoMulher",  label: "Domingo da Mulher (R$)" },
    { key: "adNoturno",      label: "Ad. Noturno (horas)" },
    { key: "vales",          label: "Vales (R$)" }
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
        cells += '<td class="cell-number">' + formatMoney(l[f.key]) + '</td>';
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
        record[f.key] = input ? parseFloat(input.value) || 0 : 0;
      });

      var targetCompany = companySelect.value;
      saveLancamento(targetCompany, yearMonth, record);
      closePopup();
      App.toast("Lançamento salvo.", "success");

      if (targetCompany === AppData.state.selectedCompany) {
        renderContent(container, yearMonth);
      }
    });
  }

  function renderContent(container, yearMonth) {
    var company = AppData.state.selectedCompany;

    var html =
      '<div class="module-header">' +
        '<h2>Informações Contador</h2>' +
      '</div>' +
      '<div class="contador-tabs">' +
        '<button class="contador-tab active" data-tab="lancamentos">Lançamentos</button>' +
        '<button class="contador-tab" data-tab="resumo">Resumo</button>' +
      '</div>' +
      '<div class="contador-toolbar">' +
        renderMonthSelector(yearMonth) +
        '<button class="btn btn-primary" id="btnNovoLancamento">+ Novo Lançamento</button>' +
      '</div>' +
      '<div id="contadorTabContent">' +
        renderLancamentosTable(company, yearMonth) +
      '</div>';

    container.innerHTML = html;

    document.getElementById("btnNovoLancamento").addEventListener("click", function () {
      openPopup(container, company, yearMonth, null);
    });

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
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var tabContent = document.getElementById("contadorTabContent");
        if (tab.dataset.tab === "lancamentos") {
          tabContent.innerHTML = renderLancamentosTable(company, yearMonth);
        } else if (tab.dataset.tab === "resumo") {
          tabContent.innerHTML = '<div class="empty-state"><strong>Em breve.</strong><span>Resumo mensal para o contador.</span></div>';
        }
      });
    });
  }

  function render(container) {
    var ym = currentYearMonth();
    renderContent(container, ym);
  }

  window.ContadorModule = { render: render };
})();
