
(() => {
  const root = document.getElementById('giwon-stay');
  const main = root.querySelector('#sc-main');
  const dictionary = {
    ja: { property:'ぎをんの月', title:'到着前の最終確認', subtitle:'大切なご案内を、ひとつずつ。', check:'この内容を読みました', acknowledge:'確認しました', back:'戻る', next:'内容を確認する', arrival:'到着予定とお申し出', arrivalLabel:'到着予定時刻', choose:'選んでください', normal:'15:00–18:00', late:'20:00以降（夜間チェックイン希望）', unknown:'未定', notes:'アレルギー・その他のお申し出（必須）', notesHelp:'架空データのみ。お申し出がなければ「なし」と入力してください。', error:'到着予定とお申し出を入力してください。', lateNote:'夜間チェックインは確約ではありません。宿へ直接ご相談ください。', review:'送信前にご確認ください', reviewHelp:'まだ最終確認は完了していません。', send:'この内容で確認を完了（デモ）', done:'確認完了（デモ）', doneHelp:'実際のサービスでは、この内容が宿のシステムに保存されます。', notSent:'このプレビューでは宿への送信・メール通知は行っていません。', seeAdmin:'宿側の一覧で結果を見る', receipt:'プレビュー内の確認日時', representative:'予約の代表者として確認します。', privacy:'個人情報の取扱い：ダミー・要・専門家確認。', contact:'宿への連絡', sampleContact:'公式掲載の連絡先（電話受付10:00–19:00）。この試作は宿へ通知しません。', wifi:'ご滞在のWi-Fi（デモ）', copy:'コピー', copied:'コピーしました', copyError:'表示された文字を長押ししてコピーしてください。', progress:'確認の進み具合' },
    en: { property:'Giwon no Tsuki', title:'Pre-arrival confirmation', subtitle:'A little preparation for a peaceful stay.', check:'I have read this information', acknowledge:'I have checked this', back:'Back', next:'Review my details', arrival:'Arrival & special requests', arrivalLabel:'Expected arrival time', choose:'Please select', normal:'15:00–18:00', late:'After 20:00 (late check-in request)', unknown:'Not decided yet', notes:'Allergies & other requests (required)', notesHelp:'Use fictional details only. Enter “None” if you have no requests.', error:'Please select an arrival time and enter your requests or “None”.', lateNote:'Late check-in is not guaranteed. Please contact the property directly.', review:'Review before completing', reviewHelp:'Your final confirmation is not complete yet.', send:'Complete confirmation (demo)', done:'Confirmation complete (demo)', doneHelp:'In the connected service, these details are saved to the property’s system.', notSent:'This preview does not submit to the property or send email.', seeAdmin:'See the result in the staff view', receipt:'Preview confirmation time', representative:'I confirm as the booking representative.', privacy:'Privacy: draft — expert review required.', contact:'Contact the property', sampleContact:'Official contact details (phone hours 10:00–19:00). This demo sends no notifications.', wifi:'Wi-Fi for your stay (demo)', copy:'Copy', copied:'Copied', copyError:'Touch and hold the displayed text to copy.', progress:'Confirmation progress' }
  };
  const config = {"propertyId": "property-giwon-demo", "slug": "giwon-demo", "name": {"ja": "ぎをんの月｜非公式試作", "en": "Giwon no Tsuki | Unofficial demo"}, "contact": {"phone": "075-532-5333", "email": "", "line": "", "formUrl": "https://giwon.cc/contact.html"}, "wifi": {"ssid": "NOT-CONFIGURED-DEMO", "password": "NOT-A-REAL-WIFI-PASSWORD"}, "notificationEmail": "demo@example.invalid", "guide": {"items": [{"id": "arrival", "audience": "all", "title": {"ja": "到着・出発の時間", "en": "Arrival & departure"}, "notice": {"tone": "deadline", "lead": {"ja": "チェックイン 15:00–18:00", "en": "Check-in 15:00–18:00"}, "sourceUrl": "https://giwon.cc/fas.html"}, "body": {"ja": "公式の施設案内に掲載された受付時間です。チェックアウトは原則10:00、一部プランは11:00。到着が遅れる場合は電話でご相談ください。この試作では予約プランの照合や到着許可は行いません。", "en": "Published check-in hours. Standard check-out is 10:00; some plans allow 11:00. Call if delayed. This demo does not verify your plan or approve late arrival."}}, {"id": "cancellation", "audience": "all", "title": {"ja": "キャンセル料", "en": "Cancellation charges"}, "notice": {"tone": "money", "lead": {"ja": "当日・連絡なしの不泊：100％", "en": "Same-day cancellation / no-show: 100%"}, "sourceUrl": "https://giwon.cc/terms.html"}, "body": {"ja": "公開案内の目安は、宿泊2〜7日前50％、前日80％。約款では比率の対象を基本宿泊料としています。これは予約別の請求額ではありません。実際の適用条件は予約確認書と宿へ確認してください。ここでの確認は予約条件を変更しません。", "en": "Published schedule: 2–7 days before arrival 50%; previous day 80%. The terms use the basic accommodation charge as the calculation base. Check your booking terms with the property; this is not a bill or a change to your booking."}}, {"id": "charges", "audience": "all", "title": {"ja": "事前振込の対象になる予約", "en": "Bookings requiring advance payment"}, "notice": {"tone": "money", "lead": {"ja": "対象予約は、宿からの振込案内をご確認ください", "en": "If applicable, follow the property’s payment instructions"}, "sourceUrl": "https://giwon.cc/fas.html"}, "body": {"ja": "現地決済の予約でも、土曜・連休・特別期間や高額な連泊・団体利用では事前振込を求める掲載があります。対象・金額・期日は宿からの案内で確認。この試作は振込依頼・決済・入金確認をしません。宿泊税の金額も未設定です。", "en": "Some pay-at-property stays require advance transfer, including Saturdays, holidays, special periods or high-value stays. Confirm applicability, amount and deadline with the property. This demo takes no payment and has no accommodation-tax amount configured."}}, {"id": "rules", "audience": "all", "title": {"ja": "禁煙と清掃費の規定", "en": "Smoking & cleaning charges"}, "notice": {"tone": "money", "lead": {"ja": "客室喫煙等：清掃費30,000円の規定", "en": "Room-smoking violations: ¥30,000 cleaning provision"}, "sourceUrl": "https://giwon.cc/terms.html"}, "body": {"ja": "館内は禁煙で、加熱式たばこも対象です。客室喫煙・吸い殻等の持込について、退館・清掃費や破損時の追加請求の規定があります。判定基準を含む詳細は公式約款をご確認ください。試作で請求は発生しません。", "en": "Indoor smoking restrictions include heated tobacco. The terms describe departure, cleaning and additional damage charges for room-smoking violations or bringing in cigarette ends. Read the full criteria in the official terms. This demo issues no charges."}}, {"id": "dinner", "audience": "dinner", "title": {"ja": "夕食の開始とご案内順", "en": "Dinner start time"}, "notice": {"tone": "deadline", "lead": {"ja": "夕食開始 17:30–18:30", "en": "Dinner starts 17:30–18:30"}, "sourceUrl": "https://giwon.cc/meal.html"}, "body": {"ja": "食事開始枠はチェックイン順で案内され、事前指定はできないとの掲載です。食事処は21:00まで。遅い到着の扱いは事前に宿へ確認してください。", "en": "Start slots are assigned in check-in order, without advance time selection. Dining closes at 21:00. Ask the property about delayed arrival."}}, {"id": "drinks", "audience": "dinner", "title": {"ja": "食事処への飲料持込み", "en": "Bringing drinks into the dining area"}, "notice": {"tone": "money", "lead": {"ja": "飲料持込み：追加料金3,000円の掲載", "en": "Outside drinks: published charge ¥3,000"}, "sourceUrl": "https://giwon.cc/meal.html"}, "body": {"ja": "対象は食事処への持込みです。予約時の相談が案内されています。1本・1組などの料金単位は公開文面だけでは確定できず、宿への確認が必要です。客室内の飲食へ同じ料金を適用する案内ではありません。", "en": "This concerns drinks brought into the dining area. Consult the property when booking; the charging unit needs confirmation. It is not a general charge for consuming drinks in your room."}}, {"id": "diet", "audience": "dinner", "title": {"ja": "食事制限・アレルギーの相談", "en": "Dietary restrictions & allergies"}, "notice": {"tone": "deadline", "lead": {"ja": "アレルギー：宿泊4日前までに宿へ相談", "en": "Allergies: contact the property at least 4 days before arrival"}, "sourceUrl": "https://giwon.cc/pdf/allergy_detail.pdf"}, "body": {"ja": "公式資料は直前・当日の対応不可や混入の可能性を案内しています。ベジタリアン・ビーガン・宗教上の食事制限は食事ページで対応不可の掲載。申告だけで食事対応や安全性が確約されることはありません。必ず公式資料と宿への直接相談をご利用ください。", "en": "The official allergy document states advance-notice limits and cross-contact risk. The meal page says vegetarian, vegan and religious dietary requirements cannot be accommodated. Submitting a request does not guarantee accommodation or safety; consult the property directly."}}], "info": [{"id": "celebration-orders", "audience": "dinner", "title": {"ja": "お祝いケーキ・デザート変更の締切", "en": "Celebration-order deadlines"}, "notice": {"tone": "deadline", "lead": {"ja": "ケーキ：宿泊2日前12:00まで\nデザート変更：前日12:00まで", "en": "Cake: 12:00 two days before arrival\nDessert upgrade: 12:00 the previous day"}, "sourceUrl": "https://giwon.cc/meal.html"}, "body": {"ja": "注文は宿への電話で確認します。繁忙日など受付できない場合があります。一般の別注料理の17時締切とは別の案内です。この試作から注文は確定しません。", "en": "Order by calling the property; availability may be restricted. These are not a general 17:00 special-dish deadline. This demo does not place an order."}}, {"id": "private-bath", "audience": "all", "title": {"ja": "貸切風呂", "en": "Private baths"}, "body": {"ja": "受付時間は16:00–24:00。利用枠はチェックイン時の予約です。公式の風呂ページでは、舞姫ノ間・古都ノ間に1回45分無料との掲載。他の客室への適用は確認が必要です。", "en": "Reservations are taken at check-in, with reception listed as 16:00–24:00. The bath page lists one free 45-minute session for Maihime and Koto rooms. Other-room eligibility needs confirmation."}}, {"id": "parking", "audience": "all", "title": {"ja": "駐車場・アクセス", "en": "Parking & access"}, "body": {"ja": "専用駐車場はありません。近隣の有料駐車場をご利用ください。祇園四条駅から徒歩約9分。経路は公式の交通案内で確認できます。", "en": "There is no dedicated parking. Use nearby paid parking. Gion-Shijo Station is about a 9-minute walk; consult the official access page."}}], "arrivalSlots": [{"id": "15-16", "label": {"ja": "15:00–16:00", "en": "15:00–16:00"}}, {"id": "16-17", "label": {"ja": "16:00–17:00", "en": "16:00–17:00"}}, {"id": "17-18", "label": {"ja": "17:00–18:00", "en": "17:00–18:00"}}, {"id": "18-20", "requiresContact": true, "label": {"ja": "18:00以降・20:00未満（要相談）", "en": "18:00–19:59 (contact the property)"}}, {"id": "late", "requiresContact": true, "label": {"ja": "20:00以降（要相談・夕食可否未確認）", "en": "20:00 or later (contact property; dinner unconfirmed)"}}, {"id": "unknown", "label": {"ja": "未定", "en": "Not decided yet"}}]}, "research": {"checkedOn": "2026-10-20", "status": "unofficial_prototype_property_approval_pending", "sources": ["https://maxjapan.co.jp/ryokan/giwon.html", "https://giwon.cc/fas.html", "https://giwon.cc/meal.html", "https://giwon.cc/terms.html", "https://giwon.cc/bath.html", "https://giwon.cc/access.html", "https://giwon.cc/contact.html", "https://giwon.cc/pdf/allergy_detail.pdf"], "pending": [{"id": "late-dinner", "origin": "user_example", "text": "20時以降は料理提供不可・減額なし", "reason": "公開ページではこの時刻と減額条件の組合せを確認できていない"}, {"id": "special-orders", "origin": "user_example", "text": "別注料理は当日17時まで", "reason": "一般の別注料理の締切は未確認。ケーキ等の公開締切とは別に確認する"}, {"id": "curfew", "origin": "official_conflict", "text": "門限：施設案内は午前1時、約款は午後11時", "reason": "公式ページ内で不一致。現在の運用を確認するまで断定しない"}, {"id": "dining-hours", "origin": "official_conflict", "text": "夕食開始・朝食時間にページ間差異", "reason": "試作は食事専用ページの時刻を参照するが、宿の承認前であることを明記"}, {"id": "bath-eligibility", "origin": "official_scope", "text": "貸切風呂の無料対象", "reason": "トップの一般的な表現より、風呂ページの客室限定の記載を優先して対象を広げない"}, {"id": "payment", "origin": "missing", "text": "対象日・支払期限・請求単位・税額・予約別の条件", "reason": "予約プランやOTAとの照合、決済や入金確認は未実装。銀行情報を作らない"}]}};
  const adapt = item => ({ ...item, ja:item.title.ja, en:item.title.en, bodyJa:item.body.ja, bodyEn:item.body.en });
  const items = config.guide.items.map(adapt);
  const referenceItems = config.guide.info.map(adapt);
  const date = offset => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const reservations = [
    { id:1, name:'Alex Morgan（架空）', arrival:date(1), departure:date(2), checked:[], slot:'', notes:'', completed:null },
    { id:2, name:'Jamie Taylor（架空）', arrival:date(2), departure:date(3), checked:[], slot:'', notes:'', completed:null },
    { id:3, name:'Demo Guest（架空）', arrival:date(3), departure:date(4), checked:[0,1,2,3], slot:'normal', notes:'なし', completed:new Date().toLocaleString('ja-JP') }
  ];
  for (const r of reservations) { r.profile={language:'ja', dinner:r.id===1, late:false}; r.oral=[]; }
  reservations[2].slot='15-16';
  const tasks=[{ id:1, reservationId:2, message:'18:30ごろ到着予定です。夕食について相談したいです。（架空の相談）', status:'open', assignee:'', notes:[] }];
  let language='ja', view='guest', selected=1, step=0, phase='welcome', filter='pending', adminTab='setup', showAdd=false, questionOpen=false, questionDraft='', staff='朝番スタッフ', workFilter='active';
  const visibleItems = r => items.filter(item=>item.audience==='dinner'?r.profile.dinner:item.audience==='late'?r.profile.late:true);
  const t = key => dictionary[language][key];
  const current = () => reservations.find(r=>r.id===selected);
  function el(tag, text, cls) {
    const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(cls)e.className=cls; return e;
  }
  function action(text, fn, primary=false) {
    const b=el('button',text,primary?'sc-primary cursor-interaction':'cursor-interaction'); b.type='button'; b.addEventListener('click',fn); return b;
  }
  function field(label, control) { const wrap=el('label',label,'sc-field'); wrap.append(control); return wrap; }
  function slotLabel(value) { const slot=config.guide.arrivalSlots.find(slot=>slot.id===value); return slot?slot.label[language]:value; }
  const needsContact = value => value==='late'||config.guide.arrivalSlots.find(slot=>slot.id===value)?.requiresContact;
  function textWithTime(parent,text) {
    for(const p of text.split(/(\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2})/g)) parent.append(/^\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2}$/.test(p)?el('span',p,'sc-time'):document.createTextNode(p));
  }
  function heading() { main.append(el('p','PRE-ARRIVAL · DEMO','sc-eyebrow'),el('h1',t('property')),el('p',t('subtitle'),'sc-subtitle')); }
  function openGuest(r) {
    selected=r.id; view='guest'; language=r.profile.language;
    questionOpen=false;questionDraft='';
    step=visibleItems(r).findIndex(item=>!r.checked.includes(items.indexOf(item)));
    phase=r.completed?'done':step<0?'arrival':'item';
    if(step<0)step=0;
    render();
  }
  function contact() {
    const box=el('section',undefined,'sc-bottom'); box.append(el('h3',t('contact')),el('p',t('sampleContact'),'sc-note'));
    const links=el('div',undefined,'sc-contact');
    const phone=el('a','075-532-5333');phone.href='tel:0755325333';
    const email=el('a',language==='ja'?'公式お問い合わせフォーム':'Official contact form'); email.href=config.contact.formUrl;email.target='_blank';email.rel='noreferrer';
    links.append(phone,email); box.append(links,el('p',t('privacy'),'sc-note')); main.append(box);
  }
  function wifi(card) {
    const details=el('details'); details.append(el('summary',t('wifi')));
    details.append(el('p',language==='ja'?'実際のWi-Fi名・パスワードは未設定です。正式運用では予約専用画面にだけ表示します。':'Real Wi-Fi credentials are not configured. In the connected service, they appear only on the private booking page.','sc-note'));
    card.append(details);
  }
  function guest() {
    const r=current(), visible=visibleItems(r); heading();
    const card=el('section',undefined,'sc-card'), booking=el('div',undefined,'sc-booking');
    booking.append(el('span',r.name),el('span',r.arrival)); card.append(booking);
    if(phase!=='done') {
      const progress=el('ol',undefined,'sc-steps'); progress.setAttribute('aria-label',t('progress'));
      const active=phase==='item'?step:phase==='arrival'?visible.length:visible.length+1;
      [...visible.map(i=>language==='ja'?i.ja:i.en),t('arrival'),language==='ja'?'内容確認':'Review'].forEach((title,i)=>{
        const p=el('li',`${i<visible.length && r.checked.includes(items.indexOf(visible[i]))?'✓ ':''}${i+1}`); p.setAttribute('aria-label',title);
        if(i===active)p.setAttribute('aria-current','step'); progress.append(p);
      });
      card.append(progress);
    }
    if(phase==='item') {
      const item=visible[step]; card.append(el('p',`${step+1} / ${visible.length}`,'sc-eyebrow'),el('h2',language==='ja'?item.ja:item.en));
      policy(card,item);
      const body=el('p'); textWithTime(body,language==='ja'?item.bodyJa:item.bodyEn); card.append(body);
      const label=el('label',undefined,'sc-check'), check=el('input'); check.type='checkbox'; check.checked=r.checked.includes(items.indexOf(item));
      label.append(check,el('span',t('check'))); card.append(label);
      const actions=el('div',undefined,'sc-actions');
      if(step>0)actions.append(action(t('back'),()=>{step--;render();}));
      const next=action(t('acknowledge'),()=>{
        if(!r.checked.includes(items.indexOf(item)))r.checked.push(items.indexOf(item));
        if(step<visible.length-1)step++;else phase='arrival';render();
      },true); next.disabled=!check.checked;
      check.addEventListener('change',()=>{next.disabled=!check.checked;});
      actions.append(next); card.append(actions);
    } else if(phase==='arrival') {
      card.append(el('h2',t('arrival')));
      const form=el('form'); form.noValidate=true;
      const select=el('select');
      for(const [value,label] of [['',t('choose')],...config.guide.arrivalSlots.map(slot=>[slot.id,slot.label[language]])]) {
        const option=el('option',label); option.value=value; select.append(option);
      }
      select.value=r.slot;
      select.addEventListener('change',()=>{r.slot=select.value;warning.hidden=!needsContact(select.value);});
      const notes=el('textarea'); notes.maxLength=2000; notes.value=r.notes;
      notes.addEventListener('input',()=>{r.notes=notes.value;});
      const warning=el('p',language==='ja'?'この到着時刻は事前相談が必要です。入力だけでは到着や夕食を承認しません。宿へ直接ご連絡ください。':'This arrival time needs prior discussion. Selecting it does not approve arrival or dinner. Contact the property directly.','sc-warning'); warning.hidden=!needsContact(r.slot);
      const error=el('p','','sc-alert'); error.hidden=true; error.setAttribute('role','alert');
      form.append(field(t('arrivalLabel'),select),warning,field(t('notes'),notes),el('p',t('notesHelp'),'sc-note'),el('p',t('privacy'),'sc-note'),error);
      const actions=el('div',undefined,'sc-actions');
      actions.append(action(t('back'),()=>{phase='item';step=visible.length-1;render();}));
      const next=action(t('next'),()=>{} ,true); next.type='submit'; actions.append(next); form.append(actions);
      form.addEventListener('submit',event=>{
        event.preventDefault();
        if(!r.slot || !r.notes.trim()) { error.hidden=false;error.textContent=t('error');(!r.slot?select:notes).focus();return; }
        phase='review';render();
      });
      card.append(form);
    } else if(phase==='review') {
      card.append(el('h2',t('review')),el('p',t('reviewHelp'),'sc-warning'));
      visible.forEach(item=>card.append(el('p','✓ '+(language==='ja'?item.ja:item.en),'sc-review')));
      card.append(el('h3',t('arrivalLabel')),el('p',slotLabel(r.slot)),el('h3',t('notes')),el('p',r.notes,'sc-review'));
      const label=el('label',undefined,'sc-check'), check=el('input');check.type='checkbox';label.append(check,el('span',t('representative'))); card.append(label);
      const actions=el('div',undefined,'sc-actions'); actions.append(action(t('back'),()=>{phase='arrival';render();}));
      const finish=action(t('send'),()=>{
        r.completed=new Date().toLocaleString(language==='ja'?'ja-JP':'en-GB');
        if(needsContact(r.slot)||!['なし','none','特になし'].includes(r.notes.trim().toLowerCase()))tasks.push({id:nextTaskId(),reservationId:r.id,message:(needsContact(r.slot)?'到着時刻の相談：'+slotLabel(r.slot)+'。 ':'')+r.notes,status:'open',assignee:'',notes:[]});
        phase='done';render();
      },true);
      finish.disabled=true;check.addEventListener('change',()=>{finish.disabled=!check.checked;});actions.append(finish);card.append(actions);
    } else {
      card.append(el('div','✓','sc-success'),el('h2',t('done')),el('p',t('doneHelp')),el('p',t('notSent'),'sc-warning'),el('p',`${t('receipt')}: ${r.completed}`,'sc-note'));
      const actions=el('div',undefined,'sc-actions');actions.append(action(t('seeAdmin'),()=>{view='admin';adminTab='work';render();},true));card.append(actions);
    }
    meal.entry(card,r);references(card,r);questions(card,r);wifi(card); main.append(card);contact();
  }
  function admin() {
    main.append(el('p','PROPERTY WORKSPACE · DEMO','sc-eyebrow'),el('h1','お迎えを、ひとつにつなぐ。'),el('p','ご案内から、質問への対応、次の担当者へ。','sc-subtitle'));
    const tabs=el('div',undefined,'sc-filter');
    for(const [id,label] of [['setup','案内を準備'],['work',`対応・引き継ぎ (${tasks.filter(q=>q.status!=='resolved').length})`],['list','予約一覧'],['guide','フロントの共通案内'],['research','規定の確認待ち'],['meal',meal.text('title')]]) {
      const b=action(label,()=>{adminTab=id;render();});b.setAttribute('aria-pressed',String(adminTab===id));tabs.append(b);
    }
    main.append(tabs);
    if(adminTab==='meal'){meal.admin();return;}
    if(adminTab==='setup'){setup();return;}
    if(adminTab==='work'){workboard();return;}
    if(adminTab==='guide'){commonGuide();return;}
    if(adminTab==='research'){research();return;}
    const counts=el('div',undefined,'sc-count');
    const pending=reservations.filter(r=>!r.completed).length;
    for(const [n,label] of [[pending,'未確認'],[reservations.length-pending,'確認完了']]) {
      const item=el('span');item.append(el('strong',String(n)),document.createTextNode(label));counts.append(item);
    }
    main.append(counts);
    const controls=el('div',undefined,'sc-filter');
    for(const [key,label] of [['pending','未確認のみ'],['all','すべて']]) {
      const b=action(label,()=>{filter=key;render();});b.setAttribute('aria-pressed',String(filter===key));controls.append(b);
    }
    controls.append(action('＋ 架空の予約を追加',()=>{showAdd=!showAdd;render();}));main.append(controls);
    if(showAdd) {
      const card=el('form',undefined,'sc-card');card.noValidate=true;
      const name=el('input');name.maxLength=100;name.placeholder='Demo Guest';
      const arrival=el('input');arrival.type='date';arrival.value=date(2);
      const departure=el('input');departure.type='date';departure.value=date(3);
      const error=el('p','','sc-alert');error.hidden=true;error.setAttribute('role','alert');
      card.append(el('h3','架空の予約を追加'),field('表示名（架空）',name),field('到着日',arrival),field('出発日',departure),error);
      const save=action('このプレビューへ追加',()=>{},true);save.type='submit';card.append(save);
      card.addEventListener('submit',e=>{
        e.preventDefault();if(!name.value.trim() || !arrival.value || departure.value<=arrival.value){error.hidden=false;error.textContent='表示名と、到着日より後の出発日を入力してください。';return;}
        reservations.push({id:Math.max(...reservations.map(r=>r.id))+1,name:name.value.trim(),arrival:arrival.value,departure:departure.value,checked:[],slot:'',notes:'',completed:null,profile:{language:'ja',dinner:false,late:false},oral:[]});showAdd=false;render();
      });main.append(card);
    }
    const list=reservations.filter(r=>filter==='all'||!r.completed).sort((a,b)=>a.arrival.localeCompare(b.arrival));
    if(!list.length)main.append(el('p','未確認の予約はありません。','sc-card'));
    for(const r of list) {
      const urgent=!r.completed&&r.arrival<=date(1), card=el('section',undefined,'sc-card sc-admin-card'+(urgent?' sc-urgent':''));
      card.append(el('p',r.completed?'✓ 確認完了':urgent?'要確認 · 到着前日／当日／超過':'未確認',urgent?'sc-alert':'sc-note'),el('h3',r.name),el('p',`${r.arrival} → ${r.departure}`,'sc-dates'));
      if(r.completed) {
        card.append(el('p','到着予定：'+slotLabel(r.slot)));
        if(needsContact(r.slot)||!['なし','none','特になし'].includes(r.notes.trim().toLowerCase()))card.append(el('p','申告があります。対応履歴と合わせて確認してください。','sc-warning'));
        card.append(el('p','申告：'+r.notes,'sc-review'),el('p','プレビュー内確認日時：'+r.completed,'sc-note'));
      } else card.append(el('p',`宿泊者の確認：${r.checked.length} / ${visibleItems(r).length} · 口頭説明：${r.oral.length}件`,'sc-note'));
      meal.badge(card,r);
      card.append(action('案内条件・口頭説明',()=>{selected=r.id;adminTab='setup';render();}));
      card.append(action('この予約の宿泊者画面を見る',()=>openGuest(r)));main.append(card);
    }
    main.append(el('p','※実ログイン・予約URLの発行・DB保存・通知は、このプレビューには接続していません。','sc-note'));
  }

  function nextTaskId(){return Math.max(0,...tasks.map(q=>q.id))+1;}
  function chooser(label,options,value){
    const select=el('select');
    for(const [key,name] of options){const option=el('option',name);option.value=key;select.append(option);}
    select.value=value;return {select,field:field(label,select)};
  }
  function questions(card,r){
    const box=el('section',undefined,'sc-bottom');
    box.append(el('h3',language==='ja'?'わからないこと、相談したいこと':'Questions & special requests'));
    box.append(action(language==='ja'?'質問・相談する':'Ask a question',()=>{questionOpen=!questionOpen;render();}));
    if(questionOpen){
      const form=el('form');form.noValidate=true;
      const input=el('textarea');input.value=questionDraft;input.maxLength=2000;input.addEventListener('input',()=>{questionDraft=input.value;});
      const error=el('p','','sc-alert');error.hidden=true;error.setAttribute('role','alert');
      form.append(field(language==='ja'?'質問（架空の内容）':'Your question (fictional details)',input),el('p',language==='ja'?'至急の場合は、電話などで宿へ直接ご連絡ください。':'For urgent matters, please contact the property directly.','sc-note'),error);
      const send=action(language==='ja'?'対応一覧へ送る（デモ）':'Send to staff queue (demo)',()=>{},true);send.type='submit';form.append(send);
      form.addEventListener('submit',event=>{
        event.preventDefault();if(!questionDraft.trim()){error.hidden=false;error.textContent=language==='ja'?'質問を入力してください。':'Please enter your question.';return;}
        tasks.push({id:nextTaskId(),reservationId:r.id,message:questionDraft.trim(),status:'open',assignee:'',notes:[]});questionDraft='';questionOpen=false;render();
      });box.append(form);
    }
    const labels=language==='ja'?{open:'受付済み・対応待ち',in_progress:'スタッフ対応中',resolved:'スタッフが対応済みとして記録'}:{open:'Received — awaiting staff',in_progress:'Staff are handling this',resolved:'Staff marked this as handled'};
    for(const q of tasks.filter(q=>q.reservationId===r.id))box.append(el('p',q.message,'sc-review'),el('p',labels[q.status],'sc-note'));
    box.append(el('p',language==='ja'?'このプレビュー内の記録です。実際の宿には送信されません。':'Preview only. Nothing is submitted to a real property.','sc-note'));
    card.append(box);
  }
  function setup(){
    const r=current(), card=el('section',undefined,'sc-card');
    const booking=chooser('案内する予約',reservations.map(r=>[String(r.id),r.name]),String(selected));
    booking.select.addEventListener('change',()=>{selected=Number(booking.select.value);render();});card.append(booking.field);
    card.append(el('p',`${r.arrival} → ${r.departure}`,'sc-dates'),el('h2','このお客様に、必要なご案内を。'));
    const lang=chooser('案内の言語',[['ja','日本語'],['en','English']],r.profile.language);card.append(lang.field);
    const mealLabel=el('label',undefined,'sc-check'), meal=el('input');meal.type='checkbox';meal.checked=r.profile.dinner;mealLabel.append(meal,el('span','夕食あり'));
    const lateLabel=el('label',undefined,'sc-check'), late=el('input');late.type='checkbox';late.checked=r.profile.late;lateLabel.append(late,el('span','夜間到着の予定'));
    const locked=r.checked.length>0||r.oral.length>0||r.completed;
    for(const input of [lang.select,meal,late])input.disabled=Boolean(locked);
    card.append(mealLabel,lateLabel);
    const preview=el('p','','sc-warning');
    function summary(){const count=4+(meal.checked?3:0);preview.textContent=`基本の4項目${meal.checked?' ＋ 夕食・飲料持込・食事相談':''} · 合計${count}項目`;}
    meal.addEventListener('change',summary);late.addEventListener('change',summary);summary();card.append(preview);
    if(locked)card.append(el('p','確認・説明を始めたため、案内条件を固定しています。','sc-note'));
    const actions=el('div',undefined,'sc-actions');actions.append(action('この内容で宿泊者の画面を開く',()=>{
      if(!locked)r.profile={language:lang.select.value,dinner:meal.checked,late:late.checked};openGuest(r);
    },true));card.append(actions,el('p','実配備後は、選択内容に合う予約専用URLとQRを発行できます。','sc-note'));main.append(card);
    const oral=el('section',undefined,'sc-card');oral.append(el('h3','スマホを使わないお客様には、口頭で。'),el('p','説明者とメモを残します。宿泊者本人の確認とは別記録です。','sc-note'));
    const unspoken=visibleItems(r).filter(item=>!r.oral.some(o=>o.index===items.indexOf(item)));
    for(const o of r.oral)oral.append(el('p',`✓ ${items[o.index].ja} · ${o.staff}`,'sc-review'),el('p',o.note,'sc-note'));
    if(unspoken.length){
      const item=chooser('説明した項目',unspoken.map(i=>[String(items.indexOf(i)),i.ja]),String(items.indexOf(unspoken[0])));
      const note=el('textarea');note.maxLength=2000;
      const error=el('p','','sc-alert');error.hidden=true;error.setAttribute('role','alert');
      oral.append(item.field,field('説明・引き継ぎメモ（架空）',note),error,action('口頭で説明したことを記録（デモ）',()=>{
        if(!note.value.trim()){error.hidden=false;error.textContent='説明した内容や引き継ぎ事項を入力してください。';return;}
        r.oral.push({index:Number(item.select.value),staff,note:note.value.trim()});render();
      }));
    }else oral.append(el('p','全項目の口頭説明記録があります。','sc-saved'));
    main.append(oral);
  }
  function workboard(){
    const who=chooser('操作するスタッフ（デモ）',[['朝番スタッフ','朝番スタッフ'],['夕番スタッフ','夕番スタッフ']],staff);
    who.select.addEventListener('change',()=>{staff=who.select.value;render();});main.append(who.field);
    const filters=el('div',undefined,'sc-filter');
    for(const [value,label] of [['active','未対応・対応中'],['mine','自分の担当'],['all','対応済みも表示']]){
      const b=action(label,()=>{workFilter=value;render();});b.setAttribute('aria-pressed',String(workFilter===value));filters.append(b);
    }main.append(filters);
    const list=tasks.filter(q=>workFilter==='all'||q.status!=='resolved'&&(workFilter!=='mine'||q.assignee===staff));
    if(!list.length)main.append(el('p','この条件の対応待ちはありません。','sc-card'));
    for(const q of list){
      const r=reservations.find(r=>r.id===q.reservationId), card=el('section',undefined,'sc-card');
      const labels={open:'未対応',in_progress:'対応中',resolved:'対応済み'};
      card.append(el('p',labels[q.status],q.status==='open'?'sc-warning':'sc-note'),el('h2',r.name),el('p',`到着日 ${r.arrival}`,'sc-note'),el('p',q.message,'sc-review'),el('p',`担当：${q.assignee||'未割り当て'}`,'sc-note'));
      for(const note of q.notes)card.append(el('p',`${note.staff} · ${note.at}\n${note.body}`,'sc-review'));
      const assignee=chooser('担当スタッフ',[['','未割り当て'],['朝番スタッフ','朝番スタッフ'],['夕番スタッフ','夕番スタッフ']],q.assignee);
      const state=chooser('対応状況',Object.entries(labels),q.status), note=el('textarea');note.maxLength=2000;
      const error=el('p','','sc-alert');error.hidden=true;error.setAttribute('role','alert');
      card.append(assignee.field,state.field,field('次の担当者へのメモ（宿泊者には非公開）',note),error);
      const actions=el('div',undefined,'sc-actions');
      actions.append(action('自分が対応する',()=>{assignee.select.value=staff;state.select.value='in_progress';}),action('担当・状況・メモを保存（デモ）',()=>{
        if(!note.value.trim()||(state.select.value!=='open'&&!assignee.select.value)){error.hidden=false;error.textContent='担当スタッフと引き継ぎメモを入力してください。';return;}
        q.status=state.select.value;q.assignee=assignee.select.value;q.notes.push({staff,at:new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}),body:note.value.trim()});render();
      },true));card.append(actions,action('このお客様の画面を見る',()=>openGuest(r)));main.append(card);
    }
  }
  function commonGuide(){
    main.append(el('h2',language==='ja'?'ご滞在の案内':'Your stay, made simple'),el('p',language==='ja'?'フロントの共通QRから開く、入力不要の案内。予約情報・Wi-Fi・他のお客様の情報は表示しません。':'General information from the reception QR. No form, private booking details or Wi-Fi credentials.','sc-note'));
    for(const item of [...items,...referenceItems].filter(item=>!item.audience||item.audience==='all')){
      const card=el('section',undefined,'sc-card'), body=el('p');textWithTime(body,language==='ja'?item.bodyJa:item.bodyEn);card.append(el('h3',language==='ja'?item.ja:item.en));policy(card,item);card.append(body);main.append(card);
    }
    contact();
  }
  function policy(parent,item){
    if(!item.notice)return;
    const money=item.notice.tone==='money';
    const box=el('aside',undefined,'sc-policy'+(money?' sc-money':''));
    const label=language==='ja'?(money?'重要 · 料金に関するご案内':'重要 · 時間・期限のご案内'):(money?'Important · charges & payment':'Important · times & deadlines');
    const lead=el('p',undefined,'sc-policy-lead');textWithTime(lead,item.notice.lead[language]);
    box.append(el('p',label,'sc-policy-label'),lead);
    const link=el('a',language==='ja'?'公式サイトの掲載内容を見る':'View the official source');link.href=item.notice.sourceUrl;link.target='_blank';link.rel='noreferrer';box.append(link);parent.append(box);
  }
  function references(parent,r){
    const box=el('section',undefined,'sc-bottom');box.append(el('h3',language==='ja'?'ご滞在ガイド':'Your stay guide'),el('p',language==='ja'?'必要なときに開いてください。確認チェックは不要です。':'Open when needed. No acknowledgement checkbox is required.','sc-note'));
    for(const item of referenceItems.filter(item=>item.audience!=='dinner'||r.profile.dinner)){
      const detail=el('details');detail.append(el('summary',language==='ja'?item.ja:item.en));policy(detail,item);
      const body=el('p');textWithTime(body,language==='ja'?item.bodyJa:item.bodyEn);detail.append(body);box.append(detail);
    }
    parent.append(box);
  }
  function welcome(){
    heading();const r=current();
    const card=el('section',undefined,'sc-card'),booking=el('div',undefined,'sc-booking');booking.append(el('span',r.name),el('span',r.arrival));card.append(booking);
    card.append(el('h2',language==='ja'?'ご滞在の前に、大切な確認を。':'A few important details before your stay.'));
    card.append(el('p',language==='ja'?'料金・お食事・到着時刻を、わかりやすく。疑問があれば、その場で宿側へ相談できる形です。':'Review charges, dining and arrival information. Questions can be passed to the staff queue.'));
    const topics=el('div',undefined,'sc-topics');
    for(const label of language==='ja'?['料金とキャンセル','夕食と到着','スタッフへの相談']:['Charges & cancellation','Dinner & arrival','Questions for staff'])topics.append(el('span',label,'sc-topic'));
    card.append(topics);policy(card,items.find(item=>item.id==='cancellation'));
    card.append(el('p',language==='ja'?'公式の公開情報を整理した非公式試作です。実際の予約条件を変更するものではありません。宿の承認と英文の確認は未完了です。':'Unofficial prototype based on public information. It does not change booking terms. Property approval and translation review are pending.','sc-note'));
    const actions=el('div',undefined,'sc-actions');actions.append(action(language==='ja'?'重要事項の確認へ進む':'Review important information',()=>openGuest(r),true));card.append(actions);meal.entry(card,r);main.append(card);
    const guide=el('section',undefined,'sc-card');references(guide,r);main.append(guide);contact();
  }
  function research(){
    main.append(el('h2','宿に確認してから反映すること'),el('p','2026年10月20日の調査メモです。以下の文面は、宿泊者に確認させる正式な規定へ入れていません。','sc-warning'));
    for(const item of config.research.pending){
      const card=el('section',undefined,'sc-card');card.append(el('p',item.origin==='official_conflict'?'公式内で表記差あり':'確認待ち','sc-note'),el('h3',item.text),el('p',item.reason));main.append(card);
    }
    const details=el('details');details.append(el('summary','確認に使った公式ページ'));
    for(const source of config.research.sources){const row=el('p'),link=el('a',source);link.href=source;link.rel='noreferrer';link.target='_blank';row.append(link);details.append(row);}
    main.append(details,el('p','この画面は試作の調査メモです。管理サーバーの承認機能は未実装です。','sc-note'));
  }
  function render() {
    root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    root.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
    root.querySelector('[data-view="guest"]').textContent=language==='ja'?'宿泊者の画面':'Guest view';
    root.querySelector('[data-view="admin"]').textContent=language==='ja'?'宿側の画面':'Staff view';
    document.documentElement.lang=language;document.title=language==='ja'?'ぎをんの月｜非公式の操作デモ':'Giwon no Tsuki | Unofficial demo';main.lang=language;main.replaceChildren();if(view==='guest'){if(phase==='meal')meal.guest();else if(phase==='welcome')welcome();else guest();}else admin();
  }
  root.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>{language=b.dataset.language;render();}));
  root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.view==='guest')openGuest(current());else{view='admin';render();}
  }));
  const meal = globalThis.createStayMeal({
    el, action, field, main, reservations,
    language: () => language, current, render, contact,
    open: r => { selected=r.id; view='guest'; phase='meal'; },
    staff: () => { view='admin'; adminTab='meal'; render(); },
    returnGuest: () => openGuest(current())
  });
  render();
})();
