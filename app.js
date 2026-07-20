// --- Constantes y Utilidades ---
const ALPHABET = "ABCDEFGHIJLMNOPQRSTUV".split(""); // Sin W, X, Y, Z, K
const EMOJIS = ["😎", "🤖", "👽", "👻", "🤡", "🦊", "🐯", "🐶", "🐱", "🐵"];
const GAME_MODES = {
  hardcore: {
    label: "Hardcore",
    description: "Rondas rápidas: 10s, 5s y 2.5s.",
    roundTimes: [10, 5, 2.5],
  },
  normal: {
    label: "Normal",
    description: "Balanceado: 30s, 15s y 7.5s.",
    roundTimes: [30, 15, 7.5],
  },
  easy: {
    label: "Fácil",
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

function getRandomLetter() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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

    // Estado del Jugador Local
    this.myProfile = {
      name: "Player 1",
      emoji: EMOJIS[0],
      lives: 3,
      isReady: false,
    };
    this.opponentProfile = {
      name: "Player 2",
      emoji: EMOJIS[1],
      lives: 3,
      isReady: false,
    };

    // Estado de la Partida
    this.gameActive = false;
    this.turnCount = 1;
    this.activePlayer = "host"; // 'host' o 'guest'
    this.currentRound = 1;
    this.currentLetter = getRandomLetter();
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
      const response = await fetch("palabras.json");
      const words = await response.json();
      words.forEach((w) => this.dictionary.add(limpiarTexto(w)));
      console.log(`Diccionario cargado con ${this.dictionary.size} palabras.`);
    } catch (error) {
      console.error("Error al cargar diccionario:", error);
      // Fallback a un diccionario mínimo si falla la carga local
      this.dictionary = new Set(["arbol", "boca", "casa", "dedo", "elefante"]);
    }
  }

  initDOM() {
    // Vistas
    this.views = {
      home: document.getElementById("view-home"),
      lobby: document.getElementById("view-lobby"),
      profile: document.getElementById("view-profile"),
      countdown: document.getElementById("view-countdown"),
      game: document.getElementById("view-game"),
      gameover: document.getElementById("view-gameover"),
    };

    // Botones de navegación base
    document
      .getElementById("btn-host")
      .addEventListener("click", () => this.setupHost(this.gameMode));
    document
      .getElementById("btn-guest")
      .addEventListener("click", () => this.setupGuest());
    document.querySelector(".btn-back").addEventListener("click", () => {
      if (this.network) this.network.disconnect();
      this.showView("home");
    });

    // Lobby
    document
      .getElementById("btn-join")
      .addEventListener("click", () => this.joinRoom());

    document.querySelectorAll(".mode-option").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedMode = button.dataset.mode;
        this.gameMode = selectedMode;

        document.querySelectorAll(".mode-option").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
      });
    });

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
      if (nameInput) this.myProfile.name = nameInput;

      this.myProfile.isReady = true;
      document.getElementById("btn-ready").classList.add("hidden");
      document.getElementById("ready-status").classList.remove("hidden");

      this.network.send("PROFILE_READY", this.myProfile);
      this.checkBothReady();
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
  }

  showView(viewName) {
    Object.entries(this.views).forEach(([name, view]) => {
      const isActive = name === viewName;
      view.classList.toggle("active", isActive);
      view.classList.toggle("hidden", !isActive);
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
    this.myProfile.isReady = false;
    this.opponentProfile.isReady = false;
    this.myProfile.lives = 3;
    this.opponentProfile.lives = 3;

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
        colorDark: "#120E1F",
        colorLight: "#00E5FF",
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
    this.peerReady = this.network.init(); // Inicializa el peer sin ID específico

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
      case "CONNECTED":
        this.showView("profile");
        break;
      case "DISCONNECTED":
        alert("El oponente se ha desconectado.");
        location.reload();
        break;
      case "PROFILE_READY":
        this.opponentProfile.name = msg.payload.name;
        this.opponentProfile.emoji = msg.payload.emoji;
        this.opponentProfile.isReady = true;
        this.checkBothReady();
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

  // --- Flujo de Preparación ---
  checkBothReady() {
    if (this.myProfile.isReady && this.opponentProfile.isReady) {
      if (this.isHost) {
        // Host decide el estado inicial y lo envía
        const initialState = {
          mode: this.gameMode,
          round: 1,
          turnCount: 1,
          activePlayer: "host",
          currentLetter: this.currentLetter,
        };
        this.network.send("START_GAME", initialState);
        this.startGameSession(initialState);
      }
    }
  }

  startGameSession(state) {
    if (state.mode && GAME_MODES[state.mode]) {
      this.gameMode = state.mode;
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
    return (
      (this.isHost && this.activePlayer === "host") ||
      (!this.isHost && this.activePlayer === "guest")
    );
  }

  updateHeaderUI() {
    const p1 = this.isHost ? this.myProfile : this.opponentProfile;
    const p2 = this.isHost ? this.opponentProfile : this.myProfile;

    document.getElementById("p1-info").querySelector(".name").innerText =
      p1.name;
    document.getElementById("p1-info").querySelector(".emoji").innerText =
      p1.emoji;
    document.getElementById("p1-lives").innerText =
      "❤️".repeat(p1.lives) + "🖤".repeat(3 - p1.lives);

    document.getElementById("p2-info").querySelector(".name").innerText =
      p2.name;
    document.getElementById("p2-info").querySelector(".emoji").innerText =
      p2.emoji;
    document.getElementById("p2-lives").innerText =
      "❤️".repeat(p2.lives) + "🖤".repeat(3 - p2.lives);
  }

  startTurn() {
    const roundLabel = document.getElementById("round-label");
    const turnHint = document.getElementById("turn-hint");
    const targetLetter = document.getElementById("target-letter");

    roundLabel.innerText = `Ronda ${this.currentRound}`;
    targetLetter.innerText = this.currentLetter;

    const actionZone = document.getElementById("action-zone");
    const spectatorZone = document.getElementById("spectator-zone");

    const input = document.getElementById("word-input");
    input.value = "";
    document.getElementById("word-error").classList.add("hidden");
    document.body.classList.remove("flash-green");
    document.getElementById("turn-overlay").classList.add("hidden");

    if (this.amIActive()) {
      turnHint.innerText = "Escribe una palabra válida";
      actionZone.classList.remove("hidden");
      spectatorZone.classList.add("hidden");
      setTimeout(() => input.focus(), 100);
    } else {
      const activeName = this.getPlayerNameBySide(this.activePlayer);
      turnHint.innerText = `Le toca a ${activeName}`;
      actionZone.classList.add("hidden");
      spectatorZone.classList.remove("hidden");
      const oppName = this.opponentProfile.name;
      document.getElementById("active-player-name").innerText = oppName;
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

    // Solo el jugador activo lleva el timer real de lógica para evitar desincronizaciones dobles
    if (this.amIActive()) {
      if (this.timer) clearTimeout(this.timer);

      this.timer = setTimeout(() => {
        this.triggerBoom();
      }, duration * 1000);
    }
  }

  updateSpectatorTyping(text) {
    const liveBox = document.getElementById("live-typing");
    liveBox.innerText = text.length === 0 ? "Esperando..." : text;
  }

  verifyWord() {
    if (!this.amIActive()) return;

    const inputEl = document.getElementById("word-input");
    const rawWord = inputEl.value;
    const fullWord = limpiarTexto(rawWord);

    const errorEl = document.getElementById("word-error");

    // Validaciones
    if (fullWord === "") {
      errorEl.innerText = "Escribe algo.";
      errorEl.classList.remove("hidden");
      return;
    }

    if (!this.dictionary.has(fullWord)) {
      errorEl.innerText = "¡La palabra no existe en el diccionario!";
      errorEl.classList.remove("hidden");
      // Sacudir input
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

    // Efecto visual local
    document.body.classList.add("flash-green");

    // Registrar para historial
    const round = this.currentRound;
    let historyEntry = this.wordHistory.find((h) => h.round === round);
    if (!historyEntry) {
      historyEntry = {
        round,
        letter: `R${this.currentRound}`,
        hostWord: "",
        guestWord: "",
      };
      this.wordHistory.push(historyEntry);
    }
    if (this.isHost) historyEntry.hostWord = fullWord;
    else historyEntry.guestWord = fullWord;

    // Cambiar turno
    const nextPlayer = this.activePlayer === "host" ? "guest" : "host";
    const nextTurnCount = this.turnCount + 1;
    const nextRound = getRoundNumber(nextTurnCount);

    const nextState = {
      turnCount: nextTurnCount,
      round: nextRound,
      activePlayer: nextPlayer,
      lastWord: fullWord,
      history: this.wordHistory,
      mode: this.gameMode,
      currentLetter:
        nextRound > this.currentRound ? getRandomLetter() : this.currentLetter,
    };

    this.network.send("WORD_VALIDATED", nextState);
    this.showTurnChangeOverlay(nextState);

    setTimeout(() => {
      this.applyNextState(nextState);
    }, 3000);
  }

  handleOpponentSuccess(nextState) {
    // El oponente acertó
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
    if (side === "host")
      return this.isHost ? this.myProfile.name : this.opponentProfile.name;
    return this.isHost ? this.opponentProfile.name : this.myProfile.name;
  }

  showTurnChangeOverlay(nextState) {
    const overlay = document.getElementById("turn-overlay");
    const turnMessage = document.getElementById("turn-message");
    const turnDetail = document.getElementById("turn-detail");
    const nextPlayerName = this.getPlayerNameBySide(nextState.activePlayer);
    const nextRoundDuration = getRoundDuration(this.gameMode, nextState.round);

    overlay.classList.remove("hidden");

    if (nextState.round > this.currentRound) {
      turnMessage.innerText = `Cambio de ronda ${nextState.round}`;
      turnDetail.innerHTML = `Nuevo tiempo: ${formatSeconds(nextRoundDuration)}s por jugada. Sigue <strong>${nextPlayerName}</strong> en <span id="turn-countdown">3</span>...`;
    } else {
      turnMessage.innerText = `Sigue el turno de ${nextPlayerName}`;
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
    // Se acabó el tiempo
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    this.myProfile.lives--;
    this.updateHeaderUI();

    // Efecto de explosión
    const overlay = document.getElementById("boom-overlay");
    overlay.classList.remove("hidden");
    document.body.classList.add("shake");

    const nextTurnCount = this.turnCount + 1;
    const nextRound = getRoundNumber(nextTurnCount);
    const nextState = {
      turnCount: nextTurnCount,
      round: nextRound,
      activePlayer: this.activePlayer === "host" ? "guest" : "host",
      loser: this.isHost ? "host" : "guest",
      livesRemaining: this.myProfile.lives,
      mode: this.gameMode,
      currentLetter:
        nextRound > this.currentRound ? getRandomLetter() : this.currentLetter,
    };

    this.network.send("BOOM", nextState);

    setTimeout(() => {
      overlay.classList.add("hidden");
      document.body.classList.remove("shake");
      this.checkGameOverOrContinue(nextState);
    }, 2000);
  }

  handleBoom(nextState) {
    // El oponente perdió por tiempo
    if (this.timerDisplayInterval) {
      clearInterval(this.timerDisplayInterval);
      this.timerDisplayInterval = null;
    }
    this.opponentProfile.lives = nextState.livesRemaining;
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
    // Verificamos si alguien llegó a 0
    if (this.myProfile.lives <= 0 || this.opponentProfile.lives <= 0) {
      const winner =
        this.myProfile.lives > 0
          ? this.isHost
            ? "host"
            : "guest"
          : this.isHost
            ? "guest"
            : "host";

      // Solo el host envía el GAME_OVER para evitar duplicados
      if (this.isHost) {
        this.network.send("GAME_OVER", { winner, history: this.wordHistory });
      }
      this.showGameOver(winner);
    } else {
      this.applyNextState(nextState);
    }
  }

  applyNextState(nextState) {
    const previousRound = this.currentRound;
    this.turnCount = nextState.turnCount;
    this.activePlayer = nextState.activePlayer;
    this.currentRound = nextState.round || getRoundNumber(this.turnCount);
    this.currentLetter =
      nextState.currentLetter ||
      (this.currentRound > previousRound
        ? getRandomLetter()
        : this.currentLetter);
    if (nextState.history) this.wordHistory = nextState.history;
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

    const isMe =
      (winner === "host" && this.isHost) ||
      (winner === "guest" && !this.isHost);
    const winnerProfile = isMe ? this.myProfile : this.opponentProfile;

    document.getElementById("winner-emoji").innerText = winnerProfile.emoji;
    document.getElementById("winner-name").innerText = winnerProfile.name;

    // Construir historial
    const historyContainer = document.getElementById("word-history");
    historyContainer.innerHTML = "";

    this.wordHistory.forEach((round) => {
      const item = document.createElement("div");
      item.className = "accordion-item";

      item.innerHTML = `
                <div class="accordion-header">
                    Ronda ${round.round}
                    <span>▼</span>
                </div>
                <div class="accordion-content">
                    <div class="word-row">
                        <span class="player">${this.isHost ? this.myProfile.name : this.opponentProfile.name}:</span>
                        <span>${this.isHost ? round.hostWord || "BOOM 💥" : round.guestWord || "BOOM 💥"}</span>
                    </div>
                    <div class="word-row">
                        <span class="player">${this.isHost ? this.opponentProfile.name : this.myProfile.name}:</span>
                        <span>${this.isHost ? round.guestWord || "BOOM 💥" : round.hostWord || "BOOM 💥"}</span>
                    </div>
                </div>
            `;

      item.querySelector(".accordion-header").addEventListener("click", () => {
        item.classList.toggle("open");
      });

      historyContainer.appendChild(item);
    });

    this.showView("gameover");
  }

  resetGame(isReplay) {
    // Reset variables visuales
    document.getElementById("btn-ready").classList.remove("hidden");
    document.getElementById("ready-status").classList.add("hidden");
    this.myProfile.isReady = false;
    this.opponentProfile.isReady = false;

    if (isReplay) {
      this.showView("profile");
    }
  }
}

// Inicializar al cargar
window.addEventListener("DOMContentLoaded", () => {
  const game = new WordGame();
});
