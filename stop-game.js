// ═══════════════════════════════════════════════
//  STOP BOMBA — Lógica completa del juego
// ═══════════════════════════════════════════════

const STOP_CATEGORIES = {
  nombres:  { label: 'Nombres',   emoji: '👤' },
  apellidos:{ label: 'Apellidos', emoji: '🏷️' },
  objetos:  { label: 'Objetos',   emoji: '📦' },
  animales: { label: 'Animales',  emoji: '🐾' },
  colores:  { label: 'Colores',   emoji: '🎨' },
  ciudad:   { label: 'Ciudad',    emoji: '🏙️' },
  pais:     { label: 'País',      emoji: '🌍' },
  fruta:    { label: 'Fruta',     emoji: '🍎' },
};

const STOP_LETTERS = 'ABCDEFGHIJLMNOPRSTUVZ'.split('');
const TOTAL_ROUNDS = 5;
const STOP_EMOJIS = ["😎", "🤖", "👽", "👻", "🤡", "🦊", "🐯", "🐶", "🐱", "🐵"];

// ── Clase principal StopGame ──────────────────────
class StopGame {
  constructor() {
    this.network        = null;
    this.isHost         = false;
    this.joiningRoom    = false;
    this.peerReady      = null;

    // Configuración de partida
    this.selectedCats   = [];   // ['nombres','animales',...]
    this.currentLetter  = 'A';
    this.currentRound   = 1;
    this.roundMinutes   = 5;

    // Estado N-jugadores
    this.players = {
      host: { name: 'Host', emoji: '😎', isReady: false, id: 'host', score: 0 }
    };

    // Respuestas y Votos
    this.allAnswers     = {};   // { round: { peerId: { cat: word } } }
    this.allVotes       = {};   // { round: { cat: { peerId: { voterId: 'valid'|'invalid'|'repeated' } } } }

    // Estados de UI
    this.reviewDone     = false; // si ya terminé de votar en esta ronda
    this.stopTriggeredBy = null; // id de quien dio STOP (o 'time')
    this.myProfile      = { name: '', emoji: '😎', isReady: false };

    this.initDOM();
  }

  // ── Init DOM ──────────────────────────────────
  initDOM() {
    // Todas las vistas de la app (para mostrar/ocultar)
    this.allViews = [
      'view-home','view-lobby','view-profile','view-countdown',
      'view-game','view-gameover',
      'view-stop-config','view-stop-lobby','view-stop-profile',
      'view-stop-countdown','view-stop-game','view-stop-review',
      'view-stop-gameover'
    ];

    // ── Home: ir a config STOP ──
    document.getElementById('btn-go-stop').addEventListener('click', () => {
      this.showView('view-stop-config');
    });

    // ── Config STOP ──
    document.querySelectorAll('.stop-cat-toggle').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    document.getElementById('btn-stop-config-back').addEventListener('click', () => {
      this.showView('view-home');
    });

    // ── Tiempo Config (Eliminado, fijo a 5 mins) ──
    
    document.getElementById('btn-stop-host').addEventListener('click', () => {
      const cats = this._getSelectedCats();
      if (cats.length < 2) {
        document.getElementById('stop-cat-warning').classList.remove('hidden');
        return;
      }
      document.getElementById('stop-cat-warning').classList.add('hidden');
      this.selectedCats = cats;
      this._setupHost();
    });

    document.getElementById('btn-stop-guest').addEventListener('click', () => {
      const cats = this._getSelectedCats();
      if (cats.length < 2) {
        document.getElementById('stop-cat-warning').classList.remove('hidden');
        return;
      }
      document.getElementById('stop-cat-warning').classList.add('hidden');
      this.selectedCats = cats;
      this._setupGuest();
    });

    // ── Lobby STOP ──
    document.getElementById('btn-stop-join').addEventListener('click', () => this._joinRoom());
    document.getElementById('btn-stop-lobby-back').addEventListener('click', () => {
      this._disconnectNetwork();
      this.showView('view-stop-config');
    });

    // ── Perfil STOP ──
    let stopEmojiIdx = 0;
    document.getElementById('btn-stop-change-emoji').addEventListener('click', () => {
      stopEmojiIdx = (stopEmojiIdx + 1) % STOP_EMOJIS.length;
      this.myProfile.emoji = STOP_EMOJIS[stopEmojiIdx];
      document.getElementById('stop-current-emoji').innerText = this.myProfile.emoji;
    });

    document.getElementById('stop-player-name-input').addEventListener('input', (e) => {
      document.getElementById('btn-stop-ready').disabled = e.target.value.trim().length === 0;
    });

    document.getElementById('btn-stop-ready').addEventListener('click', () => {
      const name = document.getElementById('stop-player-name-input').value.trim();
      if (name) this.myProfile.name = name;
      this.myProfile.isReady = true;
      document.getElementById('btn-stop-ready').classList.add('hidden');
      document.getElementById('stop-ready-status').classList.remove('hidden');
      
      const myId = this.isHost ? "host" : this.network.myId;
      this.myProfile.id = myId;
      
      if (this.isHost) {
        if (this.players[myId]) {
           this.players[myId].name = this.myProfile.name;
           this.players[myId].emoji = this.myProfile.emoji;
           this.players[myId].isReady = true;
        }
        this._broadcastLobbyState();
        this._updateReadyUI();
        this._checkAllReady();
      } else {
        this.network.send('STOP_PROFILE_READY', this.myProfile);
      }
    });

    document.querySelector('.btn-stop-profile-back').addEventListener('click', () => {
      this._disconnectNetwork();
      this.showView('view-stop-lobby');
    });

    // ── Iniciar sala (Host) ──
    document.getElementById('btn-start-stop-lobby').addEventListener('click', () => {
      this.network.send('GO_TO_PROFILE', {});
      this._resetProfileUI();
      this.showView('view-stop-profile');
      this._updateReadyUI();
      this._broadcastLobbyState();
    });

    // ── Botón STOP dentro del juego ──
    document.getElementById('btn-stop-action').addEventListener('click', () => {
      this._triggerStop('me');
    });

    // ── Botón salir del juego STOP ──
    document.getElementById('btn-stop-exit').addEventListener('click', () => {
      if (confirm('¿Salir de la partida? Se perderá la conexión.')) {
        this._goHome();
      }
    });

    // ── Revisión: siguiente ronda ──
    document.getElementById('btn-stop-next-round').addEventListener('click', () => {
      this._onNextRoundClick();
    });

    // ── Game Over STOP ──
    document.getElementById('btn-stop-replay').addEventListener('click', () => {
      this._disconnectNetwork();
      this._resetState();
      this.showView('view-stop-config');
    });
    document.getElementById('btn-stop-home').addEventListener('click', () => {
      this._goHome();
    });
  }

  // ── Utilidades de UI ─────────────────────────
  showView(viewId) {
    this.allViews.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === viewId) {
        el.classList.remove('hidden');
        el.classList.add('active');
      } else {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });
  }

  _getSelectedCats() {
    return Array.from(document.querySelectorAll('.stop-cat-toggle.active'))
      .map(b => b.dataset.cat);
  }

  _getRandomLetter() {
    return STOP_LETTERS[Math.floor(Math.random() * STOP_LETTERS.length)];
  }

  // ── Red ──────────────────────────────────────
  _disconnectNetwork() {
    if (this.network) {
      this.network.disconnect();
      this.network = null;
    }
    this.peerReady = null;
    this.joiningRoom = false;
  }

  _setupHost() {
    this._disconnectNetwork();
    this.isHost = true;
    this.showView('view-stop-lobby');
    document.getElementById('stop-lobby-host').classList.remove('hidden');
    document.getElementById('stop-lobby-guest').classList.add('hidden');

    this.network = new PeerNetwork(true, this._handleNetwork.bind(this));
    this.network.init().then(id => {
      const url = new URL(window.location.href);
      url.searchParams.set('stoproom', id);
      document.getElementById('stop-room-code-display').innerText = id;
      document.getElementById('stop-qr-container').innerHTML = '';
      new QRCode(document.getElementById('stop-qr-container'), {
        text: url.toString(),
        width: 128, height: 128,
        colorDark: '#dc2626', colorLight: '#ffffff',
      });
    });
  }

  _setupGuest(autoCode = null) {
    this._disconnectNetwork();
    this.isHost = false;
    this.showView('view-stop-lobby');
    document.getElementById('stop-lobby-host').classList.add('hidden');
    document.getElementById('stop-lobby-guest').classList.remove('hidden');
    document.getElementById('stop-join-error').classList.add('hidden');
    
    // Restaurar form de invitado
    document.getElementById('stop-lobby-guest-form').classList.remove('hidden');
    document.getElementById('stop-lobby-guest-waiting').classList.add('hidden');

    this.network = new PeerNetwork(false, this._handleNetwork.bind(this));
    this.peerReady = this.network.init();

    if (autoCode) {
      document.getElementById('stop-room-code-input').value = autoCode;
      this.peerReady.then(() => this._joinRoom(autoCode));
    }
  }

  async _joinRoom(codeOverride = null) {
    if (this.joiningRoom) return;
    const input = codeOverride ?? document.getElementById('stop-room-code-input').value;
    const code = input.trim().toUpperCase();
    if (code.length !== 4) return;
    this.joiningRoom = true;
    document.getElementById('stop-join-error').classList.add('hidden');
    
    // Ocultar formulario y mostrar "Conectando..."
    document.getElementById('stop-lobby-guest-form').classList.add('hidden');
    document.getElementById('stop-lobby-guest-waiting').classList.remove('hidden');
    document.getElementById('stop-lobby-guest-waiting').innerHTML = `<p class="loading-text">Conectando a la sala ${code}<span class="dots">...</span></p>`;

    if (this.peerReady) {
      try { await this.peerReady; } catch {
        document.getElementById('stop-join-error').classList.remove('hidden');
        document.getElementById('stop-lobby-guest-form').classList.remove('hidden');
        document.getElementById('stop-lobby-guest-waiting').classList.add('hidden');
        this.joiningRoom = false; return;
      }
    }
    try {
      await this.network.joinRoom(code);
    } catch {
      document.getElementById('stop-join-error').classList.remove('hidden');
      document.getElementById('stop-lobby-guest-form').classList.remove('hidden');
      document.getElementById('stop-lobby-guest-waiting').classList.add('hidden');
    } finally {
      this.joiningRoom = false;
    }
  }

  // ── Mensajes de red ──────────────────────────
  _handleNetwork(msg) {
    switch (msg.type) {
      case 'CLIENT_CONNECTED':
        if (this.isHost && msg.payload) {
          const newPlayerId = msg.payload;
          this.players[newPlayerId] = {
            name: "Invitado", emoji: STOP_EMOJIS[1], isReady: false, id: newPlayerId, score: 0
          };
          this._updateHostLobbyUI();
        }
        break;
      case 'CLIENT_DISCONNECTED':
        if (this.isHost && msg.payload) {
          delete this.players[msg.payload];
          this._updateHostLobbyUI();
          this._broadcastLobbyState();
          if (document.getElementById('view-stop-profile').classList.contains('active')) {
             this._updateReadyUI();
             this._checkAllReady();
          }
        }
        break;
      case 'CONNECTED':
        document.getElementById('stop-join-error').classList.add('hidden');
        document.getElementById('stop-lobby-guest-form').classList.add('hidden');
        document.getElementById('stop-lobby-guest-waiting').classList.remove('hidden');
        document.getElementById('stop-lobby-guest-waiting').innerHTML = `
            <p class="loading-text" style="color:var(--success);font-weight:bold;margin-bottom:0.5rem;">¡Conectado exitosamente!</p>
            <p class="loading-text">Esperando a que el creador inicie la sala<span class="dots">...</span></p>
        `;
        break;
      case 'GO_TO_PROFILE':
        this._resetProfileUI();
        this.showView('view-stop-profile');
        this._updateReadyUI();
        break;
      case 'STOP_LOBBY_STATE':
        this.players = msg.payload;
        this._updateReadyUI();
        break;
      case 'DISCONNECTED':
        document.getElementById('disconnect-modal').classList.remove('hidden');
        break;
      case 'STOP_PROFILE_READY':
        if (this.isHost) {
          const senderId = msg._senderId || msg.payload.id;
          if (this.players[senderId]) {
            this.players[senderId].name = msg.payload.name;
            this.players[senderId].emoji = msg.payload.emoji;
            this.players[senderId].isReady = true;
          }
          this._broadcastLobbyState();
          this._updateReadyUI();
          this._checkAllReady();
        }
        break;
      case 'STOP_START_GAME':
        this._startGame(msg.payload);
        break;
      case 'STOP_TRIGGER':
        this._triggerStop(msg.payload.triggeredBy);
        break;
      case 'STOP_SUBMIT_ANSWERS':
        if (this.isHost) {
          const senderId = msg._senderId || msg.payload.id;
          this._receiveAnswers(senderId, msg.payload.answers);
        }
        break;
      case 'STOP_REVIEW_CATEGORY':
        this._buildReviewScreen(msg.payload);
        break;
      case 'STOP_VOTE':
        if (this.isHost) {
           const voterId = msg._senderId || msg.payload.voterId;
           const targetId = msg.payload.targetId;
           const vote = msg.payload.vote;
           this.categoryVotes[voterId][targetId] = vote;
           this.network.send('STOP_VOTES_SYNC', { votes: this.categoryVotes });
           this._updateVotesUI(this.categoryVotes);
           this._checkCategoryVotesComplete();
        }
        break;
      case 'STOP_VOTES_SYNC':
        this._updateVotesUI(msg.payload.votes);
        break;
      case 'STOP_TIE_WARNING':
        document.getElementById('stop-vote-tie-warning').classList.add('active');
        document.getElementById('btn-stop-next-cat').classList.add('hidden');
        break;
      case 'STOP_CAT_RESOLVED':
        document.getElementById('stop-vote-tie-warning').classList.remove('active');
        this._animatePointsForCategory(msg.payload.resolution);
        break;
      case 'STOP_ROUND_RESULTS':
        if (msg.payload.players) {
           this.players = msg.payload.players;
        }
        this._showRoundScoreboard(msg.payload.roundPoints);
        break;
      case 'STOP_READY_NEXT':
        if (this.isHost) {
           this._receiveReadyNext(msg._senderId || msg.payload.id);
        }
        break;
      case 'STOP_GAME_OVER':
        this._showFinalGameOver(msg.payload);
        break;
    }
  }

  _updateHostLobbyUI() {
    const list = document.getElementById("stop-connected-players-list");
    const count = Object.keys(this.players).length;
    list.innerHTML = "";
    if (count > 1) {
      list.innerHTML = `Hay ${count} jugadores en la sala.`;
      document.getElementById("btn-start-stop-lobby").classList.remove("hidden");
      document.getElementById("stop-lobby-waiting-text").classList.add("hidden");
    } else {
      document.getElementById("btn-start-stop-lobby").classList.add("hidden");
      document.getElementById("stop-lobby-waiting-text").classList.remove("hidden");
    }
  }

  _broadcastLobbyState() {
    if (this.isHost) {
      this.network.send("STOP_LOBBY_STATE", this.players);
    }
  }

  _updateReadyUI() {
    const container = document.getElementById("stop-ready-players-container");
    const list = document.getElementById("stop-ready-players-list");
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

  // ── Flujo preparación ────────────────────────
  _resetProfileUI() {
    document.getElementById('btn-stop-ready').classList.remove('hidden');
    document.getElementById('stop-ready-status').classList.add('hidden');
    document.getElementById('btn-stop-ready').disabled = document.getElementById('stop-player-name-input').value.trim().length === 0;
    this.myProfile.isReady = false;
  }

  _checkAllReady() {
    if (!this.isHost) return;
    const allReady = Object.values(this.players).every(p => p.isReady);
    
    // Validar por si el Host tiene un estado corrupto (jugadores incompletos o menos de 2)
    const totalPlayers = Object.keys(this.players).length;
    if (allReady && totalPlayers >= 2) {
      // Iniciar el juego
      const letter = this._getRandomLetter();
      const payload = {
        categories: this.selectedCats,
        letter,
        round: 1,
        players: this.players,
        roundMinutes: this.roundMinutes
      };
      this.network.send('STOP_START_GAME', payload);
      this._startGame(payload);
    }
  }

  // ── Inicio de juego ──────────────────────────
  _startGame(payload) {
    if (payload.categories) this.selectedCats = payload.categories;
    if (payload.players) this.players = payload.players;
    if (payload.roundMinutes) this.roundMinutes = payload.roundMinutes;
    
    this.currentLetter = payload.letter;
    this.currentRound  = payload.round || 1;

    this.allAnswers      = {};
    this.allVotes        = {};
    this.stopTriggeredBy = null;
    this.reviewDone      = false;

    // Initialize tracking structures for the host
    if (this.isHost) {
       this._receivedAnswersCount = 0;
       this._receivedVotesCount = 0;
       this._readyNextCount = 0;
    }

    if (this.currentRound === 1) {
       Object.values(this.players).forEach(p => p.score = 0);
    }

    this._showStopCountdown();
  }

  // ── Cuenta regresiva STOP ────────────────────
  _showStopCountdown() {
    this.showView('view-stop-countdown');
    const countEl   = document.getElementById('stop-big-countdown');
    const revealDiv = document.getElementById('stop-letter-reveal');
    const revealLetter = document.getElementById('stop-reveal-letter');
    const label     = document.getElementById('stop-countdown-label');

    revealDiv.classList.add('hidden');
    countEl.style.display = 'block';
    label.innerText = '¡La letra se revela en...';

    let count = 5;
    countEl.innerText = count;
    countEl.style.animation = 'none';
    void countEl.offsetWidth;
    countEl.style.animation = 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1)';

    const iv = setInterval(() => {
      count--;
      if (count > 0) {
        countEl.innerText = count;
        countEl.style.animation = 'none';
        void countEl.offsetWidth;
        countEl.style.animation = 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1)';
      } else {
        clearInterval(iv);
        // Revelar letra
        countEl.style.display = 'none';
        label.innerText = '¡Esta es la letra! 🎉';
        revealLetter.innerText = this.currentLetter;
        revealDiv.classList.remove('hidden');

        // Ir al juego después de 2.5s
        setTimeout(() => {
          this._showStopGame();
        }, 2500);
      }
    }, 1000);
  }

  // ── Vista de juego STOP ──────────────────────
  _showStopGame() {
    this.showView('view-stop-game');

    // Header Dinámico
    const header = document.getElementById('dynamic-stop-game-header');
    header.innerHTML = '';
    
    // Configurar mi info a la izquierda
    const myId = this.isHost ? "host" : this.network.myId;
    const myP = this.players[myId];
    
    if (myP) {
      header.innerHTML += `
        <div class="player-info" id="sp1-info">
          <span class="emoji">${myP.emoji}</span>
          <span class="name" id="sp1-name">${myP.name}</span>
          <div class="stop-score-chip" id="sp1-score">${myP.score} pts</div>
        </div>
      `;
    }
    
    header.innerHTML += `
      <div class="stop-round-center">
        <div class="stop-round-badge" id="stop-round-label">R${this.currentRound}/${TOTAL_ROUNDS}</div>
        <div class="stop-current-letter" id="stop-current-letter">${this.currentLetter}</div>
      </div>
    `;
    
    document.getElementById('stop-hint-letter').innerText = this.currentLetter;
    
    // Iniciar temporizador global
    this._startGlobalTimer();

    // Ocultar overlay
    document.getElementById('stop-opponent-stop-overlay').classList.add('hidden');

    // Generar inputs por categoría
    const grid = document.getElementById('stop-answers-grid');
    grid.innerHTML = '';
    this.myAnswers = {};

    this.selectedCats.forEach(cat => {
      const info = STOP_CATEGORIES[cat];
      this.myAnswers[cat] = '';

      const row = document.createElement('div');
      row.className = 'stop-answer-row';
      row.id = `stop-row-${cat}`;
      row.innerHTML = `
        <span class="stop-answer-emoji">${info.emoji}</span>
        <span class="stop-answer-label">${info.label}</span>
        <input
          class="stop-answer-input"
          type="text"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="${info.label} con ${this.currentLetter}..."
          id="stop-input-${cat}"
        />
        <span class="stop-answer-done">✅</span>
      `;

      const input = row.querySelector('input');
      input.addEventListener('focus', () => row.classList.add('focused'));
      input.addEventListener('blur',  () => row.classList.remove('focused'));
      input.addEventListener('input', () => {
        const val = input.value.trim();
        this.myAnswers[cat] = val;
        row.classList.toggle('has-value', val.length > 0);
        this._updateStopButton();
      });

      grid.appendChild(row);
    });

    this._updateStopButton();
  }

  _startGlobalTimer() {
    if (this._globalTimer) clearInterval(this._globalTimer);
    
    const duration = this.roundMinutes * 60;
    const endTime = Date.now() + (duration * 1000);
    const timerEl = document.getElementById('stop-global-timer');
    this.globalTimerTriggered = false;
    
    const updateDisplay = () => {
       const remaining = Math.max(0, (endTime - Date.now()) / 1000);
       const m = Math.floor(remaining / 60);
       const s = Math.floor(remaining % 60);
       timerEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
       
       if (remaining <= 10) {
          timerEl.style.color = "var(--primary)";
          timerEl.style.animation = "pulse 1s infinite";
       } else {
          timerEl.style.color = "var(--accent)";
          timerEl.style.animation = "none";
       }
       
       // Chequeo exacto
       if (remaining <= 0 && !this.globalTimerTriggered) {
          this.globalTimerTriggered = true;
          clearInterval(this._globalTimer);
          if (this.isHost) {
             this._triggerStop("time");
          }
       }
    };
    
    updateDisplay();
    this._globalTimer = setInterval(updateDisplay, 200); // 200ms check instead of 1000ms
  }

  _updateStopButton() {
    const btn = document.getElementById('btn-stop-action');
    const hintEl = document.getElementById('stop-btn-hint-text');
    const allFilled = this.selectedCats.every(cat => (this.myAnswers[cat] || '').trim().length > 0);
    btn.disabled = !allFilled;
    hintEl.innerText = allFilled
      ? '¡Listo para detener!'
      : `Faltan ${this.selectedCats.filter(c => !(this.myAnswers[c]||'').trim()).length} categorías`;
  }

  // ── STOP disparado ───────────────────────────
  _triggerStop(by) {
    if (this.stopTriggeredBy) return; // Ya se detuvo
    this.stopTriggeredBy = by;
    
    if (this._globalTimer) clearInterval(this._globalTimer);

    const myId = this.isHost ? "host" : this.network.myId;

    if (by === myId) {
      // Fui yo quien detuvo el juego (sea Host o Guest)
      this.network.send('STOP_TRIGGER', { triggeredBy: myId });
      this._showStopOverlay('me');
    } else if (by === "time") {
      // Se acabo el tiempo localmente
      this._showStopOverlay('time');
    } else {
      // Fue otro jugador.
      // Si soy Host, debo asegurarme de avisarle a todos los demás invitados.
      if (this.isHost) {
        this.network.send('STOP_TRIGGER', { triggeredBy: by });
      }
      this._showStopOverlay('opponent');
    }
    
    // Enviar respuestas al host
    if (this.isHost) {
       this._receiveAnswers(myId, this.myAnswers);
    } else {
       this.network.send('STOP_SUBMIT_ANSWERS', { id: myId, answers: this.myAnswers });
    }
  }

  _receiveAnswers(senderId, answers) {
     if (!this.allAnswers[this.currentRound]) {
         this.allAnswers[this.currentRound] = {};
     }
     this.allAnswers[this.currentRound][senderId] = answers;
     this._receivedAnswersCount++;
     
     if (this._receivedAnswersCount >= Object.keys(this.players).length) {
         this._tryStartReview();
     }
  }

  _showStopOverlay(by) {
    const overlay = document.getElementById('stop-opponent-stop-overlay');
    const title   = document.getElementById('stop-overlay-title');
    const msg     = document.getElementById('stop-overlay-msg');

    if (by === 'me') {
      title.innerText = '¡STOP!';
      msg.innerText   = '¡Detuviste el juego!\nRevisando respuestas...';
    } else {
      title.innerText = '¡STOP!';
      msg.innerText   = `Tu oponente detuvo el juego.\nTus respuestas han sido enviadas.`;
    }
    overlay.classList.remove('hidden');

    // Bloquear inputs
    document.querySelectorAll('.stop-answer-input').forEach(i => i.disabled = true);
    document.getElementById('btn-stop-action').disabled = true;
  }

  // Espera a tener todas las respuestas para iniciar revisión (Solo Host)
  _tryStartReview() {
    if (!this.isHost) return;
    
    // Validar si ya recibí de todos
    if (this._receivedAnswersCount >= Object.keys(this.players).length) {
       this.currentReviewCatIndex = 0;
       this._resetCategoryVotes();
       setTimeout(() => this._broadcastCurrentCategory(), 1000);
    }
  }
  
  _resetCategoryVotes() {
     this.categoryVotes = {};
     Object.keys(this.players).forEach(voterId => {
        this.categoryVotes[voterId] = {};
     });
  }
  
  _broadcastCurrentCategory() {
     const cat = this.selectedCats[this.currentReviewCatIndex];
     const payload = {
        cat,
        catIndex: this.currentReviewCatIndex,
        totalCats: this.selectedCats.length,
        allAnswers: this.allAnswers[this.currentRound]
     };
     this.network.send('STOP_REVIEW_CATEGORY', payload);
     this._buildReviewScreen(payload);
  }

  // ── Pantalla de revisión ─────────────────────
  _buildReviewScreen(payload) {
    this.showView('view-stop-review');
    document.getElementById('stop-review-round').innerText   = this.currentRound;
    document.getElementById('stop-review-letter').innerText  = this.currentLetter;
    
    const cat = payload.cat;
    this.currentReviewCat = cat;
    const info = STOP_CATEGORIES[cat];
    const list = document.getElementById('stop-review-list');
    
    document.getElementById('stop-vote-tie-warning').classList.remove('active');
    
    if (this.isHost) {
      document.getElementById('btn-stop-next-cat').classList.add('hidden');
      document.getElementById('stop-waiting-next').classList.add('hidden');
    } else {
      document.getElementById('btn-stop-next-cat').classList.add('hidden');
      document.getElementById('stop-waiting-next').classList.remove('hidden');
      document.getElementById('stop-waiting-next').innerText = "Esperando votos...";
    }
    
    let html = `
      <div class="stop-review-card" style="animation-delay: 0s;">
        <div class="stop-review-card-header" style="justify-content: center; font-size: 1.5rem; padding: 15px;">
           <span class="cat-emoji">${info.emoji}</span>
           <span class="cat-name">${info.label}</span>
        </div>
        <div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
           Categoría ${payload.catIndex + 1} de ${payload.totalCats}
        </div>
    `;
    
    Object.keys(this.players).forEach(playerId => {
       const p = this.players[playerId];
       const pAns = (payload.allAnswers && payload.allAnswers[playerId] && payload.allAnswers[playerId][cat]) || '';
       const isEmpty = !pAns.trim();
       const ansText = isEmpty ? '(sin respuesta)' : pAns;
       
       if (isEmpty && this.isHost) {
         // Auto-invalid for empty
         Object.keys(this.players).forEach(voterId => {
            this.categoryVotes[voterId][playerId] = 'invalid';
         });
       }
       
       html += `
         <div class="stop-vote-card" id="vote-card-${playerId}">
           <div class="stop-vote-card-header">
             <div class="stop-vote-player">
               <span>${p.emoji}</span> <span>${p.name}</span>
             </div>
             <div class="stop-vote-word ${isEmpty ? 'empty' : ''}">${ansText}</div>
           </div>
           ${!isEmpty ? `
           <div class="stop-vote-buttons" id="vote-btns-${playerId}">
             <button class="stop-vote-btn valid" data-vote="valid" data-target="${playerId}">
               <span class="stop-vote-icon">✅</span>
               <span class="stop-vote-label">Válida (100)</span>
               <div class="stop-vote-badges" id="badges-valid-${playerId}"></div>
             </button>
             <button class="stop-vote-btn repeated" data-vote="repeated" data-target="${playerId}">
               <span class="stop-vote-icon">🔁</span>
               <span class="stop-vote-label">Repetida (50)</span>
               <div class="stop-vote-badges" id="badges-repeated-${playerId}"></div>
             </button>
             <button class="stop-vote-btn invalid" data-vote="invalid" data-target="${playerId}">
               <span class="stop-vote-icon">❌</span>
               <span class="stop-vote-label">Inválida (0)</span>
               <div class="stop-vote-badges" id="badges-invalid-${playerId}"></div>
             </button>
           </div>
           ` : `
           <div style="text-align:center; color: var(--danger); font-weight: bold; padding: 10px;">
             Automáticamente Inválida
           </div>
           `}
           <div id="vote-result-${playerId}" style="display:none; text-align:center; margin-top:10px; font-weight:bold; font-size: 1.2rem;"></div>
         </div>
       `;
    });
    
    html += `</div>`;
    list.innerHTML = html;
    
    // Attach Listeners
    const myId = this.isHost ? "host" : this.network.myId;
    list.querySelectorAll('.stop-vote-btn').forEach(btn => {
       btn.addEventListener('click', () => {
          const targetId = btn.dataset.target;
          const vote = btn.dataset.vote;
          
          // Enviar voto al host
          if (this.isHost) {
             this.categoryVotes[myId][targetId] = vote;
             this.network.send('STOP_VOTES_SYNC', { votes: this.categoryVotes });
             this._updateVotesUI(this.categoryVotes);
             this._checkCategoryVotesComplete();
          } else {
             this.network.send('STOP_VOTE', { voterId: myId, targetId, vote });
             
             // Optimistic UI for guest
             list.querySelectorAll(`.stop-vote-btn[data-target="${targetId}"]`).forEach(b => b.classList.remove('selected'));
             btn.classList.add('selected');
          }
       });
    });
    
    if (this.isHost) {
      this._updateVotesUI(this.categoryVotes);
      this._checkCategoryVotesComplete(); // In case everyone was empty
    }
    
    // Next Cat listener (only for Host when ready)
    const btnNext = document.getElementById('btn-stop-next-cat');
    // Remove old listeners
    const newBtnNext = btnNext.cloneNode(true);
    btnNext.parentNode.replaceChild(newBtnNext, btnNext);
    newBtnNext.addEventListener('click', () => {
       if (this.currentReviewCatIndex < this.selectedCats.length - 1) {
          this.currentReviewCatIndex++;
          this._resetCategoryVotes();
          this._broadcastCurrentCategory();
       } else {
          // Ya no hay más categorías, mostrar puntajes de la ronda
          this._broadcastRoundResults();
       }
    });
  }

  _updateVotesUI(votes) {
     const myId = this.isHost ? "host" : this.network.myId;
     
     // Clear all badges
     document.querySelectorAll('.stop-vote-badges').forEach(el => el.innerHTML = '');
     
     Object.keys(votes).forEach(voterId => {
        Object.keys(votes[voterId]).forEach(targetId => {
           const vote = votes[voterId][targetId];
           if (vote) {
              const badgeContainer = document.getElementById(`badges-${vote}-${targetId}`);
              if (badgeContainer) {
                 const p = this.players[voterId];
                 badgeContainer.innerHTML += `<div class="stop-vote-badge">${p.emoji}</div>`;
              }
              // Si es mi voto, marcar el botón como seleccionado
              if (voterId === myId) {
                 document.querySelectorAll(`.stop-vote-btn[data-target="${targetId}"]`).forEach(b => b.classList.remove('selected'));
                 const myBtn = document.querySelector(`.stop-vote-btn[data-target="${targetId}"][data-vote="${vote}"]`);
                 if (myBtn) myBtn.classList.add('selected');
              }
           }
        });
     });
  }
  
  _checkCategoryVotesComplete() {
     if (!this.isHost) return;
     let allVoted = true;
     const playerIds = Object.keys(this.players);
     
     playerIds.forEach(voterId => {
        playerIds.forEach(targetId => {
           if (!this.categoryVotes[voterId][targetId]) {
              allVoted = false;
           }
        });
     });
     
     if (allVoted) {
        // Resolve tie or consensus
        let hasTie = false;
        const resolution = {};
        
        playerIds.forEach(targetId => {
           let counts = { valid: 0, invalid: 0, repeated: 0 };
           playerIds.forEach(voterId => {
              counts[this.categoryVotes[voterId][targetId]]++;
           });
           
           const max = Math.max(counts.valid, counts.invalid, counts.repeated);
           const ties = ['valid', 'invalid', 'repeated'].filter(v => counts[v] === max);
           
           if (ties.length > 1) {
              hasTie = true;
           } else {
              let pts = 0;
              if (ties[0] === 'valid') pts = 100;
              else if (ties[0] === 'repeated') pts = 50;
              resolution[targetId] = { result: ties[0], points: pts };
           }
        });
        
        if (hasTie) {
           this.network.send('STOP_TIE_WARNING', {});
           document.getElementById('stop-vote-tie-warning').classList.add('active');
           document.getElementById('btn-stop-next-cat').classList.add('hidden');
        } else {
           this.network.send('STOP_CAT_RESOLVED', { resolution });
           document.getElementById('stop-vote-tie-warning').classList.remove('active');
           document.getElementById('btn-stop-next-cat').classList.remove('hidden');
           
           // Store resolution for final tally
           if (!this.roundResolutions) this.roundResolutions = {};
           this.roundResolutions[this.currentReviewCat] = resolution;
           
           this._animatePointsForCategory(resolution);
        }
     } else {
        this.network.send('STOP_CAT_RESOLVED', { removeWarning: true }); // Dummy for removing warning
        document.getElementById('stop-vote-tie-warning').classList.remove('active');
        document.getElementById('btn-stop-next-cat').classList.add('hidden');
     }
  }
  
  _animatePointsForCategory(resolution) {
     if (!resolution) return; // called from dummy removeWarning
     Object.keys(resolution).forEach(targetId => {
        const res = resolution[targetId];
        const resDiv = document.getElementById(`vote-result-${targetId}`);
        const btnsDiv = document.getElementById(`vote-btns-${targetId}`);
        if (resDiv && res) {
           if (btnsDiv) btnsDiv.style.display = 'none';
           resDiv.style.display = 'block';
           
           let icon = '❌', text = 'Inválida', color = '#ef4444', pts = '+0';
           if (res.result === 'valid') { icon = '✅'; text = 'Válida'; color = '#10b981'; pts = '+100'; }
           if (res.result === 'repeated') { icon = '🔁'; text = 'Repetida'; color = '#3b82f6'; pts = '+50'; }
           
           resDiv.innerHTML = `<span style="color:${color}">${icon} ${text} <span style="margin-left: 10px; padding: 2px 8px; background: rgba(0,0,0,0.1); border-radius: 10px;">${pts}</span></span>`;
        }
     });
     
     if (this.isHost) {
        // Wait a bit or let Host click Next explicitly
     } else {
        document.getElementById('stop-waiting-next').innerText = "Esperando al creador...";
     }
  }
  
  _broadcastRoundResults() {
     const roundPoints = {};
     Object.keys(this.players).forEach(id => {
        roundPoints[id] = 0;
        this.selectedCats.forEach(cat => {
           if (this.roundResolutions && this.roundResolutions[cat] && this.roundResolutions[cat][id]) {
              roundPoints[id] += this.roundResolutions[cat][id].points;
           }
        });
        this.players[id].score += roundPoints[id];
     });
     
     const payload = { roundPoints, players: this.players };
     this.network.send('STOP_ROUND_RESULTS', payload);
     this._showRoundScoreboard(roundPoints);
  }
  
  _showRoundScoreboard(roundPoints) {
    const list = document.getElementById('stop-review-list');
    list.innerHTML = ''; // Clear review cards
    
    document.getElementById('stop-vote-tie-warning').classList.remove('active');
    document.getElementById('btn-stop-next-cat').classList.add('hidden');
    
    const board = document.getElementById('stop-round-scoreboard');
    board.style.display = 'block';

    let scoresHTML = `<h3>🏅 Puntos de esta ronda</h3>`;
    
    // Sort players by total score descending
    const sortedPlayers = Object.values(this.players).sort((a,b) => b.score - a.score);
    
    sortedPlayers.forEach(p => {
       const rPts = roundPoints[p.id] || 0;
       scoresHTML += `
          <div class="stop-score-row" style="margin-top: 10px;">
            <div class="stop-score-player">
              <span>${p.emoji}</span>
              <span>${p.name}</span>
            </div>
            <div class="stop-score-value">
              <span style="color:var(--accent); font-size: 0.9em; margin-right: 10px;">+${rPts}</span>
              <span style="font-weight:bold;">Total: ${p.score}</span>
            </div>
          </div>
       `;
    });
    
    board.innerHTML = scoresHTML;

    // Mostrar botón solo para host, guest espera
    if (this.isHost) {
      document.getElementById('stop-waiting-next').classList.add('hidden');
      
      const nav = document.getElementById('stop-review-nav');
      if (!document.getElementById('btn-stop-next-round')) {
          nav.innerHTML += `
             <button id="btn-stop-next-round" class="btn btn-primary" style="width:100%;margin-top:1rem;">
               Siguiente Ronda →
             </button>
          `;
      } else {
          document.getElementById('btn-stop-next-round').classList.remove('hidden');
      }
      
      document.getElementById('btn-stop-next-round').addEventListener('click', () => {
         document.getElementById('btn-stop-next-round').classList.add('hidden');
         this._onNextRoundClick();
      });
    } else {
      document.getElementById('stop-waiting-next').innerText = "Esperando al creador...";
      document.getElementById('stop-waiting-next').classList.remove('hidden');
      if (document.getElementById('btn-stop-next-round')) document.getElementById('btn-stop-next-round').classList.add('hidden');
    }

    setTimeout(() => {
      board.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  }
  
  _onNextRoundClick() {
    if (!this.isHost) return;
    if (this.currentRound >= TOTAL_ROUNDS) {
      // Fin del juego
      this._endGame();
    } else {
      this.currentRound++;
      const letter = this._getRandomLetter();
      this.currentLetter = letter;
      const nextPayload = {
        categories: this.selectedCats,
        letter,
        round: this.currentRound,
        players: this.players,
        roundMinutes: this.roundMinutes
      };
      this.network.send('STOP_START_GAME', nextPayload);
      this._startGame(nextPayload);
    }
  }

  _endGame() {
    const payload = {
      players: this.players,
    };
    this.network.send('STOP_GAME_OVER', payload);
    this._showFinalGameOver(payload);
  }

  _showFinalGameOver(payload) {
    this.players = payload.players;
    const sortedPlayers = Object.values(this.players).sort((a,b) => b.score - a.score);
    const winner = sortedPlayers[0];
    
    const myId = this.isHost ? "host" : this.network.myId;
    const iMeWin = winner.id === myId;

    document.getElementById('stop-trophy').innerText = iMeWin ? '🏆' : '😔';
    document.getElementById('stop-winner-text').innerText = iMeWin
      ? `¡Ganaste con ${winner.score} puntos!`
      : `¡${winner.name} ganó con ${winner.score} puntos!`;

    let rows = '';
    sortedPlayers.forEach((p, idx) => {
       const isWinner = idx === 0;
       rows += `<tr>
         <td class="${isWinner ? 'winner-cell' : ''}">#${idx + 1}</td>
         <td class="${isWinner ? 'winner-cell' : ''}">${p.emoji} ${p.name}</td>
         <td class="${isWinner ? 'winner-cell' : ''}">${p.score}</td>
       </tr>`;
    });

    const board = document.getElementById('stop-final-scoreboard');
    board.innerHTML = `
      <table class="stop-final-table">
        <thead>
          <tr>
            <th>Lugar</th>
            <th>Jugador</th>
            <th>Puntaje</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    this.showView('view-stop-gameover');
    
    setTimeout(() => {
      const finalBoard = document.getElementById('stop-final-scoreboard');
      if (finalBoard) finalBoard.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  }

  // ── Helpers ──────────────────────────────────
  _goHome() {
    this._disconnectNetwork();
    this._resetState();
    this.showView('view-home');
  }

  _resetState() {
    this.allAnswers       = {};
    this.allVotes         = {};
    this.stopTriggeredBy  = null;
    this.reviewDone       = false;
    this.currentRound     = 1;
    this._allVotesList    = [];
    Object.values(this.players).forEach(p => p.isReady = false);
  }
}


