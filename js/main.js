import { db, auth, provider, signInWithPopup, onAuthStateChanged, signOut, ref, onValue, set, get, update, serverTimestamp } from './firebase-config.js';
import { openTalkRoom } from './room.js';

let currentUserInfo = null;

const imgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg> 画像`;

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

    // すべてのモーダルを閉じるヘルパー
    const closeAllModals = () => {
        modalProfile.style.display = 'none';
        modalAddFriend.style.display = 'none';
    };

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
        sessionStorage.setItem('activeTab', tab);
    };

    navHome.addEventListener('click', () => switchTab('home'));
    navTalk.addEventListener('click', () => switchTab('talk'));

    // 初期タブ復元（トークルームから戻った時など）
    const initialTab = sessionStorage.getItem('activeTab') || 'home';
    switchTab(initialTab);

    // ===========================
    // ログイン処理
    // ===========================
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch(error => {
            console.error("ログインエラー:", error);
            // エラー表示は適宜処理
        });
    });

    logoutBtn.addEventListener('click', () => {
        closeAllModals();
        signOut(auth).catch(error => console.error(error));
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
                photoURL: user.photoURL || 'img/default_icon.png',
                bio: '',
                toocId: ''
            };

            get(ref(db, `users/${user.uid}`)).then((snap) => {
                if (snap.exists()) {
                    const saved = snap.val();
                    currentUserInfo.displayName = saved.displayName || currentUserInfo.displayName;
                    currentUserInfo.photoURL = saved.photoURL || currentUserInfo.photoURL;
                    currentUserInfo.bio = saved.bio || '';
                    currentUserInfo.toocId = saved.toocId || '';
                }

                if (!currentUserInfo.toocId) {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-';
                    let randomId = '';
                    for (let i = 0; i < 16; i++) {
                        randomId += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    currentUserInfo.toocId = randomId;
                    set(ref(db, `toocIds/${randomId}`), user.uid).catch(err => console.error('toocID生成エラー:', err));
                }

                myName.textContent = currentUserInfo.displayName;
                myIcon.src = currentUserInfo.photoURL;
                myBio.textContent = currentUserInfo.bio || '...';

                update(ref(db, `users/${user.uid}`), {
                    uid: user.uid,
                    displayName: currentUserInfo.displayName,
                    photoURL: currentUserInfo.photoURL,
                    toocId: currentUserInfo.toocId
                }).catch(err => console.error('ユーザー情報の保存に失敗:', err));

                loadFriends();
                loadTalkRooms();
            }).catch(err => {
                console.error('ユーザー情報の取得に失敗:', err);
                myName.textContent = currentUserInfo.displayName;
                myIcon.src = currentUserInfo.photoURL;
                loadFriends();
                loadTalkRooms();
            });
        } else {
            closeAllModals();
            loginOverlay.style.display = 'flex';
            mainApp.style.display = 'none';
            currentUserInfo = null;
        }
    });

    // ===========================
    // ユーティリティ
    // ===========================
    const getPrivateRoomId = (uid1, uid2) => {
        return [uid1, uid2].sort().join('_');
    };

    // ===========================
    // ユーザー情報のローカルキャッシュ取得
    // ===========================
    const getUserCache = async (uid) => {
        const cacheKey = `tooc_user_${uid}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
        try {
            const snap = await get(ref(db, `users/${uid}`));
            if (snap.exists()) {
                const data = snap.val();
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
                return data;
            }
        } catch (e) {
            console.error('キャッシュ取得エラー:', e);
        }
        return null;
    };

    // ===========================
    // 友だちリストの読み込み
    // ===========================
    const loadFriends = () => {
        const myFriendsRef = ref(db, `users/${currentUserInfo.uid}/friends`);
        onValue(myFriendsRef, (friendsSnap) => {
            const friendsData = friendsSnap.val();
            friendsContainer.innerHTML = '';

            if (!friendsData) {
                friendsContainer.innerHTML = '<p style="padding: 1rem; font-family: \'LINE Seed JP\', sans-serif; color: #999; font-size: 0.9rem;">友だちがまだいません。toocIDで友だちを追加しましょう。</p>';
                return;
            }

            const friendUids = Object.keys(friendsData);
            friendUids.forEach(async friendUid => {
                const userData = await getUserCache(friendUid);
                if (!userData) return;

                const node = document.importNode(templateFriend, true);

                node.querySelector('.friend_name').textContent = userData.displayName;
                node.querySelector('.friend_icon_img').src = userData.photoURL || 'img/default_icon.png';
                // ステータスメッセージを反映
                node.querySelector('.friend_bio').textContent = userData.bio || 'ステータスメッセージはありません';

                const friendElement = node.querySelector('.friends_friend');
                friendElement.style.cursor = 'pointer';
                friendElement.addEventListener('click', () => {
                    const roomId = getPrivateRoomId(currentUserInfo.uid, friendUid);
                    openTalkRoom(roomId, userData.displayName);
                });

                friendsContainer.appendChild(node);
            });
        }, (err) => {
            console.error('友だちリストの監視エラー:', err);
        });
    };

    // ===========================
    // トークルーム一覧の読み込み（重複防止のPromise.all制御）
    // ===========================
    const formatNotiTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const today = new Date();

        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const diffTime = todayOnly - dateOnly;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        } else if (diffDays === 1) {
            return '昨日';
        } else if (diffDays === 2) {
            return '一昨日';
        } else {
            const y = date.getFullYear();
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const d = date.getDate().toString().padStart(2, '0');
            return `${y}/${m}/${d}`;
        }
    };

    const loadTalkRooms = () => {
        const roomsRef = ref(db, 'rooms');
        onValue(roomsRef, async (snapshot) => {
            const roomsData = snapshot.val();
            if (!roomsData) {
                talkContainer.innerHTML = '';
                appendMemoRoom(talkContainer);
                return;
            }

            // 新しいFragmentを作って最後に置き換える（重複描画防止）
            const fragment = document.createDocumentFragment();

            // 先にKeepメモをフラグメントに追加
            await appendMemoRoom(fragment);

            const promises = [];
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

                const p = getUserCache(targetUid).then((targetUser) => {
                    let targetName = "不明なユーザー";
                    let targetIcon = "img/default_icon.png";
                    if (targetUser) {
                        targetName = targetUser.displayName;
                        targetIcon = targetUser.photoURL;
                    }

                    const node = document.importNode(templateTalkroom, true);
                    node.querySelector('.talkroom_infoname').textContent = targetName;

                    if (lastMessage.type === 'image') {
                        const isMe = lastMessage.senderId === currentUserInfo.uid;
                        node.querySelector('.talkroom_infomessage').textContent = isMe ? '画像を送信しました' : '画像を送信されました';
                    } else {
                        node.querySelector('.talkroom_infomessage').textContent = lastMessage.text || '';
                    }
                    node.querySelector('.room_icon_img').src = targetIcon;

                    if (lastMessage.timestamp) {
                        node.querySelector('.talkroom_notitime').textContent = formatNotiTime(lastMessage.timestamp);
                    }

                    const talkElement = node.querySelector('.talk_talkroom');
                    talkElement.style.cursor = 'pointer';
                    talkElement.addEventListener('click', () => {
                        openTalkRoom(roomId, targetName);
                    });

                    // 最新の投稿日時でソートするためのメタデータを持たせる
                    talkElement.dataset.timestamp = lastMessage.timestamp || 0;
                    return talkElement;
                }).catch(err => {
                    console.error('ルーム情報取得エラー:', err);
                    return null;
                });
                promises.push(p);
            });

            const elements = await Promise.all(promises);
            // タイムスタンプ順（新しい順）にソート
            elements.filter(el => el !== null).sort((a, b) => b.dataset.timestamp - a.dataset.timestamp).forEach(el => {
                fragment.appendChild(el);
            });

            // 最後に一括でDOMを更新
            talkContainer.innerHTML = '';
            talkContainer.appendChild(fragment);

        }, (err) => {
            console.error('ルーム一覧の監視エラー:', err);
        });
    };

    // 自分用のメモルーム（Keep）
    const appendMemoRoom = async (container) => {
        if (!currentUserInfo) return;
        const memoRoomId = `memo_${currentUserInfo.uid}`;
        const node = document.importNode(templateTalkroom, true);
        node.querySelector('.talkroom_infoname').textContent = "Own";
        node.querySelector('.talkroom_infomessage').textContent = "タップしてメモを開く";
        node.querySelector('.room_icon_img').src = currentUserInfo.photoURL;

        try {
            const snapshot = await get(ref(db, `rooms/${memoRoomId}/messages`));
            const messages = snapshot.val();
            if (messages) {
                const messageIds = Object.keys(messages);
                if (messageIds.length > 0) {
                    const lastMessage = messages[messageIds[messageIds.length - 1]];
                    if (lastMessage.type === 'image') {
                        const isMe = lastMessage.senderId === currentUserInfo.uid;
                        node.querySelector('.talkroom_infomessage').textContent = isMe ? '画像を送信しました' : '画像を送信されました';
                    } else {
                        node.querySelector('.talkroom_infomessage').textContent = lastMessage.text || '';
                    }
                    if (lastMessage.timestamp) {
                        node.querySelector('.talkroom_notitime').textContent = formatNotiTime(lastMessage.timestamp);
                    }
                }
            }
        } catch (e) { }

        const talkElement = node.querySelector('.talk_talkroom');
        talkElement.style.cursor = 'pointer';
        talkElement.addEventListener('click', () => {
            openTalkRoom(memoRoomId, "Own");
        });
        container.appendChild(talkElement);
    };

    // ===========================
    // プロフィール編集モーダル / タブ操作
    // ===========================
    const editIconPreview = document.getElementById('edit_icon_preview');
    const editIconInput = document.getElementById('edit_icon_input');
    const editNameInput = document.getElementById('edit_name_input');
    const editBioInput = document.getElementById('edit_bio_input');
    const editToocidInput = document.getElementById('edit_toocid_input');
    const currentToocid = document.getElementById('current_toocid');
    const profileErrorMsg = document.getElementById('profile_error_msg');
    let pendingIconBase64 = null;

    // タブ切替関連
    const tabBtnProfile = document.getElementById('tab_btn_profile');
    const tabBtnToocid = document.getElementById('tab_btn_toocid');
    const tabContentProfile = document.getElementById('tab_content_profile');
    const tabContentToocid = document.getElementById('tab_content_toocid');
    const swipeArea = document.getElementById('modal_body_swipe_area');

    const activateProfileTab = () => {
        tabBtnProfile.style.color = '#A855F7';
        tabBtnProfile.style.borderBottomColor = '#A855F7';
        tabBtnToocid.style.color = '#999';
        tabBtnToocid.style.borderBottomColor = 'transparent';
        tabContentProfile.style.display = 'block';
        tabContentToocid.style.display = 'none';
        profileErrorMsg.style.display = 'none';
    };

    const activateToocidTab = () => {
        tabBtnProfile.style.color = '#999';
        tabBtnProfile.style.borderBottomColor = 'transparent';
        tabBtnToocid.style.color = '#A855F7';
        tabBtnToocid.style.borderBottomColor = '#A855F7';
        tabContentProfile.style.display = 'none';
        tabContentToocid.style.display = 'block';
        document.getElementById('toocid_validation_msg').textContent = '3〜20文字で入力してください';
        document.getElementById('toocid_validation_msg').style.color = '#999';
        document.getElementById('btn_set_toocid').disabled = true;
        document.getElementById('btn_set_toocid').style.background = '#ccc';
    };

    tabBtnProfile.addEventListener('click', activateProfileTab);
    tabBtnToocid.addEventListener('click', activateToocidTab);

    // スワイプ処理
    let touchStartX = 0;
    swipeArea.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX);
    swipeArea.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        if (touchEndX < touchStartX - 50) activateToocidTab(); // 左スワイプ -> toocID
        if (touchEndX > touchStartX + 50) activateProfileTab(); // 右スワイプ -> Profile
    });

    const openProfileModal = (tab = 'profile') => {
        if (!currentUserInfo) return;
        editIconPreview.src = currentUserInfo.photoURL;
        editNameInput.value = currentUserInfo.displayName;
        editBioInput.value = currentUserInfo.bio || '';
        editToocidInput.value = '';
        currentToocid.textContent = currentUserInfo.toocId ? `現在のtoocID: @${currentUserInfo.toocId}` : '未設定';
        pendingIconBase64 = null;
        modalProfile.style.display = 'flex';

        if (tab === 'toocid') activateToocidTab();
        else activateProfileTab();
    };

    document.querySelectorAll('#btn_open_profile_edit').forEach(btn => {
        btn.addEventListener('click', () => openProfileModal('profile'));
    });
    document.getElementById('btn_open_toocid_edit').addEventListener('click', () => openProfileModal('toocid'));
    document.getElementById('modal_profile_close').addEventListener('click', () => { modalProfile.style.display = 'none'; });

    // モーダル枠外タップで閉じる（スマホ対応のためtouchstart追加）
    const closeModalIfOutside = (e, modal) => {
        if (e.target === modal) {
            e.preventDefault();
            e.stopPropagation();
            modal.style.display = 'none';
        }
    };
    modalProfile.addEventListener('mousedown', (e) => closeModalIfOutside(e, modalProfile));
    modalProfile.addEventListener('touchstart', (e) => closeModalIfOutside(e, modalProfile), { passive: false });

    // アイコン画像変更 (MAX 300px, quality 0.8)
    editIconInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 300;
                let w = img.width, h = img.height;
                if (w > h) { h = (MAX * h) / w; w = MAX; }
                else { w = (MAX * w) / h; h = MAX; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                pendingIconBase64 = canvas.toDataURL('image/jpeg', 0.8);
                editIconPreview.src = pendingIconBase64;
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // toocIDリアルタイムバリデーション
    let toocidCheckTimer = null;
    editToocidInput.addEventListener('input', () => {
        const newId = editToocidInput.value.trim();
        const msgEl = document.getElementById('toocid_validation_msg');
        const btn = document.getElementById('btn_set_toocid');

        clearTimeout(toocidCheckTimer);

        if (!newId) {
            msgEl.textContent = '3〜20文字で入力してください';
            msgEl.style.color = '#999';
            btn.disabled = true;
            btn.style.background = '#ccc';
            return;
        }

        if (!/^[a-zA-Z0-9_.\-]{3,20}$/.test(newId)) {
            msgEl.textContent = '❌ 半角英数字と _ . - のみ（3～20文字）';
            msgEl.style.color = '#ef4444';
            btn.disabled = true;
            btn.style.background = '#ccc';
            return;
        }

        msgEl.textContent = '確認中...';
        msgEl.style.color = '#999';

        toocidCheckTimer = setTimeout(() => {
            get(ref(db, `toocIds/${newId}`)).then((existing) => {
                if (existing.exists() && existing.val() !== currentUserInfo.uid) {
                    msgEl.textContent = '❌ このIDは既に使用されています';
                    msgEl.style.color = '#ef4444';
                    btn.disabled = true;
                    btn.style.background = '#ccc';
                } else {
                    msgEl.textContent = '✅ 使用可能です！';
                    msgEl.style.color = '#22c55e';
                    btn.disabled = false;
                    btn.style.background = '#A855F7';
                }
            }).catch(() => {
                msgEl.textContent = '❌ 確認エラー';
                msgEl.style.color = '#ef4444';
            });
        }, 500); // 500msのデバウンス
    });

    // toocID保存
    document.getElementById('btn_set_toocid').addEventListener('click', () => {
        const newId = editToocidInput.value.trim();
        const msgEl = document.getElementById('toocid_validation_msg');
        const btn = document.getElementById('btn_set_toocid');

        btn.disabled = true;
        msgEl.textContent = '保存中...';

        const promises = [];
        if (currentUserInfo.toocId) {
            promises.push(set(ref(db, `toocIds/${currentUserInfo.toocId}`), null));
        }
        promises.push(set(ref(db, `toocIds/${newId}`), currentUserInfo.uid));
        promises.push(update(ref(db, `users/${currentUserInfo.uid}`), { toocId: newId }));

        Promise.all(promises).then(() => {
            currentUserInfo.toocId = newId;
            currentToocid.textContent = `現在のtoocID: @${newId}`;
            editToocidInput.value = '';
            msgEl.textContent = '🎉 保存完了しました！';
            msgEl.style.color = '#A855F7';
        }).catch((err) => {
            msgEl.textContent = '❌ 保存エラー: ' + err.message;
            msgEl.style.color = '#ef4444';
        });
    });

    // プロフィール保存
    document.getElementById('btn_save_profile').addEventListener('click', () => {
        const newName = editNameInput.value.trim() || currentUserInfo.displayName;
        const newBio = editBioInput.value.trim();
        const updates = {
            displayName: newName,
            bio: newBio
        };
        if (pendingIconBase64) {
            updates.photoURL = pendingIconBase64;
        }

        profileErrorMsg.style.display = 'none';

        update(ref(db, `users/${currentUserInfo.uid}`), updates).then(() => {
            // キャッシュもクリアしておく
            sessionStorage.removeItem(`tooc_user_${currentUserInfo.uid}`);

            currentUserInfo.displayName = newName;
            currentUserInfo.bio = newBio;
            if (pendingIconBase64) {
                currentUserInfo.photoURL = pendingIconBase64;
            }

            myName.textContent = newName;
            myBio.textContent = newBio || '...';
            myIcon.src = currentUserInfo.photoURL;

            modalProfile.style.display = 'none';
        }).catch((err) => {
            profileErrorMsg.textContent = '保存に失敗しました: ' + err.message;
            profileErrorMsg.style.display = 'block';
        });
    });

    // ===========================
    // 友だち追加モーダル（toocID検索）
    // ===========================
    const openAddFriendModal = () => {
        modalAddFriend.style.display = 'flex';
        document.getElementById('search_result').innerHTML = '';
        document.getElementById('search_toocid_input').value = '';
    };

    document.getElementById('btn_add_by_toocid').addEventListener('click', openAddFriendModal);
    document.getElementById('btn_open_add_friend').addEventListener('click', openAddFriendModal);
    document.getElementById('modal_add_friend_close').addEventListener('click', () => {
        modalAddFriend.style.display = 'none';
    });
    modalAddFriend.addEventListener('mousedown', (e) => closeModalIfOutside(e, modalAddFriend));
    modalAddFriend.addEventListener('touchstart', (e) => closeModalIfOutside(e, modalAddFriend), { passive: false });

    document.getElementById('btn_search_toocid').addEventListener('click', () => {
        const searchId = document.getElementById('search_toocid_input').value.trim();
        const resultDiv = document.getElementById('search_result');
        resultDiv.innerHTML = '';

        if (!searchId) return;

        get(ref(db, `toocIds/${searchId}`)).then((snap) => {
            if (!snap.exists()) {
                resultDiv.innerHTML = '<p style="font-family: \'LINE Seed JP\', sans-serif; color: #999; text-align: center; padding: 16px;">ユーザーが見つかりません</p>';
                return;
            }

            const foundUid = snap.val();
            if (foundUid === currentUserInfo.uid) {
                resultDiv.innerHTML = '<p style="font-family: \'LINE Seed JP\', sans-serif; color: #999; text-align: center; padding: 16px;">自分自身のIDです</p>';
                return;
            }

            get(ref(db, `users/${foundUid}`)).then((userSnap) => {
                if (!userSnap.exists()) return;
                const foundUser = userSnap.val();

                get(ref(db, `users/${currentUserInfo.uid}/friends/${foundUid}`)).then((friendSnap) => {
                    const isAlreadyFriend = friendSnap.exists();
                    const item = document.createElement('div');
                    item.className = 'search_result_item';
                    item.innerHTML = `
                        <img src="${foundUser.photoURL || 'img/default_icon.png'}" alt="">
                        <div class="result_info">
                            <p>${foundUser.displayName}</p>
                            <p>@${searchId}</p>
                        </div>
                        <button class="btn_do_add_friend">${isAlreadyFriend ? '追加済み' : '追加'}</button>
                    `;

                    if (!isAlreadyFriend) {
                        item.querySelector('.btn_do_add_friend').addEventListener('click', () => {
                            Promise.all([
                                set(ref(db, `users/${currentUserInfo.uid}/friends/${foundUid}`), true),
                                set(ref(db, `users/${foundUid}/friends/${currentUserInfo.uid}`), true)
                            ]).then(() => {
                                item.querySelector('.btn_do_add_friend').textContent = '追加済み';
                                item.querySelector('.btn_do_add_friend').disabled = true;
                                item.querySelector('.btn_do_add_friend').style.background = '#ccc';
                            }).catch(err => console.error(err));
                        });
                    } else {
                        item.querySelector('.btn_do_add_friend').disabled = true;
                        item.querySelector('.btn_do_add_friend').style.background = '#ccc';
                    }

                    resultDiv.appendChild(item);
                }).catch(err => console.error(err));
            }).catch(err => console.error(err));
        }).catch(err => console.error(err));
    });
});
