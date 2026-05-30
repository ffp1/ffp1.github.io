import { db, auth, provider, signInWithPopup, onAuthStateChanged, signOut, ref, onValue, set, get } from './firebase-config.js';

let currentUserInfo = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login_overlay');
    const mainApp = document.getElementById('main_app');
    const loginBtn = document.getElementById('login_btn');
    const logoutBtn = document.getElementById('logout_btn');
    
    const myName = document.getElementById('my_name');
    const myIcon = document.getElementById('my_icon');
    
    const friendsContainer = document.getElementById('friends_container');
    const talkContainer = document.getElementById('talk_container');
    
    const templateFriend = document.getElementById('template_friend').content;
    const templateTalkroom = document.getElementById('template_talkroom').content;

    // --- ログイン処理 ---
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch(error => {
            console.error("ログインエラー:", error);
            alert("ログインに失敗しました。");
        });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch(error => {
            console.error("ログアウトエラー:", error);
        });
    });

    // --- 認証状態の監視 ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // ログイン済みの表示切替
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            
            currentUserInfo = {
                uid: user.uid,
                displayName: user.displayName || '名無し',
                photoURL: user.photoURL || 'img/icon(temp).jpg'
            };

            // 画面上部に自分の情報を表示
            myName.textContent = currentUserInfo.displayName;
            myIcon.src = currentUserInfo.photoURL;

            // データベースに自分の情報を保存（更新）
            set(ref(db, `users/${user.uid}`), currentUserInfo);

            // データ取得開始
            loadFriends();
            loadTalkRooms();
        } else {
            // 未ログインの表示切替
            loginOverlay.style.display = 'flex';
            mainApp.style.display = 'none';
            currentUserInfo = null;
        }
    });

    // 1対1のルームIDを生成する関数（UIDをソートして結合）
    const getPrivateRoomId = (uid1, uid2) => {
        return [uid1, uid2].sort().join('_');
    };

    // --- 友だちリストの読み込み ---
    const loadFriends = () => {
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            const usersData = snapshot.val();
            friendsContainer.innerHTML = ''; // リストをクリア

            if (!usersData) return;

            Object.keys(usersData).forEach(uid => {
                if (uid === currentUserInfo.uid) return; // 自分は除外

                const userData = usersData[uid];
                const node = document.importNode(templateFriend, true);
                
                node.querySelector('.friend_name').textContent = userData.displayName;
                node.querySelector('.friend_icon_img').src = userData.photoURL || 'img/icon(temp).jpg';

                // タップでトークルームへ遷移
                const friendElement = node.querySelector('.friends_friend');
                friendElement.addEventListener('click', () => {
                    const roomId = getPrivateRoomId(currentUserInfo.uid, uid);
                    // 名前とアイコンをクエリパラメータで渡してトーク画面で表示しやすくする
                    const params = new URLSearchParams({
                        room: roomId,
                        targetName: userData.displayName,
                        targetIcon: userData.photoURL
                    });
                    window.location.href = `talkroom/index.html?${params.toString()}`;
                });

                friendsContainer.appendChild(node);
            });
        });
    };

    // --- トークルーム一覧の読み込み ---
    const loadTalkRooms = () => {
        const roomsRef = ref(db, 'rooms');
        onValue(roomsRef, (snapshot) => {
            const roomsData = snapshot.val();
            talkContainer.innerHTML = ''; // リストをクリア

            // 自分用メモルームを先頭に固定表示
            appendMemoRoom();

            if (!roomsData) return;

            // 自分が関係するルーム（ルームIDに自分のUIDが含まれるもの）を抽出
            Object.keys(roomsData).forEach(roomId => {
                // ルームIDに自分のUIDが含まれていない場合はスキップ
                if (!roomId.includes(currentUserInfo.uid)) return;
                // メモルームの場合はスキップ（すでに固定表示しているため）
                if (roomId === `memo_${currentUserInfo.uid}`) return;

                const room = roomsData[roomId];
                const messages = room.messages || {};
                const messageIds = Object.keys(messages);
                if (messageIds.length === 0) return;
                
                const lastMessage = messages[messageIds[messageIds.length - 1]];
                
                // 相手のUIDを特定
                const uids = roomId.split('_');
                const targetUid = uids[0] === currentUserInfo.uid ? uids[1] : uids[0];

                // 相手の情報を取得（非同期）
                get(ref(db, `users/${targetUid}`)).then((userSnap) => {
                    let targetName = "不明なユーザー";
                    let targetIcon = "img/icon(temp).jpg";
                    if (userSnap.exists()) {
                        const targetUser = userSnap.val();
                        targetName = targetUser.displayName;
                        targetIcon = targetUser.photoURL;
                    }

                    const node = document.importNode(templateTalkroom, true);
                    node.querySelector('.talkroom_infoname').textContent = targetName;
                    node.querySelector('.talkroom_infomessage').textContent = lastMessage.text;
                    node.querySelector('.room_icon_img').src = targetIcon;

                    if (lastMessage.timestamp) {
                        const date = new Date(lastMessage.timestamp);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        node.querySelector('.talkroom_notitime').textContent = `${hours}:${minutes}`;
                    }

                    const talkElement = node.querySelector('.talk_talkroom');
                    talkElement.addEventListener('click', () => {
                        const params = new URLSearchParams({
                            room: roomId,
                            targetName: targetName,
                            targetIcon: targetIcon
                        });
                        window.location.href = `talkroom/index.html?${params.toString()}`;
                    });

                    talkContainer.appendChild(node);
                });
            });
        });
    };

    // 自分用のメモルーム（Keep）を表示する処理
    const appendMemoRoom = () => {
        const memoRoomId = `memo_${currentUserInfo.uid}`;
        const node = document.importNode(templateTalkroom, true);
        node.querySelector('.talkroom_infoname').textContent = "Keep (自分用のメモ)";
        node.querySelector('.talkroom_infomessage').textContent = "タップしてメモを開く";
        node.querySelector('.room_icon_img').src = currentUserInfo.photoURL; // 自分のアイコン
        
        // メモルームの最新メッセージを取得して表示
        get(ref(db, `rooms/${memoRoomId}/messages`)).then((snapshot) => {
            const messages = snapshot.val();
            if (messages) {
                const messageIds = Object.keys(messages);
                if (messageIds.length > 0) {
                    const lastMessage = messages[messageIds[messageIds.length - 1]];
                    node.querySelector('.talkroom_infomessage').textContent = lastMessage.text;
                    if (lastMessage.timestamp) {
                        const date = new Date(lastMessage.timestamp);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        node.querySelector('.talkroom_notitime').textContent = `${hours}:${minutes}`;
                    }
                }
            }
        });

        const talkElement = node.querySelector('.talk_talkroom');
        talkElement.addEventListener('click', () => {
            const params = new URLSearchParams({
                room: memoRoomId,
                targetName: "Keepメモ",
                targetIcon: currentUserInfo.photoURL
            });
            window.location.href = `talkroom/index.html?${params.toString()}`;
        });
        talkContainer.appendChild(node);
    };

});
