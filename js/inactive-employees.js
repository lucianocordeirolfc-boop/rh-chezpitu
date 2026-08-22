/**
 * InactiveEmployeesUI — componente compartilhado "Mostrar funcionários inativos".
 *
 * Regra do sistema: funcionário com status "Inativo" NÃO aparece nas listas
 * operacionais (Cadastro de Funcionários e Controle de Feriados). O histórico
 * dele é preservado na base — apenas deixa de poluir a tela do dia a dia.
 *
 * Este módulo entrega os dois pedaços de UI usados pelas duas abas, para que o
 * botão e o seletor sejam idênticos nas duas:
 *   - toggleButtonHTML(): o botão "Mostrar funcionários inativos (N)";
 *   - openPicker(): o modal com um checkbox por inativo, onde o usuário marca
 *     APENAS quem deve voltar a aparecer na tela principal.
 *
 * A seleção é de exibição, vive em memória (por sessão/página) e nunca altera
 * dado registrado: nada aqui grava, inativa ou reativa funcionário.
 */
(function () {
  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function formatDateBR(isoDate) {
    if (!isoDate) return "";
    return window.AppData?.formatDateBR ? AppData.formatDateBR(isoDate) : String(isoDate);
  }

  /** Inativos da lista recebida, ordenados por nome (pt-BR). */
  function listInactive(employees) {
    return (employees || [])
      .filter((employee) => employee?.id && !AppData.isEmployeeActive(employee))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  }

  function toSet(ids) {
    if (ids instanceof Set) return new Set(ids);
    return new Set(Array.isArray(ids) ? ids : []);
  }

  /**
   * Botão da tela principal. Some quando não há nenhum inativo — sem inativo,
   * o botão não teria o que abrir.
   */
  function toggleButtonHTML(options = {}) {
    const total = Number(options.total) || 0;
    if (!total) return "";
    const visibleCount = Number(options.visibleCount) || 0;
    const id = options.id || "openInactiveEmployees";
    const className = options.className || "secondary btn-sm";
    const suffix = visibleCount ? ` · ${visibleCount} exibido(s)` : "";
    return `<button type="button" class="${esc(className)}" id="${esc(id)}" title="Escolher quais funcionários inativos aparecem nesta tela">Mostrar funcionários inativos (${total})${suffix}</button>`;
  }

  function pickerRows(inactives, selected) {
    return inactives
      .map((employee) => {
        const checked = selected.has(employee.id) ? " checked" : "";
        const details = [employee.department, employee.role].filter(Boolean).join(" · ");
        const outLabel = employee.deactivatedAt
          ? `Desligamento: ${formatDateBR(employee.deactivatedAt)}`
          : "Desligamento: não informado";
        const hint = [details, outLabel].filter(Boolean).join(" — ");
        return `
          <label class="check-line inactive-picker-line">
            <input type="checkbox" value="${esc(employee.id)}"${checked}>
            <span>
              ${esc(employee.name)}
              <small class="help-text">${esc(hint)}</small>
            </span>
          </label>
        `;
      })
      .join("");
  }

  /**
   * Modal do seletor.
   * @param {object} options
   * @param {Array}  options.employees    lista completa (ativos e inativos)
   * @param {Set}    options.visibleIds   ids atualmente exibidos na tela
   * @param {string} options.contextLabel texto de contexto (empresa/tela)
   * @param {Function} options.onApply    recebe um Set com os ids escolhidos
   */
  function openPicker(options = {}) {
    document.getElementById("inactiveEmployeesPicker")?.remove();

    const inactives = listInactive(options.employees);
    if (!inactives.length) {
      alert("Nenhum funcionário inativo nesta empresa.");
      return;
    }

    const selected = toSet(options.visibleIds);
    const contextLabel = options.contextLabel || "";

    const picker = document.createElement("div");
    picker.id = "inactiveEmployeesPicker";
    picker.className = "co-holiday-picker";
    picker.innerHTML = `
      <p class="co-picker-title">Funcionários inativos</p>
      <p class="co-picker-hint">
        ${contextLabel ? `${esc(contextLabel)} · ` : ""}${inactives.length} inativo(s).
        Marque apenas quem deve aparecer na tela principal. Nada é reativado aqui —
        é só exibição, e volta ao normal ao recarregar a página.
      </p>
      <div class="inactive-picker-list">${pickerRows(inactives, selected)}</div>
      <div class="co-picker-actions inactive-picker-actions">
        <button id="inactivePickerNone" class="link-button" type="button">Desmarcar todos</button>
        <button id="inactivePickerAll" class="link-button" type="button">Marcar todos</button>
        <button id="inactivePickerCancel" class="secondary btn-sm" type="button">Cancelar</button>
        <button id="inactivePickerApply" class="primary btn-sm" type="button">Aplicar</button>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    const boxes = () => [...picker.querySelectorAll(".inactive-picker-list input[type='checkbox']")];

    picker.querySelector("#inactivePickerNone").addEventListener("click", () => {
      boxes().forEach((box) => { box.checked = false; });
    });
    picker.querySelector("#inactivePickerAll").addEventListener("click", () => {
      boxes().forEach((box) => { box.checked = true; });
    });
    picker.querySelector("#inactivePickerCancel").addEventListener("click", close);

    picker.querySelector("#inactivePickerApply").addEventListener("click", () => {
      const chosen = new Set(boxes().filter((box) => box.checked).map((box) => box.value));
      close();
      options.onApply?.(chosen);
    });

    setTimeout(() => {
      const outsideClick = (event) => {
        if (!wrapper.contains(event.target)) {
          close();
          document.removeEventListener("mousedown", outsideClick);
        }
      };
      document.addEventListener("mousedown", outsideClick);
    }, 0);
  }

  window.InactiveEmployeesUI = { listInactive, toggleButtonHTML, openPicker };
})();
