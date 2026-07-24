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

  // Auto-join por URL (para STOP)
  const stopRoom = new URLSearchParams(window.location.search).get('stoproom');
  if (stopRoom && window.stopGame) {
    window.stopGame._setupGuest(stopRoom.trim().toUpperCase());
  }
});
