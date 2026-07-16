/* =============================================================
   CHESS — Network Layer (network.js)
   PeerJS WebRTC P2P for online multiplayer
   ============================================================= */

const Network = (() => {

    let peer         = null;
    let conn         = null;
    let connected    = false;
    let myPeerId     = '';
    let onPeerReady  = null;
    let onGuest      = null;
    let onJoinCb     = null;

    /* ---------- Status badge ---------- */
    function setStatus(state, label) {
        const dot = document.getElementById('net-dot');
        const txt = document.getElementById('net-status');
        dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
        txt.textContent = label;
    }

    /* ---------- Init / re-open peer ---------- */
    function init() {
        // Clean up existing peer
        if (peer && !peer.destroyed) { peer.destroy(); }
        peer     = null;
        conn     = null;
        connected = false;
        myPeerId = '';

        setStatus('', 'Connecting…');

        try {
            peer = new Peer({
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                debug: 0
            });

            peer.on('open', id => {
                myPeerId = id;
                setStatus('ok', 'Ready');
                if (onPeerReady) { onPeerReady(id); onPeerReady = null; }
            });

            peer.on('error', err => {
                console.error('Peer error:', err.type, err);
                setStatus('err', 'Network error');
                if (err.type === 'peer-unavailable') {
                    toast('Room not found — check the room code');
                } else {
                    toast('Connection error: ' + err.type);
                }
            });

            peer.on('disconnected', () => {
                setStatus('', 'Offline');
                // Auto-reconnect once
                setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 2000);
            });

            // HOST: listen for incoming connections
            peer.on('connection', incomingConn => {
                if (conn) {
                    // Room is full — reject
                    incomingConn.on('open', () => {
                        incomingConn.send({ type: 'room_full' });
                        setTimeout(() => incomingConn.close(), 500);
                    });
                    return;
                }
                conn = incomingConn;
                bindConn();
                conn.on('open', () => {
                    connected = true;
                    toast('Opponent connected!');
                    // Send clock preset to guest
                    conn.send({ type: 'clock_sync', min: APP.preset.min, inc: APP.preset.inc });
                    if (onGuest) { onGuest(); onGuest = null; }
                });
            });

        } catch (e) {
            setStatus('err', 'Failed');
            console.error('PeerJS init failed:', e);
        }
    }

    /* ---------- Host ---------- */
    function host(onReady, onGuestConnected) {
        onGuest = onGuestConnected;
        if (myPeerId) {
            onReady(myPeerId);
        } else {
            onPeerReady = onReady;
            if (!peer || peer.destroyed) init();
        }
    }

    /* ---------- Join ---------- */
    function join(hostId, onConnected) {
        onJoinCb = onConnected;
        if (!peer || peer.destroyed) {
            // Wait for peer to open before connecting
            onPeerReady = () => doConnect(hostId);
            init();
        } else if (!myPeerId) {
            onPeerReady = () => doConnect(hostId);
        } else {
            doConnect(hostId);
        }
    }

    function doConnect(hostId) {
        conn = peer.connect(hostId, { reliable: true });
        bindConn();
        conn.on('open', () => {
            connected = true;
            toast('Connected to host!');
            if (onJoinCb) { onJoinCb(); onJoinCb = null; }
        });
    }

    /* ---------- Bind data events ---------- */
    function bindConn() {
        if (!conn) return;
        conn.on('data', handlePacket);
        conn.on('close', handleClose);
        conn.on('error', e => { console.error('Conn error:', e); handleClose(); });
    }

    /* ---------- Handle incoming packets ---------- */
    function handlePacket(pkt) {
        if (!pkt) return;
        switch (pkt.type) {

            case 'room_full':
                toast('Room is full!');
                disconnect();
                break;

            case 'clock_sync':
                APP.preset.min = pkt.min;
                APP.preset.inc = pkt.inc;
                break;

            case 'move':
                ChessGame.applyRemoteMove(pkt.from, pkt.to, pkt.promo, pkt.clocks);
                break;

            case 'chat':
                addChatMsg('them', pkt.text);
                break;

            case 'flag':
                clearInterval(APP.timerInterval);
                const w = pkt.color === 'w' ? 'Black' : 'White';
                showGameOver('⏰', `${w} wins!`, 'Opponent ran out of time.');
                break;

            case 'resign':
                clearInterval(APP.timerInterval);
                const rw = ChessGame.getMyColor() === 'w' ? 'White' : 'Black';
                showGameOver('🏳️', `${rw} wins!`, 'Opponent resigned.');
                break;

            case 'draw_offer':
                if (confirm('Opponent offers a draw. Accept?')) {
                    send({ type: 'draw_accept' });
                    showGameOver('🤝', 'Draw', 'Agreed by both players.');
                } else {
                    send({ type: 'draw_reject' });
                }
                break;

            case 'draw_accept':
                toast('Draw accepted!');
                showGameOver('🤝', 'Draw', 'Agreed by both players.');
                break;

            case 'draw_reject':
                toast('Draw declined.');
                break;

            case 'rematch_offer':
                if (confirm('Opponent wants a rematch! Accept?')) {
                    send({ type: 'rematch_accept' });
                    const next = ChessGame.getMyColor() === 'w' ? 'b' : 'w';
                    startMatch(next);
                }
                break;

            case 'rematch_accept':
                toast('Rematch accepted!');
                const nc = ChessGame.getMyColor() === 'w' ? 'b' : 'w';
                startMatch(nc);
                break;
        }
    }

    /* ---------- Disconnect handler ---------- */
    function handleClose() {
        if (connected) {
            connected = false;
            addChatMsg('sys', '⚠️ Opponent disconnected.');
            clearInterval(APP.timerInterval);
        }
        conn = null;
    }

    /* ---------- Send ---------- */
    function send(pkt) {
        if (conn && connected) {
            try { conn.send(pkt); } catch(e) { console.warn('Send failed:', e); }
        }
    }

    /* ---------- Disconnect ---------- */
    function disconnect() {
        connected = false;
        if (conn) { try { conn.close(); } catch(_){} conn = null; }
        if (peer && !peer.destroyed) { try { peer.destroy(); } catch(_){} peer = null; }
        myPeerId = '';
        setStatus('', 'Offline');
    }

    return { init, host, join, send, disconnect };

})();
