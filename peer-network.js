class PeerNetwork {
  constructor(isHost, onStateChange) {
    this.isHost = isHost;
    this.peer = null;
    this.connections = {}; // { peerId: conn }
    this.onStateChange = onStateChange; // Callback para informar a app.js
    this.myId = null;
    this.hostId = null;
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
        if (this.isHost) {
          this.hostId = id;
        }
        resolve(id);
      });

      this.peer.on("error", (err) => {
        console.error("Peer error:", err);
        this.onStateChange({ type: "ERROR", payload: err });
        reject(err);
      });

      // Si somos Host, escuchamos múltiples conexiones entrantes
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
      this.hostId = hostId.toUpperCase();

      const conn = this.peer.connect(this.hostId, { reliable: true });
      let settled = false;
      
      const cleanupFailure = (err) => {
        if (settled) return;
        settled = true;
        try {
          conn.close();
        } catch (_) {}
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
    const peerId = conn.peer;
    this.connections[peerId] = conn;
    console.log("Connected to: ", peerId);

    // Notificar conexión
    if (this.isHost) {
      // Como host, notificamos que se conectó un cliente
      this.onStateChange({ type: "CLIENT_CONNECTED", payload: peerId });
    } else {
      // Como cliente, notificamos que nos conectamos al host
      this.onStateChange({ type: "CONNECTED", payload: peerId });
    }

    // Escuchar mensajes
    conn.on("data", (data) => {
      console.log("Received data from " + peerId + ":", data);
      
      // Añadir el senderId al payload si es un objeto, útil para el host
      if (typeof data === 'object' && data !== null) {
        data._senderId = peerId;
      }
      
      this.onStateChange(data);
    });

    conn.on("close", () => {
      console.log("Connection closed: ", peerId);
      delete this.connections[peerId];
      
      if (this.isHost) {
        this.onStateChange({ type: "CLIENT_DISCONNECTED", payload: peerId });
      } else {
        this.onStateChange({ type: "DISCONNECTED" });
      }
    });
  }

  // Enviar datos
  // Si somos host, enviamos a TODOS los clientes (broadcast) o a un objetivo específico.
  // Si somos cliente, enviamos al host.
  send(type, payload, targetPeerId = null) {
    const message = { type, payload };
    
    if (this.isHost) {
      if (targetPeerId) {
        // Enviar a un cliente específico
        const conn = this.connections[targetPeerId];
        if (conn && conn.open) {
          conn.send(message);
        }
      } else {
        // Broadcast a todos
        Object.values(this.connections).forEach(conn => {
          if (conn.open) {
            conn.send(message);
          }
        });
      }
    } else {
      // Cliente envía al host
      const conn = this.connections[this.hostId];
      if (conn && conn.open) {
        conn.send(message);
      } else {
        console.warn("Connection to host is not open.");
      }
    }
  }

  disconnect() {
    Object.values(this.connections).forEach(conn => {
      try { conn.close(); } catch(e) {}
    });
    this.connections = {};
    
    if (this.peer) {
      this.peer.destroy();
    }
    this.peer = null;
    this.myId = null;
    this.hostId = null;
  }
}

