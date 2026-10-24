import { secure } from './security.js';

export function renderAdmin() {
  return secure(new Response(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>宿の最終確認管理 | Stay Concierge</title>
  <link rel="stylesheet" href="/assets/confirmation.css">
  <link rel="stylesheet" href="/assets/admin.css">
  <script type="module" src="/assets/admin.js"></script>
</head>
<body>
  <header class="site-header"><a class="brand" href="/admin/">STAY CONCIERGE<span>PROPERTY WORKSPACE · DEMO</span></a><a href="/cdn-cgi/access/logout">ログアウト</a></header>
  <main class="admin-main">
    <p class="eyebrow">ご案内から、対応・引き継ぎまで</p>
    <h1>お迎えを、ひとつにつなぐ。</h1>
    <p class="attention">デモです。架空の予約だけでお試しください。URLを発行しただけでは宿泊者へ送信されません。</p>
    <label id="property-label" hidden>操作する宿<select id="property-select"></select></label>
    <p id="admin-status" role="status" aria-live="polite"></p>
    <nav id="admin-tabs" role="tablist" aria-label="管理メニュー"></nav>
    <section id="admin-content" role="tabpanel" aria-busy="true"></section>
    <noscript><p>JavaScriptが無効なため、管理機能を使えません。宿泊者情報を扱う操作は行われません。</p></noscript>
  </main>
  <footer>Stay Concierge · Demo · ログインしているスタッフだけが利用できます</footer>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}
