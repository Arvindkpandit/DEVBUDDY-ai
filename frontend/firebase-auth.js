import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// =========================================
// FIREBASE CONFIG
// =========================================

const firebaseConfig = {
    apiKey: "AIzaSyCcDTK3TeDr-9ZFM8BwbeTRYMrD9jbTcA0",
    authDomain: "devbuddy-902da.firebaseapp.com",
    projectId: "devbuddy-902da",
    storageBucket: "devbuddy-902da.firebasestorage.app",
    messagingSenderId: "251530451365",
    appId: "1:251530451365:web:53c776d8ab69513c02b04c",
    measurementId: "G-XD3XRETLWR"
};

// =========================================
// INITIALIZE FIREBASE
// =========================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider();

// =========================================
// DOM ELEMENTS
// =========================================

const loginBtn = document.getElementById("loginBtn");

const loginOverlay = document.getElementById("loginOverlay");

const mainWebsite = document.getElementById("mainWebsite");

// =========================================
// CHECK LOGIN ON PAGE LOAD
// =========================================

const existingToken = localStorage.getItem("token");

if (existingToken) {

    showWebsite();

} else {

    showLogin();
}

// =========================================
// LOGIN BUTTON
// =========================================

if (loginBtn) {

    loginBtn.addEventListener("click", async () => {

        try {

            const result = await signInWithPopup(auth, provider);

            const token = await result.user.getIdToken();

            localStorage.setItem("token", token);

            console.log("Firebase token saved.");

            // SHOW WEBSITE AFTER LOGIN
            showWebsite();

        } catch (err) {

            console.error(err);

            alert("Login failed.");
        }
    });
}

// =========================================
// SHOW WEBSITE
// =========================================

function showWebsite() {

    if (loginOverlay) {
        loginOverlay.style.display = "none";
    }

    if (mainWebsite) {
        mainWebsite.style.display = "block";
    }
}

// =========================================
// SHOW LOGIN
// =========================================

function showLogin() {

    if (loginOverlay) {
        loginOverlay.style.display = "flex";
    }

    if (mainWebsite) {
        mainWebsite.style.display = "none";
    }
}

// Logout Button

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", () => {

        localStorage.removeItem("token");

        location.reload();

    });

}