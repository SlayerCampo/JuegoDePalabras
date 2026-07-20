class PeerNetwork {
  constructor(isHost, onStateChange) {
    this.isHost = isHost;
    this.peer = null;
    this.connection = null;
    this.onStateChange = onStateChange; // Callback para informar a app.js
    this.myId = null;
    this.opponentId = null;
  }

  // Inicializa la conexión
  init() {
    return new Promise((resolve, reject) => {
      // Generar ID corto si es host
      const idOptions = this.isHost ? { id: this.generateShortId() } : {};

      this.peer = new Peer(idOptions.id, {
        debug: 2,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
      });

      this.peer.on("open", (id) => {
        this.myId = id;
        console.log("My peer ID is: " + id);
        resolve(id);
      });

      this.peer.on("error", (err) => {
        console.error("Peer error:", err);
        this.onStateChange({ type: "ERROR", payload: err });
        reject(err);
      });

      // Si somos Host, escuchamos conexiones entrantes
      if (this.isHost) {
        this.peer.on("connection", (conn) => {
          this.setupConnection(conn);
        });
      }
    });
  }

  generateShortId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Unirse a una sala (Guest)
  joinRoom(hostId) {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject("Peer not initialized");

      const conn = this.peer.connect(hostId.toUpperCase(), { reliable: true });
      let settled = false;
      const cleanupFailure = (err) => {
        if (settled) return;
        settled = true;
        try {
          conn.close();
        } catch (_) {
          // ignore cleanup errors
        }
        reject(err);
      };

      const timeoutId = setTimeout(() => {
        cleanupFailure(new Error("Connection timeout"));
      }, 8000);

      conn.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.setupConnection(conn);
        resolve(true);
      });

      conn.on("error", (err) => {
        clearTimeout(timeoutId);
        cleanupFailure(err);
      });

      conn.on("close", () => {
        if (!settled) {
          clearTimeout(timeoutId);
          cleanupFailure(new Error("Connection closed before opening"));
        }
      });
    });
  }

  setupConnection(conn) {
    this.connection = conn;
    this.opponentId = conn.peer;
    console.log("Connected to: ", this.opponentId);

    // Notificar que estamos conectados
    this.onStateChange({ type: "CONNECTED", payload: this.opponentId });

    // Escuchar mensajes
    this.connection.on("data", (data) => {
      console.log("Received data:", data);
      this.onStateChange(data); // data debe ser un objeto con {type, payload}
    });

    this.connection.on("close", () => {
      console.log("Connection closed");
      this.onStateChange({ type: "DISCONNECTED" });
    });
  }

  // Enviar datos al otro jugador
  send(type, payload) {
    if (this.connection && this.connection.open) {
      const message = { type, payload };
      this.connection.send(message);
    } else {
      console.warn("Connection is not open. Cannot send message.");
    }
  }

  disconnect() {
    if (this.connection) {
      this.connection.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    this.connection = null;
    this.peer = null;
    this.myId = null;
    this.opponentId = null;
  }
}
