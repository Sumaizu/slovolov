const NOW = 1000;
const LETTERS = 'еракилп';
const EXTRA_LETTERS = [['о', 2], ['т', 6], ['н', 4], ['с', 9]];

const WORDS = [
  { word: 'пар', by: 'tiny_frog' },
  { word: 'лак', by: 'Борщ' },
  { word: 'рак', by: 'Mishka_Gamer' },
  { word: 'пик' },
  { word: 'лик', hint: ' и ' },
  { word: 'пир', by: 'valera' },
  { word: 'аил' },
  { word: 'река', by: 'tiny_frog' },
  { word: 'репа', by: 'Соня' },
  { word: 'пила', by: 'Борщ' },
  { word: 'липа', hint: ' и  ' },
  { word: 'лира', by: 'ЛисаАлиса' },
  { word: 'икра', by: 'tiny_frog' },
  { word: 'парк', by: 'Mishka_Gamer' },
  { word: 'кора', extra: 1 },
  { word: 'поле', extra: 1 },
  { word: 'порт', extra: 2 },
  { word: 'литр', extra: 2, hint: '  т ' },
  { word: 'лето', extra: 2 },
  { word: 'ларёк', by: 'pelmen' },
  { word: 'парик' },
  { word: 'опера', extra: 1, by: 'kotofey' },
  { word: 'пилот', extra: 2, by: 'valera' },
  { word: 'капот', extra: 2 },
  { word: 'пакет', extra: 2, hint: '  к  ' },
  { word: 'плита', extra: 2 },
  { word: 'перила', by: 'Борщ' },
  { word: 'прокат', extra: 2, hint: 'п     ' },
  { word: 'реплика' },
];

const CHAT = [
  { user: 'kotofey', text: 'всем привет!' },
  { user: 'tiny_frog', text: 'река', kind: 'guess' },
  { user: 'valera', text: 'а глаголы считаются?' },
  { user: 'Соня', text: 'репа', kind: 'guess' },
  { user: 'Борщ', text: 'пила', kind: 'guess' },
  { user: 'neko_chan', text: 'пила', kind: 'repeat' },
  { user: 'Mishka_Gamer', text: 'парк', kind: 'guess' },
  { user: 'pelmen', text: 'ларёк', kind: 'guess' },
  { user: 'valera', text: 'пилот', kind: 'guess' },
  { user: 'Mishka_Gamer', text: 'реки' },
  { user: 'ЛисаАлиса', text: 'лира', kind: 'guess' },
  { user: 'kotofey', text: 'опера', kind: 'guess' },
  { user: 'Борщ', text: 'перила', kind: 'guess' },
  { user: 'ya_tut', text: 'клипер', kind: 'outside' },
  { user: 'neko_chan', text: 'не успеваю за вами' },
  { user: 'tiny_frog', text: 'икра', kind: 'guess' },
];

const TOTALS = [
  ['tiny_frog', 58], ['Борщ', 51], ['ЛисаАлиса', 44], ['kotofey', 39], ['pelmen', 37], ['Соня', 31], ['valera', 26],
  ['Mishka_Gamer', 24], ['ya_tut', 19], ['neko_chan', 12], ['pingvin', 9], ['Тимофей', 7], ['sova_noch', 4],
  ['zhuk', 3],
];

function tiles(extraCount) {
  const letters = Array.from(LETTERS);
  for (const [letter, place] of EXTRA_LETTERS.slice(0, extraCount)) letters.splice(place, 0, letter);
  return letters;
}

function spread(list, count) {
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, i) => list[Math.round(i * (list.length - 1) / (count - 1))]);
}

export function demoState(settings) {
  const fits = (word, extra = 0) => word.length >= settings.min_len && extra <= settings.extra_letters;
  const slots = spread(WORDS.filter((slot) => fits(slot.word, slot.extra)), settings.max_words);
  const finders = new Map(slots.filter((slot) => slot.by).map((slot) => [slot.word, slot.by]));
  const round = new Map();
  const award = (user, points) => round.set(user, (round.get(user) || 0) + points);
  for (const [word, user] of finders) award(user, word.length);
  const feed = [];
  for (const line of CHAT) {
    const scored = line.kind === 'guess' || line.kind === 'outside';
    if (line.kind === 'guess' && finders.get(line.text) !== line.user) continue;
    if (line.kind === 'repeat' && !finders.has(line.text)) continue;
    if (line.kind === 'outside') {
      if (!fits(line.text)) continue;
      award(line.user, line.text.length);
    }
    feed.push({ id: feed.length + 1, user: line.user, text: line.text, color: '', pts: scored ? line.text.length : 0,
      bonus: line.kind === 'outside', repeat: line.kind === 'repeat', star: '' });
  }
  return {
    version: 1,
    now: NOW,
    state: 'playing',
    round: 4,
    starts_at: null,
    pause: settings.pause,
    hint_every: settings.hint_every,
    top: TOTALS.map(([name, score]) => ({ name, score, words: Math.ceil(score / 4) })),
    players: TOTALS.length,
    stars: [],
    feed,
    letters: tiles(settings.extra_letters),
    words: slots.map((slot) => ({ len: slot.word.length, word: slot.by ? slot.word : null, by: slot.by || null,
      closed: false, missed: false, hint: slot.hint || '' })),
    total: slots.length,
    found: finders.size,
    round_scores: Array.from(round, ([name, pts]) => ({ name, pts, words: 1 })).sort((a, b) => b.pts - a.pts),
    started: NOW - 60,
    ends: settings.round_time ? NOW + Math.round(settings.round_time * 0.6) : null,
    hint_at: settings.hint_every ? NOW + Math.round(settings.hint_every * 0.66) : null,
  };
}
