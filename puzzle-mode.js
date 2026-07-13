/* =============================================================
   ANTIGRAVITY CHESS — Puzzle Mode Engine (puzzle-mode.js)
   Renders winding path maps, tracks completion stats, handles
   multi-move solution checks, hints, resets, and profiles syncing.
   ============================================================= */

import { generate500Puzzles } from "./puzzle-data.js";
import { DbService } from "./db-service.js";
import { AuthService } from "./auth-service.js";

// Global puzzle database (506 entries)
const PUZZLES_DB = generate500Puzzles();

// Active Puzzle state
let currentUser = null;
let isGuestUser = false;
let unlockedLevel = 1; // Highest level unlocked (starts at 1)
let puzzleStars = {}; // Object mapping level_id to star rating (e.g. { 1: 3, 2: 2 })
let activeLevelId = null;
let activePuzzle = null;
let activeEngine = null;
let selectedSq = null;
let currentMoveIndex = 0;
let currentAttemptStars = 3;

// Symbols map matching Wikipedia SVG assets
const PIECE_NAMES = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function initPuzzleMode(user, isGuest) {
    currentUser = user;
    isGuestUser = isGuest;

    // Show appropriate screen
    document.getElementById("lobby").style.display = "none";
    document.getElementById("game").style.display = "none";
    document.getElementById("learn-academy").style.display = "none";
    document.getElementById("puzzle-academy").style.display = "block";

    // Bind Home Button
    document.getElementById("btn-puzzle-home").onclick = () => {
        document.getElementById("puzzle-academy").style.display = "none";
        document.getElementById("lobby").style.display = "block";
        if (window.authUIUpdate) window.authUIUpdate(currentUser, isGuestUser);
    };

    // Load progress and render map
    loadProgress().then(() => {
        renderMap();
        updateMapHeaderStats();
        
        // Scroll current active level into view
        setTimeout(scrollCurrentLevelIntoView, 200);
    });

    // Bind puzzle controls
    document.getElementById("btn-puzzle-reset").onclick = resetActivePuzzle;
    document.getElementById("btn-puzzle-hint").onclick = showPuzzleHint;
}

// Load level progress from Firestore (or localStorage simulation)
async function loadProgress() {
    if (isGuestUser) {
        unlockedLevel = parseInt(localStorage.getItem("mock_puzzle_unlocked") || "1");
        puzzleStars = JSON.parse(localStorage.getItem("mock_puzzle_stars") || "{}");
    } else {
        try {
            const profile = await DbService.getUserProfile(currentUser.uid);
            if (profile) {
                unlockedLevel = profile.puzzleProgress || 1;
                puzzleStars = profile.puzzleStars || {};
            }
        } catch (e) {
            console.error("Failed to load puzzle progress:", e);
        }
    }
}

// Save level progress to database
async function saveProgress(levelCompleted, starsEarned) {
    puzzleStars[levelCompleted] = Math.max(puzzleStars[levelCompleted] || 0, starsEarned);
    
    if (levelCompleted === unlockedLevel && unlockedLevel < 506) {
        unlockedLevel++;
    }

    if (isGuestUser) {
        localStorage.setItem("mock_puzzle_unlocked", unlockedLevel.toString());
        localStorage.setItem("mock_puzzle_stars", JSON.stringify(puzzleStars));
    } else {
        try {
            await DbService.updateUserProfile(currentUser.uid, {
                puzzleProgress: unlockedLevel,
                puzzleStars: puzzleStars
            });
        } catch (e) {
            console.error("Failed to save puzzle progress:", e);
        }
    }
}

// Update Map Sidebar stats
function updateMapHeaderStats() {
    const totalLevels = PUZZLES_DB.length;
    const completedCount = Object.keys(puzzleStars).length;
    const pct = Math.round((completedCount / totalLevels) * 100);
    const totalStarsCount = Object.values(puzzleStars).reduce((a, b) => a + b, 0);

    document.getElementById("puzzle-progress-pct").textContent = `${pct}%`;
    document.getElementById("puzzle-total-stars").innerHTML = `<i class="fa fa-star" style="color:#fbbf24;"></i> ${totalStarsCount}`;
    document.getElementById("puzzle-unlocked-level").textContent = `${unlockedLevel}/${totalLevels}`;
}

// Render Winding Candy Crush Level Path Map
function renderMap() {
    const container = document.getElementById("puzzle-map-path");
    if (!container) return;
    container.innerHTML = "";

    const totalLevels = PUZZLES_DB.length;
    
    // Sinusoidal snake alignment geometry configuration
    container.style.height = `${totalLevels * 65 + 60}px`;

    for (let i = 0; i < totalLevels; i++) {
        const levelNum = i + 1;
        const isUnlocked = levelNum <= unlockedLevel;
        const isCompleted = puzzleStars[levelNum] !== undefined;
        const isActive = levelNum === unlockedLevel;

        const node = document.createElement("div");
        node.className = "map-level-node";
        if (isActive) node.classList.add("current");
        else if (isCompleted) node.classList.add("completed");
        else if (!isUnlocked) node.classList.add("locked");

        // Sinusoidal winding alignment offset
        const theta = i / 3.0; // wave frequency scale
        const leftOffset = 50 + 32 * Math.sin(theta); // left percentage (range 18% to 82%)
        const topOffset = i * 65 + 30; // vertical offset pixels

        node.style.left = `${leftOffset}%`;
        node.style.top = `${topOffset}px`;
        node.textContent = levelNum;

        // Render completed stars
        if (isCompleted) {
            const starsContainer = document.createElement("div");
            starsContainer.className = "map-level-stars";
            const starsEarned = puzzleStars[levelNum] || 0;
            for (let s = 0; s < 3; s++) {
                const star = document.createElement("i");
                star.className = "fa fa-star";
                if (s < starsEarned) star.style.color = "#fbbf24";
                else star.style.color = "rgba(255,255,255,0.15)";
                starsContainer.appendChild(star);
            }
            node.appendChild(starsContainer);
        }

        // Active node indicators
        if (isActive) {
            const arrow = document.createElement("div");
            arrow.style.position = "absolute";
            arrow.style.top = "-22px";
            arrow.innerHTML = '<i class="fa fa-chevron-down" style="color:var(--accent); font-size:0.8rem; animation: bounceArrow 1s infinite alternate;"></i>';
            node.appendChild(arrow);
        }

        // Click selection binds
        if (isUnlocked) {
            node.onclick = () => {
                // Remove selected border from other map nodes
                document.querySelectorAll(".map-level-node").forEach(n => {
                    n.style.outline = "none";
                });
                node.style.outline = "2px solid #fff";
                loadLevelPuzzle(levelNum);
            };
        }

        container.appendChild(node);
    }
}

// Center map view on current level node
function scrollCurrentLevelIntoView() {
    const scrollContainer = document.getElementById("puzzle-map-scroll");
    const currentNode = document.querySelector(".map-level-node.current");
    if (scrollContainer && currentNode) {
        const offset = currentNode.offsetTop - scrollContainer.offsetHeight / 2;
        scrollContainer.scrollTo({
            top: Math.max(0, offset),
            behavior: "smooth"
        });
    }
}

// Load selected Puzzle details
function loadLevelPuzzle(levelNum) {
    activeLevelId = levelNum;
    activePuzzle = PUZZLES_DB[levelNum - 1];
    
    // Transition layout views
    document.getElementById("no-active-puzzle").style.display = "none";
    document.getElementById("active-puzzle-card").style.display = "flex";

    // Set engine state
    activeEngine = new Chess(activePuzzle.fen);
    selectedSq = null;
    currentMoveIndex = 0;
    currentAttemptStars = 3;

    // Header updates
    document.getElementById("puzzle-cat-badge").textContent = activePuzzle.category;
    document.getElementById("puzzle-level-title").textContent = `Level ${levelNum}: ${activePuzzle.title}`;
    document.getElementById("puzzle-instruction").textContent = activePuzzle.instruction;

    renderPuzzleStars();
    renderPuzzleBoard();

    const statusText = document.getElementById("puzzle-status");
    const colorLabel = activeEngine.turn() === 'w' ? 'White' : 'Black';
    statusText.style.color = "var(--text)";
    statusText.textContent = `Play the best move for ${colorLabel}!`;
}

// Render active stars rating on card
function renderPuzzleStars() {
    const box = document.getElementById("puzzle-stars-box");
    box.innerHTML = "";
    for (let s = 0; s < 3; s++) {
        const star = document.createElement("i");
        star.className = "fa fa-star";
        star.style.color = s < currentAttemptStars ? "#fbbf24" : "rgba(255,255,255,0.15)";
        box.appendChild(star);
    }
}

// Render puzzle chessboard grid
function renderPuzzleBoard() {
    const wrap = document.getElementById("puzzle-board-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";

    const board = activeEngine.board();
    const isFlipped = (activePuzzle.fen.split(" ")[1] === 'b'); // flip if black to play

    // Get hint highlighting squares
    let hintSquares = [];
    if (document.getElementById("puzzle-board-wrap").dataset.hintActive === "true") {
        const hintMove = activePuzzle.moves[currentMoveIndex];
        if (hintMove) {
            // Standard SAN move conversion to from/to squares is complex;
            // instead we parse legal moves list to match hint SAN moves
            const legalMoves = activeEngine.moves({ verbose: true });
            const matched = legalMoves.find(m => m.san === hintMove || m.san.replace("#","").replace("+","") === hintMove.replace("#","").replace("+",""));
            if (matched) {
                hintSquares = [matched.from, matched.to];
            }
        }
    }

    let hints = [];
    if (selectedSq) {
        hints = activeEngine.moves({ square: selectedSq, verbose: true });
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareName = String.fromCharCode(97 + c) + (8 - r);
            const ri = isFlipped ? 7 - r : r;
            const ci = isFlipped ? 7 - c : c;
            const isDark = (r + c) % 2 === 1;

            const tile = document.createElement("div");
            tile.className = `sq ${isDark ? 'dark' : 'light'}`;
            tile.style.position = "absolute";
            tile.style.width = "12.5%";
            tile.style.height = "12.5%";
            tile.style.top = `${ri * 12.5}%`;
            tile.style.left = `${ci * 12.5}%`;

            // Draw selection layout
            if (selectedSq === squareName) {
                tile.classList.add("selected");
            }

            // Draw hint highlights
            if (hintSquares.includes(squareName)) {
                tile.style.backgroundColor = "rgba(239, 68, 68, 0.45)"; // red flash for hint
            }

            // Draw Piece SVG
            const piece = board[r][c];
            if (piece) {
                const img = document.createElement("img");
                const pieceCode = `${piece.color}${PIECE_NAMES[piece.type]}`;
                img.src = `assets/pieces/${pieceCode}.svg`;
                img.className = "piece-img";
                img.style.width = "100%";
                img.style.height = "100%";
                tile.appendChild(img);
            }

            // Draw move dots hints
            const isHint = hints.some(h => h.to === squareName);
            if (isHint) {
                const hasPiece = board[r][c] !== null;
                const hintDiv = document.createElement("div");
                hintDiv.className = hasPiece ? "hint-ring" : "hint-dot";
                hintDiv.style.left = "50%";
                hintDiv.style.top = "50%";
                hintDiv.style.transform = "translate(-50%, -50%)";
                tile.appendChild(hintDiv);
            }

            // Interactive Click handler
            tile.onclick = () => {
                if (isHint) {
                    executeUserMove(selectedSq, squareName);
                } else {
                    const p = board[r][c];
                    if (p && p.color === activeEngine.turn()) {
                        selectedSq = squareName;
                        // Turn off highlight on click
                        document.getElementById("puzzle-board-wrap").dataset.hintActive = "false";
                        renderPuzzleBoard();
                    }
                }
            };

            wrap.appendChild(tile);
        }
    }
}

// Execute and validate user move attempt
function executeUserMove(fromSq, toSq) {
    const statusText = document.getElementById("puzzle-status");
    
    // Disable active hint highlights
    document.getElementById("puzzle-board-wrap").dataset.hintActive = "false";

    // Play target move in engine
    const move = activeEngine.move({ from: fromSq, to: toSq, promotion: 'q' });
    selectedSq = null;
    renderPuzzleBoard();

    const expectedMove = activePuzzle.moves[currentMoveIndex];
    // Compare moves (cleaning checking or mate symbols like +/#)
    const moveSanClean = move.san.replace("#","").replace("+","");
    const expectedClean = expectedMove.replace("#","").replace("+","");

    if (moveSanClean === expectedClean) {
        // Correct Move!
        currentMoveIndex++;
        if (window.soundEnabled && window.playAudio) window.playAudio("move");

        if (currentMoveIndex === activePuzzle.moves.length) {
            // Puzzle fully completed!
            statusText.style.color = "var(--accent)";
            statusText.innerHTML = `🎉 <strong>Success!</strong> Puzzle Solved (+${currentAttemptStars} Stars)`;
            if (window.soundEnabled && window.playAudio) window.playAudio("capture");
            
            // Save progress
            saveProgress(activeLevelId, currentAttemptStars).then(() => {
                // Refresh map dashboard
                renderMap();
                updateMapHeaderStats();
                
                // Show next puzzle level automatically after brief delay
                setTimeout(() => {
                    if (activeLevelId < 506) {
                        loadLevelPuzzle(activeLevelId + 1);
                        scrollCurrentLevelIntoView();
                    } else {
                        statusText.textContent = "🏆 Masterful! You have completed all 500 levels of Puzzle Quest!";
                    }
                }, 1800);
            });
        } else {
            // Multi-move puzzle step: make opponent reply move automatically
            statusText.style.color = "var(--accent)";
            statusText.textContent = "Correct move! Find the next one…";

            setTimeout(() => {
                const replyMove = activePuzzle.moves[currentMoveIndex];
                activeEngine.move(replyMove);
                currentMoveIndex++;
                renderPuzzleBoard();
                if (window.soundEnabled && window.playAudio) window.playAudio("move");
                statusText.style.color = "var(--text)";
                statusText.textContent = "Opponent moved. What is your next move?";
            }, 1000);
        }
    } else {
        // Wrong Move attempt!
        statusText.style.color = "var(--danger)";
        statusText.textContent = "❌ Incorrect move. Try again!";
        if (window.soundEnabled && window.playAudio) window.playAudio("illegal");

        // Reset positions after delay
        setTimeout(() => {
            resetActivePuzzle();
        }, 1200);
    }
}

// Reset active level puzzle position
function resetActivePuzzle() {
    if (!activePuzzle) return;
    activeEngine = new Chess(activePuzzle.fen);
    selectedSq = null;
    currentMoveIndex = 0;
    document.getElementById("puzzle-board-wrap").dataset.hintActive = "false";
    
    renderPuzzleBoard();

    const statusText = document.getElementById("puzzle-status");
    const colorLabel = activeEngine.turn() === 'w' ? 'White' : 'Black';
    statusText.style.color = "var(--text)";
    statusText.textContent = `Play the best move for ${colorLabel}!`;
}

// Highlight solution starting and destination tiles
function showPuzzleHint() {
    if (!activePuzzle) return;
    
    // Flash squares
    document.getElementById("puzzle-board-wrap").dataset.hintActive = "true";
    renderPuzzleBoard();

    // Deduct star rating penalty
    if (currentAttemptStars > 1) {
        currentAttemptStars--;
        renderPuzzleStars();
    }

    if (window.toast) window.toast("Hint: Solved moves highlighted in RED!");
}
