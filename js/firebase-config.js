import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// 簡易的なユーザー管理（ローカルストレージ）
const getLocalUser = () => {
    let userId = localStorage.getItem('tooc_user_id');
    let userName = localStorage.getItem('tooc_user_name');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        userName = prompt("あなたの名前を入力してください", "ゲスト") || "匿名ユーザー";
        localStorage.setItem('tooc_user_id', userId);
        localStorage.setItem('tooc_user_name', userName);
    }
    return { id: userId, name: userName };
};

const currentUser = getLocalUser();

export { db, ref, push, onChildAdded, onValue, serverTimestamp, currentUser };
