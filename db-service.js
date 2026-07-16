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
    getDocs,
    addDoc,
    deleteDoc,
    onSnapshot
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
            rating: 1200,            // ELO rating (starts at 1200)
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
    async recordGameResult(uid, outcome, opponentName, opponentRating = null) {
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

        let rating = profile.rating || 1200;
        if (opponentRating !== null) {
            const K = 32;
            const score = outcome === "win" ? 1 : (outcome === "loss" ? 0 : 0.5);
            const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
            rating = Math.round(rating + K * (score - expected));
            updates.rating = rating;
        }

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

    // Update Puzzle Progress & check achievements
    async updatePuzzleProgress(uid, unlockedLevel, puzzleStars) {
        if (!uid) return;
        const profile = await this.getUserProfile(uid);
        if (!profile) return;
        const updates = {
            puzzleProgress: unlockedLevel,
            puzzleStars: puzzleStars
        };
        await this.updateUserProfile(uid, updates);
        await this.checkAchievements(uid, { ...profile, ...updates });
    },

    // Update Learning Progress & check achievements
    async incrementLearningProgress(uid, completedLessonsList) {
        if (!uid) return;
        const profile = await this.getUserProfile(uid);
        if (!profile) return;
        const newCount = (profile.learningProgress || 0) + 1;
        const updates = {
            learningProgress: newCount,
            completedLessons: completedLessonsList
        };
        await this.updateUserProfile(uid, updates);
        await this.checkAchievements(uid, { ...profile, ...updates });
        return newCount;
    },

    // List of all achievements in system
    getAchievementsList() {
        return [
            { id: "first_win", title: "First Win", desc: "Win your first chess game", check: (s) => (s.wins || 0) >= 1 },
            { id: "win_10_games", title: "Win 10 Games", desc: "Win 10 games", check: (s) => (s.wins || 0) >= 10 },
            { id: "defeat_easy_ai", title: "Beat Easy AI", desc: "Defeat Easy AI level", check: (s) => {
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                return (rankOrder[s.highestAIDefeated || "None"] || 0) >= 1;
            }},
            { id: "defeat_medium_ai", title: "Beat Medium AI", desc: "Defeat Medium AI level", check: (s) => {
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                return (rankOrder[s.highestAIDefeated || "None"] || 0) >= 2;
            }},
            { id: "defeat_hard_ai", title: "Beat Hard AI", desc: "Defeat Hard AI level", check: (s) => {
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                return (rankOrder[s.highestAIDefeated || "None"] || 0) >= 3;
            }},
            { id: "defeat_grandmaster_ai", title: "Beat Grandmaster AI", desc: "Defeat Grandmaster AI level", check: (s) => {
                const rankOrder = { "Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4, "Master": 5, "Grandmaster": 6 };
                return (rankOrder[s.highestAIDefeated || "None"] || 0) >= 6;
            }},
            { id: "solve_10_puzzles", title: "Solve 10 Puzzles", desc: "Solve 10 puzzles in Quest", check: (s) => Object.keys(s.puzzleStars || {}).length >= 10 },
            { id: "solve_100_puzzles", title: "Solve 100 Puzzles", desc: "Solve 100 puzzles in Quest", check: (s) => Object.keys(s.puzzleStars || {}).length >= 100 },
            { id: "finish_learn_chess", title: "Finish Learn Chess", desc: "Finish Chess Academy syllabus", check: (s) => (s.completedLessons || []).length >= 14 },
            { id: "play_100_games", title: "Play 100 Games", desc: "Play 100 chess games", check: (s) => (s.gamesPlayed || 0) >= 100 }
        ];
    },

    // Achievement checklist evaluator
    async checkAchievements(uid, stats) {
        const activeAchievements = stats.achievements || [];
        const newAchievements = [...activeAchievements];
        const checklist = this.getAchievementsList();

        let changed = false;
        for (const item of checklist) {
            if (!activeAchievements.includes(item.id) && item.check(stats)) {
                newAchievements.push(item.id);
                changed = true;
                // Animate achievement unlock toast
                setTimeout(() => {
                    if (window.showAchievementUnlock) {
                        window.showAchievementUnlock(item.title, item.desc);
                    } else if (window.toast) {
                        window.toast(`🏆 Achievement Unlocked: ${item.title}!`);
                    }
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
    },

    // Create an online private match room mapping Code -> hostPeerId
    async createOnlineRoom(roomCode, hostPeerId, hostUid, hostUsername, hostRating, mins, inc) {
        const docRef = doc(db, "online_rooms", roomCode);
        const data = {
            roomCode,
            hostPeerId,
            hostUid,
            hostUsername,
            hostRating,
            mins,
            inc,
            status: "waiting",
            timestamp: Date.now()
        };
        await setDoc(docRef, data);
        return data;
    },

    // Fetch details of online room
    async getOnlineRoom(roomCode) {
        const docRef = doc(db, "online_rooms", roomCode);
        const snapshot = await getDoc(docRef);
        return snapshot.exists() ? snapshot.data() : null;
    },

    // Update online room values (status, guest info)
    async updateOnlineRoom(roomCode, updates) {
        const docRef = doc(db, "online_rooms", roomCode);
        await updateDoc(docRef, updates);
    },

    // Clean up online room
    async deleteOnlineRoom(roomCode) {
        const docRef = doc(db, "online_rooms", roomCode);
        await deleteDoc(docRef);
    },

    // Add player to matchmaking queue
    async joinMatchmakingQueue(uid, peerId, username, rating, mins, inc) {
        const docRef = doc(db, "matchmaking_queue", uid);
        const data = {
            userId: uid,
            peerId,
            username,
            rating,
            mins,
            inc,
            status: "waiting",
            timestamp: Date.now()
        };
        await setDoc(docRef, data);
        return docRef;
    },

    // Clean up queue entry
    async leaveMatchmakingQueue(uid) {
        const docRef = doc(db, "matchmaking_queue", uid);
        await deleteDoc(docRef);
    },

    // Check matchmaking queue for matches
    async findOpponentInQueue(uid, mins, inc) {
        const q = query(
            collection(db, "matchmaking_queue"),
            where("status", "==", "waiting"),
            where("mins", "==", mins),
            where("inc", "==", inc)
        );
        const snapshot = await getDocs(q);
        let found = null;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.userId !== uid && data.mins === mins && data.inc === inc && !found) {
                found = data;
            }
        });
        return found;
    }
};

// Also export direct functions for user registration script
export const createUserProfile = DbService.createUserProfile;
