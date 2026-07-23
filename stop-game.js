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

    // ── Tiempo Config ──
    const timeDisplay = document.getElementById('stop-time-display');
    document.getElementById('btn-stop-time-minus').addEventListener('click', () => {
      if (this.roundMinutes > 1) {
        this.roundMinutes--;
        timeDisplay.innerText = this.roundMinutes;
      }
    });
    document.getElementById('btn-stop-time-plus').addEventListener('click', () => {
      if (this.roundMinutes < 15) {
        this.roundMinutes++;
        timeDisplay.innerText = this.roundMinutes;
      }
    });

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
      // EMOJIS viene de app.js
      if (typeof EMOJIS !== 'undefined') {
        stopEmojiIdx = (stopEmojiIdx + 1) % EMOJIS.length;
        this.myProfile.emoji = EMOJIS[stopEmojiIdx];
        document.getElementById('stop-current-emoji').innerText = this.myProfile.emoji;
      }
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
    if (this.peerReady) {
      try { await this.peerReady; } catch {
        document.getElementById('stop-join-error').classList.remove('hidden');
        this.joiningRoom = false; return;
      }
    }
    try {
      await this.network.joinRoom(code);
    } catch {
      document.getElementById('stop-join-error').classList.remove('hidden');
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
            name: "Invitado", emoji: EMOJIS[1], isReady: false, id: newPlayerId, score: 0
          };
          this._updateHostLobbyUI();
        }
        break;
      case 'CLIENT_DISCONNECTED':
        if (this.isHost && msg.payload) {
          delete this.players[msg.payload];
          this._updateHostLobbyUI();
          this._broadcastLobbyState();
        }
        break;
      case 'CONNECTED':
        document.getElementById('stop-join-error').classList.add('hidden');
        document.getElementById('stop-lobby-guest-form').classList.add('hidden');
        document.getElementById('stop-lobby-guest-waiting').classList.remove('hidden');
        break;
      case 'GO_TO_PROFILE':
        this._resetProfileUI();
        this.showView('view-stop-profile');
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
           this._receiveAnswers(msg._senderId || msg.payload.id, msg.payload.answers);
        }
        break;
      case 'STOP_REVIEW_PHASE':
        this.allAnswers = msg.payload.allAnswers;
        this._tryStartReview();
        break;
      case 'STOP_SUBMIT_VOTES':
        if (this.isHost) {
           this._receiveVotes(msg._senderId || msg.payload.id, msg.payload.votes);
        }
        break;
      case 'STOP_ROUND_RESULTS':
        this._showRoundResults(msg.payload);
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
    if (allReady && Object.keys(this.players).length >= 2) {
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
    
    let totalSeconds = this.roundMinutes * 60;
    const timerEl = document.getElementById('stop-global-timer');
    
    const updateDisplay = () => {
       const m = Math.floor(totalSeconds / 60);
       const s = totalSeconds % 60;
       timerEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
       if (totalSeconds <= 10) {
          timerEl.style.color = "var(--primary)";
          timerEl.style.animation = "pulse 1s infinite";
       } else {
          timerEl.style.color = "var(--accent)";
          timerEl.style.animation = "none";
       }
    };
    
    updateDisplay();
    
    this._globalTimer = setInterval(() => {
       totalSeconds--;
       if (totalSeconds <= 0) {
          clearInterval(this._globalTimer);
          updateDisplay();
          this._triggerStop("time");
       } else {
          updateDisplay();
       }
    }, 1000);
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
      // Fui yo
      this.network.send('STOP_TRIGGER', { triggeredBy: myId });
      this._showStopOverlay('me');
    } else if (by === "time") {
      this._showStopOverlay('time');
    } else {
      // Fue otro
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
       this.network.send('STOP_REVIEW_PHASE', { allAnswers: this.allAnswers });
       setTimeout(() => this._buildReviewScreen(), 1000);
    }
  }

  // ── Pantalla de revisión ─────────────────────
  _buildReviewScreen() {
    this.showView('view-stop-review');
    
    document.getElementById('stop-review-round').innerText   = this.currentRound;
    document.getElementById('stop-review-letter').innerText  = this.currentLetter;

    const list = document.getElementById('stop-review-list');
    list.innerHTML = '';
    
    // Mis votos locales: this.myVotes[targetId][cat] = 'valid' | 'invalid' | 'repeated'
    this.myVotes = {};
    Object.keys(this.players).forEach(id => {
       this.myVotes[id] = {};
    });

    this.selectedCats.forEach((cat, idx) => {
      const info = STOP_CATEGORIES[cat];
      const card = document.createElement('div');
      card.className = 'stop-review-card';
      card.style.animationDelay = `${idx * 0.07}s`;
      card.id = `review-card-${cat}`;

      let playersRows = '';
      
      Object.keys(this.players).forEach(playerId => {
         const p = this.players[playerId];
         const pAns = (this.allAnswers[this.currentRound] && this.allAnswers[this.currentRound][playerId] && this.allAnswers[this.currentRound][playerId][cat]) || '';
         const isEmpty = !pAns.trim();
         const ansClass = isEmpty ? 'stop-review-answer empty' : 'stop-review-answer';
         const ansText  = isEmpty ? '(sin respuesta)' : pAns;
         
         // Si está vacía, no necesita votos
         if (isEmpty) {
            this.myVotes[playerId][cat] = 'invalid'; // Automáticamente inválida
         }
         
         const voteBtns = isEmpty ? '' : `
            <div class="stop-vote-btns" id="vote-btns-${cat}-${playerId}">
              <button class="stop-vote-btn" data-vote="valid" data-cat="${cat}" data-target="${playerId}">
                <span class="vote-emoji">✅</span><span class="vote-label">Válida</span>
              </button>
              <button class="stop-vote-btn" data-vote="repeated" data-cat="${cat}" data-target="${playerId}">
                <span class="vote-emoji">🔁</span><span class="vote-label">Repetida</span>
              </button>
              <button class="stop-vote-btn" data-vote="invalid" data-cat="${cat}" data-target="${playerId}">
                <span class="vote-emoji">❌</span><span class="vote-label">Inválida</span>
              </button>
            </div>
         `;
         
         playersRows += `
           <div class="stop-review-player-row">
             <div class="stop-review-player-info">
               <span class="stop-review-player-emoji">${p.emoji}</span>
               <span class="stop-review-player-name">${p.name}</span>
               <span class="${ansClass}">${ansText}</span>
             </div>
             ${voteBtns}
           </div>
         `;
      });

      card.innerHTML = `
        <div class="stop-review-card-header">
          <span class="cat-emoji">${info.emoji}</span>
          <span class="cat-name">${info.label}</span>
          <span class="cat-status" id="card-status-${cat}"></span>
        </div>
        ${playersRows}
      `;
      list.appendChild(card);
      this._attachVoteListeners(cat);
    });

    document.getElementById('stop-review-nav').style.display = 'block';
    const nav = document.getElementById('stop-review-nav');
    nav.innerHTML = `
       <button id="btn-stop-submit-votes" class="btn btn-primary" style="width:100%;margin-top:1rem;" disabled>
         Enviar Votos
       </button>
       <p id="stop-waiting-votes" class="status-text hidden">
         Esperando a los demás<span class="dots">...</span>
       </p>
    `;
    
    document.getElementById('btn-stop-submit-votes').addEventListener('click', () => {
       document.getElementById('btn-stop-submit-votes').classList.add('hidden');
       document.getElementById('stop-waiting-votes').classList.remove('hidden');
       const myId = this.isHost ? "host" : this.network.myId;
       
       if (this.isHost) {
          this._receiveVotes(myId, this.myVotes);
       } else {
          this.network.send('STOP_SUBMIT_VOTES', { votes: this.myVotes });
       }
    });

    this._checkAllVotesCast();
  }

  _attachVoteListeners(cat) {
    const card = document.getElementById(`review-card-${cat}`);
    if (!card) return;
    
    card.querySelectorAll('.stop-vote-btn').forEach(btn => {
       btn.addEventListener('click', () => {
          const target = btn.dataset.target;
          const vote = btn.dataset.vote;
          
          this.myVotes[target][cat] = vote;
          
          // Reset all buttons for this target/cat
          card.querySelectorAll(`.stop-vote-btn[data-target="${target}"]`).forEach(b => {
             b.classList.remove('selected-valid', 'selected-invalid', 'selected-rep');
          });
          
          if (vote === 'valid') btn.classList.add('selected-valid');
          else if (vote === 'invalid') btn.classList.add('selected-invalid');
          else if (vote === 'repeated') btn.classList.add('selected-rep');
          
          this._checkAllVotesCast();
       });
    });
  }

  _checkAllVotesCast() {
     let allCast = true;
     Object.keys(this.players).forEach(playerId => {
        this.selectedCats.forEach(cat => {
           if (!this.myVotes[playerId][cat]) {
              allCast = false;
           }
        });
     });
     
     const btn = document.getElementById('btn-stop-submit-votes');
     if (btn) btn.disabled = !allCast;
  }
  _receiveVotes(senderId, votes) {
    if (!this._allVotesList) this._allVotesList = [];
    this._allVotesList.push(votes);
    this._receivedVotesCount++;
    
    if (this._receivedVotesCount >= Object.keys(this.players).length) {
       this._tallyVotesAndAssignPoints();
    }
  }
  
  _tallyVotesAndAssignPoints() {
     // this._allVotesList is an array of objects: { targetId: { cat: vote } }
     
     // Para cada targetId, y cada cat, contamos los votos
     const resolution = {}; // { targetId: { cat: { result, points } } }
     const roundPoints = {}; // { targetId: points }
     
     Object.keys(this.players).forEach(targetId => {
        resolution[targetId] = {};
        let total = 0;
        
        this.selectedCats.forEach(cat => {
           let counts = { 'valid': 0, 'invalid': 0, 'repeated': 0 };
           
           this._allVotesList.forEach(voteObj => {
              const v = voteObj[targetId] && voteObj[targetId][cat];
              if (v && counts[v] !== undefined) {
                 counts[v]++;
              }
           });
           
           // Determinar mayoría (valid > repeated > invalid en caso de empate)
           let best = 'invalid';
           let max = counts['invalid'];
           
           if (counts['repeated'] > max) { best = 'repeated'; max = counts['repeated']; }
           else if (counts['repeated'] === max && max > 0) { best = 'repeated'; }
           
           if (counts['valid'] > max) { best = 'valid'; max = counts['valid']; }
           else if (counts['valid'] === max && max > 0) { best = 'valid'; }
           
           let pts = 0;
           if (best === 'valid') pts = 100;
           else if (best === 'repeated') pts = 50;
           
           resolution[targetId][cat] = { result: best, points: pts };
           total += pts;
        });
        roundPoints[targetId] = total;
     });
     
     // Asignar puntos a los jugadores
     Object.keys(this.players).forEach(id => {
        this.players[id].score += roundPoints[id];
     });
     
     const payload = {
        resolution,
        roundPoints,
        players: this.players
     };
     
     this.network.send('STOP_ROUND_RESULTS', payload);
     this._showRoundResults(payload);
  }
  
  _showRoundResults(payload) {
     this.players = payload.players;
     
     // Actualizar las cartas de la UI con los resultados
     this.selectedCats.forEach(cat => {
        Object.keys(this.players).forEach(playerId => {
           const res = payload.resolution[playerId][cat];
           const btnsDiv = document.getElementById(`vote-btns-${cat}-${playerId}`);
           if (btnsDiv) btnsDiv.style.display = 'none';
           
           // Insert result HTML next to the player's row
           const row = document.getElementById(`vote-btns-${cat}-${playerId}`)?.parentElement;
           if (row) {
             const resDiv = document.createElement('div');
             
             let cls = 'result-no', icon = '❌', text = 'No válida', ptsText = '+0';
             if (res.result === 'valid')    { cls = 'result-yes'; icon = '✅'; text = 'Válida';       ptsText = `+100`; }
             if (res.result === 'repeated') { cls = 'result-rep'; icon = '🔁'; text = 'Repetida';     ptsText = `+50`; }
             
             resDiv.innerHTML = `
                <div class="stop-vote-result ${cls}" style="margin-left: 10px;">
                  <span>${icon} ${text}</span>
                  <span class="stop-vote-result-pts">${ptsText}</span>
                </div>
             `;
             row.appendChild(resDiv);
           }
        });
        
        const cardStatus = document.getElementById(`card-status-${cat}`);
        if (cardStatus) cardStatus.innerText = '✅ Resuelto';
     });
     
     this._showRoundScoreboard(payload.roundPoints);
  }
  
  _showRoundScoreboard(roundPoints) {
    const nav = document.getElementById('stop-review-nav');
    const board = document.getElementById('stop-round-scoreboard');
    nav.style.display = 'block';

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
      document.getElementById('btn-stop-submit-votes').classList.add('hidden');
      document.getElementById('stop-waiting-votes').classList.add('hidden');
      
      nav.innerHTML += `
         <button id="btn-stop-next-round" class="btn btn-primary" style="width:100%;margin-top:1rem;">
           Siguiente Ronda →
         </button>
      `;
      document.getElementById('btn-stop-next-round').addEventListener('click', () => {
         this._onNextRoundClick();
      });
    } else {
      document.getElementById('btn-stop-submit-votes').classList.add('hidden');
      document.getElementById('stop-waiting-votes').innerText = "Esperando al creador...";
      document.getElementById('stop-waiting-votes').classList.remove('hidden');
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

// ── Inicializar STOP junto con el juego principal ──
window.addEventListener('DOMContentLoaded', () => {
  // Delay para que app.js termine su init primero
  setTimeout(() => {
    window._stopGame = new StopGame();

    // Auto-join por URL (para STOP)
    const stopRoom = new URLSearchParams(window.location.search).get('stoproom');
    if (stopRoom) {
      window._stopGame._setupGuest(stopRoom.trim().toUpperCase());
    }
  }, 150);
});
