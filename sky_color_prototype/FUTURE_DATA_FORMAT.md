# 将来のデータ保存フォーマット案 (Firebase / Firestore移行用)

将来的にバックエンド（Firebase Firestoreなど）を導入し、全ユーザーでデータを共有する場合のデータモデル案です。

## Firestore コレクション設計

### `posts` コレクション
各ドキュメントが1つの投稿を表します。

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| `id` | String | ドキュメントID (自動生成) |
| `uid` | String | ユーザーID (Firebase Auth)。1人1回制限のチェックに使用。 |
| `color` | String | カラーコード (例: "#87CEEB") |
| `x` | Number | SVG座標系でのX座標 |
| `y` | Number | SVG座標系でのY座標 |
| `r` | Number | 円の半径 (20-40) |
| `createdAt` | Timestamp | 投稿日時 |
| `deviceType` | String | (任意) "mobile", "desktop" など |

## インデックス設定
- `createdAt` の降順でクエリすることが多いため、インデックスが必要になる可能性があります。
- `uid` でクエリして「今日の投稿済みチェック」を行う場合、複合インデックス (`uid` + `createdAt`) が必要になるかもしれません。

## セキュリティルール案 (概要)
- **read**: 全員許可 (`allow read: if true;`)
- **create**: 認証済みユーザーのみ。かつ、バリデーション（色は正しい形式か、座標は範囲内か）を通過した場合のみ。
- **update/delete**: 作成者本人のみ、あるいは管理者のみ。

## 1日1回制限の実装アプローチ
クライアントサイドだけでなく、サーバーサイド（Firestore Security Rules または Cloud Functions）でも制限をかけるのが望ましいです。
例: `users` コレクションを作り、`lastPostDate` を記録してチェックする等。
