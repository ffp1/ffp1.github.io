import { db, auth, onAuthStateChanged, ref, push, onChildAdded, serverTimestamp } from './firebase-config.js';

// URLのクエリパラメータからルーム情報を取得する
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('room');
let targetName = urlParams.get('targetName') || 'トーク';
let targetIcon = urlParams.get('targetIcon') || '../img/default_icon.png';

if (!ROOM_ID) {
    window.location.href = '../index.html';
}

const messagesRef = ref(db, `rooms/${ROOM_ID}/messages`);

document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.getElementById('chat_main');
    const inputArea = document.getElementById('area_input');
    const actionBtn = document.getElementById('area_action_btn');
    const imageInput = document.getElementById('area_add-image');

    // ヘッダー情報の更新
    const headerUsername = document.getElementById('header_username');
    if (headerUsername) {
        headerUsername.textContent = targetName;
    }

    // 戻るボタンの処理
    const backBtn = document.getElementById('header_back_btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
    }

    // 認証状態の監視
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = '../index.html';
            return;
        }

        const currentUser = {
            id: user.uid,
            name: user.displayName || '名無し'
        };

        if (ROOM_ID === `memo_${user.uid}`) {
            targetName = 'Own';
            targetIcon = user.photoURL || '../img/default_icon.png';
        } else {
            const uids = ROOM_ID.split('_');
            if (uids.length === 2) {
                const targetUid = uids[0] === user.uid ? uids[1] : uids[0];
                const cached = sessionStorage.getItem(`tooc_user_${targetUid}`);
                if (cached) {
                    try {
                        const data = JSON.parse(cached);
                        if (data.displayName) targetName = data.displayName;
                        if (data.photoURL) targetIcon = data.photoURL;
                    } catch(e) {}
                }
            }
        }

        if (headerUsername) headerUsername.textContent = targetName;

        const scrollToBottom = () => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        };

        // メッセージ要素を作成して画面に追加する関数
        const appendMessage = (data) => {
            const isMe = data.senderId === currentUser.id;
            const msgDiv = document.createElement('div');
            msgDiv.className = `content ${isMe ? 'me' : 'other'}`;

            let innerHTML = '';
            if (!isMe) {
                innerHTML += `
                    <div class="content_icon">
                        <img src="${targetIcon}" alt="${data.senderName}">
                    </div>`;
            }

            if (data.type === 'image' && data.imageData) {
                // 画像メッセージ
                innerHTML += `<img class="content_image" src="${data.imageData}" alt="画像" style="max-width: 200px; border-radius: 12px; cursor: pointer;">`;
            } else {
                // テキストメッセージ
                const escapedText = (data.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                innerHTML += `<p class="content_message">${escapedText}</p>`;
            }

            msgDiv.innerHTML = innerHTML;

            // 画像クリックで拡大表示
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
            scrollToBottom();
        };

        // Firebaseのメッセージ追加をリッスン
        onChildAdded(messagesRef, (snapshot) => {
            const data = snapshot.val();
            appendMessage(data);
        });

        // テキストメッセージを送信する関数
        const sendMessage = () => {
            const text = inputArea.value.trim();
            if (text.length > 0) {
                push(messagesRef, {
                    text: text,
                    type: 'text',
                    senderId: currentUser.id,
                    senderName: currentUser.name,
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

        // 画像送信処理
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        // リサイズ（最大幅800px）
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

                        push(messagesRef, {
                            type: 'image',
                            imageData: base64,
                            text: '',
                            senderId: currentUser.id,
                            senderName: currentUser.name,
                            timestamp: serverTimestamp()
                        }).catch((error) => {
                            console.error("画像送信エラー:", error);
                            alert("画像の送信に失敗しました。");
                        });
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
                // ファイル入力をリセット
                imageInput.value = '';
            });
        }

        // 送信ボタンが押された時の処理
        actionBtn.addEventListener('click', () => {
            if (actionBtn.classList.contains('area_send')) {
                sendMessage();
            }
        });

        const labelAreaInput = document.querySelector('label.area_input');
        const inputAreaSection = document.querySelector('section.inputarea');

        // textareaの自動リサイズ
        inputArea.addEventListener('input', () => {
            const lines = (inputArea.value.match(/\n/g) || []).length + 1;
            const extraHeight = (lines - 1) * 20;
            
            if (labelAreaInput) {
                labelAreaInput.style.minHeight = (44 + extraHeight) + 'px';
            }
            
            inputArea.style.height = 'auto';
            inputArea.style.height = inputArea.scrollHeight + 'px';
        });

        // Enterキーで送信 (Shift+Enterで改行)
        inputArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                // 送信後に高さをリセット
                setTimeout(() => {
                    inputArea.style.height = 'auto';
                }, 0);
            }
        });
    });
});
