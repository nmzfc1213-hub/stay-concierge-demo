import './meal-model.js';
const M = globalThis.StayMealModel;
const labels = {severity:'症状の程度',trace:'微量混入・交差接触',stock:'エキス・だし',processed:'加工品・調味料',mild:'軽い',severe:'重い',anaphylaxis:'アナフィラキシー歴あり',allowed:'許容できる',notAllowed:'許容できない',unknown:'わからない',avoid:'避けたい・食べられない',okay:'大丈夫（本人の申告）'};
export function mealSummary(d) {
  const lines=['該当項目：'+d.categories.map(k=>M.categories[k].ja).join(' / ')];
  if(d.categories.includes('allergy')) for(const allergen of d.allergens) {
    const a=d.allergy[allergen];lines.push('アレルゲン：'+M.allergens[allergen].ja+(allergen==='other'?' / '+d.allergenOther:''));
    for(const key of ['severity','trace','stock','processed']) lines.push('  '+labels[key]+'：'+labels[a[key]]);
    for(const [key,ja] of M.foods[allergen]||[]) lines.push('  '+ja+'：'+labels[a.foods?.[key]]);
  }
  if(d.categories.includes('pregnancy')) {
    for(const [key,ja] of M.pregnancy) lines.push(ja+'：'+labels[d.pregnancy[key]]);
    if(d.pregnancyOther) lines.push('医師からの指示等：'+d.pregnancyOther);
  }
  if(d.categories.includes('belief')) {
    lines.push('避けるもの：'+d.avoided.map(k=>M.avoided.find(v=>v[0]===k)[1]).join(' / '));
    if(d.beliefOther) lines.push('その他の原料：'+d.beliefOther);
    for(const [key,ja] of M.hidden) lines.push(ja+'：'+labels[d.hidden[key]]);
  }
  if(d.other) lines.push('その他の食事制限：'+d.other);
  if(d.final) lines.push('食事についての補足：'+d.final);
  return lines.join('\n');
}
