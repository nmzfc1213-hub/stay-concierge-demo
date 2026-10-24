# 2026-10-25 追記

架空サンプルはsamples/komorebi/、設定例はseeds/komorebi-sample.json。静的サンプルとして独立し、Cloudflare本体とぎをん版に上書きしない。
無料試験/リンク送付/共通QRと予約専用URLの違いはdocs/PILOT-PLAN.md。
現在の公開URLは今回のサンプル・イラストを反映していない。公開前の事前確認と、本番認証/本番DB/課金の禁止は継続。

---

# Stay Concierge — 引き継ぎ 2026-10-20

最初にこのファイル、STATUS.md、docs/MEAL-INTEGRATION.mdを読むこと。
対象GitHubは nmzfc1213-hub/stay-concierge-demo のみ。他のリポジトリを変更しない。

## 今回の差分
備考と食事回答の入力先を分離し、ZIPの静的試作の食事ヒアリングをCloudflare用の本体へ統合した。
public/assets/meal-model.js と meal-ui.js は静的試作を継承。guest.jsにアダプターを追加。
server/meal.jsと0004_meal_demo.sqlが保存と権限・入力チェックを担当する。
宿側の予約詳細から日本語の回答要約を確認できる。
既存確認項目1〜7、既存seed、実メール無効、直接予約OFFは維持。

## ローカル検証
npm test / npm run build。テストは実SQLiteとメモリーDOMを使い、実Cloudflare・Safariを再現するものではない。
旧model/loadingテストはZIPの参照ファイル欠落につき保持したまま現行testから除外。詳細はSTATUS.md。
既存マイグレーション0001〜0003に加えて0004が必要だが、本番への適用は禁止。

## 制約
- 本番化・公開反映・費用発生・既存機能削除は事前確認。
- 実認証・本番DB・課金を設定しない。実予約情報・実際の健康情報・秘密情報を入れない。
- 仮規定・英文・健康情報取扱いは未承認。アレルギー申告だけで対応可能と扱わない。
- 回答保存と重要事項の最終確認は独立。重要事項の完了は食事回答の完了・対応承認を意味しない。
- 本体はデモDB保存。元の静的プレビューはメモリー保存のみなので混同しない。
- 元のSitesの権限やCloudflare権限が移転済みとは扱わない。
- GitHubへのtree書込は連携権限不足の403で失敗。未保存。連携の書込権限が必要。main/ブランチを動かす前に公開連携を確認。
