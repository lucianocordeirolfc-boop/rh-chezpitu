(function () {
  const vtUiState = {
    editingField: null,
    debounceTimers: new Map()
  };

  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function debounce(key, fn, delay = 400) {
    if (vtUiState.debounceTimers.has(key)) {
      clearTimeout(vtUiState.debounceTimers.get(key));
    }
    const timer = window.setTimeout(() => {
      vtUiState.debounceTimers.delete(key);
      fn();
    }, delay);
    vtUiState.debounceTimers.set(key, timer);
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatMonthYear(yearMonth) {
    const [year, month] = yearMonth.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });
  }

  function getActiveYearMonth() {
    return AppData.getVtSelectedYearMonth();
  }

  function calculateReceipt(employee, yearMonth, data, company) {
    const days = AppData.getDaysInMonth(yearMonth);
    const workedDays = days.filter((day) => AppData.VT_WORKED_CODES.has(AppData.getScaleCode(employee, day, data))).length;
    const dailyValue = ImportUtils.repairVtDailyValue(Number(employee.vtDaily || 0));
    const deductDays = AppData.getVtDeduction(employee.id, yearMonth, data, company);
    const effectiveDays = Math.max(0, workedDays - deductDays);

    return {
      employee,
      workedDays,
      deductDays,
      effectiveDays,
      dailyValue,
      total: effectiveDays * dailyValue,
      discountAmount: AppData.getDiscountValue(employee.id, yearMonth, company) || 0
    };
  }

  function getCompanyInfo(data) {
    return data.companyInfo || { legalName: "", cnpj: "" };
  }

  function validateReceipts(receipts, data) {
    const companyInfo = getCompanyInfo(data);
    const missing = [];

    if (!companyInfo.legalName?.trim()) missing.push("Empresa: Nome da empresa pagadora");
    if (!companyInfo.cnpj?.trim()) missing.push("Empresa: CNPJ");

    receipts.forEach((receipt) => {
      const employee = receipt.employee;
      const label = employee.name || "Funcionário sem nome";
      if (!employee.name?.trim()) missing.push(`${label}: Nome completo`);
      if (!employee.cpf?.trim()) missing.push(`${label}: CPF`);
      if (!employee.ctps?.trim()) missing.push(`${label}: CTPS`);
      if (!employee.role?.trim()) missing.push(`${label}: Cargo`);
    });

    return {
      valid: missing.length === 0,
      missing
    };
  }

  function validationMessage(validation) {
    return [
      "Não foi possível gerar/imprimir os recibos de vale-transporte.",
      "",
      "Atualize o cadastro da empresa ou do funcionário com os campos obrigatórios abaixo:",
      "",
      ...validation.missing.map((item) => `- ${item}`)
    ].join("\n");
  }

  function rows(receipts) {
    if (!receipts.length) return `<tr><td colspan="7">Nenhum funcionário ativo para cálculo.</td></tr>`;

    return receipts
      .map(
        (receipt) => `
      <tr data-vt-employee="${esc(receipt.employee.id)}">
        <td>${esc(receipt.employee.name)}</td>
        <td>${esc(receipt.employee.role)}</td>
        <td class="vt-col-num" data-vt-worked>${receipt.workedDays}</td>
        <td class="vt-col-num${receipt.deductDays > 0 ? " vt-deduct-highlight" : ""}" data-vt-deduct-days>
          ${receipt.deductDays > 0 ? `− ${receipt.deductDays}` : "—"}
        </td>
        <td class="vt-col-num" data-vt-effective><strong>${receipt.effectiveDays}</strong></td>
        <td class="vt-col-num" data-vt-daily>${formatCurrency(receipt.dailyValue)}</td>
        <td class="vt-col-num" data-vt-total><strong>${formatCurrency(receipt.total)}</strong></td>
      </tr>
    `
      )
      .join("");
  }

  function deductionRows(employees, yearMonth, company, data) {
    if (!employees.length) return `<p class="vt-deduct-empty">Nenhum funcionário ativo.</p>`;
    return employees
      .map((employee) => {
        const daysDisplay = AppData.getVtDeductionDisplay(employee.id, yearMonth, data, company);
        const discountDisplay = AppData.formatDiscountDisplay(AppData.getDiscountValue(employee.id, yearMonth, company));
        return `
        <div class="vt-deduct-row" data-vt-employee="${esc(employee.id)}">
          <span class="vt-deduct-name">${esc(employee.name)}</span>
          <div class="vt-deduct-fields">
            <label class="vt-deduct-label">
              Dias a descontar
              <input
                class="vt-deduct-input vt-deduct-days-input"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                value="${esc(daysDisplay)}"
                placeholder="0"
                data-field="days"
                data-employee-id="${esc(employee.id)}"
                data-year-month="${esc(yearMonth)}"
              >
            </label>
            <label class="vt-deduct-label vt-discount-label">
              Desconto (R$)
              <input
                class="vt-deduct-input vt-discount-money-input"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                value="${esc(discountDisplay)}"
                placeholder="0,00"
                data-field="discount"
                data-employee-id="${esc(employee.id)}"
                data-year-month="${esc(yearMonth)}"
              >
            </label>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function receiptCardHTML(receipt, yearMonth, companyInfo) {
    const company = companyInfo.legalName;
    const monthYear = formatMonthYear(yearMonth);

    return `
      <section class="vt-receipt" aria-label="Recibo de vale-transporte de ${esc(receipt.employee.name)}">
        <div class="vt-receipt-header">
          <div>
            <span>Empresa pagadora</span>
            <h3>RECIBO DE VALE-TRANSPORTE</h3>
          </div>
          ${companyInfo.logoDataUrl
            ? `<img src="${companyInfo.logoDataUrl}" alt="Logo" class="vt-receipt-logo">`
            : ""}
        </div>

        <div class="vt-receipt-meta">
          <p><span>Empresa</span><strong>${esc(company)}</strong></p>
          <p><span>CNPJ</span><strong>${esc(companyInfo.cnpj)}</strong></p>
          <p><span>Mês/Ano</span><strong>${esc(monthYear)}</strong></p>
          <p><span>Funcionário</span><strong>${esc(receipt.employee.name)}</strong></p>
          <p><span>CPF</span><strong>${esc(receipt.employee.cpf)}</strong></p>
          <p><span>CTPS</span><strong>${esc(receipt.employee.ctps)}</strong></p>
          <p><span>Cargo</span><strong>${esc(receipt.employee.role || "Não informado")}</strong></p>
          <p><span>Dias com direito</span><strong>${receipt.workedDays}</strong></p>
          ${receipt.deductDays > 0 ? `<p class="vt-deduct-line"><span>(−) Desconto mês ant.</span><strong>− ${receipt.deductDays}</strong></p>` : ""}
          <p><span>Dias efetivos</span><strong>${receipt.effectiveDays}</strong></p>
          <p><span>Valor diário</span><strong>${formatCurrency(receipt.dailyValue)}</strong></p>
          <p class="vt-total"><span>Valor total</span><strong>${formatCurrency(receipt.total)}</strong></p>
        </div>

        <div class="vt-receipt-body">
          <div class="vt-declaration-box">
            <p class="vt-receipt-text">
              Declaro ter recebido de <strong>${esc(company)}</strong> o valor total de
              <strong>${formatCurrency(receipt.total)}</strong>, referente ao vale-transporte da competência
              <strong>${esc(monthYear)}</strong>, correspondente a <strong>${receipt.effectiveDays}</strong> dia(s) efetivo(s)${receipt.deductDays > 0 ? ` (${receipt.workedDays} dias com direito, menos ${receipt.deductDays} dia(s) de desconto do mês anterior)` : ""},
              no valor diário de <strong>${formatCurrency(receipt.dailyValue)}</strong>.
            </p>
          </div>
          <div class="vt-sign-footer">
            <div class="vt-signature-block">
              <div class="vt-signature-line" aria-hidden="true"></div>
              <span class="vt-signature-label">Assinatura do funcionário</span>
            </div>
            <p class="vt-date-line">Data: ____ / ____ / ______</p>
          </div>
        </div>
      </section>
    `;
  }

  function chunkReceipts(receipts) {
    const pages = [];
    for (let index = 0; index < receipts.length; index += 3) {
      pages.push(receipts.slice(index, index + 3));
    }
    return pages;
  }

  function receiptsPreviewHTML(receipts, yearMonth, data, validation) {
    if (!receipts.length) {
      return `<div class="empty-state"><strong>Nenhum recibo para visualizar.</strong><span>Cadastre funcionários ativos para gerar os recibos.</span></div>`;
    }

    if (!validation.valid) {
      return `
        <div class="empty-state vt-validation-state">
          <strong>Recibos bloqueados por dados obrigatórios ausentes.</strong>
          <span>Atualize o cadastro da empresa ou dos funcionários antes de gerar/imprimir.</span>
          <ul>${validation.missing.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
      `;
    }

    const companyInfo = getCompanyInfo(data);
    return chunkReceipts(receipts)
      .map((pageReceipts) => {
        const receiptSlots = Array.from({ length: 3 }, (_, index) => {
          const receipt = pageReceipts[index];
          return receipt
            ? receiptCardHTML(receipt, yearMonth, companyInfo)
            : `<section class="vt-receipt vt-receipt-placeholder" aria-hidden="true"></section>`;
        }).join("");

        return `<div class="vt-a4-page">${receiptSlots}</div>`;
      })
      .join("");
  }

  function buildReceipts(yearMonth, data, company) {
    const activeEmployees = AppData.sortEmployeesByName(
      (data.employees || []).filter((employee) => AppData.isEmployeeActive(employee))
    );
    return activeEmployees.map((employee) => calculateReceipt(employee, yearMonth, data, company));
  }

  function updateSummaryStrip(container, receipts) {
    const total = receipts.reduce((sum, receipt) => sum + receipt.total, 0);
    const discountTotal = receipts.reduce((sum, receipt) => sum + (receipt.discountAmount || 0), 0);
    const strip = container.querySelector(".summary-strip");
    if (!strip) return;
    strip.innerHTML = `
      <span>Total estimado VT</span>
      <strong data-vt-grand-total>${formatCurrency(total)}</strong>
      <span class="vt-discount-total-label">Total descontos planilha</span>
      <strong data-vt-discount-total>${formatCurrency(discountTotal)}</strong>
    `;
  }

  function updateEmployeeTableRow(container, receipt) {
    const row = container.querySelector(`tr[data-vt-employee="${receipt.employee.id}"]`);
    if (!row) return;

    const workedCell = row.querySelector("[data-vt-worked]");
    const deductCell = row.querySelector("[data-vt-deduct-days]");
    const effectiveCell = row.querySelector("[data-vt-effective]");
    const totalCell = row.querySelector("[data-vt-total]");

    if (workedCell) workedCell.textContent = String(receipt.workedDays);
    if (deductCell) {
      deductCell.textContent = receipt.deductDays > 0 ? `− ${receipt.deductDays}` : "—";
      deductCell.classList.toggle("vt-deduct-highlight", receipt.deductDays > 0);
    }
    if (effectiveCell) effectiveCell.innerHTML = `<strong>${receipt.effectiveDays}</strong>`;
    if (totalCell) totalCell.innerHTML = `<strong>${formatCurrency(receipt.total)}</strong>`;
  }

  function refreshVtCalculations(container, yearMonth) {
    const company = AppData.getPrimaryPageCompany("vale-transporte");
    const data = AppData.getCompanyData(company);
    const receipts = buildReceipts(yearMonth, data, company);
    const validation = validateReceipts(receipts, data);

    receipts.forEach((receipt) => updateEmployeeTableRow(container, receipt));
    updateSummaryStrip(container, receipts);

    const previewArea = container.querySelector(".vt-print-area");
    if (previewArea) {
      previewArea.innerHTML = receiptsPreviewHTML(receipts, yearMonth, data, validation);
    }

    container._vtValidation = validation;
    container._vtReceipts = receipts;
    container._vtYearMonth = yearMonth;
    return { receipts, validation };
  }

  function persistDeductionField(input) {
    if (!input?.dataset?.employeeId || !input.dataset.yearMonth) return;
    const company = AppData.getPrimaryPageCompany("vale-transporte");
    if (input.dataset.field === "discount") {
      const parsed = AppData.saveDiscountValue(input.dataset.employeeId, input.dataset.yearMonth, input.value, {
        save: true,
        company
      });
      input.value = parsed === null ? "" : AppData.formatDiscountDisplay(parsed);
      return;
    }
    AppData.setVtDeduction(input.dataset.employeeId, input.dataset.yearMonth, input.value, { save: true, company });
  }

  function flushAllDeductionInputs(container) {
    if (!container) return;
    container.querySelectorAll(".vt-deduct-days-input, .vt-discount-money-input").forEach((input) => {
      persistDeductionField(input);
    });
  }

  function bindDeductionInputs(container, yearMonth) {
    container.querySelectorAll(".vt-deduct-days-input, .vt-discount-money-input").forEach((input) => {
      const fieldKey = `${input.dataset.field}|${input.dataset.employeeId}|${input.dataset.yearMonth}`;

      const markEditing = () => {
        vtUiState.editingField = fieldKey;
      };

      const clearEditing = () => {
        if (vtUiState.editingField === fieldKey) vtUiState.editingField = null;
      };

      input.addEventListener("focus", markEditing);
      input.addEventListener("blur", () => {
        clearEditing();
        persistDeductionField(input);
        refreshVtCalculations(container, yearMonth);
      });

      input.addEventListener("input", () => {
        markEditing();
        const ym = input.dataset.yearMonth;
        persistDeductionField(input);
        debounce(`refresh-${fieldKey}`, () => {
          refreshVtCalculations(container, ym);
        }, 120);
      });

      input.addEventListener("change", () => {
        persistDeductionField(input);
        refreshVtCalculations(container, yearMonth);
      });
    });
  }

  if (!window.__vtPersistHooksBound) {
    window.__vtPersistHooksBound = true;
    window.addEventListener("beforeunload", () => {
      flushAllDeductionInputs(document.getElementById("vale-transporte"));
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushAllDeductionInputs(document.getElementById("vale-transporte"));
      }
    });
  }

  function bindEvents(container, yearMonth) {
    const monthInput = container.querySelector("#vtMonth");
    if (monthInput) {
      monthInput.value = yearMonth;
      monthInput.addEventListener("change", (event) => {
        const nextMonth = event.target.value;
        if (!nextMonth) return;
        vtUiState.editingField = null;
        AppData.setVtSelectedYearMonth(nextMonth);
        render(container, nextMonth);
      });
    }

    container.querySelector("#showCutLines")?.addEventListener("change", (event) => {
      container.querySelector(".vt-print-area")?.classList.toggle("show-cut-lines", event.target.checked);
    });

    container.querySelector("#printReceipts")?.addEventListener("click", () => {
      const validation = container._vtValidation || { valid: true };
      if (!validation.valid) {
        alert(validationMessage(validation));
        return;
      }
      window.print();
    });

    bindDeductionInputs(container, yearMonth);
  }

  function render(container, yearMonth) {
    const resolvedMonth = yearMonth || getActiveYearMonth();

    const company = AppData.getPrimaryPageCompany("vale-transporte");
    const data = AppData.getCompanyData(company);
    const receipts = buildReceipts(resolvedMonth, data, company);
    const validation = validateReceipts(receipts, data);
    const total = receipts.reduce((sum, receipt) => sum + receipt.total, 0);
    const discountTotal = receipts.reduce((sum, receipt) => sum + (receipt.discountAmount || 0), 0);

    if (vtUiState.editingField && container.querySelector(".vt-deduct-list")) {
      refreshVtCalculations(container, resolvedMonth);
      const monthInput = container.querySelector("#vtMonth");
      if (monthInput) monthInput.value = resolvedMonth;
      return;
    }

    container.innerHTML = `
      ${window.CompanyUI?.renderToolbar?.("vale-transporte") || ""}
      <article class="card card-compact">
        <div class="card-header card-header-compact vt-header">
          <div>
            <p class="eyebrow">Competência</p>
            <h2>Vale-transporte</h2>
          </div>
          <label class="inline-control compact-control">Mês<input id="vtMonth" type="month" value="${esc(resolvedMonth)}"></label>
        </div>
        <div class="summary-strip summary-strip-compact">
          <span>Total estimado VT</span>
          <strong data-vt-grand-total>${formatCurrency(total)}</strong>
          <span class="vt-discount-total-label">Total descontos planilha</span>
          <strong data-vt-discount-total>${formatCurrency(discountTotal)}</strong>
        </div>
        <div class="table-wrap table-compact">
          <table>
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Cargo</th>
                <th class="vt-col-num">Dias trabalhados</th>
                <th class="vt-col-num">Desconto</th>
                <th class="vt-col-num">Dias efetivos</th>
                <th class="vt-col-num">VT/dia</th>
                <th class="vt-col-num">Total</th>
              </tr>
            </thead>
            <tbody data-vt-table-body>${rows(receipts)}</tbody>
          </table>
        </div>
      </article>

      <article class="card card-compact vt-deductions-card">
        <div class="card-header card-header-compact">
          <div>
            <p class="eyebrow">Ajuste</p>
            <h2>Vale-transporte a descontar</h2>
          </div>
        </div>
        <p class="vt-deduct-hint">Informe os dias de VT não utilizados no mês anterior (atestados, faltas) que devem ser abatidos do total a receber nesta competência. Na planilha de descontos, informe valores em reais quando aplicável.</p>
        <div class="vt-deduct-list" data-vt-deduct-list>
          ${deductionRows(
            AppData.sortEmployeesByName(
              (data.employees || []).filter((employee) => AppData.isEmployeeActive(employee))
            ),
            resolvedMonth,
            company,
            data
          )}
        </div>
      </article>

      <article class="card vt-preview-card card-compact">
        <div class="card-header card-header-compact">
          <div>
            <p class="eyebrow">Impressão</p>
            <h2>3 recibos por página (A4)</h2>
          </div>
          <div class="print-actions">
            <label class="check-line compact-check">
              <input id="showCutLines" type="checkbox" checked>
              Linhas de corte
            </label>
            <button id="printReceipts" class="primary btn-sm" type="button">Imprimir / PDF</button>
          </div>
        </div>
        <div class="vt-preview-scroll vt-preview-scroll-compact">
          <div class="vt-print-area show-cut-lines">
            ${receiptsPreviewHTML(receipts, resolvedMonth, data, validation)}
          </div>
        </div>
      </article>
    `;

    container._vtValidation = validation;
    container._vtReceipts = receipts;
    container._vtYearMonth = resolvedMonth;
    bindEvents(container, resolvedMonth);
    window.CompanyUI?.bindToolbar?.(container, "vale-transporte", () => render(container, resolvedMonth));
  }

  function refreshDeductionList(container, yearMonth) {
    const list = container.querySelector("[data-vt-deduct-list]");
    if (!list) return;
    const company = AppData.getPrimaryPageCompany("vale-transporte");
    const data = AppData.getCompanyData(company);
    const employees = AppData.sortEmployeesByName(
      (data.employees || []).filter((employee) => AppData.isEmployeeActive(employee))
    );
    list.innerHTML = deductionRows(employees, yearMonth, company, data);
    bindDeductionInputs(container, yearMonth);
  }

  function softRefreshFromSync(container) {
    if (!container || vtUiState.editingField) return;
    const yearMonth = getActiveYearMonth();
    if (!container.querySelector("#vtMonth")) {
      render(container, yearMonth);
      return;
    }
    refreshDeductionList(container, yearMonth);
    refreshVtCalculations(container, yearMonth);
    const monthInput = container.querySelector("#vtMonth");
    if (monthInput && monthInput.value !== yearMonth) {
      monthInput.value = yearMonth;
    }
  }

  function flushPersist() {
    const container = document.getElementById("vale-transporte");
    flushAllDeductionInputs(container);
    AppData.saveState();
  }

  window.ValeTransporteModule = {
    render,
    softRefreshFromSync,
    getActiveYearMonth,
    flushPersist
  };
})();
