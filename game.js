/* =============================================================
   ANTIGRAVITY CHESS — Game Engine (game.js)
   Board: pure HTML div grid + Unicode pieces (100% reliable)
   Chess logic: chess.js 0.10.3
   ============================================================= */

const ChessGame = (() => {

    /* ---------- Piece image CDN (Lichess cburnett set via jsDelivr) ---------- */
    // Primary: Lichess open-source cburnett SVG pieces — same set used on lichess.org
    const PIECE_CDN = 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/';

    // Unicode fallback (if CDN fails)
    const SYM = {
        wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
        bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
    };

    function pieceHtml(piece) {
        const key = piece.color + piece.type.toUpperCase(); // e.g. wK, bN
        const uni = SYM[key];
        const src = PIECE_CDN + key + '.svg';
        // Render as img; if src fails, swap to unicode text fallback
        return `<img class="piece-img" src="${src}" alt="${uni}"
                     draggable="false"
                     onerror="this.outerHTML='<span class=\'piece-uni\'>${uni}</span>'">`;
    }

    /* ---------- State ---------- */
    let chessEngine = null;  // chess.js instance
    let myColor     = 'w';
    let flipped     = false;
    let selected    = null;  // algebraic square string or null
    let legalMoves  = [];    // verbose moves from selected square
    let pendingPromo = null; // { from, to }

    // Pointer-based Drag & Drop state variables
    let dragPiece   = null;  // cloned piece img element currently being dragged
    let dragStartSq = null;  // starting square coordinate string (e.g. "e2")
    let dragOffsetX = 0;     // horizontal offset of pointer from piece center
    let dragOffsetY = 0;     // vertical offset of pointer from piece center

    /* ---------- Coordinate helpers ---------- */
    const files = 'abcdefgh';
    function sq(row, col)  { return files[col] + (8 - row); }       // board coords → algebraic
    function row(s)        { return 8 - parseInt(s[1]); }            // algebraic → row index 0-7
    function col(s)        { return s.charCodeAt(0) - 97; }          // algebraic → col index 0-7

    /* ---------- Screen square position ---------- */
    function screenPos(logRow, logCol) {
        return {
            sr: flipped ? 7 - logRow : logRow,
            sc: flipped ? 7 - logCol : logCol
        };
    }
    function logicalSq(screenRow, screenCol) {
        const lr = flipped ? 7 - screenRow : screenRow;
        const lc = flipped ? 7 - screenCol : screenCol;
        return sq(lr, lc);
    }

    /* ---------- Public init ---------- */
    function startGame(color) {
        chessEngine = new Chess();
        myColor  = color;
        flipped  = (color === 'b');
        selected = null;
        legalMoves = [];

        document.getElementById('btn-flip').onclick = () => { flipped = !flipped; render(); };

        render();

        // If AI plays first (we are black in AI mode)
        if (window.APP && APP.mode === 'ai' && color === 'b') {
            setTimeout(doAIMove, 700);
        }
    }

    /* =================================================================
       RENDER — builds the entire board HTML from scratch each call
       This is simple, reliable, and fast enough for chess
       ================================================================= */
    function render() {
        const board  = chessEngine.board();       // 8×8 array of pieces
        const hist   = chessEngine.history({ verbose: true });
        const lastMv = hist.length ? hist[hist.length - 1] : null;
        const inChk  = chessEngine.in_check();
        const kingSq = inChk ? findKing(chessEngine.turn()) : null;

        // Build hint set
        const hintSquares = new Set(legalMoves.map(m => m.to));

        let html = '';

        for (let sr = 0; sr < 8; sr++) {   // screen rows
            html += '<div class="board-rank">';
            for (let sc = 0; sc < 8; sc++) { // screen cols
                const sqName  = logicalSq(sr, sc);
                const lr      = row(sqName);
                const lc      = col(sqName);
                const piece   = board[lr][lc];
                const isLight = (lr + lc) % 2 === 0;

                // Determine CSS classes for square
                let cls = 'sq ' + (isLight ? 'light' : 'dark');
                if (sqName === selected)  cls += ' selected';
                else if (lastMv && (sqName === lastMv.from || sqName === lastMv.to)) cls += ' last-move';
                else if (inChk && sqName === kingSq) cls += ' in-check';

                html += `<div class="${cls}" data-sq="${sqName}">`;

                // Rank label (left column)
                if (sc === 0) {
                    const rankNum = flipped ? lr + 1 : 8 - lr;
                    html += `<span class="sq-label rank">${rankNum}</span>`;
                }
                // File label (bottom row)
                if (sr === 7) {
                    html += `<span class="sq-label file">${files[lc]}</span>`;
                }

                // Move hint
                if (hintSquares.has(sqName)) {
                    html += piece
                        ? '<div class="hint-ring"></div>'
                        : '<div class="hint-dot"></div>';
                }

                // Piece image
                if (piece) {
                    html += pieceHtml(piece);
                }

                html += '</div>';
            }
            html += '</div>';
        }

        const boardEl = document.getElementById('chess-board');
        boardEl.innerHTML = html;

        // Attach click listeners (event delegation)
        boardEl.onclick = (e) => {
            const cell = e.target.closest('[data-sq]');
            if (cell) handleClick(cell.getAttribute('data-sq'));
        };

        // Attach custom pointer drag-and-drop handler
        initPointerDrag(boardEl);
    }

    /* ---------- Click handler ---------- */
    function handleClick(sqName) {
        if (!isMyTurn()) return;

        const piece = chessEngine.get(sqName);

        // Clicking own piece → select it
        if (piece && piece.color === chessEngine.turn()) {
            selected   = sqName;
            legalMoves = chessEngine.moves({ square: sqName, verbose: true });
            render();
            return;
        }

        // Clicking a hint square → execute move
        if (selected && legalMoves.find(m => m.to === sqName)) {
            attemptMove(selected, sqName);
            return;
        }

        // Anything else → deselect
        selected   = null;
        legalMoves = [];
        render();
    }

    /* ---------- Pointer Drag & Drop Handlers ---------- */
    function initPointerDrag(boardEl) {
        boardEl.onpointerdown = (e) => {
            // Only handle left click / single touch
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            
            const cell = e.target.closest('[data-sq]');
            if (!cell) return;
            
            const sqName = cell.getAttribute('data-sq');
            if (!isMyTurn()) return;
            
            const piece = chessEngine.get(sqName);
            if (!piece || piece.color !== chessEngine.turn()) return;
            
            const pieceImg = cell.querySelector('.piece-img');
            if (!pieceImg) return;
            
            // Prevent default dragging / selection behavior
            e.preventDefault();
            
            dragStartSq = sqName;
            
            // Set selections
            selected = sqName;
            legalMoves = chessEngine.moves({ square: sqName, verbose: true });
            
            // Render first to display legal dots / rings
            render();
            
            // Get fresh DOM elements since render() replaced the DOM
            const newCell = boardEl.querySelector(`[data-sq="${sqName}"]`);
            if (!newCell) return;
            const newPieceImg = newCell.querySelector('.piece-img');
            if (!newPieceImg) return;
            
            // Make original square piece semi-transparent (placeholder)
            newPieceImg.style.opacity = '0.25';
            
            // Create cloned drag element
            const cellRect = newCell.getBoundingClientRect();
            dragPiece = newPieceImg.cloneNode(true);
            dragPiece.style.position = 'fixed';
            dragPiece.style.width = `${cellRect.width}px`;
            dragPiece.style.height = `${cellRect.height}px`;
            dragPiece.style.opacity = '1';
            dragPiece.style.pointerEvents = 'none';
            dragPiece.style.zIndex = '9999';
            dragPiece.style.transition = 'none';
            
            // Style the picked-up piece with soft elevated drop shadow
            dragPiece.style.filter = 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))';
            
            // Center the clone on the pointer
            dragOffsetX = cellRect.width / 2;
            dragOffsetY = cellRect.height / 2;
            
            const x = e.clientX - dragOffsetX;
            const y = e.clientY - dragOffsetY;
            dragPiece.style.left = '0px';
            dragPiece.style.top = '0px';
            dragPiece.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.08)`;
            
            document.body.appendChild(dragPiece);
            
            // Bind document listeners to track dragging globally
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };
    }

    function onPointerMove(e) {
        if (!dragPiece) return;
        
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;
        dragPiece.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.08)`;
        
        // Find current square target under the cursor
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        const cell = targetEl ? targetEl.closest('[data-sq]') : null;
        
        // Remove hover highlights from all squares
        document.querySelectorAll('.sq').forEach(el => el.classList.remove('drag-hover'));
        
        if (cell) {
            const toSq = cell.getAttribute('data-sq');
            if (legalMoves.some(m => m.to === toSq)) {
                cell.classList.add('drag-hover');
            }
        }
    }

    function onPointerUp(e) {
        if (!dragPiece) return;
        
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        
        // Remove hover overlays
        document.querySelectorAll('.sq').forEach(el => el.classList.remove('drag-hover'));
        
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        const cell = targetEl ? targetEl.closest('[data-sq]') : null;
        const toSq = cell ? cell.getAttribute('data-sq') : null;
        
        const fromSq = dragStartSq;
        dragStartSq = null;
        
        if (toSq && legalMoves.some(m => m.to === toSq)) {
            // Drop piece & execute move
            if (dragPiece.parentNode) dragPiece.parentNode.removeChild(dragPiece);
            dragPiece = null;
            
            attemptMove(fromSq, toSq);
        } else {
            // Animate snap back to original square coordinate smoothly
            const sourceCell = document.querySelector(`[data-sq="${fromSq}"]`);
            if (sourceCell) {
                const rect = sourceCell.getBoundingClientRect();
                dragPiece.style.transition = 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)';
                const tx = rect.left;
                const ty = rect.top;
                dragPiece.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.0)`;
                
                const elToRemove = dragPiece;
                dragPiece = null;
                setTimeout(() => {
                    if (elToRemove && elToRemove.parentNode) {
                        elToRemove.parentNode.removeChild(elToRemove);
                    }
                    render(); // restores opacity of piece to 1
                }, 180);
            } else {
                if (dragPiece.parentNode) dragPiece.parentNode.removeChild(dragPiece);
                dragPiece = null;
                render();
            }
        }
    }


    /* ---------- Attempt a move (handles promotion) ---------- */
    function attemptMove(from, to, promo) {
        const p = chessEngine.get(from);
        const isPromo = p && p.type === 'p' && (to[1] === '8' || to[1] === '1');

        if (isPromo && !promo) {
            pendingPromo = { from, to };
            showPromoDialog(p.color);
            return;
        }

        const moveObj = { from, to };
        if (promo) moveObj.promotion = promo;

        const result = chessEngine.move(moveObj);
        if (!result) return; // illegal

        selected   = null;
        legalMoves = [];

        // Sound
        const hadCapture = result.captured || result.flags.includes('e');
        if (chessEngine.in_check())  playSFX('check');
        else if (hadCapture)         playSFX('capture');
        else                         playSFX('move');

        // Timer increment
        if (window.APP) APP.onMoveDone(result.color);

        render();
        updateCaptures();
        appendMoveToLog(result);

        // Network: send move
        if (window.APP && APP.mode === 'online') {
            Network.send({ type:'move', from, to, promo: promo || null, clocks: APP.clocks });
        }

        checkEnd();

        // AI response
        if (window.APP && APP.mode === 'ai' && !chessEngine.game_over() && chessEngine.turn() === 'b') {
            setTimeout(doAIMove, 500);
        }
    }

    /* ---------- Remote move received ---------- */
    function applyRemoteMove(from, to, promo, clocks) {
        if (clocks && window.APP) APP.clocks = clocks;

        const result = chessEngine.move({ from, to, promotion: promo || undefined });
        if (!result) return;

        const hadCapture = result.captured || result.flags.includes('e');
        if (chessEngine.in_check())  playSFX('check');
        else if (hadCapture)         playSFX('capture');
        else                         playSFX('move');

        if (window.APP) APP.onMoveDone(result.color);
        render();
        updateCaptures();
        appendMoveToLog(result);
        checkEnd();
    }


    /* ---------- Promotion dialog ---------- */
    function showPromoDialog(color) {
        const choices = ['q','r','b','n'];
        const names   = { q:'Queen', r:'Rook', b:'Bishop', n:'Knight' };
        let html = '';
        for (const t of choices) {
            const key = color + t.toUpperCase();
            const src = PIECE_CDN + key + '.svg';
            const uni = SYM[key];
            html += `<div class="promo-piece" title="${names[t]}" data-promo="${t}">
                        <img src="${src}" alt="${uni}" style="width:70%;height:70%;object-fit:contain;"
                             onerror="this.outerHTML='<span style=font-size:2rem>${uni}</span>'">
                     </div>`;
        }
        document.getElementById('promo-choices').innerHTML = html;
        document.getElementById('promo-overlay').style.display = 'flex';

        document.getElementById('promo-choices').onclick = (e) => {
            const el = e.target.closest('[data-promo]');
            if (!el || !pendingPromo) return;
            document.getElementById('promo-overlay').style.display = 'none';
            const { from, to } = pendingPromo;
            pendingPromo = null;
            attemptMove(from, to, el.getAttribute('data-promo'));
        };
    }


    /* ---------- Move log ---------- */
    function appendMoveToLog(result) {
        const log  = document.getElementById('move-log');
        const hist = chessEngine.history();
        const num  = Math.ceil(hist.length / 2);

        if (hist.length % 2 === 1) { // White just moved
            const row = document.createElement('div');
            row.id = `mr-${num}`;
            row.style.display = 'contents';
            row.innerHTML =
                `<span class="mn">${num}.</span>` +
                `<span class="mov w-move">${result.san}</span>` +
                `<span class="mov b-move" id="bm-${num}"></span>`;
            log.appendChild(row);
        } else {
            const el = document.getElementById(`bm-${num}`);
            if (el) el.textContent = result.san;
        }
        log.scrollTop = log.scrollHeight;
    }

    /* ---------- Captures display ---------- */
    function updateCaptures() {
        const board = chessEngine.board();
        const counts = {
            w: { p:8,n:2,b:2,r:2,q:1 },
            b: { p:8,n:2,b:2,r:2,q:1 }
        };
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && p.type !== 'k') counts[p.color][p.type]--;
            }

        const toHtml = (obj) =>
            Object.entries(obj).filter(([,n]) => n > 0)
                .map(([t,n]) => SYM['w'+t.toUpperCase()].repeat(n)).join('');

        const opp = myColor === 'w' ? 'b' : 'w';
        document.getElementById('cap-me').textContent  = toHtml(counts[opp]);      // pieces we captured
        document.getElementById('cap-opp').textContent = toHtml(counts[myColor]);  // pieces they captured
    }

    /* ---------- Game end check ---------- */
    function checkEnd() {
        if (!chessEngine.game_over()) return;
        clearInterval(window.APP && APP.timerInterval);
        playSFX('end');

        let emoji = '🏁', title = 'Game Over', detail = '';
        if (chessEngine.in_checkmate()) {
            const winner = chessEngine.turn() === 'w' ? 'Black' : 'White';
            emoji = winner === 'White' ? '♔' : '♚';
            title = 'Checkmate!';
            detail = `${winner} wins by checkmate.`;
        } else if (chessEngine.in_stalemate()) {
            title = 'Stalemate'; detail = 'No legal moves — draw.';
        } else if (chessEngine.in_draw()) {
            title = 'Draw'; detail = 'Insufficient material or repetition.';
        }
        showGameOver(emoji, title, detail);
    }

    /* ---------- Helper: find king ---------- */
    function findKing(color) {
        const board = chessEngine.board();
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && p.type === 'k' && p.color === color) return sq(r, c);
            }
        return null;
    }

    function isMyTurn() {
        const t = chessEngine.turn();
        if (!window.APP) return true;
        if (APP.mode === 'pass') return true;
        if (APP.mode === 'ai')   return t === 'w';
        return t === myColor; // online
    }

    /* ======================
       AI (Minimax + αβ)
       ====================== */
    const PV = { p:100, n:320, b:330, r:500, q:900, k:20000 };
    const PST = {
        p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
        n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
        b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
        r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
        q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,5,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
        k:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
    };

    function evalBoard() {
        let score = 0;
        const bd = chessEngine.board();
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = bd[r][c];
                if (!p) continue;
                const ri = p.color === 'w' ? r : 7-r;
                const ci = p.color === 'w' ? c : 7-c;
                const v  = PV[p.type] + (PST[p.type]?.[ri]?.[ci] || 0);
                score += p.color === 'w' ? v : -v;
            }
        return score;
    }

    function minimax(depth, alpha, beta, maximizing) {
        if (depth === 0 || chessEngine.game_over()) return evalBoard();
        const moves = chessEngine.moves({ verbose: true });
        if (maximizing) {
            let best = -Infinity;
            for (const m of moves) {
                chessEngine.move(m);
                best = Math.max(best, minimax(depth-1, alpha, beta, false));
                chessEngine.undo();
                alpha = Math.max(alpha, best);
                if (beta <= alpha) break;
            }
            return best;
        } else {
            let best = Infinity;
            for (const m of moves) {
                chessEngine.move(m);
                best = Math.min(best, minimax(depth-1, alpha, beta, true));
                chessEngine.undo();
                beta = Math.min(beta, best);
                if (beta <= alpha) break;
            }
            return best;
        }
    }

    function doAIMove() {
        if (chessEngine.game_over()) return;
        const diff  = parseInt(document.getElementById('sel-diff')?.value || '2');
        const depth = diff === 1 ? 2 : diff === 3 ? 4 : 3;
        const moves = chessEngine.moves({ verbose: true });
        if (!moves.length) return;

        // Sort: captures & checks first for better pruning
        moves.sort((a,b) =>
            ((b.captured?10:0)+(b.san.includes('+')?5:0)) -
            ((a.captured?10:0)+(a.san.includes('+')?5:0))
        );

        let best = null, bestVal = Infinity;
        for (const m of moves) {
            chessEngine.move(m);
            const v = minimax(depth-1, -Infinity, Infinity, true);
            chessEngine.undo();
            if (v < bestVal) { bestVal = v; best = m; }
        }
        if (best) attemptMove(best.from, best.to, best.promotion || null);
    }

    /* ---------- Sound FX ---------- */
    let audioCtx = null;
    function playSFX(type) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            const t = audioCtx.currentTime;
            if (type === 'move') {
                osc.frequency.setValueAtTime(220, t);
                osc.frequency.exponentialRampToValueAtTime(130, t+0.1);
                gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.1);
                osc.start(); osc.stop(t+0.1);
            } else if (type === 'capture') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.exponentialRampToValueAtTime(120, t+0.12);
                gain.gain.setValueAtTime(0.25, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.12);
                osc.start(); osc.stop(t+0.12);
            } else if (type === 'check') {
                osc.frequency.setValueAtTime(600, t); osc.frequency.setValueAtTime(800, t+0.1);
                gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.25);
                osc.start(); osc.stop(t+0.25);
            } else {
                osc.frequency.setValueAtTime(330, t); osc.frequency.setValueAtTime(520, t+0.1);
                gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.35);
                osc.start(); osc.stop(t+0.35);
            }
        } catch(e) { /* audio blocked */ }
    }

    /* ---------- Expose for app.js / network.js ---------- */
    return {
        startGame,
        applyRemoteMove,
        getTurn:      () => chessEngine ? chessEngine.turn() : 'w',
        getMyColor:   () => myColor,
        isGameOver:   () => chessEngine ? chessEngine.game_over() : false,
        resetAndSwap: () => {
            const next = myColor === 'w' ? 'b' : 'w';
            startGame(next);
        }
    };

})();

/* ---------- Shared UI helpers (game context) ---------- */
function showGameOver(emoji, title, detail) {
    clearInterval(window.APP && APP.timerInterval);
    document.getElementById('go-emoji').textContent  = emoji;
    document.getElementById('go-title').textContent  = title;
    document.getElementById('go-detail').textContent = detail;
    document.getElementById('gameover-overlay').style.display = 'flex';
    if (window.APP && APP.mode === 'online') {
        document.getElementById('btn-rematch').style.display = '';
    } else {
        document.getElementById('btn-rematch').style.display = '';
    }
}

function addChatMsg(who, text) {
    const log = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + who;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}
