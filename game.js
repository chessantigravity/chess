// Chess Board Renderer and AI Engine
// Fixed: inline SVG colors, correct coordinate mapping, robust click/drag, unicode fallback pieces

const ChessGameController = (() => {
    let game = new Chess();
    let boardMount = null;
    let clientColor = 'w';
    let flipped = false;
    let selectedSquare = null;
    let activeMoves = [];
    let isDragging = false;
    let dragPiece = null;
    let dragStartSquare = null;
    let dragOriginX = 0;
    let dragOriginY = 0;
    const SQ = 12.5; // Each square is 12.5% of viewBox (100/8)

    // Unicode fallback pieces if SVG images fail to load
    const UNICODE_PIECES = {
        wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
        bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
    };

    // ---- AI Piece Values ----
    const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

    const PST = {
        p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
        n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
        b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
        r: [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
        q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,5,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
        k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
    };

    // ---- Coordinate Helpers ----
    function coordsToSquare(row, col) {
        return 'abcdefgh'[col] + (8 - row);
    }

    function squareToCoords(sq) {
        return { row: 8 - parseInt(sq[1]), col: sq.charCodeAt(0) - 97 };
    }

    // Screen position for a logical square (accounts for flip)
    function logicalToScreen(logRow, logCol) {
        return {
            sx: (flipped ? 7 - logCol : logCol) * SQ,
            sy: (flipped ? 7 - logRow : logRow) * SQ
        };
    }

    // ---- Get Theme Colors at runtime from CSS vars ----
    function getColors() {
        const s = getComputedStyle(document.documentElement);
        const get = (v) => s.getPropertyValue(v).trim() || null;
        return {
            light:     get('--sq-light')     || '#e2e8f0',
            dark:      get('--sq-dark')      || '#334155',
            highlight: get('--sq-highlight') || 'rgba(14,165,233,0.35)',
            lastMove:  get('--sq-last-move') || 'rgba(234,179,8,0.3)',
            check:     get('--sq-check')     || 'rgba(239,68,68,0.5)',
            notation:  get('--board-border-text') || '#94a3b8'
        };
    }

    // ---- Init ----
    function initGame(colorChoice) {
        game = new Chess();
        clientColor = colorChoice;
        flipped = (clientColor === 'b');
        selectedSquare = null;
        activeMoves = [];

        boardMount = document.getElementById('board-mount');
        boardMount.style.width = '100%';
        boardMount.style.aspectRatio = '1';
        boardMount.style.display = 'block';

        document.getElementById('btn-flip-board').onclick = () => {
            flipped = !flipped;
            fullRender();
        };

        document.getElementById('btn-rematch').onclick = handleRematchRequest;
        document.getElementById('btn-gameover-rematch').onclick = handleRematchRequest;

        fullRender();

        if (appState.gameMode === 'vs_ai' && clientColor === 'b') {
            setTimeout(makeAIMove, 600);
        }
    }

    // ---- Full board render (squares + pieces + labels + events) ----
    function fullRender() {
        if (!boardMount) return;
        const colors = getColors();

        let svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
            style="width:100%;height:100%;display:block;border-radius:8px;
                   box-shadow:0 15px 35px rgba(0,0,0,0.6);
                   border:10px solid ${getComputedStyle(document.documentElement).getPropertyValue('--board-border').trim() || '#1e293b'};
                   user-select:none;cursor:default;"
            id="chess-svg">`;

        // 1) Squares
        for (let sr = 0; sr < 8; sr++) {           // screen row
            for (let sc = 0; sc < 8; sc++) {       // screen col
                const lr = flipped ? 7 - sr : sr;  // logical row
                const lc = flipped ? 7 - sc : sc;  // logical col
                const sqName = coordsToSquare(lr, lc);
                const isLight = (lr + lc) % 2 === 0;
                const fill = isLight ? colors.light : colors.dark;
                svg += `<rect x="${sc*SQ}" y="${sr*SQ}" width="${SQ}" height="${SQ}"
                              fill="${fill}" data-sq="${sqName}" class="board-sq"/>`;
            }
        }

        // 2) Overlay layer placeholder
        svg += `<g id="ovl"></g>`;

        // 3) Pieces layer placeholder
        svg += `<g id="pcl"></g>`;

        // 4) Hint dots placeholder
        svg += `<g id="hnt" pointer-events="none"></g>`;

        // 5) Rank & file labels
        for (let i = 0; i < 8; i++) {
            const rankNum = flipped ? i + 1 : 8 - i;
            const fileChar = 'abcdefgh'[flipped ? 7 - i : i];
            svg += `<text x="0.6" y="${i*SQ+3.5}" font-size="3"
                         fill="${colors.notation}" font-family="Outfit,sans-serif"
                         font-weight="700">${rankNum}</text>`;
            svg += `<text x="${i*SQ+9.5}" y="99.5" font-size="3"
                         fill="${colors.notation}" font-family="Outfit,sans-serif"
                         font-weight="700">${fileChar}</text>`;
        }

        svg += '</svg>';
        boardMount.innerHTML = svg;

        renderOverlays();
        renderPieces();
        bindEvents();
    }

    // ---- Render overlays (last move, check, selected) ----
    function renderOverlays() {
        const g = document.getElementById('ovl');
        if (!g) return;
        const colors = getColors();
        let html = '';

        // Last move
        const hist = game.history({ verbose: true });
        if (hist.length > 0) {
            const lm = hist[hist.length - 1];
            for (const sq of [lm.from, lm.to]) {
                const c = squareToCoords(sq);
                const { sx, sy } = logicalToScreen(c.row, c.col);
                html += `<rect x="${sx}" y="${sy}" width="${SQ}" height="${SQ}"
                              fill="${colors.lastMove}" pointer-events="none"/>`;
            }
        }

        // Check king highlight
        if (game.in_check()) {
            const kSq = findKing(game.turn());
            if (kSq) {
                const c = squareToCoords(kSq);
                const { sx, sy } = logicalToScreen(c.row, c.col);
                html += `<rect x="${sx}" y="${sy}" width="${SQ}" height="${SQ}"
                              fill="${colors.check}" pointer-events="none"/>`;
            }
        }

        // Selected piece square
        if (selectedSquare) {
            const c = squareToCoords(selectedSquare);
            const { sx, sy } = logicalToScreen(c.row, c.col);
            html += `<rect x="${sx}" y="${sy}" width="${SQ}" height="${SQ}"
                          fill="${colors.highlight}" pointer-events="none"/>`;
        }

        g.innerHTML = html;
    }

    // ---- Render pieces ----
    function renderPieces() {
        const g = document.getElementById('pcl');
        if (!g) return;
        const board = game.board();
        let html = '';

        for (let lr = 0; lr < 8; lr++) {
            for (let lc = 0; lc < 8; lc++) {
                const piece = board[lr][lc];
                if (!piece) continue;
                const { sx, sy } = logicalToScreen(lr, lc);
                const sqName = coordsToSquare(lr, lc);
                const key = piece.color + piece.type.toUpperCase(); // e.g. wP, bK

                // Try image first; Unicode text is a reliable fallback
                html += `<image href="assets/pieces/${key}.svg"
                               x="${sx}" y="${sy}" width="${SQ}" height="${SQ}"
                               class="chess-piece" data-sq="${sqName}"
                               style="cursor:grab;"
                               onerror="this.style.display='none';document.getElementById('txt-${sqName}').style.display='block'"/>`;

                // Unicode fallback text (hidden by default)
                const isWhite = piece.color === 'w';
                html += `<text id="txt-${sqName}"
                               x="${sx + SQ/2}" y="${sy + SQ*0.72}"
                               text-anchor="middle" font-size="${SQ*0.78}"
                               fill="${isWhite ? '#fff' : '#000'}"
                               stroke="${isWhite ? '#000' : '#fff'}"
                               stroke-width="0.6" paint-order="stroke"
                               class="chess-piece" data-sq="${sqName}"
                               style="display:none;cursor:grab;user-select:none;">${UNICODE_PIECES[key]}</text>`;
            }
        }
        g.innerHTML = html;
    }

    // ---- Render move hint dots ----
    function renderHints() {
        const g = document.getElementById('hnt');
        if (!g) return;
        if (!selectedSquare || !activeMoves.length) { g.innerHTML = ''; return; }

        let html = '';
        for (const mv of activeMoves) {
            const c = squareToCoords(mv.to);
            const { sx, sy } = logicalToScreen(c.row, c.col);
            const cx = sx + SQ / 2;
            const cy = sy + SQ / 2;
            const hasCapture = game.get(mv.to);
            if (hasCapture) {
                html += `<circle cx="${cx}" cy="${cy}" r="${SQ/2-0.5}"
                                 fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2.2"/>`;
            } else {
                html += `<circle cx="${cx}" cy="${cy}" r="${SQ/5.5}"
                                 fill="rgba(0,0,0,0.18)"/>`;
            }
        }
        g.innerHTML = html;
    }

    // ---- Event binding ----
    function bindEvents() {
        const svg = document.getElementById('chess-svg');
        if (!svg) return;

        // Click handler covers squares AND pieces (via event delegation)
        svg.addEventListener('click', (e) => {
            const target = e.target.closest('[data-sq]');
            if (!target) return;
            const sq = target.getAttribute('data-sq');
            handleClick(sq);
        });

        // Drag & drop
        svg.addEventListener('mousedown', onDragStart);
        svg.addEventListener('touchstart', onDragStart, { passive: false });
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchend', onDragEnd);
    }

    function handleClick(sqName) {
        if (!isMyTurn()) return;
        const piece = game.get(sqName);

        // Select own piece
        if (piece && piece.color === game.turn()) {
            selectedSquare = sqName;
            activeMoves = game.moves({ square: sqName, verbose: true });
            renderOverlays();
            renderHints();
            return;
        }

        // Attempt move
        if (selectedSquare) {
            const legal = activeMoves.find(m => m.to === sqName);
            if (legal) {
                doMove(selectedSquare, sqName);
            } else {
                selectedSquare = null;
                activeMoves = [];
                renderOverlays();
                renderHints();
            }
        }
    }

    // ---- Drag ----
    function onDragStart(e) {
        if (!isMyTurn()) return;
        const target = (e.type === 'touchstart' ? e.target : e.target).closest('[data-sq]');
        if (!target) return;
        const sq = target.getAttribute('data-sq');
        const piece = game.get(sq);
        if (!piece || piece.color !== game.turn()) return;

        e.preventDefault();
        isDragging = true;
        dragPiece = target;
        dragStartSquare = sq;
        selectedSquare = sq;
        activeMoves = game.moves({ square: sq, verbose: true });

        const svg = document.getElementById('chess-svg');
        const rect = svg.getBoundingClientRect();
        const cx = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const cy = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        dragOriginX = cx - rect.left;
        dragOriginY = cy - rect.top;

        renderOverlays();
        renderHints();
        dragPiece.style.opacity = '0.5';
    }

    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        if (dragPiece) dragPiece.style.opacity = '1';

        const svg = document.getElementById('chess-svg');
        if (!svg) { dragPiece = null; return; }
        const rect = svg.getBoundingClientRect();
        const cx = e.type === 'touchend' ? e.changedTouches[0].clientX : e.clientX;
        const cy = e.type === 'touchend' ? e.changedTouches[0].clientY : e.clientY;

        const fractionX = (cx - rect.left) / rect.width;
        const fractionY = (cy - rect.top) / rect.height;
        let sc = Math.floor(fractionX * 8); // screen col
        let sr = Math.floor(fractionY * 8); // screen row
        sc = Math.max(0, Math.min(7, sc));
        sr = Math.max(0, Math.min(7, sr));

        const lr = flipped ? 7 - sr : sr;
        const lc = flipped ? 7 - sc : sc;
        const dropSq = coordsToSquare(lr, lc);

        const legal = activeMoves.find(m => m.to === dropSq);
        if (legal && dropSq !== dragStartSquare) {
            doMove(dragStartSquare, dropSq);
        } else {
            selectedSquare = null;
            activeMoves = [];
            renderOverlays();
            renderHints();
        }
        dragPiece = null;
        dragStartSquare = null;
    }

    // ---- Execute a move ----
    function doMove(from, to, promotion = null) {
        const piece = game.get(from);
        if (!piece) return;

        // Pawn promotion interception
        const isPromo = piece.type === 'p' && (to[1] === '8' || to[1] === '1');
        if (isPromo && !promotion) {
            showPromotionDialog(from, to);
            return;
        }

        const hadCapture = !!game.get(to);
        const result = game.move({ from, to, promotion: promotion || undefined });
        if (!result) return;

        selectedSquare = null;
        activeMoves = [];

        // Sound
        if (game.in_check()) ChessSFX.playCheck();
        else if (hadCapture || result.flags.includes('e')) ChessSFX.playCapture();
        else ChessSFX.playMove();

        triggerIncrement(result.color);
        fullRender();
        updateCapturedDisplay();
        appendMoveLog(result);

        // Network sync
        if (appState.gameMode.startsWith('p2p')) {
            ChessNetwork.sendMatchPacket({ type: 'move', from, to, promotion, clocks: appState.timers });
        }

        checkGameEnd();

        // AI response
        if (appState.gameMode === 'vs_ai' && !game.game_over() && game.turn() === 'b') {
            setTimeout(makeAIMove, 500);
        }
    }

    // ---- Handle remote peer move ----
    function handleRemoteMove(from, to, promotion, clocks) {
        if (clocks) appState.timers = clocks;
        const hadCapture = !!game.get(to);
        const result = game.move({ from, to, promotion: promotion || undefined });
        if (!result) return;

        if (game.in_check()) ChessSFX.playCheck();
        else if (hadCapture || result.flags.includes('e')) ChessSFX.playCapture();
        else ChessSFX.playMove();

        triggerIncrement(result.color);
        fullRender();
        updateCapturedDisplay();
        appendMoveLog(result);
        checkGameEnd();
    }

    // ---- Promotion dialog ----
    function showPromotionDialog(from, to) {
        const overlay = document.getElementById('promotion-overlay');
        const container = document.getElementById('promo-pieces-container');
        overlay.classList.add('active');

        const color = game.turn();
        let html = '';
        for (const type of ['q', 'r', 'b', 'n']) {
            const key = color + type.toUpperCase();
            html += `<div class="promo-option" data-type="${type}" style="font-size:3rem;text-align:center;line-height:1.2;">
                        <img src="assets/pieces/${key}.svg" style="width:80%;height:80%;"
                             onerror="this.style.display='none';this.nextSibling.style.display='block'"/>
                        <span style="display:none;">${UNICODE_PIECES[key]}</span>
                     </div>`;
        }
        container.innerHTML = html;
        container.querySelectorAll('.promo-option').forEach(opt => {
            opt.onclick = () => {
                overlay.classList.remove('active');
                doMove(from, to, opt.getAttribute('data-type'));
            };
        });
    }

    // ---- Helpers ----
    function findKing(color) {
        const board = game.board();
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (board[r][c]?.type === 'k' && board[r][c]?.color === color)
                    return coordsToSquare(r, c);
        return null;
    }

    function isMyTurn() {
        const t = game.turn();
        if (appState.gameMode === 'pass_play') return true;
        if (appState.gameMode === 'vs_ai') return t === 'w';
        if (appState.gameMode.startsWith('p2p')) return t === clientColor;
        return false;
    }

    function updateCapturedDisplay() {
        const board = game.board();
        const init = { w:{p:8,n:2,b:2,r:2,q:1}, b:{p:8,n:2,b:2,r:2,q:1} };
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && p.type !== 'k') init[p.color][p.type]--;
            }
        const icons = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛' };
        const toHtml = (counts) => Object.entries(counts)
            .filter(([,n]) => n > 0)
            .map(([t,n]) => `<span title="${n}x ${t.toUpperCase()}">${icons[t].repeat(n)}</span>`)
            .join('');

        const opp = clientColor === 'w' ? 'b' : 'w';
        document.getElementById('captured-by-local').innerHTML = toHtml(init[opp]);
        document.getElementById('captured-by-opponent').innerHTML = toHtml(init[clientColor]);
    }

    function appendMoveLog(result) {
        const log = document.getElementById('moves-log-div');
        const hist = game.history();
        const num = Math.ceil(hist.length / 2);
        if (hist.length % 2 !== 0) {
            const row = document.createElement('div');
            row.style.display = 'contents';
            row.id = `mr-${num}`;
            row.innerHTML = `<span class="move-num">${num}.</span>
                             <span class="move-notation">${result.san}</span>
                             <span class="move-notation" id="mb-${num}"></span>`;
            log.appendChild(row);
        } else {
            const el = document.getElementById(`mb-${num}`);
            if (el) el.textContent = result.san;
        }
        log.scrollTop = log.scrollHeight;
    }

    function checkGameEnd() {
        if (!game.game_over()) return;
        clearInterval(appState.timerInterval);
        ChessSFX.playGameOver();
        let title = 'Game Over', details = '';
        if (game.in_checkmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            title = 'Checkmate!';
            details = `${winner} wins by checkmate.`;
        } else if (game.in_draw()) {
            title = 'Match Drawn';
            details = game.in_stalemate() ? 'Stalemate.' :
                      game.insufficient_material() ? 'Insufficient material.' :
                      game.in_threefold_repetition() ? 'Threefold repetition.' : 'Draw (50-move rule).';
        }
        announceGameOver(title, details);
    }

    // ---- AI (Minimax + Alpha-Beta) ----
    function makeAIMove() {
        const diff = document.getElementById('ai-difficulty')?.value || 'medium';
        const depth = diff === 'easy' ? 2 : diff === 'hard' ? 4 : 3;
        const best = getBestMove(depth);
        if (best) doMove(best.from, best.to, best.promotion || null);
    }

    function getBestMove(depth) {
        const moves = game.moves({ verbose: true });
        if (!moves.length) return null;
        moves.sort((a, b) => (b.captured?10:0)+(b.san.includes('+')?5:0) - ((a.captured?10:0)+(a.san.includes('+')?5:0)));
        let best = null, bestVal = Infinity, beta = Infinity;
        for (const mv of moves) {
            game.move(mv);
            const val = minimax(depth - 1, -Infinity, beta, true);
            game.undo();
            if (val < bestVal) { bestVal = val; best = mv; }
            beta = Math.min(beta, val);
        }
        return best;
    }

    function minimax(depth, alpha, beta, maximizing) {
        if (depth === 0 || game.game_over()) return evalBoard();
        const moves = game.moves({ verbose: true });
        if (maximizing) {
            let max = -Infinity;
            for (const mv of moves) {
                game.move(mv);
                max = Math.max(max, minimax(depth-1, alpha, beta, false));
                game.undo();
                alpha = Math.max(alpha, max);
                if (beta <= alpha) break;
            }
            return max;
        } else {
            let min = Infinity;
            for (const mv of moves) {
                game.move(mv);
                min = Math.min(min, minimax(depth-1, alpha, beta, true));
                game.undo();
                beta = Math.min(beta, min);
                if (beta <= alpha) break;
            }
            return min;
        }
    }

    function evalBoard() {
        let score = 0;
        const board = game.board();
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p) continue;
                const ri = p.color === 'w' ? r : 7-r;
                const ci = p.color === 'w' ? c : 7-c;
                const val = PIECE_VALUES[p.type] + (PST[p.type]?.[ri]?.[ci] || 0);
                score += p.color === 'w' ? val : -val;
            }
        return score;
    }

    // ---- Rematch ----
    function handleRematchRequest() {
        document.getElementById('gameover-overlay').classList.remove('active');
        if (appState.gameMode === 'vs_ai') setupMatchState('Human Player', 'Local AI', 'w', false);
        else if (appState.gameMode === 'pass_play') setupMatchState('White Player', 'Black Player', 'w', false);
        else { showToast('Rematch offer sent...'); ChessNetwork.sendMatchPacket({ type: 'rematch_offer' }); }
    }

    function resetGameAndSwapColors() {
        const next = clientColor === 'w' ? 'b' : 'w';
        const myName = document.getElementById('name-local').textContent;
        const oppName = document.getElementById('name-opponent').textContent;
        setupMatchState(
            next === 'w' ? myName : oppName,
            next === 'w' ? oppName : myName,
            next, true
        );
    }

    return {
        initGame,
        getTurn: () => game.turn(),
        getClientColor: () => clientColor,
        handleRemoteMove,
        announceGameOver,
        resetGameAndSwapColors,
        fullRender // expose for theme switching
    };
})();
