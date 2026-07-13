/* =============================================================
   ANTIGRAVITY CHESS — Database Service (db-service.js)
   Modular interface wrapping Cloud Firestore APIs
   ============================================================= */

import { 
    db, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc 
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
            puzzleProgress: 0,
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
    }
};

// Also export direct functions for user registration script
export const createUserProfile = DbService.createUserProfile;
