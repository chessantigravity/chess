// Chess Board Renderer and AI Engine
// Handles SVG board display, mouse drag-and-drop, promotion overlays, logic validation, and AI minimax player

const ChessGameController = (() => {
    let game = new Chess();
    let boardMount = null;
    let clientColor = 'w'; // 'w' or 'b'
    let flipped = false;
    let selectedSquare = null;
    let activeMoves = [];
    let isDragging = false;
    let dragElement = null;
    let startCoords = { x: 0, y: 0 };
    let boardOffset = { x: 0, y: 0 };
    let squareSize = 12.5; // percentage based size (100% / 8)
    
    // Evaluation values for AI (Piece Weights)
    const PIECE_VALUES = {
        p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000
    };
    
    // Piece-Square Tables (PST) to guide AI positioning
    const PST_PAWN = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ];

    const PST_KNIGHT = [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ];

    const PST_BISHOP = [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ];

    const PST_ROOK = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ];

    const PST_QUEEN = [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  5,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ];

    const PST_KING_MIDDLE = [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ];

    function initGame(colorChoice) {
        game = new Chess();
        clientColor = colorChoice;
        flipped = (clientColor === 'b');
        selectedSquare = null;
        activeMoves = [];
        
        boardMount = document.getElementById('board-mount');
        
        // Setup board flip button listener
        document.getElementById('btn-flip-board').onclick = () => {
            flipped = !flipped;
            drawBoard();
        };
        
        drawBoard();
        
        // Listeners for offline rematch requests
        document.getElementById('btn-rematch').onclick = handleRematchRequest;
        document.getElementById('btn-gameover-rematch').onclick = handleRematchRequest;
        
        // If local client is Black and we are in VS AI mode, trigger AI move
        if (appState.gameMode === 'vs_ai' && clientColor === 'b') {
            setTimeout(makeAIMove, 500);
        }
    }

    // Convert row/column to algebraic square coordinates
    function coordsToSquare(row, col) {
        const fileNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const rankNames = ['8', '7', '6', '5', '4', '3', '2', '1'];
        return fileNames[col] + rankNames[row];
    }

    // Convert algebraic square to row/column index
    function squareToCoords(square) {
        const file = square.charCodeAt(0) - 97; // 'a' code is 97
        const rank = 8 - parseInt(square.charAt(1));
        return { row: rank, col: file };
    }

    // Primary board layout drawing function using SVG
    function drawBoard() {
        if (!boardMount) return;
        
        let html = `<svg viewBox="0 0 100 100" class="chess-board-svg theme-${appState.theme}">`;
        
        // Draw squares grid
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const drawRow = flipped ? 7 - r : r;
                const drawCol = flipped ? 7 - c : c;
                
                const squareName = coordsToSquare(drawRow, drawCol);
                const isLight = (drawRow + drawCol) % 2 === 0;
                const className = isLight ? 'light' : 'dark';
                
                const x = drawCol * squareSize;
                const y = drawRow * squareSize;
                
                html += `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" 
                               class="square-rect ${className}" data-square="${squareName}" />`;
            }
        }
        
        // Overlays Layer: Highlight last move, selected piece, checks
        html += `<g id="board-overlays"></g>`;
        
        // Pieces Layer
        html += `<g id="board-pieces"></g>`;
        
        // Drag helper layer (allows hover highlights)
        html += `<g id="board-hints" pointer-events="none"></g>`;
        
        // Labels for notations (Files: a-h, Ranks: 1-8)
        html += drawLabels();
        
        html += `</svg>`;
        boardMount.innerHTML = html;
        
        renderOverlays();
        renderPieces();
        bindBoardEvents();
    }

    function drawLabels() {
        let labels = '';
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        
        for (let i = 0; i < 8; i++) {
            const drawIdx = flipped ? 7 - i : i;
            
            // Draw rank labels (1-8) on left border
            const rankY = i * squareSize + 3.8;
            const rankLabel = flipped ? (i + 1) : (8 - i);
            labels += `<text x="0.8" y="${rankY}" class="board-notation">${rankLabel}</text>`;
            
            // Draw file labels (a-h) on bottom border
            const fileX = i * squareSize + 10.3;
            const fileLabel = files[drawIdx];
            labels += `<text x="${fileX}" y="99.2" class="board-notation">${fileLabel}</text>`;
        }
        return labels;
    }

    // Render highlights
    function renderOverlays() {
        const overlayG = document.getElementById('board-overlays');
        if (!overlayG) return;
        
        let html = '';
        const history = game.history({ verbose: true });
        
        // Highlight last move squares
        if (history.length > 0) {
            const lastMove = history[history.length - 1];
            const fromCoords = squareToCoords(lastMove.from);
            const toCoords = squareToCoords(lastMove.to);
            
            const fromX = (flipped ? 7 - fromCoords.col : fromCoords.col) * squareSize;
            const fromY = (flipped ? 7 - fromCoords.row : fromCoords.row) * squareSize;
            const toX = (flipped ? 7 - toCoords.col : toCoords.col) * squareSize;
            const toY = (flipped ? 7 - toCoords.row : toCoords.row) * squareSize;
            
            html += `<rect x="${fromX}" y="${fromY}" width="${squareSize}" height="${squareSize}" class="last-move-overlay" />`;
            html += `<rect x="${toX}" y="${toY}" width="${squareSize}" height="${squareSize}" class="last-move-overlay" />`;
        }
        
        // Highlight active check state square (red glow on king)
        if (game.in_check()) {
            const kingColor = game.turn();
            const kingSquare = findKingSquare(kingColor);
            if (kingSquare) {
                const kingCoords = squareToCoords(kingSquare);
                const kx = (flipped ? 7 - kingCoords.col : kingCoords.col) * squareSize;
                const ky = (flipped ? 7 - kingCoords.row : kingCoords.row) * squareSize;
                html += `<rect x="${kx}" y="${ky}" width="${squareSize}" height="${squareSize}" class="check-overlay" />`;
            }
        }
        
        // Highlight selected piece square
        if (selectedSquare) {
            const coords = squareToCoords(selectedSquare);
            const sx = (flipped ? 7 - coords.col : coords.col) * squareSize;
            const sy = (flipped ? 7 - coords.row : coords.row) * squareSize;
            html += `<rect x="${sx}" y="${sy}" width="${squareSize}" height="${squareSize}" class="highlight-overlay" />`;
        }
        
        overlayG.innerHTML = html;
    }

    function findKingSquare(color) {
        const board = game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === color) {
                    return coordsToSquare(r, c);
                }
            }
        }
        return null;
    }

    // Render chess pieces on board
    function renderPieces() {
        const piecesG = document.getElementById('board-pieces');
        if (!piecesG) return;
        
        let html = '';
        const board = game.board();
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (!piece) continue;
                
                const drawRow = flipped ? 7 - r : r;
                const drawCol = flipped ? 7 - c : c;
                
                const squareName = coordsToSquare(r, c);
                const x = drawCol * squareSize;
                const y = drawRow * squareSize;
                
                // SVG Image element referencing the locally saved SVG pieces
                const imgName = piece.color + piece.type.toUpperCase(); // e.g. wP, bK
                
                html += `<image href="assets/pieces/${imgName}.svg" x="${x}" y="${y}" 
                                width="${squareSize}" height="${squareSize}" 
                                class="chess-piece" data-square="${squareName}" 
                                id="piece-${squareName}" />`;
            }
        }
        piecesG.innerHTML = html;
    }

    // Render dots showing possible move positions
    function renderHints() {
        const hintsG = document.getElementById('board-hints');
        if (!hintsG) return;
        
        if (!selectedSquare || activeMoves.length === 0) {
            hintsG.innerHTML = '';
            return;
        }
        
        let html = '';
        activeMoves.forEach(mv => {
            const targetCoords = squareToCoords(mv.to);
            const tc = flipped ? 7 - targetCoords.col : targetCoords.col;
            const tr = flipped ? 7 - targetCoords.row : targetCoords.row;
            
            const cx = tc * squareSize + squareSize / 2;
            const cy = tr * squareSize + squareSize / 2;
            
            // Check if capture or normal move hint
            const pieceAtTarget = game.get(mv.to);
            if (pieceAtTarget) {
                // Capture ring
                html += `<circle cx="${cx}" cy="${cy}" r="${squareSize / 2.3}" class="move-hint-ring" />`;
            } else {
                // Centered dot
                html += `<circle cx="${cx}" cy="${cy}" r="${squareSize / 6}" class="move-hint-dot" />`;
            }
        });
        hintsG.innerHTML = html;
    }

    // Attach click and drag-drop events
    function bindBoardEvents() {
        const svg = boardMount.querySelector('.chess-board-svg');
        const pieces = svg.querySelectorAll('.chess-piece');
        const squares = svg.querySelectorAll('.square-rect');
        
        // Click handling for squares
        squares.forEach(sq => {
            sq.addEventListener('click', (e) => {
                const sqName = e.target.getAttribute('data-square');
                handleSquareClick(sqName);
            });
        });
        
        // Touch & Drag-Drop handling for pieces
        pieces.forEach(p => {
            p.addEventListener('mousedown', startDrag);
            p.addEventListener('touchstart', startDrag, { passive: false });
            
            p.addEventListener('click', (e) => {
                e.stopPropagation();
                const sqName = e.target.getAttribute('data-square');
                handleSquareClick(sqName);
            });
        });
        
        // SVG container listeners for active drag moves
        svg.addEventListener('mousemove', drag);
        svg.addEventListener('touchmove', drag, { passive: false });
        
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);
    }

    // Handle standard square click action
    function handleSquareClick(squareName) {
        // Guard checking turns
        if (isMyTurn() === false) {
            selectedSquare = null;
            activeMoves = [];
            renderHints();
            return;
        }
        
        const piece = game.get(squareName);
        
        // Scenario 1: Select Piece
        if (piece && piece.color === game.turn()) {
            selectedSquare = squareName;
            activeMoves = game.moves({ square: squareName, verbose: true });
            renderOverlays();
            renderHints();
            return;
        }
        
        // Scenario 2: Make Move
        if (selectedSquare) {
            const isLegalMove = activeMoves.find(m => m.to === squareName);
            if (isLegalMove) {
                executeMove(selectedSquare, squareName);
            } else {
                selectedSquare = null;
                activeMoves = [];
                renderOverlays();
                renderHints();
            }
        }
    }

    function isMyTurn() {
        const turn = game.turn();
        if (appState.gameMode === 'pass_play') return true;
        if (appState.gameMode === 'vs_ai') return turn === 'w'; // human is White
        if (appState.gameMode.startsWith('p2p')) return turn === clientColor;
        return false;
    }

    // Execute move details
    function executeMove(from, to, promotionPiece = null) {
        const moveDetails = { from: from, to: to };
        const piece = game.get(from);
        
        // Handle pawn promotion interception
        if (piece && piece.type === 'p' && (to.charAt(1) === '8' || to.charAt(1) === '1')) {
            if (!promotionPiece) {
                promptPromotion(from, to);
                return;
            }
            moveDetails.promotion = promotionPiece;
        }
        
        const isCapture = game.get(to) !== null || (piece.type === 'p' && from.charAt(0) !== to.charAt(0) && game.get(to) === null); // en passant check
        
        const result = game.move(moveDetails);
        if (result) {
            selectedSquare = null;
            activeMoves = [];
            
            // SFX selection
            if (game.in_check()) {
                ChessSFX.playCheck();
            } else if (isCapture) {
                ChessSFX.playCapture();
            } else {
                ChessSFX.playMove();
            }
            
            // Trigger game timers update
            appState.turn = game.turn();
            appState.timers.turn = game.turn();
            triggerIncrement(result.color);
            
            // Refresh visuals
            drawBoard();
            updateCapturedDisplay();
            appendMoveLog(result);
            
            // Send network packets
            if (appState.gameMode.startsWith('p2p')) {
                ChessNetwork.sendMatchPacket({
                    type: 'move',
                    from: from,
                    to: to,
                    promotion: promotionPiece,
                    clocks: appState.timers
                });
            }
            
            // Check Match Ending status
            checkGameEnd();
            
            // If offline Vs AI mode and player completed their turn, run AI
            if (appState.gameMode === 'vs_ai' && game.turn() === 'b' && !game.game_over()) {
                setTimeout(makeAIMove, 450);
            }
        }
    }

    // Handle remote moves received through PeerJS
    function handleRemoteMove(from, to, promotion, clocks) {
        if (clocks) {
            appState.timers = clocks;
        }
        
        const piece = game.get(from);
        const isCapture = game.get(to) !== null || (piece && piece.type === 'p' && from.charAt(0) !== to.charAt(0) && game.get(to) === null);
        
        const result = game.move({ from: from, to: to, promotion: promotion });
        if (result) {
            if (game.in_check()) {
                ChessSFX.playCheck();
            } else if (isCapture) {
                ChessSFX.playCapture();
            } else {
                ChessSFX.playMove();
            }
            
            triggerIncrement(result.color);
            drawBoard();
            updateCapturedDisplay();
            appendMoveLog(result);
            checkGameEnd();
        }
    }

    // Pawn Promotion Dialog Selector modal loading
    function promptPromotion(from, to) {
        const overlay = document.getElementById('promotion-overlay');
        const container = document.getElementById('promo-pieces-container');
        overlay.classList.add('active');
        
        const color = game.turn();
        const choices = ['q', 'r', 'b', 'n'];
        
        let html = '';
        choices.forEach(type => {
            const imgName = color + type.toUpperCase();
            html += `<div class="promo-option" data-type="${type}">
                        <svg viewBox="0 0 100 100" style="width:100%; height:100%;">
                            <image href="assets/pieces/${imgName}.svg" width="100" height="100"/>
                        </svg>
                     </div>`;
        });
        container.innerHTML = html;
        
        // Select handler
        container.querySelectorAll('.promo-option').forEach(opt => {
            opt.onclick = (e) => {
                const choice = opt.getAttribute('data-type');
                overlay.classList.remove('active');
                executeMove(from, to, choice);
            };
        });
    }

    // Log captured pieces counts
    function updateCapturedDisplay() {
        const board = game.board();
        const initialPieces = {
            w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
            b: { p: 8, n: 2, b: 2, r: 2, q: 1 }
        };
        
        // Subtract current pieces from board
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && p.type !== 'k') {
                    initialPieces[p.color][p.type]--;
                }
            }
        }
        
        // Helper to output icons for captured pieces
        const generateCapturedHTML = (counts, color) => {
            let res = '';
            const unicodeLabels = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
            
            for (let type in counts) {
                const num = counts[type];
                if (num > 0) {
                    res += `<span style="margin-right: 0.15rem;" title="${num}x Captured ${type.toUpperCase()}">${unicodeLabels[type].repeat(num)}</span>`;
                }
            }
            return res;
        };
        
        const localColor = clientColor;
        const oppColor = localColor === 'w' ? 'b' : 'w';
        
        // pieces captured by local (opponent pieces lost)
        document.getElementById('captured-by-local').innerHTML = generateCapturedHTML(initialPieces[oppColor], oppColor);
        // pieces captured by opponent (local pieces lost)
        document.getElementById('captured-by-opponent').innerHTML = generateCapturedHTML(initialPieces[localColor], localColor);
    }

    // PGN notation history logs display in side-panel
    function appendMoveLog(result) {
        const log = document.getElementById('moves-log-div');
        const history = game.history();
        const moveNum = Math.ceil(history.length / 2);
        
        if (history.length % 2 !== 0) {
            // White move
            const row = document.createElement('div');
            row.style.display = 'contents';
            row.id = `move-row-${moveNum}`;
            row.innerHTML = `<span class="move-num">${moveNum}.</span>
                             <span class="move-notation white-move">${result.san}</span>
                             <span class="move-notation black-move"></span>`;
            log.appendChild(row);
        } else {
            // Black move
            const row = document.getElementById(`move-row-${moveNum}`);
            if (row) {
                row.querySelector('.black-move').textContent = result.san;
            }
        }
        log.scrollTop = log.scrollHeight;
    }

    // Check game termination status
    function checkGameEnd() {
        if (game.game_over()) {
            clearInterval(appState.timerInterval);
            ChessSFX.playGameOver();
            
            let title = 'Game Over';
            let details = '';
            
            if (game.in_checkmate()) {
                const loser = game.turn() === 'w' ? 'White' : 'Black';
                const winner = loser === 'w' ? 'Black' : 'White';
                title = 'Checkmate!';
                details = `${winner} wins by checkmate.`;
            } else if (game.in_draw()) {
                title = 'Match Drawn';
                if (game.in_stalemate()) {
                    details = 'Stalemate reached.';
                } else if (game.insufficient_material()) {
                    details = 'Draw by insufficient material.';
                } else if (game.in_threefold_repetition()) {
                    details = 'Draw by threefold repetition.';
                } else {
                    details = 'Draw agreed / 50-move rule.';
                }
            }
            
            announceGameOver(title, details);
        }
    }

    // ---------------- DRAG AND DROP HANDLERS ----------------
    function startDrag(e) {
        if (!isMyTurn()) return;
        
        const piece = e.target;
        const square = piece.getAttribute('data-square');
        const pieceColor = game.get(square).color;
        
        if (pieceColor !== game.turn()) return;
        
        isDragging = true;
        dragElement = piece;
        selectedSquare = square;
        activeMoves = game.moves({ square: square, verbose: true });
        
        renderOverlays();
        renderHints();
        
        // Calculate offset and starting positions
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        
        const bbox = piece.getBoundingClientRect();
        startCoords.x = clientX;
        startCoords.y = clientY;
        
        boardOffset.x = bbox.left + bbox.width / 2;
        boardOffset.y = bbox.top + bbox.height / 2;
        
        piece.classList.add('dragging');
    }

    function drag(e) {
        if (!isDragging || !dragElement) return;
        e.preventDefault();
        
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        
        // Move element using inline translate (calculated relative to board box size)
        const boardSvg = boardMount.querySelector('.chess-board-svg');
        const boardRect = boardSvg.getBoundingClientRect();
        
        // Percentage based translation relative to SVG viewBox width (100)
        const dx = ((clientX - startCoords.x) / boardRect.width) * 100;
        const dy = ((clientY - startCoords.y) / boardRect.height) * 100;
        
        dragElement.setAttribute('transform', `translate(${dx}, ${dy})`);
    }

    function endDrag(e) {
        if (!isDragging || !dragElement) return;
        
        dragElement.classList.remove('dragging');
        isDragging = false;
        
        // Find square under mouse pointer
        const clientX = e.type.startsWith('touch') ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.changedTouches[0].clientY : e.clientY;
        
        const boardSvg = boardMount.querySelector('.chess-board-svg');
        const boardRect = boardSvg.getBoundingClientRect();
        
        const colFraction = (clientX - boardRect.left) / boardRect.width;
        const rowFraction = (clientY - boardRect.top) / boardRect.height;
        
        let col = Math.floor(colFraction * 8);
        let row = Math.floor(rowFraction * 8);
        
        if (flipped) {
            col = 7 - col;
            row = 7 - row;
        }
        
        let validDrop = false;
        
        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
            const dropSquare = coordsToSquare(row, col);
            const isLegal = activeMoves.find(m => m.to === dropSquare);
            
            if (isLegal) {
                validDrop = true;
                executeMove(selectedSquare, dropSquare);
            }
        }
        
        // Snaps element position back if drop was invalid or aborted
        if (!validDrop) {
            dragElement.removeAttribute('transform');
            selectedSquare = null;
            activeMoves = [];
            renderOverlays();
            renderHints();
        }
        
        dragElement = null;
    }

    // ---------------- ENGINE AI MINIMAX ALGORITHM ----------------
    function makeAIMove() {
        const diff = document.getElementById('ai-difficulty').value;
        let depth = 2; // Easy
        if (diff === 'medium') depth = 3;
        else if (diff === 'hard') depth = 4;
        
        const bestMove = getBestMove(game, depth);
        if (bestMove) {
            executeMove(bestMove.from, bestMove.to, bestMove.promotion);
        }
    }

    // Find the best move for Black (minimizing player)
    function getBestMove(gameInstance, depth) {
        const moves = gameInstance.moves({ verbose: true });
        if (moves.length === 0) return null;
        
        // Sort moves to optimize alpha-beta pruning (checks & captures evaluated first)
        moves.sort((a, b) => {
            const scoreA = (a.captured ? 10 : 0) + (a.san.includes('+') ? 5 : 0);
            const scoreB = (b.captured ? 10 : 0) + (b.san.includes('+') ? 5 : 0);
            return scoreB - scoreA;
        });
        
        let bestMove = null;
        let bestValue = 999999; // Since black wants to minimize evaluation
        let alpha = -999999;
        let beta = 999999;
        
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            
            gameInstance.move(move);
            const boardValue = minimax(gameInstance, depth - 1, alpha, beta, true); // true: White maximizing next
            gameInstance.undo();
            
            if (boardValue < bestValue) {
                bestValue = boardValue;
                bestMove = move;
            }
            beta = Math.min(beta, boardValue);
        }
        return bestMove;
    }

    // Recursive Minimax search with Alpha-Beta pruning
    function minimax(gameInstance, depth, alpha, beta, isMaximizing) {
        if (depth === 0 || gameInstance.game_over()) {
            return evaluateBoard(gameInstance.board());
        }
        
        const moves = gameInstance.moves({ verbose: true });
        
        if (isMaximizing) {
            let maxEval = -999999;
            for (let i = 0; i < moves.length; i++) {
                gameInstance.move(moves[i]);
                const evaluation = minimax(gameInstance, depth - 1, alpha, beta, false);
                gameInstance.undo();
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = 999999;
            for (let i = 0; i < moves.length; i++) {
                gameInstance.move(moves[i]);
                const evaluation = minimax(gameInstance, depth - 1, alpha, beta, true);
                gameInstance.undo();
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    // Simple static evaluation function (evaluates from White perspective: positive is white advantage)
    function evaluateBoard(board) {
        let totalEvaluation = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                totalEvaluation += getPieceValue(board[r][c], r, c);
            }
        }
        return totalEvaluation;
    }

    function getPieceValue(piece, r, c) {
        if (piece === null) return 0;
        
        let value = PIECE_VALUES[piece.type];
        
        // Add positional values based on PST
        // Perspective adjustment: White tables are read directly, Black tables flipped vertically
        const rowIdx = piece.color === 'w' ? r : 7 - r;
        const colIdx = piece.color === 'w' ? c : 7 - c;
        
        switch (piece.type) {
            case 'p': value += PST_PAWN[rowIdx][colIdx]; break;
            case 'n': value += PST_KNIGHT[rowIdx][colIdx]; break;
            case 'b': value += PST_BISHOP[rowIdx][colIdx]; break;
            case 'r': value += PST_ROOK[rowIdx][colIdx]; break;
            case 'q': value += PST_QUEEN[rowIdx][colIdx]; break;
            case 'k': value += PST_KING_MIDDLE[rowIdx][colIdx]; break;
        }
        
        return piece.color === 'w' ? value : -value;
    }

    // ---------------- NETWORK REMATCH TRIGGERS ----------------
    function handleRematchRequest() {
        document.getElementById('gameover-overlay').classList.remove('active');
        if (appState.gameMode === 'vs_ai') {
            setupMatchState('Human Player', 'Local AI', 'w', false);
        } else if (appState.gameMode === 'pass_play') {
            setupMatchState('White Player', 'Black Player', 'w', false);
        } else if (appState.gameMode.startsWith('p2p')) {
            showToast('Rematch offer sent...');
            ChessNetwork.sendMatchPacket({ type: 'rematch_offer' });
        }
    }
    
    function resetGameAndSwapColors() {
        // Swap host/guest client colors for a fresh rematch!
        const nextColor = clientColor === 'w' ? 'b' : 'w';
        const myName = document.getElementById('name-local').textContent;
        const oppName = document.getElementById('name-opponent').textContent;
        
        setupMatchState(
            nextColor === 'w' ? myName : oppName, 
            nextColor === 'w' ? oppName : myName, 
            nextColor, 
            true
        );
    }

    return {
        initGame: initGame,
        getTurn: () => game.turn(),
        getClientColor: () => clientColor,
        handleRemoteMove: handleRemoteMove,
        announceGameOver: announceGameOver,
        resetGameAndSwapColors: resetGameAndSwapColors
    };
})();
