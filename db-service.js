/* =============================================================
   CHESS — Database Service (db-service.js)
   Modular interface wrapping Cloud Firestore APIs
   ============================================================= */

import { 
    db, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    getDocs
} from "./firebase-init.js";

export const DbService = {
    // Get user profile
    async getUserProfile(uid) {
        if (!uid) return null;
        const docRef = doc(db, "users", uid);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
            return snapshot.data();
        }
        return null;
    },

    // Create user profile
    async createUserProfile(uid, { username, email }) {
        if (!uid) return;
        const profile = {
            userId: uid,
            username: username || email.split("@")[0],
            email: email,
            avatar: "👤",
            joinDate: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            winPercentage: 0,
            highestAIDefeated: "None",
            favoriteOpening: "None", // Future support
            puzzleProgress: 1,       // Highest unlocked puzzle level (starts at 1)
            puzzleStars: {},          // { levelId: starCount } e.g. { 1: 3, 2: 2 }
            learningProgress: 0,
            achievements: [],
            settings: {
                theme: "mono",
                sound: true,
                showLegalMoves: true
            }
        };

        const docRef = doc(db, "users", uid);
        await setDoc(docRef, profile);
        return profile;
    },

    // Update user profile fields
    async updateUserProfile(uid, data) {
        if (!uid) return;
        const docRef = doc(db, "users", uid);
        await setDoc(docRef, data, { merge: true });
    },

    // Register user login timestamp
    async recordLogin(uid) {
        if (!uid) return;
        await this.updateUserProfile(uid, {
            lastLogin: new Date().toISOString()
        });
    },

    // Record game result stats
    async recordGameResult(uid, outcome, opponentName) {
        if (!uid) return;
        const profile = await this.getUserProfile(uid);
        if (!profile) return;

        let wins = profile.wins || 0;
        let losses = profile.losses || 0;
        let draws = profile.draws || 0;

        if (outcome === "win") {
            wins++;
        } else if (outcome === "loss") {
            losses++;
        } else if (outcome === "draw") {
            draws++;
        }

        const gamesPlayed = wins + losses + draws;
        const winPercentage = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

        const updates = {
            gamesPlayed,
            wins,
            losses,
            draws,
            winPercentage
        };

        // Check if defeated AI
        if (outcome === "win" && opponentName && opponentName.startsWith("AI (")) {
            // Extract AI Level: AI (Expert) -> Expert
            const match = opponentName.match(/AI \(([^)]+)\)/);
            if (match && match[1]) {
                const aiLevel = match[1];
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                const currentRank = rankOrder[aiLevel] || 0;
                
                const oldRank = rankOrder[profile.highestAIDefeated] || 0;
                if (currentRank > oldRank) {
                    updates.highestAIDefeated = aiLevel;
                }
            }
        }

        await this.updateUserProfile(uid, updates);
        
        // Auto trigger achievement checks
        await this.checkAchievements(uid, { ...profile, ...updates });
        
        return updates;
    },

    // Update Puzzle Progress
    async incrementPuzzlesSolved(uid) {
        if (!uid) return;
        const profile = await this.getUserProfile(uid);
        if (!profile) return;
        const newCount = (profile.puzzleProgress || 0) + 1;
        await this.updateUserProfile(uid, { puzzleProgress: newCount });
        return newCount;
    },

    // Update Learning Progress
    async incrementLessonsCompleted(uid) {
        if (!uid) return;
        const profile = await this.getUserProfile(uid);
        if (!profile) return;
        const newCount = (profile.learningProgress || 0) + 1;
        await this.updateUserProfile(uid, { learningProgress: newCount });
        return newCount;
    },

    // Achievement checklist evaluator
    async checkAchievements(uid, stats) {
        const activeAchievements = stats.achievements || [];
        const newAchievements = [...activeAchievements];

        const checklist = [
            { id: "first_game", title: "First Steps", desc: "Play your first match", check: (s) => s.gamesPlayed >= 1 },
            { id: "ten_games", title: "Veteran Player", desc: "Play 10 matches", check: (s) => s.gamesPlayed >= 10 },
            { id: "first_win", title: "Victor!", desc: "Win your first chess game", check: (s) => s.wins >= 1 },
            { id: "defeat_easy_ai", title: "AI Apprentice", desc: "Defeat Easy AI", check: (s) => s.highestAIDefeated !== "None" },
            { id: "defeat_expert_ai", title: "Tactical Master", desc: "Defeat Expert AI or above", check: (s) => {
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                return rankOrder[s.highestAIDefeated] >= 4;
            }}
        ];

        let changed = false;
        for (const item of checklist) {
            if (!activeAchievements.includes(item.id) && item.check(stats)) {
                newAchievements.push(item.id);
                changed = true;
                // Toast notification
                setTimeout(() => {
                    if (window.toast) window.toast(`🏆 Achievement Unlocked: ${item.title}!`);
                }, 1000);
            }
        }

        if (changed) {
            await this.updateUserProfile(uid, { achievements: newAchievements });
        }
    },

    // Record a completed match
    async recordMatch(uid, match) {
        if (!uid) return;
        const matchId = "match_" + Math.random().toString(36).substr(2, 9);
        const docRef = doc(db, "matches", matchId);
        
        const record = {
            matchId,
            userId: uid,
            opponent: match.opponent || "Guest",
            opponentType: match.opponentType || "Human",
            aiDifficulty: match.aiDifficulty || null,
            date: new Date().toISOString(),
            duration: match.duration || 0,
            result: match.result || "draw",
            movesCount: match.movesCount || 0,
            pgn: match.pgn || "",
            openingName: this.detectOpening(match.history || []),
            myColor: match.myColor || "w"
        };
        
        if (window.FIREBASE_MOCKED) {
            const matches = JSON.parse(localStorage.getItem("mock_matches") || "[]");
            matches.push(record);
            localStorage.setItem("mock_matches", JSON.stringify(matches));
        } else {
            await setDoc(docRef, record);
        }
        return record;
    },

    // Fetch user matches history
    async getUserMatches(uid) {
        if (!uid) return [];
        if (window.FIREBASE_MOCKED) {
            const matches = JSON.parse(localStorage.getItem("mock_matches") || "[]");
            return matches
                .filter(m => m.userId === uid)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            try {
                const matchesCol = collection(db, "matches");
                const q = query(matchesCol, where("userId", "==", uid), orderBy("date", "desc"));
                const snapshot = await getDocs(q);
                const list = [];
                snapshot.forEach(doc => {
                    list.push(doc.data());
                });
                return list;
            } catch (err) {
                console.error("Failed to fetch user matches:", err);
                return [];
            }
        }
    },

    // Detect opening name based on first 4 moves
    detectOpening(moves) {
        if (!moves || moves.length === 0) return "Unknown Opening";
        const line = moves.slice(0, 4).join(" ");
        
        if (line.startsWith("e4 c5")) return "Sicilian Defense";
        if (line.startsWith("e4 e5")) {
            if (line.startsWith("e4 e5 Nf3 Nc6 Bb5")) return "Ruy Lopez";
            if (line.startsWith("e4 e5 Nf3 Nc6 Bc4")) return "Italian Game";
            if (line.startsWith("e4 e5 Nf3 Nf6")) return "Petrov's Defense";
            return "Open Game";
        }
        if (line.startsWith("e4 e6")) return "French Defense";
        if (line.startsWith("e4 c6")) return "Caro-Kann Defense";
        if (line.startsWith("d4 d5")) {
            if (line.startsWith("d4 d5 c4")) return "Queen's Gambit";
            if (line.startsWith("d4 d5 Nf3")) return "Queen's Pawn Game";
            return "Closed Game";
        }
        if (line.startsWith("d4 Nf6")) {
            if (line.startsWith("d4 Nf6 c4 e6 Nf3 b6")) return "Queen's Indian Defense";
            if (line.startsWith("d4 Nf6 c4 g6")) return "King's Indian Defense";
            return "Indian Defense";
        }
        if (line.startsWith("Nf3")) return "Réti Opening";
        if (line.startsWith("f4")) return "Bird's Opening";
        if (line.startsWith("c4")) return "English Opening";
        if (line.startsWith("g3")) return "King's Fianchetto";
        
        const firstMove = moves[0];
        if (firstMove === "e4") return "King's Pawn Game";
        if (firstMove === "d4") return "Queen's Pawn Game";
        if (firstMove === "Nf3") return "Réti Opening";
        if (firstMove === "c4") return "English Opening";
        
        return "Custom Opening";
    }
};

// Also export direct functions for user registration script
export const createUserProfile = DbService.createUserProfile;
