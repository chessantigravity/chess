/* =============================================================
   ANTIGRAVITY CHESS — Chess Academy Engine (learn-academy.js)
   Manages personalized learning paths, interactive tutorials,
   theory descriptions, auto-played demos, practice challenges, and quizzes.
   ============================================================= */

import { DbService } from "./db-service.js";
import { AuthService } from "./auth-service.js";

// Full syllabus dictionary containing theory, moves, practices, and quiz challenges
const FULL_SYLLABUS = [
    {
        id: "board",
        title: "The Board Setup",
        subtitle: "Learn the 64 squares grid configuration",
        explain: `Chess is played on an 8x8 grid of 64 alternating light and dark squares.<br><br>
        <strong>Key Rules:</strong><br>
        • The bottom-right square must always be a light square ("white on right").<br>
        • Rows are called <strong>files</strong> (labeled a-h from left to right).<br>
        • Columns are called <strong>ranks</strong> (numbered 1-8 from bottom to top).`,
        demoSetup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        demoMoves: [],
        practiceSetup: "8/8/8/8/8/8/8/8 w - - 0 1",
        practiceTask: "Click any light square to verify you understand the board coordinates.",
        validatePractice: (move, boardInstance, clickedSq) => {
            // Clicked square check (light squares are where rank+file sum is odd: e.g. a1: 0+0=0 dark, b1: 1+0=1 light)
            if (!clickedSq) return false;
            const file = clickedSq.charCodeAt(0) - 97;
            const rank = parseInt(clickedSq.charAt(1)) - 1;
            return (file + rank) % 2 === 1;
        },
        quizQuestion: "Which of the following squares is a LIGHT square?",
        quizChoices: ["a1", "h1", "d4"],
        quizAnswer: 1, // h1
        quizExplanation: "h1 is at the bottom right corner, which is always light. a1 is dark."
    },
    {
        id: "pieces",
        title: "Chess Pieces",
        subtitle: "Meet the soldiers of the chessboard",
        explain: `Each player starts the game with 16 pieces:<br><br>
        • <strong>1 King</strong>: The most valuable piece. If trapped, you lose.<br>
        • <strong>1 Queen</strong>: The most powerful piece.<br>
        • <strong>2 Rooks</strong>: Active castle-like towers.<br>
        • <strong>2 Bishops</strong>: Long-range diagonal sliders.<br>
        • <strong>2 Knights</strong>: Tricky horse pieces that jump.<br>
        • <strong>8 Pawns</strong>: Your front-line infantry.`,
        demoSetup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        demoMoves: [],
        practiceSetup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        practiceTask: "Locate and click the White Queen (d1 square) to select her.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return clickedSq === "d1";
        },
        quizQuestion: "Which piece is the most powerful in terms of movement?",
        quizChoices: ["King", "Knight", "Queen"],
        quizAnswer: 2, // Queen
        quizExplanation: "The Queen can move any number of squares horizontally, vertically, or diagonally."
    },
    {
        id: "movement",
        title: "Piece Movement",
        subtitle: "How the chess army moves around",
        explain: `Different pieces have distinct movement paths:<br><br>
        • <strong>Rooks</strong> move in straight lines along files or ranks.<br>
        • <strong>Bishops</strong> move diagonally.<br>
        • <strong>Queens</strong> combine both movements.<br>
        • <strong>Knights</strong> move in an 'L' shape (2 squares in one direction, 1 square perpendicular) and can jump over obstacles.<br>
        • <strong>Kings</strong> move exactly 1 square in any direction.`,
        demoSetup: "8/8/8/8/8/6n1/8/8 w - - 0 1",
        demoMoves: [],
        practiceSetup: "8/8/8/8/8/6N1/8/8 w - - 0 1", // Knight on g3
        practiceTask: "Move your Knight on g3 to the e4 square.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "g3" && move.to === "e4";
        },
        quizQuestion: "Which of the following pieces CANNOT move backwards?",
        quizChoices: ["Knight", "Pawn", "Bishop"],
        quizAnswer: 1, // Pawn
        quizExplanation: "Pawns can only move forward. All other pieces can move backward."
    },
    {
        id: "capturing",
        title: "Capturing Pieces",
        subtitle: "Eliminating enemy forces",
        explain: `You capture an opponent's piece by moving your piece onto its square. The captured piece is removed from the board.<br><br>
        Unlike checkers, you do not jump over pieces to capture them (except for Knights, which jump to land on the target square).`,
        demoSetup: "8/8/8/8/3b4/3Q4/8/8 w - - 0 1", // Queen on d3, Bishop on d4
        demoMoves: ["Qxd4"],
        practiceSetup: "8/8/8/8/3b4/3Q4/8/8 w - - 0 1",
        practiceTask: "Capture the unprotected Black Bishop on d4 with your Queen.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "d3" && move.to === "d4";
        },
        quizQuestion: "What happens when you capture an opponent's piece?",
        quizChoices: [
            "Your piece jumps over it.",
            "Your piece takes its square, and the enemy piece is removed.",
            "You place your piece next to it."
        ],
        quizAnswer: 1,
        quizExplanation: "Capturing involves moving onto the enemy piece's square and removing it."
    },
    {
        id: "check",
        title: "Check!",
        subtitle: "King under direct fire",
        explain: `A King is in <strong>check</strong> when it is threatened with capture by an opponent's piece.<br><br>
        <strong>Escaping Check:</strong><br>
        1. <strong>Capture</strong> the attacking piece.<br>
        2. <strong>Block</strong> the check (place a piece between the attacker and the King).<br>
        3. <strong>Move</strong> the King to a safe square.`,
        demoSetup: "4k3/8/8/8/8/8/8/4K2r w - - 0 1", // King on e1, Black Rook checks on h1
        demoMoves: ["Kf2"],
        practiceSetup: "4k3/8/8/8/8/8/8/4K2r w - - 0 1",
        practiceTask: "Your King on e1 is in check from the Rook on h1. Move the King to the safe f2 square.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e1" && move.to === "f2";
        },
        quizQuestion: "Which of the following is NOT a legal way to escape check?",
        quizChoices: [
            "Capturing the attacking piece.",
            "Castling your king.",
            "Moving the king to a safe square."
        ],
        quizAnswer: 1, // Castling
        quizExplanation: "You are not allowed to castle when your king is currently in check."
    },
    {
        id: "checkmate",
        title: "Checkmate",
        subtitle: "Winning the chess match",
        explain: `Checkmate occurs when the King is in check and has no legal moves to escape. This immediately ends the game, and the checking player wins.<br><br>
        Delivering checkmate is the ultimate goal in chess.`,
        demoSetup: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", // Scholars mate prep
        demoMoves: ["Qxf7#"],
        practiceSetup: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        practiceTask: "Move your White Queen on f3 to f7 to deliver Scholar's Checkmate!",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "f3" && move.to === "f7";
        },
        quizQuestion: "What happens when a player is checkmated?",
        quizChoices: [
            "They lose the game.",
            "They get another turn.",
            "The game is a draw."
        ],
        quizAnswer: 0,
        quizExplanation: "Checkmate immediately ends the game; the player who delivers checkmate wins."
    },
    {
        id: "stalemate",
        title: "Stalemate",
        subtitle: "The tragic corner draw",
        explain: `Stalemate is a draw where the player whose turn it is has <strong>no legal moves</strong>, but their King is <strong>not</strong> in check.<br><br>
        If you are winning with a huge material advantage, beware of accidentally trapping the opponent's King without checking it!`,
        demoSetup: "k7/8/1Q6/8/8/8/8/4K3 w - - 0 1", // Stalemate board
        demoMoves: [],
        practiceSetup: "k7/8/1Q6/8/8/8/8/4K3 w - - 0 1",
        practiceTask: "Inspect the board. Black King has no legal moves and is not in check. Click Next Step to confirm stalemate.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return true; // Auto-pass on click
        },
        quizQuestion: "Is stalemate considered a win for the player with more pieces?",
        quizChoices: ["Yes, they win.", "No, it is a draw.", "No, they lose."],
        quizAnswer: 1,
        quizExplanation: "Stalemate is a draw (0.5 points each), regardless of how much material advantage either side holds."
    },
    {
        id: "castling",
        title: "Castling",
        subtitle: "Protecting the King",
        explain: `Castling is a special move that moves the King two squares sideways toward a Rook, and the Rook jumps over the King.<br><br>
        <strong>Castling Conditions:</strong><br>
        • Neither King nor Rook has moved.<br>
        • Squares between them are empty.<br>
        • King is not in check, and does not pass through or land on a square attacked by an enemy piece.`,
        demoSetup: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        demoMoves: ["O-O"], // white kingside castle
        practiceSetup: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        practiceTask: "Perform Kingside Castling. Move your King on e1 to g1.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e1" && (move.to === "g1" || move.san === "O-O");
        },
        quizQuestion: "When are you allowed to castle?",
        quizChoices: [
            "Even if the Rook has already moved.",
            "Only if the King has not moved and is not in check.",
            "When the squares between King and Rook are blocked."
        ],
        quizAnswer: 1,
        quizExplanation: "The King cannot have moved, cannot castle out of check, and the path must be clear."
    },
    {
        id: "enpassant",
        title: "En Passant",
        subtitle: "The special pawn capture",
        explain: `If an opponent's Pawn moves 2 squares forward and lands directly adjacent to your Pawn, you can capture it diagonally as if it only moved 1 square.<br><br>
        <strong>CRITICAL Rule:</strong> You must make this capture on your <strong>very next turn</strong>, or the option is lost.`,
        demoSetup: "8/8/8/3pP3/8/8/8/4K3 w - d6 0 1", // white pawn e5, black pawn d5 just moved
        demoMoves: ["exd6"],
        practiceSetup: "8/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
        practiceTask: "Execute En Passant! Capture the d5 Pawn by moving your e5 Pawn to d6.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e5" && move.to === "d6";
        },
        quizQuestion: "On which move can you make an en passant capture?",
        quizChoices: [
            "Any time later in the game.",
            "Only on the turn immediately after the pawn moved 2 squares.",
            "Only when checking the king."
        ],
        quizAnswer: 1,
        quizExplanation: "En passant must be executed immediately on the move following the two-square pawn advance."
    },
    {
        id: "promotion",
        title: "Pawn Promotion",
        subtitle: "Upgrading your soldiers",
        explain: `When a Pawn reaches the 8th rank (furthest side from where it started), it must immediately promote into one of these pieces:<br><br>
        • <strong>Queen</strong>, <strong>Rook</strong>, <strong>Bishop</strong>, or <strong>Knight</strong>.<br><br>
        It cannot remain a pawn and cannot become a King. You can have multiple Queens on the board!`,
        demoSetup: "8/P7/8/8/8/8/8/4K3 w - - 0 1",
        demoMoves: ["a8=Q"],
        practiceSetup: "8/P7/8/8/8/8/8/4K3 w - - 0 1",
        practiceTask: "Advance your pawn on a7 to a8 to promote it to a Queen.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "a7" && move.to === "a8";
        },
        quizQuestion: "Which piece CANNOT be chosen for pawn promotion?",
        quizChoices: ["Knight", "Queen", "King"],
        quizAnswer: 2, // King
        quizExplanation: "A pawn can promote to a Queen, Rook, Bishop, or Knight, but never a King or another Pawn."
    },
    {
        id: "openings",
        title: "Opening Principles",
        subtitle: "How to start a game",
        explain: `The first phase of the game is the <strong>Opening</strong>.<br><br>
        <strong>Three Core Principles:</strong><br>
        1. <strong>Control the Center</strong> (d4, d5, e4, e5 squares).<br>
        2. <strong>Activate Pieces</strong> (develop Knights and Bishops).<br>
        3. <strong>King Safety</strong> (castle early).`,
        demoSetup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        demoMoves: ["e4", "e5", "Nf3", "Nc6"],
        practiceSetup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        practiceTask: "Play the classic opening move: Move your e-pawn from e2 to e4.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e2" && move.to === "e4";
        },
        quizQuestion: "What is the primary objective of the opening phase?",
        quizChoices: [
            "Delivering fast checkmates immediately.",
            "Controlling the center and developing minor pieces.",
            "Moving the Rook onto the center file."
        ],
        quizAnswer: 1,
        quizExplanation: "Controlling central space and activating pieces sets up a solid foundation for middlegame tactics."
    },
    {
        id: "tactics",
        title: "Tactical Weapons",
        subtitle: "Forks, pins, and skewers",
        explain: `Tactics are short move sequences that gain material or deliver checkmate.<br><br>
        • <strong>Fork</strong>: One piece attacks two or more enemy targets at once.<br>
        • <strong>Pin</strong>: An attacked piece cannot move because it would expose a more valuable piece behind it.<br>
        • <strong>Skewer</strong>: A valuable piece is attacked, forcing it to move and exposing a lesser piece behind it.`,
        demoSetup: "4k3/8/5q2/4n3/8/8/8/4K3 b - - 0 1", // Black knight forks king and queen
        demoMoves: [],
        practiceSetup: "4k3/8/8/4N3/8/3q4/8/4K3 w - - 0 1", // White knight e5, black queen d3
        practiceTask: "Attack both King and Queen: Move your Knight from e5 to f7 to deliver a fork!",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e5" && move.to === "f7";
        },
        quizQuestion: "What is a pin in chess?",
        quizChoices: [
            "A piece attacks two targets at once.",
            "An attacked piece is restricted from moving because a more valuable piece lies behind it.",
            "Fleshing out checkmate with a Rook."
        ],
        quizAnswer: 1,
        quizExplanation: "Pins restrict mobility because moving the pinned piece would lose a higher-value target."
    },
    {
        id: "strategy",
        title: "Strategic Planning",
        subtitle: "Long-term goals",
        explain: `Strategy involves long-term planning:<br><br>
        • <strong>Pawn Structure</strong>: Avoid isolated pawns.<br>
        • <strong>Open Files</strong>: Place Rooks on lines with no pawns to control files.<br>
        • <strong>Outposts</strong>: Place Knights on active central squares protected by pawns where they cannot be driven away.`,
        demoSetup: "8/8/8/8/8/8/8/3R2K1 w - - 0 1", // rook on d1
        demoMoves: ["Rd7"],
        practiceSetup: "8/8/8/8/8/8/8/3R2K1 w - - 0 1",
        practiceTask: "Secure control of the open d-file: Move your Rook from d1 to d7.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "d1" && move.to === "d7";
        },
        quizQuestion: "What is an outpost in chess strategy?",
        quizChoices: [
            "A square on the 8th rank.",
            "A central square protected by a pawn, ideal for a Knight.",
            "A pawn structure that blocks the king."
        ],
        quizAnswer: 1,
        quizExplanation: "Outposts allow minor pieces (especially Knights) to exert strong center control without fear of pawn attacks."
    },
    {
        id: "endgames",
        title: "Endgame Mastery",
        subtitle: "Converting advantage to victory",
        explain: `With few pieces left, the board enters the <strong>Endgame</strong>.<br><br>
        <strong>Key Principles:</strong><br>
        • <strong>King Activity</strong>: The King is no longer a liability; it must actively attack and support pawns.<br>
        • <strong>Pawn Promotion</strong>: Escort your passed pawns to promote them into Queens.`,
        demoSetup: "8/8/5k2/4P3/8/8/8/4K3 b - - 0 1",
        demoMoves: ["Kxe5"],
        practiceSetup: "8/8/4k3/4K3/8/8/8/8 w - - 0 1", // King on e5
        practiceTask: "Activate your King in the endgame. Move your King from e5 to f6.",
        validatePractice: (move, boardInstance, clickedSq) => {
            return move && move.from === "e5" && move.to === "f6";
        },
        quizQuestion: "What changes regarding the King's role in the endgame?",
        quizChoices: [
            "It must stay safely castled in the corner.",
            "It becomes an active piece to help control squares and push pawns.",
            "It cannot move at all."
        ],
        quizAnswer: 1,
        quizExplanation: "With fewer pieces, the threat of checkmate decreases, allowing the King to become a powerful helper."
    }
];

// Current State
let currentUser = null;
let currentPath = []; // Array of lesson objects
let activeLessonIndex = 0;
let currentStep = "explain"; // "explain", "demo", "practice", "quiz"
let activeLessonEngine = null; // chess.js instance for the lesson board
let selectedPracticeSq = null;
let completedLessonsList = [];

// Init Chess Academy Entry Point
export function initLearnAcademy(user, isGuest) {
    currentUser = user;

    // Display appropriate screen
    document.getElementById("lobby").style.display = "none";
    document.getElementById("game").style.display = "none";
    document.getElementById("learn-academy").style.display = "block";

    // Bind Home/Back Button
    document.getElementById("btn-learn-home").onclick = () => {
        document.getElementById("learn-academy").style.display = "none";
        document.getElementById("lobby").style.display = "block";
        // Refresh Lobby Profile dashboard
        if (window.authUIUpdate) window.authUIUpdate(currentUser, isGuest);
    };

    // Bind Reset Path Button
    document.getElementById("btn-learn-reset").onclick = async () => {
        if (isGuest) {
            if (!confirm("Are you sure you want to reset your guest learning progress?")) return;
            completedLessonsList = [];
            activeLessonIndex = 0;
            loadActiveLesson();
            renderSyllabusList();
            updateProgressBar();
            if (window.toast) window.toast("Guest progress reset.");
            return;
        }

        if (!confirm("Are you sure you want to reset your learning path and progress?")) return;
        
        completedLessonsList = [];
        
        if (currentUser) {
            await DbService.updateUserProfile(currentUser.uid, {
                learningLevel: null,
                completedLessons: [],
                learningProgress: 0
            });
        }
        
        showOnboardingModal();
    };

    // Bind Tab Click Handlers
    document.querySelectorAll(".learn-tabs-bar .tab-btn").forEach(btn => {
        btn.onclick = () => {
            const step = btn.getAttribute("data-step");
            showStep(step);
        };
    });

    // Load user path
    if (isGuest) {
        // Guests start with a complete path default without onboarding modal
        currentPath = [...FULL_SYLLABUS];
        completedLessonsList = [];
        activeLessonIndex = 0;
        loadActiveLesson();
        renderSyllabusList();
        updateProgressBar();
    } else {
        // Fetch real user database progress
        DbService.getUserProfile(user.uid).then(profile => {
            if (!profile) return;
            
            completedLessonsList = profile.completedLessons || [];
            
            if (!profile.learningLevel) {
                // Onboarding modal needed
                showOnboardingModal();
            } else {
                generatePath(profile.learningLevel);
                // Set index to first uncompleted lesson in their path
                activeLessonIndex = 0;
                for (let i = 0; i < currentPath.length; i++) {
                    if (!completedLessonsList.includes(currentPath[i].id)) {
                        activeLessonIndex = i;
                        break;
                    }
                }
                if (activeLessonIndex >= currentPath.length) {
                    activeLessonIndex = currentPath.length - 1; // Load last if finished
                }
                loadActiveLesson();
                renderSyllabusList();
                updateProgressBar();
            }
        });
    }
}

// Show Onboarding Modal
function showOnboardingModal() {
    const overlay = document.getElementById("learn-onboarding-overlay");
    overlay.style.display = "flex";

    document.querySelectorAll(".path-choice-btn").forEach(btn => {
        btn.onclick = async () => {
            const level = btn.getAttribute("data-level");
            overlay.style.display = "none";

            if (currentUser) {
                await DbService.updateUserProfile(currentUser.uid, { learningLevel: level });
            }

            generatePath(level);
            activeLessonIndex = 0;
            loadActiveLesson();
            renderSyllabusList();
            updateProgressBar();
        };
    });
}

// Generate Personalized Path list based on questionnaire level
function generatePath(level) {
    if (level === "new") {
        currentPath = [...FULL_SYLLABUS];
    } else if (level === "basics") {
        // Skip board, pieces, movements, capturing
        currentPath = FULL_SYLLABUS.slice(4);
    } else if (level === "intermediate") {
        // Skip basic rules, start with openings
        currentPath = FULL_SYLLABUS.slice(10);
    } else if (level === "advanced") {
        // Skip to tactics, strategy, endgames
        currentPath = FULL_SYLLABUS.slice(11);
    } else {
        currentPath = [...FULL_SYLLABUS];
    }
}

// Update Syllabus Sidebar
function renderSyllabusList() {
    const list = document.getElementById("learn-syllabus-list");
    if (!list) return;
    list.innerHTML = "";

    currentPath.forEach((lesson, index) => {
        const isCurrent = index === activeLessonIndex;
        const isCompleted = completedLessonsList.includes(lesson.id);

        const btn = document.createElement("button");
        btn.className = `syllabus-item-btn ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`;
        
        let statusIcon = "🔒";
        if (isCompleted) statusIcon = "✅";
        else if (isCurrent) statusIcon = "📖";

        btn.innerHTML = `
            <div style="text-align:left;">
                <div style="font-weight:700; font-size:0.85rem; color:${isCurrent ? 'var(--accent)' : 'var(--text)'};">${lesson.title}</div>
                <div style="font-size:0.7rem; color:var(--text2); margin-top:0.15rem;">Lesson ${index + 1}</div>
            </div>
            <span style="font-size:0.9rem;">${statusIcon}</span>
        `;

        btn.onclick = () => {
            activeLessonIndex = index;
            loadActiveLesson();
            renderSyllabusList();
        };

        list.appendChild(btn);
    });
}

// Load current lesson details
function loadActiveLesson() {
    const lesson = currentPath[activeLessonIndex];
    if (!lesson) return;

    // Header updates
    document.getElementById("lesson-badge").textContent = `Lesson ${activeLessonIndex + 1}`;
    document.getElementById("lesson-title").textContent = lesson.title;
    document.getElementById("lesson-subtitle").textContent = lesson.subtitle;

    // Reset view steps
    showStep("explain");

    // Bind footer controllers
    document.getElementById("btn-learn-prev").disabled = activeLessonIndex === 0;
    document.getElementById("btn-learn-prev").onclick = () => {
        if (activeLessonIndex > 0) {
            activeLessonIndex--;
            loadActiveLesson();
            renderSyllabusList();
        }
    };

    // Bind next step/lesson controller
    updateNextButtonState();
}

function updateNextButtonState() {
    const btn = document.getElementById("btn-learn-next");
    
    if (currentStep === "explain") {
        btn.innerHTML = 'Demonstration <i class="fa fa-arrow-right"></i>';
        btn.onclick = () => showStep("demo");
    } else if (currentStep === "demo") {
        btn.innerHTML = 'Practice Mode <i class="fa fa-arrow-right"></i>';
        btn.onclick = () => showStep("practice");
    } else if (currentStep === "practice") {
        btn.innerHTML = 'Take Quiz <i class="fa fa-arrow-right"></i>';
        btn.onclick = () => showStep("quiz");
    } else if (currentStep === "quiz") {
        const isLastLesson = activeLessonIndex === currentPath.length - 1;
        btn.innerHTML = isLastLesson ? 'Finish Academy <i class="fa fa-check-double"></i>' : 'Next Lesson <i class="fa fa-arrow-right"></i>';
        btn.onclick = () => finishActiveLesson();
    }
}

// Load step views
function showStep(step) {
    currentStep = step;
    
    // Toggle active tab buttons
    document.querySelectorAll(".learn-tabs-bar .tab-btn").forEach(btn => {
        if (btn.getAttribute("data-step") === step) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("selected");
            btn.classList.remove("active");
        }
    });

    // Hide all step panels
    document.getElementById("learn-pane-explain").style.display = "none";
    document.getElementById("learn-pane-demo").style.display = "none";
    document.getElementById("learn-pane-practice").style.display = "none";
    document.getElementById("learn-pane-quiz").style.display = "none";

    const lesson = currentPath[activeLessonIndex];

    if (step === "explain") {
        const pane = document.getElementById("learn-pane-explain");
        pane.style.display = "block";
        pane.innerHTML = `
            <div style="font-size:0.95rem; line-height:1.6; text-align:left; color:var(--text);">
                ${lesson.explain}
            </div>
        `;
    } else if (step === "demo") {
        const pane = document.getElementById("learn-pane-demo");
        pane.style.display = "block";
        pane.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem;">
                <div id="demo-board-wrap" style="width:280px; aspect-ratio:1; background:var(--bg); border:2px solid var(--card-border); border-radius:8px; position:relative; overflow:hidden;"></div>
                <div style="display:flex; gap:0.5rem; width:280px;">
                    <button class="btn btn-secondary" id="btn-demo-play" style="flex:1;"><i class="fa fa-play"></i> Auto Play</button>
                    <button class="btn btn-secondary" id="btn-demo-reset" style="flex:1;"><i class="fa fa-undo"></i> Reset</button>
                </div>
            </div>
        `;

        // Initialize board
        activeLessonEngine = new Chess(lesson.demoSetup);
        renderStepBoard("demo-board-wrap", false);

        // Auto play moves handler
        let demoInterval = null;
        let moveIdx = 0;

        const runDemo = () => {
            if (moveIdx >= lesson.demoMoves.length) {
                clearInterval(demoInterval);
                document.getElementById("btn-demo-play").innerHTML = '<i class="fa fa-redo"></i> Replay';
                return;
            }
            activeLessonEngine.move(lesson.demoMoves[moveIdx]);
            renderStepBoard("demo-board-wrap", false);
            moveIdx++;
        };

        document.getElementById("btn-demo-play").onclick = () => {
            clearInterval(demoInterval);
            if (moveIdx >= lesson.demoMoves.length) {
                activeLessonEngine = new Chess(lesson.demoSetup);
                renderStepBoard("demo-board-wrap", false);
                moveIdx = 0;
            }
            document.getElementById("btn-demo-play").innerHTML = '<i class="fa fa-spinner fa-spin"></i> Playing…';
            demoInterval = setInterval(runDemo, 1200);
        };

        document.getElementById("btn-demo-reset").onclick = () => {
            clearInterval(demoInterval);
            activeLessonEngine = new Chess(lesson.demoSetup);
            renderStepBoard("demo-board-wrap", false);
            moveIdx = 0;
            document.getElementById("btn-demo-play").innerHTML = '<i class="fa fa-play"></i> Auto Play';
        };

    } else if (step === "practice") {
        const pane = document.getElementById("learn-pane-practice");
        pane.style.display = "block";
        pane.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem;">
                <div style="padding:0.6rem 0.85rem; background:rgba(255,255,255,0.03); border:1px solid var(--card-border); border-radius:8px; width:100%; text-align:left; font-size:0.85rem; font-weight:700;">
                    🎯 <span style="color:var(--accent);">Task:</span> ${lesson.practiceTask}
                </div>
                <div id="practice-board-wrap" style="width:280px; aspect-ratio:1; background:var(--bg); border:2px solid var(--card-border); border-radius:8px; position:relative; overflow:hidden;"></div>
                <div id="practice-status" style="font-weight:700; font-size:0.85rem; height:20px;"></div>
            </div>
        `;

        // Initialize board
        activeLessonEngine = new Chess(lesson.practiceSetup);
        selectedPracticeSq = null;
        renderStepBoard("practice-board-wrap", true);

    } else if (step === "quiz") {
        const pane = document.getElementById("learn-pane-quiz");
        pane.style.display = "block";
        
        let choicesHtml = "";
        lesson.quizChoices.forEach((choice, idx) => {
            choicesHtml += `
                <button class="quiz-choice-btn" data-idx="${idx}">${choice}</button>
            `;
        });

        pane.innerHTML = `
            <div style="text-align:left; display:flex; flex-direction:column; gap:1rem; max-width:480px; margin:0 auto;">
                <h3 style="font-size:1.15rem; font-weight:800; line-height:1.4;">${lesson.quizQuestion}</h3>
                <div style="display:flex; flex-direction:column; gap:0.6rem;">
                    ${choicesHtml}
                </div>
                <div id="quiz-explanation" style="font-size:0.85rem; font-weight:500; line-height:1.5; padding:0.75rem; border-radius:8px; display:none;"></div>
            </div>
        `;

        // Bind quiz choices
        document.querySelectorAll(".quiz-choice-btn").forEach(btn => {
            btn.onclick = () => {
                const selectedIdx = parseInt(btn.getAttribute("data-idx"));
                const expDiv = document.getElementById("quiz-explanation");
                
                // Disable all choices
                document.querySelectorAll(".quiz-choice-btn").forEach(b => b.disabled = true);

                if (selectedIdx === lesson.quizAnswer) {
                    btn.classList.add("correct");
                    expDiv.style.background = "rgba(34, 197, 94, 0.08)";
                    expDiv.style.border = "1px solid rgba(34, 197, 94, 0.2)";
                    expDiv.style.color = "#22c55e";
                    expDiv.innerHTML = `🎉 <strong>Correct!</strong> ${lesson.quizExplanation}`;
                    // Trigger sound
                    if (window.soundEnabled && window.playAudio) window.playAudio("capture");
                } else {
                    btn.classList.add("wrong");
                    // Highlight correct one too
                    document.querySelector(`.quiz-choice-btn[data-idx="${lesson.quizAnswer}"]`).classList.add("correct");
                    expDiv.style.background = "rgba(239, 68, 68, 0.08)";
                    expDiv.style.border = "1px solid rgba(239, 68, 68, 0.2)";
                    expDiv.style.color = "#ef4444";
                    expDiv.innerHTML = `❌ <strong>Not quite.</strong> ${lesson.quizExplanation}`;
                    if (window.soundEnabled && window.playAudio) window.playAudio("illegal");
                }
                expDiv.style.display = "block";
            };
        });
    }

    updateNextButtonState();
}

// Render Board grid helper
function renderStepBoard(containerId, isInteractive) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = "";

    const board = activeLessonEngine.board();
    const lesson = currentPath[activeLessonIndex];

    // Highlight helper: legal move suggestions
    let hints = [];
    if (isInteractive && selectedPracticeSq) {
        hints = activeLessonEngine.moves({ square: selectedPracticeSq, verbose: true });
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareName = String.fromCharCode(97 + c) + (8 - r);
            const isDark = (r + c) % 2 === 1;

            const tile = document.createElement("div");
            tile.className = `sq ${isDark ? 'dark' : 'light'}`;
            tile.style.position = "absolute";
            tile.style.width = "12.5%";
            tile.style.height = "12.5%";
            tile.style.top = `${r * 12.5}%`;
            tile.style.left = `${c * 12.5}%`;

            // Draw selection outline
            if (isInteractive && selectedPracticeSq === squareName) {
                tile.classList.add("selected");
            }

            // Draw Piece Image if present
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

            // Draw hint dots for legal destinations
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

            // Click Handler
            if (isInteractive) {
                tile.onclick = () => {
                    const statusText = document.getElementById("practice-status");
                    
                    if (isHint) {
                        // Make move
                        const move = activeLessonEngine.move({ from: selectedPracticeSq, to: squareName, promotion: 'q' });
                        selectedPracticeSq = null;
                        renderStepBoard(containerId, isInteractive);

                        // Validate challenge move
                        const isCorrect = lesson.validatePractice(move, activeLessonEngine, squareName);
                        if (isCorrect) {
                            statusText.style.color = "var(--accent)";
                            statusText.innerHTML = '<i class="fa fa-check-circle"></i> Correct! Ready to take the Quiz.';
                            if (window.soundEnabled && window.playAudio) window.playAudio("move");
                            
                            // Enable next step automatically
                            document.getElementById("btn-learn-next").disabled = false;
                        } else {
                            statusText.style.color = "var(--danger)";
                            statusText.innerHTML = '❌ Incorrect move. Resetting board...';
                            if (window.soundEnabled && window.playAudio) window.playAudio("illegal");

                            // Auto reset board on failure after delay
                            setTimeout(() => {
                                activeLessonEngine = new Chess(lesson.practiceSetup);
                                selectedPracticeSq = null;
                                renderStepBoard(containerId, isInteractive);
                                statusText.textContent = "";
                            }, 1500);
                        }
                    } else {
                        // Click selection check
                        const p = board[r][c];
                        if (p && p.color === activeLessonEngine.turn()) {
                            selectedPracticeSq = squareName;
                            renderStepBoard(containerId, isInteractive);
                        } else {
                            // Verify clicking board tasks (e.g. click square coordinate check for Board lesson)
                            const isCorrect = lesson.validatePractice(null, activeLessonEngine, squareName);
                            if (isCorrect) {
                                statusText.style.color = "var(--accent)";
                                statusText.innerHTML = '<i class="fa fa-check-circle"></i> Correct! Let\'s proceed.';
                                if (window.soundEnabled && window.playAudio) window.playAudio("move");
                            } else {
                                statusText.style.color = "var(--danger)";
                                statusText.innerHTML = '❌ Try again.';
                                if (window.soundEnabled && window.playAudio) window.playAudio("illegal");
                            }
                        }
                    }
                };
            }

            wrap.appendChild(tile);
        }
    }
}

// Complete lesson and increment progress
async function finishActiveLesson() {
    const lesson = currentPath[activeLessonIndex];
    
    if (!completedLessonsList.includes(lesson.id)) {
        completedLessonsList.push(lesson.id);
        
        if (currentUser) {
            // Save lesson completion list to Firestore
            await DbService.updateUserProfile(currentUser.uid, { completedLessons: completedLessonsList });
            // Increment progress counter count
            await DbService.incrementLearningProgress(currentUser.uid);
        }
    }

    const isLastLesson = activeLessonIndex === currentPath.length - 1;
    if (isLastLesson) {
        if (window.toast) window.toast("🎉 Congratulations! You have completed the Chess Academy!");
        document.getElementById("btn-learn-home").click(); // go home
    } else {
        // Load next lesson
        activeLessonIndex++;
        loadActiveLesson();
        renderSyllabusList();
        updateProgressBar();
    }
}

// Progress Bar pct calculation
function updateProgressBar() {
    if (currentPath.length === 0) return;
    
    // Count how many lessons in their path are completed
    let completedInPath = 0;
    currentPath.forEach(l => {
        if (completedLessonsList.includes(l.id)) completedInPath++;
    });

    const pct = Math.round((completedInPath / currentPath.length) * 100);
    document.getElementById("learn-progress-pct").textContent = `${pct}%`;
    document.getElementById("learn-progress-bar").style.width = `${pct}%`;
}

// Piece symbols mapping matching Wikimedia SVG names
const PIECE_NAMES = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
