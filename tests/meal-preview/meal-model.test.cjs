const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {}; vm.runInNewContext(fs.readFileSync('public/assets/meal-model.js', 'utf8'), context);
const M = context.StayMealModel;
function filled(categories = ['allergy', 'pregnancy', 'belief', 'other']) {
  const d = M.fresh(); d.categories = categories;
  d.allergens = ['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'soy', 'sesame', 'other'];
  d.allergenOther = 'Fictional ingredient'; d.avoided = ['pork', 'other']; d.beliefOther = 'Fictional restriction'; d.other = 'Fictional note';
  for (const s of M.steps(d)) {
    if (s.type === 'allergy') (d.allergy[s.allergen] ||= {})[s.key] = s.key === 'severity' ? 'mild' : 'notAllowed';
    if (s.type === 'food') ((d.allergy[s.allergen] ||= {}).foods ||= {})[s.key] = 'unknown';
    if (s.type === 'pregnancy') d.pregnancy[s.key] = 'avoid';
    if (s.type === 'hidden') d.hidden[s.key] = 'notAllowed';
  } return d;
}
test('None is exclusive, and selecting a category removes None', () => {
  const d = M.fresh(); M.selectCategory(d, 'allergy', true); M.selectCategory(d, 'pregnancy', true);
  assert.equal(d.categories.length, 2); M.selectCategory(d, 'none', true); assert.equal(d.categories.join(), 'none');
  M.selectCategory(d, 'belief', true); assert.equal(d.categories.join(), 'belief');
});
test('Only selected categories generate questions; None has final free text only', () => {
  const d = M.fresh(); d.categories = ['none']; assert.equal(M.steps(d).length, 2);
  d.categories = ['pregnancy']; assert.equal(M.steps(d).filter(s => s.type === 'pregnancy').length, 5);
  assert.equal(M.steps(d).some(s => s.type === 'allergy'), false);
});
test('Every selected allergen has severity, trace, extract and processed-food questions', () => {
  const d = filled();
  for (const a of d.allergens) assert.equal(M.steps(d).filter(s => s.type === 'allergy' && s.allergen === a).length, 4);
  assert.equal(M.steps(d).filter(s => s.type === 'food' && s.allergen === 'soy').length, 7);
  assert.equal(M.steps(d).filter(s => s.type === 'food' && s.allergen === 'wheat').length, 5);
});
test('Full multi-category answers submit; missing severity or food response cannot submit', () => {
  const d = filled(); assert.ok(M.submit(d, '2026-10-30', '2026-10-25', true).answers);
  delete d.allergy.soy.foods.miso; assert.equal(M.submit(d, '2026-10-30', '2026-10-25', true).error, 'invalid');
  d.allergy.soy.foods.miso = 'unknown'; d.allergy.egg.severity = 'invalid';
  assert.equal(M.submit(d, '2026-10-30', '2026-10-25', true).error, 'invalid');
});
test('Other allergen, religious ingredient and other category require descriptions', () => {
  for (const key of ['allergenOther', 'beliefOther', 'other']) {
    const d = filled(); d[key] = '  '; assert.equal(M.submit(d, '2026-10-30', '2026-10-25', true).error, 'invalid');
  }
});
test('Date-only deadline includes fourth day and expires the following day', () => {
  assert.equal(M.deadline('2026-11-02', '2026-10-29').expired, false);
  assert.equal(M.deadline('2026-11-02', '2026-10-30').expired, true);
  assert.equal(M.deadline('2028-03-03', '2028-02-28').due, '2028-02-28');
  assert.equal(M.deadline('2026-11-02', '2026-10-28').near, true);
  assert.equal(M.deadline('2026-11-02', '2026-10-27').near, false);
});
test('Expired date blocks submission even after completing review', () => {
  const d = filled(['none']); assert.equal(M.submit(d, '2026-10-30', '2026-10-27', true).error, 'expired');
});
test('Review acknowledgement is required and empty draft cannot complete', () => {
  assert.equal(M.submit(filled(['none']), '2026-10-30', '2026-10-25', false).error, 'consent');
  assert.equal(M.submit(M.fresh(), '2026-10-30', '2026-10-25', true).error, 'invalid');
});
test('Egg/wheat/soy with trace disallowed flag a stay review, not automatic refusal', () => {
  for (const a of ['egg', 'wheat', 'soy']) {
    const d = filled(['allergy']); d.allergens = [a]; assert.equal(M.stayFlag(d), true);
    d.allergy[a].trace = 'allowed'; assert.equal(M.stayFlag(d), false);
  }
  const d = filled(['allergy']); d.allergens = ['milk']; assert.equal(M.stayFlag(d), false);
});
test('Submission is immutable against later draft edits and strips deselected categories', () => {
  const d = filled(); const result = M.submit(d, '2026-10-30', '2026-10-25', true);
  d.allergy.egg.severity = 'severe'; assert.equal(result.answers.allergy.egg.severity, 'mild');
  d.categories = ['none']; const clean = M.snapshot(d); assert.equal(clean.allergens.length, 0);
  assert.equal(Object.keys(clean.allergy).length, 0); assert.equal(clean.other, '');
});
test('Status distinguishes unanswered, answered and needs-review; free text flags review', () => {
  assert.equal(M.status({}), 'unanswered');
  const result = M.submit(filled(['none']), '2026-10-30', '2026-10-25', true);
  assert.equal(M.status({ submitted: result }), 'answered'); result.answers.final = 'Fictional request';
  assert.equal(M.status({ submitted: result }), 'review');
});
test('Both languages exist for every model label', () => {
  for (const group of [M.categories, M.allergens]) for (const v of Object.values(group)) assert.ok(v.ja && v.en);
  for (const list of [M.pregnancy, M.avoided, M.hidden, ...Object.values(M.foods)]) for (const row of list) assert.ok(row[1] && row[2]);
});
