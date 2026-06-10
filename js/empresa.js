(function () {
  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function readLogoFile(input) {
    return new Promise((resolve) => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      if (!/^image\//.test(file.type)) {
        window.App?.toast?.("Selecione um arquivo de imagem.", "warning");
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // Aceita CNPJ salvo em qualquer um destes campos (com ou sem máscara).
  const CNPJ_FIELDS = ["cnpj", "CNPJ", "document", "taxId", "companyCnpj"];

  function resolveCnpj(info) {
    if (!info || typeof info !== "object") return "";
    for (const field of CNPJ_FIELDS) {
      const value = info[field];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  function field(label, name, value, placeholder, type = "text") {
    return `
      <label class="field">${esc(label)}
        <input name="${esc(name)}" type="${esc(type)}" value="${esc(value || "")}" placeholder="${esc(placeholder || "")}">
      </label>`;
  }

  function renderDiagnostics(company) {
    const diag = AppData.diagnoseCompanyData(company);
    const issues = diag.inconsistencies.length
      ? `<ul class="empresa-diag-issues">${diag.inconsistencies.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : `<p class="empresa-diag-ok">Nenhuma inconsistência encontrada.</p>`;
    const restoreBtn =
      diag.hasBackup && !diag.meaningful
        ? `<button type="button" class="secondary btn-sm" id="empresaRestoreBackup">Restaurar do backup</button>`
        : "";
    return `
      <details class="empresa-diag" ${diag.inconsistencies.length ? "open" : ""}>
        <summary>Verificar integridade dos dados da empresa</summary>
        <div class="empresa-diag-body">
          <p><span>Empresa ativa</span><strong>${esc(diag.activeCompany)}</strong></p>
          <p><span>Origem dos dados</span><strong>${esc(diag.source)}</strong></p>
          <p><span>Última atualização</span><strong>${esc(diag.updatedAtLabel)}${diag.updatedBy ? " · " + esc(diag.updatedBy) : ""}</strong></p>
          <p><span>Backup disponível</span><strong>${diag.hasBackup ? "Sim" : "Não"} (${diag.historyCount} no histórico)</strong></p>
          <p><span>CNPJ detectado</span><strong>${esc(diag.cnpj || "—")}</strong></p>
          ${issues}
          ${restoreBtn}
        </div>
      </details>`;
  }

  function render(container) {
    const company = AppData.getActiveCompany();
    const data = AppData.getCompanyData(company);
    const info = data.companyInfo || {};
    const cnpjValue = resolveCnpj(info);
    const activeEmployees = (data.employees || []).filter((e) => AppData.isEmployeeActive(e)).length;
    const totalEmployees = (data.employees || []).length;

    const logoHtml = info.logoDataUrl
      ? `<img src="${info.logoDataUrl}" alt="Logo ${esc(info.legalName || company)}" class="empresa-logo-img">`
      : `<span class="empresa-logo-empty">Sem logo</span>`;

    container.innerHTML = `
      <article class="card empresa-card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Dados da Empresa</p>
            <h2>${esc(company)}</h2>
          </div>
          <div class="empresa-stats">
            <span class="stat-chip chip-default"><span>Ativos</span><strong>${activeEmployees}</strong></span>
            <span class="stat-chip highlight"><span>Total</span><strong>${totalEmployees}</strong></span>
          </div>
        </div>

        ${renderDiagnostics(company)}

        <form id="empresaForm" class="empresa-form">
          <fieldset class="empresa-fieldset">
            <legend>Identificação</legend>
            <div class="empresa-grid">
              ${field("Razão social", "legalName", info.legalName || company, "Razão social")}
              ${field("Nome fantasia", "tradeName", info.tradeName, "Nome fantasia")}
              ${field("CNPJ", "cnpj", cnpjValue, "00.000.000/0000-00")}
              ${field("Responsável", "responsibleName", info.responsibleName, "Nome do responsável")}
            </div>
          </fieldset>

          <fieldset class="empresa-fieldset">
            <legend>Contato</legend>
            <div class="empresa-grid">
              ${field("Endereço", "address", info.address, "Rua, nº, bairro, cidade/UF")}
              ${field("Telefones", "phones", info.phones, "(22) 0000-0000")}
              ${field("E-mail", "email", info.email, "contato@empresa.com", "email")}
              ${field("Dados bancários", "bankInfo", info.bankInfo, "Banco / agência / conta")}
            </div>
          </fieldset>

          <fieldset class="empresa-fieldset">
            <legend>Observações por módulo</legend>
            <div class="empresa-grid">
              ${field("Informações do Contador", "contadorInfo", info.contadorInfo, "Notas para o contador")}
              ${field("Informações do Vale Transporte", "vtInfo", info.vtInfo, "Notas para o VT")}
            </div>
          </fieldset>

          <fieldset class="empresa-fieldset">
            <legend>Logo</legend>
            <div class="empresa-logo-row">
              <div class="empresa-logo-frame">${logoHtml}</div>
              <div class="empresa-logo-actions">
                <label class="field">Arquivo do logo
                  <input name="logo" type="file" accept="image/*">
                </label>
                ${info.logoDataUrl ? `<button type="button" class="secondary btn-sm" id="empresaRemoveLogo">Remover logo</button>` : ""}
              </div>
            </div>
          </fieldset>

          <div class="empresa-actions">
            <button type="submit" class="primary">Salvar dados</button>
          </div>
        </form>
      </article>
    `;

    const form = container.querySelector("#empresaForm");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const logoDataUrl = await readLogoFile(form.elements.logo);

      const saved = AppData.updateCompanyInfo(
        {
          legalName: form.elements.legalName.value,
          tradeName: form.elements.tradeName.value,
          cnpj: form.elements.cnpj.value,
          responsibleName: form.elements.responsibleName.value,
          address: form.elements.address.value,
          phones: form.elements.phones.value,
          email: form.elements.email.value,
          bankInfo: form.elements.bankInfo.value,
          contadorInfo: form.elements.contadorInfo.value,
          vtInfo: form.elements.vtInfo.value
        },
        company
      );

      if (logoDataUrl) AppData.updateCompanyLogo(logoDataUrl, company);

      if (saved) {
        window.App?.toast?.("Dados da empresa salvos.", "success");
      } else {
        window.App?.toast?.("Dados preservados: não é permitido salvar empresa sem Razão Social e CNPJ.", "warning", 6000);
      }
      render(container);
    });

    container.querySelector("#empresaRemoveLogo")?.addEventListener("click", () => {
      if (!window.confirm("Remover o logo da empresa?")) return;
      AppData.updateCompanyLogo("", company, { force: true });
      window.App?.toast?.("Logo removido.", "info");
      render(container);
    });

    container.querySelector("#empresaRestoreBackup")?.addEventListener("click", () => {
      if (!window.confirm("Restaurar os dados da empresa a partir do backup?")) return;
      if (AppData.restoreCompanyInfoFromBackup(company)) {
        window.App?.toast?.("Dados da empresa restaurados do backup.", "success");
      } else {
        window.App?.toast?.("Nenhum backup válido disponível.", "warning");
      }
      render(container);
    });
  }

  window.EmpresaModule = { render };
})();
