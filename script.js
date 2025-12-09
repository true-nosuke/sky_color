import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBr7hYG63QrWjxB1BqNFxZ9qSMTuX9TFU4",
    authDomain: "sky-color-japan.firebaseapp.com",
    projectId: "sky-color-japan",
    storageBucket: "sky-color-japan.firebasestorage.app",
    messagingSenderId: "68931988312",
    appId: "1:68931988312:web:67c92fbc1664bbe889d32d",
    measurementId: "G-N14PGM1TK6"
};
document.addEventListener('DOMContentLoaded', () => {
    // --- 定数・設定 ---
    const STORAGE_KEY_POSTS = 'sky_color_posts';
    const STORAGE_KEY_LAST_DATE = 'sky_color_last_post_date';
    const MAX_RADIUS = 40;
    const MIN_RADIUS = 40;

    // --- DOM要素 ---
    const svg = document.getElementById('japanMap'); // SVG要素 日本地図
    const postsLayer = document.getElementById('postsLayer'); // 投稿を表示するレイヤー
    const currentSelection = document.getElementById('currentSelection'); // 選択中の円
    const colorPicker = document.getElementById('colorPicker'); // カラーパレット
    const submitBtn = document.getElementById('submitBtn'); // 投稿ボタン
    const geoBtn = document.getElementById('geoBtn'); // 位置情報取得ボタン
    const statusMessage = document.getElementById('statusMessage'); // ステータスメッセージ表示
    const tooltip = document.getElementById('tooltip'); // ツールチップ
    const resetLocalBtn = document.getElementById('resetLocalBtn'); // ! ローカルデータリセットボタン デバッグ用

    // --- 状態管理 ---
    let selectedPosition = null; // {x, y}

    // --- 初期化処理 ---
    init();

    function init() {
        // 認証検知
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // ログイン済
                currentUser = user;
                console.log("User ID:", user.uid);
            } else {
                // 未ログイン - 匿名サインイン
                signInAnonymously(auth)
                showMessage('認証エラーが発生しました', 'error');
                console.error(error);
            }
        });
        setupRealtimeListener();
        loadAndDrawPosts();
        checkDailyLimit();

        // イベントリスナー登録
        svg.addEventListener('click', handleMapClick); //TODO: 手動で位置選択を削除

        geoBtn.addEventListener('click', handleGeoLocation);
        resetLocalBtn.addEventListener('click', handleReset);
        submitBtn.addEventListener('click', handleSubmit);
        // ツールチップ制御 (イベント委譲)
        postsLayer.addEventListener('mouseover', showTooltip);
        postsLayer.addEventListener('mousemove', moveTooltip);
        postsLayer.addEventListener('mouseout', hideTooltip);
    }

    // --- メインロジック ---

    // 他人のユーザーの投稿を取得 // ?ちょっと意味がわからない
    function setupRealtimeListener() {
        // 日付順に取得などのクエリが可能
        const q = query(collection(db, "posts")); // 必要に応じて limit(100) などを追加

        onSnapshot(q, (snapshot) => {
            // 変更があったドキュメントだけ処理することもできるが、
            // 簡易実装として全クリアして再描画、または追加分だけ描画
            // ここでは「追加されたものだけ描画」する形にします
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const post = change.doc.data();
                    post.id = change.doc.id; // IDを含める
                    drawPost(post);
                }
            });
        });
    }


    // 位置情報取得処理
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

                // 緯度経度をSVG座標に変換
                const svgPos = latLonToSVG(lat, lon);

                // 位置を選択状態にする
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

    // 緯度経度 -> SVG座標変換 (簡易補正)
    // TODO : 地図の投影法に合わせた正確な変換に改善する
    function latLonToSVG(lat, lon) {
        // SVGの座標系と地図の投影に合わせて調整した係数
        // 基準点: 那覇(26.2N, 127.7E) -> SVG(100, 650)付近
        // 基準点: 稚内(45.4N, 141.6E) -> SVG(620, 150)付近

        // 経度 (X軸)
        // 1度あたりのピクセル数: (620 - 100) / (141.6 - 127.7) ≈ 37.4
        const x = (lon - 127.7) * 37.4 + 100;

        // 緯度 (Y軸) - 北に行くほどYは小さくなる
        // 1度あたりのピクセル数: (150 - 650) / (45.4 - 26.2) ≈ -26.0
        const y = (lat - 26.2) * -26.0 + 650;

        return { x, y };
    }

    // 共通の位置選択処理
    function selectPosition(x, y) {
        selectedPosition = { x, y };

        // 選択マーカーを移動・表示
        currentSelection.setAttribute('cx', x);
        currentSelection.setAttribute('cy', y);
        currentSelection.style.display = 'block';

        // ボタン有効化
        submitBtn.disabled = false;
        submitBtn.textContent = 'この場所に色を置く';
    }

    // 地図クリック時の処理
    function handleMapClick(evt) {
        // 既に投稿済みの場合はクリック無効（オプション）
        if (isDailyLimitReached()) {
            showMessage('本日は既に投稿済みです。明日また来てください！', 'error');
            return;
        }

        // クリック位置をSVG内部座標に変換
        const point = getSVGCoordinates(evt);

        selectPosition(point.x, point.y);

        showMessage('位置を選択しました。色を決めてボタンを押してください。');
    }

    // 投稿ボタンクリック時の処理
    function handleSubmit() {
        if (!selectedPosition) return;
        if (isDailyLimitReached()) {
            showMessage('エラー: 本日は既に投稿済みです！', 'error'); //TODO: 色の変更は可能にする。
            return;
        }

        const color = colorPicker.value;
        const radius = Math.floor(Math.random() * (MAX_RADIUS - MIN_RADIUS + 1)) + MIN_RADIUS;
        // 1. 投稿データを保存
        try {
            await addDoc(collection(db, "posts"), {
                color: color,
                x: selectedPosition.x,
                y: selectedPosition.y,
                r: radius,
                date: serverTimestamp(), // サーバー時間
                uid: currentUser.uid     // 誰が投稿したか
            });
            // 2. ユーザーデータの最終投稿日時を更新
            await setDoc(doc(db, "users", currentUser.uid), {
                lastPostDate: serverTimestamp()
            }, { merge: true }); // 既存データを保持して更新

            // 保存
            savePost(newPost);

            // 描画
            drawPost(newPost);

            // 状態更新
            selectedPosition = null;
            currentSelection.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '投稿完了';

            checkDailyLimit(); // 制限チェックを再実行してUI更新
            showMessage('投稿成功！ありがとうございました！', 'success');
        } catch (error) {
            console.error("Error adding document: ", error);
            showMessage('エラーが発生しました。もう一度お試しください。', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'この場所に色を置く';
        }

        // --- データ操作 ---

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

            // 最終投稿日時を更新
            localStorage.setItem(STORAGE_KEY_LAST_DATE, new Date().toDateString());
        }

        function isDailyLimitReached() {
            const lastDate = localStorage.getItem(STORAGE_KEY_LAST_DATE);
            const today = new Date().toDateString();
            return lastDate === today;
        }

        async function checkDailyLimit(uid) { // ?ちょっと意味がわからない
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.lastPostDate) {
                    const lastDate = new Date(data.lastPostDate.toDate()).toDateString();
                    const today = new Date().toDateString();
                    if (lastDate === today) {
                        hasPostedToday = true;
                        updateUIForLimit();
                    }
                }
            }
        }

        function handleReset() { //TODO : デバッグ用 FireBase導入後削除
            if (confirm('本当に全データを削除しますか？')) {
                localStorage.removeItem(STORAGE_KEY_POSTS);
                localStorage.removeItem(STORAGE_KEY_LAST_DATE);
                location.reload();
            }
        }

        // --- 描画・UI関連 ---

        function drawPost(post) {
            // グラデーションIDを生成 (ユニークにする)
            const gradientId = `grad-${post.id}`;

            // SVGのdefs要素を取得（なければ作成されるはずだが、index.htmlにある前提）
            let defs = svg.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                svg.prepend(defs);
            }

            // 放射状グラデーションを作成
            // 中心(offset 0%)は選ばれた色、外側(offset 100%)は透明
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
            stop1.setAttribute('stop-opacity', '0.8'); // 中心は少し透けさせる

            const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop2.setAttribute('offset', '100%');
            stop2.setAttribute('stop-color', post.color);
            stop2.setAttribute('stop-opacity', '0'); // 外側は完全に透明

            radialGradient.appendChild(stop1);
            radialGradient.appendChild(stop2);
            defs.appendChild(radialGradient);

            // 円を作成
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', post.x);
            circle.setAttribute('cy', post.y);
            circle.setAttribute('r', post.r || 30);
            // fillに作成したグラデーションを指定
            circle.setAttribute('fill', `url(#${gradientId})`);
            // circle.setAttribute('opacity', '0.6'); // グラデーション側で透明度制御するので削除
            circle.classList.add('post-circle');

            // データ属性を持たせてツールチップで使う
            circle.dataset.date = new Date(post.date).toLocaleString();
            circle.dataset.color = post.color;

            postsLayer.appendChild(circle);
        }

        function getSVGCoordinates(evt) {
            const pt = svg.createSVGPoint();
            pt.x = evt.clientX;
            pt.y = evt.clientY;
            // SVGの座標変換行列を使ってスクリーン座標をSVG座標に変換
            return pt.matrixTransform(svg.getScreenCTM().inverse());
        }

        function showMessage(msg, type = 'normal') {
            statusMessage.textContent = msg;
            statusMessage.className = 'status ' + type;
        }

        // --- ツールチップ ---

        function showTooltip(evt) {
            if (evt.target.tagName === 'circle' && evt.target.classList.contains('post-circle')) {
                const date = evt.target.dataset.date;
                const color = evt.target.dataset.color;
                tooltip.innerHTML = `日時: ${date}<br>ソラ: <span style="color:${color}">███</span> ${color}`;
                tooltip.style.display = 'block';
            }
        }

        function moveTooltip(evt) {
            // マウスの少し右下に表示
            tooltip.style.left = (evt.pageX + 0) + 'px';
            tooltip.style.top = (evt.pageY - 50) + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }
    });
