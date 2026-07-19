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
                debug: 2
            });

            this.peer.on('open', (id) => {
                this.myId = id;
                console.log('My peer ID is: ' + id);
                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                this.onStateChange({ type: 'ERROR', payload: err });
                reject(err);
            });

            // Si somos Host, escuchamos conexiones entrantes
            if (this.isHost) {
                this.peer.on('connection', (conn) => {
                    this.setupConnection(conn);
                });
            }
        });
    }

    generateShortId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
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
            
            conn.on('open', () => {
                this.setupConnection(conn);
                resolve(true);
            });

            conn.on('error', (err) => {
                reject(err);
            });
        });
    }

    setupConnection(conn) {
        this.connection = conn;
        this.opponentId = conn.peer;
        console.log("Connected to: ", this.opponentId);

        // Notificar que estamos conectados
        this.onStateChange({ type: 'CONNECTED', payload: this.opponentId });

        // Escuchar mensajes
        this.connection.on('data', (data) => {
            console.log("Received data:", data);
            this.onStateChange(data); // data debe ser un objeto con {type, payload}
        });

        this.connection.on('close', () => {
            console.log("Connection closed");
            this.onStateChange({ type: 'DISCONNECTED' });
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
    }
}
