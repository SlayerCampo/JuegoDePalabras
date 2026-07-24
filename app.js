// ==========================================
// MAIN APP ROUTER & INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  // Inicializar Tema Oscuro desde common.js
  initDarkMode();

  // Inicializar Juegos
  window.wordGame = new WordGame(); // Palabras Bomba
  window.stopGame = new StopGame(); // Stop Bomba

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
});
