// ==========================================
// MAIN APP ROUTER & INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  // Inicializar Tema Oscuro desde common.js
  initDarkMode();

  // Inicializar Juegos
  try {
    window.wordGame = new WordGame(); // Palabras Bomba
  } catch (e) {
    console.error("Error in WordGame:", e);
    alert("Error WordGame: " + e.message);
  }

  try {
    window.stopGame = new StopGame(); // Stop Bomba
  } catch (e) {
    console.error("Error in StopGame:", e);
  }

  // Navegación Menú Principal
  const btnGoPalabras = document.getElementById("btn-go-palabras");
  if (btnGoPalabras) {
    btnGoPalabras.addEventListener("click", () => {
      showAppView("palabras-config");
    });
  }

  const btnGoStop = document.getElementById("btn-go-stop");
  if (btnGoStop) {
    btnGoStop.addEventListener("click", () => {
      showAppView("stop-config");
    });
  }

  const btnsBackHome = document.querySelectorAll(".btn-back-home");
  btnsBackHome.forEach(btn => {
    btn.addEventListener("click", () => {
      // Al volver al home, deberíamos desconectar a ambos juegos por si acaso
      if (window.wordGame) window.wordGame.disconnectNetwork();
      if (window.stopGame) window.stopGame._disconnectNetwork();
      showAppView("home");
    });
  });

  // Lógica del menú global
  const btnGlobalMenu = document.getElementById("btn-global-menu");
  const globalMenuDropdown = document.getElementById("global-menu-dropdown");
  const btnGlobalHome = document.getElementById("btn-global-home");
  const btnGlobalExit = document.getElementById("btn-global-exit");

  if (btnGlobalMenu) {
    btnGlobalMenu.addEventListener("click", () => {
      globalMenuDropdown.classList.toggle("hidden");
    });
  }

  // Cerrar si hace clic fuera
  document.addEventListener("click", (e) => {
    if (btnGlobalMenu && !btnGlobalMenu.contains(e.target) && !globalMenuDropdown.contains(e.target)) {
      globalMenuDropdown.classList.add("hidden");
    }
  });

  const goGlobalHome = () => {
    if (globalMenuDropdown) globalMenuDropdown.classList.add("hidden");
    if (window.wordGame) {
      window.wordGame.disconnectNetwork();
      if (typeof window.wordGame.resetLocalGameState === 'function') {
        window.wordGame.resetLocalGameState();
      }
    }
    if (window.stopGame) {
      window.stopGame._disconnectNetwork();
      if (typeof window.stopGame._resetState === 'function') {
        window.stopGame._resetState();
      }
    }
    // Remover parámetros de la URL
    window.history.replaceState({}, document.title, window.location.pathname);
    showAppView("home");
  };

  if (btnGlobalHome) btnGlobalHome.addEventListener("click", goGlobalHome);
  if (btnGlobalExit) btnGlobalExit.addEventListener("click", () => {
    if (confirm("¿Seguro que quieres salir de la partida?")) {
      goGlobalHome();
    } else {
      globalMenuDropdown.classList.add("hidden");
    }
  });

  // Auto-join por URL (para STOP)
  const stopRoom = new URLSearchParams(window.location.search).get('stoproom');
  if (stopRoom && window.stopGame) {
    window.stopGame._setupGuest(stopRoom.trim().toUpperCase());
  }
});
