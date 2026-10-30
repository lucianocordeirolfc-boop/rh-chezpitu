/**
 * LixeiraUI — componente compartilhado "Lixeira (itens excluídos)".
 *
 * Regra do sistema: nada some. Toda exclusão definitiva feita pela interface
 * (vínculo de feriado, feriado, funcionário, férias, ausência) guarda antes uma
 * cópia completa em AppData (state.deletedArchive). Este módulo lista essas
 * cópias e permite RESTAURAR — sempre por ação explícita do usuário, com
 * confirmação. A restauração nunca sobrescreve dado lançado depois da exclusão.
 *
 * Usado pelo Controle de Feriados, Cadastro de Funcionários e Férias/Ausências:
 *   - toggleButtonHTML({ company, kinds }): botão "Lixeira (N)";
 *   - open({ company, kinds, onRestored }): modal com a lista e "Restaurar".
 */
(function () {
  function esc(value) {
    return window.App?.escapeHTML(value) || String(value ?? "");
  }

  function formatDateTime(ms) {
    const value = Number(ms);
    if (!value) return "—";
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  /** O resumo é gravado com datas ISO; a tela mostra dd/mm/aaaa. */
  function brDates(text) {
    return String(text || "").replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1");
  }

  function pendingCount(options = {}) {
    return AppData.listDeletedArchive({ ...options, includeRestored: false }).length;
  }

  function toggleButtonHTML(options = {}) {
    const total = pendingCount(options);
    const id = options.id || "openDeletedArchive";
    return `<button type="button" class="secondary btn-sm" id="${esc(id)}" title="Itens excluídos desta tela — todos podem ser restaurados">Lixeira (${total})</button>`;
  }

  function rowsHTML(entries) {
    const labels = AppData.DELETED_ARCHIVE_KIND_LABELS || {};
    return entries
      .map((entry) => {
        const restored = Boolean(entry.restoredAt);
        const action = restored
          ? `<span class="pill muted" title="${esc(`Restaurado em ${formatDateTime(entry.restoredAt)} por ${entry.restoredBy || "—"}`)}">Restaurado</span>`
          : `<button type="button" class="link-button" data-restore-archive="${esc(entry.id)}">Restaurar</button>`;
        return `
          <tr${restored ? ' class="is-restored"' : ""}>
            <td>${esc(labels[entry.kind] || entry.kind)}</td>
            <td>${esc(brDates(entry.summary))}</td>
            <td>${esc(entry.company)}</td>
            <td>${esc(formatDateTime(entry.deletedAt))}<small class="help-text">${esc(entry.deletedBy || "")}</small></td>
            <td class="actions">${action}</td>
          </tr>
        `;
      })
      .join("");
  }

  function open(options = {}) {
    document.getElementById("deletedArchivePicker")?.remove();
    const query = { company: options.company, kinds: options.kinds };

    const picker = document.createElement("div");
    picker.id = "deletedArchivePicker";
    picker.className = "co-holiday-picker lixeira-picker";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const wrapper = document.createElement("div");
    wrapper.className = "modal-center modal-center-wide";
    wrapper.appendChild(picker);
    backdrop.appendChild(wrapper);

    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };

    const paint = () => {
      const entries = AppData.listDeletedArchive(query);
      const pending = entries.filter((entry) => !entry.restoredAt).length;
      picker.innerHTML = `
        <p class="co-picker-title">Lixeira — itens excluídos</p>
        <p class="co-picker-hint">
          ${options.company ? `${esc(options.company)} · ` : ""}${pending} item(ns) para restaurar.
          Tudo o que é excluído fica guardado aqui com data e usuário. Restaurar devolve
          o registro completo (status, compensação e o CO da escala) sem apagar nada
          lançado depois.
        </p>
        ${
          entries.length
            ? `<div class="table-wrap lixeira-list">
                <table>
                  <thead><tr><th>Tipo</th><th>Item</th><th>Empresa</th><th>Excluído em</th><th></th></tr></thead>
                  <tbody>${rowsHTML(entries)}</tbody>
                </table>
              </div>`
            : `<p class="help-text">Nenhum item excluído.</p>`
        }
        <div class="co-picker-actions">
          <button type="button" class="secondary btn-sm" data-close-archive>Fechar</button>
        </div>
      `;
      picker.querySelector("[data-close-archive]").addEventListener("click", close);
      picker.querySelectorAll("[data-restore-archive]").forEach((button) => {
        button.addEventListener("click", () => {
          const entry = entries.find((item) => item.id === button.dataset.restoreArchive);
          if (!entry) return;
          if (!window.confirm(`Restaurar "${brDates(entry.summary)}"?`)) return;
          const result = AppData.restoreDeletedArchiveEntry(entry.id);
          if (!result?.ok) {
            alert(result?.error || "Não foi possível restaurar.");
            return;
          }
          window.App?.toast?.(`Restaurado: ${brDates(entry.summary)}`, "success");
          paint();
          options.onRestored?.(result);
        });
      });
    };

    paint();
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("mousedown", (event) => {
      if (!wrapper.contains(event.target)) close();
    });
  }

  window.LixeiraUI = { toggleButtonHTML, open, pendingCount };
})();
