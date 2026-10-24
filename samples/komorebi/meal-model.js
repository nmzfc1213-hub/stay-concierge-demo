/* Memory-only demo model. No medical assessment or real submissions. */
(() => {
  'use strict';
  const pair = (ja, en) => ({ ja, en });
  const categories = {
    allergy: pair('アレルギーがある', 'Food allergies'),
    pregnancy: pair('妊娠中', 'Pregnant'),
    belief: pair('宗教・信条による制限（ベジタリアン・ビーガン含む）', 'Religious or ethical restrictions (including vegetarian / vegan)'),
    other: pair('その他（苦手・持病・医師の指示）', 'Other (dislikes, health conditions or medical instructions)'),
    none: pair('特になし', 'None')
  };
  const allergens = Object.fromEntries([
    ['egg', '卵', 'Egg'], ['milk', '乳', 'Milk'], ['wheat', '小麦', 'Wheat'],
    ['buckwheat', 'そば', 'Buckwheat'], ['peanut', '落花生', 'Peanut'],
    ['shrimp', 'えび', 'Shrimp'], ['crab', 'かに', 'Crab'],
    ['soy', '大豆', 'Soy'], ['sesame', 'ごま', 'Sesame'], ['other', 'その他', 'Other']
  ].map(([id, ja, en]) => [id, pair(ja, en)]));
  const foods = {
    soy: [['miso', '味噌', 'Miso'], ['sauce', '醤油', 'Soy sauce'], ['tofu', '豆腐', 'Tofu'], ['natto', '納豆', 'Natto'], ['kinako', 'きなこ', 'Roasted soy flour (kinako)'], ['oil', '大豆油', 'Soybean oil'], ['soup', '味噌汁', 'Miso soup']],
    wheat: [['sauce', '醤油', 'Soy sauce'], ['noodles', 'うどん・そうめん', 'Udon / somen noodles'], ['coating', '天ぷら・フライの衣', 'Tempura / breadcrumb coating'], ['bread', 'パン・麩', 'Bread / wheat gluten (fu)'], ['roux', 'カレー・シチューのルー', 'Curry / stew roux']],
    egg: [['mayo', 'マヨネーズ', 'Mayonnaise'], ['batter', '天ぷらの衣', 'Tempura batter'], ['surimi', 'かまぼこ等の練り製品', 'Fish cakes (kamaboko)'], ['dessert', 'ケーキ・プリン', 'Cake / custard pudding']],
    milk: [['butter', 'バター・クリーム', 'Butter / cream'], ['cheese', 'チーズ', 'Cheese'], ['dessert', '乳を含むデザート', 'Desserts containing milk']]
  };
  const pregnancy = [
    ['alcohol', 'アルコール（料理酒・みりんを含む）', 'Alcohol (including cooking sake and mirin)'],
    ['raw', '生もの（刺身・生ハム・生卵）', 'Raw foods (sashimi, cured ham and raw eggs)'],
    ['roe', '魚卵', 'Fish roe'], ['caffeine', 'カフェイン', 'Caffeine'],
    ['cheese', 'ナチュラルチーズ', 'Natural cheese']
  ];
  const avoided = [
    ['pork', '豚', 'Pork'], ['beef', '牛', 'Beef'], ['meat', '肉全般', 'All meat'],
    ['seafood', '魚介', 'Fish and seafood'], ['animal', '動物性全般', 'All animal products'],
    ['alcohol', 'アルコール', 'Alcohol'], ['alliums', '五葷（ねぎ・にんにく等）', 'Five pungent plants (e.g. onion and garlic)'],
    ['other', 'その他', 'Other']
  ];
  const hidden = [
    ['bonito', 'かつお節・かつおだし（味噌汁・煮物等）', 'Bonito flakes / bonito stock (e.g. miso soup and simmered dishes)'],
    ['kelp', '昆布だし（湯豆腐・吸い物等）', 'Kelp stock (e.g. tofu hot pot and clear soup)'],
    ['sake', 'みりん・料理酒（煮物・たれ等）', 'Mirin / cooking sake (e.g. simmered dishes and sauces)'],
    ['lard', 'ラード（炒め物・揚げ物等）', 'Lard (e.g. stir-fried and fried dishes)'],
    ['gelatin', 'ゼラチン（ゼリー・デザート等）', 'Gelatin (e.g. jelly and desserts)']
  ];
  function fresh() {
    return { categories: [], allergens: [], allergenOther: '', allergy: {}, pregnancy: {}, pregnancyOther: '', avoided: [], beliefOther: '', hidden: {}, other: '', final: '' };
  }
  function shift(day, n) {
    const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function deadline(arrival, today) {
    const due = shift(arrival, -4);
    return { due, expired: today > due, near: today >= shift(due, -1) && today <= due };
  }
  function selectCategory(d, id, checked) {
    d.categories = checked ? id === 'none' ? ['none'] : [...new Set([...d.categories.filter(x => x !== 'none'), id])] : d.categories.filter(x => x !== id);
  }
  function steps(d) {
    const result = [{ id: 'categories', type: 'categories' }];
    if (d.categories.includes('allergy')) {
      result.push({ id: 'allergens', type: 'allergens' });
      for (const allergen of d.allergens) {
        for (const key of ['severity', 'trace', 'stock', 'processed']) result.push({ id: `allergy.${allergen}.${key}`, type: 'allergy', allergen, key });
        for (const [key, ja, en] of foods[allergen] || []) result.push({ id: `food.${allergen}.${key}`, type: 'food', allergen, key, label: pair(ja, en) });
      }
    }
    if (d.categories.includes('pregnancy')) {
      for (const [key, ja, en] of pregnancy) result.push({ id: `pregnancy.${key}`, type: 'pregnancy', key, label: pair(ja, en) });
      result.push({ id: 'pregnancyOther', type: 'text' });
    }
    if (d.categories.includes('belief')) {
      result.push({ id: 'avoided', type: 'avoided' });
      for (const [key, ja, en] of hidden) result.push({ id: `hidden.${key}`, type: 'hidden', key, label: pair(ja, en) });
    }
    if (d.categories.includes('other')) result.push({ id: 'other', type: 'text' });
    result.push({ id: 'final', type: 'text' }); return result;
  }
  function value(d, s) {
    if (s.type === 'allergy') return d.allergy[s.allergen]?.[s.key];
    if (s.type === 'food') return d.allergy[s.allergen]?.foods?.[s.key];
    if (s.type === 'pregnancy') return d.pregnancy[s.key];
    if (s.type === 'hidden') return d.hidden[s.key]; return d[s.id];
  }
  const options = {
    severity: ['mild', 'severe', 'anaphylaxis'], trace: ['allowed', 'notAllowed', 'unknown'],
    stock: ['allowed', 'notAllowed', 'unknown'], processed: ['allowed', 'notAllowed', 'unknown'],
    food: ['avoid', 'okay', 'unknown'], pregnancy: ['avoid', 'okay'], hidden: ['allowed', 'notAllowed', 'unknown']
  };
  function valid(d, s) {
    const v = value(d, s);
    if (s.type === 'categories') return v.length > 0 && v.every(x => x in categories) && !(v.includes('none') && v.length > 1);
    if (s.type === 'allergens') return v.length > 0 && v.every(x => x in allergens) && (!v.includes('other') || Boolean(d.allergenOther.trim()));
    if (s.type === 'avoided') return v.length > 0 && (!v.includes('other') || Boolean(d.beliefOther.trim()));
    if (s.type === 'text') return typeof v === 'string' && v.length <= 2000 && (s.id !== 'other' || Boolean(v.trim()));
    return (options[s.type === 'allergy' ? s.key : s.type] || []).includes(v);
  }
  function snapshot(d) {
    const copy = fresh(); copy.categories = [...d.categories]; copy.final = d.final.trim();
    if (d.categories.includes('allergy')) {
      copy.allergens = [...d.allergens]; copy.allergenOther = d.allergens.includes('other') ? d.allergenOther.trim() : '';
      for (const a of d.allergens) copy.allergy[a] = JSON.parse(JSON.stringify(d.allergy[a] || {}));
    }
    if (d.categories.includes('pregnancy')) { copy.pregnancy = { ...d.pregnancy }; copy.pregnancyOther = d.pregnancyOther.trim(); }
    if (d.categories.includes('belief')) { copy.avoided = [...d.avoided]; copy.hidden = { ...d.hidden }; copy.beliefOther = d.avoided.includes('other') ? d.beliefOther.trim() : ''; }
    if (d.categories.includes('other')) copy.other = d.other.trim(); return copy;
  }
  function stayFlag(d) { return d.categories.includes('allergy') && d.allergens.some(a => ['egg', 'wheat', 'soy'].includes(a) && d.allergy[a]?.trace === 'notAllowed'); }
  function needsReview(d) { return d.categories.some(x => x !== 'none') || Boolean(d.final.trim()); }
  function status(record) { return !record?.submitted ? 'unanswered' : needsReview(record.submitted.answers) ? 'review' : 'answered'; }
  function submit(d, arrival, today, consent) {
    if (deadline(arrival, today).expired) return { error: 'expired' };
    if (!steps(d).every(s => valid(d, s))) return { error: 'invalid' };
    if (!consent) return { error: 'consent' };
    return { answers: snapshot(d), submittedAt: new Date().toISOString(), demoDate: today };
  }
  globalThis.StayMealModel = { categories, allergens, foods, pregnancy, avoided, hidden, fresh, shift, deadline, selectCategory, steps, value, valid, snapshot, stayFlag, needsReview, status, submit };
})();
