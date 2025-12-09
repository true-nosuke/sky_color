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
    const STORAGE_KEY_LAST_DATE = 'sky_color_last_post_date';
    const MAX_RADIUS = 40;
    const MIN_RADIUS = 20;

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
    let hasPostedToday = false;

    // --- 初期化処理 ---
    init();

    function init() {
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
        checkDailyLimit();

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
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const post = change.doc.data();
                    post.id = change.doc.id;
                    drawPost(post);
                }
            });
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
        if (isDailyLimitReached()) {
            showMessage('本日は既に投稿済みです。明日また来てください！', 'error');
            return;
        }
        const point = getSVGCoordinates(evt);
        selectPosition(point.x, point.y);
        showMessage('位置を選択しました。色を決めてボタンを押してください。');
    }

    // 投稿ボタンクリック時の処理（async にして await を使用可能にする）
    async function handleSubmit() {
        if (!selectedPosition) return;
        if (isDailyLimitReached()) {
            showMessage('エラー: 本日は既に投稿済みです！', 'error');
            return;
        }

        const color = colorPicker.value;
        const radius = Math.floor(Math.random() * (MAX_RADIUS - MIN_RADIUS + 1)) + MIN_RADIUS;

        // 構築する投稿オブジェクト（ローカルで描画するため）
        const newPost = {
            color: color,
            x: selectedPosition.x,
            y: selectedPosition.y,
            r: radius,
            date: new Date().toISOString()
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
                uid: currentUser ? currentUser.uid : null
            });

            // ユーザー最終投稿日時更新（匿名ユーザー対応）
            if (currentUser) {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    lastPostDate: serverTimestamp()
                }, { merge: true });
            }

            // ローカルにも保存（デバッグ用）および描画
            newPost.id = docRef.id;
            savePost(newPost);
            drawPost(newPost);

            // 状態更新
            selectedPosition = null;
            currentSelection.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '投稿完了';
            checkDailyLimit();
            showMessage('投稿成功！ありがとうございました！', 'success');
        } catch (error) {
            console.error('Error adding document: ', error);
            showMessage('エラーが発生しました。もう一度お試しください。', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'この場所に色を置く';
        }
    }

    // --- データ操作（localStorageを併用、デバッグ用） ---
    function loadAndDrawPosts() {
        const posts = getPosts();
        posts.forEach(drawPost);
    }

    function getPosts() {
        const json = localStorage.getItem(STORAGE_KEY_POSTS);
        return json ? JSON.parse(json) : [];
    }

    function savePost(post) {
        const posts = getPosts();
        posts.push(post);
        localStorage.setItem(STORAGE_KEY_POSTS, JSON.stringify(posts));
        localStorage.setItem(STORAGE_KEY_LAST_DATE, new Date().toDateString());
    }

    function isDailyLimitReached() {
        const lastDate = localStorage.getItem(STORAGE_KEY_LAST_DATE);
        const today = new Date().toDateString();
        return lastDate === today;
    }

    async function checkDailyLimit() {
        if (isDailyLimitReached()) {
            submitBtn.disabled = true;
            submitBtn.textContent = '本日の投稿は完了しています';
            showMessage('本日は既に投稿済みです。', 'success');
            return;
        }
        // Firestore 側でも確認したい場合は currentUser が入ってから行う
        if (currentUser) {
            try {
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    if (data.lastPostDate) {
                        const lastDate = new Date(data.lastPostDate.toDate()).toDateString();
                        const today = new Date().toDateString();
                        if (lastDate === today) {
                            submitBtn.disabled = true;
                            submitBtn.textContent = '本日の投稿は完了しています';
                            showMessage('本日は既に投稿済みです。', 'success');
                        }
                    }
                }
            } catch (e) {
                console.warn('checkDailyLimit firestore check failed', e);
            }
        }
    }

    function handleReset() {
        if (confirm('本当に全データを削除しますか？')) {
            localStorage.removeItem(STORAGE_KEY_POSTS);
            localStorage.removeItem(STORAGE_KEY_LAST_DATE);
            
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
    function drawPost(post) {
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
        stop3.setAttribute('offset', '100%'); // 境界で透明に（グラデーション）
        stop3.setAttribute('stop-color', post.color);
        stop3.setAttribute('stop-opacity', '0');

        radialGradient.appendChild(stop1);
        radialGradient.appendChild(stop2);
        radialGradient.appendChild(stop3);
        defs.appendChild(radialGradient);

        // ランダムな絵の具風の形状を生成（不規則なパスを使用）
        const baseRadius = post.r || 30;
        const paintShape = generatePaintShape(post.x, post.y, baseRadius);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', paintShape);
        path.setAttribute('fill', `url(#${gradientId})`);
        path.classList.add('post-circle');
        path.dataset.date = post.date ? (post.date.toDate ? post.date.toDate().toLocaleString() : new Date(post.date).toLocaleString()) : '';
        path.dataset.color = post.color;
        postsLayer.appendChild(path);
    }

    // 絵の具を塗ったようなランダムな形状を生成する関数
    function generatePaintShape(cx, cy, radius) {
        const points = 16; // 頂点数（多いほど滑らか）
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
    //! 表示されないバグあり
    function showTooltip(evt) {
        if (evt.target.tagName === 'circle' && evt.target.classList.contains('post-circle')) {
            const date = evt.target.dataset.date;
            const color = evt.target.dataset.color;
            tooltip.innerHTML = `日時: ${date}<br>ソラ: <span style="color:${color}">███</span> ${color}`;
            tooltip.style.display = 'block';
        }
    }

    function moveTooltip(evt) {
        tooltip.style.left = (evt.pageX + 0) + 'px';
        tooltip.style.top = (evt.pageY - 50) + 'px';
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }
});
