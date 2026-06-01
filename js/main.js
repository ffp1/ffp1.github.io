import { db, auth, provider, signInWithPopup, onAuthStateChanged, signOut, ref, onValue, set, get, update, serverTimestamp } from './firebase-config.js';
import { openTalkRoom } from './room.js';

let currentUserInfo = null;

const imgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg> 画像`;

// SVGアイコン定数
const svgUnavailable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M20.042 16.045a9 9 0 0 0 -12.087 -12.087m-2.318 1.677a9 9 0 1 0 12.725 12.73" /><path d="M3 3l18 18" /></svg>`;
const svgAvailable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 12l5 5l10 -10" /></svg>`;
const svgSuccess = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M4 5h2" /><path d="M5 4v2" /><path d="M11.5 4l-.5 2" /><path d="M18 5h2" /><path d="M19 4v2" /><path d="M15 9l-1 1" /><path d="M18 13l2 -.5" /><path d="M18 19h2" /><path d="M19 18v2" /><path d="M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39" /></svg>`;

document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login_overlay');
    const mainApp = document.getElementById('main_app');
    const loginBtn = document.getElementById('login_btn');
    const logoutBtn = document.getElementById('logout_btn');

    const myName = document.getElementById('my_name');
    const myIcon = document.getElementById('my_icon');
    const myBio = document.getElementById('my_bio');
    const toocidDisplay = document.getElementById('btn_open_toocid_edit');

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
    // タブスクロール位置保持
    // ===========================
    let homeScrollY = 0;
    let talkScrollY = 0;

    // ===========================
    // ナビバー切替ロジック
    // ===========================
    const switchTab = (tab) => {
        // 現在のスクロール位置を保存
        if (tabTop.classList.contains('active')) {
            homeScrollY = window.scrollY;
        } else if (tabTalk.classList.contains('active')) {
            talkScrollY = window.scrollY;
        }

        if (tab === 'home') {
            tabTop.classList.add('active');
            tabTalk.classList.remove('active');
            navHome.classList.add('active');
            navTalk.classList.remove('active');
            navbar.className = 'navbar nav-home';
            requestAnimationFrame(() => window.scrollTo(0, homeScrollY));
        } else {
            tabTop.classList.remove('active');
            tabTalk.classList.add('active');
            navHome.classList.remove('active');
            navTalk.classList.add('active');
            navbar.className = 'navbar nav-talk';
            requestAnimationFrame(() => window.scrollTo(0, talkScrollY));
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
                toocidDisplay.textContent = `@${currentUserInfo.toocId}`;

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
                // 空bioの場合は空文字に
                node.querySelector('.friend_bio').textContent = userData.bio || '';

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
    // トークルーム一覧の読み込み
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

            const fragment = document.createDocumentFragment();
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

                    talkElement.dataset.timestamp = lastMessage.timestamp || 0;
                    return talkElement;
                }).catch(err => {
                    console.error('ルーム情報取得エラー:', err);
                    return null;
                });
                promises.push(p);
            });

            const elements = await Promise.all(promises);
            elements.filter(el => el !== null).sort((a, b) => b.dataset.timestamp - a.dataset.timestamp).forEach(el => {
                fragment.appendChild(el);
            });

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
    const modalBodyScroll = document.querySelector('.modal_body_scroll');

    const activateProfileTab = () => {
        tabBtnProfile.style.color = '#A855F7';
        tabBtnProfile.style.borderBottomColor = '#A855F7';
        tabBtnToocid.style.color = '#999';
        tabBtnToocid.style.borderBottomColor = 'transparent';
        profileErrorMsg.style.display = 'none';
        // スクロールアニメーションで右パネルへ
        if (modalBodyScroll) {
            modalBodyScroll.scrollTo({ left: modalBodyScroll.scrollWidth / 2, behavior: 'smooth' });
        }
    };

    const activateToocidTab = () => {
        tabBtnProfile.style.color = '#999';
        tabBtnProfile.style.borderBottomColor = 'transparent';
        tabBtnToocid.style.color = '#A855F7';
        tabBtnToocid.style.borderBottomColor = '#A855F7';
        document.getElementById('toocid_validation_msg').innerHTML = '3〜20文字で入力してください';
        document.getElementById('toocid_validation_msg').style.color = '#999';
        document.getElementById('btn_set_toocid').disabled = true;
        document.getElementById('btn_set_toocid').style.background = '#ccc';
        // スクロールアニメーションで左パネルへ
        if (modalBodyScroll) {
            modalBodyScroll.scrollTo({ left: 0, behavior: 'smooth' });
        }
    };

    tabBtnProfile.addEventListener('click', activateProfileTab);
    tabBtnToocid.addEventListener('click', activateToocidTab);

    // 横スクロールでのタブ遷移は無効化（スワイプ処理を削除）

    const openProfileModal = (tab = 'profile') => {
        if (!currentUserInfo) return;
        editIconPreview.src = currentUserInfo.photoURL;
        editNameInput.value = currentUserInfo.displayName;
        editBioInput.value = currentUserInfo.bio || '';
        editToocidInput.value = '';
        currentToocid.textContent = currentUserInfo.toocId ? `現在のtoocID: @${currentUserInfo.toocId}` : '未設定';
        pendingIconBase64 = null;
        modalProfile.style.display = 'flex';

        // スクロール位置リセット後にタブ切替
        requestAnimationFrame(() => {
            if (tab === 'toocid') {
                if (modalBodyScroll) modalBodyScroll.scrollLeft = 0;
                activateToocidTab();
            } else {
                if (modalBodyScroll) modalBodyScroll.scrollLeft = modalBodyScroll.scrollWidth / 2;
                activateProfileTab();
            }
        });
    };

    document.querySelectorAll('#btn_open_profile_edit').forEach(btn => {
        btn.addEventListener('click', () => openProfileModal('profile'));
    });
    // toocIDテキストをタップでtoocID設定モーダルを開く
    toocidDisplay.addEventListener('click', () => openProfileModal('toocid'));
    document.getElementById('modal_profile_close').addEventListener('click', () => { modalProfile.style.display = 'none'; });

    // ===========================
    // モーダルスワイプで閉じる処理
    // ===========================
    const setupModalSwipeDismiss = (modal) => {
        const modalBox = modal.querySelector('.modal_box');
        const modalHeader = modal.querySelector('.modal_header');
        if (!modalBox || !modalHeader) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        modalHeader.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
            modalBox.style.transition = 'none';
        }, { passive: true });

        modalHeader.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY - startY;
            if (currentY < 0) currentY = 0;
            modalBox.style.transform = `translateY(${currentY}px)`;
        }, { passive: true });

        modalHeader.addEventListener('touchend', () => {
            isDragging = false;
            modalBox.style.transition = 'transform 0.3s cubic-bezier(0.33, 1, 0.68, 1)';
            if (currentY > 120) {
                modalBox.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    modal.style.display = 'none';
                    modalBox.style.transform = '';
                    modalBox.style.transition = '';
                }, 300);
            } else {
                modalBox.style.transform = 'translateY(0)';
                setTimeout(() => {
                    modalBox.style.transition = '';
                }, 300);
            }
            currentY = 0;
        });
    };

    setupModalSwipeDismiss(modalProfile);
    setupModalSwipeDismiss(modalAddFriend);

    // モーダル枠外タップで閉じる
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
    // アイコン画像クリックでも編集可能
    editIconPreview.addEventListener('click', () => editIconInput.click());

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

    // toocIDリアルタイムバリデーション（SVGアイコン）
    let toocidCheckTimer = null;
    editToocidInput.addEventListener('input', () => {
        const newId = editToocidInput.value.trim();
        const msgEl = document.getElementById('toocid_validation_msg');
        const btn = document.getElementById('btn_set_toocid');

        clearTimeout(toocidCheckTimer);

        if (!newId) {
            msgEl.innerHTML = '3〜20文字で入力してください';
            msgEl.style.color = '#999';
            btn.disabled = true;
            btn.style.background = '#ccc';
            return;
        }

        if (!/^[a-zA-Z0-9_.\-]{3,20}$/.test(newId)) {
            msgEl.innerHTML = `${svgUnavailable} 半角英数字と _ . - のみ（3～20文字）`;
            msgEl.style.color = '#ef4444';
            btn.disabled = true;
            btn.style.background = '#ccc';
            return;
        }

        msgEl.innerHTML = '確認中...';
        msgEl.style.color = '#999';

        toocidCheckTimer = setTimeout(() => {
            get(ref(db, `toocIds/${newId}`)).then((existing) => {
                if (existing.exists() && existing.val() !== currentUserInfo.uid) {
                    msgEl.innerHTML = `${svgUnavailable} このIDは既に使用されています`;
                    msgEl.style.color = '#ef4444';
                    btn.disabled = true;
                    btn.style.background = '#ccc';
                } else {
                    msgEl.innerHTML = `${svgAvailable} 使用可能です！`;
                    msgEl.style.color = '#22c55e';
                    btn.disabled = false;
                    btn.style.background = '#A855F7';
                }
            }).catch(() => {
                msgEl.innerHTML = `${svgUnavailable} 確認エラー`;
                msgEl.style.color = '#ef4444';
            });
        }, 500);
    });

    // toocID保存
    document.getElementById('btn_set_toocid').addEventListener('click', () => {
        const newId = editToocidInput.value.trim();
        const msgEl = document.getElementById('toocid_validation_msg');
        const btn = document.getElementById('btn_set_toocid');

        btn.disabled = true;
        msgEl.innerHTML = '保存中...';

        const promises = [];
        if (currentUserInfo.toocId) {
            promises.push(set(ref(db, `toocIds/${currentUserInfo.toocId}`), null));
        }
        promises.push(set(ref(db, `toocIds/${newId}`), currentUserInfo.uid));
        promises.push(update(ref(db, `users/${currentUserInfo.uid}`), { toocId: newId }));

        Promise.all(promises).then(() => {
            currentUserInfo.toocId = newId;
            currentToocid.textContent = `現在のtoocID: @${newId}`;
            toocidDisplay.textContent = `@${newId}`;
            editToocidInput.value = '';
            msgEl.innerHTML = `${svgSuccess} 保存完了しました！`;
            msgEl.style.color = '#A855F7';
        }).catch((err) => {
            msgEl.innerHTML = `${svgUnavailable} 保存エラー: ${err.message}`;
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

    // ===========================
    // Pull-to-Refresh
    // ===========================
    let ptrStartY = 0;
    let ptrDelta = 0;
    let ptrIndicator = null;

    const createPtrIndicator = () => {
        if (ptrIndicator) return;
        ptrIndicator = document.createElement('div');
        ptrIndicator.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:4px;background:linear-gradient(to right,#a855f7,#c084fc);transform:scaleX(0);transform-origin:left;transition:transform 0.1s;z-index:9999;';
        document.body.appendChild(ptrIndicator);
    };

    const homePage = document.getElementById('home_page');
    homePage.addEventListener('touchstart', (e) => {
        if (window.scrollY <= 0) {
            ptrStartY = e.touches[0].clientY;
            createPtrIndicator();
        }
    }, { passive: true });

    homePage.addEventListener('touchmove', (e) => {
        if (ptrStartY === 0) return;
        ptrDelta = e.touches[0].clientY - ptrStartY;
        if (ptrDelta > 0 && ptrIndicator) {
            const progress = Math.min(ptrDelta / 150, 1);
            ptrIndicator.style.transform = `scaleX(${progress})`;
        }
    }, { passive: true });

    homePage.addEventListener('touchend', () => {
        if (ptrDelta > 150 && currentUserInfo) {
            loadFriends();
            loadTalkRooms();
        }
        ptrDelta = 0;
        ptrStartY = 0;
        if (ptrIndicator) {
            ptrIndicator.style.transform = 'scaleX(0)';
            setTimeout(() => {
                if (ptrIndicator) { ptrIndicator.remove(); ptrIndicator = null; }
            }, 200);
        }
    });
});
