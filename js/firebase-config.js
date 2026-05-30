import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, set, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// TODO: Firebaseコンソールから取得した設定値に置き換えてください
const firebaseConfig = {
    apiKey: "AIzaSyC7t1vh8zHX3PLf3hRJrQtoTzLv1ubxw0Y",
    authDomain: "toocmm.firebaseapp.com",
    databaseURL: "https://toocmm-default-rtdb.firebaseio.com",
    projectId: "toocmm",
    storageBucket: "toocmm.appspot.com",
    messagingSenderId: "885255739777",
    appId: "1:885255739777:web:45a85aa199a22458b0b080",
    measurementId: "G-M4H0CQ9TG9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { db, auth, provider, signInWithPopup, onAuthStateChanged, signOut, ref, push, onChildAdded, onValue, set, get, serverTimestamp };
