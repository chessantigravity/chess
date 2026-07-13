/* =============================================================
   ANTIGRAVITY CHESS — Auth UI & Integration (auth-ui.js)
   Manages login/signup workflows and profile rendering in Lobby
   ============================================================= */

import { AuthService } from "./auth-service.js";
import { DbService } from "./db-service.js";
import { openReplayModal } from "./replay-modal.js";

// Global update handler for external bindings
window.authUIUpdate = null;

document.addEventListener("DOMContentLoaded", () => {
    // UI elements references
    const authScreen = document.getElementById("auth-screen");
    const appHeader = document.getElementById("app-header");
    const appMain = document.getElementById("app-main");
    
    // Panel switches
    const panelLogin = document.getElementById("panel-login");
    const panelSignup = document.getElementById("panel-signup");
    const panelForgot = document.getElementById("panel-forgot");
    
    // Helper to toggle auth panels
    function showPanel(panel) {
        panelLogin.style.display = "none";
        panelSignup.style.display = "none";
        panelForgot.style.display = "none";
        panel.style.display = "block";
        // Clear error/success messages
        document.querySelectorAll(".auth-msg").forEach(el => {
            el.textContent = "";
            el.className = "auth-msg";
        });
    }

    // Toggle links
    document.getElementById("link-to-signup").onclick = (e) => { e.preventDefault(); showPanel(panelSignup); };
    document.getElementById("link-to-login").onclick = (e) => { e.preventDefault(); showPanel(panelLogin); };
    document.getElementById("link-to-login-from-forgot").onclick = (e) => { e.preventDefault(); showPanel(panelLogin); };
    document.getElementById("link-forgot-pw").onclick = (e) => { e.preventDefault(); showPanel(panelForgot); };

    // Guest mode click
    document.getElementById("btn-guest-play").onclick = (e) => {
        e.preventDefault();
        AuthService.enableGuestMode();
    };

    // --- PROFILE EDIT MODAL BINDINGS ---
    // Avatar picker selector grid
    document.querySelectorAll(".picker-avatar").forEach(el => {
        el.addEventListener("click", () => {
            document.querySelectorAll(".picker-avatar").forEach(av => av.classList.remove("selected"));
            el.classList.add("selected");
        });
    });

    // Close edit modal
    document.getElementById("btn-close-edit-modal").onclick = () => {
        document.getElementById("profile-edit-overlay").style.display = "none";
    };
    document.getElementById("profile-edit-overlay").onclick = (e) => {
        if (e.target.id === "profile-edit-overlay") {
            document.getElementById("profile-edit-overlay").style.display = "none";
        }
    };

    // Save profile changes form submit
    const formEditProfile = document.getElementById("form-edit-profile");
    formEditProfile.onsubmit = async (e) => {
        e.preventDefault();
        const user = AuthService.getCurrentUser();
        if (!user) return;
        
        const username = document.getElementById("edit-username").value.trim();
        const selectedAvatarEl = document.querySelector(".picker-avatar.selected");
        const avatar = selectedAvatarEl ? selectedAvatarEl.getAttribute("data-char") : "👤";
        const msg = document.getElementById("edit-profile-msg");
        const btn = formEditProfile.querySelector("button[type='submit']");

        if (!username) {
            msg.textContent = "Username is required.";
            msg.className = "auth-msg error";
            return;
        }

        try {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving…';
            
            await DbService.updateUserProfile(user.uid, { username, avatar });
            
            document.getElementById("profile-edit-overlay").style.display = "none";
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText;
            
            // Refresh profiles dashboard
            renderUserProfile(user.uid);
            
            // Notification toast
            if (window.toast) window.toast("Profile updated successfully!");
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || "Save Changes";
            msg.textContent = err.message || "Failed to update profile.";
            msg.className = "auth-msg error";
        }
    };

    // --- FORM SUBMISSIONS ---
    
    // 1. SIGN IN
    const formLogin = document.getElementById("form-login");
    formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const pass = document.getElementById("login-pass").value;
        const remember = document.getElementById("login-remember").checked;
        const msg = document.getElementById("login-msg");
        const btn = formLogin.querySelector("button[type='submit']");

        if (!email || !pass) {
            showMsg(msg, "Please enter your email and password.", "error");
            return;
        }

        try {
            setLoading(btn, true);
            await AuthService.login(email, pass, remember);
        } catch (err) {
            setLoading(btn, false);
            showMsg(msg, getFriendlyError(err), "error");
        }
    };

    // 2. SIGN UP
    const formSignup = document.getElementById("form-signup");
    formSignup.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById("signup-user").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const pass = document.getElementById("signup-pass").value;
        const msg = document.getElementById("signup-msg");
        const btn = formSignup.querySelector("button[type='submit']");

        if (!username || !email || !pass) {
            showMsg(msg, "All fields are required.", "error");
            return;
        }
        if (pass.length < 6) {
            showMsg(msg, "Password must be at least 6 characters.", "error");
            return;
        }

        try {
            setLoading(btn, true);
            await AuthService.signUp(email, pass, username);
        } catch (err) {
            setLoading(btn, false);
            showMsg(msg, getFriendlyError(err), "error");
        }
    };

    // 3. FORGOT PASSWORD
    const formForgot = document.getElementById("form-forgot");
    formForgot.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("forgot-email").value.trim();
        const msg = document.getElementById("forgot-msg");
        const btn = formForgot.querySelector("button[type='submit']");

        if (!email) {
            showMsg(msg, "Please enter your email address.", "error");
            return;
        }

        try {
            setLoading(btn, true);
            await AuthService.forgotPassword(email);
            setLoading(btn, false);
            showMsg(msg, "Password reset link sent to your email!", "success");
            document.getElementById("forgot-email").value = "";
        } catch (err) {
            setLoading(btn, false);
            showMsg(msg, getFriendlyError(err), "error");
        }
    };

    // --- SESSION STATE WATCHER ---
    AuthService.onAuthStateChanged(async (user, isGuest) => {
        if (user) {
            // User is authenticated
            showMainScreen();
            await DbService.recordLogin(user.uid);
            renderUserProfile(user.uid);
            
            // Show match history
            document.getElementById("match-history-card").style.display = "block";
            fetchAndRenderMatches(user.uid);
        } else if (isGuest) {
            // Guest mode active
            showMainScreen();
            renderGuestProfile();
            document.getElementById("match-history-card").style.display = "none";
        } else {
            // Unauthenticated
            showAuthScreenView();
            showPanel(panelLogin);
            document.getElementById("match-history-card").style.display = "none";
        }
    });

    // Share access to callback trigger for guest/manual updates
    window.authUIUpdate = (user, isGuest) => {
        if (user) {
            showMainScreen();
            renderUserProfile(user.uid);
            document.getElementById("match-history-card").style.display = "block";
            fetchAndRenderMatches(user.uid);
        } else if (isGuest) {
            showMainScreen();
            renderGuestProfile();
            document.getElementById("match-history-card").style.display = "none";
        } else {
            showAuthScreenView();
            showPanel(panelLogin);
            document.getElementById("match-history-card").style.display = "none";
        }
    };

    function showMainScreen() {
        authScreen.style.display = "none";
        appHeader.style.display = "flex";
        appMain.style.display = "block";
    }

    function showAuthScreenView() {
        authScreen.style.display = "flex";
        appHeader.style.display = "none";
        appMain.style.display = "none";
    }

    function setLoading(btn, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processing…';
        } else {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        }
    }

    function showMsg(el, text, type) {
        el.textContent = text;
        el.className = `auth-msg ${type}`;
    }

    function getFriendlyError(err) {
        switch (err.code) {
            case "auth/invalid-email":
                return "The email address is formatted incorrectly.";
            case "auth/user-disabled":
                return "This account has been disabled.";
            case "auth/user-not-found":
                return "No account matches this email address.";
            case "auth/wrong-password":
                return "Incorrect password. Please try again.";
            case "auth/email-already-in-use":
                return "This email is already registered.";
            case "auth/weak-password":
                return "Password must be at least 6 characters.";
            default:
                return err.message || "An unexpected error occurred. Please try again.";
        }
    }

    // --- PROFILE DASHBOARD RENDERING ---

    async function renderUserProfile(uid) {
        const dashboard = document.getElementById("profile-dashboard");
        if (!dashboard) return;
        
        dashboard.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 1.5rem;"><i class="fa fa-spinner fa-spin"></i> Loading profile…</div>';

        try {
            const profile = await DbService.getUserProfile(uid);
            if (!profile) {
                dashboard.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 1.5rem; color: var(--text2);">Failed to load profile. Please log out and try again.</div>';
                return;
            }

            const winRate = profile.winPercentage || 0;
            const achievementsCount = (profile.achievements || []).length;
            const joinFormatted = new Date(profile.joinDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

            dashboard.innerHTML = `
                <!-- Left: Profile identity card -->
                <div class="profile-card-left">
                    <div style="display:flex; gap:1.25rem; align-items:center;">
                        <div class="profile-avatar">${profile.avatar || "👤"}</div>
                        <div>
                            <div class="profile-username">${profile.username}</div>
                            <div class="profile-email">${profile.email}</div>
                            <div class="profile-joined">Joined: ${joinFormatted}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top: 1rem;">
                        <button class="btn btn-secondary btn-sm" id="btn-edit-profile" style="padding: 0.45rem 0.9rem;">
                            <i class="fa fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-secondary btn-sm" id="btn-logout" style="padding: 0.45rem 0.9rem;">
                            <i class="fa fa-sign-out-alt"></i> Sign Out
                        </button>
                    </div>
                </div>
                <!-- Right: Stats Panel Grid -->
                <div class="profile-card-right">
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${profile.gamesPlayed || 0}</span>
                        <span class="profile-stat-lbl">Played</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val" style="color: #22c55e;">${profile.wins || 0}</span>
                        <span class="profile-stat-lbl">Wins</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val" style="color: #ef4444;">${profile.losses || 0}</span>
                        <span class="profile-stat-lbl">Losses</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val" style="color: #94a3b8;">${profile.draws || 0}</span>
                        <span class="profile-stat-lbl">Draws</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${winRate}%</span>
                        <span class="profile-stat-lbl">Win Rate</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val" style="font-size: 0.85rem; padding-top: 0.25rem;">${profile.highestAIDefeated || "None"}</span>
                        <span class="profile-stat-lbl">Best AI</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val" style="font-size: 0.85rem; padding-top: 0.25rem;">${profile.favoriteOpening || "None"}</span>
                        <span class="profile-stat-lbl">Opening</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${profile.puzzleProgress || 0}</span>
                        <span class="profile-stat-lbl">Puzzles</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${profile.learningProgress || 0}</span>
                        <span class="profile-stat-lbl">Lessons</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${achievementsCount}/5</span>
                        <span class="profile-stat-lbl">Trophies</span>
                    </div>
                </div>
            `;

            // Bind sign out click
            document.getElementById("btn-logout").onclick = async () => {
                await AuthService.logout();
            };

            // Bind edit profile click
            document.getElementById("btn-edit-profile").onclick = () => {
                const editModal = document.getElementById("profile-edit-overlay");
                const usernameInput = document.getElementById("edit-username");
                const msg = document.getElementById("edit-profile-msg");
                
                // Reset message
                msg.textContent = "";
                msg.className = "auth-msg";
                
                // Pre-fill username
                usernameInput.value = profile.username;
                
                // Pre-select avatar symbol in picker grid
                const currentAvatar = profile.avatar || "👤";
                document.querySelectorAll(".picker-avatar").forEach(el => {
                    if (el.getAttribute("data-char") === currentAvatar) {
                        el.classList.add("selected");
                    } else {
                        el.classList.remove("selected");
                    }
                });
                
                editModal.style.display = "flex";
            };

        } catch (e) {
            console.error("Failed to render profile dashboard:", e);
            dashboard.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 1.5rem; color: var(--text2);">Failed to load profile.</div>';
        }
    }

    function renderGuestProfile() {
        const dashboard = document.getElementById("profile-dashboard");
        if (!dashboard) return;

        dashboard.innerHTML = `
            <!-- Left: Profile identity card -->
            <div class="profile-card-left" style="border-right-color: transparent;">
                <div style="display:flex; gap:1.25rem; align-items:center;">
                    <div class="profile-avatar" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: var(--text2);">👥</div>
                    <div>
                        <div class="profile-username">Guest Player</div>
                        <div class="profile-email">Offline Guest Mode</div>
                        <div class="profile-joined" style="color: var(--accent); font-weight: 500;">Create an account to track ratings and unlock achievements!</div>
                    </div>
                </div>
                <div style="display:flex; gap:0.75rem; margin-top: 1.25rem;">
                    <button class="btn btn-primary btn-sm" id="btn-guest-signup" style="padding: 0.45rem 1rem;">
                        <i class="fa fa-user-plus"></i> Create Account
                    </button>
                    <button class="btn btn-secondary btn-sm" id="btn-guest-signin" style="padding: 0.45rem 1rem;">
                        <i class="fa fa-sign-in-alt"></i> Sign In
                    </button>
                </div>
            </div>
            <!-- Right: Explanatory benefits panel -->
            <div class="profile-card-right" style="grid-template-columns: 1fr; display: flex; align-items: center; justify-content: center; text-align: center; padding: 1rem; color: var(--text2); font-size: 0.8rem; line-height: 1.5;">
                <div>
                    <div style="font-weight: 800; color: var(--text); font-size: 0.9rem; margin-bottom: 0.25rem;">♟ Unlock Full Platform Experience</div>
                    With a free account, you can save your game statistics, track puzzle history, earn trophies, and access cloud synchronization!
                </div>
            </div>
        `;

        // Bind redirect controls
        document.getElementById("btn-guest-signup").onclick = () => {
            showAuthScreenView();
            showPanel(panelSignup);
        };
        document.getElementById("btn-guest-signin").onclick = () => {
            showAuthScreenView();
            showPanel(panelLogin);
        };
    }

    // --- MATCH HISTORY RENDERING ---
    let userMatches = [];

    // Bind Match History filters
    document.getElementById("mh-search").addEventListener("input", renderMatchesList);
    document.getElementById("mh-filter-result").addEventListener("change", renderMatchesList);
    document.getElementById("mh-filter-type").addEventListener("change", renderMatchesList);
    document.getElementById("mh-sort").addEventListener("change", renderMatchesList);

    async function fetchAndRenderMatches(uid) {
        const listContainer = document.getElementById("mh-list");
        if (!listContainer) return;
        
        listContainer.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text2);"><i class="fa fa-spinner fa-spin"></i> Loading matches…</div>';
        
        try {
            userMatches = await DbService.getUserMatches(uid);
            renderMatchesList();
        } catch (e) {
            console.error("Failed to load match history:", e);
            listContainer.textContent = "Failed to load match history.";
        }
    }

    function renderMatchesList() {
        const listContainer = document.getElementById("mh-list");
        if (!listContainer) return;

        const searchQuery = document.getElementById("mh-search").value.trim().toLowerCase();
        const filterResult = document.getElementById("mh-filter-result").value;
        const filterType = document.getElementById("mh-filter-type").value;
        const sortBy = document.getElementById("mh-sort").value;

        // 1. Filter matches
        let processed = userMatches.filter(m => {
            const matchesSearch = !searchQuery || m.opponent.toLowerCase().includes(searchQuery);
            const matchesResult = filterResult === "all" || m.result === filterResult;
            const matchesType = filterType === "all" || m.opponentType === filterType;
            return matchesSearch && matchesResult && matchesType;
        });

        // 2. Sort matches
        processed.sort((a, b) => {
            if (sortBy === "date-desc") return new Date(b.date) - new Date(a.date);
            if (sortBy === "date-asc") return new Date(a.date) - new Date(b.date);
            if (sortBy === "moves-desc") return b.movesCount - a.movesCount;
            if (sortBy === "duration-desc") return b.duration - a.duration;
            return 0;
        });

        // 3. Render list items
        if (processed.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text2); font-size:0.85rem;">No matching matches found.</div>';
            return;
        }

        listContainer.innerHTML = "";
        processed.forEach(m => {
            const dateStr = new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            
            // Format duration
            const min = Math.floor(m.duration / 60);
            const sec = m.duration % 60;
            const durationStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

            const resultClass = m.result === "win" ? "easy" : m.result === "loss" ? "master" : "medium";
            const resultLabel = m.result.toUpperCase();

            const itemDiv = document.createElement("div");
            itemDiv.className = "card";
            itemDiv.style.display = "flex";
            itemDiv.style.justifyContent = "space-between";
            itemDiv.style.alignItems = "center";
            itemDiv.style.padding = "0.75rem 1rem";
            itemDiv.style.background = "var(--bg)";
            itemDiv.style.border = "1px solid var(--card-border)";
            itemDiv.style.borderRadius = "10px";
            itemDiv.style.flexWrap = "wrap";
            itemDiv.style.gap = "0.75rem";
            itemDiv.style.margin = "0";

            const leftCol = document.createElement("div");
            leftCol.style.display = "flex";
            leftCol.style.alignItems = "center";
            leftCol.style.gap = "0.75rem";
            leftCol.style.textAlign = "left";
            
            const badge = document.createElement("span");
            badge.className = `ai-badge ${resultClass}`;
            badge.style.fontSize = "0.65rem";
            badge.style.width = "42px";
            badge.style.textAlign = "center";
            badge.textContent = resultLabel;
            
            const details = document.createElement("div");
            details.innerHTML = `
                <div style="font-weight: 800; font-size: 0.9rem;">vs ${m.opponent} <span style="font-size:0.75rem; color:var(--text2); font-weight:normal;">(${m.opponentType})</span></div>
                <div style="font-size: 0.75rem; color: var(--text2); margin-top:0.15rem;">
                    ${dateStr} &bull; ${m.movesCount} moves &bull; ${durationStr} &bull; <span style="color:var(--text); font-weight:500;">${m.openingName || "Unknown Opening"}</span>
                </div>
            `;
            
            leftCol.appendChild(badge);
            leftCol.appendChild(details);

            const replayBtn = document.createElement("button");
            replayBtn.className = "btn btn-secondary btn-sm";
            replayBtn.style.padding = "0.4rem 0.8rem";
            replayBtn.innerHTML = '<i class="fa fa-play-circle"></i> Replay';
            replayBtn.onclick = () => {
                openReplayModal(m);
            };

            itemDiv.appendChild(leftCol);
            itemDiv.appendChild(replayBtn);
            listContainer.appendChild(itemDiv);
        });
    }
});
export { AuthService };
