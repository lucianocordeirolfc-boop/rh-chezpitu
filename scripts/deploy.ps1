# Deploy manual para o Netlify (site já vinculado com "netlify link")
# Uso: .\scripts\deploy.ps1
# Requer: npm install (na raiz do projeto)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependências..."
  npm install
}

if (-not (Test-Path ".netlify\state.json")) {
  Write-Host ""
  Write-Host "Primeira vez: vincule o site Netlify nesta pasta:"
  Write-Host "  npx netlify link"
  Write-Host ""
  Write-Host "Escolha o site existente do Sistema RH e confirme."
  exit 1
}

npm run deploy
Write-Host ""
Write-Host "Deploy concluído. Aguarde alguns segundos e abra a URL do Netlify (Ctrl+F5)."
