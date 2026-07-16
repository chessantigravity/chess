/* =============================================================
   CHESS — Social & Friends Service (social-service.js)
   Handles friends list, requests, search, notifications, & stats
   ============================================================= */

import {
    db,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot
} from "./firebase-init.js";

export const SocialService = {
    // Generate unique alphabetical key for friend pair
    getFriendKey(uidA, uidB) {
        return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
    },

    // Check if two users are already friends
    async areFriends(uidA, uidB) {
        const key = this.getFriendKey(uidA, uidB);
        const docRef = doc(db, "friends", key);
        const snap = await getDoc(docRef);
        return snap.exists();
    },

    // Send a friend request
    async sendFriendRequest(senderUid, receiverUid) {
        if (senderUid === receiverUid) {
            throw new Error("You cannot send a friend request to yourself.");
        }

        // Check if already friends
        const alreadyFriends = await this.areFriends(senderUid, receiverUid);
        if (alreadyFriends) {
            throw new Error("You are already friends with this player.");
        }

        // Check if request already exists (either direction)
        const reqKey1 = `${senderUid}_${receiverUid}`;
        const reqKey2 = `${receiverUid}_${senderUid}`;

        const snap1 = await getDoc(doc(db, "friendRequests", reqKey1));
        const snap2 = await getDoc(doc(db, "friendRequests", reqKey2));

        if (snap1.exists() && snap1.data().status === "pending") {
            throw new Error("Friend request already sent.");
        }
        if (snap2.exists() && snap2.data().status === "pending") {
            throw new Error("This player has already sent you a request.");
        }

        // Fetch profiles for caching usernames/avatars
        const senderProfileSnap = await getDoc(doc(db, "users", senderUid));
        const receiverProfileSnap = await getDoc(doc(db, "users", receiverUid));

        const senderData = senderProfileSnap.exists() ? senderProfileSnap.data() : { username: "Player" };
        const receiverData = receiverProfileSnap.exists() ? receiverProfileSnap.data() : { username: "Player" };

        const requestDocRef = doc(db, "friendRequests", reqKey1);
        await setDoc(requestDocRef, {
            requestId: reqKey1,
            senderUid,
            senderUsername: senderData.username,
            senderAvatar: senderData.avatar || "👤",
            receiverUid,
            receiverUsername: receiverData.username,
            receiverAvatar: receiverData.avatar || "👤",
            status: "pending",
            timestamp: Date.now()
        });

        // Add Notification
        const notificationRef = doc(collection(db, "notifications"));
        await setDoc(notificationRef, {
            notificationId: notificationRef.id || "notif_" + Math.random().toString(36).substr(2, 9),
            userId: receiverUid,
            type: "request_new",
            senderUid,
            senderUsername: senderData.username,
            text: `sent you a friend request.`,
            read: false,
            timestamp: Date.now()
        });
    },

    // Accept friend request
    async acceptFriendRequest(requestId) {
        const reqRef = doc(db, "friendRequests", requestId);
        const reqSnap = await getDoc(reqRef);
        if (!reqSnap.exists()) throw new Error("Friend request not found.");

        const req = reqSnap.data();
        await updateDoc(reqRef, { status: "accepted" });

        // Create Friend relation record
        const key = this.getFriendKey(req.senderUid, req.receiverUid);
        const friendRef = doc(db, "friends", key);
        await setDoc(friendRef, {
            friendId: key,
            uids: [req.senderUid, req.receiverUid],
            uidA: req.senderUid,
            uidB: req.receiverUid,
            usernameA: req.senderUsername,
            usernameB: req.receiverUsername,
            avatarA: req.senderAvatar,
            avatarB: req.receiverAvatar,
            gamesPlayed: 0,
            winsA: 0,
            winsB: 0,
            draws: 0,
            lastMatchDate: "",
            timestamp: Date.now()
        });

        // Add Notification
        const notificationRef = doc(collection(db, "notifications"));
        await setDoc(notificationRef, {
            notificationId: notificationRef.id || "notif_" + Math.random().toString(36).substr(2, 9),
            userId: req.senderUid,
            type: "request_accepted",
            senderUid: req.receiverUid,
            senderUsername: req.receiverUsername,
            text: `accepted your friend request.`,
            read: false,
            timestamp: Date.now()
        });

        // Cleanup request document
        await deleteDoc(reqRef);
    },

    // Decline / Ignore request
    async declineFriendRequest(requestId) {
        const reqRef = doc(db, "friendRequests", requestId);
        await deleteDoc(reqRef);
    },

    // Cancel friend request
    async cancelFriendRequest(requestId) {
        const reqRef = doc(db, "friendRequests", requestId);
        await deleteDoc(reqRef);
    },

    // Remove friend
    async removeFriend(uidA, uidB) {
        const key = this.getFriendKey(uidA, uidB);
        await deleteDoc(doc(db, "friends", key));

        // Clean up any old requests
        await deleteDoc(doc(db, "friendRequests", `${uidA}_${uidB}`)).catch(() => {});
        await deleteDoc(doc(db, "friendRequests", `${uidB}_${uidA}`)).catch(() => {});

        // Fetch sender name for notification
        const userProfile = await getDoc(doc(db, "users", uidA));
        const username = userProfile.exists() ? userProfile.data().username : "A player";

        // Notify other user
        const notificationRef = doc(collection(db, "notifications"));
        await setDoc(notificationRef, {
            notificationId: notificationRef.id || "notif_" + Math.random().toString(36).substr(2, 9),
            userId: uidB,
            type: "friend_removed",
            senderUid: uidA,
            senderUsername: username,
            text: `removed you from their friends list.`,
            read: false,
            timestamp: Date.now()
        });
    },

    // Search players by username or display name
    async searchPlayers(queryText, currentUid) {
        if (!queryText || queryText.trim().length === 0) return [];
        const cleanQuery = queryText.trim().toLowerCase();

        const q = query(collection(db, "users"));
        const snapshot = await getDocs(q);
        const results = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.uid !== currentUid) {
                const uMatch = data.username && data.username.toLowerCase().includes(cleanQuery);
                const dMatch = data.displayName && data.displayName.toLowerCase().includes(cleanQuery);
                const emailMatch = data.email && data.email.toLowerCase().includes(cleanQuery);

                if (uMatch || dMatch || emailMatch) {
                    results.push(data);
                }
            }
        });

        return results.slice(0, 15); // limit to 15 results
    },

    // Get recently played opponents from Match History
    async getRecentOpponents(uid) {
        const matchHistoryRef = collection(db, `users/${uid}/matches`);
        const snapshot = await getDocs(matchHistoryRef);
        const names = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.opponentType === "Human" && data.opponent) {
                // Opponent name can contain ELO, strip it: "Username (1200)" -> "Username"
                const cleanName = data.opponent.split(" (")[0].trim();
                names.add(cleanName);
            }
        });

        // Search profiles of these opponents to return complete details
        const recents = [];
        if (names.size > 0) {
            const usersRef = collection(db, "users");
            const userSnap = await getDocs(usersRef);
            userSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (names.has(data.username) && data.uid !== uid) {
                    recents.push(data);
                }
            });
        }
        return recents.slice(0, 5); // top 5 recent human opponents
    },

    // Listen to Friends list
    listenToFriends(uid, callback) {
        const q = query(
            collection(db, "friends"),
            where("uids", "array-contains", uid)
        );
        return onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
                list.push(docSnap.data());
            });
            callback(list);
        });
    },

    // Listen to incoming friend requests
    listenToIncomingRequests(uid, callback) {
        const q = query(
            collection(db, "friendRequests"),
            where("receiverUid", "==", uid),
            where("status", "==", "pending")
        );
        return onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
                list.push(docSnap.data());
            });
            callback(list);
        });
    },

    // Listen to unread notifications
    listenToNotifications(uid, callback) {
        const q = query(
            collection(db, "notifications"),
            where("userId", "==", uid),
            where("read", "==", false)
        );
        return onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
                list.push(docSnap.data());
            });
            callback(list);
        });
    },

    // Mark notifications as read
    async markNotificationsAsRead(uid) {
        const q = query(
            collection(db, "notifications"),
            where("userId", "==", uid),
            where("read", "==", false)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (docSnap) => {
            const docRef = doc(db, "notifications", docSnap.id);
            await updateDoc(docRef, { read: true });
        });
    },

    // Get specific matches played against a friend
    async getMatchesWithFriend(uid, friendUsername) {
        const matchHistoryRef = collection(db, `users/${uid}/matches`);
        const snapshot = await getDocs(matchHistoryRef);
        const matches = [];
        let wins = 0;
        let losses = 0;
        let draws = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.opponent) {
                const oppName = data.opponent.split(" (")[0].trim();
                if (oppName === friendUsername) {
                    matches.push(data);
                    if (data.result === "win") wins++;
                    else if (data.result === "loss") losses++;
                    else if (data.result === "draw") draws++;
                }
            }
        });

        return { matches, wins, losses, draws };
    }
};
