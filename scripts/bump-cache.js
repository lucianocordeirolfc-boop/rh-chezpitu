/**
 * Controle automático de cache + carimbo de build (item E).
 *
 * Fonte única da versão: js/version.js (constante APP_VERSION).
 * Este script:
 *   1. lê APP_VERSION de js/version.js;
 *   2. reescreve todos os ?v= do index.html com esse valor (cache-busting);
 *   3. preenche BUILD_BRANCH, BUILD_COMMIT e BUILD_DATE em js/version.js com
 *      os dados reais do git/build (best-effort — não falha se git ausente).
 *
 * Para publicar nova versão: edite APP_VERSION em js/version.js e rode este script.
 *
 * Com --auto (usado por `npm run deploy`), o APP_VERSION é gerado sozinho a cada
 * publicação: AAAAMMDD.01 num dia novo, ou a revisão seguinte no mesmo dia
 * (20261029.01 → 20261029.02). Assim todo deploy troca os ?v= e os navegadores
 * baixam os arquivos novos ao atualizar a página.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Data local (horário do computador que publica), não UTC.
function localDateParts(date) {
  const ymd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  const iso = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { ymd, iso };
}

function nextVersion(current, date = new Date()) {
  const { ymd } = localDateParts(date);
  const match = String(current || "").match(/^(\d{8})\.(\d+)$/);
  if (match && match[1] >= ymd) {
    // Mesmo dia (ou versão manual "à frente"): só incrementa a revisão.
    return `${match[1]}.${pad2(Number(match[2]) + 1)}`;
  }
  return `${ymd}.01`;
}

if (require.main !== module) {
  module.exports = { nextVersion };
  return;
}

const root = path.join(__dirname, "..");
const versionPath = path.join(root, "js", "version.js");
const indexPath = path.join(root, "index.html");
const autoVersion = process.argv.includes("--auto");

let versionSrc = fs.readFileSync(versionPath, "utf8");
const versionMatch = versionSrc.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
if (!versionMatch) {
  console.error("[bump-cache] APP_VERSION não encontrada em js/version.js. Abortado.");
  process.exit(1);
}
let version = versionMatch[1];

if (autoVersion) {
  const previous = version;
  version = nextVersion(previous);
  versionSrc = versionSrc.replace(/(APP_VERSION\s*=\s*)["'][^"']*["']/, `$1"${version}"`);
  fs.writeFileSync(versionPath, versionSrc, "utf8");
  console.log(`[bump-cache] APP_VERSION automático: ${previous} → ${version}`);
}

function git(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch (_) {
    return fallback;
  }
}

const branch = git("git rev-parse --abbrev-ref HEAD", "desconhecido");
const commit = git("git rev-parse --short HEAD", "desconhecido");
const buildDate = localDateParts(new Date()).iso;

// 1. Carimba git/build em js/version.js (apenas os campos automáticos).
const stampedVersionSrc = versionSrc
  .replace(/(BUILD_BRANCH\s*=\s*)["'][^"']*["']/, `$1"${branch}"`)
  .replace(/(BUILD_COMMIT\s*=\s*)["'][^"']*["']/, `$1"${commit}"`)
  .replace(/(BUILD_DATE\s*=\s*)["'][^"']*["']/, `$1"${buildDate}"`);
if (stampedVersionSrc !== versionSrc) {
  fs.writeFileSync(versionPath, stampedVersionSrc, "utf8");
  console.log(`[bump-cache] version.js carimbado: branch=${branch} commit=${commit} build=${buildDate}`);
}

// 2. Reescreve todos os ?v= do index.html com APP_VERSION.
const html = fs.readFileSync(indexPath, "utf8");
const updated = html.replace(/\?v=[0-9A-Za-z.]+/g, `?v=${version}`);
if (updated === html) {
  console.log(`[bump-cache] Nenhum ?v= alterado em index.html (já em ${version}).`);
} else {
  fs.writeFileSync(indexPath, updated, "utf8");
  console.log(`[bump-cache] Cache de index.html atualizado para ?v=${version}.`);
}
