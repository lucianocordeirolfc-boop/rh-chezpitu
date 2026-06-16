# Deploy — Firebase Hosting

O projeto é **estático** (sem build). A publicação é feita no **Firebase Hosting**
do projeto **`chez-pitu-rh`** (o mesmo projeto Firebase já usado para Auth e
Realtime Database). A configuração está versionada em `firebase.json` e `.firebaserc`.

**Produção:** https://chez-pitu-rh.web.app e https://chez-pitu-rh.firebaseapp.com

> **Histórico:** o sistema já foi hospedado no Netlify. Os arquivos `netlify.toml`,
> `CONFIGURAR-NETLIFY-SITE-EXISTENTE.md` e `scripts/deploy.ps1` permanecem no repo
> apenas como referência obsoleta — **não use** mais.

## Por que a versão online não atualiza sozinha?

- Alterações **locais** (arquivo + Ctrl+F5) não enviam nada ao Firebase.
- É preciso **publicar** de novo (`npm run deploy`).
- Navegadores podem cachear `index.html`; por isso os scripts usam `?v=YYYYMMDD.RR`
  e o deploy atualiza esse número (`npm run bump-cache`).

---

## Pré-requisitos (uma vez por máquina)

1. Node.js instalado.
2. Dependências do projeto:

   ```powershell
   cd "C:\Users\conta\rh-chezpitu"
   npm install
   ```

3. Login no Firebase (abre o navegador):

   ```powershell
   npx firebase login
   ```

   A conta precisa ter acesso ao projeto **chez-pitu-rh**.

---

## Deploy de produção (uso diário)

```powershell
npm run deploy
```

Esse comando:
1. roda `npm run bump-cache` (atualiza `?v=` no `index.html` e carimba build);
2. executa `firebase deploy --only hosting` (envia os arquivos estáticos).

> Só hospedagem é publicada (`--only hosting`). As **regras do Realtime Database**
> (`database.rules.json`) **não** são enviadas por este fluxo, para nunca
> sobrescrever as regras de produção sem intenção.

---

## Preview (canal temporário, sem afetar produção)

```powershell
npm run deploy:preview
```

Cria uma URL de preview no canal `preview`. Útil para validar antes de publicar.

---

## CI (GitHub Actions — opcional)

`npm run deploy:ci` roda `firebase deploy --only hosting --non-interactive`.
Para uso em CI, autentique com `FIREBASE_TOKEN` (gerado por `firebase login:ci`)
ou com uma service account (`GOOGLE_APPLICATION_CREDENTIALS`).
*(Ainda não há workflow versionado em `.github/workflows/`.)*

---

## Depois do deploy

1. Abra https://chez-pitu-rh.web.app
2. **Ctrl+F5** (ou aba anônima) para garantir o `index.html` novo.
3. Confira o indicador de sync Firebase no canto da tela.
4. Confira o badge de versão no cabeçalho (deve exibir o `APP_VERSION` novo + `PRODUÇÃO`).

---

## Resumo

| Comando | O que faz |
|---------|-----------|
| `npm run deploy` | bump-cache + publica em produção (hosting) |
| `npm run deploy:preview` | publica em canal de preview temporário |
| `npm run deploy:ci` | deploy não interativo (CI) |

O Firebase (Auth/Database), o localStorage e as regras de negócio **não mudam**
com o deploy — só os arquivos estáticos hospedados.
