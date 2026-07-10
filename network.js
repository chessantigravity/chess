// PeerJS WebRTC P2P Matchmaking and Connection Manager
// Synchronizes moves, game state events, in-game chat, and clock values between two clients

const ChessNetwork = (() => {
    let peer = null;
    let conn = null;
    let isConnected = false;
    let activePeerId = '';
    
    // Custom PeerJS signaling configurations
    // Uses the free hosted public broker server
    const peerConfig = {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 1 // Only log errors
    };

    // Setup local PeerJS instance and connection indicators
    function setupPeer() {
        const badgeDot = document.getElementById('network-dot');
        const badgeStatus = document.getElementById('network-status');
        
        badgeDot.className = 'badge-dot connecting';
        badgeStatus.textContent = 'Connecting network...';
        
        try {
            peer = new Peer(peerConfig);
            
            peer.on('open', (id) => {
                activePeerId = id;
                badgeDot.className = 'badge-dot connected';
                badgeStatus.textContent = 'Ready (Online)';
                console.log('PeerJS server connection open. ID:', id);
            });
            
            peer.on('error', (err) => {
                console.error('PeerJS error encountered:', err);
                badgeDot.className = 'badge-dot';
                badgeStatus.textContent = 'Network offline';
                
                if (err.type === 'peer-unavailable') {
                    showToast('Room not found! Double check the room code.');
                    document.getElementById('lobby-screen').classList.add('active');
                    document.getElementById('game-screen').classList.remove('active');
                } else {
                    showToast(`Connection error: ${err.type}`);
                }
            });
            
            peer.on('disconnected', () => {
                console.log('PeerJS disconnected from signaling server.');
                badgeDot.className = 'badge-dot';
                badgeStatus.textContent = 'Signaling offline';
            });
            
        } catch (e) {
            console.error('Failed to create PeerJS object:', e);
            badgeDot.className = 'badge-dot';
            badgeStatus.textContent = 'Error';
        }
    }

    // Host room - wait for connection
    function initializeHost(onPeerIdReady, onGuestConnected) {
        if (!peer || peer.destroyed) {
            setupPeer();
        }
        
        // Wait for Peer to open signaling and generate ID
        const checkInterval = setInterval(() => {
            if (activePeerId) {
                clearInterval(checkInterval);
                onPeerIdReady(activePeerId);
            }
        }, 100);
        
        // Listen for incoming client connections
        peer.on('connection', (connection) => {
            if (conn) {
                // Reject connection if room is occupied
                connection.on('open', () => {
                    connection.send({ type: 'room_full' });
                    setTimeout(() => connection.close(), 500);
                });
                return;
            }
            
            conn = connection;
            setupConnectionListeners();
            
            conn.on('open', () => {
                isConnected = true;
                showToast('Opponent connected!');
                
                // Transmit clock variables to Guest so both boards match clocks
                conn.send({
                    type: 'init_clock',
                    time: appState.clockPreset.time,
                    inc: appState.clockPreset.inc
                });
                
                onGuestConnected();
            });
        });
    }

    // Join room - connect to Peer ID
    function connectToHost(hostId, onConnectedCallback) {
        if (!peer || peer.destroyed) {
            setupPeer();
        }
        
        showToast('Connecting to Host...');
        
        conn = peer.connect(hostId, {
            reliable: true
        });
        
        setupConnectionListeners();
        
        conn.on('open', () => {
            isConnected = true;
            showToast('Connected to room!');
            onConnectedCallback();
        });
    }

    // Bind data channel message listeners
    function setupConnectionListeners() {
        if (!conn) return;
        
        conn.on('data', (data) => {
            console.log('Packet received:', data);
            handleIncomingPacket(data);
        });
        
        conn.on('close', () => {
            console.log('Data connection closed by peer.');
            handleDisconnect();
        });
        
        conn.on('error', (err) => {
            console.error('Data channel error:', err);
            handleDisconnect();
        });
    }

    // Parse packet payloads
    function handleIncomingPacket(packet) {
        if (!packet) return;
        
        switch (packet.type) {
            case 'room_full':
                showToast('Room is already full! Redirecting home...');
                destroyConnection();
                handleExitToLobby();
                break;
                
            case 'init_clock':
                // Synchronize preset clocks sent from Host
                appState.clockPreset.time = packet.time;
                appState.clockPreset.inc = packet.inc;
                document.getElementById('match-type-indicator').textContent = 
                    `${packet.time}m + ${packet.inc}s clock`;
                break;
                
            case 'move':
                ChessGameController.handleRemoteMove(packet.from, packet.to, packet.promotion, packet.clocks);
                break;
                
            case 'chat':
                appendChatBubble('remote', packet.text);
                break;
                
            case 'flag':
                const loserColor = packet.color;
                const winner = loserColor === 'w' ? 'Black' : 'White';
                ChessGameController.announceGameOver(`${winner} Wins!`, 'Opponent flagged (out of time).');
                break;
                
            case 'resign':
                const resColor = packet.color;
                const resWinner = resColor === 'w' ? 'Black' : 'White';
                ChessGameController.announceGameOver(`${resWinner} Wins!`, 'Opponent resigned.');
                break;
                
            case 'draw_offer':
                if (confirm('Opponent offers a draw. Do you accept?')) {
                    sendMatchPacket({ type: 'draw_accept' });
                    ChessGameController.announceGameOver('Draw Agreed', 'Players agreed to a draw.');
                } else {
                    sendMatchPacket({ type: 'draw_reject' });
                }
                break;
                
            case 'draw_accept':
                showToast('Draw accepted!');
                ChessGameController.announceGameOver('Draw Agreed', 'Players agreed to a draw.');
                break;
                
            case 'draw_reject':
                showToast('Opponent declined the draw offer.');
                break;
                
            case 'rematch_offer':
                if (confirm('Opponent offered a rematch! Swap colors and play again?')) {
                    sendMatchPacket({ type: 'rematch_accept' });
                    ChessGameController.resetGameAndSwapColors();
                }
                break;
                
            case 'rematch_accept':
                showToast('Rematch accepted!');
                ChessGameController.resetGameAndSwapColors();
                break;
        }
    }

    // Transmit data packets
    function sendMatchPacket(packet) {
        if (conn && isConnected) {
            conn.send(packet);
        }
    }

    function handleDisconnect() {
        if (isConnected) {
            isConnected = false;
            showToast('Opponent disconnected from game!');
            appendChatBubble('system', 'Connection lost. Match aborted.');
            clearInterval(appState.timerInterval);
        }
    }

    // Destroy active channel connections
    function destroyConnection() {
        isConnected = false;
        if (conn) {
            conn.close();
            conn = null;
        }
        if (peer && !peer.destroyed) {
            peer.destroy();
            peer = null;
        }
        activePeerId = '';
    }

    return {
        setupPeer: setupPeer,
        initializeHost: initializeHost,
        connectToHost: connectToHost,
        sendMatchPacket: sendMatchPacket,
        destroyConnection: destroyConnection
    };
})();
