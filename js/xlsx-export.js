/**
 * Gerador mínimo de planilha Excel (.xlsx) — sem dependência externa.
 *
 * Monta o pacote Office Open XML (zip sem compressão) direto no navegador.
 * Somente leitura: recebe linhas já prontas e devolve/baixa o arquivo; nunca
 * toca em AppData, localStorage ou Firebase.
 *
 * Tipos de célula aceitos em cada linha:
 *   - string / number / boolean / null        → texto, número, Sim/Não, vazio
 *   - { type: "date", value: "AAAA-MM-DD" }   → data real do Excel (dd/mm/aaaa)
 *   - { type: "datetime", value: ms }         → data e hora (dd/mm/aaaa hh:mm)
 *   - { type: "currency", value: number }     → R$ #.##0,00
 *   - { type: "text", value: "..." }          → texto forçado (CPF, CTPS...)
 *
 * Uso: XlsxExport.download("arquivo.xlsx", { name, columns, rows })
 *   columns: [{ header: "Nome", width: 30 }, ...]
 */
(function () {
  const STYLE = { default: 0, header: 1, date: 2, currency: 3, datetime: 4, text: 5 };

  // ── CRC32 (exigido pelo formato zip) ─────────────────────────────────
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Zip "stored" (sem compressão) — suficiente e 100% legível pelo Excel. */
  function buildZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const locals = [];
    const centrals = [];
    let offset = 0;

    files.forEach(({ name, content }) => {
      const nameBytes = encoder.encode(name);
      const data = typeof content === "string" ? encoder.encode(content) : content;
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nomes em UTF-8
      local.setUint16(8, 0, true); // stored
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      locals.push(new Uint8Array(local.buffer), nameBytes, data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, dosTime, true);
      central.setUint16(14, dosDate, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint32(42, offset, true);
      centrals.push(new Uint8Array(central.buffer), nameBytes);

      offset += 30 + nameBytes.length + data.length;
    });

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let pos = 0;
    parts.forEach((part) => {
      out.set(part, pos);
      pos += part.length;
    });
    return out;
  }

  // ── Conteúdo da planilha ─────────────────────────────────────────────
  function xmlEscape(value) {
    return String(value)
      // Caracteres de controle são proibidos em XML e corromperiam o arquivo.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function columnLetter(index) {
    let n = index + 1;
    let letters = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  /** "AAAA-MM-DD" → número de série do Excel (sem fuso: a data é civil). */
  function isoDateToSerial(iso) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(utc) ? null : utc / 86400000 + 25569;
  }

  /** Timestamp (ms) → série do Excel no horário local de quem exporta. */
  function timestampToSerial(ms) {
    const value = Number(ms);
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return (value - date.getTimezoneOffset() * 60000) / 86400000 + 25569;
  }

  function inlineString(ref, text, style) {
    const s = style ? ` s="${style}"` : "";
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  }

  function numberCell(ref, number, style) {
    const s = style ? ` s="${style}"` : "";
    return `<c r="${ref}"${s}><v>${number}</v></c>`;
  }

  function cellXML(ref, cell) {
    if (cell === null || cell === undefined || cell === "") return "";
    if (typeof cell === "number") return Number.isFinite(cell) ? numberCell(ref, cell) : "";
    if (typeof cell === "boolean") return inlineString(ref, cell ? "Sim" : "Não");
    if (typeof cell === "object") {
      const { type, value } = cell;
      if (value === null || value === undefined || value === "") return "";
      if (type === "date") {
        const serial = isoDateToSerial(value);
        return serial === null ? inlineString(ref, value) : numberCell(ref, serial, STYLE.date);
      }
      if (type === "datetime") {
        const serial = timestampToSerial(value);
        return serial === null ? "" : numberCell(ref, serial, STYLE.datetime);
      }
      if (type === "currency") {
        const number = Number(value);
        return Number.isFinite(number) ? numberCell(ref, number, STYLE.currency) : inlineString(ref, value);
      }
      return inlineString(ref, value, STYLE.text);
    }
    return inlineString(ref, cell);
  }

  function sheetXML(sheet) {
    const columns = sheet.columns || [];
    const lastCol = columnLetter(Math.max(columns.length - 1, 0));
    const lastRow = (sheet.rows || []).length + 1;

    const cols = columns
      .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(col.width) || 14}" customWidth="1"/>`)
      .join("");

    const header = `<row r="1">${columns
      .map((col, i) => inlineString(`${columnLetter(i)}1`, col.header, STYLE.header))
      .join("")}</row>`;

    const body = (sheet.rows || [])
      .map((row, r) => {
        const rowNumber = r + 2;
        const cells = columns.map((_, c) => cellXML(`${columnLetter(c)}${rowNumber}`, row[c])).join("");
        return `<row r="${rowNumber}">${cells}</row>`;
      })
      .join("");

    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<dimension ref="A1:${lastCol}${lastRow}"/>` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      (cols ? `<cols>${cols}</cols>` : "") +
      `<sheetData>${header}${body}</sheetData>` +
      (columns.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : "") +
      `</worksheet>`
    );
  }

  const STYLES_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3">` +
    `<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>` +
    `<numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00"/>` +
    `<numFmt numFmtId="166" formatCode="dd/mm/yyyy\\ hh:mm"/>` +
    `</numFmts>` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1F2A44"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="6">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  function safeSheetName(name) {
    const clean = String(name || "Planilha").replace(/[\\/?*[\]:]/g, " ").trim();
    return (clean || "Planilha").slice(0, 31);
  }

  /** Monta o .xlsx e devolve os bytes (Uint8Array). */
  function build(sheet) {
    const sheetName = safeSheetName(sheet.name);
    return buildZip([
      {
        name: "[Content_Types].xml",
        content:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`
      },
      {
        name: "_rels/.rels",
        content:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      },
      {
        name: "xl/workbook.xml",
        content:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
          `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">` +
          `'${xmlEscape(sheetName.replace(/'/g, "''"))}'!$A$1:$${columnLetter(Math.max((sheet.columns || []).length - 1, 0))}$${(sheet.rows || []).length + 1}` +
          `</definedName></definedNames>` +
          `</workbook>`
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      },
      { name: "xl/styles.xml", content: STYLES_XML },
      { name: "xl/worksheets/sheet1.xml", content: sheetXML(sheet) }
    ]);
  }

  function download(filename, sheet) {
    const bytes = build(sheet);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return bytes.length;
  }

  window.XlsxExport = { build, download, isoDateToSerial, columnLetter };
})();
