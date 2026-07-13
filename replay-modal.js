/* =============================================================
   ANTIGRAVITY CHESS — Replay Engine & View (replay-modal.js)
   Parses PGN and renders step-by-step game history navigators
   ============================================================= */

// Local state variables for active replay
let replayEngine = null; 
let replayMoves = [];
let currentMoveIndex = -1;
let userColor = 'w';

// Symbols map matching Wikipedia SVG assets
const PIECE_NAMES = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function openReplayModal(match) {
    if (!match || !match.pgn) {
        if (window.toast) window.toast("No PGN history available for this match.");
        return;
    }

    // Initialize chess.js helper instance
    replayEngine = new Chess();
    const success = replayEngine.load_pgn(match.pgn);
    if (!success) {
        // Fallback: try loading via moves history if loading complete pgn fails
        replayEngine.reset();
    }

    replayMoves = replayEngine.history({ verbose: true });
    replayEngine.reset(); // Reset to starting board
    currentMoveIndex = -1;
    userColor = match.myColor || 'w';

    // Update Header Text
    const formattedDate = new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById("replay-header").textContent = `Replay: vs ${match.opponent} (${formattedDate})`;

    // Display Overlay
    document.getElementById("replay-overlay").style.display = "flex";

    // Draw starting position
    renderReplayBoard();
    renderMovesList();

    // Bind Controls
    document.getElementById("btn-rep-first").onclick = () => jumpToMove(-1);
    document.getElementById("btn-rep-prev").onclick = () => jumpToMove(currentMoveIndex - 1);
    document.getElementById("btn-rep-next").onclick = () => jumpToMove(currentMoveIndex + 1);
    document.getElementById("btn-rep-last").onclick = () => jumpToMove(replayMoves.length - 1);

    document.getElementById("btn-close-replay-modal").onclick = () => {
        document.getElementById("replay-overlay").style.display = "none";
    };
}

function jumpToMove(index) {
    if (index < -1 || index >= replayMoves.length) return;

    replayEngine.reset();
    for (let i = 0; i <= index; i++) {
        replayEngine.move(replayMoves[i]);
    }
    
    currentMoveIndex = index;
    renderReplayBoard();
    highlightMovesListElement();
}

function renderReplayBoard() {
    const wrap = document.getElementById("replay-board-wrap");
    wrap.innerHTML = ""; // Clear board

    const board = replayEngine.board();
    const isFlipped = (userColor === 'b');

    // Get active move detail for highlights
    const lastMove = currentMoveIndex >= 0 ? replayMoves[currentMoveIndex] : null;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const ri = isFlipped ? 7 - r : r;
            const ci = isFlipped ? 7 - c : c;
            
            // Generate board square
            const squareDiv = document.createElement("div");
            const squareName = String.fromCharCode(97 + c) + (8 - r);
            const isDark = (r + c) % 2 === 1;

            squareDiv.className = `sq ${isDark ? 'dark' : 'light'}`;
            squareDiv.style.position = "absolute";
            squareDiv.style.width = "12.5%";
            squareDiv.style.height = "12.5%";
            squareDiv.style.top = `${ri * 12.5}%`;
            squareDiv.style.left = `${ci * 12.5}%`;

            // Highlight last-move tiles (start and end)
            if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) {
                squareDiv.classList.add(isDark ? "last-move-dark" : "last-move-light");
            }

            // Draw Piece Image if present
            const piece = board[r][c];
            if (piece) {
                const img = document.createElement("img");
                const pieceCode = `${piece.color}${PIECE_NAMES[piece.type]}`;
                img.src = `assets/pieces/${pieceCode}.svg`;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "contain";
                squareDiv.appendChild(img);
            }

            wrap.appendChild(squareDiv);
        }
    }
}

function renderMovesList() {
    const list = document.getElementById("replay-moves-list");
    list.innerHTML = ""; // Clear list

    if (replayMoves.length === 0) {
        list.textContent = "No moves played in this match.";
        return;
    }

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "0.25rem";

    let rowDiv = null;

    for (let i = 0; i < replayMoves.length; i++) {
        const move = replayMoves[i];
        const moveNum = Math.floor(i / 2) + 1;

        if (i % 2 === 0) {
            // White move: start a new row
            rowDiv = document.createElement("div");
            rowDiv.style.display = "flex";
            rowDiv.style.gap = "0.5rem";
            
            const numSpan = document.createElement("span");
            numSpan.textContent = `${moveNum}.`;
            numSpan.style.color = "var(--text2)";
            numSpan.style.width = "25px";
            numSpan.style.fontWeight = "700";
            rowDiv.appendChild(numSpan);
            container.appendChild(rowDiv);
        }

        const moveSpan = document.createElement("span");
        moveSpan.className = "replay-move-item";
        moveSpan.id = `rep-move-${i}`;
        moveSpan.textContent = move.san;
        moveSpan.style.flex = "1";
        
        moveSpan.onclick = () => jumpToMove(i);
        rowDiv.appendChild(moveSpan);
    }

    list.appendChild(container);
    highlightMovesListElement();
}

function highlightMovesListElement() {
    // Clear all highlighted elements
    document.querySelectorAll(".replay-move-item").forEach(el => {
        el.classList.remove("active");
    });

    if (currentMoveIndex >= 0) {
        const activeSpan = document.getElementById(`rep-move-${currentMoveIndex}`);
        if (activeSpan) {
            activeSpan.classList.add("active");
            activeSpan.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }
}
