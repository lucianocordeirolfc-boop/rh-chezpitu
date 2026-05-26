(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyD2Bw5TO_Q4fpvjdFwDGnJkiMenutGOFbM",
    authDomain: "chez-pitu-rh.firebaseapp.com",
    databaseURL: "https://chez-pitu-rh-default-rtdb.firebaseio.com",
    projectId: "chez-pitu-rh",
    storageBucket: "chez-pitu-rh.firebasestorage.app",
    messagingSenderId: "41458783289",
    appId: "1:41458783289:web:d2ac81b4e0b87fbc3ce9e8"
  };

  if (window.firebase && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  let currentUser = null;
  let onLoginCallback = null;

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return currentUser !== null;
  }

  function showLogin() {
    const loginScreen = document.getElementById("loginScreen");
    const sidebar = document.querySelector(".sidebar");
    const appShell = document.querySelector(".app-shell");
    const toast = document.getElementById("toastContainer");

    if (loginScreen) loginScreen.hidden = false;
    if (sidebar) sidebar.hidden = true;
    if (appShell) appShell.hidden = true;
    if (toast) toast.hidden = true;
  }

  function showApp() {
    const loginScreen = document.getElementById("loginScreen");
    const sidebar = document.querySelector(".sidebar");
    const appShell = document.querySelector(".app-shell");
    const toast = document.getElementById("toastContainer");

    if (loginScreen) loginScreen.hidden = true;
    if (sidebar) sidebar.hidden = false;
    if (appShell) appShell.hidden = false;
    if (toast) toast.hidden = false;

    const userLabel = document.getElementById("loggedUserLabel");
    if (userLabel && currentUser) {
      userLabel.textContent = currentUser.email;
    }
  }

  function clearLoginForm() {
    const form = document.getElementById("loginForm");
    const errorEl = document.getElementById("loginError");
    if (form) form.reset();
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  }

  function showLoginError(message) {
    const errorEl = document.getElementById("loginError");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function translateError(code, originalMessage) {
    const messages = {
      "auth/invalid-email": "E-mail inválido.",
      "auth/user-disabled": "Usuário desativado. Contate o administrador.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
      "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
      "auth/unauthorized-domain": "Domínio não autorizado. Adicione este domínio nas configurações do Firebase Authentication.",
      "auth/operation-not-allowed": "Login por e-mail/senha não está habilitado. Ative no Firebase Console > Authentication > Sign-in method."
    };
    return messages[code] || ("Erro: " + (code || originalMessage || "Tente novamente."));
  }

  function login(email, password) {
    const btn = document.getElementById("loginButton");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Entrando…";
    }

    return auth
      .signInWithEmailAndPassword(email, password)
      .then((credential) => {
        clearLoginForm();
        return credential.user;
      })
      .catch((error) => {
        console.error("[Auth] Login error:", error.code, error.message);
        showLoginError(translateError(error.code, error.message));
        throw error;
      })
      .finally(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Entrar";
        }
      });
  }

  function logout() {
    return auth.signOut();
  }

  function onLogin(callback) {
    onLoginCallback = callback;
  }

  function bindUI() {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        if (!email || !password) return;
        login(email, password).catch(() => {});
      });
    }

    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        logout();
      });
    }
  }

  auth.onAuthStateChanged((user) => {
    currentUser = user;

    if (user) {
      showApp();
      if (typeof onLoginCallback === "function") {
        onLoginCallback(user);
      }
    } else {
      showLogin();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }

  window.AppAuth = {
    getUser,
    isLoggedIn,
    login,
    logout,
    onLogin
  };
})();
