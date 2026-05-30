import { db, ref, onValue, currentUser } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const roomsRef = ref(db, 'rooms');
    const container = document.querySelector('.talk_container');
    
    // 既存のHTMLテンプレート要素を保存しておく
    const originalNodes = Array.from(container.querySelectorAll('.talk_talkroom'));
    const template = originalNodes.length > 0 ? originalNodes[0].cloneNode(true) : null;

    if (!template) {
        console.warn("テンプレートとなる要素が見つかりませんでした");
        return;
    }

    onValue(roomsRef, (snapshot) => {
        const roomsData = snapshot.val();
        if (!roomsData) return;

        // 既存のリストをクリア（静的なテンプレートを消去）
        container.innerHTML = ''; 

        Object.keys(roomsData).forEach(roomId => {
            const room = roomsData[roomId];
            const messages = room.messages || {};
            // 最新のメッセージを取得
            const messageIds = Object.keys(messages);
            if (messageIds.length === 0) return;
            const lastMessage = messages[messageIds[messageIds.length - 1]];

            const roomNode = template.cloneNode(true);
            
            // ルーム名とメッセージの更新
            roomNode.querySelector('.talkroom_infoname').textContent = `ルーム: ${roomId}`;
            roomNode.querySelector('.talkroom_infomessage').textContent = lastMessage.text;
            
            // タイムスタンプのフォーマット (簡易版)
            if (lastMessage.timestamp) {
                const date = new Date(lastMessage.timestamp);
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                roomNode.querySelector('.talkroom_notitime').textContent = `${hours}:${minutes}`;
            }

            // 未読数の表示（今回は固定で非表示に。本格実装時は既読管理が必要）
            const notiCount = roomNode.querySelector('.talkroom_noticount');
            if (notiCount) {
                notiCount.style.display = 'none';
            }

            // トークルームクリックで画面遷移するイベント
            roomNode.addEventListener('click', () => {
                window.location.href = `talkroom/index.html?room=${roomId}`;
            });

            container.appendChild(roomNode);
        });
    });
});
