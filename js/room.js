import { db, auth, onAuthStateChanged, ref, push, onChildAdded, serverTimestamp } from './firebase-config.js';

// URLのクエリパラメータからルーム情報を取得する
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('room');
const targetName = urlParams.get('targetName') || 'トーク';
const targetIcon = urlParams.get('targetIcon') || '../img/icon(temp).jpg';

if (!ROOM_ID) {
    // ルームIDがない場合はホームに戻る
    window.location.href = '../index.html';
}

const messagesRef = ref(db, `rooms/${ROOM_ID}/messages`);

document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.getElementById('chat_main');
    const inputArea = document.getElementById('area_input');
    const actionBtn = document.getElementById('area_action_btn');
    
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
            // 未ログインの場合はホームにリダイレクト
            window.location.href = '../index.html';
            return;
        }

        const currentUser = {
            id: user.uid,
            name: user.displayName || '名無し'
        };

        // 画面の一番下へスクロールする関数
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
                // 自分以外のメッセージの場合はアイコンを表示
                // ※自分用メモ(Keep)の場合は自分からのメッセージなので isMe が true になりアイコンは表示されない
                innerHTML += `
                    <div class="content_icon">
                        <img src="${targetIcon}" alt="${data.senderName}">
                    </div>`;
            }
            
            // XSS対策としてテキストをエスケープ
            const escapedText = data.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            innerHTML += `<p class="content_message">${escapedText}</p>`;
            
            msgDiv.innerHTML = innerHTML;
            mainContainer.appendChild(msgDiv);
            scrollToBottom();
        };

        // Firebaseのメッセージ追加をリッスン (リアルタイム受信)
        onChildAdded(messagesRef, (snapshot) => {
            const data = snapshot.val();
            appendMessage(data);
        });

        // メッセージを送信する関数
        const sendMessage = () => {
            const text = inputArea.value.trim();
            if (text.length > 0) {
                // Firebaseにデータを保存
                push(messagesRef, {
                    text: text,
                    senderId: currentUser.id,
                    senderName: currentUser.name,
                    timestamp: serverTimestamp()
                }).then(() => {
                    inputArea.value = ''; // 入力欄をクリア
                    // 既存のUIロジック（送信ボタンからマイクアイコンに戻す）を発火させる
                    inputArea.dispatchEvent(new Event('input'));
                }).catch((error) => {
                    console.error("メッセージ送信エラー:", error);
                    alert("メッセージの送信に失敗しました。");
                });
            }
        };

        // 送信ボタンが押された時の処理
        actionBtn.addEventListener('click', () => {
            if (actionBtn.classList.contains('area_send')) {
                sendMessage();
            }
        });

        // Enterキーで送信 (Shift+Enterで改行できるようにする場合は調整)
        inputArea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    });
});
