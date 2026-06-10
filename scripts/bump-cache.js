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
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const versionPath = path.join(root, "js", "version.js");
const indexPath = path.join(root, "index.html");

const versionSrc = fs.readFileSync(versionPath, "utf8");
const versionMatch = versionSrc.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
if (!versionMatch) {
  console.error("[bump-cache] APP_VERSION não encontrada em js/version.js. Abortado.");
  process.exit(1);
}
const version = versionMatch[1];

function git(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch (_) {
    return fallback;
  }
}

const branch = git("git rev-parse --abbrev-ref HEAD", "desconhecido");
const commit = git("git rev-parse --short HEAD", "desconhecido");
const buildDate = new Date().toISOString().slice(0, 10);

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
