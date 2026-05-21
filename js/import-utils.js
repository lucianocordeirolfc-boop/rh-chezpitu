(function () {
  function stripAccents(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeKey(key) {
    return stripAccents(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalizeRow(row) {
    if (!row || typeof row !== "object") return {};
    return Object.entries(row).reduce((acc, [key, value]) => {
      acc[normalizeKey(key)] = value;
      return acc;
    }, {});
  }

  function pick(row, aliases) {
    const normalized = normalizeRow(row);
    for (const alias of aliases) {
      const value = normalized[normalizeKey(alias)];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  function normalizeCpfDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const digits = normalizeCpfDigits(raw);
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return raw;
  }

  function formatCtps(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/[.\-/]/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 7) return raw;
    return raw;
  }

  function repairVtDailyValue(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 200) return rounded;

    if (amount >= 1000 && amount <= 99999) {
      const repaired = Math.round((amount / 100) * 100) / 100;
      if (repaired >= 5 && repaired <= 200) return repaired;
    }

    if (amount > 200 && amount <= 9999 && amount % 100 !== 0) {
      const repaired = Math.round((amount / 100) * 100) / 100;
      if (repaired >= 5 && repaired <= 200) return repaired;
    }

    return rounded;
  }

  function parseVtDaily(value) {
    if (value === "" || value === undefined || value === null) return 0;
    if (typeof value === "number") return repairVtDailyValue(value);

    let raw = String(value).trim();
    if (!raw) return 0;

    raw = raw.replace(/[R$\s]/gi, "");

    if (raw.includes(",")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      raw = raw.replace(/\./g, "");
    } else if (/^\d+$/.test(raw)) {
      return repairVtDailyValue(Number(raw));
    } else if (!/^\d+\.\d{1,2}$/.test(raw)) {
      if (raw.includes(",")) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else {
        const digitsOnly = raw.replace(/\D/g, "");
        if (digitsOnly.length >= 3) return repairVtDailyValue(Number(digitsOnly));
        raw = raw.replace(/[^\d.-]/g, "");
      }
    }

    const amount = Number(raw);
    if (!Number.isFinite(amount)) return 0;
    return repairVtDailyValue(amount);
  }

  function formatVtCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatVtInput(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function importModalMarkup(options) {
    const {
      modalId,
      title,
      description,
      fileInputId,
      textareaId,
      importButtonId,
      extraActions = ""
    } = options;

    return `
      <div id="${modalId}" class="modal-overlay" hidden>
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Importação</p>
              <h2 id="${modalId}-title">${title}</h2>
            </div>
            <button type="button" class="modal-close" data-close-modal="${modalId}" aria-label="Fechar">×</button>
          </div>
          <p class="help-text compact-help">${description}</p>
          <label class="full">Arquivo CSV ou JSON
            <input id="${fileInputId}" type="file" accept=".csv,.json,text/csv,application/json">
          </label>
          <textarea id="${textareaId}" class="import-box modal-import-box" rows="8" placeholder="Cole CSV ou JSON aqui."></textarea>
          <div class="import-actions">
            <button id="${importButtonId}" class="primary" type="button">Importar</button>
            ${extraActions}
            <button type="button" class="secondary" data-close-modal="${modalId}">Cancelar</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindImportModal(container, modalId, onImport) {
    const modal = container.querySelector(`#${modalId}`);
    if (!modal) return;

    const openers = container.querySelectorAll(`[data-open-modal="${modalId}"]`);
    const closers = container.querySelectorAll(`[data-close-modal="${modalId}"]`);

    const closeModal = () => {
      modal.hidden = true;
    };

    const openModal = () => {
      modal.hidden = false;
    };

    openers.forEach((button) => button.addEventListener("click", openModal));
    closers.forEach((button) => button.addEventListener("click", closeModal));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    const importButton = container.querySelector(`#${onImport.buttonId}`);
    if (importButton) {
      importButton.addEventListener("click", () => {
        Promise.resolve(onImport.run()).then(() => closeModal()).catch(() => {});
      });
    }
  }

  function parseCSVLine(line, separator) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === separator && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];

    const separator = lines[0].includes(";") ? ";" : ",";
    const headers = parseCSVLine(lines.shift(), separator).map((item) => normalizeKey(item));

    return lines.map((line) => {
      const values = parseCSVLine(line, separator);
      return headers.reduce((row, header, index) => {
        row[header] = values[index] || "";
        return row;
      }, {});
    });
  }

  function parseImportText(text) {
    const cleanText = text.trim();
    if (!cleanText) return [];

    if (cleanText.startsWith("[") || cleanText.startsWith("{")) {
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) return parsed;
      return (
        parsed.funcionarios ||
        parsed.employees ||
        parsed.feriados ||
        parsed.holidays ||
        parsed.registros ||
        parsed.data ||
        []
      );
    }

    return parseCSV(cleanText);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsText(file, "UTF-8");
    });
  }

  function downloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadCSV(filename, headers, exampleRow) {
    const separator = ";";
    const lines = [
      headers.join(separator),
      exampleRow.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(separator)
    ];
    downloadBlob(filename, `\uFEFF${lines.join("\n")}`, "text/csv;charset=utf-8");
  }

  function downloadJSON(filename, data) {
    downloadBlob(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
  }

  function formatImportSummary(result) {
    const parts = [`${result.imported} registro(s) importado(s) com sucesso.`];
    if (result.updated) {
      parts.push(`${result.updated} registro(s) atualizado(s) por CPF existente.`);
    }
    if (result.skipped) {
      parts.push(`${result.skipped} registro(s) ignorado(s).`);
    }
    if (result.counts) {
      parts.push(
        `Total no sistema: ${result.counts.total} (${result.counts.byCompany
          .map((item) => `${item.company}: ${item.total}`)
          .join(" · ")})`
      );
    }
    if (result.messages?.length) {
      parts.push(result.messages.slice(0, 5).join("\n"));
      if (result.messages.length > 5) {
        parts.push(`... e mais ${result.messages.length - 5} aviso(s).`);
      }
    }
    return parts.join("\n");
  }

  const EMPLOYEE_FIELD_ALIASES = {
    name: ["nome", "name", "funcionario", "funcionário", "funcionária"],
    cpf: ["cpf"],
    ctps: ["ctps"],
    role: ["cargo", "role", "funcao", "função"],
    department: ["setor", "department", "departamento"],
    status: ["status", "situacao", "situação"],
    admissionDate: ["admissao", "admissão", "admissiondate", "dataadmissao"],
    fixedDay: ["folgafixa", "folga fixa", "fixedday", "diafolga"],
    vtDaily: ["vt", "vtdaily", "valetransporte", "vale transporte"],
    company: ["empresa", "company", "unidade"],
    defaultShift: ["turnopadrao", "turno padrao", "turno padrão", "defaultshift", "turno"],
    notes: ["observacoes", "observações", "notes", "obs"]
  };

  const HOLIDAY_FIELD_ALIASES = {
    company: ["empresa", "company", "unidade"],
    employeeName: ["funcionario", "funcionário", "funcionária", "nomefuncionario", "employeename", "employee"],
    holidayName: ["nomeferiado", "feriado", "name", "nome"],
    workedDate: ["datatrabalhada", "dataferiado", "data", "date", "datadoferiado"],
    dueDate: ["prazocompensacao", "prazo", "vencimento", "duedate"],
    compensationDate: ["datacompensacao", "compensacao", "compensação", "datacomp"],
    status: ["status", "situacao", "situação"],
    notes: ["observacoes", "observações", "notes", "obs"]
  };

  function mapEmployeeRow(row) {
    const cpfRaw = pick(row, EMPLOYEE_FIELD_ALIASES.cpf);
    const ctpsRaw = pick(row, EMPLOYEE_FIELD_ALIASES.ctps);
    return {
      name: pick(row, EMPLOYEE_FIELD_ALIASES.name),
      cpf: formatCpf(cpfRaw),
      ctps: formatCtps(ctpsRaw),
      role: pick(row, EMPLOYEE_FIELD_ALIASES.role),
      department: pick(row, EMPLOYEE_FIELD_ALIASES.department),
      status: pick(row, EMPLOYEE_FIELD_ALIASES.status),
      admissionDate: pick(row, EMPLOYEE_FIELD_ALIASES.admissionDate),
      fixedDay: pick(row, EMPLOYEE_FIELD_ALIASES.fixedDay),
      vtDaily: pick(row, EMPLOYEE_FIELD_ALIASES.vtDaily),
      company: pick(row, EMPLOYEE_FIELD_ALIASES.company),
      defaultShift: pick(row, EMPLOYEE_FIELD_ALIASES.defaultShift),
      notes: pick(row, EMPLOYEE_FIELD_ALIASES.notes)
    };
  }

  function mapHolidayRow(row) {
    return {
      company: pick(row, HOLIDAY_FIELD_ALIASES.company),
      employeeName: pick(row, HOLIDAY_FIELD_ALIASES.employeeName),
      holidayName: pick(row, HOLIDAY_FIELD_ALIASES.holidayName),
      workedDate: pick(row, HOLIDAY_FIELD_ALIASES.workedDate),
      dueDate: pick(row, HOLIDAY_FIELD_ALIASES.dueDate),
      compensationDate: pick(row, HOLIDAY_FIELD_ALIASES.compensationDate),
      status: pick(row, HOLIDAY_FIELD_ALIASES.status),
      notes: pick(row, HOLIDAY_FIELD_ALIASES.notes)
    };
  }

  window.ImportUtils = {
    bindImportModal,
    downloadBlob,
    downloadCSV,
    downloadJSON,
    formatCpf,
    formatCtps,
    formatImportSummary,
    formatVtCurrency,
    formatVtInput,
    importModalMarkup,
    mapEmployeeRow,
    mapHolidayRow,
    normalizeCpfDigits,
    normalizeKey,
    parseCSV,
    parseImportText,
    parseVtDaily,
    pick,
    readFileAsText,
    repairVtDailyValue
  };
})();
