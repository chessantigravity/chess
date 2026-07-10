// Core Application Coordinator for Antigravity Chess
// Coordinates page routing, UI inputs, game mode setup, timers, and SFX engine

// Global state variables
let appState = {
    activeScreen: 'lobby', // 'lobby' or 'game'
    gameMode: 'vs_ai',     // 'vs_ai', 'pass_play', 'p2p_host', 'p2p_join'
    theme: 'monochrome',   // 'monochrome' or 'wood'
    clockPreset: { time: 3, inc: 2 }, // minutes, increment in seconds
    timerInterval: null,
    timers: {
        w: 0, // milliseconds remaining for white
        b: 0, // milliseconds remaining for black
        increment: 0 // increment in milliseconds
    },
    turn: 'w' // active turn 'w' or 'b'
};

// Web Audio API Sound Generator
const ChessSFX = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playMove() {
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    },
    playCapture() {
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        
        // High impact sound + sub bounce
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();
        
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc2.connect(gain2); gain2.connect(ctx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(450, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.08);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(120, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.1);
        
        osc1.start(); osc2.start();
        osc1.stop(ctx.currentTime + 0.1); osc2.stop(ctx.currentTime + 0.1);
    },
    playCheck() {
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const playBeep = (freq, time, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.18, time);
            gain.gain.exponentialRampToValueAtTime(0.002, time + duration);
            osc.start(time);
            osc.stop(time + duration);
        };
        const t = ctx.currentTime;
        playBeep(587.33, t, 0.12); // D5
        playBeep(739.99, t + 0.14, 0.22); // F#5
    },
    playGameOver() {
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime;
        const playBeep = (freq, time, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.002, time + duration);
            osc.start(time);
            osc.stop(time + duration);
        };
        playBeep(440, t, 0.22);
        playBeep(554, t + 0.15, 0.22);
        playBeep(659, t + 0.3, 0.35);
    }
};

// UI Initializations & Navigation
document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameters for auto-joining a hosted room
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get('room');
    if (joinRoomId) {
        document.getElementById('room-id-input').value = joinRoomId;
        // Small delay to allow PeerJS signaling initialization
        setTimeout(() => {
            handleJoinGame(joinRoomId);
        }, 1200);
    }

    // Preset Time controls binding
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const timePreset = btn.getAttribute('data-time');
            const customDrawer = document.getElementById('custom-time-inputs-div');
            
            if (timePreset === 'custom') {
                customDrawer.style.display = 'flex';
                appState.clockPreset.time = parseInt(document.getElementById('custom-minutes').value) || 5;
                appState.clockPreset.inc = parseInt(document.getElementById('custom-increment').value) || 3;
            } else {
                customDrawer.style.display = 'none';
                appState.clockPreset.time = parseInt(timePreset);
                appState.clockPreset.inc = parseInt(btn.getAttribute('data-inc'));
            }
        });
    });

    // Custom time input listener updates
    document.getElementById('custom-minutes').addEventListener('change', (e) => {
        if (document.getElementById('custom-time-btn').classList.contains('active')) {
            appState.clockPreset.time = Math.max(1, parseInt(e.target.value) || 5);
        }
    });
    document.getElementById('custom-increment').addEventListener('change', (e) => {
        if (document.getElementById('custom-time-btn').classList.contains('active')) {
            appState.clockPreset.inc = Math.max(0, parseInt(e.target.value) || 0);
        }
    });

    // Setup action buttons click listeners
    document.getElementById('btn-host-game').addEventListener('click', handleHostGame);
    document.getElementById('btn-join-game').addEventListener('click', () => {
        const id = document.getElementById('room-id-input').value.trim();
        if (id) handleJoinGame(id);
        else showToast('Please enter a valid room code!');
    });
    
    document.getElementById('btn-play-ai').addEventListener('click', handleStartVS_AI);
    document.getElementById('btn-play-local').addEventListener('click', handleStartPassPlay);
    document.getElementById('btn-copy-invite-link').addEventListener('click', copyInviteLink);
    document.getElementById('btn-cancel-host').addEventListener('click', cancelHostRoom);
    
    // Inline host card listeners
    document.getElementById('btn-copy-card-link').addEventListener('click', copyCardInviteLink);
    document.getElementById('btn-cancel-card-host').addEventListener('click', cancelCardHostRoom);
    
    document.getElementById('btn-resign-match').addEventListener('click', handleResignMatch);
    document.getElementById('btn-offer-draw').addEventListener('click', handleOfferDraw);
    document.getElementById('btn-exit-lobby').addEventListener('click', handleExitToLobby);
    document.getElementById('btn-gameover-close').addEventListener('click', () => {
        document.getElementById('gameover-overlay').classList.remove('active');
    });

    // Chat sending elements
    document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input-box').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // Initialize Network signaling listener
    ChessNetwork.setupPeer();
});

// App themes changer
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    appState.theme = theme;

    const monoBtn = document.getElementById('theme-mono-btn');
    const woodBtn = document.getElementById('theme-wood-btn');

    if (theme === 'monochrome') {
        monoBtn.classList.add('active');
        woodBtn.classList.remove('active');
    } else {
        monoBtn.classList.remove('active');
        woodBtn.classList.add('active');
    }

    // Redraw board with new theme colors if game is active
    if (appState.activeScreen === 'game' && typeof ChessGameController !== 'undefined') {
        ChessGameController.fullRender();
    }
}

// Show a feedback toast message
function showToast(message) {
    const toast = document.getElementById('toast-message');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Tab Switching in Game Sidebar
function switchTab(tabName) {
    const movesTab = document.getElementById('tab-moves-btn');
    const chatTab = document.getElementById('tab-chat-btn');
    const movesContent = document.getElementById('tab-content-moves');
    const chatContent = document.getElementById('tab-content-chat');
    
    if (tabName === 'moves') {
        movesTab.classList.add('active');
        chatTab.classList.remove('active');
        movesContent.classList.add('active');
        chatContent.classList.remove('active');
    } else {
        movesTab.classList.remove('active');
        chatTab.classList.add('active');
        movesContent.classList.remove('active');
        chatContent.classList.add('active');
    }
}

// Page View Router
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId + '-screen').classList.add('active');
    appState.activeScreen = screenId;
}

// ---------------- HOST GAME LOGIC ----------------
function handleHostGame() {
    appState.gameMode = 'p2p_host';
    showToast('Initializing connection...');
    
    // UI updates: immediately hide host button and show loading inline details box
    const hostBtn = document.getElementById('btn-host-game');
    const detailsPanel = document.getElementById('host-connection-details');
    const statusText = document.getElementById('host-status-text');
    const contentPanel = document.getElementById('host-details-content');
    
    hostBtn.style.display = 'none';
    detailsPanel.style.display = 'flex';
    statusText.style.display = 'block';
    statusText.textContent = 'Connecting to matchmaking...';
    contentPanel.style.display = 'none';
    
    ChessNetwork.initializeHost((peerId) => {
        // Peer initialized callback, display host link details inline
        statusText.style.display = 'none';
        contentPanel.style.display = 'flex';
        
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${peerId}`;
        document.getElementById('card-invite-link').value = inviteLink;
        document.getElementById('card-invite-code').textContent = peerId;
    }, () => {
        // Player connected callback (game begins!)
        detailsPanel.style.display = 'none';
        hostBtn.style.display = 'inline-flex';
        
        // Host gets white pieces
        setupMatchState('White Player', 'Guest (Black)', 'w', true);
    });
}

function copyInviteLink() {
    const inviteLink = document.getElementById('invite-link-textbox');
    inviteLink.select();
    inviteLink.setSelectionRange(0, 99999);
    
    try {
        navigator.clipboard.writeText(inviteLink.value);
        showToast('Link copied to clipboard!');
    } catch (err) {
        document.execCommand('copy');
        showToast('Link copied!');
    }
}

function copyCardInviteLink() {
    const inviteLink = document.getElementById('card-invite-link');
    inviteLink.select();
    inviteLink.setSelectionRange(0, 99999);
    
    try {
        navigator.clipboard.writeText(inviteLink.value);
        showToast('Link copied to clipboard!');
    } catch (err) {
        document.execCommand('copy');
        showToast('Link copied!');
    }
}

function cancelHostRoom() {
    document.getElementById('host-link-overlay').classList.remove('active');
    ChessNetwork.destroyConnection();
}

function cancelCardHostRoom() {
    const hostBtn = document.getElementById('btn-host-game');
    const detailsPanel = document.getElementById('host-connection-details');
    
    detailsPanel.style.display = 'none';
    hostBtn.style.display = 'inline-flex';
    
    ChessNetwork.destroyConnection();
    showToast('Room hosting cancelled.');
}

// ---------------- JOIN GAME LOGIC ----------------
function handleJoinGame(roomId) {
    appState.gameMode = 'p2p_join';
    showToast(`Joining Room: ${roomId}...`);
    
    ChessNetwork.connectToHost(roomId, () => {
        // On connection successful
        // Joiner gets black pieces
        setupMatchState('Host (White)', 'Black Player', 'b', true);
    });
}

// ---------------- LOCAL ENGINE AI LOGIC ----------------
function handleStartVS_AI() {
    appState.gameMode = 'vs_ai';
    const diff = document.getElementById('ai-difficulty').value;
    const desc = diff.toUpperCase();
    
    setupMatchState('Human Player', `Local AI (${desc})`, 'w', false);
}

// ---------------- PASS & PLAY LOGIC ----------------
function handleStartPassPlay() {
    appState.gameMode = 'pass_play';
    setupMatchState('White Player', 'Black Player', 'w', false);
}

// ---------------- MATCH SETUP AND CLOCK ENGINE ----------------
function setupMatchState(whiteName, blackName, clientColor, isNetworkMatch) {
    // Clear any active timer intervals
    clearInterval(appState.timerInterval);
    
    // Switch Screen
    showScreen('game');
    
    // Configure timers based on clockPreset settings
    const startingMs = appState.clockPreset.time * 60 * 1000;
    appState.timers.w = startingMs;
    appState.timers.b = startingMs;
    appState.timers.increment = appState.clockPreset.inc * 1000;
    appState.turn = 'w';
    
    // UI indicator
    document.getElementById('sidebar-match-title').textContent = 
        appState.gameMode === 'vs_ai' ? 'Vs Engine AI' : 
        appState.gameMode === 'pass_play' ? 'Local Hotseat' : 'Online Multiplayer';
        
    document.getElementById('match-type-indicator').textContent = 
        `${appState.clockPreset.time}m + ${appState.clockPreset.inc}s clock`;
    
    // Update player displays
    document.getElementById('name-local').textContent = clientColor === 'w' ? whiteName : blackName;
    document.getElementById('name-opponent').textContent = clientColor === 'w' ? blackName : whiteName;
    document.getElementById('avatar-local').textContent = clientColor === 'w' ? 'W' : 'B';
    document.getElementById('avatar-opponent').textContent = clientColor === 'w' ? 'B' : 'W';
    
    // Reset sidebar elements
    document.getElementById('moves-log-div').innerHTML = '';
    document.getElementById('captured-by-local').innerHTML = '';
    document.getElementById('captured-by-opponent').innerHTML = '';
    
    const chatHist = document.getElementById('chat-history-div');
    chatHist.innerHTML = '';
    if (isNetworkMatch) {
        appendChatBubble('system', 'P2P data channel established. Good luck!');
    } else {
        appendChatBubble('system', 'Offline session started. Good luck!');
    }
    
    updateClockDisplay();
    
    // Initialize Chess Logic & board visual state
    ChessGameController.initGame(clientColor);
    
    // Setup controls visibility
    document.getElementById('btn-rematch').style.display = 'none';
    document.getElementById('btn-resign-match').style.display = 'inline-block';
    document.getElementById('btn-offer-draw').style.display = isNetworkMatch ? 'inline-block' : 'none';
    
    // Start active clock if not infinity mode
    startClock();
}

function startClock() {
    clearInterval(appState.timerInterval);
    appState.timerInterval = setInterval(() => {
        const turn = ChessGameController.getTurn();
        appState.turn = turn;
        
        // Update styling highlights on local/opponent panel
        const localColor = ChessGameController.getClientColor();
        const localBar = document.getElementById('player-local-bar');
        const oppBar = document.getElementById('player-opponent-bar');
        
        if (turn === localColor) {
            localBar.classList.add('active');
            oppBar.classList.remove('active');
            
            appState.timers[localColor] = Math.max(0, appState.timers[localColor] - 100);
        } else {
            oppBar.classList.add('active');
            localBar.classList.remove('active');
            
            const oppColor = localColor === 'w' ? 'b' : 'w';
            appState.timers[oppColor] = Math.max(0, appState.timers[oppColor] - 100);
        }
        
        updateClockDisplay();
        
        // Time out check
        if (appState.timers.w <= 0) {
            handleTimeOut('w');
        } else if (appState.timers.b <= 0) {
            handleTimeOut('b');
        }
    }, 100);
}

function handleTimeOut(flaggedColor) {
    clearInterval(appState.timerInterval);
    ChessSFX.playGameOver();
    
    const winnerText = flaggedColor === 'w' ? 'Black wins!' : 'White wins!';
    const reason = 'on time';
    
    announceGameOver(winnerText, reason);
    
    if (appState.gameMode.startsWith('p2p')) {
        ChessNetwork.sendMatchPacket({ type: 'flag', color: flaggedColor });
    }
}

function updateClockDisplay() {
    const formatTime = (ms) => {
        const totalSecs = Math.ceil(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    const localColor = ChessGameController.getClientColor();
    const oppColor = localColor === 'w' ? 'b' : 'w';
    
    document.getElementById('clock-local').textContent = formatTime(appState.timers[localColor]);
    document.getElementById('clock-opponent').textContent = formatTime(appState.timers[oppColor]);
}

// Increments timer upon completing a move
function triggerIncrement(movedColor) {
    appState.timers[movedColor] += appState.timers.increment;
    updateClockDisplay();
}

// ---------------- GAME OVER DIALOGS ----------------
function announceGameOver(title, details) {
    clearInterval(appState.timerInterval);
    
    document.getElementById('gameover-title').textContent = title;
    document.getElementById('gameover-body').textContent = details;
    document.getElementById('gameover-overlay').classList.add('active');
    
    // Enable rematch option button
    document.getElementById('btn-resign-match').style.display = 'none';
    document.getElementById('btn-offer-draw').style.display = 'none';
    
    if (appState.gameMode.startsWith('p2p')) {
        document.getElementById('btn-rematch').style.display = 'inline-block';
    }
}

// ---------------- PLAYER ACTIONS ----------------
function handleResignMatch() {
    if (confirm('Are you sure you want to resign the game?')) {
        clearInterval(appState.timerInterval);
        const localColor = ChessGameController.getClientColor();
        const winner = localColor === 'w' ? 'Black' : 'White';
        
        announceGameOver(`${winner} Wins!`, 'Opponent resigned.');
        
        if (appState.gameMode.startsWith('p2p')) {
            ChessNetwork.sendMatchPacket({ type: 'resign', color: localColor });
        }
    }
}

function handleOfferDraw() {
    if (appState.gameMode.startsWith('p2p')) {
        showToast('Draw offer sent...');
        ChessNetwork.sendMatchPacket({ type: 'draw_offer' });
    }
}

function handleExitToLobby() {
    if (confirm('Return to Lobby? Your current game progress will be lost.')) {
        clearInterval(appState.timerInterval);
        showScreen('lobby');
        ChessNetwork.destroyConnection();
        
        // Reset network badge
        const badge = document.getElementById('network-dot');
        badge.className = 'badge-dot';
        document.getElementById('network-status').textContent = 'Loading Network...';
        ChessNetwork.setupPeer(); // Reconnect peer signaling
    }
}

// ---------------- SIDEBAR CHAT LOGIC ----------------
function sendChatMessage() {
    const box = document.getElementById('chat-input-box');
    const msg = box.value.trim();
    if (!msg) return;
    
    box.value = '';
    
    // Add local bubble
    appendChatBubble('local', msg);
    
    // Network synchronisation
    if (appState.gameMode.startsWith('p2p')) {
        ChessNetwork.sendMatchPacket({ type: 'chat', text: msg });
    }
}

function appendChatBubble(sender, text) {
    const container = document.getElementById('chat-history-div');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.textContent = text;
    
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}
