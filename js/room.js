import { db, ref, push, onChildAdded, serverTimestamp, currentUser } from './firebase-config.js';

// URLのクエリパラメータからルームIDを取得する（指定がない場合はデフォルトを使用）
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('room') || 'room_general';
const messagesRef = ref(db, `rooms/${ROOM_ID}/messages`);

document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('main');
    const inputArea = document.getElementById('area_input');
    const actionBtn = document.getElementById('area_action_btn');

    // 初期表示されているダミーメッセージをクリア（必要に応じて）
    // mainContainer.innerHTML = ''; 

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
            innerHTML += `
                <div class="content_icon">
                    <img src="../img/icon(temp).jpg" alt="${data.senderName}">
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
