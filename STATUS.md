# 2026-10-25 追加状況

- 架空施設「サンプル旅館 こもれび庵」をsamples/komorebi/に分離。実在施設名・連絡先・公式サイトリンクを画面から除去。
- 独自の架空ルール、その他要望専用の備考、食事誘導、回答状態、確約でない旨を日英で表示。
- 入口にAI生成イラストを組込み。実施設の写真ではない旨を明示。スマホ向けWebPを同梱。
- 静的サンプルは外部送信・永続保存なし、再読込でリセット。ぎをん版・本体seedは維持。
- 73テスト成功、build成功。実ブラウザ・iPhone描画は未検証。
- 配布/QR/無料試験の具体的な手順はdocs/PILOT-PLAN.md。
- 新しい公開URL、掲示用QR、実利用環境は未作成。公開・本番認証・本番DB・課金の設定なし。GitHub書込の403は未解決。

---

# Stay Concierge — 2026-10-20

## 完了（ローカル検証済み）
- ZIPルートHANDOFF.md / STATUS.mdと対象GitHubを確認。mainは1fe96a634bc6d93b93430feda0eb55c45444450b、空のindex.htmlのみ。ZIP/sourceをルート構成で採用し、既存index.htmlを維持。
- 備考は「確認項目に当てはまらないその他のご要望」専用。日英で下の食事ヒアリングへ誘導。
- 食事ヒアリングの分岐・回答確認・注意書き・デモ日付切替を本体へ統合。
- 未回答・回答済み・要確認を表示。申告は対応・安全性の確約ではなく、自動承認しない。
- 施設/予約/案内版別の保存API、同時更新制御、宿側予約詳細での閲覧、owner限定削除を追加。
- 既存セッション/CSRF/管理者認証/施設権限を再利用。認証設定の新規実行なし。
- property.demo=1専用。MAIL_MODE=disabled、直接予約初期OFF、既存確認項目1〜7の本文・条件を維持。既存seed2件とwrangler.toml.exampleはZIPとバイト一致。
- 0004_meal_demo.sqlを追加。ローカルSQLiteでのみ検証。本番へ未適用。
- デモ回答は保存後7日で参照対象外、同予約の次回アクセスで物理削除。ownerによる即時削除も可能。
- npm test:70件成功。npm run build成功。JS構文/import確認成功。

## 未完了・制限
- iPhone Safari実機、実Cloudflare Pages/Functions/D1、実Access、実メールは未検証。
- 公開・デプロイ、本番認証、本番DB、課金設定、費用発生操作なし。
- GitHub保存は未完了。create_treeが403 Resource not accessible by integrationで拒否された。get_repoはadmin/push権限を返したが、連携の書込権限は不足。main/ブランチ/PR/公開環境の変更なし。
- 修正内容はローカルGitコミットと作業完了ZIPに保存。GitHub連携の書込権限回復後、公開連携を確認してリモート保存を再開する。
- 旧tests/model.test.jsとtests/loading.test.jsは参照先assets/model.js・data/demo.json等がZIPに欠落。削除せず残し、現行npm testから除外。元の「56件成功」はこのZIP全体では再現不可。今回の70件は現行機能・追加検証の件数。
- DOM試験はメモリーDOMであり、ブラウザ描画試験ではない。
- 宿側デモのカテゴリ判断はブラウザ内のみ。実際の管理画面は保存回答の閲覧・削除を実装。対応可否は自動決定しない。
- 仮規定・英文・健康情報の本運用上の同意/保持期間/削除窓口は宿の承認前。架空情報専用。
