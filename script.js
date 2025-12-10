// Firebase modular SDK imports (1セットに統一)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    onSnapshot,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBr7hYG63QrWjxB1BqNFxZ9qSMTuX9TFU4",
    authDomain: "sky-color-japan.firebaseapp.com",
    projectId: "sky-color-japan",
    storageBucket: "sky-color-japan.firebasestorage.app",
    messagingSenderId: "68931988312",
    appId: "1:68931988312:web:67c92fbc1664bbe889d32d",
    measurementId: "G-N14PGM1TK6"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
document.addEventListener('DOMContentLoaded', () => {
    // --- 定数・設定 ---
    const STORAGE_KEY_POSTS = 'sky_color_posts';
    const STORAGE_KEY_POST_HISTORY = 'sky_color_post_history'; // 投稿履歴（タイムスタンプ配列）
    ////const MAX_RADIUS = 40;
    ////const MIN_RADIUS = 20;
    // 統一サイズ（px）
    const SHAPE_RADIUS = 20;
    // 1時間（ミリ秒）
    const ONE_HOUR_MS = 60 * 60 * 1000;
    // 1時間の投稿制限回数
    const HOURLY_POST_LIMIT = 3;

    // --- DOM要素 ---
    const svg = document.getElementById('japanMap'); // SVG要素 日本地図
    const postsLayer = document.getElementById('postsLayer'); // 投稿を表示するレイヤー
    const currentSelection = document.getElementById('currentSelection'); // 選択中の円
    const colorPicker = document.getElementById('colorPicker'); // カラーパレット
    const submitBtn = document.getElementById('submitBtn'); // 投稿ボタン
    // const geoBtn = document.getElementById('geoBtn'); // 位置情報取得ボタン（コメントアウト：手動選択のみに変更）
    const statusMessage = document.getElementById('statusMessage'); // ステータスメッセージ表示
    const tooltip = document.getElementById('tooltip'); // ツールチップ
    const resetLocalBtn = document.getElementById('resetLocalBtn'); // ! ローカルデータリセットボタン デバッグ用

    // --- 状態管理 ---
    let selectedPosition = null; // {x, y}
    let currentUser = null;
    let blockedPatterns = []; // ブロック対象パターンリスト

    // --- 初期化処理 ---
    init();

    function init() {
        // フィルタリストの読み込み
        loadFilterPatterns();

        // 認証検知（匿名サインインを行う）
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                console.log('User ID:', user.uid);
                // Firestore側の投稿制限チェックなどがあればここで行う
            } else {
                // 匿名でサインイン
                signInAnonymously(auth).catch((err) => {
                    showMessage('認証エラーが発生しました', 'error');
                    console.error(err);
                });
            }
        });

        // リアルタイムリスナーと初期描画
        setupRealtimeListener();
        loadAndDrawPosts();
        checkPostLimit();

        // イベントリスナー登録
        svg.addEventListener('click', handleMapClick);
        // geoBtn.addEventListener('click', handleGeoLocation); // コメントアウト：位置情報取得機能を無効化
        resetLocalBtn.addEventListener('click', handleReset);
        submitBtn.addEventListener('click', handleSubmit);
        // ツールチップ制御 (イベント委譲)
        postsLayer.addEventListener('mouseover', showTooltip);
        postsLayer.addEventListener('mousemove', moveTooltip);
        postsLayer.addEventListener('mouseout', hideTooltip);
    }

    // --- メインロジック ---

    // フィルタパターンリストの読み込み
    async function loadFilterPatterns() {
        try {
            const response = await fetch('ng-words.json');
            const data = await response.json();
            blockedPatterns = data.hashes || [];
            console.log('フィルタパターンを読み込みました:', blockedPatterns.length, '件');
        } catch (error) {
            console.error('フィルタリストの読み込みに失敗しました:', error);
            blockedPatterns = [];
        }
    }

    // テキストを識別子に変換
    async function convertToIdentifier(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const buffer = await crypto.subtle.digest('SHA-256', data);
        const array = Array.from(new Uint8Array(buffer));
        const identifier = array.map(b => b.toString(16).padStart(2, '0')).join('');
        return identifier;
    }

    // テキスト内に不適切な内容が含まれているかチェック
    async function containsInvalidContent(text) {
        if (!text || !blockedPatterns || blockedPatterns.length === 0) {
            return false;
        }

        // 正規化：小文字化、全角→半角変換など
        const normalizedText = text.toLowerCase().trim();
        
        // 単語単位でチェック
        const words = normalizedText.split(/[\s、。,.!?！？]+/);
        for (const word of words) {
            if (word.length === 0) continue;
            const id = await convertToIdentifier(word);
            if (blockedPatterns.includes(id)) {
                return true;
            }
        }

        // 文字列全体もチェック
        const fullId = await convertToIdentifier(normalizedText);
        if (blockedPatterns.includes(fullId)) {
            return true;
        }

        return false;
    }

    /*
    // 位置情報取得処理（コメントアウト：手動選択のみに変更）
    function handleGeoLocation() {
        if (isDailyLimitReached()) {
            showMessage('本日は既に投稿済みです。', 'error');
            return;
        }

        if (!navigator.geolocation) {
            showMessage('お使いのブラウザは位置情報をサポートしていません。', 'error');
            return;
        }

        showMessage('位置情報を取得中...', 'normal');
        geoBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const svgPos = latLonToSVG(lat, lon);
                selectPosition(svgPos.x, svgPos.y);
                showMessage(`現在地を取得しました！ (${lat.toFixed(2)}, ${lon.toFixed(2)})。`, 'success');
                geoBtn.disabled = false;
            },
            (error) => {
                console.error(error);
                let msg = '位置情報の取得に失敗しました！';
                if (error.code === 1) msg = '位置情報の利用が許可されていません！';
                showMessage(msg + ' 地図をクリックして選択してください。', 'error');
                geoBtn.disabled = false;
            }
        );
    }

    function latLonToSVG(lat, lon) {
        const x = (lon - 127.7) * 37.4 + 100;
        const y = (lat - 26.2) * -26.0 + 650;
        return { x, y };
    }
    */

    function setupRealtimeListener() {
        const q = query(collection(db, 'posts'));
        onSnapshot(q, (snapshot) => {
            // onSnapshot は初回で同期的にコールされることがあるため
            // ここで処理をマクロタスクに遅延させ、スクリプト内の定数初期化が
            // 終了してから実行されるようにする（ONE_HOUR_MS の TDZ 回避）。
            setTimeout(async () => {
                for (const change of snapshot.docChanges()) {
                    if (change.type === 'added') {
                        const post = change.doc.data();
                        post.id = change.doc.id;
                        // サーバ側の date がある想定。古い投稿は表示しない
                        if (!isPostExpired(post)) {
                            await drawPost(post);
                        }
                    }
                }
                // 受信後に念のため古い要素を掃除
                pruneOldPosts();
            }, 0);
        });
    }

    function selectPosition(x, y) {
        selectedPosition = { x, y };
        currentSelection.setAttribute('cx', x);
        currentSelection.setAttribute('cy', y);
        currentSelection.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'この場所に色を置く';
    }

    function handleMapClick(evt) {
        if (isPostLimitReached()) {
            showMessage('投稿制限に達しました。しばらく待ってから再度お試しください。', 'error');
            return;
        }
        const point = getSVGCoordinates(evt);
        selectPosition(point.x, point.y);
        showMessage('位置を選択しました。色を決めてボタンを押してください。');
    }

    // 投稿ボタンクリック時の処理（async にして await を使用可能にする）
    async function handleSubmit() {
        if (!selectedPosition) return;
        if (isPostLimitReached()) {
            showMessage('エラー: 投稿制限に達しました！', 'error');
            return;
        }

        const color = colorPicker.value;
        // 投稿時に一言を入力（任意） — フォームの input#messageInput から取得
        const noteInput = document.getElementById('messageInput');
        const note = noteInput ? (noteInput.value || '').trim() : '';

        // 内容チェック
        if (note && await containsInvalidContent(note)) {
            showMessage('投稿内容に不適切な言葉が含まれています。修正してください。', 'error');
            return;
        }

        // サイズを統一する（ランダム化をやめる）
        const radius = SHAPE_RADIUS;

        // 構築する投稿オブジェクト（ローカルで描画するため）
        const newPost = {
            color: color,
            x: selectedPosition.x,
            y: selectedPosition.y,
            r: radius,
            date: new Date().toISOString(),
            note: note
        };

        submitBtn.disabled = true;
        submitBtn.textContent = '送信中...';

        try {
            // Firestore に保存
            const docRef = await addDoc(collection(db, 'posts'), {
                color: color,
                x: selectedPosition.x,
                y: selectedPosition.y,
                r: radius,
                date: serverTimestamp(),
                note: note,
                uid: currentUser ? currentUser.uid : null
            });

            // ユーザー最終投稿日時更新（匿名ユーザー対応）
            // 履歴を配列で保持するように変更（Firestore側は簡易的に最終投稿日時のみ更新、またはサブコレクションで管理が理想だが、
            // ここでは既存の lastPostDate を更新しつつ、クライアント側で回数制限を行う）
            if (currentUser) {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    lastPostDate: serverTimestamp()
                }, { merge: true });
            }

            // ローカルにも保存（デバッグ用）および描画
            newPost.id = docRef.id;
            savePost(newPost);
            // 投稿履歴を更新
            updatePostHistory();

            // クライアント側では1時間フィルタを適用しているため、描画は条件に合うときのみ行う
            if (!isPostExpired(newPost)) await drawPost(newPost);

            // 投稿後は入力をクリア
            if (noteInput) noteInput.value = '';

            // 状態更新
            selectedPosition = null;
            currentSelection.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '投稿完了';
            checkPostLimit();
            showMessage('投稿成功！ありがとうございました！', 'success');
        } catch (error) {
            console.error('Error adding document: ', error);
            showMessage('エラーが発生しました。もう一度お試しください。', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'この場所に色を置く';
        }
    }

    // --- データ操作（localStorageを併用、デバッグ用） ---
    async function loadAndDrawPosts() {
        const posts = getPosts();
        const now = Date.now();
        for (const p of posts) {
            if (!isPostExpired(p, now)) {
                await drawPost(p);
            }
        }
    }

    // 現在時刻(ms)を取得するユーティリティ
    function getPostTimeMs(post) {
        if (!post || !post.date) return 0;
        // Firestore Timestamp object
        if (post.date.toDate && typeof post.date.toDate === 'function') {
            return post.date.toDate().getTime();
        }
        // ISO文字列
        if (typeof post.date === 'string') {
            const t = Date.parse(post.date);
            return isNaN(t) ? 0 : t;
        }
        // 数値ミリ秒
        if (typeof post.date === 'number') return post.date;
        // seconds/nanos オブジェクト
        if (post.date.seconds) return post.date.seconds * 1000;
        return 0;
    }

    function isPostExpired(post, nowMs) {
        const now = nowMs || Date.now();
        const t = getPostTimeMs(post);
        if (!t) return true; // 日付が取れなければ除外
        return (now - t) > ONE_HOUR_MS;
    }

    // 画面に表示されている投稿で1時間以上経過したものを削除
    function pruneOldPosts() {
        const now = Date.now();
        const children = Array.from(postsLayer.children);
        children.forEach(el => {
            const timeMs = el.dataset && el.dataset.time ? parseInt(el.dataset.time, 10) : NaN;
            if (!timeMs || (now - timeMs) > ONE_HOUR_MS) {
                el.remove();
            }
        });
    }

    // 定期的に表示を掃除（1分ごと）
    setInterval(pruneOldPosts, 60 * 1000);

    function getPosts() {
        const json = localStorage.getItem(STORAGE_KEY_POSTS);
        return json ? JSON.parse(json) : [];
    }

    function savePost(post) {
        const posts = getPosts();
        posts.push(post);
        localStorage.setItem(STORAGE_KEY_POSTS, JSON.stringify(posts));
    }

    // 投稿履歴を取得（タイムスタンプの配列）
    function getPostHistory() {
        const json = localStorage.getItem(STORAGE_KEY_POST_HISTORY);
        return json ? JSON.parse(json) : [];
    }

    // 投稿履歴を更新（現在時刻を追加し、1時間以上前のものを削除）
    function updatePostHistory() {
        let history = getPostHistory();
        const now = Date.now();
        // 新しい投稿を追加
        history.push(now);
        // 1時間以内のものだけ残す
        history = history.filter(time => (now - time) < ONE_HOUR_MS);
        localStorage.setItem(STORAGE_KEY_POST_HISTORY, JSON.stringify(history));
    }

    // 投稿制限に達しているかチェック
    function isPostLimitReached() {
        let history = getPostHistory();
        const now = Date.now();
        // 1時間以内の投稿数をカウント（ついでに掃除）
        const recentPosts = history.filter(time => (now - time) < ONE_HOUR_MS);
        
        // 掃除した結果を保存
        if (recentPosts.length !== history.length) {
            localStorage.setItem(STORAGE_KEY_POST_HISTORY, JSON.stringify(recentPosts));
        }
        
        return recentPosts.length >= HOURLY_POST_LIMIT;
    }

    async function checkPostLimit() {
        if (isPostLimitReached()) {
            submitBtn.disabled = true;
            submitBtn.textContent = '投稿制限中（1時間に3回まで）';
            showMessage('投稿制限に達しました。しばらくお待ちください。', 'normal');
            return;
        } else {
            // 制限に達していなければボタンの状態をリセット（選択中なら有効化）
            if (selectedPosition) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'この場所に色を置く';
            }
        }
    }

    function handleReset() {
        if (confirm('本当に全データを削除しますか？')) {
            localStorage.removeItem(STORAGE_KEY_POSTS);
            localStorage.removeItem(STORAGE_KEY_POST_HISTORY);
            
            // Firestore側のデータ削除
            const q = query(collection(db, 'posts'));
            getDocs(q).then((snapshot) => {
                snapshot.forEach((doc) => {
                    deleteDoc(doc.ref);
                });
                location.reload();
            }).catch((error) => {
                console.error('Error deleting documents: ', error);
                showMessage('データ削除中にエラーが発生しました', 'error');
            });
        }
    }
    // --- 描画・UI関連 ---
    async function drawPost(post) {
        // 内容チェック（表示前に確認）
        if (post.note && await containsInvalidContent(post.note)) {
            console.warn('不適切な投稿をスキップしました:', post.id);
            return; // 表示しない
        }

        const gradientId = `grad-${post.id || Math.random().toString(36).substr(2, 9)}`;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.prepend(defs);
        }

        // 絵の具風：中心は不透明(100%)、境界はグラデーションで透明に
        const radialGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        radialGradient.setAttribute('id', gradientId);
        radialGradient.setAttribute('cx', '50%');
        radialGradient.setAttribute('cy', '50%');
        radialGradient.setAttribute('r', '50%');
        radialGradient.setAttribute('fx', '50%');
        radialGradient.setAttribute('fy', '50%');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', post.color);
        stop1.setAttribute('stop-opacity', '1'); // 中心は完全不透明

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '70%'); // 70%まで不透明を保つ
        stop2.setAttribute('stop-color', post.color);
        stop2.setAttribute('stop-opacity', '1');

        const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop3.setAttribute('offset', '100%');
        stop3.setAttribute('stop-color', post.color);
        // 全体を100%不透明にする（境界の透明化を無効化）
        stop3.setAttribute('stop-opacity', '1');

        radialGradient.appendChild(stop1);
        radialGradient.appendChild(stop2);
        radialGradient.appendChild(stop3);
        defs.appendChild(radialGradient);

        // ランダムな絵の具風の形状を生成（不規則なパスを使用）
        // 描画は統一サイズで表示する
        const baseRadius = SHAPE_RADIUS;
        const paintShape = generatePaintShape(post.x, post.y, baseRadius);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', paintShape);
        path.setAttribute('fill', `url(#${gradientId})`);
        path.classList.add('post-circle');
        path.dataset.date = post.date ? (post.date.toDate ? post.date.toDate().toLocaleString() : new Date(post.date).toLocaleString()) : '';
        path.dataset.time = getPostTimeMs(post) || '';
        path.dataset.color = post.color;
        path.dataset.note = post.note || post.message || '';
        postsLayer.appendChild(path);
    }

    // 絵の具を塗ったようなランダムな形状を生成する関数
    function generatePaintShape(cx, cy, radius) {
        const points = 26; // 頂点数（多いほど滑らか）
        const angleStep = (Math.PI * 2) / points;
        let pathData = '';

        for (let i = 0; i <= points; i++) {
            const angle = i * angleStep;
            // ランダムな変動を加えて不規則な形に（80%〜120%の範囲で変動）
            const randomFactor = 0.8 + Math.random() * 0.4;
            const r = radius * randomFactor;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);

            if (i === 0) {
                pathData += `M ${x} ${y}`;
            } else {
                // 滑らかな曲線にするため、前の点との間に制御点を設定
                const prevAngle = (i - 1) * angleStep;
                const prevR = radius * (0.8 + Math.random() * 0.4);
                const prevX = cx + prevR * Math.cos(prevAngle);
                const prevY = cy + prevR * Math.sin(prevAngle);
                
                // 制御点を計算（ベジェ曲線用）
                const cpX = (prevX + x) / 2 + (Math.random() - 0.5) * radius * 0.3;
                const cpY = (prevY + y) / 2 + (Math.random() - 0.5) * radius * 0.3;
                
                pathData += ` Q ${cpX} ${cpY}, ${x} ${y}`;
            }
        }
        pathData += ' Z'; // パスを閉じる
        return pathData;
    }

    function getSVGCoordinates(evt) {
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function showMessage(msg, type = 'normal') {
        statusMessage.textContent = msg;
        statusMessage.className = 'status ' + type;
    }

    // --- ツールチップ ---
    function showTooltip(evt) {
        // どの要素でも post-circle クラスを持っていればツールチップを表示する
        if (evt.target && evt.target.classList && evt.target.classList.contains('post-circle')) {
            const date = evt.target.dataset.date;
            const color = evt.target.dataset.color;
            const note = evt.target.dataset.note;
            tooltip.innerHTML = `日時: ${date}<br>ソラ: <span style="color:${color}">███</span> ${color}` + (note ? `<br>一言: ${escapeHtml(note)}` : '');
            tooltip.style.display = 'block'; //TODO ツールチップ表示改善
        }
    }

    // シンプルなエスケープ（XSS軽減）
    function escapeHtml(str) {
        return String(str).replace(/[&<>"]/g, function (s) {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]);
        });
    }

    function moveTooltip(evt) {
        tooltip.style.left = (evt.pageX + 0) + 'px';
        tooltip.style.top = (evt.pageY - 50) + 'px';
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }
});
