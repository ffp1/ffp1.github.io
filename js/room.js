import { db, auth, onAuthStateChanged, ref, push, onChildAdded, off, serverTimestamp, get, update } from './firebase-config.js';

let currentMessagesRef = null;
let currentOnChildAdded = null;
let currentTargetName = 'トーク';
let currentTargetIcon = 'img/default_icon.png';
let currentUserData = null;
let currentRoomId = null;
let isUiInitialized = false;
let lastMessageTimestamp = 0;
let lastMessageSenderId = null;
let lastMessageDate = '';
let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserData = {
            id: user.uid,
            name: user.displayName || '名無し',
            photoURL: user.photoURL
        };
    }
});

export const openTalkRoom = (roomId, initialName = 'トーク') => {
    currentRoomId = roomId;
    currentTargetName = initialName;
    currentTargetIcon = 'img/default_icon.png';
    lastMessageTimestamp = 0;
    lastMessageSenderId = null;
    lastMessageDate = '';

    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.style.display = 'block';

    // アニメーションを確実に発火させるため
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            talkroomPage.style.transform = 'translateX(0)';
            const inputArea = document.querySelector('section.inputarea');
            if (inputArea) inputArea.classList.add('room-open');
            const header = document.querySelector('header.talkroom_header');
            if (header) header.classList.add('room-open');
        });
    });

    const mainContainer = document.getElementById('chat_main');
    mainContainer.innerHTML = '';

    const headerUsername = document.getElementById('header_username');
    if (headerUsername) headerUsername.textContent = currentTargetName;

    // 前のリスナーを解除
    if (currentMessagesRef && currentOnChildAdded) {
        off(currentMessagesRef, 'child_added', currentOnChildAdded);
    }

    // キャッシュからアイコン等を更新
    if (currentUserData) {
        if (roomId === `memo_${currentUserData.id}`) {
            currentTargetName = 'Own';
            currentTargetIcon = currentUserData.photoURL || 'img/default_icon.png';
        } else {
            const uids = roomId.split('_');
            if (uids.length === 2) {
                const targetUid = uids[0] === currentUserData.id ? uids[1] : uids[0];
                const cached = sessionStorage.getItem(`tooc_user_${targetUid}`);
                if (cached) {
                    try {
                        const data = JSON.parse(cached);
                        if (data.displayName) currentTargetName = data.displayName;
                        if (data.photoURL) currentTargetIcon = data.photoURL;
                    } catch(e) {}
                }
            }
        }
        if (headerUsername) headerUsername.textContent = currentTargetName;
    }

    // 新しいリスナーを登録
    currentMessagesRef = ref(db, `rooms/${roomId}/messages`);
    currentOnChildAdded = onChildAdded(currentMessagesRef, (snapshot) => {
        const data = snapshot.val();
        const msgKey = snapshot.key;
        appendMessage(data, msgKey);

        // 既読を付ける（相手のメッセージの場合）
        if (currentUserData && data.senderId !== currentUserData.id && !data.readBy?.[currentUserData.id]) {
            update(ref(db, `rooms/${roomId}/messages/${msgKey}/readBy`), {
                [currentUserData.id]: true
            }).catch(() => {});
        }
    });

    // スワイプバック登録
    setupSwipeBack(talkroomPage);

    if (!isUiInitialized) {
        initializeUI();
        isUiInitialized = true;
    }
};

export const closeTalkRoom = () => {
    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.style.transform = 'translateX(100%)';
    const inputArea = document.querySelector('section.inputarea');
    if (inputArea) inputArea.classList.remove('room-open');
    const header = document.querySelector('header.talkroom_header');
    if (header) header.classList.remove('room-open');
    setTimeout(() => {
        talkroomPage.style.display = 'none';
        document.getElementById('chat_main').innerHTML = '';
    }, 300);

    if (currentMessagesRef && currentOnChildAdded) {
        off(currentMessagesRef, 'child_added', currentOnChildAdded);
        currentMessagesRef = null;
        currentOnChildAdded = null;
    }
};

// ===========================
// スワイプバック（左→右で戻る）
// ===========================
const setupSwipeBack = (talkroomPage) => {
    // 既にリスナーがある場合は二重登録しない
    if (talkroomPage._swipeBackRegistered) return;
    talkroomPage._swipeBackRegistered = true;

    talkroomPage.addEventListener('touchstart', (e) => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        isSwiping = false;
    }, { passive: true });

    talkroomPage.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - swipeStartX;
        const dy = e.touches[0].clientY - swipeStartY;

        // 横移動が縦移動より大きく、右方向の場合のみ
        if (Math.abs(dx) > Math.abs(dy) && dx > 10) {
            isSwiping = true;
            talkroomPage.style.transition = 'none';
            talkroomPage.style.transform = `translateX(${Math.max(0, dx)}px)`;
        }
    }, { passive: true });

    talkroomPage.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        talkroomPage.style.transition = 'transform 0.3s cubic-bezier(0.33, 1, 0.68, 1)';

        if (isSwiping && dx > 100) {
            closeTalkRoom();
        } else {
            talkroomPage.style.transform = 'translateX(0)';
        }
        isSwiping = false;
    });
};

const scrollToBottom = () => {
    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.scrollTo({ top: talkroomPage.scrollHeight, behavior: 'smooth' });
};

// ===========================
// 曜日名
// ===========================
const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

const formatDateSeparator = (date) => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const day = dayNames[date.getDay()];
    return `${y}/${m}/${d} (${day})`;
};

const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const appendMessage = (data, msgKey) => {
    const isMe = currentUserData && data.senderId === currentUserData.id;
    const mainContainer = document.getElementById('chat_main');

    // ===========================
    // 日付セパレータ（sticky）
    // ===========================
    if (data.timestamp) {
        const msgDate = new Date(data.timestamp);
        const dateStr = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
        if (dateStr !== lastMessageDate) {
            lastMessageDate = dateStr;
            const sep = document.createElement('div');
            sep.className = 'date_separator';
            sep.textContent = formatDateSeparator(msgDate);
            mainContainer.appendChild(sep);
        }
    }

    // ===========================
    // 1分以内の連続メッセージチェック
    // ===========================
    const currentTimestamp = data.timestamp || 0;
    const timeDiff = currentTimestamp - lastMessageTimestamp;
    const isContinuous = (timeDiff < 60000) && (data.senderId === lastMessageSenderId);

    const msgDiv = document.createElement('div');
    msgDiv.className = `content ${isMe ? 'me' : 'other'}`;
    if (isContinuous) msgDiv.classList.add('continuous');

    let innerHTML = '';

    // 相手のメッセージにアイコン表示（連続でない場合のみ）
    if (!isMe) {
        if (!isContinuous) {
            innerHTML += `
                <div class="content_icon">
                    <img src="${currentTargetIcon}" alt="${data.senderName}">
                </div>`;
        } else {
            innerHTML += `<div class="content_icon_spacer"></div>`;
        }
    }

    // 自分のメッセージの場合、メタ情報を先に（左側に表示）
    if (isMe) {
        innerHTML += `<div class="content_meta">
            <span class="read_status" data-msg-key="${msgKey || ''}">${data.readBy && Object.keys(data.readBy).some(k => k !== currentUserData.id) ? '既読' : ''}</span>
            <span class="msg_time">${formatTime(data.timestamp)}</span>
        </div>`;
    }

    if (data.type === 'image' && data.imageData) {
        innerHTML += `<img class="content_image" src="${data.imageData}" alt="画像" style="max-width: 200px; border-radius: 12px; cursor: pointer;">`;
    } else {
        const escapedText = (data.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        innerHTML += `<p class="content_message">${escapedText}</p>`;
    }

    // 相手のメッセージの場合、メタ情報を後に（右側に表示）
    if (!isMe) {
        innerHTML += `<div class="content_meta">
            <span class="msg_time">${formatTime(data.timestamp)}</span>
        </div>`;
    }

    msgDiv.innerHTML = innerHTML;

    const img = msgDiv.querySelector('.content_image');
    if (img) {
        img.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:grid;place-items:center;cursor:pointer;';
            const fullImg = document.createElement('img');
            fullImg.src = img.src;
            fullImg.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px;';
            overlay.appendChild(fullImg);
            overlay.addEventListener('click', () => overlay.remove());
            document.body.appendChild(overlay);
        });
    }

    mainContainer.appendChild(msgDiv);

    // タイムスタンプ更新
    lastMessageTimestamp = currentTimestamp;
    lastMessageSenderId = data.senderId;

    scrollToBottom();
};

const initializeUI = () => {
    const backBtn = document.getElementById('header_back_btn');
    if (backBtn) {
        backBtn.addEventListener('click', closeTalkRoom);
    }

    const inputArea = document.getElementById('area_input');
    const actionBtn = document.getElementById('area_action_btn');
    const imageInput = document.getElementById('area_add-image');

    const sendMessage = () => {
        if (!currentUserData || !currentRoomId) return;
        const text = inputArea.value.trim();
        if (text.length > 0) {
            push(currentMessagesRef, {
                text: text,
                type: 'text',
                senderId: currentUserData.id,
                senderName: currentUserData.name,
                timestamp: serverTimestamp()
            }).then(() => {
                inputArea.value = '';
                inputArea.dispatchEvent(new Event('input'));
            }).catch((error) => {
                console.error("メッセージ送信エラー:", error);
                alert("メッセージの送信に失敗しました。");
            });
        }
    };

    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            if (!currentUserData || !currentRoomId) return;
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_W = 800;
                    let w = img.width, h = img.height;
                    if (w > MAX_W) {
                        h = (MAX_W * h) / w;
                        w = MAX_W;
                    }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    const base64 = canvas.toDataURL('image/jpeg', 0.8);

                    push(currentMessagesRef, {
                        type: 'image',
                        imageData: base64,
                        text: '',
                        senderId: currentUserData.id,
                        senderName: currentUserData.name,
                        timestamp: serverTimestamp()
                    }).catch((error) => {
                        console.error("画像送信エラー:", error);
                        alert("画像の送信に失敗しました。");
                    });
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            imageInput.value = '';
        });
    }

    actionBtn.addEventListener('click', () => {
        if (actionBtn.classList.contains('area_send')) {
            sendMessage();
        }
    });

    inputArea.addEventListener('input', () => {
        inputArea.style.height = 'auto';
        inputArea.style.height = inputArea.scrollHeight + 'px';

        if (inputArea.value.trim().length > 0) {
            actionBtn.classList.remove('area_voicemessage', 'wip');
            actionBtn.classList.add('area_send');
        } else {
            actionBtn.classList.remove('area_send');
            actionBtn.classList.add('area_voicemessage', 'wip');
        }
    });

    // ===========================
    // WIPポップアップ復帰
    // ===========================
    const wipContainer = document.getElementById('wip_container');
    const setupWipButtons = () => {
        document.querySelectorAll('section.inputarea .wip, header.talkroom_header .wip').forEach(el => {
            if (el._wipRegistered) return;
            el._wipRegistered = true;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (wipContainer) {
                    wipContainer.classList.add('active');
                    wipContainer.addEventListener('click', function handler() {
                        wipContainer.classList.remove('active');
                        wipContainer.removeEventListener('click', handler);
                    });
                }
            });
        });
    };
    setupWipButtons();
};
