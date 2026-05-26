(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyD2Bw5TO-Q4fpvjdFwDGnJkiMenutGOFbM",
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
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  let currentUser = null;
  let onLoginCallback = null;

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return currentUser !== null;
  }

  function hide(el) { if (el) el.style.display = "none"; }
  function show(el, type) { if (el) el.style.display = type || ""; }

  function showLogin() {
    hide(document.querySelector(".sidebar"));
    hide(document.querySelector(".app-shell"));
    hide(document.getElementById("toastContainer"));
    show(document.getElementById("loginScreen"), "flex");
  }

  function showApp() {
    hide(document.getElementById("loginScreen"));
    show(document.querySelector(".sidebar"));
    show(document.querySelector(".app-shell"));
    show(document.getElementById("toastContainer"));

    var userLabel = document.getElementById("loggedUserLabel");
    if (userLabel && currentUser) {
      userLabel.textContent = currentUser.email;
    }
  }

  function clearLoginForm() {
    var form = document.getElementById("loginForm");
    var errorEl = document.getElementById("loginError");
    if (form) form.reset();
    if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }
  }

  function showLoginError(message) {
    var errorEl = document.getElementById("loginError");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }

  function translateError(code, msg) {
    var m = {
      "auth/invalid-email": "E-mail inválido.",
      "auth/user-disabled": "Usuário desativado. Contate o administrador.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
      "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
      "auth/unauthorized-domain": "Domínio não autorizado no Firebase.",
      "auth/operation-not-allowed": "Login por e-mail/senha não habilitado no Firebase."
    };
    return m[code] || ("Erro: " + (code || msg || "Tente novamente."));
  }

  function login(email, password) {
    var btn = document.getElementById("loginButton");
    if (btn) { btn.disabled = true; btn.textContent = "Entrando…"; }

    return auth
      .signInWithEmailAndPassword(email, password)
      .then(function (credential) {
        clearLoginForm();
        return credential.user;
      })
      .catch(function (error) {
        console.error("[Auth] Login error:", error.code, error.message);
        showLoginError(translateError(error.code, error.message));
        throw error;
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
      });
  }

  function logout() {
    return auth.signOut();
  }

  function onLogin(callback) {
    onLoginCallback = callback;
  }

  function bindUI() {
    var loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = document.getElementById("loginEmail").value.trim();
        var pw = document.getElementById("loginPassword").value;
        if (!email || !pw) return;
        login(email, pw).catch(function () {});
      });
    }

    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () { logout(); });
    }
  }

  auth.onAuthStateChanged(function (user) {
    currentUser = user;
    if (user) {
      console.log("[Auth] Usuário autenticado:", user.email);
      showApp();
      try {
        if (typeof onLoginCallback === "function") onLoginCallback(user);
      } catch (e) {
        console.error("[Auth] Erro callback:", e);
      }
    } else {
      console.log("[Auth] Sem usuário");
      showLogin();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }

  window.AppAuth = { getUser: getUser, isLoggedIn: isLoggedIn, login: login, logout: logout, onLogin: onLogin };
})();
