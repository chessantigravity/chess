/* =============================================================
   ANTIGRAVITY CHESS — Auth Service (auth-service.js)
   Modular interface wrapping Firebase Authentication APIs
   ============================================================= */

import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged
} from "./firebase-init.js";

import { createUserProfile } from "./db-service.js";
import { sendWelcomeEmail } from "./email-service.js";

// Session guest mode flag
let isGuestModeActive = false;

export const AuthService = {
    // Watch user changes
    onAuthStateChanged(callback) {
        return onAuthStateChanged(auth, (user) => {
            if (user) {
                isGuestModeActive = false; // Disable guest mode if logged in
            }
            callback(user, isGuestModeActive);
        });
    },

    // Sign Up
    async signUp(email, password, username) {
        if (!email || !password || !username) {
            throw new Error("All fields are required.");
        }
        
        // Create Authentication account
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const user = credential.user;
        
        // Generate corresponding Firestore profile
        await createUserProfile(user.uid, {
            username: username.trim(),
            email: email.trim().toLowerCase()
        });

        // Trigger welcome email asynchronously (fails gracefully internally)
        sendWelcomeEmail(email.trim().toLowerCase(), username.trim());
        
        return user;
    },

    // Login
    async login(email, password, rememberMe) {
        if (!email || !password) {
            throw new Error("Email and password are required.");
        }
        
        // Configure Remember Me persistence
        const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        
        // For mock auth, store rememberMe on window so it knows which storage to use
        window.APP_REMEMBER_ME = rememberMe;
        
        await setPersistence(auth, persistence);
        
        // Authenticate user
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return credential.user;
    },

    // Logout
    async logout() {
        await signOut(auth);
        isGuestModeActive = false;
    },

    // Forgot Password
    async forgotPassword(email) {
        if (!email) throw new Error("Email address is required.");
        await sendPasswordResetEmail(auth, email.trim());
    },

    // Guest Mode Activator
    enableGuestMode() {
        isGuestModeActive = true;
        // Trigger a fake auth state change to notify UI
        if (window.authUIUpdate) window.authUIUpdate(null, true);
    },

    // Check if guest mode is active
    isGuest() {
        return isGuestModeActive;
    },

    // Get active user object
    getCurrentUser() {
        return auth.currentUser;
    }
};
