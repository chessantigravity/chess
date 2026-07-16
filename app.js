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
    aiLevel:       'medium',      // 'easy' | 'medium' | 'hard' | 'expert' | 'master' | 'grandmaster'

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

    // Apply saved settings immediately (themes, colors, animation speed)
    SettingsService.init();

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

    // Custom inputs sanitization and validation logic
    const minsInp = document.getElementById('inp-mins');
    const incInp  = document.getElementById('inp-inc');

    function validateCustomInputs() {
        let mins = parseInt(minsInp.value);
        if (isNaN(mins) || mins < 1) mins = 1;
        if (mins > 180) mins = 180;
        minsInp.value = mins;
        APP.preset.min = mins;

        let inc = parseInt(incInp.value);
        if (isNaN(inc) || inc < 0) inc = 0;
        if (inc > 60) inc = 60;
        incInp.value = inc;
        APP.preset.inc = inc;
    }

    minsInp.addEventListener('input', validateCustomInputs);
    minsInp.addEventListener('blur', validateCustomInputs);
    incInp.addEventListener('input', validateCustomInputs);
    incInp.addEventListener('blur', validateCustomInputs);

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
    
    // Show AI difficulty selection modal instead of starting immediately
    document.getElementById('btn-ai').addEventListener('click', () => {
        document.getElementById('ai-overlay').style.display = 'flex';
    });

    // Close AI modal logic
    document.getElementById('btn-close-ai-modal').addEventListener('click', () => {
        document.getElementById('ai-overlay').style.display = 'none';
    });
    document.getElementById('ai-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'ai-overlay') {
            document.getElementById('ai-overlay').style.display = 'none';
        }
    });

    // Handle AI Level selection
    document.querySelectorAll('.ai-card').forEach(card => {
        card.addEventListener('click', () => {
            const level = card.getAttribute('data-level');
            document.getElementById('ai-overlay').style.display = 'none';
            startAI(level);
        });
    });

    document.getElementById('btn-pass').addEventListener('click', startPass);

    // Enter Chess Academy
    document.getElementById("btn-enter-academy").addEventListener("click", () => {
        import("./auth-service.js").then(({ AuthService }) => {
            const user = AuthService.getCurrentUser();
            const isGuest = AuthService.isGuest();
            import("./learn-academy.js").then(({ initLearnAcademy }) => {
                initLearnAcademy(user, isGuest);
            });
        });
    });

    // Enter Puzzle Quest
    document.getElementById("btn-enter-puzzles").addEventListener("click", () => {
        import("./auth-service.js").then(({ AuthService }) => {
            const user = AuthService.getCurrentUser();
            const isGuest = AuthService.isGuest();
            import("./puzzle-mode.js").then(({ initPuzzleMode }) => {
                initPuzzleMode(user, isGuest);
            });
        });
    });

    /* ─────────────────────────────────────────────────────────────
       SETTINGS SCREEN
       ───────────────────────────────────────────────────────────── */
    const settingsScreen = document.getElementById('settings-screen');
    const lobbyScreen    = document.getElementById('lobby');

    // Helper: hide all screens and show settings
    function openSettings() {
        // Hide all screens by removing active class
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        // Show settings screen
        settingsScreen.classList.add('active');
        buildSettingsUI();
    }
    function closeSettings(returnTo) {
        settingsScreen.classList.remove('active');
        if (returnTo) returnTo.classList.add('active');
        else lobbyScreen.classList.add('active');
    }

    document.getElementById('btn-open-settings').addEventListener('click', () => {
        // Remember which screen was active so we can return to it
        const prev = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active') && s.id !== 'settings-screen');
        openSettings();
        document.getElementById('btn-settings-back').onclick = () => closeSettings(prev);
    });

    /* "Saved" flash badge */
    let _savedTimer;
    function flashSaved() {
        const badge = document.getElementById('settings-saved-badge');
        if (!badge) return;
        badge.classList.add('show');
        clearTimeout(_savedTimer);
        _savedTimer = setTimeout(() => badge.classList.remove('show'), 1800);
    }
    window.addEventListener('settings-changed', flashSaved);

    /* ─── Build Settings UI ──────────────────────────────────── */
    function buildSettingsUI() {
        const s = SettingsService.getAll();

        /* --- Board theme swatches --- */
        const BOARD_THEMES = [
            { id:'mono',   label:'Mono',   light:'#eeeed2', dark:'#769656' },
            { id:'wood',   label:'Wood',   light:'#f0d9b5', dark:'#b58863' },
            { id:'green',  label:'Green',  light:'#f0d9b5', dark:'#829769' },
            { id:'ocean',  label:'Ocean',  light:'#dee3e8', dark:'#5c7a96' },
            { id:'purple', label:'Purple', light:'#e8d8f8', dark:'#7c4a9e' },
            { id:'ice',    label:'Ice',    light:'#f0f0f0', dark:'#6090b8' },
        ];
        const swatchesEl = document.getElementById('board-theme-swatches');
        swatchesEl.innerHTML = BOARD_THEMES.map(t => `
            <button class="theme-swatch${s.boardTheme === t.id ? ' active' : ''}" data-val="${t.id}" title="${t.label}" style="border:none;background:none;padding:0;">
                <div class="theme-swatch-board">
                    <span style="background:${t.dark}"></span>
                    <span style="background:${t.light}"></span>
                    <span style="background:${t.light}"></span>
                    <span style="background:${t.dark}"></span>
                </div>
                <div class="theme-swatch-label">${t.label}</div>
            </button>
        `).join('');
        swatchesEl.querySelectorAll('.theme-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                swatchesEl.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                SettingsService.set('boardTheme', btn.dataset.val);
            });
        });

        /* --- Piece theme cards --- */
        const PIECE_THEMES = [
            { id:'standard', label:'Standard', preview:'♞' },
            { id:'classic',  label:'Classic',  preview:'♜' },
            { id:'minimal',  label:'Minimal',  preview:'♟' },
        ];
        const pieceEl = document.getElementById('piece-theme-cards');
        pieceEl.innerHTML = PIECE_THEMES.map(t => `
            <button class="piece-theme-card${s.pieceTheme === t.id ? ' active' : ''}" data-val="${t.id}" style="border:none;cursor:pointer;">
                <span class="piece-preview">${t.preview}</span>
                <span class="piece-name">${t.label}</span>
            </button>
        `).join('');
        pieceEl.querySelectorAll('.piece-theme-card').forEach(btn => {
            btn.addEventListener('click', () => {
                pieceEl.querySelectorAll('.piece-theme-card').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                SettingsService.set('pieceTheme', btn.dataset.val);
            });
        });

        /* --- Highlight color swatches --- */
        const HIGHLIGHT_COLORS = ['#baca2b','#f7f785','#7bcf52','#4a90d9','#e05252','#f59e0b','#ec4899','#ffffff'];
        const LASTMOVE_COLORS  = ['#f7f785','#baca2b','#90e0c0','#a8d8f0','#f0c0a8','#d0b0f0','#f0d0a8','#e0e0e0'];

        function buildColorSwatches(containerId, colors, settingKey) {
            const el = document.getElementById(containerId);
            const cur = s[settingKey];
            el.innerHTML = colors.map(c => `
                <button class="color-swatch${c.toLowerCase() === cur.toLowerCase() ? ' active' : ''}"
                    data-val="${c}" title="${c}"
                    style="background:${c}; border:none; cursor:pointer;">
                </button>
            `).join('') + `
                <label title="Custom color" style="cursor:pointer;">
                    <input type="color" value="${cur}" style="width:0;height:0;opacity:0;position:absolute;" class="custom-color-inp" data-key="${settingKey}">
                    <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff);display:inline-block;border:2px solid var(--card-border);cursor:pointer;"></span>
                </label>
            `;
            el.querySelectorAll('.color-swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    el.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    SettingsService.set(settingKey, btn.dataset.val);
                });
            });
            el.querySelector('.custom-color-inp').addEventListener('input', (e) => {
                el.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                SettingsService.set(settingKey, e.target.value);
            });
        }
        buildColorSwatches('highlight-swatches', HIGHLIGHT_COLORS, 'highlightColor');
        buildColorSwatches('lastmove-swatches',  LASTMOVE_COLORS,  'lastMoveColor');

        /* --- Animation speed pills --- */
        buildPillGroup('animation-speed-pills', s.animationSpeed, 'animationSpeed');

        /* --- Audio toggles & sliders --- */
        const toggleSounds = document.getElementById('toggle-sounds');
        const sliderSoundVol = document.getElementById('slider-sound-vol');
        const labelSoundVol  = document.getElementById('label-sound-vol');
        toggleSounds.checked = s.sounds;
        sliderSoundVol.value = s.soundVolume;
        labelSoundVol.textContent = s.soundVolume + '%';
        toggleSounds.addEventListener('change', () => SettingsService.set('sounds', toggleSounds.checked));
        sliderSoundVol.addEventListener('input', () => {
            labelSoundVol.textContent = sliderSoundVol.value + '%';
            SettingsService.set('soundVolume', +sliderSoundVol.value);
        });

        const toggleMusic = document.getElementById('toggle-music');
        const sliderMusicVol = document.getElementById('slider-music-vol');
        const labelMusicVol  = document.getElementById('label-music-vol');
        toggleMusic.checked = s.music;
        sliderMusicVol.value = s.musicVolume;
        labelMusicVol.textContent = s.musicVolume + '%';
        toggleMusic.addEventListener('change', () => SettingsService.set('music', toggleMusic.checked));
        sliderMusicVol.addEventListener('input', () => {
            labelMusicVol.textContent = sliderMusicVol.value + '%';
            SettingsService.set('musicVolume', +sliderMusicVol.value);
        });

        /* --- AI difficulty pills --- */
        buildPillGroup('ai-difficulty-pills', s.aiDifficulty, 'aiDifficulty');

        /* --- Reset button --- */
        document.getElementById('btn-settings-reset').onclick = () => {
            if (!confirm('Reset all settings to defaults?')) return;
            SettingsService.reset();
            buildSettingsUI(); // Re-render UI with defaults
        };
    }

    /* Helper: wire a pill group to a settings key */
    function buildPillGroup(containerId, currentVal, settingKey) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.querySelectorAll('.option-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === currentVal);
            btn.addEventListener('click', () => {
                el.querySelectorAll('.option-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                SettingsService.set(settingKey, btn.dataset.val);
            });
        });
    }

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
function startAI(level) {
    APP.mode = 'ai';
    APP.aiLevel = level || 'medium';
    startMatch('w');
}
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
    
    let aiLabel = 'AI';
    if (isAI && APP.aiLevel) {
        aiLabel = APP.aiLevel.charAt(0).toUpperCase() + APP.aiLevel.slice(1);
    }

    const oppName   = myColor === 'w'
        ? (isAI ? `AI (${aiLabel})` : 'Black')
        : (isAI ? `AI (${aiLabel})` : 'White');

    document.getElementById('nm-me').textContent  = localName;
    document.getElementById('nm-opp').textContent = oppName;
    document.getElementById('av-me').textContent  = myColor === 'w' ? 'W' : 'B';
    document.getElementById('av-opp').textContent = myColor === 'w' ? 'B' : 'W';

    document.getElementById('match-title').textContent =
        isAI ? `vs AI (${aiLabel})` : isOnline ? 'Online Multiplayer' : 'Local Hotseat';
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

    // Hide badge once Chat tab is focused
    if (!isMoves) {
        document.getElementById('chat-badge').style.display = 'none';
    }
}

// Global visual chat indicator trigger
window.showChatBadge = function() {
    const chatPane = document.getElementById('pane-chat');
    if (!chatPane.classList.contains('active')) {
        document.getElementById('chat-badge').style.display = 'inline-block';
    }
};

/* ============================================================= */
/*  ACCIDENTAL UNLOAD PREVENTION                                  */
/* ============================================================= */
window.addEventListener('beforeunload', (e) => {
    // Only warn if the game screen is active and chess engine is not finished
    const gameScreen = document.getElementById('game');
    const isGameActive = gameScreen && gameScreen.classList.contains('active') && !ChessGame.isGameOver();
    if (isGameActive) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave? Your active match progress will be lost.';
    }
});

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

/* ============================================================= */
/*  GLOBAL EXPORTS — needed by inline HTML handlers & plain       */
/*  scripts (game.js, network.js) that run outside module scope   */
/* ============================================================= */
window.setTheme  = setTheme;
window.copyLink  = copyLink;
window.switchTab = switchTab;
window.toast     = toast;
window.startMatch= startMatch;

