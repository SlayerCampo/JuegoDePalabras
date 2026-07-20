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

    // Respuestas
    this.myAnswers      = {};   // { nombres: 'Ana', ... }
    this.opponentAnswers= {};

    // Puntos acumulados [ronda1, ronda2, ...]
    this.myTotalScore   = 0;
    this.opponentTotalScore = 0;
    this.roundScores    = [];   // [{my:X, opp:Y}, ...]

    // Estado de votación
    // votes[cat] = { myAnswer: {myVote, oppVote}, oppAnswer: {myVote, oppVote} }
    this.votes          = {};

    // Perfiles
    this.myProfile      = { name:'Jugador 1', emoji:'😎', isReady:false };
    this.opponentProfile= { name:'Jugador 2', emoji:'🤖', isReady:false };

    // Estados de UI
    this.reviewDone     = false; // si ya terminé de votar en esta ronda
    this.opponentReviewDone = false;
    this.stopTriggeredBy = null; // 'me' | 'opponent'

    this._roundPts = { host: 0, guest: 0 };
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
      stopEmojiIdx = (stopEmojiIdx + 1) % EMOJIS.length;
      this.myProfile.emoji = EMOJIS[stopEmojiIdx];
      document.getElementById('stop-current-emoji').innerText = this.myProfile.emoji;
    });

    document.getElementById('btn-stop-ready').addEventListener('click', () => {
      const name = document.getElementById('stop-player-name-input').value.trim();
      if (name) this.myProfile.name = name;
      this.myProfile.isReady = true;
      document.getElementById('btn-stop-ready').classList.add('hidden');
      document.getElementById('stop-ready-status').classList.remove('hidden');
      this.network.send('STOP_PROFILE_READY', this.myProfile);
      this._checkBothReady();
    });

    document.querySelector('.btn-stop-profile-back').addEventListener('click', () => {
      this._disconnectNetwork();
      this.showView('view-stop-lobby');
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
      case 'CONNECTED':
        this._resetProfileUI();
        this.showView('view-stop-profile');
        break;
      case 'DISCONNECTED':
        document.getElementById('disconnect-modal').classList.remove('hidden');
        break;
      case 'STOP_PROFILE_READY':
        this.opponentProfile.name  = msg.payload.name;
        this.opponentProfile.emoji = msg.payload.emoji;
        this.opponentProfile.isReady = true;
        this._checkBothReady();
        break;
      case 'STOP_START_GAME':
        this._startGame(msg.payload);
        break;
      case 'STOP_TRIGGER':
        this._triggerStop('opponent', msg.payload);
        break;
      case 'STOP_ANSWERS':
        this.opponentAnswers = msg.payload;
        this._tryStartReview();
        break;
      case 'STOP_VOTE':
        this._receiveOpponentVote(msg.payload);
        break;
      case 'STOP_READY_NEXT':
        this.opponentReviewDone = true;
        this._tryGoNextRound();
        break;
      case 'STOP_GAME_OVER':
        this._showFinalGameOver(msg.payload);
        break;
    }
  }

  // ── Flujo preparación ────────────────────────
  _resetProfileUI() {
    document.getElementById('btn-stop-ready').classList.remove('hidden');
    document.getElementById('stop-ready-status').classList.add('hidden');
    this.myProfile.isReady = false;
    this.opponentProfile.isReady = false;
  }

  _checkBothReady() {
    if (!this.myProfile.isReady || !this.opponentProfile.isReady) return;
    if (this.isHost) {
      const letter = this._getRandomLetter();
      const payload = {
        categories: this.selectedCats,
        letter,
        round: 1,
        hostName:  this.myProfile.name,
        hostEmoji: this.myProfile.emoji,
        guestName: this.opponentProfile.name,
        guestEmoji:this.opponentProfile.emoji,
      };
      this.network.send('STOP_START_GAME', payload);
      this._startGame(payload);
    }
  }

  // ── Inicio de juego ──────────────────────────
  _startGame(payload) {
    if (payload.categories) this.selectedCats = payload.categories;
    this.currentLetter = payload.letter;
    this.currentRound  = payload.round || 1;

    // Actualizar perfiles con los datos sincronizados
    if (this.isHost) {
      this.opponentProfile.name  = payload.guestName  || this.opponentProfile.name;
      this.opponentProfile.emoji = payload.guestEmoji || this.opponentProfile.emoji;
    } else {
      this.opponentProfile.name  = payload.hostName   || this.opponentProfile.name;
      this.opponentProfile.emoji = payload.hostEmoji  || this.opponentProfile.emoji;
    }

    this.myAnswers       = {};
    this.opponentAnswers = {};
    this.votes           = {};
    this.stopTriggeredBy = null;
    this.reviewDone      = false;
    this.opponentReviewDone = false;
    this._roundPts       = { host: 0, guest: 0 };

    if (this.currentRound === 1) {
      this.myTotalScore = 0;
      this.opponentTotalScore = 0;
      this.roundScores = [];
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

    // Header
    const myName   = this.myProfile.name;
    const oppName  = this.opponentProfile.name;
    const myEmoji  = this.myProfile.emoji;
    const oppEmoji = this.opponentProfile.emoji;

    if (this.isHost) {
      document.getElementById('sp1-info').querySelector('.name').innerText = myName;
      document.getElementById('sp1-info').querySelector('.emoji').innerText = myEmoji;
      document.getElementById('sp2-info').querySelector('.name').innerText = oppName;
      document.getElementById('sp2-info').querySelector('.emoji').innerText = oppEmoji;
    } else {
      document.getElementById('sp1-info').querySelector('.name').innerText = oppName;
      document.getElementById('sp1-info').querySelector('.emoji').innerText = oppEmoji;
      document.getElementById('sp2-info').querySelector('.name').innerText = myName;
      document.getElementById('sp2-info').querySelector('.emoji').innerText = myEmoji;
    }

    document.getElementById('sp1-score').innerText = this.isHost
      ? this.myTotalScore + ' pts'
      : this.opponentTotalScore + ' pts';
    document.getElementById('sp2-score').innerText = this.isHost
      ? this.opponentTotalScore + ' pts'
      : this.myTotalScore + ' pts';

    document.getElementById('stop-round-label').innerText = `R${this.currentRound}/${TOTAL_ROUNDS}`;
    document.getElementById('stop-current-letter').innerText = this.currentLetter;
    document.getElementById('stop-hint-letter').innerText = this.currentLetter;

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
  _triggerStop(by, opponentPayload = null) {
    if (this.stopTriggeredBy) return; // Ya se detuvo
    this.stopTriggeredBy = by;

    if (by === 'me') {
      // Enviar mis respuestas y el aviso de STOP
      this.network.send('STOP_TRIGGER', { stopper: this.isHost ? 'host' : 'guest' });
      this.network.send('STOP_ANSWERS', this.myAnswers);
      this._showStopOverlay('me');
      // Esperar respuestas del otro
      this._tryStartReview();
    } else {
      // El otro dio STOP: mostrar overlay
      this._showStopOverlay('opponent');
      // Enviar mis respuestas (aunque estén incompletas)
      this.network.send('STOP_ANSWERS', this.myAnswers);
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

  // Espera a tener ambas respuestas para iniciar revisión
  _tryStartReview() {
    // Necesito mis propias respuestas + las del oponente
    const myKeys  = Object.keys(this.myAnswers);
    const oppKeys = Object.keys(this.opponentAnswers);
    if (myKeys.length === 0 && this.stopTriggeredBy === 'me') return; // Aún no enviadas (no debería pasar)
    if (oppKeys.length === 0) return; // Esperando oponente

    // Pequeño delay para mostrar overlay
    setTimeout(() => this._buildReviewScreen(), 1000);
  }

  // ── Pantalla de revisión ─────────────────────
  _buildReviewScreen() {
    // Inicializar estructura de votos
    this.votes = {};
    this.selectedCats.forEach(cat => {
      this.votes[cat] = {
        // Votos sobre la respuesta del host
        host: { myVote: null, oppVote: null, resolved: false, pts: null },
        // Votos sobre la respuesta del guest
        guest: { myVote: null, oppVote: null, resolved: false, pts: null },
      };
    });

    document.getElementById('stop-review-round').innerText   = this.currentRound;
    document.getElementById('stop-review-letter').innerText  = this.currentLetter;

    const list = document.getElementById('stop-review-list');
    list.innerHTML = '';

    this.selectedCats.forEach((cat, idx) => {
      const info    = STOP_CATEGORIES[cat];
      const hostAns = this.isHost ? (this.myAnswers[cat]||'') : (this.opponentAnswers[cat]||'');
      const guestAns= this.isHost ? (this.opponentAnswers[cat]||'') : (this.myAnswers[cat]||'');

      const card = document.createElement('div');
      card.className = 'stop-review-card';
      card.style.animationDelay = `${idx * 0.07}s`;
      card.id = `review-card-${cat}`;

      card.innerHTML = `
        <div class="stop-review-card-header">
          <span class="cat-emoji">${info.emoji}</span>
          <span class="cat-name">${info.label}</span>
          <span class="cat-status" id="card-status-${cat}">Pendiente</span>
        </div>
        ${this._buildPlayerRow('host', cat, hostAns)}
        ${this._buildPlayerRow('guest', cat, guestAns)}
      `;
      list.appendChild(card);

      // Asignar listeners de votos
      this.selectedCats.forEach(() => {});
      this._attachVoteListeners(cat, 'host', hostAns);
      this._attachVoteListeners(cat, 'guest', guestAns);

      // Si una respuesta está vacía → auto 0 sin votación
      if (!hostAns.trim())  this._autoResolveEmpty(cat, 'host');
      if (!guestAns.trim()) this._autoResolveEmpty(cat, 'guest');
    });

    document.getElementById('stop-review-nav').style.display = 'none';
    this.reviewDone = false;
    this.opponentReviewDone = false;

    this.showView('view-stop-review');
  }

  _buildPlayerRow(side, cat, answer) {
    const profile  = side === 'host' ? (this.isHost ? this.myProfile : this.opponentProfile)
                                      : (this.isHost ? this.opponentProfile : this.myProfile);
    const isEmpty  = !answer.trim();
    const ansClass = isEmpty ? 'stop-review-answer empty' : 'stop-review-answer';
    const ansText  = isEmpty ? '(sin respuesta)' : answer;

    const voteBtns = isEmpty ? '' : `
      <div class="stop-vote-btns" id="vote-btns-${cat}-${side}">
        <button class="stop-vote-btn" data-vote="si"  data-cat="${cat}" data-side="${side}">
          <span class="vote-emoji">✅</span><span class="vote-label">Válida</span>
        </button>
        <button class="stop-vote-btn" data-vote="no"  data-cat="${cat}" data-side="${side}">
          <span class="vote-emoji">❌</span><span class="vote-label">No válida</span>
        </button>
        <button class="stop-vote-btn" data-vote="rep" data-cat="${cat}" data-side="${side}">
          <span class="vote-emoji">🔁</span><span class="vote-label">Repetida</span>
        </button>
      </div>
      <div id="vote-status-${cat}-${side}"></div>
    `;

    return `
      <div class="stop-review-player-row" id="player-row-${cat}-${side}">
        <div class="stop-review-player-info">
          <span class="stop-review-player-emoji">${profile.emoji}</span>
          <span class="stop-review-player-name">${profile.name}</span>
          <span class="${ansClass}">${ansText}</span>
        </div>
        ${voteBtns}
      </div>
    `;
  }

  _attachVoteListeners(cat, side, answer) {
    if (!answer.trim()) return; // Sin respuesta = sin votación
    const card = document.getElementById(`review-card-${cat}`);
    if (!card) return;
    card.querySelectorAll(`.stop-vote-btn[data-cat="${cat}"][data-side="${side}"]`)
      .forEach(btn => {
        btn.addEventListener('click', () => {
          const vote = btn.dataset.vote;
          this._castVote(cat, side, vote);
        });
      });
  }

  _autoResolveEmpty(cat, side) {
    const voteEntry = this.votes[cat][side];
    voteEntry.myVote  = 'no';
    voteEntry.oppVote = 'no';
    voteEntry.resolved = true;
    voteEntry.pts = 0;
    this._showResolvedUI(cat, side, 'empty', 0);
    this._checkAllResolved();
  }

  _castVote(cat, side, vote) {
    const voteEntry = this.votes[cat][side];
    if (voteEntry.resolved) return; // Ya resuelto

    // Actualizar mi voto
    voteEntry.myVote = vote;

    // Actualizar UI de botones
    const btnsDiv = document.getElementById(`vote-btns-${cat}-${side}`);
    if (btnsDiv) {
      btnsDiv.querySelectorAll('.stop-vote-btn').forEach(b => {
        b.classList.remove('selected-yes','selected-no','selected-rep');
        if (b.dataset.vote === vote) {
          b.classList.add(vote === 'si' ? 'selected-yes' : vote === 'no' ? 'selected-no' : 'selected-rep');
        }
      });
    }

    // Enviar mi voto al oponente
    this.network.send('STOP_VOTE', { cat, side, vote });

    // Mostrar "esperando al otro" si él aún no votó
    const statusDiv = document.getElementById(`vote-status-${cat}-${side}`);
    if (statusDiv && !voteEntry.oppVote) {
      statusDiv.innerHTML = `<div class="stop-vote-waiting">Esperando al otro jugador...</div>`;
    }

    this._tryResolveVote(cat, side);
  }

  _receiveOpponentVote(payload) {
    const { cat, side, vote } = payload;
    if (!this.votes[cat] || !this.votes[cat][side]) return;
    const voteEntry = this.votes[cat][side];
    if (voteEntry.resolved) return;

    voteEntry.oppVote = vote;
    this._tryResolveVote(cat, side);
  }

  _tryResolveVote(cat, side) {
    const voteEntry = this.votes[cat][side];
    if (!voteEntry.myVote || !voteEntry.oppVote) return; // Esperando al otro
    if (voteEntry.resolved) return;

    const mv = voteEntry.myVote;
    const ov = voteEntry.oppVote;

    if (mv === ov) {
      // ¡Acuerdo!
      voteEntry.resolved = true;
      let pts = 0;
      let type = mv;
      if (mv === 'si')  pts = 100;
      if (mv === 'no')  pts = 0;
      if (mv === 'rep') pts = 50;

      voteEntry.pts = pts;

      // Limpiar espera
      const statusDiv = document.getElementById(`vote-status-${cat}-${side}`);
      if (statusDiv) statusDiv.innerHTML = '';

      this._showResolvedUI(cat, side, type, pts);
      this._checkAllResolved();
    } else {
      // Desacuerdo — resetear votos para re-votar
      voteEntry.myVote  = null;
      voteEntry.oppVote = null;

      const btnsDiv = document.getElementById(`vote-btns-${cat}-${side}`);
      if (btnsDiv) btnsDiv.querySelectorAll('.stop-vote-btn').forEach(b =>
        b.classList.remove('selected-yes','selected-no','selected-rep')
      );

      const statusDiv = document.getElementById(`vote-status-${cat}-${side}`);
      if (statusDiv) {
        statusDiv.innerHTML = `<div class="stop-vote-conflict">⚠️ ¡No se pusieron de acuerdo! Vuelvan a votar.</div>`;
      }
    }
  }

  _showResolvedUI(cat, side, type, pts) {
    const btnsDiv = document.getElementById(`vote-btns-${cat}-${side}`);
    if (btnsDiv) btnsDiv.style.display = 'none';

    const statusDiv = document.getElementById(`vote-status-${cat}-${side}`);
    if (!statusDiv) return;

    let cls = 'result-no', icon = '❌', text = 'No válida', ptsText = '+0';
    if (type === 'si')    { cls = 'result-yes'; icon = '✅'; text = 'Válida';    ptsText = `+${pts}`; }
    if (type === 'rep')   { cls = 'result-rep'; icon = '🔁'; text = 'Repetida';  ptsText = `+${pts} (ambos)`; }
    if (type === 'empty') { cls = 'result-empty'; icon = '—'; text = 'Sin respuesta'; ptsText = '+0'; }

    statusDiv.innerHTML = `
      <div class="stop-vote-result ${cls}">
        <span>${icon} ${text}</span>
        <span class="stop-vote-result-pts">${ptsText}</span>
      </div>
    `;

    // Acumular puntos de ronda
    if (type === 'rep') {
      this._roundPts.host  = (this._roundPts.host  || 0) + 50;
      this._roundPts.guest = (this._roundPts.guest || 0) + 50;
    } else if (type === 'si') {
      this._roundPts[side] = (this._roundPts[side] || 0) + 100;
    }
    // 'no' y 'empty' = 0 puntos, no se acumula nada
  }

  _checkAllResolved() {
    const allDone = this.selectedCats.every(cat =>
      this.votes[cat].host.resolved && this.votes[cat].guest.resolved
    );
    if (!allDone) return;

    // Calcular puntos de ronda
    const myRole = this.isHost ? 'host' : 'guest';
    const oppRole= this.isHost ? 'guest' : 'host';
    const myRndPts  = this._roundPts[myRole]  || 0;
    const oppRndPts = this._roundPts[oppRole] || 0;

    this.myTotalScore       += myRndPts;
    this.opponentTotalScore += oppRndPts;
    this.roundScores.push({ my: myRndPts, opp: oppRndPts, round: this.currentRound });

    // Reset acumulador de ronda
    this._roundPts = { host: 0, guest: 0 };

    // Mostrar tablero de ronda
    this._showRoundScoreboard(myRndPts, oppRndPts);

    // Marcar como listo
    this.reviewDone = true;
    this.network.send('STOP_READY_NEXT', {});
    this._tryGoNextRound();
  }

  _showRoundScoreboard(myPts, oppPts) {
    const nav = document.getElementById('stop-review-nav');
    const board = document.getElementById('stop-round-scoreboard');
    nav.style.display = 'block';

    board.innerHTML = `
      <h3>🏅 Puntos de esta ronda</h3>
      <div class="stop-score-row">
        <div class="stop-score-player">
          <span>${this.myProfile.emoji}</span>
          <span>${this.myProfile.name}</span>
        </div>
        <div class="stop-score-value">${myPts}</div>
      </div>
      <div class="stop-score-row">
        <div class="stop-score-player">
          <span>${this.opponentProfile.emoji}</span>
          <span>${this.opponentProfile.name}</span>
        </div>
        <div class="stop-score-value">${oppPts}</div>
      </div>
      <div class="stop-score-row" style="margin-top:0.5rem;border-top:1px solid var(--border);padding-top:0.5rem;">
        <div class="stop-score-player" style="font-weight:700;color:var(--text-sub);">
          <span>🏆</span><span>Total acumulado</span>
        </div>
      </div>
      <div class="stop-score-row">
        <div class="stop-score-player">
          <span>${this.myProfile.emoji}</span>
          <span>${this.myProfile.name}</span>
        </div>
        <div class="stop-score-value">${this.myTotalScore}</div>
      </div>
      <div class="stop-score-row">
        <div class="stop-score-player">
          <span>${this.opponentProfile.emoji}</span>
          <span>${this.opponentProfile.name}</span>
        </div>
        <div class="stop-score-value">${this.opponentTotalScore}</div>
      </div>
    `;

    // Mostrar botón solo para host, guest espera
    if (this.isHost) {
      document.getElementById('btn-stop-next-round').classList.remove('hidden');
      document.getElementById('stop-waiting-next').classList.add('hidden');
    } else {
      document.getElementById('btn-stop-next-round').classList.add('hidden');
      document.getElementById('stop-waiting-next').classList.remove('hidden');
    }
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
        hostName: this.myProfile.name,
        hostEmoji: this.myProfile.emoji,
        guestName: this.opponentProfile.name,
        guestEmoji: this.opponentProfile.emoji,
      };
      this.network.send('STOP_START_GAME', nextPayload);
      this._startGame(nextPayload);
    }
  }

  _tryGoNextRound() {
    if (!this.reviewDone || !this.opponentReviewDone) return;
    // Si es el guest, ya puede mostrar el botón/esperar
    // El host controla la navegación, así que el guest solo espera
    if (!this.isHost) {
      // El guest ya marcó listo, espera que el host inicie siguiente ronda
      // La navegación real llegará como STOP_START_GAME o STOP_GAME_OVER
    }
  }

  _endGame() {
    const payload = {
      myScore:   this.myTotalScore,
      oppScore:  this.opponentTotalScore,
      roundScores: this.roundScores,
      winner: this.myTotalScore >= this.opponentTotalScore ? 'host' : 'guest',
    };
    this.network.send('STOP_GAME_OVER', payload);
    this._showFinalGameOver(payload);
  }

  _showFinalGameOver(payload) {
    const winner  = payload.winner; // 'host' | 'guest'
    const iMeWin  = (winner === 'host' && this.isHost) || (winner === 'guest' && !this.isHost);
    const myScore = this.isHost ? this.myTotalScore   : this.opponentTotalScore;
    const opScore = this.isHost ? this.opponentTotalScore : this.myTotalScore;

    document.getElementById('stop-trophy').innerText = iMeWin ? '🏆' : '😔';
    document.getElementById('stop-winner-text').innerText = iMeWin
      ? `¡${this.myProfile.name} ganó con ${myScore} puntos!`
      : `¡${this.opponentProfile.name} ganó con ${opScore} puntos!`;

    // Tabla final
    const scores = this.roundScores.length > 0
      ? this.roundScores
      : Array.from({length: TOTAL_ROUNDS}, (_,i) => ({round:i+1,my:0,opp:0}));

    const myTotal  = scores.reduce((s,r) => s + r.my, 0);
    const oppTotal = scores.reduce((s,r) => s + r.opp, 0);

    let rows = scores.map(r => {
      const myW  = r.my  > r.opp  ? 'winner-cell' : '';
      const oppW = r.opp > r.my   ? 'winner-cell' : '';
      return `<tr>
        <td class="round-col">R${r.round}</td>
        <td class="${myW}">${r.my}</td>
        <td class="${oppW}">${r.opp}</td>
      </tr>`;
    }).join('');

    const myTW  = myTotal  >= oppTotal ? 'winner-cell' : '';
    const oppTW = oppTotal >= myTotal  ? 'winner-cell' : '';

    const board = document.getElementById('stop-final-scoreboard');
    board.innerHTML = `
      <table class="stop-final-table">
        <thead>
          <tr>
            <th>Ronda</th>
            <th>${this.myProfile.emoji} ${this.myProfile.name}</th>
            <th>${this.opponentProfile.emoji} ${this.opponentProfile.name}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td>Total</td>
            <td class="${myTW}">${myTotal}</td>
            <td class="${oppTW}">${oppTotal}</td>
          </tr>
        </tbody>
      </table>
    `;

    this.showView('view-stop-gameover');
  }

  // ── Helpers ──────────────────────────────────
  _goHome() {
    this._disconnectNetwork();
    this._resetState();
    this.showView('view-home');
  }

  _resetState() {
    this.myAnswers        = {};
    this.opponentAnswers  = {};
    this.votes            = {};
    this.stopTriggeredBy  = null;
    this.reviewDone       = false;
    this.opponentReviewDone = false;
    this.myTotalScore     = 0;
    this.opponentTotalScore = 0;
    this.roundScores      = [];
    this.currentRound     = 1;
    this._roundPts        = { host: 0, guest: 0 };
    this.myProfile.isReady = false;
    this.opponentProfile.isReady = false;
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
