/**
 * FONTE ÚNICA DA VERSÃO DO SISTEMA RH Chez Pitu.
 *
 * `npm run deploy` gera o APP_VERSION automaticamente (bump-cache.js --auto):
 * dia novo → AAAAMMDD.01; mesmo dia → revisão seguinte. Não é preciso editar.
 *
 * Para definir a versão manualmente (sem deploy):
 *   1. Altere APENAS a constante APP_VERSION abaixo.
 *      Formato: AAAAMMDD.RR  (Ano Mês Dia . Revisão)  — ex.: "20260610.02"
 *      Exibida na interface como: v2026.06.10.02
 *   2. Rode `npm run bump-cache` — ele lê este APP_VERSION e:
 *        - reescreve todos os ?v= do index.html com este valor (cache-busting);
 *        - preenche automaticamente BUILD_BRANCH, BUILD_COMMIT e BUILD_DATE
 *          com os dados reais do git/build.
 *
 * Não duplicar a versão em outros arquivos. Todos consomem window.APP_BUILD_INFO.
 */
(function () {
  // >>> ÚNICO PONTO A EDITAR MANUALMENTE <<<
  var APP_VERSION = "20261030.03";

  // Preenchidos automaticamente por scripts/bump-cache.js (não editar à mão).
  var BUILD_BRANCH = "main";
  var BUILD_COMMIT = "6e804c7";
  var BUILD_DATE = "2026-10-30";

  var info = {
    APP_VERSION: APP_VERSION,
    BUILD_BRANCH: BUILD_BRANCH,
    BUILD_COMMIT: BUILD_COMMIT,
    BUILD_DATE: BUILD_DATE
  };

  if (typeof window !== "undefined") {
    window.APP_VERSION = APP_VERSION;
    window.APP_BUILD_INFO = info;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = info;
  }
})();
