/* =============================================================
   ANTIGRAVITY CHESS — Auth UI & Integration (auth-ui.js)
   Manages login/signup workflows and profile rendering in Lobby
   ============================================================= */

import { AuthService } from "./auth-service.js";
import { DbService } from "./db-service.js";

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
        } else if (isGuest) {
            // Guest mode active
            showMainScreen();
            renderGuestProfile();
        } else {
            // Unauthenticated
            showAuthScreenView();
            showPanel(panelLogin);
        }
    });

    // Share access to callback trigger for guest/manual updates
    window.authUIUpdate = (user, isGuest) => {
        if (user) {
            showMainScreen();
            renderUserProfile(user.uid);
        } else if (isGuest) {
            showMainScreen();
            renderGuestProfile();
        } else {
            showAuthScreenView();
            showPanel(panelLogin);
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
                    <button class="btn btn-secondary btn-sm" id="btn-logout" style="margin-top: 1rem; width: fit-content; padding: 0.45rem 0.9rem;">
                        <i class="fa fa-sign-out-alt"></i> Sign Out
                    </button>
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
                        <span class="profile-stat-lbl">Best AI Beaten</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${profile.puzzleProgress || 0}</span>
                        <span class="profile-stat-lbl">Puzzles Solved</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="profile-stat-val">${achievementsCount}/5</span>
                        <span class="profile-stat-lbl">Achievements</span>
                    </div>
                </div>
            `;

            // Bind sign out click
            document.getElementById("btn-logout").onclick = async () => {
                await AuthService.logout();
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
});
export { AuthService };
