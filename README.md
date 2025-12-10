# 日本をソラ色に - Sky Color Project

![Sky Color Project](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 概要

**日本をソラ色に**は、日本全国のユーザーが今見ている空の色を共有し、日本地図をリアルタイムで彩るインタラクティブなWebアプリケーションです。

たまには上を見上げて、空の色を見てみませんか？  
そして、この国を空の色で塗りましょう。

### 必要環境
- モダンブラウザ（Chrome, Firefox, Safari, Edge）
- インターネット接続

## 使い方
1. **空の色を選択**: カラーピッカーで現在の空の色を選びます
2. **位置を選択**: 日本地図上の任意の場所をクリック
3. **メッセージ入力**（任意）: 一言メッセージを追加できます
4. **投稿**: 「この場所に色を置く」ボタンをクリック

投稿された色は1時間表示され、その後自動的に消去されます。

## 🔒 プライバシーとセキュリティ
- **匿名認証**: ユーザーの個人情報は収集しません
- **ローカルストレージ**: 投稿制限の管理に使用
- **サーバーサイド検証**: セキュリティルールによる保護

### フィルタパターンの追加

不適切な言葉をブロックするには、`ng-words.json`にパターンを追加します：

```javascript
// ブラウザのコンソールでハッシュを生成
async function generateHash(word) {
  const encoder = new TextEncoder();
  const data = encoder.encode(word.toLowerCase().trim());
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const array = Array.from(new Uint8Array(buffer));
  return array.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 使用例
await generateHash('ブロックしたい言葉');
```

生成されたハッシュを`ng-words.json`の`hashes`配列に追加してください。

## PR
プルリクエスト歓迎! 大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## ライセンス
このプロジェクトはMITライセンスの下で公開されています。

## 作者
Nosuke

- GitHub: [@true-nosuke](https://github.com/true-nosuke)

---