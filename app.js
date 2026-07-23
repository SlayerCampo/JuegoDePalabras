// --- Constantes y Utilidades ---
// Las letras disponibles se calculan dinámicamente del diccionario al cargarlo
let availableLetters = [];

const EMOJIS = ["😎", "🤖", "👽", "👻", "🤡", "🦊", "🐯", "🐶", "🐱", "🐵"];
const GAME_MODES = {
  hardcore: {
    label: "Hardcore 🔥",
    description: "Rondas rápidas: 10s, 5s y 2.5s.",
    roundTimes: [10, 5, 2.5],
  },
  normal: {
    label: "Normal ⚡",
    description: "Balanceado: 30s, 15s y 7.5s.",
    roundTimes: [30, 15, 7.5],
  },
  easy: {
    label: "Fácil 🌿",
    description: "Más relajado: 40s, 20s y 10s.",
    roundTimes: [40, 20, 10],
  },
};

function limpiarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// Genera una letra aleatoria de las disponibles en el diccionario cargado
// Evita repetir la letra actual si hay más opciones
function getRandomLetter(currentLetter = null) {
  if (availableLetters.length === 0) {
    // Fallback por si el diccionario aún no cargó
    const fallback = "ABCDEFGHIJLMNOPQRSTUV".split("");
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
  if (availableLetters.length === 1) return availableLetters[0];
  let pool = currentLetter
    ? availableLetters.filter((l) => l !== currentLetter)
    : availableLetters;
  if (pool.length === 0) pool = availableLetters;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRoundNumber(turnCount) {
  return Math.ceil(turnCount / 5);
}

function getModeConfig(mode) {
  return GAME_MODES[mode] || GAME_MODES.normal;
}

function getRoundDuration(mode, roundNumber) {
  const config = getModeConfig(mode);
  return config.roundTimes[
    Math.min(roundNumber - 1, config.roundTimes.length - 1)
  ];
}

function formatSeconds(seconds) {
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
}

// --- Modo oscuro ---
function initDarkMode() {
  const saved = localStorage.getItem("palabraBomba_theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);

  document.getElementById("btn-dark-mode").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("palabraBomba_theme", next);
  });
}

// --- Clase Principal del Juego ---
class WordGame {
  constructor() {
    this.dictionary = new Set();
    this.usedWords = new Set();
    this.network = null;
    this.isHost = false;
    this.gameMode = "normal";
    this.peerReady = null;
    this.joiningRoom = false;
    this.pendingRoomCode = null;
    this.exitCountdownTimer = null;
    this.timerDisplayInterval = null;

    // Estado de Jugadores (N jugadores)
    this.players = {
      host: {
        name: "Host",
        emoji: EMOJIS[0],
        lives: 3,
        isReady: false,
        id: "host"
      }
    };
    this.playerOrder = []; // Array of ids
    this.activePlayerIndex = 0; // Index in playerOrder

    // Estado de la Partida
    this.gameActive = false;
    this.turnCount = 1;
    this.currentRound = 1;
    this.currentLetter = getRandomLetter();
    this.letterMode = "por-ronda"; // 'por-ronda' | 'por-turno'
    this.timer = null;
    this.mechaAnimation = null;
    this.timeLeft = 0;
    this.wordHistory = []; // { letter, hostWord, guestWord, round }

    this.initDOM();
    this.loadDictionary();

    const roomFromUrl = new URLSearchParams(window.location.search).get("room");
    if (roomFromUrl) {
      this.pendingRoomCode = roomFromUrl.trim().toUpperCase();
      this.setupGuest(this.pendingRoomCode);
    }
  }

  async loadDictionary() {
    try {
      const response = await fetch("index.json");
      const words = await response.json();
      words.forEach((w) => this.dictionary.add(limpiarTexto(w)));
      console.log(`Diccionario cargado con ${this.dictionary.size} palabras.`);

      // Calcular las letras disponibles según el diccionario
      const lettersInDict = new Set();
      this.dictionary.forEach((word) => {
        if (word.length > 0) {
          lettersInDict.add(word[0].toUpperCase());
        }
      });
      availableLetters = Array.from(lettersInDict).sort();
      console.log(`Letras disponibles: ${availableLetters.join(", ")}`);

      // Actualizar la letra inicial con el diccionario ya cargado
      this.currentLetter = getRandomLetter();
    } catch (error) {
      console.error("Error al cargar diccionario:", error);
      this.dictionary = new Set(["arbol", "boca", "casa", "dedo", "elefante"]);
      availableLetters = ["A", "B", "C", "D", "E"];
    }
  }

  initDOM() {
    // Vistas
    this.views = {
      home: document.getElementById("view-home"),
      palabrasConfig: document.getElementById("view-palabras-config"),
      lobby: document.getElementById("view-lobby"),
      profile: document.getElementById("view-profile"),
      countdown: document.getElementById("view-countdown"),
      game: document.getElementById("view-game"),
      gameover: document.getElementById("view-gameover"),
    };

    // Configuración de rondas
    this.roundsCount = 3; // valor por defecto
    const roundsDisplay = document.getElementById("rounds-display");
    document.getElementById("btn-rounds-minus").addEventListener("click", () => {
      if (this.roundsCount > 1) {
        this.roundsCount--;
        roundsDisplay.innerText = this.roundsCount;
      }
    });
    document.getElementById("btn-rounds-plus").addEventListener("click", () => {
      if (this.roundsCount < 10) {
        this.roundsCount++;
        roundsDisplay.innerText = this.roundsCount;
      }
    });

    // Selección de DIFICULTAD (pills con data-mode)
    document.querySelectorAll(".mode-pill[data-mode]").forEach((pill) => {
      pill.addEventListener("click", () => {
        this.gameMode = pill.dataset.mode;
        document.querySelectorAll(".mode-pill[data-mode]").forEach((p) =>
          p.classList.remove("active")
        );
        pill.classList.add("active");
      });
    });

    // Selección de MODO DE LETRA (pills con data-letter-mode)
    document.querySelectorAll(".letter-pill[data-letter-mode]").forEach((pill) => {
      pill.addEventListener("click", () => {
        this.letterMode = pill.dataset.letterMode;
        document.querySelectorAll(".letter-pill[data-letter-mode]").forEach((p) =>
          p.classList.remove("active")
        );
        pill.classList.add("active");
        
        // Mostrar/ocultar config de rondas
        const roundsConfig = document.getElementById("rounds-config-container");
        if (this.letterMode === "por-ronda") {
          roundsConfig.style.display = "flex";
        } else {
          roundsConfig.style.display = "none";
        }
      });
    });

    // Navegación Menú Principal (Juegos Bomba)
    document.getElementById("btn-go-palabras").addEventListener("click", () => {
      this.showView("palabras-config");
    });
    document.getElementById("btn-go-stop").addEventListener("click", () => {
      this.showView("stop-config");
    });
    document.querySelector(".btn-back-home").addEventListener("click", () => {
      this.showView("home");
    });

    // Botones de red (Palabras Bomba)
    document
      .getElementById("btn-host-palabras")
      .addEventListener("click", () => this.setupHost(this.gameMode));
    document
      .getElementById("btn-guest-palabras")
      .addEventListener("click", () => this.setupGuest());
      
    document.querySelector(".btn-back").addEventListener("click", () => {
      if (this.network) this.network.disconnect();
      this.showView("palabras-config");
    });

    // Lobby
    document
      .getElementById("btn-join")
      .addEventListener("click", () => this.joinRoom());

    // Perfil
    const btnChangeEmoji = document.getElementById("btn-change-emoji");
    const currentEmoji = document.getElementById("current-emoji");
    let emojiIndex = 0;
    btnChangeEmoji.addEventListener("click", () => {
      emojiIndex = (emojiIndex + 1) % EMOJIS.length;
      this.myProfile.emoji = EMOJIS[emojiIndex];
      currentEmoji.innerText = this.myProfile.emoji;
    });

    document.getElementById("btn-ready").addEventListener("click", () => {
      const nameInput = document
        .getElementById("player-name-input")
        .value.trim();
      
      const myId = this.isHost ? "host" : this.network.myId;
      if (!this.players[myId]) {
        this.players[myId] = { id: myId, lives: 3 };
      }
      
      if (nameInput) this.players[myId].name = nameInput;
      this.players[myId].emoji = document.getElementById("current-emoji").innerText;
      this.players[myId].isReady = true;

      document.getElementById("btn-ready").classList.add("hidden");
      document.getElementById("ready-status").classList.remove("hidden");

      this.network.send("PROFILE_READY", this.players[myId]);
      
      if (this.isHost) {
        this.broadcastLobbyState();
        this.checkAllReady();
      }
    });

    // Host start lobby button
    document.getElementById("btn-start-lobby").addEventListener("click", () => {
       if (this.isHost) {
          this.network.send("GO_TO_PROFILE", {});
          this.showView("profile");
       }
    });

    // Juego
    const wordInput = document.getElementById("word-input");
    wordInput.addEventListener("input", (e) => {
      document.getElementById("word-error").classList.add("hidden");
      wordInput.parentElement.classList.remove("shake");
      if (this.amIActive()) {
        this.network.send("WORD_TYPED", e.target.value);
      }
    });

    wordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.verifyWord();
    });

    document
      .getElementById("btn-verify")
      .addEventListener("click", () => this.verifyWord());

    // Game Over
    document
      .getElementById("btn-replay")
      .addEventListener("click", () => this.resetGame(true));
    document.getElementById("btn-home").addEventListener("click", () => {
      this.goHome();
    });

    document
      .getElementById("btn-exit-game")
      .addEventListener("click", () => this.showExitModal());

    document
      .querySelector(".btn-profile-back")
      .addEventListener("click", () => this.goHome());

    document
      .getElementById("btn-cancel-exit")
      .addEventListener("click", () => this.hideExitModal());

    document
      .getElementById("btn-confirm-exit")
      .addEventListener("click", () => this.goHome());

    // Modal desconexión
    document
      .getElementById("btn-disconnect-ok")
      .addEventListener("click", () => {
        document.getElementById("disconnect-modal").classList.add("hidden");
        this.goHome();
      });
  }

  showView(viewName) {
    const allViewIds = [
      'view-home','view-palabras-config','view-lobby','view-profile','view-countdown',
      'view-game','view-gameover',
      'view-stop-config','view-stop-lobby','view-stop-profile',
      'view-stop-countdown','view-stop-game','view-stop-review',
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

  disconnectNetwork() {
    if (this.network) {
      this.network.disconnect();
      this.network = null;
    }
    this.peerReady = null;
    this.joiningRoom = false;
  }

  resetLocalGameState() {
    this.usedWords.clear();
    this.wordHistory = [];
    this.gameActive = false;
    this.turnCount = 1;
    this.activePlayer = "host";
    this.currentRound = 1;
    this.currentLetter = getRandomLetter();
    this.timer = null;
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    this.timeLeft = 0;
    
    // Resetear a solo yo
    const myId = this.isHost ? "host" : (this.network ? this.network.myId : "guest");
    this.players = {};
    this.players[myId] = {
      name: "Jugador",
      emoji: EMOJIS[0],
      lives: 3,
      isReady: false,
      id: myId
    };
    this.playerOrder = [];
    this.activePlayerIndex = 0;

    document.getElementById("btn-ready").classList.remove("hidden");
    document.getElementById("ready-status").classList.add("hidden");
    document.getElementById("join-error").classList.add("hidden");
    document.getElementById("room-code-input").value = "";
    document.getElementById("word-input").value = "";
    this.hideExitModal();
  }

  goHome() {
    this.disconnectNetwork();
    this.resetLocalGameState();
    this.pendingRoomCode = null;
    window.history.replaceState({}, document.title, window.location.pathname);
    this.showView("home");
  }

  showExitModal() {
    const modal = document.getElementById("exit-modal");
    const confirmButton = document.getElementById("btn-confirm-exit");
    const countdown = document.getElementById("exit-countdown");

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    confirmButton.disabled = true;

    let secondsLeft = 3;
    countdown.innerText = secondsLeft;

    if (this.exitCountdownTimer) {
      clearInterval(this.exitCountdownTimer);
    }

    this.exitCountdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        countdown.innerText = secondsLeft;
      } else {
        clearInterval(this.exitCountdownTimer);
        this.exitCountdownTimer = null;
        countdown.innerText = "0";
        confirmButton.disabled = false;
      }
    }, 1000);
  }

  hideExitModal() {
    const modal = document.getElementById("exit-modal");
    const confirmButton = document.getElementById("btn-confirm-exit");

    if (this.exitCountdownTimer) {
      clearInterval(this.exitCountdownTimer);
      this.exitCountdownTimer = null;
    }

    confirmButton.disabled = true;
    document.getElementById("exit-countdown").innerText = "3";
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  // ── MODAL BONITO de desconexión (reemplaza el alert nativo) ──
  showDisconnectModal() {
    const modal = document.getElementById("disconnect-modal");
    modal.classList.remove("hidden");
  }

  // --- Red ---
  setupHost(selectedMode = "normal") {
    this.disconnectNetwork();
    this.isHost = true;
    this.gameMode = selectedMode;
    this.activePlayer = "host";
    this.pendingRoomCode = null;
    this.showView("lobby");
    document.getElementById("lobby-host").classList.remove("hidden");
    document.getElementById("lobby-guest").classList.add("hidden");

    this.network = new PeerNetwork(true, this.handleNetworkMessage.bind(this));
    this.network.init().then((id) => {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.set("room", id);
      inviteUrl.searchParams.set("mode", this.gameMode);

      document.getElementById("room-code-display").innerText = id;
      document.querySelector(".loading-text").style.display = "block";

      // Generar QR
      document.getElementById("qr-container").innerHTML = "";
      new QRCode(document.getElementById("qr-container"), {
        text: inviteUrl.toString(),
        width: 128,
        height: 128,
        colorDark: "#3b0764",
        colorLight: "#ffffff",
      });
    });
  }

  setupGuest(autoJoinCode = null) {
    this.disconnectNetwork();
    this.isHost = false;
    const modeFromUrl = new URLSearchParams(window.location.search).get("mode");
    if (modeFromUrl && GAME_MODES[modeFromUrl]) {
      this.gameMode = modeFromUrl;
    }
    this.pendingRoomCode = autoJoinCode ? autoJoinCode.toUpperCase() : null;
    this.showView("lobby");
    document.getElementById("lobby-host").classList.add("hidden");
    document.getElementById("lobby-guest").classList.remove("hidden");
    document.getElementById("join-error").classList.add("hidden");

    this.network = new PeerNetwork(false, this.handleNetworkMessage.bind(this));
    this.peerReady = this.network.init();

    if (this.pendingRoomCode) {
      document.getElementById("room-code-input").value = this.pendingRoomCode;
      this.peerReady.then(() => this.joinRoom(this.pendingRoomCode));
    }
  }

  async joinRoom(codeOverride = null) {
    if (this.joiningRoom) return;

    const inputCode =
      codeOverride ?? document.getElementById("room-code-input").value;
    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) return;

    this.joiningRoom = true;
    document.getElementById("join-error").classList.add("hidden");

    if (this.peerReady) {
      try {
        await this.peerReady;
      } catch (err) {
        document.getElementById("join-error").classList.remove("hidden");
        this.joiningRoom = false;
        return;
      }
    }

    try {
      await this.network.joinRoom(code);
    } catch (err) {
      document.getElementById("join-error").classList.remove("hidden");
    } finally {
      this.joiningRoom = false;
    }
  }

  handleNetworkMessage(msg) {
    switch (msg.type) {
      case "CLIENT_CONNECTED": // Solo Host
        if (this.isHost && msg.payload) {
          const newPlayerId = msg.payload;
          this.players[newPlayerId] = {
            name: "Invitado",
            emoji: EMOJIS[1],
            lives: 3,
            isReady: false,
            id: newPlayerId
          };
          this.updateHostLobbyUI();
        }
        break;
      case "CLIENT_DISCONNECTED": // Solo Host
        if (this.isHost && msg.payload) {
          delete this.players[msg.payload];
          this.updateHostLobbyUI();
          this.broadcastLobbyState();
        }
        break;
      case "CONNECTED": // Solo Guest
        // Esperamos a que el host nos mande GO_TO_PROFILE o estado del lobby
        document.getElementById("join-error").classList.add("hidden");
        break;
      case "GO_TO_PROFILE": // Guest recibe orden de ir al perfil
        this.showView("profile");
        break;
      case "LOBBY_STATE": // Guest recibe estado de los jugadores listos
        this.players = msg.payload;
        this.updateReadyUI();
        break;
      case "DISCONNECTED":
        this.showDisconnectModal();
        break;
      case "PROFILE_READY": // Host recibe que alguien está listo
        if (this.isHost) {
          const senderId = msg._senderId || msg.payload.id;
          if (this.players[senderId]) {
            this.players[senderId].name = msg.payload.name;
            this.players[senderId].emoji = msg.payload.emoji;
            this.players[senderId].isReady = true;
          }
          this.broadcastLobbyState();
          this.updateReadyUI();
          this.checkAllReady();
        }
        break;
      case "START_GAME":
        this.startGameSession(msg.payload);
        break;
      case "WORD_TYPED":
        if (!this.amIActive()) {
          this.updateSpectatorTyping(msg.payload);
        }
        break;
      case "WORD_VALIDATED":
        this.handleOpponentSuccess(msg.payload);
        break;
      case "BOOM":
        this.handleBoom(msg.payload);
        break;
      case "GAME_OVER":
        this.showGameOver(msg.payload.winner);
        break;
    }
  }

  updateHostLobbyUI() {
    const list = document.getElementById("connected-players-list");
    const count = Object.keys(this.players).length;
    list.innerHTML = "";
    if (count > 1) {
      list.innerHTML = `Hay ${count} jugadores en la sala.`;
      document.getElementById("btn-start-lobby").classList.remove("hidden");
      document.getElementById("lobby-waiting-text").classList.add("hidden");
    } else {
      document.getElementById("btn-start-lobby").classList.add("hidden");
      document.getElementById("lobby-waiting-text").classList.remove("hidden");
    }
  }

  broadcastLobbyState() {
    if (this.isHost) {
      this.network.send("LOBBY_STATE", this.players);
    }
  }

  updateReadyUI() {
    const container = document.getElementById("ready-players-container");
    const list = document.getElementById("ready-players-list");
    container.classList.remove("hidden");
    list.innerHTML = "";
    
    Object.values(this.players).forEach(p => {
      const el = document.createElement("div");
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.gap = "10px";
      el.style.padding = "5px 10px";
      el.style.borderRadius = "8px";
      el.style.background = "var(--bg-card)";
      
      if (p.isReady) {
        el.style.opacity = "0.5";
        el.style.border = "1px solid var(--success)";
        el.innerHTML = `<span style="font-size:1.2rem;">${p.emoji}</span> <span style="flex:1;">${p.name}</span> <span style="color:var(--success);">✔ Listo</span>`;
      } else {
        el.style.border = "1px solid var(--border)";
        el.innerHTML = `<span style="font-size:1.2rem;">${p.emoji}</span> <span style="flex:1;">${p.name}</span> <span style="color:var(--text-muted);">Esperando...</span>`;
      }
      list.appendChild(el);
    });
  }

  // --- Flujo de Preparación ---
  checkAllReady() {
    if (!this.isHost) return;
    
    const allReady = Object.values(this.players).every(p => p.isReady);
    if (allReady && Object.keys(this.players).length >= 2) {
      // Orden aleatorio o el host primero
      this.playerOrder = Object.keys(this.players);
      this.activePlayerIndex = 0;
      
      const initialState = {
        mode: this.gameMode,
        letterMode: this.letterMode,
        round: 1,
        turnCount: 1,
        activePlayer: this.playerOrder[this.activePlayerIndex],
        playerOrder: this.playerOrder,
        players: this.players,
        currentLetter: this.currentLetter,
        roundsCount: this.roundsCount
      };
      
      this.network.send("START_GAME", initialState);
      this.startGameSession(initialState);
    }
  }

  startGameSession(state) {
    if (state.mode && GAME_MODES[state.mode]) {
      this.gameMode = state.mode;
    }
    if (state.letterMode) {
      this.letterMode = state.letterMode;
    }
    this.turnCount = state.turnCount;
    this.activePlayer = state.activePlayer;
    this.currentRound = state.round || getRoundNumber(this.turnCount);
    this.currentLetter = state.currentLetter || getRandomLetter();
    this.gameActive = true;
    this.usedWords.clear();
    this.wordHistory = [];
    this.myProfile.lives = 3;
    this.opponentProfile.lives = 3;
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }

    this.updateHeaderUI();

    // Cuenta regresiva
    this.showView("countdown");
    let count = 3;
    const countDisplay = document.getElementById("big-countdown");
    countDisplay.innerText = count;

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countDisplay.innerText = count;
        countDisplay.style.animation = "none";
        void countDisplay.offsetWidth; // trigger reflow
        countDisplay.style.animation = "popIn 1s ease";
      } else {
        clearInterval(interval);
        this.showView("game");
        this.startTurn();
      }
    }, 1000);
  }

  // --- Lógica de Juego ---
  amIActive() {
    const myId = this.isHost ? "host" : this.network.myId;
    return this.activePlayer === myId;
  }

  getPlayerNameById(id) {
    return this.players[id] ? this.players[id].name : "Desconocido";
  }

  updateHeaderUI() {
    const myId = this.isHost ? "host" : (this.network ? this.network.myId : "guest");
    const activePlayerId = this.activePlayer;
    
    const p1Container = document.getElementById("p1-info");
    const p2Container = document.getElementById("p2-info");
    const vsBadge = document.querySelector(".vs-badge");
    
    // Configurar p1 (siempre el jugador activo)
    const activeP = this.players[activePlayerId];
    if (activeP) {
      p1Container.querySelector(".name").innerText = activeP.name;
      p1Container.querySelector(".emoji").innerText = activeP.emoji;
      document.getElementById("p1-lives").innerText = "❤️".repeat(activeP.lives) + "🖤".repeat(3 - activeP.lives);
    }
    
    // Si yo soy el activo, solo me veo a mi
    if (myId === activePlayerId) {
       p2Container.style.display = "none";
       vsBadge.style.display = "none";
    } else {
       // Si yo no soy el activo, me veo a mi en p2
       p2Container.style.display = "flex";
       vsBadge.style.display = "block";
       
       const myP = this.players[myId];
       if (myP) {
          p2Container.querySelector(".name").innerText = myP.name;
          p2Container.querySelector(".emoji").innerText = myP.emoji;
          document.getElementById("p2-lives").innerText = "❤️".repeat(myP.lives) + "🖤".repeat(3 - myP.lives);
       }
    }
  }

  startTurn() {
    const roundLabel = document.getElementById("round-label");
    const turnHint = document.getElementById("turn-hint");
    const targetLetter = document.getElementById("target-letter");

    roundLabel.innerText = `Ronda ${this.currentRound}`;
    // ✅ FIX: Mostrar la letra actual correctamente (era "A" estático en el HTML)
    targetLetter.innerText = this.currentLetter;

    const actionZone = document.getElementById("action-zone");
    const spectatorZone = document.getElementById("spectator-zone");

    const input = document.getElementById("word-input");
    input.value = "";
    document.getElementById("word-error").classList.add("hidden");
    document.body.classList.remove("flash-green");
    document.getElementById("turn-overlay").classList.add("hidden");

    if (this.amIActive()) {
      turnHint.innerText = `Escribe una palabra con "${this.currentLetter}"`;
      actionZone.classList.remove("hidden");
      spectatorZone.classList.add("hidden");
      setTimeout(() => input.focus(), 100);
    } else {
      const activeName = this.getPlayerNameById(this.activePlayer);
      turnHint.innerText = `Le toca a ${activeName}`;
      actionZone.classList.add("hidden");
      spectatorZone.classList.remove("hidden");
      document.getElementById("active-player-name").innerText = activeName;
      this.updateSpectatorTyping("");
    }

    this.startTimer();
  }

  startTimer() {
    const duration = getRoundDuration(this.gameMode, this.currentRound);
    this.timeLeft = duration;

    const mecha = document.getElementById("mecha-bar");
    const spark = document.getElementById("mecha-spark");
    const timeRemaining = document.getElementById("time-remaining");

    // Reset visual mecha
    mecha.style.transition = "none";
    spark.style.transition = "none";
    mecha.style.transform = `scaleX(1)`;
    spark.style.right = `0%`;

    // Force reflow
    void mecha.offsetWidth;

    // Start animation
    mecha.style.transition = `transform ${duration}s linear`;
    spark.style.transition = `right ${duration}s linear`;

    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
    }

    const endTime = Date.now() + duration * 1000;
    const updateTimerDisplay = () => {
      const remaining = Math.max(0, (endTime - Date.now()) / 1000);
      timeRemaining.innerText = `${formatSeconds(remaining)}s`;
    };

    updateTimerDisplay();
    this.timerDisplayInterval = setInterval(updateTimerDisplay, 100);

    requestAnimationFrame(() => {
      mecha.style.transform = `scaleX(0)`;
      spark.style.right = `100%`;
    });

    // Solo el jugador activo lleva el timer real de lógica
    if (this.amIActive()) {
      if (this.timer) clearTimeout(this.timer);

      this.timer = setTimeout(() => {
        this.triggerBoom();
      }, duration * 1000);
    }
  }

  updateSpectatorTyping(text) {
    const liveBox = document.getElementById("live-typing");
    if (text.length === 0) {
      liveBox.innerHTML = `<span class="faded">Esperando...</span>`;
    } else {
      liveBox.innerText = text;
    }
  }

  verifyWord() {
    if (!this.amIActive()) return;

    const inputEl = document.getElementById("word-input");
    const rawWord = inputEl.value;
    const fullWord = limpiarTexto(rawWord);

    const errorEl = document.getElementById("word-error");

    if (fullWord === "") {
      errorEl.innerText = "Escribe algo.";
      errorEl.classList.remove("hidden");
      return;
    }

    // Validar que empiece con la letra actual
    const letraRequerida = limpiarTexto(this.currentLetter);
    if (!fullWord.startsWith(letraRequerida)) {
      errorEl.innerText = `¡La palabra debe empezar con "${this.currentLetter}"!`;
      errorEl.classList.remove("hidden");
      inputEl.parentElement.classList.add("shake");
      setTimeout(() => inputEl.parentElement.classList.remove("shake"), 500);
      return;
    }

    if (!this.dictionary.has(fullWord)) {
      errorEl.innerText = "¡La palabra no existe en el diccionario!";
      errorEl.classList.remove("hidden");
      inputEl.parentElement.classList.add("shake");
      setTimeout(() => inputEl.parentElement.classList.remove("shake"), 500);
      return;
    }

    if (this.usedWords.has(fullWord)) {
      errorEl.innerText = "¡La palabra ya fue usada!";
      errorEl.classList.remove("hidden");
      inputEl.parentElement.classList.add("shake");
      setTimeout(() => inputEl.parentElement.classList.remove("shake"), 500);
      return;
    }

    // ¡Acierto!
    errorEl.classList.add("hidden");
    clearTimeout(this.timer);
    this.timer = null;
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    this.usedWords.add(fullWord);

    document.body.classList.add("flash-green");

    // ✅ Guardar la jugada en el historial
    const round = this.currentRound;
    let historyEntry = this.wordHistory.find((h) => h.round === round && h.letter === this.currentLetter);
    if (!historyEntry) {
      historyEntry = {
        round,
        letter: this.currentLetter,
        words: {} // id -> word
      };
      this.wordHistory.push(historyEntry);
    }
    historyEntry.words[this.activePlayer] = fullWord;

    // Cambiar turno
    const nextPlayerIndex = (this.activePlayerIndex + 1) % this.playerOrder.length;
    const nextPlayer = this.playerOrder[nextPlayerIndex];
    const nextTurnCount = this.turnCount + 1;
    
    // Cálculo de rondas (2 turnos por jugador = 1 ronda)
    const playersCount = this.playerOrder.length;
    const turnsPerRound = playersCount * 2;
    const nextRound = Math.floor((nextTurnCount - 1) / turnsPerRound) + 1;

    const nextState = {
      turnCount: nextTurnCount,
      round: nextRound,
      activePlayer: nextPlayer,
      activePlayerIndex: nextPlayerIndex,
      lastWord: fullWord,
      history: this.wordHistory,
      mode: this.gameMode,
      letterMode: this.letterMode,
      // Cambio de letra
      currentLetter:
        this.letterMode === "por-turno"
          ? getRandomLetter(this.currentLetter)
          : nextRound > this.currentRound
            ? getRandomLetter(this.currentLetter)
            : this.currentLetter,
    };

    this.network.send("WORD_VALIDATED", nextState);
    this.showTurnChangeOverlay(nextState);

    setTimeout(() => {
      this.applyNextState(nextState);
    }, 3000);
  }

  handleOpponentSuccess(nextState) {
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    this.usedWords.add(nextState.lastWord);
    this.wordHistory = nextState.history;
    this.showTurnChangeOverlay(nextState);
    setTimeout(() => {
      this.applyNextState(nextState);
    }, 3000);
  }

  getPlayerNameBySide(side) {
    return this.getPlayerNameById(side);
  }

  showTurnChangeOverlay(nextState) {
    const overlay = document.getElementById("turn-overlay");
    const turnMessage = document.getElementById("turn-message");
    const turnDetail = document.getElementById("turn-detail");
    const nextPlayerName = this.getPlayerNameBySide(nextState.activePlayer);
    const nextRoundDuration = getRoundDuration(this.gameMode, nextState.round);

    overlay.classList.remove("hidden");

    if (nextState.round > this.currentRound) {
      turnMessage.innerText = `✨ Ronda ${nextState.round}`;
      turnDetail.innerHTML = `Nuevo tiempo: <strong>${formatSeconds(nextRoundDuration)}s</strong>. Sigue <strong>${nextPlayerName}</strong> en <span id="turn-countdown">3</span>...`;
    } else {
      turnMessage.innerText = `👉 Turno de ${nextPlayerName}`;
      turnDetail.innerHTML = `Comienza en <span id="turn-countdown">3</span>...`;
    }

    const countSpan = document.getElementById("turn-countdown");
    let count = 3;
    countSpan.innerText = count;

    const intv = setInterval(() => {
      count--;
      if (count > 0) {
        countSpan.innerText = count;
      } else {
        clearInterval(intv);
        overlay.classList.add("hidden");
      }
    }, 1000);
  }

  triggerBoom() {
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    const myId = this.isHost ? "host" : this.network.myId;
    this.players[myId].lives--;
    this.updateHeaderUI();

    const overlay = document.getElementById("boom-overlay");
    overlay.classList.remove("hidden");
    document.body.classList.add("shake");

    // Guardar BOOM en el historial
    const round = this.currentRound;
    let historyEntry = this.wordHistory.find((h) => h.round === round && h.letter === this.currentLetter);
    if (!historyEntry) {
      historyEntry = { round, letter: this.currentLetter, words: {} };
      this.wordHistory.push(historyEntry);
    }
    historyEntry.words[myId] = "💥 BOOM";

    const nextTurnCount = this.turnCount + 1;
    const playersCount = this.playerOrder.length;
    const turnsPerRound = playersCount * 2;
    const nextRound = Math.floor((nextTurnCount - 1) / turnsPerRound) + 1;
    
    const nextPlayerIndex = (this.activePlayerIndex + 1) % this.playerOrder.length;

    const nextState = {
      turnCount: nextTurnCount,
      round: nextRound,
      activePlayer: this.playerOrder[nextPlayerIndex],
      activePlayerIndex: nextPlayerIndex,
      loser: myId,
      livesRemaining: this.players[myId].lives,
      history: this.wordHistory,
      mode: this.gameMode,
      letterMode: this.letterMode,
      currentLetter:
        this.letterMode === "por-turno"
          ? getRandomLetter(this.currentLetter)
          : nextRound > this.currentRound
            ? getRandomLetter(this.currentLetter)
            : this.currentLetter,
    };

    this.network.send("BOOM", nextState);

    setTimeout(() => {
      overlay.classList.add("hidden");
      document.body.classList.remove("shake");
      this.checkGameOverOrContinue(nextState);
    }, 2000);
  }

  handleBoom(nextState) {
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    if (nextState.loser && this.players[nextState.loser]) {
      this.players[nextState.loser].lives = nextState.livesRemaining;
    }
    this.wordHistory = nextState.history;
    this.updateHeaderUI();

    const overlay = document.getElementById("boom-overlay");
    overlay.classList.remove("hidden");
    document.body.classList.add("shake");

    setTimeout(() => {
      overlay.classList.add("hidden");
      document.body.classList.remove("shake");
      this.checkGameOverOrContinue(nextState);
    }, 2000);
  }

  checkGameOverOrContinue(nextState) {
    const deadPlayer = Object.values(this.players).find(p => p.lives <= 0);
    if (deadPlayer) {
      // Encuentra el ganador (el de más vidas)
      let winner = null;
      let maxLives = -1;
      Object.values(this.players).forEach(p => {
         if (p.lives > maxLives) {
            maxLives = p.lives;
            winner = p.id;
         }
      });
      if (this.isHost) {
        this.network.send("GAME_OVER", { winner, history: this.wordHistory });
      }
      this.showGameOver(winner);
    } else {
      this.applyNextState(nextState);
    }
  }

  applyNextState(nextState) {
    this.turnCount = nextState.turnCount;
    this.activePlayer = nextState.activePlayer;
    if (nextState.activePlayerIndex !== undefined) {
      this.activePlayerIndex = nextState.activePlayerIndex;
    }
    if (nextState.playerOrder) {
      this.playerOrder = nextState.playerOrder;
    }
    this.currentRound = nextState.round;
    this.currentLetter = nextState.currentLetter;
    if (nextState.letterMode) this.letterMode = nextState.letterMode;
    if (nextState.history) this.wordHistory = nextState.history;
    if (nextState.players) this.players = nextState.players;
    this.updateHeaderUI();
    this.startTurn();
  }

  showGameOver(winner) {
    this.gameActive = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }

    const winnerProfile = this.players[winner] || { name: "Desconocido", emoji: "🏆" };

    document.getElementById("winner-emoji").innerText = winnerProfile.emoji;
    document.getElementById("winner-name").innerText = winnerProfile.name;

    // Construir historial
    const historyContainer = document.getElementById("word-history");
    historyContainer.innerHTML = "";

    if (this.wordHistory.length === 0) {
      historyContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:0.9rem;font-family:var(--font-body);">No hay palabras registradas.</p>`;
    } else {
      this.wordHistory.forEach((round, index) => {
        const item = document.createElement("div");
        item.className = "accordion-item";

        const letterBadge = round.letter
          ? `<span style="
              background:linear-gradient(135deg,var(--primary),var(--accent));
              color:white;
              font-size:0.75rem;
              font-weight:900;
              padding:0.15rem 0.5rem;
              border-radius:8px;
              margin-left:0.5rem;
              vertical-align:middle;
            ">${round.letter}</span>`
          : "";

        let wordsHTML = "";
        Object.entries(round.words).forEach(([playerId, word]) => {
           const pName = this.getPlayerNameById(playerId);
           wordsHTML += `
            <div class="word-row">
              <span class="player">${pName}:</span>
              <span>${word}</span>
            </div>
           `;
        });

        item.innerHTML = `
          <div class="accordion-header">
            <span>Turno ${index + 1} (Ronda ${round.round}) ${letterBadge}</span>
            <span style="color:var(--text-muted);font-size:0.85rem;">▼</span>
          </div>
          <div class="accordion-content">
            ${wordsHTML}
          </div>
        `;

        item.querySelector(".accordion-header").addEventListener("click", () => {
          item.classList.toggle("open");
        });

        historyContainer.appendChild(item);
      });
    }

    this.showView("gameover");
  }

  resetGame(isReplay) {
    document.getElementById("btn-ready").classList.remove("hidden");
    document.getElementById("ready-status").classList.add("hidden");
    Object.values(this.players).forEach(p => p.isReady = false);

    if (isReplay) {
      this.showView("profile");
    }
  }
}

// Inicializar al cargar
window.addEventListener("DOMContentLoaded", () => {
  initDarkMode();
  const game = new WordGame();
});
