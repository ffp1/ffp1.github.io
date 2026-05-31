import { db, auth, provider, signInWithPopup, onAuthStateChanged, signOut, ref, onValue, set, get, update, serverTimestamp } from './firebase-config.js';

let currentUserInfo = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login_overlay');
    const mainApp = document.getElementById('main_app');
    const loginBtn = document.getElementById('login_btn');
    const logoutBtn = document.getElementById('logout_btn');

    const myName = document.getElementById('my_name');
    const myIcon = document.getElementById('my_icon');
    const myBio = document.getElementById('my_bio');

    const friendsContainer = document.getElementById('friends_container');
    const talkContainer = document.getElementById('talk_container');

    const templateFriend = document.getElementById('template_friend').content;
    const templateTalkroom = document.getElementById('template_talkroom').content;

    // ナビバー関連
    const tabTop = document.getElementById('tab_top');
    const tabTalk = document.getElementById('tab_talk');
    const navHome = document.getElementById('nav_home');
    const navTalk = document.getElementById('nav_talk');
    const navbar = document.querySelector('aside.navbar');

    // モーダル関連
    const modalProfile = document.getElementById('modal_profile');
    const modalAddFriend = document.getElementById('modal_add_friend');

    // ===========================
    // ナビバー切替ロジック
    // ===========================
    const switchTab = (tab) => {
        if (tab === 'home') {
            tabTop.classList.add('active');
            tabTalk.classList.remove('active');
            navHome.classList.add('active');
            navTalk.classList.remove('active');
            navbar.className = 'navbar nav-home';
        } else {
            tabTop.classList.remove('active');
            tabTalk.classList.add('active');
            navHome.classList.remove('active');
            navTalk.classList.add('active');
            navbar.className = 'navbar nav-talk';
        }
    };

    navHome.addEventListener('click', () => switchTab('home'));
    navTalk.addEventListener('click', () => switchTab('talk'));
    // 初期状態
    switchTab('home');

    // ===========================
    // ログイン処理
    // ===========================
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch(error => {
            console.error("ログインエラー:", error);
            alert("ログインに失敗しました: " + error.message);
        });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch(error => {
            console.error("ログアウトエラー:", error);
        });
    });

    // ===========================
    // 認証状態の監視
    // ===========================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';

            currentUserInfo = {
                uid: user.uid,
                displayName: user.displayName || '名無し',
                photoURL: user.photoURL || 'img/icon(temp).jpg'
            };

            // DB からプロフィールを取得（bio, toocId, カスタム photoURL など）
            get(ref(db, `users/${user.uid}`)).then((snap) => {
                if (snap.exists()) {
                    const saved = snap.val();
                    currentUserInfo.displayName = saved.displayName || currentUserInfo.displayName;
                    currentUserInfo.photoURL = saved.photoURL || currentUserInfo.photoURL;
                    currentUserInfo.bio = saved.bio || '';
                    currentUserInfo.toocId = saved.toocId || '';
                }

                // UIに表示
                myName.textContent = currentUserInfo.displayName;
                myIcon.src = currentUserInfo.photoURL;
                myBio.textContent = currentUserInfo.bio || '...';

                // DBに基本情報を保存（既存データを壊さないようupdateで）
                update(ref(db, `users/${user.uid}`), {
                    uid: user.uid,
                    displayName: currentUserInfo.displayName,
                    photoURL: currentUserInfo.photoURL
                });

                // データ取得開始
                loadFriends();
                loadTalkRooms();
            });
        } else {
            loginOverlay.style.display = 'flex';
            mainApp.style.display = 'none';
            currentUserInfo = null;
        }
    });

    // ===========================
    // ナビ・ルームID生成ユーティリティ
    // ===========================
    const getPrivateRoomId = (uid1, uid2) => {
        return [uid1, uid2].sort().join('_');
    };

    // ===========================
    // 友だちリストの読み込み
    // ===========================
    const loadFriends = () => {
        // まず自分のfriendsノードを監視
        const myFriendsRef = ref(db, `users/${currentUserInfo.uid}/friends`);
        onValue(myFriendsRef, (friendsSnap) => {
            const friendsData = friendsSnap.val();
            friendsContainer.innerHTML = '';

            if (!friendsData) {
                // 友だちが0人の場合
                friendsContainer.innerHTML = '<p style="padding: 1rem; font-family: \'LINE Seed JP\', sans-serif; color: #999; font-size: 0.9rem;">友だちがまだいません。toocIDで友だちを追加しましょう。</p>';
                return;
            }

            // 友だちのUIDリストを取得
            const friendUids = Object.keys(friendsData);

            friendUids.forEach(friendUid => {
                get(ref(db, `users/${friendUid}`)).then((userSnap) => {
                    if (!userSnap.exists()) return;
                    const userData = userSnap.val();
                    const node = document.importNode(templateFriend, true);

                    node.querySelector('.friend_name').textContent = userData.displayName;
                    node.querySelector('.friend_icon_img').src = userData.photoURL || 'img/icon(temp).jpg';

                    // 最新メッセージを取得して表示
                    const roomId = getPrivateRoomId(currentUserInfo.uid, friendUid);
                    get(ref(db, `rooms/${roomId}/messages`)).then((msgSnap) => {
                        const msgs = msgSnap.val();
                        const latestMsgEl = node.querySelector('.friend_latest_msg');
                        if (msgs) {
                            const keys = Object.keys(msgs);
                            const last = msgs[keys[keys.length - 1]];
                            if (last.type === 'image') {
                                latestMsgEl.textContent = '📷 画像';
                            } else {
                                latestMsgEl.textContent = last.text || '';
                            }
                        } else {
                            latestMsgEl.textContent = 'タップしてトークを開始';
                        }
                    });

                    // タップでトークルームへ遷移
                    const friendElement = node.querySelector('.friends_friend');
                    friendElement.style.cursor = 'pointer';
                    friendElement.addEventListener('click', () => {
                        const roomId = getPrivateRoomId(currentUserInfo.uid, friendUid);
                        const params = new URLSearchParams({
                            room: roomId,
                            targetName: userData.displayName,
                            targetIcon: userData.photoURL || ''
                        });
                        window.location.href = `talkroom/index.html?${params.toString()}`;
                    });

                    friendsContainer.appendChild(node);
                });
            });
        });
    };

    // ===========================
    // トークルーム一覧の読み込み
    // ===========================
    const loadTalkRooms = () => {
        const roomsRef = ref(db, 'rooms');
        onValue(roomsRef, (snapshot) => {
            const roomsData = snapshot.val();
            talkContainer.innerHTML = '';

            // 自分用メモルームを先頭に固定表示
            appendMemoRoom();

            if (!roomsData) return;

            Object.keys(roomsData).forEach(roomId => {
                if (!roomId.includes(currentUserInfo.uid)) return;
                if (roomId === `memo_${currentUserInfo.uid}`) return;

                const room = roomsData[roomId];
                const messages = room.messages || {};
                const messageIds = Object.keys(messages);
                if (messageIds.length === 0) return;

                const lastMessage = messages[messageIds[messageIds.length - 1]];

                const uids = roomId.split('_');
                const targetUid = uids[0] === currentUserInfo.uid ? uids[1] : uids[0];

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
                    if (lastMessage.type === 'image') {
                        node.querySelector('.talkroom_infomessage').textContent = '📷 画像';
                    } else {
                        node.querySelector('.talkroom_infomessage').textContent = lastMessage.text;
                    }
                    node.querySelector('.room_icon_img').src = targetIcon;

                    if (lastMessage.timestamp) {
                        const date = new Date(lastMessage.timestamp);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        node.querySelector('.talkroom_notitime').textContent = `${hours}:${minutes}`;
                    }

                    const talkElement = node.querySelector('.talk_talkroom');
                    talkElement.style.cursor = 'pointer';
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

    // 自分用のメモルーム（Keep）
    const appendMemoRoom = () => {
        const memoRoomId = `memo_${currentUserInfo.uid}`;
        const node = document.importNode(templateTalkroom, true);
        node.querySelector('.talkroom_infoname').textContent = "Keep (自分用のメモ)";
        node.querySelector('.talkroom_infomessage').textContent = "タップしてメモを開く";
        node.querySelector('.room_icon_img').src = currentUserInfo.photoURL;

        get(ref(db, `rooms/${memoRoomId}/messages`)).then((snapshot) => {
            const messages = snapshot.val();
            if (messages) {
                const messageIds = Object.keys(messages);
                if (messageIds.length > 0) {
                    const lastMessage = messages[messageIds[messageIds.length - 1]];
                    if (lastMessage.type === 'image') {
                        node.querySelector('.talkroom_infomessage').textContent = '📷 画像';
                    } else {
                        node.querySelector('.talkroom_infomessage').textContent = lastMessage.text;
                    }
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
        talkElement.style.cursor = 'pointer';
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

    // ===========================
    // プロフィール編集モーダル
    // ===========================
    const editIconPreview = document.getElementById('edit_icon_preview');
    const editIconInput = document.getElementById('edit_icon_input');
    const editNameInput = document.getElementById('edit_name_input');
    const editBioInput = document.getElementById('edit_bio_input');
    const editToocidInput = document.getElementById('edit_toocid_input');
    const currentToocid = document.getElementById('current_toocid');
    let pendingIconBase64 = null;

    // プロフィール編集モーダルを開く
    const openProfileModal = () => {
        if (!currentUserInfo) return;
        editIconPreview.src = currentUserInfo.photoURL;
        editNameInput.value = currentUserInfo.displayName;
        editBioInput.value = currentUserInfo.bio || '';
        editToocidInput.value = '';
        currentToocid.textContent = currentUserInfo.toocId ? `現在のtoocID: ${currentUserInfo.toocId}` : '未設定';
        pendingIconBase64 = null;
        modalProfile.style.display = 'flex';
    };

    document.getElementById('btn_edit_profile').addEventListener('click', openProfileModal);
    document.getElementById('btn_open_profile_edit').addEventListener('click', openProfileModal);
    document.getElementById('modal_profile_close').addEventListener('click', () => {
        modalProfile.style.display = 'none';
    });
    modalProfile.addEventListener('click', (e) => {
        if (e.target === modalProfile) modalProfile.style.display = 'none';
    });

    // アイコン画像変更
    editIconInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // リサイズしてBase64に変換（最大120px, JPEG 60%品質）
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 120;
                let w = img.width, h = img.height;
                if (w > h) { h = (MAX * h) / w; w = MAX; }
                else { w = (MAX * w) / h; h = MAX; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                pendingIconBase64 = canvas.toDataURL('image/jpeg', 0.6);
                editIconPreview.src = pendingIconBase64;
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // toocID設定
    document.getElementById('btn_set_toocid').addEventListener('click', async () => {
        const newId = editToocidInput.value.trim();
        if (!newId) { alert('IDを入力してください'); return; }
        if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(newId)) {
            alert('toocIDは半角英数字とアンダースコア、ドット、ハイフンのみ（3～20文字）で入力してください');
            return;
        }

        // 重複チェック
        const existing = await get(ref(db, `toocIds/${newId}`));
        if (existing.exists() && existing.val() !== currentUserInfo.uid) {
            alert('このIDは既に使用されています');
            return;
        }

        // 旧IDの削除
        if (currentUserInfo.toocId) {
            await set(ref(db, `toocIds/${currentUserInfo.toocId}`), null);
        }

        // 新IDの設定
        await set(ref(db, `toocIds/${newId}`), currentUserInfo.uid);
        await update(ref(db, `users/${currentUserInfo.uid}`), { toocId: newId });
        currentUserInfo.toocId = newId;
        currentToocid.textContent = `現在のtoocID: ${newId}`;
        editToocidInput.value = '';
        alert('toocIDを設定しました！');
    });

    // プロフィール保存
    document.getElementById('btn_save_profile').addEventListener('click', async () => {
        const newName = editNameInput.value.trim() || currentUserInfo.displayName;
        const newBio = editBioInput.value.trim();
        const updates = {
            displayName: newName,
            bio: newBio
        };
        if (pendingIconBase64) {
            updates.photoURL = pendingIconBase64;
            currentUserInfo.photoURL = pendingIconBase64;
        }
        currentUserInfo.displayName = newName;
        currentUserInfo.bio = newBio;

        await update(ref(db, `users/${currentUserInfo.uid}`), updates);

        myName.textContent = newName;
        myBio.textContent = newBio || '...';
        myIcon.src = currentUserInfo.photoURL;

        modalProfile.style.display = 'none';
        alert('プロフィールを保存しました！');
    });

    // ===========================
    // 友だち追加モーダル（toocID検索）
    // ===========================
    document.getElementById('btn_add_by_toocid').addEventListener('click', () => {
        modalAddFriend.style.display = 'flex';
        document.getElementById('search_result').innerHTML = '';
        document.getElementById('search_toocid_input').value = '';
    });
    document.getElementById('btn_open_add_friend').addEventListener('click', () => {
        modalAddFriend.style.display = 'flex';
        document.getElementById('search_result').innerHTML = '';
        document.getElementById('search_toocid_input').value = '';
    });
    document.getElementById('modal_add_friend_close').addEventListener('click', () => {
        modalAddFriend.style.display = 'none';
    });
    modalAddFriend.addEventListener('click', (e) => {
        if (e.target === modalAddFriend) modalAddFriend.style.display = 'none';
    });

    document.getElementById('btn_search_toocid').addEventListener('click', async () => {
        const searchId = document.getElementById('search_toocid_input').value.trim();
        const resultDiv = document.getElementById('search_result');
        resultDiv.innerHTML = '';

        if (!searchId) { alert('IDを入力してください'); return; }

        // toocIds/{id} → uid を取得
        const snap = await get(ref(db, `toocIds/${searchId}`));
        if (!snap.exists()) {
            resultDiv.innerHTML = '<p style="font-family: \'LINE Seed JP\', sans-serif; color: #999; text-align: center;">ユーザーが見つかりません</p>';
            return;
        }

        const foundUid = snap.val();
        if (foundUid === currentUserInfo.uid) {
            resultDiv.innerHTML = '<p style="font-family: \'LINE Seed JP\', sans-serif; color: #999; text-align: center;">自分自身のIDです</p>';
            return;
        }

        // ユーザー情報を取得
        const userSnap = await get(ref(db, `users/${foundUid}`));
        if (!userSnap.exists()) {
            resultDiv.innerHTML = '<p style="font-family: \'LINE Seed JP\', sans-serif; color: #999; text-align: center;">ユーザーが見つかりません</p>';
            return;
        }

        const foundUser = userSnap.val();

        // 既に友だちか確認
        const friendSnap = await get(ref(db, `users/${currentUserInfo.uid}/friends/${foundUid}`));
        const isAlreadyFriend = friendSnap.exists();

        const item = document.createElement('div');
        item.className = 'search_result_item';
        item.innerHTML = `
            <img src="${foundUser.photoURL || 'img/icon(temp).jpg'}" alt="">
            <div class="result_info">
                <p>${foundUser.displayName}</p>
                <p>@${searchId}</p>
            </div>
            <button class="btn_do_add_friend">${isAlreadyFriend ? '追加済み' : '追加'}</button>
        `;

        if (!isAlreadyFriend) {
            item.querySelector('.btn_do_add_friend').addEventListener('click', async () => {
                // 双方のfriendsに追加
                await set(ref(db, `users/${currentUserInfo.uid}/friends/${foundUid}`), true);
                await set(ref(db, `users/${foundUid}/friends/${currentUserInfo.uid}`), true);
                item.querySelector('.btn_do_add_friend').textContent = '追加済み';
                item.querySelector('.btn_do_add_friend').disabled = true;
                alert(`${foundUser.displayName} を友だちに追加しました！`);
            });
        } else {
            item.querySelector('.btn_do_add_friend').disabled = true;
            item.querySelector('.btn_do_add_friend').style.background = '#ccc';
        }

        resultDiv.appendChild(item);
    });

});
