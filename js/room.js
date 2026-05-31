import { db, auth, onAuthStateChanged, ref, push, onChildAdded, off, serverTimestamp } from './firebase-config.js';

let currentMessagesRef = null;
let currentOnChildAdded = null;
let currentTargetName = 'トーク';
let currentTargetIcon = 'img/default_icon.png';
let currentUserData = null;
let currentRoomId = null;
let isUiInitialized = false;

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

    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.style.display = 'block';
    
    // アニメーションを確実に発火させるため
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            talkroomPage.style.transform = 'translateX(0)';
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
        appendMessage(data);
    });

    if (!isUiInitialized) {
        initializeUI();
        isUiInitialized = true;
    }
};

export const closeTalkRoom = () => {
    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.style.transform = 'translateX(100%)';
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

const scrollToBottom = () => {
    const talkroomPage = document.getElementById('talkroom_page');
    talkroomPage.scrollTo({ top: talkroomPage.scrollHeight, behavior: 'smooth' });
};

const appendMessage = (data) => {
    const isMe = currentUserData && data.senderId === currentUserData.id;
    const msgDiv = document.createElement('div');
    msgDiv.className = `content ${isMe ? 'me' : 'other'}`;

    let innerHTML = '';
    if (!isMe) {
        innerHTML += `
            <div class="content_icon">
                <img src="${currentTargetIcon}" alt="${data.senderName}">
            </div>`;
    }

    if (data.type === 'image' && data.imageData) {
        innerHTML += `<img class="content_image" src="${data.imageData}" alt="画像" style="max-width: 200px; border-radius: 12px; cursor: pointer;">`;
    } else {
        const escapedText = (data.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        innerHTML += `<p class="content_message">${escapedText}</p>`;
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

    document.getElementById('chat_main').appendChild(msgDiv);
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
    const labelAreaInput = document.querySelector('label.area_input');

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
        const lines = (inputArea.value.match(/\n/g) || []).length + 1;
        const extraHeight = (lines - 1) * 20;
        
        if (labelAreaInput) {
            labelAreaInput.style.minHeight = (44 + extraHeight) + 'px';
        }
        
        inputArea.style.height = 'auto';
        inputArea.style.height = inputArea.scrollHeight + 'px';
    });

    inputArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
            setTimeout(() => {
                inputArea.style.height = 'auto';
            }, 0);
        }
    });
};
