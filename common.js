// ==========================================
// COMMON GLOBALS AND UTILITIES
// ==========================================

const EMOJIS = ["😎", "🤖", "👽", "👻", "🤡", "🦊", "🐯", "🐶", "🐱", "🐵"];

// Sistema para manejar el cambio entre vistas (pantallas)
function showAppView(viewName) {
  const allViewIds = [
    'view-home',
    'view-palabras-config',
    'view-lobby',
    'view-profile',
    'view-countdown',
    'view-game',
    'view-gameover',
    'view-stop-config',
    'view-stop-lobby',
    'view-stop-profile',
    'view-stop-countdown',
    'view-stop-game',
    'view-stop-review',
    'view-stop-gameover'
  ];
  allViewIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === ('view-' + viewName) || id === viewName;
    el.classList.toggle('active', isActive);
    el.classList.toggle('hidden', !isActive);
  });
}

// --- Modo oscuro ---
function initDarkMode() {
  const saved = localStorage.getItem("palabraBomba_theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);

  const btnDarkMode = document.getElementById("btn-dark-mode");
  if (btnDarkMode) {
    // Evitar múltiples event listeners si se llama varias veces
    const newBtn = btnDarkMode.cloneNode(true);
    btnDarkMode.parentNode.replaceChild(newBtn, btnDarkMode);
    newBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("palabraBomba_theme", next);
    });
  }
}
