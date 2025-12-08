document.addEventListener('DOMContentLoaded', () => {
    // --- 定数・設定 ---
    const STORAGE_KEY_POSTS = 'sky_color_posts';
    const STORAGE_KEY_LAST_DATE = 'sky_color_last_post_date';
    const MAX_RADIUS = 40;
    const MIN_RADIUS = 20;

    // --- DOM要素 ---
    const svg = document.getElementById('japanMap');
    const postsLayer = document.getElementById('postsLayer');
    const currentSelection = document.getElementById('currentSelection');
    const colorPicker = document.getElementById('colorPicker');
    const submitBtn = document.getElementById('submitBtn');
    const statusMessage = document.getElementById('statusMessage');
    const tooltip = document.getElementById('tooltip');
    const resetLocalBtn = document.getElementById('resetLocalBtn');

    // --- 状態管理 ---
    let selectedPosition = null; // {x, y}

    // --- 初期化処理 ---
    init();

    function init() {
        loadAndDrawPosts();
        checkDailyLimit();
        
        // イベントリスナー登録
        svg.addEventListener('click', handleMapClick);
        submitBtn.addEventListener('click', handleSubmit);
        resetLocalBtn.addEventListener('click', handleReset);
        
        // ツールチップ制御 (イベント委譲)
        postsLayer.addEventListener('mouseover', showTooltip);
        postsLayer.addEventListener('mousemove', moveTooltip);
        postsLayer.addEventListener('mouseout', hideTooltip);
    }

    // --- メインロジック ---

    // 地図クリック時の処理
    function handleMapClick(evt) {
        // 既に投稿済みの場合はクリック無効（オプション）
        if (isDailyLimitReached()) {
            showMessage('本日は既に投稿済みです。明日また来てください！', 'error');
            return;
        }

        // クリック位置をSVG内部座標に変換
        const point = getSVGCoordinates(evt);
        selectedPosition = { x: point.x, y: point.y };

        // 選択マーカーを移動・表示
        currentSelection.setAttribute('cx', point.x);
        currentSelection.setAttribute('cy', point.y);
        currentSelection.style.display = 'block';

        // ボタン有効化
        submitBtn.disabled = false;
        submitBtn.textContent = 'この場所に色を置く';
        
        showMessage('位置を選択しました。色を決めてボタンを押してください。');
    }

    // 投稿ボタンクリック時の処理
    function handleSubmit() {
        if (!selectedPosition) return;
        if (isDailyLimitReached()) {
            showMessage('エラー: 本日は既に投稿済みです。', 'error');
            return;
        }

        const color = colorPicker.value;
        const radius = Math.floor(Math.random() * (MAX_RADIUS - MIN_RADIUS + 1)) + MIN_RADIUS;
        
        const newPost = {
            id: Date.now().toString(),
            color: color,
            x: selectedPosition.x,
            y: selectedPosition.y,
            r: radius,
            date: new Date().toISOString()
        };

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
        showMessage('投稿しました！ありがとうございます。', 'success');
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

    function checkDailyLimit() {
        if (isDailyLimitReached()) {
            submitBtn.disabled = true;
            submitBtn.textContent = '本日の投稿は完了しています';
            showMessage('本日は既に投稿済みです。', 'success');
        }
    }

    function handleReset() {
        if(confirm('本当に全データを削除しますか？')) {
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
            tooltip.innerHTML = `日時: ${date}<br>色: <span style="color:${color}">■</span> ${color}`;
            tooltip.style.display = 'block';
        }
    }

    function moveTooltip(evt) {
        // マウスの少し右下に表示
        tooltip.style.left = (evt.pageX + 10) + 'px';
        tooltip.style.top = (evt.pageY + 10) + 'px';
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }
});
