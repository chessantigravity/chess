/* =============================================================
   ANTIGRAVITY CHESS — Firebase Initializer (firebase-init.js)
   Supports Real Firebase & Zero-Config Local Demo Fallback Mode
   ============================================================= */

import { initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import * as FirebaseFirestore from "firebase/firestore";

// PLACEHOLDER CONFIG: Replace with your actual Firebase Project keys
const firebaseConfig = {
    apiKey: "AIzaSyAIs2ZY0AhPBVB-a_tfhiAqV0I3954rTvI",
    authDomain: "chess-16d1a.firebaseapp.com",
    projectId: "chess-16d1a",
    storageBucket: "chess-16d1a.firebasestorage.app",
    messagingSenderId: "249159711925",
    appId: "1:249159711925:web:1dc18604b6ec76191792fc"
};

let app, auth, db;
let isMock = false;

// Check if the user has plugged in actual credentials
const isPlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

if (isPlaceholder) {
    console.warn("Firebase config not set. Falling back to Local Demo Mode (localStorage).");
    isMock = true;
    window.FIREBASE_MOCKED = true;
    
    // Minimal mock DB structure in localStorage
    if (!localStorage.getItem("mock_users")) localStorage.setItem("mock_users", JSON.stringify({}));
    if (!localStorage.getItem("mock_profiles")) localStorage.setItem("mock_profiles", JSON.stringify({}));
} else {
    try {
        app = initializeApp(firebaseConfig);
        auth = FirebaseAuth.getAuth(app);
        db = FirebaseFirestore.getFirestore(app);
        window.FIREBASE_MOCKED = false;
    } catch (e) {
        console.error("Firebase initialization failed, falling back to Mock:", e);
        isMock = true;
        window.FIREBASE_MOCKED = true;
    }
}

/* =============================================================
   MOCK AUTH IMPLEMENTATION (Uses localStorage)
   ============================================================= */
const mockAuth = {
    currentUser: null,
    onAuthStateChangedListeners: [],
    
    onAuthStateChanged(callback) {
        this.onAuthStateChangedListeners.push(callback);
        // Call immediately with current state
        setTimeout(() => callback(this.currentUser), 50);
        return () => {
            this.onAuthStateChangedListeners = this.onAuthStateChangedListeners.filter(l => l !== callback);
        };
    },
    
    triggerStateChange() {
        this.onAuthStateChangedListeners.forEach(listener => listener(this.currentUser));
    }
};

// Check if there was an active persistent session
if (isMock) {
    const savedUser = localStorage.getItem("mock_session_user");
    if (savedUser) {
        mockAuth.currentUser = JSON.parse(savedUser);
    }
}

/* =============================================================
   EXPORTS
   ============================================================= */
export { app, auth, db, isMock };

// Export standard Firebase functions or their local mocks
export async function signInWithEmailAndPassword(authInstance, email, password) {
    if (!isMock) return FirebaseAuth.signInWithEmailAndPassword(authInstance, email, password);
    
    // Mock login logic
    const users = JSON.parse(localStorage.getItem("mock_users"));
    const normalizedEmail = email.trim().toLowerCase();
    
    if (!users[normalizedEmail] || users[normalizedEmail].password !== password) {
        throw { code: "auth/wrong-password", message: "Invalid email or password." };
    }
    
    const user = { uid: users[normalizedEmail].uid, email: normalizedEmail, displayName: users[normalizedEmail].username };
    mockAuth.currentUser = user;
    
    // Handle persistent session (Remember Me)
    const rememberMe = window.APP_REMEMBER_ME === true;
    if (rememberMe) {
        localStorage.setItem("mock_session_user", JSON.stringify(user));
    } else {
        sessionStorage.setItem("mock_session_user", JSON.stringify(user));
    }
    
    mockAuth.triggerStateChange();
    return { user };
}

export async function createUserWithEmailAndPassword(authInstance, email, password) {
    if (!isMock) return FirebaseAuth.createUserWithEmailAndPassword(authInstance, email, password);
    
    // Mock register logic
    const users = JSON.parse(localStorage.getItem("mock_users"));
    const normalizedEmail = email.trim().toLowerCase();
    
    if (users[normalizedEmail]) {
        throw { code: "auth/email-already-in-use", message: "Email is already registered." };
    }
    
    const uid = "mock_" + Math.random().toString(36).substr(2, 9);
    users[normalizedEmail] = { uid, password, username: normalizedEmail.split("@")[0] };
    localStorage.setItem("mock_users", JSON.stringify(users));
    
    const user = { uid, email: normalizedEmail, displayName: users[normalizedEmail].username };
    mockAuth.currentUser = user;
    mockAuth.triggerStateChange();
    return { user };
}

export async function signOut(authInstance) {
    if (!isMock) return FirebaseAuth.signOut(authInstance);
    
    mockAuth.currentUser = null;
    localStorage.removeItem("mock_session_user");
    sessionStorage.removeItem("mock_session_user");
    mockAuth.triggerStateChange();
}

export async function sendPasswordResetEmail(authInstance, email) {
    if (!isMock) return FirebaseAuth.sendPasswordResetEmail(authInstance, email);
    
    const users = JSON.parse(localStorage.getItem("mock_users"));
    const normalizedEmail = email.trim().toLowerCase();
    if (!users[normalizedEmail]) {
        throw { code: "auth/user-not-found", message: "No account matches this email." };
    }
    // Simulation
    console.log("Mock password reset email sent to " + email);
}

export async function setPersistence(authInstance, persistenceType) {
    if (!isMock) return FirebaseAuth.setPersistence(authInstance, persistenceType);
    // Mock persistence handled dynamically during mock login
}

export const browserLocalPersistence = FirebaseAuth.browserLocalPersistence || "local";
export const browserSessionPersistence = FirebaseAuth.browserSessionPersistence || "session";

export function onAuthStateChanged(authInstance, callback) {
    if (!isMock) return FirebaseAuth.onAuthStateChanged(authInstance, callback);
    return mockAuth.onAuthStateChanged(callback);
}

// Check for session in sessionStorage if not in localStorage (when Remember Me is disabled)
if (isMock && !mockAuth.currentUser) {
    const sessionUser = sessionStorage.getItem("mock_session_user");
    if (sessionUser) {
        mockAuth.currentUser = JSON.parse(sessionUser);
    }
}

// Override functions dynamically if mock is active
export const authService = isMock ? mockAuth : null;

/* =============================================================
   MOCK FIRESTORE IMPLEMENTATION (Uses localStorage)
   ============================================================= */
export function doc(dbInstance, collectionPath, docId) {
    if (!isMock) return FirebaseFirestore.doc(dbInstance, collectionPath, docId);
    return { collectionPath, docId };
}

export async function getDoc(docRef) {
    if (!isMock) return FirebaseFirestore.getDoc(docRef);
    
    const profiles = JSON.parse(localStorage.getItem("mock_profiles"));
    const data = profiles[docRef.docId] || null;
    return {
        exists: () => data !== null,
        data: () => data
    };
}

export async function setDoc(docRef, data, options = {}) {
    if (!isMock) return FirebaseFirestore.setDoc(docRef, data, options);
    
    const profiles = JSON.parse(localStorage.getItem("mock_profiles"));
    if (options.merge && profiles[docRef.docId]) {
        profiles[docRef.docId] = { ...profiles[docRef.docId], ...data };
    } else {
        profiles[docRef.docId] = data;
    }
    localStorage.setItem("mock_profiles", JSON.stringify(profiles));
}

export async function updateDoc(docRef, data) {
    if (!isMock) return FirebaseFirestore.updateDoc(docRef, data);
    
    const profiles = JSON.parse(localStorage.getItem("mock_profiles"));
    if (profiles[docRef.docId]) {
        profiles[docRef.docId] = { ...profiles[docRef.docId], ...data };
        localStorage.setItem("mock_profiles", JSON.stringify(profiles));
    } else {
        throw new Error("Document does not exist");
    }
}
