// --- Constantes y Utilidades ---
const ALPHABET = "ABCDEFGHIJLMNOPQRSTUV".split(""); // Sin W, X, Y, Z, K
const EMOJIS = ["😎", "🤖", "👽", "👻", "🤡", "🦊", "🐯", "🐶", "🐱", "🐵"];

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

function getTurnDuration(turnCount) {
  // 1 ronda = 2 turnos (1 por jugador)
  // Ronda 1-5 (turnos 1-10): 60s
  // Ronda 6-10 (turnos 11-20): 30s
  // Ronda 11-15 (turnos 21-30): 15s
  // Ronda 16+ (turnos 31+): 7s
  if (turnCount <= 10) return 60;
  if (turnCount <= 20) return 30;
  if (turnCount <= 30) return 15;
  return 7;
}

// --- Clase Principal del Juego ---
class WordGame {
  constructor() {
    this.dictionary = new Set();
    this.usedWords = new Set();
    this.network = null;
    this.isHost = false;

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
    this.targetLetter = "A";
    this.timer = null;
    this.mechaAnimation = null;
    this.timeLeft = 0;
    this.wordHistory = []; // { letter, hostWord, guestWord, round }

    this.initDOM();
    this.loadDictionary();
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
      .addEventListener("click", () => this.setupHost());
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
      if (this.network) this.network.disconnect();
      location.reload();
    });
  }

  showView(viewName) {
    Object.entries(this.views).forEach(([name, view]) => {
      const isActive = name === viewName;
      view.classList.toggle("active", isActive);
      view.classList.toggle("hidden", !isActive);
    });
  }

  // --- Red ---
  setupHost() {
    this.isHost = true;
    this.activePlayer = "host";
    this.showView("lobby");
    document.getElementById("lobby-host").classList.remove("hidden");
    document.getElementById("lobby-guest").classList.add("hidden");

    this.network = new PeerNetwork(true, this.handleNetworkMessage.bind(this));
    this.network.init().then((id) => {
      document.getElementById("room-code-display").innerText = id;
      document.querySelector(".loading-text").style.display = "block";

      // Generar QR
      document.getElementById("qr-container").innerHTML = "";
      new QRCode(document.getElementById("qr-container"), {
        text: id,
        width: 128,
        height: 128,
        colorDark: "#120E1F",
        colorLight: "#00E5FF",
      });
    });
  }

  setupGuest() {
    this.isHost = false;
    this.showView("lobby");
    document.getElementById("lobby-host").classList.add("hidden");
    document.getElementById("lobby-guest").classList.remove("hidden");
    document.getElementById("join-error").classList.add("hidden");

    this.network = new PeerNetwork(false, this.handleNetworkMessage.bind(this));
    this.peerReady = this.network.init(); // Inicializa el peer sin ID específico
  }

  async joinRoom() {
    const code = document.getElementById("room-code-input").value.trim();
    if (code.length !== 4) return;

    if (this.peerReady) {
      try {
        await this.peerReady;
      } catch (err) {
        document.getElementById("join-error").classList.remove("hidden");
        return;
      }
    }

    this.network.joinRoom(code).catch((err) => {
      document.getElementById("join-error").classList.remove("hidden");
    });
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
          targetLetter: getRandomLetter(),
          turnCount: 1,
          activePlayer: "host",
        };
        this.network.send("START_GAME", initialState);
        this.startGameSession(initialState);
      }
    }
  }

  startGameSession(state) {
    this.targetLetter = state.targetLetter;
    this.turnCount = state.turnCount;
    this.activePlayer = state.activePlayer;
    this.gameActive = true;
    this.usedWords.clear();
    this.wordHistory = [];
    this.myProfile.lives = 3;
    this.opponentProfile.lives = 3;

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
    document.getElementById("target-letter").innerText = this.targetLetter;
    document.getElementById("instruction-letter").innerText = this.targetLetter;
    document.getElementById("fixed-letter").innerText = this.targetLetter;

    const actionZone = document.getElementById("action-zone");
    const spectatorZone = document.getElementById("spectator-zone");

    const input = document.getElementById("word-input");
    input.value = "";
    document.getElementById("word-error").classList.add("hidden");
    document.body.classList.remove("flash-green");
    document.getElementById("turn-overlay").classList.add("hidden");

    if (this.amIActive()) {
      actionZone.classList.remove("hidden");
      spectatorZone.classList.add("hidden");
      setTimeout(() => input.focus(), 100);
    } else {
      actionZone.classList.add("hidden");
      spectatorZone.classList.remove("hidden");
      const oppName = this.opponentProfile.name;
      document.getElementById("active-player-name").innerText = oppName;
      this.updateSpectatorTyping("");
    }

    this.startTimer();
  }

  startTimer() {
    const duration = getTurnDuration(this.turnCount);
    this.timeLeft = duration;

    const mecha = document.getElementById("mecha-bar");
    const spark = document.getElementById("mecha-spark");

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
    if (text.length === 0) {
      liveBox.innerHTML = `${this.targetLetter}<span class="faded">...</span>`;
    } else {
      liveBox.innerHTML = `${this.targetLetter}${text}`;
    }
  }

  verifyWord() {
    if (!this.amIActive()) return;

    const inputEl = document.getElementById("word-input");
    const rawWord = inputEl.value;
    const fullWord = limpiarTexto(this.targetLetter + rawWord);

    const errorEl = document.getElementById("word-error");

    // Validaciones
    if (rawWord.trim() === "") {
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
    this.usedWords.add(fullWord);

    // Efecto visual local
    document.body.classList.add("flash-green");

    // Registrar para historial
    const round = Math.ceil(this.turnCount / 2);
    let historyEntry = this.wordHistory.find((h) => h.round === round);
    if (!historyEntry) {
      historyEntry = {
        round,
        letter: this.targetLetter,
        hostWord: "",
        guestWord: "",
      };
      this.wordHistory.push(historyEntry);
    }
    if (this.isHost) historyEntry.hostWord = fullWord;
    else historyEntry.guestWord = fullWord;

    // Cambiar turno
    const nextLetter = getRandomLetter();
    const nextPlayer = this.activePlayer === "host" ? "guest" : "host";

    const nextState = {
      targetLetter: nextLetter,
      turnCount: this.turnCount + 1,
      activePlayer: nextPlayer,
      lastWord: fullWord,
      history: this.wordHistory,
    };

    this.network.send("WORD_VALIDATED", nextState);
    this.showTurnChangeOverlay();

    setTimeout(() => {
      this.applyNextState(nextState);
    }, 3000);
  }

  handleOpponentSuccess(nextState) {
    // El oponente acertó
    this.usedWords.add(nextState.lastWord);
    this.wordHistory = nextState.history;
    this.showTurnChangeOverlay();
    setTimeout(() => {
      this.applyNextState(nextState);
    }, 3000);
  }

  showTurnChangeOverlay() {
    const overlay = document.getElementById("turn-overlay");
    const countSpan = document.getElementById("turn-countdown");
    overlay.classList.remove("hidden");

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
    this.myProfile.lives--;
    this.updateHeaderUI();

    // Efecto de explosión
    const overlay = document.getElementById("boom-overlay");
    overlay.classList.remove("hidden");
    document.body.classList.add("shake");

    const nextState = {
      targetLetter: getRandomLetter(),
      turnCount: this.turnCount + 1,
      activePlayer: this.activePlayer === "host" ? "guest" : "host",
      loser: this.isHost ? "host" : "guest",
      livesRemaining: this.myProfile.lives,
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
    this.targetLetter = nextState.targetLetter;
    this.turnCount = nextState.turnCount;
    this.activePlayer = nextState.activePlayer;
    if (nextState.history) this.wordHistory = nextState.history;
    this.updateHeaderUI();
    this.startTurn();
  }

  showGameOver(winner) {
    this.gameActive = false;
    if (this.timer) clearTimeout(this.timer);

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
                    Ronda ${round.round} - Letra [${round.letter}]
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
