/**
 * Atualiza ?v= nos scripts do index.html antes do deploy (evita cache antigo no Netlify).
 */
const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "index.html");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const html = fs.readFileSync(indexPath, "utf8");
const updated = html.replace(/\?v=\d{8}[a-z]?/g, `?v=${stamp}`);

if (updated === html) {
  console.log(`[bump-cache] Nenhum ?v= encontrado em index.html (stamp ${stamp}).`);
} else {
  fs.writeFileSync(indexPath, updated, "utf8");
  console.log(`[bump-cache] Versão de cache atualizada para v=${stamp}.`);
}
