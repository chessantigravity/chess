/* =============================================================
   CHESS — Social & Friends UI Coordinator (social-ui.js)
   Handles tabs, lists, search, requests, & notification badges
   ============================================================= */

import { SocialService } from "./social-service.js";
import { AuthService } from "./auth-service.js";
import { DbService } from "./db-service.js";

export const SocialUI = (() => {

    let activeTab = "friends-list";
    let activeFriendsListener = null;
    let activeRequestsListener = null;
    let activeNotificationsListener = null;
    let friendToRemoveUid = null;
    let friendToRemoveUsername = null;

    // --- Boot / Initialize Social listeners ---
    function init() {
        bindNavigation();
        bindTabs();
        bindSearch();
        bindRemoveConfirmation();
        startGlobalNotificationsListener();
    }

    // --- Navigation setup ---
    function bindNavigation() {
        const btnEnter = document.getElementById("btn-enter-friends");
        const btnBack = document.getElementById("btn-friends-back");

        if (btnEnter) {
            btnEnter.addEventListener("click", async () => {
                if (AuthService.isGuest()) {
                    toast("⚠️ Social features are only available for registered users.");
                    return;
                }
                showFriendsScreen();
            });
        }

        if (btnBack) {
            btnBack.addEventListener("click", () => {
                showLobbyScreen();
            });
        }
    }

    function showFriendsScreen() {
        window.deactivateAllScreens();
        document.getElementById("friends-screen").classList.add("active");
        
        // Start real-time listeners for current user
        const user = AuthService.getCurrentUser();
        if (user) {
            startFriendsListeners(user.uid);
            renderRecentPlayers(user.uid);
        }
        
        // Clear search inputs and grids on open
        document.getElementById("inp-search-players").value = "";
        document.getElementById("search-players-grid").innerHTML = "";
        document.getElementById("search-players-empty").style.display = "block";
    }

    function showLobbyScreen() {
        stopFriendsListeners();
        window.deactivateAllScreens();
        document.getElementById("lobby").classList.add("active");
        // Trigger profile update to sync anything
        const user = AuthService.getCurrentUser();
        if (user && window.authUIUpdate) {
            window.authUIUpdate(user, false);
        }
    }

    // --- Tab Switching ---
    function bindTabs() {
        const tabs = ["friends-list", "friend-requests", "search-players", "recent-players"];
        
        tabs.forEach(tab => {
            const btn = document.getElementById(`tab-${tab}`);
            if (btn) {
                btn.addEventListener("click", () => {
                    tabs.forEach(t => {
                        document.getElementById(`tab-${t}`).classList.remove("active");
                        document.getElementById(`sect-${t}`).style.display = "none";
                    });
                    btn.classList.add("active");
                    document.getElementById(`sect-${tab}`).style.display = "block";
                    activeTab = tab;

                    // If request tab opened, mark notifications as read
                    if (tab === "friend-requests") {
                        const user = AuthService.getCurrentUser();
                        if (user) {
                            SocialService.markNotificationsAsRead(user.uid);
                        }
                    }
                });
            }
        });
    }

    // --- Friends listeners ---
    function startFriendsListeners(uid) {
        stopFriendsListeners();

        // 1. Friends list
        activeFriendsListener = SocialService.listenToFriends(uid, (friends) => {
            renderFriendsList(friends, uid);
        });

        // 2. Incoming Requests
        activeRequestsListener = SocialService.listenToIncomingRequests(uid, (requests) => {
            renderIncomingRequests(requests);
            updateRequestsBadge(requests.length);
        });
    }

    function stopFriendsListeners() {
        if (activeFriendsListener) {
            activeFriendsListener();
            activeFriendsListener = null;
        }
        if (activeRequestsListener) {
            activeRequestsListener();
            activeRequestsListener = null;
        }
    }

    // --- Global Notifications System ---
    function startGlobalNotificationsListener() {
        AuthService.onAuthStateChanged((user) => {
            if (user && !AuthService.isGuest()) {
                if (activeNotificationsListener) activeNotificationsListener();
                
                activeNotificationsListener = SocialService.listenToNotifications(user.uid, (notifications) => {
                    updateLobbyBadge(notifications.length);
                    handleIncomingChallengeNotifications(notifications, user.uid);
                });
            } else {
                if (activeNotificationsListener) {
                    activeNotificationsListener();
                    activeNotificationsListener = null;
                }
                updateLobbyBadge(0);
            }
        });
    }

    function updateRequestsBadge(count) {
        const badge = document.getElementById("requests-tab-badge");
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = "inline-block";
            } else {
                badge.style.display = "none";
            }
        }
    }

    function updateLobbyBadge(count) {
        const badge = document.getElementById("friends-badge");
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = "inline-block";
            } else {
                badge.style.display = "none";
            }
        }
    }

    // --- Challenge Notification Interceptor ---
    async function handleIncomingChallengeNotifications(notifications, currentUid) {
        const challenge = notifications.find(n => n.type === "challenge_new" && !n.read);
        if (challenge) {
            // Instantly mark read so it doesn't double alert
            const { doc, db, updateDoc } = await import("./firebase-init.js");
            await updateDoc(doc(db, "notifications", challenge.notificationId), { read: true });

            const accept = confirm(`⚔️ Challenge! ${challenge.senderUsername} challenged you to a game. Accept?`);
            if (accept) {
                // Join the game automatically
                if (window.joinGame) {
                    window.joinGame(challenge.roomCode);
                }
            }
        }
    }

    // --- RENDER FRIENDS ---
    function renderFriendsList(friends, currentUid) {
        const grid = document.getElementById("friends-list-grid");
        const empty = document.getElementById("friends-list-empty");

        if (!grid) return;
        grid.innerHTML = "";

        if (friends.length === 0) {
            empty.style.display = "block";
            return;
        }
        empty.style.display = "none";

        friends.forEach(f => {
            // Determine if friend is A or B in document schema
            const isHost = f.uidA === currentUid;
            const friendUid = isHost ? f.uidB : f.uidA;
            const friendName = isHost ? f.usernameB : f.usernameA;
            const friendAvatar = isHost ? f.avatarB : f.avatarA;

            // Fetch rating dynamically
            const card = document.createElement("div");
            card.className = "friend-card";

            card.innerHTML = `
                <div class="friend-card-header">
                    <div class="friend-card-avatar">
                        ${friendAvatar}
                        <span class="friend-status-dot" id="dot-${friendUid}"></span>
                    </div>
                    <div class="friend-card-info">
                        <span class="friend-card-name">${friendName}</span>
                        <span class="friend-card-meta" id="rating-${friendUid}">Rating: Loading…</span>
                    </div>
                </div>
                <div class="friend-card-stats">
                    <span>Games: <strong>${f.gamesPlayed || 0}</strong></span>
                    <span>Wins: <strong>${isHost ? f.winsA : f.winsB}</strong></span>
                    <span>Losses: <strong>${isHost ? f.winsB : f.winsA}</strong></span>
                </div>
                <div class="friend-card-actions">
                    <button class="btn btn-primary btn-sm" id="btn-play-${friendUid}"><i class="fa fa-swords"></i> Play</button>
                    <button class="btn btn-secondary btn-sm" id="btn-prof-${friendUid}"><i class="fa fa-user"></i> Profile</button>
                    <button class="btn btn-danger btn-sm" id="btn-rem-${friendUid}"><i class="fa fa-trash"></i></button>
                </div>
            `;

            grid.appendChild(card);

            // Fetch user profile ELO rating & status dynamically
            DbService.getUserProfile(friendUid).then(profile => {
                if (profile) {
                    const ratingEl = document.getElementById(`rating-${friendUid}`);
                    if (ratingEl) ratingEl.textContent = `Rating: ${profile.rating || 1200}`;
                    
                    // Simple mock status check
                    const statusDot = document.getElementById(`dot-${friendUid}`);
                    if (statusDot) {
                        // Norway magnus and hikaru are online in mocks!
                        if (friendUid.includes("magnus") || friendUid.includes("hikaru") || profile.online) {
                            statusDot.classList.add("online");
                        }
                    }
                }
            });

            // Action: Play / Challenge
            document.getElementById(`btn-play-${friendUid}`).addEventListener("click", () => {
                challengeFriend(friendUid, friendName);
            });

            // Action: View Profile modal
            document.getElementById(`btn-prof-${friendUid}`).addEventListener("click", () => {
                openFriendProfile(friendUid, friendName, friendAvatar);
            });

            // Action: Remove Friend confirm
            document.getElementById(`btn-rem-${friendUid}`).addEventListener("click", () => {
                promptRemoveFriend(friendUid, friendName);
            });
        });
    }

    // --- Challenge Flow ---
    async function challengeFriend(friendUid, friendName) {
        toast(`Sending challenge to ${friendName}…`);
        
        // Host a P2P room locally first
        if (window.hostGame) {
            // Trigger standard room hosting
            window.hostGame();

            // Once room code is ready in window.APP.roomCode, send notification to friend
            const interval = setInterval(async () => {
                if (window.APP && window.APP.roomCode) {
                    clearInterval(interval);
                    
                    // Send Firestore notification with room code
                    const user = AuthService.getCurrentUser();
                    if (user) {
                        const { doc, collection, db, setDoc } = await import("./firebase-init.js");
                        const notifRef = doc(collection(db, "notifications"));
                        await setDoc(notifRef, {
                            notificationId: notifRef.id || "notif_" + Math.random().toString(36).substr(2, 9),
                            userId: friendUid,
                            type: "challenge_new",
                            senderUid: user.uid,
                            senderUsername: user.displayName || user.email.split("@")[0],
                            roomCode: window.APP.roomCode,
                            text: `challenged you to a game.`,
                            read: false,
                            timestamp: Date.now()
                        });
                        toast(`Challenge notification sent to ${friendName}!`);
                    }
                }
            }, 500);
        }
    }

    // --- Profile & History Modal ---
    async function openFriendProfile(friendUid, friendName, friendAvatar) {
        const modal = document.getElementById("friend-profile-overlay");
        const avatarEl = document.getElementById("friend-modal-avatar");
        const nameEl = document.getElementById("friend-modal-username");
        const ratingEl = document.getElementById("friend-modal-rating");
        const statusEl = document.getElementById("friend-modal-status");

        const statPlayed = document.getElementById("friend-stat-played");
        const statWins = document.getElementById("friend-stat-wins");
        const statLosses = document.getElementById("friend-stat-losses");
        const statDraws = document.getElementById("friend-stat-draws");
        const matchesList = document.getElementById("friend-matches-list");

        if (!modal) return;

        // Set loading states
        avatarEl.textContent = friendAvatar;
        nameEl.textContent = friendName;
        ratingEl.textContent = "ELO Loading…";
        statusEl.textContent = "Offline";
        statPlayed.textContent = "-";
        statWins.textContent = "-";
        statLosses.textContent = "-";
        statDraws.textContent = "-";
        matchesList.innerHTML = `<div style="color:var(--text2);text-align:center;font-size:0.85rem;padding:1rem;">Loading matches…</div>`;

        modal.style.display = "flex";

        // Fetch profile
        const profile = await DbService.getUserProfile(friendUid);
        if (profile) {
            ratingEl.textContent = `ELO ${profile.rating || 1200}`;
            if (friendUid.includes("magnus") || friendUid.includes("hikaru") || profile.online) {
                statusEl.textContent = "🟢 Online";
                statusEl.style.color = "#22c55e";
            } else {
                statusEl.textContent = "Offline";
                statusEl.style.color = "var(--text2)";
            }
        }

        // Fetch matches together
        const user = AuthService.getCurrentUser();
        if (user) {
            const history = await SocialService.getMatchesWithFriend(user.uid, friendName);
            statPlayed.textContent = history.matches.length;
            statWins.textContent = history.wins;
            statLosses.textContent = history.losses;
            statDraws.textContent = history.draws;

            matchesList.innerHTML = "";
            if (history.matches.length === 0) {
                matchesList.innerHTML = `<div style="color:var(--text2);text-align:center;font-size:0.85rem;padding:1rem;">No games played together yet.</div>`;
                return;
            }

            history.matches.forEach(m => {
                const date = m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Recent';
                const item = document.createElement("div");
                item.className = "profile-stat-box";
                item.style.display = "flex";
                item.style.justify = "space-between";
                item.style.alignItems = "center";
                item.style.padding = "0.5rem 0.75rem";
                item.style.fontSize = "0.82rem";

                let resultColor = "var(--text)";
                if (m.result === "win") resultColor = "#22c55e";
                else if (m.result === "loss") resultColor = "#ef4444";

                item.innerHTML = `
                    <span style="font-weight:700; color:${resultColor};">${m.result.toUpperCase()}</span>
                    <span style="color:var(--text2);">${m.movesCount || 0} moves</span>
                    <span style="color:var(--text2); font-size:0.75rem;">${date}</span>
                `;
                matchesList.appendChild(item);
            });
        }

        // Close logic
        document.getElementById("btn-close-friend-modal").onclick = () => {
            modal.style.display = "none";
        };
    }

    // --- Remove Friend Prompt & Confirmation ---
    function promptRemoveFriend(uid, username) {
        friendToRemoveUid = uid;
        friendToRemoveUsername = username;

        const overlay = document.getElementById("friend-confirm-overlay");
        const nameEl = document.getElementById("confirm-friend-name");

        if (overlay && nameEl) {
            nameEl.textContent = username;
            overlay.style.display = "flex";
        }
    }

    function bindRemoveConfirmation() {
        const btnConfirm = document.getElementById("btn-confirm-remove");
        const btnCancel = document.getElementById("btn-cancel-remove");
        const overlay = document.getElementById("friend-confirm-overlay");

        if (btnCancel) {
            btnCancel.addEventListener("click", () => {
                overlay.style.display = "none";
                friendToRemoveUid = null;
                friendToRemoveUsername = null;
            });
        }

        if (btnConfirm) {
            btnConfirm.addEventListener("click", async () => {
                const user = AuthService.getCurrentUser();
                if (user && friendToRemoveUid) {
                    try {
                        await SocialService.removeFriend(user.uid, friendToRemoveUid);
                        toast(`Removed ${friendToRemoveUsername} from friends.`);
                    } catch(e) {
                        toast(`Error: ${e.message}`);
                    }
                }
                overlay.style.display = "none";
                friendToRemoveUid = null;
                friendToRemoveUsername = null;
            });
        }
    }

    // --- RENDER REQUESTS ---
    function renderIncomingRequests(requests) {
        const list = document.getElementById("received-requests-list");
        if (!list) return;
        list.innerHTML = "";

        if (requests.length === 0) {
            list.innerHTML = `<div style="color:var(--text2); font-size:0.85rem; text-align:center; padding:1.5rem 1rem;">No incoming requests.</div>`;
            return;
        }

        requests.forEach(r => {
            const item = document.createElement("div");
            item.className = "profile-stat-box";
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "0.75rem 1rem";

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:1.5rem;">${r.senderAvatar || '👤'}</span>
                    <span style="font-weight:700;">${r.senderUsername}</span>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-primary btn-sm" id="btn-accept-${r.requestId}" style="padding:0.35rem 0.75rem;"><i class="fa fa-check"></i> Accept</button>
                    <button class="btn btn-secondary btn-sm" id="btn-decline-${r.requestId}" style="padding:0.35rem 0.75rem;"><i class="fa fa-times"></i> Decline</button>
                </div>
            `;
            list.appendChild(item);

            document.getElementById(`btn-accept-${r.requestId}`).onclick = async () => {
                try {
                    await SocialService.acceptFriendRequest(r.requestId);
                    toast("Friend request accepted!");
                } catch(e) {
                    toast(e.message);
                }
            };

            document.getElementById(`btn-decline-${r.requestId}`).onclick = async () => {
                try {
                    await SocialService.declineFriendRequest(r.requestId);
                    toast("Request declined.");
                } catch(e) {
                    toast(e.message);
                }
            };
        });
    }

    // --- SEARCH PLAYERS ---
    function bindSearch() {
        const btn = document.getElementById("btn-search-players");
        const inp = document.getElementById("inp-search-players");

        if (btn && inp) {
            btn.onclick = executeSearch;
            inp.addEventListener("keypress", (e) => {
                if (e.key === "Enter") executeSearch();
            });
        }
    }

    async function executeSearch() {
        const val = document.getElementById("inp-search-players").value;
        const grid = document.getElementById("search-players-grid");
        const empty = document.getElementById("search-players-empty");
        const user = AuthService.getCurrentUser();

        if (!grid || !user) return;
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;"><i class="fa fa-spinner fa-spin" style="font-size:2rem;color:var(--accent);"></i></div>`;
        empty.style.display = "none";

        try {
            const players = await SocialService.searchPlayers(val, user.uid);
            grid.innerHTML = "";

            if (players.length === 0) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text2);">No players found matching your query.</div>`;
                return;
            }

            players.forEach(p => {
                const card = document.createElement("div");
                card.className = "friend-card";
                card.innerHTML = `
                    <div class="friend-card-header">
                        <div class="friend-card-avatar">${p.avatar || '👤'}</div>
                        <div class="friend-card-info">
                            <span class="friend-card-name">${p.username}</span>
                            <span class="friend-card-meta">Rating: ${p.rating || 1200}</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" id="btn-add-${p.uid}"><i class="fa fa-user-plus"></i> Add Friend</button>
                `;
                grid.appendChild(card);

                // Add friend event
                document.getElementById(`btn-add-${p.uid}`).onclick = async (e) => {
                    const btnAdd = e.currentTarget;
                    btnAdd.disabled = true;
                    btnAdd.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Sending…`;

                    try {
                        await SocialService.sendFriendRequest(user.uid, p.uid);
                        btnAdd.innerHTML = `<i class="fa fa-check"></i> Sent`;
                        toast(`Friend request sent to ${p.username}!`);
                    } catch(err) {
                        btnAdd.disabled = false;
                        btnAdd.innerHTML = `<i class="fa fa-user-plus"></i> Add Friend`;
                        toast(err.message);
                    }
                };
            });
        } catch(e) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--danger);">${e.message}</div>`;
        }
    }

    // --- RECENT PLAYERS ---
    async function renderRecentPlayers(currentUid) {
        const grid = document.getElementById("recent-players-grid");
        const empty = document.getElementById("recent-players-empty");

        if (!grid) return;
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;"><i class="fa fa-spinner fa-spin" style="font-size:2rem;color:var(--accent);"></i></div>`;
        empty.style.display = "none";

        try {
            const recents = await SocialService.getRecentOpponents(currentUid);
            grid.innerHTML = "";

            if (recents.length === 0) {
                empty.style.display = "block";
                return;
            }
            empty.style.display = "none";

            recents.forEach(p => {
                const card = document.createElement("div");
                card.className = "friend-card";
                card.innerHTML = `
                    <div class="friend-card-header">
                        <div class="friend-card-avatar">${p.avatar || '👤'}</div>
                        <div class="friend-card-info">
                            <span class="friend-card-name">${p.username}</span>
                            <span class="friend-card-meta">Rating: ${p.rating || 1200}</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" id="btn-add-rec-${p.uid}"><i class="fa fa-user-plus"></i> Add Friend</button>
                `;
                grid.appendChild(card);

                // Add friend event
                document.getElementById(`btn-add-rec-${p.uid}`).onclick = async (e) => {
                    const btnAdd = e.currentTarget;
                    btnAdd.disabled = true;
                    btnAdd.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Sending…`;

                    try {
                        await SocialService.sendFriendRequest(currentUid, p.uid);
                        btnAdd.innerHTML = `<i class="fa fa-check"></i> Sent`;
                        toast(`Friend request sent to ${p.username}!`);
                    } catch(err) {
                        btnAdd.disabled = false;
                        btnAdd.innerHTML = `<i class="fa fa-user-plus"></i> Add Friend`;
                        toast(err.message);
                    }
                };
            });
        } catch(e) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--danger);">${e.message}</div>`;
        }
    }

    return { init };

})();
