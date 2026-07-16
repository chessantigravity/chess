/* =============================================================
   CHESS — Auth UI & Integration (auth-ui.js)
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
        const hostCard = document.getElementById('host-card');
        const socialCard = document.getElementById('social-hub-card');
        if (user) {
            // User is authenticated
            showMainScreen();
            await DbService.recordLogin(user.uid);
            renderUserProfile(user.uid);
            if (hostCard) hostCard.classList.remove('guest-locked');
            if (socialCard) socialCard.classList.remove('guest-locked');
            
            // Show match history
            document.getElementById("match-history-card").style.display = "block";
            fetchAndRenderMatches(user.uid);
        } else if (isGuest) {
            // Guest mode active
            showMainScreen();
            renderGuestProfile();
            if (hostCard) hostCard.classList.add('guest-locked');
            if (socialCard) socialCard.classList.add('guest-locked');
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
        const hostCard = document.getElementById('host-card');
        const socialCard = document.getElementById('social-hub-card');
        if (user) {
            showMainScreen();
            renderUserProfile(user.uid);
            if (hostCard) hostCard.classList.remove('guest-locked');
            if (socialCard) socialCard.classList.remove('guest-locked');
            document.getElementById("match-history-card").style.display = "block";
            fetchAndRenderMatches(user.uid);
        } else if (isGuest) {
            showMainScreen();
            renderGuestProfile();
            if (hostCard) hostCard.classList.add('guest-locked');
            if (socialCard) socialCard.classList.add('guest-locked');
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

    // ─── Slim lobby profile bar (avatar + name only) ───────────────────────
    async function renderUserProfile(uid) {
        const bar = document.getElementById("lobby-profile-bar");
        if (!bar) return;

        bar.style.display = "block";
        bar.innerHTML = `<div class="lobby-profile-strip"><i class="fa fa-spinner fa-spin" style="color:var(--text2);"></i></div>`;

        try {
            const profile = await DbService.getUserProfile(uid);
            if (!profile) { bar.innerHTML = ''; return; }

            bar.innerHTML = `
                <div class="lobby-profile-strip" id="lobby-strip-clickable" title="View Profile" style="cursor:pointer;">
                    <div class="lobby-strip-avatar">${profile.avatar || '👤'}</div>
                    <div class="lobby-strip-info">
                        <span class="lobby-strip-name">${profile.username} (${profile.rating || 1200})</span>
                        <span class="lobby-strip-sub">${profile.gamesPlayed || 0} games &bull; ${profile.winPercentage || 0}% win rate</span>
                    </div>
                    <div class="lobby-strip-actions">
                        <button class="btn btn-primary btn-sm" id="btn-view-profile" style="padding:0.4rem 1rem; font-size:0.82rem;">
                            <i class="fa fa-user"></i> View Profile
                        </button>
                        <button class="btn btn-secondary btn-sm" id="btn-lobby-logout" style="padding:0.4rem 0.8rem; font-size:0.82rem;">
                            <i class="fa fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('btn-view-profile').onclick = () => openProfilePage(uid);
            document.getElementById('btn-lobby-logout').onclick = async () => { await AuthService.logout(); };

        } catch(e) {
            console.error('Failed to render lobby strip:', e);
            bar.innerHTML = '';
        }
    }

    // ─── Full Profile Page ──────────────────────────────────────────────────
    async function openProfilePage(uid) {
        document.getElementById('lobby').style.display = 'none';
        const screen = document.getElementById('profile-screen');
        screen.style.display = 'block';

        // Show loading state
        document.getElementById('ppage-username').textContent = 'Loading…';
        document.getElementById('ppage-email').textContent = '';
        document.getElementById('ppage-joined').textContent = '';
        document.getElementById('ppage-avatar').textContent = '👤';
        document.getElementById('ppage-stats-grid').innerHTML = `<div style="color:var(--text2); font-size:0.85rem;"><i class="fa fa-spinner fa-spin"></i> Loading stats…</div>`;

        try {
            const profile = await DbService.getUserProfile(uid);
            if (!profile) return;

            const joinFormatted = new Date(profile.joinDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const winRate = profile.winPercentage || 0;
            const achievementsCount = (profile.achievements || []).length;
            const totalStars = Object.values(profile.puzzleStars || {}).reduce((a,b)=>a+b,0);
            const puzzleLevel = profile.puzzleProgress || 1;
            const lessons = profile.learningProgress || 0;

            // Hero card
            document.getElementById('ppage-avatar').textContent   = profile.avatar || '👤';
            document.getElementById('ppage-username').textContent  = profile.username;
            document.getElementById('ppage-email').textContent     = profile.email;
            document.getElementById('ppage-joined').textContent    = `Joined ${joinFormatted}`;

            // Stats grid
            const stats = [
                { val: profile.gamesPlayed || 0,            lbl: 'Played',      color: '' },
                { val: profile.wins || 0,                   lbl: 'Wins',        color: '#22c55e' },
                { val: profile.losses || 0,                 lbl: 'Losses',      color: '#ef4444' },
                { val: profile.draws || 0,                  lbl: 'Draws',       color: '#94a3b8' },
                { val: winRate + '%',                       lbl: 'Win Rate',    color: '#3b82f6' },
                { val: profile.rating || 1200,              lbl: 'Rating',      color: '#8b5cf6' },
                { val: profile.highestAIDefeated || 'None', lbl: 'Best AI',     color: '#f59e0b', small: true },
                { val: profile.favoriteOpening || 'None',   lbl: 'Opening',     color: '',        small: true },
                { val: '⭐ ' + totalStars,                  lbl: 'Puzzle ★',   color: '#fbbf24' },
                { val: lessons,                             lbl: 'Lessons',     color: '' },
                { val: achievementsCount + '/10',           lbl: 'Trophies',    color: '' },
            ];

            document.getElementById('ppage-stats-grid').innerHTML = stats.map(s => `
                <div class="profile-stat-box">
                    <span class="profile-stat-val" style="${s.color ? 'color:'+s.color+';' : ''}${s.small ? 'font-size:0.85rem;' : ''}">${s.val}</span>
                    <span class="profile-stat-lbl">${s.lbl}</span>
                </div>
            `).join('');

            // Render achievements list
            const achievementsList = document.getElementById('ppage-achievements-list');
            if (achievementsList) {
                const list = DbService.getAchievementsList();
                const unlockedSet = new Set(profile.achievements || []);
                achievementsList.innerHTML = list.map(ach => {
                    const isUnlocked = unlockedSet.has(ach.id);
                    
                    let currentVal = 0;
                    let targetVal = 1;
                    let showProgress = false;
                    
                    if (ach.id === "win_10_games") {
                        currentVal = profile.wins || 0;
                        targetVal = 10;
                        showProgress = true;
                    } else if (ach.id === "play_100_games") {
                        currentVal = profile.gamesPlayed || 0;
                        targetVal = 100;
                        showProgress = true;
                    } else if (ach.id === "solve_10_puzzles") {
                        currentVal = Object.keys(profile.puzzleStars || {}).length;
                        targetVal = 10;
                        showProgress = true;
                    } else if (ach.id === "solve_100_puzzles") {
                        currentVal = Object.keys(profile.puzzleStars || {}).length;
                        targetVal = 100;
                        showProgress = true;
                    } else if (ach.id === "finish_learn_chess") {
                        currentVal = (profile.completedLessons || []).length;
                        targetVal = 14;
                        showProgress = true;
                    }
                    
                    const pct = Math.min(100, Math.round((currentVal / targetVal) * 100));
                    
                    return `
                        <div style="display:flex; align-items:center; gap:0.85rem; padding:0.75rem; border-radius:8px; background:${isUnlocked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'}; border:1px solid ${isUnlocked ? 'var(--card-border)' : 'rgba(255,255,255,0.03)'}; opacity:${isUnlocked ? 1 : 0.6}; transition: all 0.3s ease;">
                            <div style="font-size:1.75rem; display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:${isUnlocked ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isUnlocked ? '#fbbf24' : 'transparent'}; flex-shrink:0;">
                                ${isUnlocked ? '🏆' : '🔒'}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.15rem;">
                                    <span style="font-size:0.9rem; font-weight:700; color:${isUnlocked ? 'var(--text)' : 'var(--text2)'};">${ach.title}</span>
                                    ${showProgress && !isUnlocked ? `<span style="font-size:0.7rem; color:var(--text2); font-weight:600;">${currentVal}/${targetVal}</span>` : ''}
                                </div>
                                <div style="font-size:0.75rem; color:var(--text2); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; margin-bottom:0.25rem;">${ach.desc}</div>
                                ${showProgress && !isUnlocked ? `
                                    <div style="height:4px; border-radius:99px; background:rgba(255,255,255,0.05); overflow:hidden; width:100%;">
                                        <div style="height:100%; border-radius:99px; background:var(--accent); width:${pct}%;"></div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Progress bars (animate after small delay)
            setTimeout(() => {
                const puzzlePct = Math.min(100, ((puzzleLevel - 1) / 504) * 100).toFixed(1);
                const lessonsPct = Math.min(100, (lessons / 14) * 100).toFixed(1);
                document.getElementById('ppage-puzzle-label').textContent  = `${puzzleLevel - 1} / 504`;
                document.getElementById('ppage-lessons-label').textContent = `${lessons} / 14`;
                document.getElementById('ppage-winrate-label').textContent = `${winRate}%`;
                document.getElementById('ppage-puzzle-bar').style.width   = puzzlePct + '%';
                document.getElementById('ppage-lessons-bar').style.width  = lessonsPct + '%';
                document.getElementById('ppage-winrate-bar').style.width  = winRate + '%';
            }, 80);

            // Bind profile page buttons
            document.getElementById('btn-profile-back').onclick = () => {
                screen.style.display = 'none';
                document.getElementById('lobby').style.display = 'block';
            };
            document.getElementById('btn-profile-logout').onclick = async () => {
                await AuthService.logout();
            };
            document.getElementById('btn-profile-edit').onclick = () => {
                const editModal = document.getElementById('profile-edit-overlay');
                const usernameInput = document.getElementById('edit-username');
                const msg = document.getElementById('edit-profile-msg');
                msg.textContent = '';
                msg.className = 'auth-msg';
                usernameInput.value = profile.username;
                const currentAvatar = profile.avatar || '👤';
                document.querySelectorAll('.picker-avatar').forEach(el => {
                    el.classList.toggle('selected', el.getAttribute('data-char') === currentAvatar);
                });
                editModal.style.display = 'flex';
            };

        } catch(e) {
            console.error('Failed to render profile page:', e);
        }
    }

    // ─── Guest Lobby Strip ──────────────────────────────────────────────────
    function renderGuestProfile() {
        const bar = document.getElementById('lobby-profile-bar');
        if (!bar) return;
        const hostCard = document.getElementById('host-card');
        if (hostCard) hostCard.classList.add('guest-locked');
        const socialCard = document.getElementById('social-hub-card');
        if (socialCard) socialCard.classList.add('guest-locked');
        bar.style.display = 'block';
        bar.innerHTML = `
            <div class="lobby-profile-strip">
                <div class="lobby-strip-avatar" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1); font-size:1.6rem;">👥</div>
                <div class="lobby-strip-info">
                    <span class="lobby-strip-name">Guest Player</span>
                    <span class="lobby-strip-sub" style="color:var(--accent);">Create a free account to save your progress!</span>
                </div>
                <div class="lobby-strip-actions">
                    <button class="btn btn-primary btn-sm" id="btn-guest-signup" style="padding:0.4rem 1rem; font-size:0.82rem;">
                        <i class="fa fa-user-plus"></i> Sign Up
                    </button>
                    <button class="btn btn-secondary btn-sm" id="btn-guest-signin" style="padding:0.4rem 0.9rem; font-size:0.82rem;">
                        <i class="fa fa-sign-in-alt"></i> Log In
                    </button>
                </div>
            </div>
        `;
        document.getElementById('btn-guest-signup').onclick = () => { showAuthScreenView(); showPanel(panelSignup); };
        document.getElementById('btn-guest-signin').onclick = () => { showAuthScreenView(); showPanel(panelLogin); };
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
