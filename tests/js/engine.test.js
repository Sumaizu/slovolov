import { clean } from '../../site/js/config.js';
import { BOTS, CHAT_KEEP, CHAT_SHOWN, CHAT_TEXT_MAX, Game, STARS, Scores, nextReset } from '../../site/js/engine.js';
import { Dictionary } from '../../site/js/words.js';
import { KOTIK, METLA_WORDS, ONLY_KOTIK, ONLY_METLA, SMALL, canBuild, fakeClock, local, makeGame, memoryStorage,
  seeded, startRound } from './fixtures.js';
import { eq, no, ok, test } from './harness.js';

const types = (events) => events.map((event) => event.type);
const last = (list) => list[list.length - 1];
const sorted = (list) => Array.from(list).sort();
const hidden = (game) => sorted(game.answers().words.map((w) => w.word));
const kotik = (settings = {}) => startRound({ words: KOTIK, settings: { ...ONLY_KOTIK, ...settings } }).game;

test('запуск: отсчёт, потом раунд', () => {
  const { game, clock, events } = makeGame();
  eq(game.snapshot().state, 'stopped');
  ok(game.open());
  let state = game.snapshot();
  eq([state.state, state.starts_at, state.round], ['countdown', clock.t + 10, 0]);
  no('words' in state);
  eq(game.feed('Вася', 'тема'), null);
  no(game.open());
  clock.t += 9.9;
  game.tick();
  eq(game.snapshot().state, 'countdown');
  clock.t += 0.1;
  game.tick();
  state = game.snapshot();
  eq([state.state, state.round, state.total, state.found, state.starts_at], ['playing', 1, 5, 0, null]);
  eq(types(events), ['countdown', 'round_start']);
});

test('запуск: остановка стирает раунд, новый запуск начинает с другого слова', () => {
  const { game, clock, events } = makeGame({ settings: { base_min: 5, base_max: 6, min_words: 5 } });
  game.open(0);
  game.tick();
  const first = game.answers().base;
  game.feed('Вася', game.answers().words[0].word);
  game.stop();
  const state = game.snapshot();
  eq([state.state, 'words' in state, state.players], ['stopped', false, 1]);
  game.stop();
  game.open(5);
  eq(game.snapshot().state, 'countdown');
  clock.t += 5;
  game.tick();
  eq([game.snapshot().state, game.snapshot().round], ['playing', 2]);
  no(game.answers().base === first);
  eq(types(events).filter((type) => type !== 'guess'), ['countdown', 'round_start', 'stopped', 'countdown',
    'round_start']);
});

test('запуск: под настройки нет слов — игра не начинается', () => {
  const { game, events } = makeGame({ settings: { min_words: 40, max_words: 45 } });
  game.open(0);
  game.tick();
  eq(game.snapshot().state, 'stopped');
  eq(last(events).type, 'no_words');
});

test('раунд: буквы перемешаны, слова скрыты', () => {
  const { game } = startRound();
  const state = game.snapshot();
  eq(sorted(state.letters), sorted('метла'));
  no(state.letters.join('') === 'метла');
  eq(state.words.map((w) => w.len), [3, 3, 3, 4, 5]);
  ok(state.words.every((w) => w.word === null && w.hint === ''));
  game.feed('Вася', 'мат');
  const text = JSON.stringify(game.snapshot());
  ok(text.includes('мат'));
  for (const word of ['мел', 'лёт', 'лет', 'тема', 'метла', 'ател', 'метал']) no(text.includes(word), word);
});

test('раунд: очко за букву, слово достаётся первому', () => {
  const { game } = startRound();
  let event = game.feed('Вася', 'тема');
  eq([event.type, event.user, event.word, event.pts, event.total], ['guess', 'Вася', 'тема', 4, 4]);
  event = game.feed('Вася', 'метла');
  eq([event.pts, event.total], [5, 9]);
  event = game.feed('Петя', 'тема');
  eq([event.type, event.by], ['repeat', 'Вася']);
  const state = game.snapshot();
  eq(state.found, 2);
  eq(state.words.filter((w) => w.word).map((w) => [w.word, w.by]), [['тема', 'Вася'], ['метла', 'Вася']]);
  eq(state.top, [{ name: 'Вася', score: 9, words: 2 }]);
  eq(state.round_scores, [{ name: 'Вася', pts: 9, words: 2 }]);
});

test('раунд: слово можно написать по-разному', () => {
  const { game } = startRound();
  eq(game.feed('а', '  ТЕМА!!! ').type, 'guess');
  eq(game.feed('б', 'лет').word, 'лёт');
  eq(game.feed('в', 'мат' + String.fromCodePoint(0xE0000)).type, 'guess');
  eq(game.feed('г', '«мел»').type, 'guess');
  eq(game.feed('д', 'ЛЁТ').type, 'repeat');
  eq(game.feed('е', 'ле' + String.fromCharCode(0x308) + 'т').type, 'repeat');
  eq(game.feed('ж', 'метла ' + String.fromCharCode(0x2800)).type, 'guess');
});

test('раунд: что словом не считается', () => {
  const { game } = startRound();
  for (const text of ['тема тема', 'привет чат', 'tema', 'ам', 'тля', 'корона', '', '   ', 'тема1']) {
    eq(game.feed('Вася', text), null, text);
  }
  eq(game.feed('', 'тема'), null);
  eq(game.snapshot().found, 0);
});

test('раунд: боты не играют и в чат на экране не попадают', () => {
  const { game } = startRound();
  ok(BOTS.includes('nightbot') && BOTS.includes('streamelements'));
  eq(game.feed('Nightbot', 'тема'), null);
  eq(game.feed('Имя Бота', 'тема', { login: 'streamelements' }), null);
  eq(game.feed('Moobot', '!словолов-раунд', { mod: true }), null);
  eq([game.snapshot().found, game.snapshot().feed.length, game.snapshot().state], [0, 0, 'playing']);
});

test('раунд: все слова угаданы — итоги, потом следующий раунд', () => {
  const { game, clock, events } = startRound({ settings: { pause: 12 } });
  METLA_WORDS.forEach((word, i) => {
    eq(game.snapshot().state, 'playing');
    game.feed(i % 2 ? 'Вася' : 'Петя', word);
  });
  let state = game.snapshot();
  eq(state.state, 'results');
  eq([state.results.reason, state.results.base, state.results.round], ['all', 'метла', 1]);
  eq(state.results.next_at, clock.t + 12);
  eq(state.results.scores, [{ name: 'Петя', pts: 11, words: 3 }, { name: 'Вася', pts: 7, words: 2 }]);
  ok(state.words.every((w) => w.word));
  const end = last(events);
  eq([end.type, end.found, end.total, end.missed], ['round_end', 5, 5, []]);
  eq(game.feed('Вася', 'метал'), null);
  clock.t += 11.9;
  game.tick();
  eq(game.snapshot().state, 'results');
  clock.t += 0.2;
  game.tick();
  state = game.snapshot();
  eq([state.state, state.round, state.found, state.round_scores], ['playing', 2, 0, []]);
  game.feed('Вася', 'тема');
  eq(game.snapshot().top.map((row) => [row.name, row.score]), [['Вася', 11], ['Петя', 11]]);
});

test('раунд: лимит времени', () => {
  const { game, clock, events } = startRound({ settings: { round_time: 60, hint_every: 0 } });
  eq(game.snapshot().ends, clock.t + 60);
  game.feed('Вася', 'тема');
  clock.t += 59;
  game.tick();
  eq(game.snapshot().state, 'playing');
  clock.t += 1;
  game.tick();
  const state = game.snapshot();
  eq([state.state, state.results.reason], ['results', 'time']);
  eq(state.words.filter((w) => w.missed).length, 4);
  eq(sorted(last(events).missed), ['лёт', 'мат', 'мел', 'метла']);
});

test('слова вне клеток: настоящее слово без свободных клеток всё равно приносит очки', () => {
  const { game } = startRound();
  const event = game.feed('Вася', 'метал');
  eq([event.type, event.pts], ['bonus', 5]);
  eq(game.feed('Петя', 'метал').type, 'repeat');
  const state = game.snapshot();
  eq([state.found, state.top[0].score], [0, 5]);
  eq(state.feed.map((m) => [m.text, m.pts, m.bonus, m.repeat]),
    [['метал', 5, true, false], ['метал', 0, false, true]]);
});

test('клетки: настоящее слово встаёт в свободные клетки своей длины', () => {
  const { game } = startRound();
  const event = game.feed('Вася', 'ател');
  eq([event.type, event.word, event.pts], ['guess', 'ател', 4]);
  const state = game.snapshot();
  eq([state.found, state.total], [1, 5]);
  eq(state.words.filter((w) => w.word).map((w) => [w.word, w.by]), [['ател', 'Вася']]);
  no(last(state.feed).bonus);
  no(hidden(game).includes('тема'));
  eq(game.answers().spare, ['метал', 'тема']);
  const late = game.feed('Петя', 'тема');
  eq([late.type, late.pts], ['bonus', 4]);
  eq(game.feed('Оля', 'ател').type, 'repeat');
  eq(game.feed('Оля', 'тема').type, 'repeat');
});

test('клетки: главное слово своих клеток не уступает, раунд можно закрыть и такими словами', () => {
  const { game, events } = startRound();
  eq(game.feed('Вася', 'метал').type, 'bonus');
  for (const word of ['мат', 'мел', 'лёт', 'ател', 'метла']) game.feed('Вася', word);
  const end = last(events);
  eq([end.type, end.reason, end.found, end.total, end.missed], ['round_end', 'all', 5, 5, []]);
});

test('клетки: уступает самое редкое слово', () => {
  const game = kotik();
  eq(hidden(game), ['кит', 'кот', 'котик', 'ток']);
  eq(game.feed('Вася', 'тик').type, 'guess');
  eq(hidden(game), ['кот', 'котик', 'тик', 'ток']);
});

test('клетки: открытые подсказкой буквы должны совпасть', () => {
  const game = kotik();
  game.round.index.get('кит').hint.add(0);
  eq(game.feed('Вася', 'тик').type, 'guess');
  eq(hidden(game), ['кит', 'кот', 'котик', 'тик']);
  eq(game.snapshot().words.filter((w) => !w.word && w.hint).map((w) => w.hint), ['к  ']);
});

test('клетки: первыми занимаются клетки с подходящей подсказкой', () => {
  const game = kotik();
  game.round.index.get('кот').hint.add(1);
  eq(game.feed('Вася', 'кок').type, 'guess');
  eq(hidden(game), ['кит', 'кок', 'котик', 'ток']);
});

test('клетки: грубое слово в клетки не встаёт, занятые и закрытые клетки не отдаются', () => {
  let game = kotik();
  eq(game.feed('Вася', 'кик').type, 'bonus');
  eq(game.snapshot().found, 0);
  game = kotik();
  game.feed('Вася', 'кот');
  game.feed('Вася', 'ток');
  game.round.index.get('кит').closed = true;
  eq(game.feed('Петя', 'тик').type, 'bonus');
});

test('подсказки: после тишины открывается одна буква в одном слове', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 45 } });
  clock.t += 44;
  game.tick();
  no(types(events).includes('hint'));
  clock.t += 1;
  game.tick();
  const hint = last(events);
  eq(hint.type, 'hint');
  const state = game.snapshot();
  const hinted = state.words.map((w, i) => [i, w]).filter(([, w]) => w.hint);
  eq(hinted.length, 1);
  const [index, slot] = hinted[0];
  const word = game.answers().words[index].word;
  eq([slot.hint.length, slot.hint.trim().length], [slot.len, 1]);
  const position = slot.hint.indexOf(slot.hint.trim());
  eq(slot.hint[position], word[position]);
  eq([hint.slot, hint.position, hint.letter, hint.closed], [index, position, word[position], []]);
  eq(slot.word, null);
  eq(state.hint_at, clock.t + 45);
});

test('подсказки: буквы открываются вразброс и по одной', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 10 } });
  const words = game.answers().words.map((w) => w.word);
  for (let n = 1; n <= 10; n++) {
    clock.t += 10;
    game.tick();
    const state = game.snapshot();
    const shown = state.words.reduce((sum, w) => sum + (w.word ? w.len : w.hint.replace(/ /g, '').length), 0);
    eq(shown, n);
    state.words.forEach((w, i) => Array.from(w.hint).forEach((ch, at) => ok(ch === ' ' || ch === words[i][at])));
  }
  const opened = new Map();
  let jumps = 0;
  for (const event of events.filter((e) => e.type === 'hint')) {
    const seen = opened.get(event.slot) || [];
    if (event.position !== seen.length) jumps++;
    opened.set(event.slot, seen.concat(event.position));
  }
  ok(jumps > 0);
  ok(opened.size > 1);
});

test('подсказки: угаданное слово начинает отсчёт заново', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 45 } });
  clock.t += 40;
  game.feed('Вася', 'тема');
  eq(game.snapshot().hint_at, clock.t + 45);
  clock.t += 44;
  game.tick();
  no(types(events).includes('hint'));
});

test('подсказки: слово, открытое целиком, закрывается без очков', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 5 } });
  let closed = null;
  for (let i = 0; i < 40 && !closed; i++) {
    clock.t += 5;
    game.tick();
    closed = events.filter((e) => e.type === 'hint' && e.closed.length)[0] || null;
  }
  ok(closed);
  const word = closed.closed[0];
  const slot = game.snapshot().words.filter((w) => w.word === word)[0];
  eq([slot.by, slot.closed], [null, true]);
  if (game.snapshot().state === 'playing') {
    eq(game.feed('Вася', word).type, 'repeat');
    ok(last(game.snapshot().feed).repeat);
  }
  eq(game.snapshot().players, 0);
});

test('подсказки: могут закрыть раунд сами', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 5 } });
  for (let i = 0; i < 60 && game.snapshot().state === 'playing'; i++) {
    clock.t += 5;
    game.tick();
  }
  eq(game.snapshot().results.reason, 'hints');
  eq(last(events).found, 0);
});

test('подсказки: выключаются нулём', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 0 } });
  eq(game.snapshot().hint_at, null);
  clock.t += 3600;
  game.tick();
  no(types(events).includes('hint'));
});

test('буквы: перемешиваются раз в 30 секунд', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 0 } });
  const first = game.snapshot().letters;
  clock.t += 29;
  game.tick();
  const before = game.snapshot();
  eq(before.letters, first);
  clock.t += 1;
  game.tick();
  const after = game.snapshot();
  no(after.letters.join('') === first.join(''));
  eq(sorted(after.letters), sorted(first));
  no(after.letters.join('').includes('метла'));
  ok(after.version > before.version);
  clock.t += 30;
  game.tick();
  no(game.snapshot().letters.join('') === after.letters.join(''));
  eq(types(events), ['countdown', 'round_start']);
});

test('буквы: как часто перемешивать, задают настройки; ноль — стоят на месте', () => {
  const often = startRound({ settings: { hint_every: 0, shuffle_every: 10 } });
  const first = often.game.snapshot().letters.join('');
  often.clock.t += 9;
  often.game.tick();
  eq(often.game.snapshot().letters.join(''), first);
  often.clock.t += 1;
  often.game.tick();
  no(often.game.snapshot().letters.join('') === first);
  const never = startRound({ settings: { hint_every: 0, shuffle_every: 0 } });
  const version = never.game.snapshot().version;
  never.clock.t += 3600;
  never.game.tick();
  eq(never.game.snapshot().version, version);
});

test('буквы: после раунда стоят на месте', () => {
  const { game, clock } = startRound({ settings: { hint_every: 0, pause: 600 } });
  game.skip();
  const version = game.snapshot().version;
  clock.t += 60;
  game.tick();
  eq(game.snapshot().version, version);
});

test('буквы: добавленные к главному слову', () => {
  const { game, events } = startRound({ settings: { extra_letters: 2 } });
  const state = game.snapshot(), answers = game.answers();
  eq([answers.base, answers.extra.length], ['метла', 2]);
  eq(sorted(state.letters), sorted('метла' + answers.extra));
  no(state.letters.join('').includes('метла'));
  const words = answers.words.map((w) => w.word);
  ok(METLA_WORDS.every((word) => words.includes(word)));
  ok(words.length >= 7);
  for (const word of words.concat(answers.spare)) ok(canBuild(word, state.letters), word);
  no('results' in state);
  eq(game.feed('Вася', words.filter((word) => !METLA_WORDS.includes(word))[0]).type, 'guess');
  game.skip();
  eq([game.snapshot().results.base, game.snapshot().results.extra], ['метла', answers.extra]);
  eq(last(events).extra, answers.extra);
});

test('команды: «раунд» заканчивает раунд, «сброс» обнуляет счёт', () => {
  const { game } = startRound();
  game.feed('Вася', 'тема');
  eq(game.feed('Модер', '!словолов-раунд', { mod: true }), { type: 'command', command: 'skip' });
  eq([game.snapshot().state, game.snapshot().results.reason], ['results', 'skip']);
  game.feed('Модер', '!СЛОВОЛОВ-Раунд', { mod: true });
  eq([game.snapshot().state, game.snapshot().round], ['playing', 2]);
  eq(game.feed('Модер', '!словолов-сброс', { mod: true }).command, 'reset');
  eq([game.snapshot().top, game.snapshot().players], [[], 0]);
});

test('команды: только для стримера и модераторов, прежние команды не действуют', () => {
  const { game } = startRound();
  eq(game.feed('Зритель', '!словолов-раунд'), null);
  eq(game.snapshot().state, 'playing');
  for (const other of ['!словолов раунд', '!словолов сброс', '!словолов-старт', '!словолов-стоп', '!словолов',
    '!словолов-constructor', '!раунд', '!slovolov-раунд', 'словолов-раунд']) {
    eq(game.feed('Модер', other, { mod: true }), null, other);
    eq([game.snapshot().state, game.snapshot().players], ['playing', 0], other);
  }
});

test('команды: выключаются настройкой', () => {
  const { game } = startRound({ settings: { chat_commands: false } });
  eq(game.feed('Модер', '!словолов-раунд', { mod: true }), null);
  eq(game.snapshot().state, 'playing');
});

test('настройки на ходу: подсказки, перемешивание и лимит времени действуют сразу', () => {
  const { game, clock, events } = startRound({ settings: { hint_every: 0, shuffle_every: 0 } });
  const start = clock.t, letters = game.snapshot().letters.join('');
  clock.t += 20;
  game.configure(clean({ ...ONLY_METLA, hint_every: 7, shuffle_every: 9, round_time: 60 }));
  const state = game.snapshot();
  eq([state.hint_every, state.hint_at, state.ends], [7, clock.t + 7, start + 60]);
  clock.t += 7;
  game.tick();
  eq(last(events).type, 'hint');
  clock.t += 2;
  game.tick();
  no(game.snapshot().letters.join('') === letters);
  game.configure(clean({ ...ONLY_METLA, hint_every: 0, shuffle_every: 0, round_time: 60 }));
  eq([game.snapshot().hint_at, game.snapshot().ends], [null, start + 60]);
  clock.t = start + 60;
  game.tick();
  eq([game.snapshot().state, game.snapshot().results.reason], ['results', 'time']);
});

test('настройки на ходу: слова и пауза — со следующего раунда, команды — сразу', () => {
  const { game, clock } = startRound({ settings: { pause: 12 } });
  game.configure(clean({ ...ONLY_METLA, pause: 5, min_len: 4, chat_commands: false }));
  eq(game.snapshot().total, 5);
  eq(game.feed('Модер', '!словолов-раунд', { mod: true }), null);
  game.skip();
  eq(game.snapshot().results.next_at, clock.t + 5);
  game.configure(clean({ ...ONLY_METLA, pause: 5, min_len: 4, min_words: 2 }));
  clock.t += 5;
  game.tick();
  const state = game.snapshot();
  eq([state.state, state.round], ['playing', 2]);
  ok(state.words.every((w) => w.len >= 4));
});

test('настройки на ходу: новое расписание сброса не стирает счёт задним числом', () => {
  const storage = memoryStorage();
  const { game, clock } = makeGame({ at: local(2026, 9, 5, 12), scores: new Scores(storage, 'k'),
    settings: { reset_mode: 'timer', reset_hours: 100 } });
  game.scores.add('Вася', 5);
  clock.t = local(2026, 9, 8, 12);
  game.configure(clean({ ...ONLY_METLA, reset_mode: 'timer', reset_hours: 1 }));
  game.tick();
  eq(game.snapshot().players, 1);
  clock.t += 3600;
  game.tick();
  eq(game.snapshot().players, 0);
});

test('счёт: сброс не трогает итог раунда', () => {
  const { game, events } = startRound();
  game.feed('Вася', 'тема');
  game.resetScores();
  const state = game.snapshot();
  eq([state.top, state.players], [[], 0]);
  eq(state.round_scores[0].pts, 4);
  eq([last(events).type, last(events).auto], ['scores_reset', false]);
});

test('чат: в ленту идут все сообщения', () => {
  const { game } = makeGame();
  game.feed('Вася', 'до игры');
  eq(game.snapshot().feed.length, 1);
  game.open(0);
  game.tick();
  game.feed('Вася', 'всем привет!');
  game.feed('Петя', '   ');
  game.feed('Вася', ' ТЕМА ');
  game.feed('Петя', 'тема');
  game.feed('Модер', '!словолов-сброс', { mod: true });
  const feed = game.snapshot().feed;
  eq(feed.map((m) => [m.user, m.text, m.pts, m.repeat]), [['Вася', 'до игры', 0, false],
    ['Вася', 'всем привет!', 0, false], ['Вася', 'ТЕМА', 4, false], ['Петя', 'тема', 0, true],
    ['Модер', '!словолов-сброс', 0, false]]);
  const ids = feed.map((m) => m.id);
  eq(ids, Array.from(new Set(ids)).sort((a, b) => a - b));
  eq(sorted(Object.keys(feed[0])), sorted(['id', 'user', 'text', 'color', 'pts', 'bonus', 'repeat', 'star']));
});

test('чат: пока игра остановлена, сообщения запоминаются без перерисовки', () => {
  const { game } = makeGame();
  let changes = 0;
  game.onchange = () => { changes++; };
  game.feed('Вася', 'привет');
  eq([changes, game.snapshot().feed.length], [0, 1]);
  game.open();
  const after = changes;
  game.feed('Вася', 'ещё');
  ok(changes > after);
});

test('чат: лента ограничена, длинное сообщение обрезается', () => {
  const { game } = startRound();
  for (let i = 0; i < CHAT_KEEP + 15; i++) game.feed('Вася', 'сообщение ' + i);
  const feed = game.snapshot().feed;
  eq(feed.length, CHAT_SHOWN);
  eq(last(feed).text, 'сообщение ' + (CHAT_KEEP + 14));
  game.feed('Вася', 'я'.repeat(CHAT_TEXT_MAX + 50));
  eq(last(game.snapshot().feed).text.length, CHAT_TEXT_MAX);
});

test('чат: цвет ника', () => {
  const { game } = startRound();
  game.feed('Лиса', 'привет', { color: '#FF69B4' });
  game.feed('Вася', 'привет', { color: 'красный' });
  game.feed('Петя', 'привет');
  eq(game.snapshot().feed.map((m) => m.color), ['#ff69b4', '', '']);
});

test('чат: удалённое модератором пропадает, очки остаются', () => {
  const { game } = startRound();
  game.feed('Лиса', 'раз', { msgId: 'a1', login: 'lisa' });
  game.feed('Вася', 'два', { msgId: 'a2', login: 'vasya' });
  game.feed('Лиса', 'три', { msgId: 'a3', login: 'lisa' });
  game.feed('Петя', 'тема', { msgId: 'a4', login: 'petya' });
  eq(game.unsay({ msgId: 'a2' }), 1);
  eq(game.snapshot().feed.map((m) => m.text), ['раз', 'три', 'тема']);
  eq(game.unsay({ user: 'LISA' }), 2);
  eq(game.unsay({ user: 'никто' }), 0);
  eq(game.unsay({}), 0);
  eq(game.unsay({ everything: true }), 1);
  const state = game.snapshot();
  eq([state.feed, state.found, state.top[0].score], [[], 1, 4]);
  no(JSON.stringify(game.snapshot()).includes('a4'));
});

test('чат: смайлики Twitch доходят до ленты', () => {
  const { game } = startRound();
  game.feed('Вася', 'Kappa привет', { emotes: { Kappa: '25' } });
  game.feed('Петя', 'без смайликов');
  game.feed('Оля', 'мусор', { emotes: { 'два слова': '1', ok: 'не номер!', '': '5', LUL: 'emotesv2_a1', x: 7 } });
  game.feed('Тим', 'ещё мусор', { emotes: '25:0-4' });
  const feed = game.snapshot().feed;
  eq(feed[0].emotes, { Kappa: '25' });
  no('emotes' in feed[1]);
  eq(feed[2].emotes, { LUL: 'emotesv2_a1', x: '7' });
  no('emotes' in feed[3]);
});

test('чат: автор игры узнаётся по логину', () => {
  const { game } = startRound();
  const dev = STARS[0], shown = dev.charAt(0).toUpperCase() + dev.slice(1);
  game.feed(shown, 'привет', { login: dev });
  game.feed('Петя', 'привет', { login: 'petya' });
  game.feed('Ник На Кириллице', 'привет', { login: dev });
  game.feed(shown, 'привет', { login: 'samozvanec' });
  game.feed(dev.toUpperCase(), 'привет');
  const state = game.snapshot();
  eq(state.feed.map((m) => m.star), [true, false, true, false, true]);
  eq(state.stars, STARS);
  eq(STARS.length, 1);
});

test('сброс счёта: когда следующий — по дате', () => {
  const monday = local(2026, 9, 5, 12);
  eq(nextReset(monday, 'day', 6), local(2026, 9, 6, 6));
  eq(nextReset(local(2026, 9, 5, 5), 'day', 6), local(2026, 9, 5, 6));
  eq(nextReset(local(2026, 9, 5, 6), 'day', 6), local(2026, 9, 6, 6));
  eq(nextReset(monday, 'day', 0), local(2026, 9, 6, 0));
  eq(nextReset(local(2026, 9, 7, 12), 'week', 6), local(2026, 9, 12, 6));
  eq(nextReset(local(2026, 9, 5, 5), 'week', 6), local(2026, 9, 5, 6));
  eq(nextReset(monday, 'week', 6), local(2026, 9, 12, 6));
  eq(nextReset(local(2026, 9, 11, 23), 'week', 6), local(2026, 9, 12, 6));
  eq(nextReset(local(2026, 10, 1, 12), 'week', 6), local(2026, 10, 2, 6));
  eq(nextReset(local(2026, 9, 1, 12), 'week', 6), local(2026, 9, 5, 6));
  eq(nextReset(monday, 'month', 6), local(2026, 10, 1, 6));
  eq(nextReset(local(2026, 9, 1, 5), 'month', 6), local(2026, 9, 1, 6));
  eq(nextReset(local(2026, 11, 15, 12), 'month', 6), local(2027, 0, 1, 6));
});

test('сброс счёта: по таймеру и никогда', () => {
  eq(nextReset(1000, 'timer', 6, 2), 1000 + 7200);
  eq(nextReset(1000, 'never', 6, 2), null);
  eq(nextReset(1000, 'как-нибудь', 6, 2), null);
  eq(nextReset(NaN, 'day', 6), null);
});

test('сброс счёта: по умолчанию счёт копится без срока', () => {
  const { game, clock } = startRound();
  game.feed('Вася', 'тема');
  clock.t += 1e7;
  game.tick();
  eq(game.snapshot().top[0].score, 4);
  eq(game.scores.since, null);
});

test('сброс счёта: по таймеру', () => {
  const { game, clock, events } = startRound({ settings: { reset_mode: 'timer', reset_hours: 2, hint_every: 0,
    pause: 100000 } });
  const start = clock.t;
  game.feed('Вася', 'тема');
  clock.t = start + 7199;
  game.tick();
  eq(game.snapshot().players, 1);
  clock.t = start + 7200;
  game.tick();
  const state = game.snapshot();
  eq([state.top, state.players, state.round_scores[0].pts], [[], 0, 4]);
  eq([last(events).type, last(events).auto], ['scores_reset', true]);
  game.feed('Вася', 'мат');
  clock.t += 7199;
  game.tick();
  eq(game.snapshot().players, 1);
  clock.t += 1;
  game.tick();
  eq(game.snapshot().players, 0);
  game.feed('Вася', 'мел');
  clock.t += 100;
  game.resetScores();
  clock.t += 7199;
  game.tick();
  eq(types(events).filter((type) => type === 'scores_reset').length, 3);
});

test('сброс счёта: каждый день, даже когда игра остановлена', () => {
  const { game, clock, events } = makeGame({ at: local(2026, 9, 5, 23),
    settings: { reset_mode: 'day', reset_hour: 6, hint_every: 0 } });
  game.scores.add('Вася', 5);
  clock.t = local(2026, 9, 6, 5, 59);
  game.tick();
  eq(game.scores.size, 1);
  clock.t = local(2026, 9, 6, 6, 0);
  game.tick();
  game.tick();
  eq(game.scores.size, 0);
  eq(types(events), ['scores_reset']);
  game.scores.add('Вася', 5);
  clock.t = local(2026, 9, 7, 7);
  game.tick();
  eq(game.scores.top(), []);
});

test('сброс счёта: пропущенный сброс случается при следующем запуске', () => {
  const storage = memoryStorage();
  const settings = { reset_mode: 'day', reset_hour: 6 };
  const first = makeGame({ at: local(2026, 9, 5, 23), settings, scores: new Scores(storage, 'k') }).game;
  first.scores.add('Вася', 5);
  eq(new Scores(storage, 'k').since, local(2026, 9, 5, 23));
  const later = makeGame({ at: local(2026, 9, 8, 20), settings, scores: new Scores(storage, 'k') }).game;
  eq(later.snapshot().players, 1);
  later.tick();
  eq(later.snapshot().players, 0);
  eq(new Scores(storage, 'k').since, local(2026, 9, 8, 20));
});

test('сброс счёта: включение расписания давний счёт не стирает', () => {
  const storage = memoryStorage();
  new Scores(storage, 'k').add('Вася', 5);
  const { game } = makeGame({ at: local(2026, 9, 5, 23), settings: { reset_mode: 'day', reset_hour: 6 },
    scores: new Scores(storage, 'k') });
  game.tick();
  eq(game.snapshot().players, 1);
  eq(game.scores.since, local(2026, 9, 5, 23));
});

test('счёт: хранится и переживает перезагрузку', () => {
  const storage = memoryStorage();
  const { game } = startRound({ scores: new Scores(storage, 'счёт') });
  game.feed('Вася', 'тема');
  game.feed('вася', 'мат');
  eq(new Scores(storage, 'счёт').top(), [{ name: 'вася', score: 7, words: 2 }]);
  eq(new Scores(storage, 'другой канал').top(), []);
  game.resetScores();
  eq(new Scores(storage, 'счёт').top(), []);
  storage.setItem('счёт', 'не json');
  eq(new Scores(storage, 'счёт').top(), []);
  storage.setItem('счёт', '{"a": 5, "b": {"score": "12", "words": null}}');
  eq(new Scores(storage, 'счёт').top(), [{ name: 'b', score: 12, words: 0 }]);
});

test('счёт: хранилище может отказать — игра продолжается', () => {
  const broken = { getItem: () => { throw new Error('нельзя'); }, setItem: () => { throw new Error('нельзя'); } };
  const { game } = startRound({ scores: new Scores(broken, 'счёт') });
  eq(game.feed('Вася', 'тема').type, 'guess');
  eq(game.snapshot().top[0].score, 4);
});

test('счёт: ники, совпадающие со словами самого языка', () => {
  const { game } = startRound();
  game.feed('constructor', 'тема');
  game.feed('__proto__', 'мат');
  game.feed('toString', 'мел');
  const state = game.snapshot();
  eq(state.top.map((row) => [row.name, row.score]), [['constructor', 4], ['__proto__', 3], ['toString', 3]]);
  eq(state.round_scores.length, 3);
  const storage = memoryStorage(), scores = new Scores(storage, 'k');
  scores.add('__proto__', 5);
  scores.add('constructor', 2);
  eq(new Scores(storage, 'k').top().map((row) => row.name), ['__proto__', 'constructor']);
});

test('события: слушатель может обращаться к игре, сломанный её не роняет', () => {
  const { game, events } = makeGame();
  game.listeners.push(() => { throw new Error('сломан'); });
  game.listeners.push((event) => {
    if (event.type === 'round_end') game.skip();
  });
  game.open(0);
  game.tick();
  game.skip();
  eq(types(events), ['countdown', 'round_start', 'round_end', 'round_start']);
  eq(game.snapshot().round, 2);
});

test('игра: много раундов подряд идут без сбоев', () => {
  const clock = fakeClock(), rng = seeded(11);
  const game = new Game(new Dictionary(SMALL), clean({ ...ONLY_METLA, base_max: 6, pause: 5, hint_every: 7 }), null,
    { rng, clock });
  const pool = Object.keys(SMALL).concat(['привет', '!словолов-раунд']);
  game.open(1);
  for (let step = 0; step < 3000; step++) {
    clock.t += 0.5;
    game.tick();
    if (rng() < 0.6) {
      const viewer = 'зритель' + Math.floor(rng() * 5);
      game.feed(viewer, pool[Math.floor(rng() * pool.length)], { mod: rng() < 0.05 });
    }
    const state = game.snapshot();
    ok(['countdown', 'playing', 'results'].includes(state.state));
    if (state.words) ok(state.found <= state.total);
  }
  ok(game.snapshot().round > 20);
});
