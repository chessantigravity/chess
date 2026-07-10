/* =============================================================
   ANTIGRAVITY CHESS — App Coordinator (app.js)
   Handles UI, routing, timers, lobbying, chat
   ============================================================= */

/* Global app state accessible by game.js and network.js */
window.APP = {
    mode:          'ai',          // 'ai' | 'pass' | 'online'
    clocks:        { w: 0, b: 0, inc: 0 },
    timerInterval: null,
    preset:        { min: 3, inc: 2 },

    onMoveDone(movedColor) {
        // Increment for the player who just moved
        this.clocks[movedColor] += this.clocks.inc;
        updateClockUI();
    }
};

/* ============================================================= */
/*  BOOT                                                          */
/* ============================================================= */
document.addEventListener('DOMContentLoaded', () => {

    // Auto-join from URL ?room=ID
    const params    = new URLSearchParams(window.location.search);
    const autoRoom  = params.get('room');

    // Time preset buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const min = btn.getAttribute('data-min');
            const inc = parseInt(btn.getAttribute('data-inc') || '0');
            const customRow = document.getElementById('custom-time-row');
            if (min === 'custom') {
                customRow.style.display = 'flex';
                APP.preset.min = parseInt(document.getElementById('inp-mins').value) || 5;
                APP.preset.inc = parseInt(document.getElementById('inp-inc').value)  || 0;
            } else {
                customRow.style.display = 'none';
                APP.preset.min = parseInt(min);
                APP.preset.inc = inc;
            }
        });
    });

    document.getElementById('inp-mins').addEventListener('input', () => {
        APP.preset.min = parseInt(document.getElementById('inp-mins').value) || 5;
    });
    document.getElementById('inp-inc').addEventListener('input', () => {
        APP.preset.inc = parseInt(document.getElementById('inp-inc').value) || 0;
    });

    // Host / Join / AI / Pass
    document.getElementById('btn-host').addEventListener('click', hostGame);
    document.getElementById('btn-join').addEventListener('click', () => {
        let val = document.getElementById('inp-room').value.trim();
        if (!val) { toast('Enter a room code or link'); return; }
        // Extract room ID from URL if pasted as full link
        try {
            const u = new URL(val);
            val = u.searchParams.get('room') || val;
        } catch(_) {}
        joinGame(val);
    });
    document.getElementById('btn-cancel-host').addEventListener('click', cancelHost);
    document.getElementById('btn-ai').addEventListener('click', startAI);
    document.getElementById('btn-pass').addEventListener('click', startPass);

    // In-game controls
    document.getElementById('btn-resign').addEventListener('click', () => {
        if (!confirm('Resign the game?')) return;
        clearInterval(APP.timerInterval);
        const winner = ChessGame.getMyColor() === 'w' ? 'Black' : 'White';
        showGameOver('🏳️', `${winner} wins!`, 'Opponent resigned.');
        if (APP.mode === 'online') Network.send({ type: 'resign' });
    });
    document.getElementById('btn-draw').addEventListener('click', () => {
        if (APP.mode !== 'online') { toast('Draw offer only in online mode'); return; }
        toast('Draw offer sent');
        Network.send({ type: 'draw_offer' });
    });
    document.getElementById('btn-home').addEventListener('click', () => {
        if (!confirm('Return to lobby? Game progress will be lost.')) return;
        clearInterval(APP.timerInterval);
        Network.disconnect();
        showLobby();
    });

    // Game over modal
    document.getElementById('btn-go-close').addEventListener('click', () => {
        document.getElementById('gameover-overlay').style.display = 'none';
    });
    document.getElementById('btn-rematch').addEventListener('click', () => {
        document.getElementById('gameover-overlay').style.display = 'none';
        if (APP.mode === 'online') {
            toast('Rematch offer sent…');
            Network.send({ type: 'rematch_offer' });
        } else {
            // Offline rematch — swap colors
            const next = ChessGame.getMyColor() === 'w' ? 'b' : 'w';
            startMatch(next);
        }
    });

    // Chat
    document.getElementById('btn-chat-send').addEventListener('click', sendChat);
    document.getElementById('chat-inp').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendChat();
    });

    // Network init
    Network.init();

    // Auto-join if URL has room param
    if (autoRoom) {
        setTimeout(() => joinGame(autoRoom), 1500);
    }
});

/* ============================================================= */
/*  THEME                                                         */
/* ============================================================= */
function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.getElementById('pill-mono').classList.toggle('active', t === 'mono');
    document.getElementById('pill-wood').classList.toggle('active', t === 'wood');
}

/* ============================================================= */
/*  LOBBY / GAME ROUTING                                          */
/* ============================================================= */
function showLobby() {
    document.getElementById('lobby').classList.add('active');
    document.getElementById('game').classList.remove('active');
    // Reset host UI
    document.getElementById('btn-host').style.display = '';
    document.getElementById('host-info').style.display = 'none';
    Network.init(); // re-open peer
}

function showGameScreen() {
    document.getElementById('lobby').classList.remove('active');
    document.getElementById('game').classList.add('active');
}

/* ============================================================= */
/*  HOST GAME                                                     */
/* ============================================================= */
function hostGame() {
    APP.mode = 'online';
    document.getElementById('btn-host').style.display = 'none';
    document.getElementById('host-info').style.display = 'flex';
    document.getElementById('host-waiting-msg').style.display = 'block';
    document.getElementById('host-link-row').style.display = 'none';

    Network.host(
        // When peer ID is ready
        (peerId) => {
            document.getElementById('host-waiting-msg').style.display = 'none';
            document.getElementById('host-link-row').style.display = 'block';
            document.getElementById('room-code-display').textContent = peerId;
            const link = `${location.origin}${location.pathname}?room=${peerId}`;
            document.getElementById('invite-link-inp').value = link;
        },
        // When guest connects
        () => {
            document.getElementById('host-info').style.display = 'none';
            document.getElementById('btn-host').style.display = '';
            startMatch('w');
        }
    );
}

function cancelHost() {
    Network.disconnect();
    document.getElementById('host-info').style.display = 'none';
    document.getElementById('btn-host').style.display = '';
}

function copyLink() {
    const link = document.getElementById('invite-link-inp').value;
    navigator.clipboard.writeText(link).then(() => toast('Link copied!')).catch(() => {
        document.getElementById('invite-link-inp').select();
        document.execCommand('copy');
        toast('Link copied!');
    });
}

/* ============================================================= */
/*  JOIN GAME                                                     */
/* ============================================================= */
function joinGame(roomId) {
    APP.mode = 'online';
    toast('Connecting…');
    Network.join(roomId, () => {
        // Guest always gets black
        startMatch('b');
    });
}

/* ============================================================= */
/*  OFFLINE MODES                                                 */
/* ============================================================= */
function startAI()   { APP.mode = 'ai';   startMatch('w'); }
function startPass() { APP.mode = 'pass'; startMatch('w'); }

/* ============================================================= */
/*  MATCH SETUP                                                   */
/* ============================================================= */
function startMatch(myColor) {
    clearInterval(APP.timerInterval);
    showGameScreen();

    // Reset clocks
    const ms = APP.preset.min * 60 * 1000;
    APP.clocks = { w: ms, b: ms, inc: APP.preset.inc * 1000 };

    // Player info
    const isOnline = APP.mode === 'online';
    const isAI     = APP.mode === 'ai';
    const localName = myColor === 'w' ? 'White' : 'Black';
    const oppName   = myColor === 'w'
        ? (isAI ? 'AI Engine' : 'Black')
        : (isAI ? 'AI Engine' : 'White');

    document.getElementById('nm-me').textContent  = localName;
    document.getElementById('nm-opp').textContent = oppName;
    document.getElementById('av-me').textContent  = myColor === 'w' ? 'W' : 'B';
    document.getElementById('av-opp').textContent = myColor === 'w' ? 'B' : 'W';

    document.getElementById('match-title').textContent =
        isAI ? 'vs AI Engine' : isOnline ? 'Online Multiplayer' : 'Local Hotseat';
    document.getElementById('match-sub').textContent =
        `${APP.preset.min}m + ${APP.preset.inc}s`;

    // Reset move log, captures, chat
    document.getElementById('move-log').innerHTML   = '';
    document.getElementById('cap-me').textContent   = '';
    document.getElementById('cap-opp').textContent  = '';
    document.getElementById('chat-log').innerHTML   = '';

    const chatGreet = isOnline ? '🔗 Connected to opponent!' : '♟ Game started. Good luck!';
    addChatMsg('sys', chatGreet);

    updateClockUI();

    // Start chess engine
    ChessGame.startGame(myColor);

    // Start clock
    startClock();
}

/* ============================================================= */
/*  CLOCK                                                         */
/* ============================================================= */
function startClock() {
    clearInterval(APP.timerInterval);
    APP.timerInterval = setInterval(() => {
        const turn      = ChessGame.getTurn();
        const myColor   = ChessGame.getMyColor();
        const localBar  = document.getElementById('strip-me');
        const oppBar    = document.getElementById('strip-opp');

        // Highlight active player
        localBar.classList.toggle('active', turn === myColor);
        oppBar.classList.toggle('active',   turn !== myColor);

        // Drain the active player's clock
        APP.clocks[turn] = Math.max(0, APP.clocks[turn] - 100);
        updateClockUI();

        // Time out
        if (APP.clocks.w <= 0) flagOut('w');
        else if (APP.clocks.b <= 0) flagOut('b');
    }, 100);
}

function flagOut(color) {
    clearInterval(APP.timerInterval);
    const winner = color === 'w' ? 'Black' : 'White';
    showGameOver('⏰', `${winner} wins!`, 'Opponent ran out of time.');
    if (APP.mode === 'online') Network.send({ type: 'flag', color });
}

function updateClockUI() {
    const fmt = (ms) => {
        const s = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    };
    const mc = ChessGame.getMyColor();
    const oc = mc === 'w' ? 'b' : 'w';
    document.getElementById('clk-me').textContent  = fmt(APP.clocks[mc]);
    document.getElementById('clk-opp').textContent = fmt(APP.clocks[oc]);
}

/* ============================================================= */
/*  CHAT                                                          */
/* ============================================================= */
function sendChat() {
    const inp = document.getElementById('chat-inp');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    addChatMsg('me', msg);
    if (APP.mode === 'online') Network.send({ type: 'chat', text: msg });
}

/* ============================================================= */
/*  TAB SWITCHING                                                 */
/* ============================================================= */
function switchTab(t) {
    const isMoves = t === 'moves';
    document.getElementById('tab-moves').classList.toggle('active', isMoves);
    document.getElementById('tab-chat').classList.toggle('active', !isMoves);
    document.getElementById('pane-moves').classList.toggle('active', isMoves);
    document.getElementById('pane-chat').classList.toggle('active', !isMoves);
}

/* ============================================================= */
/*  TOAST                                                         */
/* ============================================================= */
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2500);
}
