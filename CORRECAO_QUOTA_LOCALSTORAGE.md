# Correção — QuotaExceededError no localStorage (`chezPituPeopleSystem.v1`)

## Problema identificado

Em produção:

```
QuotaExceededError: Failed to execute 'setItem' on 'Storage':
Setting the value of 'chezPituPeopleSystem.v1' exceeded the quota.
```

Origem: `js/data.js` → `setRemoteState()` (e também `saveState()`).

## Causa raiz

`setRemoteState()` e `saveState()` gravavam **o estado inteiro** sob a chave
`chezPituPeopleSystem.v1` com um `localStorage.setItem(...)` **sem try/catch**:

```js
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
```

O estado completo inclui todas as empresas, funcionários, feriados (inclusive
soft-deletados), escalas (`manualScale`), ausências, lançamentos do contador,
**históricos/backups de empresa** e **logos em base64**. Ao ultrapassar a cota
do navegador (~5 MB), o `setItem` lança `QuotaExceededError`. Como:

1. `setRemoteState()` é chamado durante o merge/sync com o Firebase, a exceção
   **quebrava a sincronização**;
2. em `saveState()`, o `setItem` vinha **antes** do `FirebaseSync.save(state)` —
   ao lançar, o Firebase **nem chegava a ser chamado**, perdendo a gravação remota.

As estruturas que mais ocupam espaço (medido via `measureStorageUsage()`):

| Estrutura            | Observação                                            |
|----------------------|-------------------------------------------------------|
| `backups`            | `companyInfoHistory` + `companyInfoBackup` (com logos)|
| `logos`              | `companyInfo.logoDataUrl` (base64) por empresa        |
| `holidays`           | feriados + `workedEmployees` (inclui soft-deletados)  |
| `coverageAlerts`     | acumula ao longo do tempo                             |
| `employees`          | cadastro por empresa                                  |
| `manualScale`        | escalas por mês                                       |

## Correção implementada

Persistência **em camadas**, com `try/catch`, que **nunca lança** (`js/data.js`):

- **Camada 0 — `full`**: estado completo (cache offline ideal).
- **Camada 1 — `slim`**: remove logos base64, históricos/backups, feriados
  soft-deletados e `coverageAlerts`. **Mantém os dados operacionais offline.**
- **Camada 2 — `lean`**: grava **apenas** sessão/empresa ativa, filtros
  (`pageFilters`), preferências (`scaleCodeConfig`, `coveragePrincipalBindings`),
  mês selecionado e **versão de cache**. Dados operacionais passam a vir do Firebase.
- **Esgotado**: registra *warning*, marca `degraded`, **desliga o cache local na
  sessão** e segue usando o Firebase. A aplicação **não quebra**.

Pontos-chave:

1. `setRemoteState()` e `saveState()` agora chamam `persistStateToLocal(state)`,
   que degrada com segurança e **nunca lança**.
2. `saveState()` chama `FirebaseSync.save(state)` **sempre**, mesmo se o cache
   local falhar — uma `QuotaExceededError` **não gera mais erro de sincronização**.
3. O `state` em memória permanece **completo** durante a sessão.
4. **Migração segura da chave** `chezPituPeopleSystem.v1`: o leitor (`loadState`)
   tolera o payload completo legado e os novos payloads `slim`/`lean`. Ao recarregar
   um payload `lean`, `mergeSavedCompanyBlocks` reconstrói os blocos de empresa e o
   merge com o Firebase restaura os dados operacionais. **Nada é apagado.**
5. `try/catch` em todos os `setItem`:
   - `js/data.js` (via `persistStateToLocal`);
   - `js/funcionarios.js` (`addShiftPreset`);
   - `js/security-operations.js` e `getShiftPresets` já estavam protegidos.

## Diagnóstico em produção (tamanho atual)

No console da aplicação em produção:

```js
AppData.measureStorageUsage();
```

Retorna (e imprime com `console.table`):
- `storedBytes` / `storedKB` — tamanho atual da chave `chezPituPeopleSystem.v1`;
- `breakdown` — bytes por estrutura (employees, holidays, manualScale, vacations,
  absences, contadorLancamentos, logos, backups, calendarHolidays, coverageAlerts…);
- `perCompany` — bytes por empresa;
- `persistTier` / `degraded` — camada de persistência ativa.

> Snippet sem depender do AppData (apenas tamanho bruto da chave):
> ```js
> (localStorage.getItem('chezPituPeopleSystem.v1')||'').length
> ```

## Arquivos alterados

- `js/data.js` — `persistStateToLocal` (camadas full/slim/lean), `buildSlimPersistedState`,
  `buildLeanPersistedState`, `isQuotaError`, `measureStorageUsage`; `saveState` e
  `setRemoteState` passam a usar persistência segura; export de `measureStorageUsage`
  e `STORAGE_KEY`.
- `js/funcionarios.js` — `try/catch` em `addShiftPreset`.
- `package.json` — scripts `test:quota` e inclusão no `validate`.

## Arquivos novos

- `scripts/test-storage-quota.mjs` — 25 asserções (full/slim/lean/desligado +
  Firebase não bloqueado + reload de payload lean).
- `CORRECAO_QUOTA_LOCALSTORAGE.md` — este documento.

## Testes executados

- `npm test` → **47/47**
- `npm run validate` → funcional **183/183** + offline **15/15** + dedup **44/44** +
  quota **25/25**

## Relatório de tamanho (antes × depois)

| Cenário                         | Chave `chezPituPeopleSystem.v1`                          |
|---------------------------------|----------------------------------------------------------|
| Antes (estado completo)         | base completa — estourava a cota → `QuotaExceededError`  |
| Depois — `full` (cabe)          | igual ao anterior (sem mudança quando há espaço)         |
| Depois — `slim` (cota apertada) | sem logos/backups/soft-deletados/alertas (~70–80% menor) |
| Depois — `lean` (cota mínima)   | só sessão/filtros/preferências/versão (poucos KB)        |

> Os percentuais exatos dependem dos dados reais de cada navegador. Rode
> `AppData.measureStorageUsage()` em produção para os números do ambiente.

## Pendências / recomendações

- **Não** foi feito commit, push nem deploy (conforme solicitado).
- Recomenda-se rodar `AppData.measureStorageUsage()` em produção e registrar o
  `storedKB` real antes/depois no relatório acima.
- Possível otimização futura: **não** persistir logos base64 no estado local nem
  no Firebase como parte do estado (servir de Storage dedicado), reduzindo a maior
  fonte de peso na raiz.
