# Configurar deploy automático — site Netlify **já existente**

**Site em produção:** [https://rh-chezpitu.netlify.app/](https://rh-chezpitu.netlify.app/)

Use este guia se o sistema **já está no ar** no Netlify e você quer que **cada atualização** suba sozinha.

**Não** use *Add new site* — isso criaria um segundo site. Sempre trabalhe no site **rh-chezpitu** no painel Netlify.

---

## Caminho 1 — Automático com GitHub (recomendado)

### Passo 1 — Repositório no GitHub

1. Acesse [github.com/new](https://github.com/new).
2. Nome sugerido: `sistema-rh-chez-pitu` (privado, se preferir).
3. **Não** marque README, .gitignore nem license (o projeto local já tem arquivos).
4. Crie o repositório e copie a URL (ex.: `https://github.com/SUA_EMPRESA/sistema-rh-chez-pitu.git`).

### Passo 2 — Enviar esta pasta para o GitHub

No PowerShell, na pasta do projeto (substitua a URL pelo seu repositório):

```powershell
cd "c:\Sistema RH Chez Pitu"
git init
git add .
git commit -m "Sistema RH Chez Pitu — deploy automático"
git branch -M main
git remote add origin https://github.com/lucianocordeirolfc-boop/rh-chezpitu.git
git push -u origin main
```

Se pedir login no GitHub, use **Personal Access Token** como senha ou o GitHub Desktop.

### Passo 3 — Vincular o repositório ao **site que já existe**

1. Abra [app.netlify.com](https://app.netlify.com).
2. Clique no **seu site** (o que já mostra o Sistema RH).
3. Menu **Site configuration** (ou *Site settings*).
4. **Build & deploy** → **Continuous deployment** → **Link repository** (ou *Configure* / *Link to Git provider*).
5. Autorize o GitHub e escolha o repositório `sistema-rh-chez-pitu`.
6. Branch: **`main`**.
7. Configuração de build (confira — o `netlify.toml` já define):
   - **Build command:** *(vazio)*
   - **Publish directory:** `.` (ponto = raiz do projeto)
8. **Deploy site** (ou *Save*).

Pronto: cada `git push` na `main` publica no **mesmo URL** que você já usa.

### Passo 4 — Testar

Altere qualquer arquivo, depois:

```powershell
git add .
git commit -m "Teste deploy automático"
git push
```

No Netlify: **Deploys** — deve aparecer um deploy novo em ~1 minuto. Abra o site e use **Ctrl+F5**.

---

## Caminho 2 — Deploy pelo PC (sem GitHub)

Útil se ainda não quiser usar Git. Publica no **mesmo site** existente.

### Uma vez só

```powershell
cd "c:\Sistema RH Chez Pitu"
npm install
npx netlify login
npx netlify link
```

No `netlify link`:

1. **Link this directory to a project on Netlify** → Yes.
2. Escolha **Use current project** (ou lista de sites).
3. Selecione o **site existente** do Sistema RH (não crie um novo).

Isso cria a pasta `.netlify/` (não vai para o GitHub se estiver no `.gitignore`).

### Sempre que alterar o sistema

```powershell
cd "c:\Sistema RH Chez Pitu"
npm run deploy
```

Ou: `.\scripts\deploy.ps1`

---

## Onde achar dados no Netlify (site existente)

| O que | Onde |
|-------|------|
| URL do site | **Domain management** ou topo do painel |
| Site ID | **Site configuration → General → Site details → Site ID** |
| Histórico de deploys | **Deploys** |
| Repositório vinculado | **Build & deploy → Continuous deployment** |
| Token (só Caminho 3 / Actions) | [app.netlify.com/user/applications](https://app.netlify.com/user/applications#personal-access-tokens) |

---

## Caminho 3 — GitHub Actions (opcional)

Só se quiser deploy pelo GitHub em vez do painel Netlify. Precisa dos secrets `NETLIFY_AUTH_TOKEN` e `NETLIFY_SITE_ID` do site **existente**. Detalhes em `DEPLOY.md` (Opção B).

---

## Problemas comuns

| Situação | O que fazer |
|----------|-------------|
| Criei um site novo sem querer | No Netlify, apague o site duplicado; use **Link repository** no site **original**. |
| Push não dispara deploy | **Build & deploy** → confira se o repo está ligado e a branch é `main`. |
| Site online igual ao antigo | **Ctrl+F5**; o deploy atualiza `?v=` no `index.html`. |
| `netlify link` não acha o site | `npx netlify login` de novo com a conta que criou o site. |
| Dois deploys ao mesmo tempo | Use **só** Caminho 1 **ou** Caminho 2 como rotina principal. |

---

## Resumo

1. **Automático:** GitHub + **Link repository** no site Netlify **já existente** + `git push`.
2. **Manual rápido:** `netlify link` (uma vez) + `npm run deploy`.

Firebase e dados dos usuários **não** mudam com o deploy — só os arquivos HTML/JS/CSS no Netlify.
