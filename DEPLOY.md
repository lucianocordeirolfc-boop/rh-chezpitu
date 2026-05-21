# Deploy automático — Netlify

O projeto é **estático** (sem build). O `netlify.toml` na raiz já define publicação e redirects.

> **Site já no ar no Netlify?** Siga o guia passo a passo: **`CONFIGURAR-NETLIFY-SITE-EXISTENTE.md`**

## Por que a versão online não atualizava sozinha?

- Alterações **locais** (arquivo + Ctrl+F5) não enviam nada ao Netlify.
- É preciso **publicar** de novo (Git push ou `npm run deploy`).
- Navegadores podem cachear `index.html`; por isso os scripts usam `?v=YYYYMMDD` e o deploy atualiza esse número.

---

## Opção A — Recomendada: Netlify + GitHub (deploy a cada push)

1. Crie um repositório no GitHub (ex.: `sistema-rh-chez-pitu`).
2. Na pasta do projeto:

   ```powershell
   cd "c:\Sistema RH Chez Pitu"
   git init
   git add .
   git commit -m "Sistema RH Chez Pitu"
   git branch -M main
   git remote add origin https://github.com/SUA_ORG/sistema-rh-chez-pitu.git
   git push -u origin main
   ```

3. No [Netlify](https://app.netlify.com): abra o **site que já existe** → **Site configuration** → **Build & deploy** → **Link repository** → GitHub → escolha o repositório.  
   *(Não use “Add new site”, senão cria um segundo site.)*
4. Configuração (já vem do `netlify.toml`):
   - **Build command:** vazio
   - **Publish directory:** `.`
5. **Deploy site**. Daqui em diante, **cada `git push` na branch `main` gera deploy automático**.

Não é necessário GitHub Actions se usar só esta opção.

---

## Opção B — GitHub Actions (CI explícito)

Use se preferir ver o deploy no GitHub ou não quiser vincular o repositório direto no Netlify.

1. Complete a **Opção A** até ter o repositório no GitHub (ou use um repo já existente).
2. No Netlify: **Site settings → General → Site ID** → copie.
3. No Netlify: **User settings → Applications → Personal access tokens** → crie um token.
4. No GitHub: **Settings → Secrets and variables → Actions** → **New repository secret**:
   - `NETLIFY_AUTH_TOKEN` = token do passo 3
   - `NETLIFY_SITE_ID` = ID do passo 2
5. Envie o workflow (já está em `.github/workflows/netlify-deploy.yml`):

   ```powershell
   git add .
   git commit -m "CI deploy Netlify"
   git push
   ```

Cada push em `main` ou `master` roda o workflow, atualiza `?v=` no `index.html` e publica no Netlify.

Também pode disparar manualmente: **Actions → Deploy Netlify → Run workflow**.

---

## Opção C — Deploy manual rápido (sem Git)

Útil para testar ou quando ainda não há repositório.

```powershell
cd "c:\Sistema RH Chez Pitu"
npm install
npx netlify login
npx netlify link
```

Na primeira vez, `link` pede para escolher o **site Netlify já criado**.

Depois de cada alteração:

```powershell
npm run deploy
```

Ou:

```powershell
.\scripts\deploy.ps1
```

Isso atualiza o cache (`?v=`) e envia para **produção**.

---

## Depois do deploy

1. Abra a URL do Netlify.
2. **Ctrl+F5** (ou aba anônima) para garantir o `index.html` novo.
3. Confira o indicador de sync Firebase no canto da tela.

---

## Resumo

| Método | Quando usar |
|--------|-------------|
| **A — Netlify + Git** | Uso diário; push = site atualizado |
| **B — GitHub Actions** | Mesmo efeito, controle no GitHub |
| **C — `npm run deploy`** | Emergência ou sem Git |

O Firebase, localStorage e regras do sistema **não mudam** com o deploy — só os arquivos estáticos no Netlify.
