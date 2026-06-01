/**
 * FASE 3A — SEGURANÇA OPERACIONAL
 *
 * Implementa:
 * 1. Proteção contra múltiplas abas abertas
 * 2. Sistema de confirmação para ações críticas
 * 3. Validação contínua de Padroeira de Búzios
 * 4. Notificação de conflitos de sincronização
 *
 * Carregado ANTES de app.js para interceptar eventos globais.
 */

(function () {
  const MULTI_TAB_KEY = "chezPituAppSessionId";
  const CONFLICT_CHECK_INTERVAL_MS = 5000;

  let sessionId = null;
  let conflictCheckTimer = null;
  let lastStateHash = null;

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-TAB DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  function generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function initMultiTabDetection() {
    try {
      // Gerar ID da sessão desta aba
      sessionId = generateSessionId();
      localStorage.setItem(MULTI_TAB_KEY, sessionId);

      // Escutar se outra aba alterou a sessão
      window.addEventListener("storage", handleStorageChange);

      console.log(`[SecurityOps] Multi-tab detection inicializado (sessionId: ${sessionId})`);
    } catch (e) {
      console.warn("[SecurityOps] Multi-tab detection não disponível:", e.message);
    }
  }

  function handleStorageChange(event) {
    if (event.key === MULTI_TAB_KEY && event.newValue !== sessionId) {
      console.warn(
        "[SecurityOps] CONFLITO: Outra aba foi aberta com a aplicação. " +
        "Mudanças nesta aba podem não ser sincronizadas."
      );

      window.App?.toast?.(
        "⚠️ Aplicação aberta em outra aba — sincronização pode estar inconsistente",
        "warning",
        5000
      );

      // Não bloqueia, mas avisa. Deixa o usuário decidir.
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRMAÇÃO OBRIGATÓRIA
  // ─────────────────────────────────────────────────────────────────────────

  const confirmationQueue = [];
  let isDialogOpen = false;

  /**
   * Abrir diálogo de confirmação.
   * @param {string} message - Mensagem da confirmação
   * @param {function} onConfirm - Callback se usuário clica "Sim"
   * @param {function} onCancel - Callback se usuário clica "Não"
   * @param {string} title - Título do diálogo (opcional)
   */
  function requireConfirmation(message, onConfirm, onCancel, title = "Confirmação necessária") {
    return new Promise((resolve) => {
      confirmationQueue.push({
        title,
        message,
        onConfirm: () => {
          onConfirm?.();
          resolve(true);
        },
        onCancel: () => {
          onCancel?.();
          resolve(false);
        }
      });

      processConfirmationQueue();
    });
  }

  function processConfirmationQueue() {
    if (isDialogOpen || confirmationQueue.length === 0) return;

    const item = confirmationQueue[0];
    isDialogOpen = true;

    // Usar window.confirm como fallback se não houver função customizada
    if (typeof window.AppConfirmDialog === "function") {
      window.AppConfirmDialog(
        item.title,
        item.message,
        () => {
          confirmationQueue.shift();
          isDialogOpen = false;
          item.onConfirm();
          processConfirmationQueue();
        },
        () => {
          confirmationQueue.shift();
          isDialogOpen = false;
          item.onCancel();
          processConfirmationQueue();
        }
      );
    } else {
      // Fallback: usar confirm nativo
      const confirmed = window.confirm(`${item.title}\n\n${item.message}`);
      confirmationQueue.shift();
      isDialogOpen = false;

      if (confirmed) {
        item.onConfirm();
      } else {
        item.onCancel();
      }

      processConfirmationQueue();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDAÇÃO DE PADROEIRA (CONTÍNUA)
  // ─────────────────────────────────────────────────────────────────────────

  function checkPadroeiraBuziosHealth() {
    if (!window.AppData?.validatePadroeiraBuziosIntegrity) return;

    const result = window.AppData.validatePadroeiraBuziosIntegrity();

    if (!result.valid) {
      console.error("[SecurityOps] FALHA de integridade: Padroeira de Búzios com data incorreta");

      // Tentar corrigir automaticamente
      const corrected = window.AppData.correctPadroeiraBuziosAutomatically?.();
      if (corrected > 0) {
        console.warn(`[SecurityOps] Corrigido automaticamente ${corrected} feriado(s)`);
        window.App?.toast?.(
          `⚠️ Padroeira de Búzios corrigida automaticamente (${corrected} ocorrência)`,
          "warning",
          3000
        );
      } else {
        window.App?.toast?.(
          "❌ ERRO CRÍTICO: Padroeira de Búzios com data incorreta detectada",
          "danger",
          5000
        );
      }
    }
  }

  function startPadroeiraBuziosValidation() {
    // Validar ao inicializar
    checkPadroeiraBuziosHealth();

    // Validar periodicamente (a cada 10 segundos)
    setInterval(() => {
      checkPadroeiraBuziosHealth();
    }, 10000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETECÇÃO DE SINCRONIZAÇÃO CONFLITANTE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calcular hash do estado para detectar mudanças.
   * Hash simples, não criptográfico, apenas para comparação.
   */
  function hashState(state) {
    if (!state) return "";

    // Serializando apenas estrutura, não valores (para detectar mudanças estruturais)
    const struct = JSON.stringify({
      numCompanies: Object.keys(state.companies || {}).length,
      numEmployees: Object.values(state.companies || {}).reduce(
        (sum, c) => sum + (c.employees?.length || 0),
        0
      ),
      numHolidays: Object.values(state.companies || {}).reduce(
        (sum, c) => sum + (c.holidays?.length || 0),
        0
      ),
      manualScaleSize: Object.values(state.companies || {}).reduce(
        (sum, c) => sum + Object.keys(c.manualScale || {}).length,
        0
      ),
      updatedAt: state.firebaseLastSync || 0
    });

    return String(struct).length + "-" + struct.charCodeAt(0);
  }

  function startConflictDetection() {
    if (!window.AppData?.state) return;

    conflictCheckTimer = setInterval(() => {
      try {
        const currentHash = hashState(window.AppData.state);

        // Se o hash mudou, estado foi sincronizado
        if (lastStateHash && lastStateHash !== currentHash) {
          console.log("[SecurityOps] Mudança de estado detectada (sincronização)");
        }

        lastStateHash = currentHash;
      } catch (e) {
        console.warn("[SecurityOps] Erro ao verificar conflitos:", e.message);
      }
    }, CONFLICT_CHECK_INTERVAL_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORTAR API
  // ─────────────────────────────────────────────────────────────────────────

  window.SecurityOps = {
    initMultiTabDetection,
    requireConfirmation,
    checkPadroeiraBuziosHealth,
    startPadroeiraBuziosValidation,
    startConflictDetection,
    getSessionId: () => sessionId
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZAÇÃO AUTOMÁTICA
  // ─────────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      initMultiTabDetection();
      startPadroeiraBuziosValidation();
      startConflictDetection();
    }, 100);
  });

  // Fallback: inicializar se DOMContentLoaded já passou
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        initMultiTabDetection();
        startPadroeiraBuziosValidation();
        startConflictDetection();
      }, 100);
    });
  } else {
    setTimeout(() => {
      initMultiTabDetection();
      startPadroeiraBuziosValidation();
      startConflictDetection();
    }, 100);
  }
})();
