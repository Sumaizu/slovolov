import { DEFAULTS } from '../../site/js/config.js';
import { Dictionary, isWord, norm, pick, pickWeighted, shuffle } from '../../site/js/words.js';
import { SMALL, canBuild, seeded } from './fixtures.js';
import { eq, no, ok, test } from './harness.js';

const small = () => new Dictionary(SMALL);
const sorted = (list) => Array.from(list).sort();
const OPTIONS = { baseMin: 5, baseMax: 6, minLen: 3, minWords: 5 };

test('словарь: norm и isWord', () => {
  eq(norm('  ЁЛКА '), 'елка');
  eq(norm(null), '');
  ok(isWord('кот'));
  for (const bad of ['', 'кот пёс', 'cat', 'кот1', 'ко-т', 'ёж']) no(isWord(bad), bad);
});

test('словарь: буквы берутся не чаще, чем они даны', () => {
  const d = small();
  eq(d.subwords('метла'), new Set(['метла', 'тема', 'мат', 'мел', 'лет', 'метал', 'ател']));
  no(d.subwords('метла').has('лемма'));
  ok(d.subwords('корона').has('окно'));
});

test('словарь: самое короткое слово', () => {
  const d = small();
  ok(d.subwords('метла', 2).has('ам'));
  no(d.subwords('метла', 3).has('ам'));
});

test('словарь: «ё» — это «е»', () => {
  const d = small();
  ok(d.has('лёт'));
  ok(d.has('лет'));
  eq(d.spelling('лет'), 'лёт');
  ok(d.subwords('метла').has('лет'));
});

test('словарь: ходовые слова, коротким нужна оценка выше', () => {
  const d = small();
  ok(d.isCommon('тема'));
  no(d.isCommon('метал'));
  no(d.isCommon('нет такого слова'));
  const two = new Dictionary({ 'кот': ['кот', 1.6], 'повар': ['повар', 1.6] });
  no(two.isCommon('кот'));
  ok(two.isCommon('повар'));
});

test('словарь: грубое слово в клетки не ставится', () => {
  const d = new Dictionary({ 'кот': ['кот', 50.0], 'тик': ['тик', 0.02], 'кик': ['кик', 0.01] });
  eq(['кот', 'тик', 'кик', 'нет'].map((w) => d.canShow(w)), [true, true, false, false]);
});

test('словарь: слова раунда', () => {
  const [hidden, spare] = small().roundWords('метла');
  eq(hidden[0], 'метла');
  eq(new Set(hidden), new Set(['метла', 'тема', 'мат', 'мел', 'лет']));
  eq(spare, ['ател', 'метал']);
});

test('словарь: при нехватке клеток остаются слова всех длин', () => {
  const [hidden, spare] = small().roundWords('корона', { maxWords: 4 });
  eq(hidden.length, 4);
  eq(hidden[0], 'корона');
  eq(new Set(hidden.map((w) => w.length)), new Set([6, 5, 4, 3]));
  ok(hidden.includes('окно'));
  ok(spare.includes('кора') && spare.includes('нора'));
});

test('словарь: слова раунда с добавленными буквами', () => {
  const [hidden, spare] = small().roundWords('метла', { letters: 'метлаоп' });
  eq(hidden[0], 'метла');
  eq(new Set(hidden), new Set(['метла', 'тема', 'мат', 'мел', 'лет', 'полет', 'плот', 'пот', 'лот']));
  eq(spare, ['ател', 'метал']);
  no(hidden.concat(spare).includes('лемма'));
});

test('словарь: добавленные буквы открывают новые слова', () => {
  const d = small(), rng = seeded(4);
  eq(d.extraLetters('метла', 0, rng), '');
  for (let i = 0; i < 20; i++) ok(['я', 'м', 'о'].includes(d.extraLetters('метла', 1, rng)));
  for (let i = 0; i < 20; i++) {
    const added = d.extraLetters('метла', 2, rng);
    eq(added.length, 2);
    const sizes = [0, 1, 2].map((n) => d.roundWords('метла', { letters: 'метла' + added.slice(0, n) })[0].length);
    eq(sizes[0], 5);
    ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], added);
  }
});

test('словарь: добавленные буквы, когда ни одна не помогает', () => {
  const added = new Dictionary({ 'кот': ['кот', 50.0] }).extraLetters('кот', 3, seeded(1));
  eq(added.length, 3);
  ok(isWord(added));
});

test('словарь: что годится в главные слова', () => {
  const d = small();
  eq(d.bases(OPTIONS), ['корона', 'метла']);
  eq(d.bases({ ...OPTIONS, minWords: 4 }), ['корона', 'крона', 'метла']);
  eq(d.bases({ ...OPTIONS, minWords: 6 }), ['корона']);
  no(d.bases({ ...OPTIONS, minWords: 1 }).includes('полет'));
});

test('словарь: выбор главного слова', () => {
  const d = small(), rng = seeded(1);
  eq(d.pickBase(rng, ['корона'], OPTIONS), 'метла');
  ok(['корона', 'метла'].includes(d.pickBase(rng, ['корона', 'метла'], OPTIONS)));
  eq(d.pickBase(rng, [], { ...OPTIONS, minWords: 50 }), null);
});

test('словарь: запрещённых слов в игре нет', () => {
  const d = new Dictionary(SMALL, ['Мат']);
  no(d.has('мат'));
  no(d.subwords('метла').has('мат'));
});

test('словарь: разбор файлов', () => {
  const d = Dictionary.parse('кот\t50.5\nКОТ\t70\nёлка\t12\ncat\t5\nкот пёс\t5\n\nсом\nрыба\tмного\n', 'сом\n\n');
  eq([d.size, d.score('кот'), d.spelling('елка'), d.score('рыба')], [3, 70, 'ёлка', 0]);
  no(d.has('сом'));
  no(d.has('cat'));
});

test('случайность: выбор и перемешивание', () => {
  const rng = seeded(3);
  for (let i = 0; i < 200; i++) {
    const x = rng();
    ok(x >= 0 && x < 1);
  }
  eq(sorted(shuffle(seeded(5), [1, 2, 3, 4, 5])), [1, 2, 3, 4, 5]);
  ok(['а', 'б'].includes(pick(seeded(2), ['а', 'б'])));
  for (let i = 0; i < 50; i++) eq(pickWeighted(rng, ['а', 'б', 'в'], [0, 5, 0]), 'б');
});

let real = null;
const load = async () => real || (real = await Dictionary.load('/site/data/'));

test('настоящий словарь: размер и знакомые слова', async () => {
  const d = await load();
  ok(d.size > 48000, d.size);
  for (const w of ['кот', 'молоко', 'ёлка', 'стрим', 'чат', 'добро', 'горе', 'взрослый']) {
    ok(d.has(w), w);
    ok(d.isCommon(w), w);
  }
  eq(d.spelling('елка'), 'ёлка');
  eq(d.spelling('небо'), 'небо');
  eq(d.spelling('лен'), 'лён');
});

test('настоящий словарь: уменьшительных слов и прилагательных в роли существительных нет', async () => {
  const d = await load();
  for (const w of ['старое', 'разок', 'видок', 'садик', 'домик', 'кусочек', 'солнышко', 'новое', 'дружок']) {
    no(d.has(w), w);
  }
  for (const w of ['сад', 'дом', 'вид', 'ручка', 'девочка', 'бабушка', 'кубик', 'носок', 'мороженое', 'столовая',
    'рабочий', 'будущее', 'кошелёк', 'цветок']) {
    ok(d.has(w), w);
  }
});

test('настоящий словарь: слова, которые игра знает, но не загадывает', async () => {
  const d = await load();
  for (const w of ['стейк', 'роутер', 'грант', 'раненый', 'корточки']) {
    ok(d.has(w), w);
    no(d.isCommon(w), w);
    ok(d.canShow(w), w);
  }
});

test('настоящий словарь: грубые слова в клетки не ставятся, запрещённых нет вовсе', async () => {
  const d = await load();
  for (const w of ['идиот', 'задница', 'секс']) {
    ok(d.has(w), w);
    no(d.canShow(w), w);
    no(d.isCommon(w), w);
  }
  ok(d.blocked.size > 50);
  for (const w of d.blocked) no(d.has(w), w);
});

test('настоящий словарь: главных слов хватает', async () => {
  const d = await load();
  const recommended = d.bases({ baseMin: DEFAULTS.base_min, baseMax: DEFAULTS.base_max, minLen: DEFAULTS.min_len,
    minWords: DEFAULTS.min_words });
  ok(recommended.length > 1500, recommended.length);
  ok(d.bases({ baseMin: 6, baseMax: 8, minLen: 3, minWords: 6 }).length > 2000);
  ok(d.bases({ baseMin: 4, baseMax: 6, minLen: 4, minWords: 4 }).length > 300);
});

test('настоящий словарь: раунды играбельны', async () => {
  const d = await load(), rng = seeded(3);
  for (let i = 0; i < 60; i++) {
    const base = d.pickBase(rng);
    const [hidden, spare] = d.roundWords(base);
    eq(hidden[0], base);
    ok(hidden.length >= 6 && hidden.length <= 20, base);
    no(d.spelling(base).includes('ё'));
    for (const w of hidden.concat(spare)) {
      ok(w.length >= 3, w);
      ok(canBuild(w, base), base + ' → ' + w);
    }
  }
});

test('настоящий словарь: добавленные буквы дают больше слов', async () => {
  const d = await load(), rng = seeded(7);
  for (let i = 0; i < 30; i++) {
    const base = d.pickBase(rng);
    const added = d.extraLetters(base, 2, rng);
    eq(added.length, 2);
    const plain = d.roundWords(base, { maxWords: 1000 })[0];
    const [hidden, spare] = d.roundWords(base, { letters: base + added, maxWords: 1000 });
    eq(hidden[0], base);
    ok(hidden.length > plain.length, base + ' + ' + added);
    ok(plain.every((w) => hidden.includes(w)));
    for (const w of hidden.concat(spare)) ok(canBuild(w, base + added), base + ' + ' + added + ' → ' + w);
  }
});
