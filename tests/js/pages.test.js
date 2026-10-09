import { SOUNDS, measure } from '../../site/js/sound.js';
import { layout, sideRows } from '../../site/js/view.js';
import { eq, no, ok, test } from './harness.js';

const SITE = '/site/';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, note = 'условие', ms = 15000) {
  const deadline = Date.now() + ms;
  for (;;) {
    let value = null;
    try {
      value = check();
    } catch (error) {
      value = null;
    }
    if (value) return value;
    if (Date.now() > deadline) throw new Error('не дождались: ' + note);
    await wait(30);
  }
}

async function open(path, ready) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;border:0;background:#333';
  frame.src = SITE + path;
  document.body.append(frame);
  await until(() => ready(frame.contentWindow), 'страница ' + path + ' не поднялась');
  return frame;
}

const element = (w, id) => w.document.getElementById(id);
const all = (w, selector) => Array.from(w.document.querySelectorAll(selector));
const box = (node) => {
  const rect = node.getBoundingClientRect();
  return [Math.round(rect.left), Math.round(rect.right)];
};

function forget() {
  for (const key of Object.keys(localStorage)) if (key.startsWith('slovolov')) localStorage.removeItem(key);
}

const overlay = (query = '') => open('overlay.html' + (query ? '?' + query : ''), (w) => w.slovolov && w.slovolov.game);
const embedded = (query = '') => open('overlay.html?embed=1' + (query ? '&' + query : ''),
  (w) => w.slovolov && w.slovolov.game);

async function playing(query = '') {
  const frame = await overlay(query);
  const w = frame.contentWindow, game = w.slovolov.game;
  game.tick(game.startsAt);
  await until(() => all(w, '#letters .tile').length && element(w, 'lobby').hidden, 'раунд на экране');
  return { frame, w, game, chat: w.slovolov.chat, view: w.slovolov.view };
}

function noImages(w) {
  Object.defineProperty(w.HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return this.getAttribute('data-src') || ''; },
    set(value) { this.setAttribute('data-src', value); },
  });
}

function showSource(w, visible) {
  w.dispatchEvent(new w.CustomEvent('obsSourceVisibleChanged', { detail: { visible } }));
}

function fakeSockets(chat) {
  const sockets = [];
  chat.Socket = class {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }

    send(line) {
      this.sent.push(line);
    }

    close() {
      this.closed = true;
    }
  };
  return sockets;
}

const EMOTE_REPLIES = {
  'https://7tv.io/v3/emote-sets/global': {
    emotes: [{ name: 'catJAM', id: '01ABCDEFGHJKMNPQRSTVWXYZ01' }, { name: 'плохой', id: '../x' }],
  },
  'https://7tv.io/v3/users/twitch/123': {
    emote_set: {
      emotes: [{ name: 'Channel7', id: '01ZZZZZZZZZZZZZZZZZZZZZZZZ' }, { name: 'Dup', id: '7tv7tv7tv7' }],
    },
  },
  'https://api.betterttv.net/3/cached/emotes/global': [
    { id: '5f1b0186cf6d2144653d2970', code: 'catJAM' },
    { id: '54fa8f1401e468494b85b537', code: ':tf:' },
  ],
  'https://api.betterttv.net/3/cached/users/twitch/123': {
    channelEmotes: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', code: 'Dup' }],
    sharedEmotes: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', code: 'Shared' }],
  },
  'https://api.frankerfacez.com/v1/set/global': {
    default_sets: [3],
    sets: {
      3: {
        emoticons: [
          { id: 28136, name: 'LilZ', urls: { 1: 'x', 2: 'x' } },
          { id: 9, name: 'ZrehplaR', urls: { 1: 'x' } },
        ],
      },
      4330: { emoticons: [{ id: 1, name: 'NotForAll', urls: { 1: 'x' } }] },
    },
  },
  'https://api.frankerfacez.com/v1/room/id/123': {
    room: { set: 77 },
    sets: {
      77: { emoticons: [{ id: 720810, name: 'Dance', urls: { 1: 'x', 2: 'x' }, animated: { 1: 'x', 2: 'x' } }] },
    },
  },
};

test('раскладка: клетка — самая крупная из возможных, столбцов не больше трёх', () => {
  const lengths = (...groups) => groups.reduce((list, [count, length]) => list.concat(Array(count).fill(length)), []);
  const many = layout(lengths([12, 3], [15, 4], [10, 5], [5, 6], [2, 7], [1, 8]), 704, 488);
  eq(many.rows, 15);
  ok(many.cell >= 26 && many.cell <= 28, many.cell);
  const usual = layout(lengths([7, 3], [8, 4], [3, 5], [1, 6], [1, 7]), 704, 466);
  eq(usual.rows, 10);
  ok(usual.cell >= 38, usual.cell);
  eq(layout(lengths([4, 3]), 704, 466), { cell: 46, rows: 4 });
  eq(layout([], 704, 466), { cell: 46, rows: 1 });
  const wide = layout(lengths([20, 12]), 704, 466);
  eq([wide.rows, wide.cell], [10, 25.5]);
});

test('счёт: занимает всё место, при переполнении — десятка общего счёта и итоги раунда', () => {
  eq(sideRows(3, 5, 16), { round: 3, total: 13 });
  eq(sideRows(0, 0, 16), { round: 1, total: 15 });
  eq(sideRows(12, 30, 16), { round: 6, total: 10 });
  eq(sideRows(3, 30, 16), { round: 3, total: 13 });
  eq(sideRows(12, 5, 16), { round: 11, total: 5 });
  eq(sideRows(40, 40, 16), { round: 6, total: 10 });
});

test('звуки: каждый не пуст, не перегружен и не тянется', async () => {
  eq(SOUNDS.slice().sort(), ['bonus', 'end', 'guess', 'hint', 'long', 'shuffle', 'start', 'tick', 'win']);
  for (const name of SOUNDS) {
    const loud = await measure(name, 100), quiet = await measure(name, 30);
    ok(loud.peak > 0.08 && loud.peak < 0.98, name + ': пик ' + loud.peak.toFixed(3));
    ok(loud.seconds > 0.05 && loud.seconds < 3.6, name + ': длится ' + loud.seconds.toFixed(2) + ' с');
    ok(quiet.peak < loud.peak * 0.7, name + ': громкость не слушается настройки');
  }
  ok((await measure('guess', 0)).peak < 0.001);
});

test('оверлей: открылся — отсчёт десять секунд, потом раунд', async () => {
  forget();
  const frame = await overlay();
  const w = frame.contentWindow, game = w.slovolov.game;
  eq(game.state, 'countdown');
  ok(Math.abs(game.startsAt - game.clock() - 10) < 1.5);
  await until(() => !element(w, 'stage').hidden && !element(w, 'lobby').hidden, 'отсчёт на экране');
  ok(['10', '9'].includes(element(w, 'countdown-number').textContent));
  ok(element(w, 'play').hidden);
  eq(all(w, '#lobby-tiles .tile').length, 8);
  eq(w.slovolov.chat.status.state, 'off');
  game.tick(game.startsAt);
  await until(() => element(w, 'lobby').hidden && all(w, '#words .slot').length, 'раунд на экране');
  const state = game.snapshot();
  eq([state.state, all(w, '#letters .tile').length, all(w, '#words .slot').length],
    ['playing', state.letters.length, state.total]);
  ok(element(w, 'play').classList.contains('enter'));
  eq(w.slovolov.view.heard, ['start']);
  frame.remove();
});

test('оверлей: источник скрыли — игра остановилась, показали — отсчёт и новое слово', async () => {
  forget();
  const { frame, w, game } = await playing();
  const first = game.answers().base;
  showSource(w, false);
  await until(() => element(w, 'stage').hidden, 'оверлей убран');
  eq(game.state, 'stopped');
  showSource(w, true);
  await until(() => !element(w, 'lobby').hidden, 'отсчёт на экране');
  eq(game.state, 'countdown');
  ok(game.startsAt - game.clock() > 8.5);
  game.tick(game.startsAt);
  await until(() => element(w, 'lobby').hidden, 'новый раунд');
  eq(game.snapshot().round, 2);
  no(game.answers().base === first);
  showSource(w, true);
  eq(game.state, 'countdown');
  await until(() => !element(w, 'lobby').hidden && element(w, 'play').hidden, 'снова отсчёт');
  frame.remove();
});

test('оверлей: сайт обновился — страница перезагружается сама, но не посреди раунда', async () => {
  forget();
  const { frame, w, game } = await playing();
  const fetchFile = w.fetch.bind(w);
  w.fetch = (url, options) => (options && options.method === 'HEAD'
    ? Promise.resolve({ ok: true, headers: { get: () => 'новая версия' } })
    : fetchFile(url, options));
  w.loadedBefore = true;
  await wait(5500);
  ok(frame.contentWindow.loadedBefore);
  game.skip();
  await until(() => !frame.contentWindow.loadedBefore, 'страница перезагрузилась');
  frame.remove();
  forget();
});

test('оверлей: слово из чата открывается, команды слушаются модератора', async () => {
  forget();
  const { frame, w, game, chat } = await playing();
  const word = game.answers().words[0].word;
  chat.onMessage('Вася', word, false, { msgId: 'm1', login: 'vasya', color: '#FF69B4' });
  chat.onMessage('Петя', 'всем привет', false, { msgId: 'm2', login: 'petya', color: '' });
  await until(() => all(w, '#words .slot.open').length === 1, 'слово открылось');
  const text = () => element(w, 'chat').innerText;
  ok(text().includes('Вася') && text().includes('+' + word.length), text());
  ok(element(w, 'list-total').innerText.includes('Вася') && element(w, 'list-round').innerText.includes('Вася'));
  eq(all(w, '#words .slot.open')[0].innerText.replace(/\s/g, '').toLowerCase(), word);
  chat.onClear({ msgId: 'm2' });
  await until(() => !text().includes('всем привет'), 'сообщение убрано');
  eq(game.snapshot().found, 1);
  chat.onMessage('Петя', '!словолов-раунд', false, {});
  eq(game.state, 'playing');
  chat.onMessage('Модер', '!словолов-раунд', true, {});
  await until(() => element(w, 'card').classList.contains('results'), 'итоги раунда');
  chat.onMessage('Модер', '!словолов-сброс', true, {});
  await until(() => element(w, 'list-total').innerText.includes('пока пусто'), 'счёт сброшен');
  frame.remove();
});

test('оверлей: скрытые панели убавляют рамку, а поле игры остаётся на месте', async () => {
  forget();
  const full = await playing();
  eq([box(element(full.w, 'card')), box(element(full.w, 'main'))], [[10, 1270], [326, 1030]]);
  full.frame.remove();
  const bare = await playing('chat=0&side=0&bg=0&accent=3fa7ff');
  const classes = bare.w.document.body.classList;
  ok(classes.contains('nochat') && classes.contains('noside') && classes.contains('nobg'));
  eq([box(element(bare.w, 'card')), box(element(bare.w, 'main'))], [[306, 1050], [326, 1030]]);
  eq(bare.w.getComputedStyle(bare.w.document.querySelector('.chatbox')).display, 'none');
  eq(bare.w.getComputedStyle(element(bare.w, 'side')).display, 'none');
  eq(bare.w.document.documentElement.style.getPropertyValue('--accent'), '#3fa7ff');
  bare.frame.remove();
  const left = await playing('side=0&webcam=0');
  eq([box(element(left.w, 'card')), box(element(left.w, 'main'))], [[10, 1050], [326, 1030]]);
  eq(left.w.getComputedStyle(left.w.document.querySelector('.cam')).display, 'none');
  left.frame.remove();
});

test('оверлей: общий счёт переживает перезагрузку страницы', async () => {
  forget();
  let round = await playing();
  const word = round.game.answers().words[0].word;
  round.game.feed('Вася', word);
  round.frame.remove();
  round = await playing();
  eq(round.game.snapshot().top, [{ name: 'Вася', score: word.length, words: 1 }]);
  await until(() => element(round.w, 'list-total').innerText.includes('Вася'), 'счёт на экране');
  round.frame.remove();
  forget();
});

test('оверлей: сорок пять слов помещаются в три столбика, добавленные буквы — в строку', async () => {
  forget();
  const { frame, w, game, view } = await playing('extra_letters=4&base_min=8&base_max=8');
  const tiles = element(w, 'letters');
  eq(all(w, '#letters .tile').length, 12);
  ok(tiles.scrollWidth <= tiles.clientWidth);
  const words = element(w, 'words');
  ok(words.scrollWidth <= words.clientWidth && words.scrollHeight <= words.clientHeight);
  const crowded = Object.assign(game.snapshot(), { round: 99, total: 45, found: 0,
    words: Array.from({ length: 45 }, (_, i) => ({ len: 3 + Math.floor(i / 8), word: null, by: null, closed: false,
      missed: false, hint: '' })) });
  view.render(crowded);
  eq(words.children.length, 45);
  eq(w.getComputedStyle(words).getPropertyValue('--rows').trim(), '15');
  ok(parseFloat(w.getComputedStyle(words).getPropertyValue('--cell')) >= 26);
  ok(words.scrollWidth <= words.clientWidth && words.scrollHeight <= words.clientHeight);
  eq(new Set(Array.from(words.children, (slot) => Math.round(slot.getBoundingClientRect().left))).size, 3);
  ok(element(w, 'play').classList.contains('dense'));
  frame.remove();
});

test('оверлей: счёт и правила помещаются в столбик, правила — под счётом', async () => {
  forget();
  const { frame, w, game } = await playing();
  for (let i = 0; i < 40; i++) game.scores.add('зритель' + i, 40 - i);
  game.answers().words.slice(0, 3).forEach((slot, i) => game.feed('игрок' + i, slot.word));
  await until(() => all(w, '#list-round li').length === 3, 'счёт раунда');
  const side = element(w, 'side');
  ok(side.scrollHeight <= side.clientHeight);
  ok(element(w, 'rules').getBoundingClientRect().top > element(w, 'list-total').getBoundingClientRect().bottom);
  const total = all(w, '#list-total li');
  ok(total.length >= 10);
  ok(total[total.length - 1].textContent.startsWith('и ещё '));
  eq(all(w, '#rules li').length, 5);
  frame.remove();
  forget();
});

test('оверлей: буквы перемешиваются на глазах, звуки — по событиям игры', async () => {
  forget();
  const { frame, w, game, view } = await playing('hint_every=0');
  const heard = view.heard;
  eq(heard, ['start']);
  const shown = () => all(w, '#letters .tile').map((tile) => tile.textContent).join('');
  const before = shown();
  game._shuffle(game.clock());
  await until(() => w.document.querySelector('#letters .tile.moved'), 'плашки поехали');
  no(shown() === before);
  eq(Array.from(shown()).sort().join(''), Array.from(before).sort().join(''));
  eq(all(w, '#letters .tile.moved').length, before.length);
  eq(heard[1], 'shuffle');
  const first = game.answers().words[0].word;
  game.feed('Вася', first);
  await until(() => heard.length === 3, 'звук угаданного слова');
  eq(heard[2], first.length >= 6 ? 'long' : 'guess');
  game.skip();
  await until(() => heard.length === 4, 'звук конца раунда');
  eq(heard[3], 'end');
  game.skip();
  await until(() => heard.length === 5, 'звук начала раунда');
  eq(heard[4], 'start');
  frame.remove();
});

test('оверлей: без звука — тишина', async () => {
  forget();
  const { frame, w, game, view } = await playing('sound=0');
  game.feed('Вася', game.answers().words[0].word);
  await until(() => w.document.querySelector('#words .slot.open'), 'слово открылось');
  eq(view.heard, []);
  frame.remove();
});

test('оверлей: в чате — «уже было», автор игры и смайлики четырёх сервисов', async () => {
  forget();
  const { frame, w, game, chat } = await playing('hint_every=0');
  const dev = game.snapshot().stars[0];
  noImages(w);
  const asked = [];
  w.fetch = async (url) => {
    asked.push(String(url));
    const reply = EMOTE_REPLIES[String(url)];
    return reply ? { ok: true, status: 200, json: async () => reply } : { ok: false, status: 404 };
  };
  const rows = () => all(w, '#chat .msg');
  const images = (row) => Array.from(row.querySelectorAll('img'), (image) => image.getAttribute('data-src'));
  const word = game.answers().words[0].word;
  chat.onMessage('Вася', word, false, {});
  chat.onMessage('Петя', word, false, {});
  chat.onMessage(dev, 'всем привет', false, { login: dev });
  chat.onMessage('Оля', 'Kappa ну и буквы constructor', false, { emotes: { Kappa: '25' } });
  await until(() => rows().length === 4, 'четыре сообщения');
  no(rows()[0].innerText.includes('уже было'));
  ok(rows()[1].innerText.includes('уже было'), rows()[1].innerText);
  no(rows()[0].classList.contains('star'));
  ok(rows()[2].classList.contains('star') && rows()[2].querySelector('b').classList.contains('rainbow'));
  ok(w.getComputedStyle(rows()[2]).borderTopWidth !== '0px');
  eq(w.getComputedStyle(rows()[0]).borderTopWidth, '0px');
  eq(w.getComputedStyle(rows()[2].querySelector('.text')).color, w.getComputedStyle(rows()[0]).color);
  eq(images(rows()[3]), ['https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0']);
  ok(rows()[3].innerText.includes('ну и буквы constructor'));
  chat.onMessage(dev, game.answers().words[1].word, false, { login: dev });
  await until(() => w.document.querySelector('#list-round .name.rainbow'), 'ник автора в счёте');
  ok(w.document.querySelector('#list-total .name.rainbow'));
  chat.status.roomId = '123';
  game._bump();
  await until(() => asked.length === 6, 'запросы за смайликами');
  eq(asked.slice().sort(), Object.keys(EMOTE_REPLIES).sort());
  chat.onMessage('Оля', 'catJAM Channel7 :tf: Shared LilZ ZrehplaR Dance Dup NotForAll плохой', false, {});
  await until(() => rows().length === 6 && rows()[5].querySelectorAll('img').length === 8, 'смайлики');
  eq(images(rows()[5]), [
    'https://cdn.7tv.app/emote/01ABCDEFGHJKMNPQRSTVWXYZ01/2x.webp',
    'https://cdn.7tv.app/emote/01ZZZZZZZZZZZZZZZZZZZZZZZZ/2x.webp',
    'https://cdn.betterttv.net/emote/54fa8f1401e468494b85b537/2x',
    'https://cdn.betterttv.net/emote/bbbbbbbbbbbbbbbbbbbbbbbb/2x',
    'https://cdn.frankerfacez.com/emote/28136/2',
    'https://cdn.frankerfacez.com/emote/9/1',
    'https://cdn.frankerfacez.com/emote/720810/animated/2',
    'https://cdn.7tv.app/emote/7tv7tv7tv7/2x.webp']);
  ok(rows()[5].innerText.includes('NotForAll плохой'));
  const kept = rows()[5];
  chat.onMessage('Оля', 'ещё сообщение', false, { msgId: 'm7' });
  await until(() => rows().length === 7, 'седьмое сообщение');
  ok(rows()[5] === kept);
  chat.onClear({ msgId: 'm7' });
  await until(() => rows().length === 6, 'сообщение убрано');
  ok(rows()[5] === kept);
  frame.remove();
});

function rainbowInStep(w, count) {
  const phases = all(w, '.rainbow').filter((node) => node.getClientRects().length).map((node) => {
    const animation = node.getAnimations().find((item) => item.animationName === 'rainbow');
    return animation ? animation.effect.getComputedTiming().progress : null;
  });
  if (phases.length < count || phases.includes(null)) return false;
  const range = Math.max(...phases) - Math.min(...phases);
  return Math.min(range, 1 - range) < 0.02;
}

test('оверлей: ник автора переливается везде в лад — и после того, как источник скрыли и показали', async () => {
  forget();
  const { frame, w, game, chat } = await playing('hint_every=0');
  const dev = game.snapshot().stars[0];
  chat.onMessage(dev, 'всем привет', false, { login: dev });
  await wait(350);
  chat.onMessage(dev, game.answers().words[0].word, false, { login: dev });
  await until(() => rainbowInStep(w, 4), 'ник в чате и в счёте переливается в лад');
  showSource(w, false);
  await until(() => element(w, 'stage').hidden, 'оверлей убран');
  await wait(450);
  showSource(w, true);
  await until(() => !element(w, 'stage').hidden, 'оверлей на экране');
  chat.onMessage(dev, 'я снова тут', false, { login: dev });
  await until(() => rainbowInStep(w, 4), 'после возвращения ник снова переливается в лад');
  frame.remove();
  forget();
});


test('оверлей: угаданное слово подсвечивается, а поле слов не обрезает подсветку и буквы подсказок', async () => {
  forget();
  const { frame, w, game } = await playing('hint_every=0');
  eq(w.getComputedStyle(element(w, 'words')).overflow, 'visible');
  const animations = (selector) => w.getComputedStyle(w.document.querySelector(selector)).animationName;
  game.feed('Вася', game.answers().words[0].word);
  await until(() => w.document.querySelector('#words .slot.open.pop'), 'слово открылось');
  ok(animations('#words .slot.open span').includes('cell-glow'));
  game._hint(game.clock());
  await until(() => w.document.querySelector('#words span.hinted'), 'буква подсказки');
  eq(animations('#words span.hinted'), 'hint-in');
  game.skip();
  await until(() => w.document.querySelector('#words .slot.missed.pop'), 'неугаданные слова открыты');
  eq(animations('#words .slot.missed span'), 'cell-flip');
  frame.remove();
});

test('встроенный оверлей: пока игру не начали — неподвижный пример', async () => {
  forget();
  const frame = await embedded('min_len=4&hint_every=10');
  const w = frame.contentWindow, api = w.slovolov;
  eq([api.game.state, api.chat.status.state], ['stopped', 'off']);
  const chat = element(w, 'chat').innerText;
  ok(chat.includes('уже было') && chat.includes('вне клеток') && chat.includes('+4'), chat);
  ok(all(w, '#list-round li').length >= 3 && all(w, '#list-total li').length >= 10);
  ok(element(w, 'rules').innerText.includes('От 4 букв') && element(w, 'rules').innerText.includes('раз в 10 с'));
  ok(all(w, '#words .slot').every((slot) => slot.children.length >= 4));
  eq([all(w, '#words .slot').length, all(w, '#letters .tile').length], [22, 9]);
  const label = element(w, 'label').textContent;
  await wait(600);
  eq(element(w, 'label').textContent, label);
  eq(api.view.heard, []);
  api.apply({ chat: false, side: false, max_words: 5, extra_letters: 0, accent: '#3fa7ff' });
  const classes = w.document.body.classList;
  ok(classes.contains('nochat') && classes.contains('noside'));
  eq([all(w, '#words .slot').length, all(w, '#letters .tile').length], [5, 7]);
  eq(w.document.documentElement.style.getPropertyValue('--accent'), '#3fa7ff');
  showSource(w, true);
  eq(api.game.state, 'stopped');
  frame.remove();
});

test('встроенный оверлей: «начать» — настоящая игра, настройки меняются на ходу, «остановить» — пример', async () => {
  forget();
  const frame = await embedded();
  const w = frame.contentWindow, api = w.slovolov;
  const sockets = fakeSockets(api.chat);
  api.apply({ channel: 'some_channel' });
  eq(sockets.length, 0);
  api.start();
  eq([api.game.state, sockets.length, sockets[0].closed], ['countdown', 1, false]);
  await until(() => !element(w, 'lobby').hidden, 'отсчёт на экране');
  ok(element(w, 'chat').innerText.includes('пока тихо'));
  api.game.tick(api.game.startsAt);
  await until(() => element(w, 'lobby').hidden && all(w, '#words .slot').length, 'раунд на экране');
  const word = api.game.answers().words[0].word;
  api.chat.onMessage('Вася', word, false, {});
  await until(() => all(w, '#words .slot.open').length === 1, 'слово открылось');
  const opened = w.document.querySelector('#words .slot.open');
  await until(() => api.view.heard.length === 2, 'звук угаданного слова');
  api.apply({ channel: 'some_channel', side: false, hint_every: 77, shuffle_every: 0 });
  eq([api.game.state, api.game.s.hint_every, api.game.snapshot().round], ['playing', 77, 1]);
  await until(() => w.document.body.classList.contains('noside'), 'счёт скрыт на ходу');
  await wait(300);
  eq([all(w, '#words .slot.open').length, w.document.querySelector('#words .slot.open') === opened], [1, true]);
  eq(api.view.heard.length, 2);
  showSource(w, false);
  eq(api.game.state, 'playing');
  api.apply({ channel: 'other_channel' });
  eq([sockets.length, sockets[0].closed, api.chat.channel, api.game.snapshot().top], [2, true, 'other_channel', []]);
  api.stop();
  eq([api.game.state, api.chat.status.state, sockets[1].closed], ['stopped', 'off', true]);
  await until(() => element(w, 'chat').innerText.includes('уже было'), 'снова пример');
  api.start();
  eq([api.game.state, sockets.length], ['countdown', 3]);
  api.stop();
  frame.remove();
  forget();
});

const gameOf = (w) => element(w, 'game').contentWindow;
const mainPage = (query = '') => open('index.html' + query,
  (w) => gameOf(w).slovolov && gameOf(w).slovolov.game && !element(w, 'play').disabled);
const link = (w) => element(w, 'link').value;
const query = (w) => (link(w).split('?')[1] || '');
const NUMBER_FIELDS = ['pause', 'hint_every', 'shuffle_every', 'round_time', 'base_min', 'base_max', 'extra_letters',
  'min_len', 'max_words', 'min_words', 'volume'];
const RECOMMENDED = ['20', '10', '30', '0', '5', '8', '2', '4', '45', '6', '100'];
const shownNumbers = (w) => NUMBER_FIELDS.map((key) => element(w, 's-' + key).value);

function type(w, id, value) {
  const field = element(w, id);
  if (field.type === 'checkbox') field.checked = value;
  else field.value = value;
  field.dispatchEvent(new w.Event('input', { bubbles: true }));
  field.dispatchEvent(new w.Event('change', { bubbles: true }));
}

test('страница: при первом заходе — пример, рекомендуемые настройки и готовая ссылка для OBS', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow, game = gameOf(w);
  ok(link(w).endsWith('/site/overlay.html'), link(w));
  ok(element(w, 'link-status').textContent.includes('канал'));
  ok(element(w, 'status').textContent.includes('пример'));
  eq([game.slovolov.game.state, all(game, '#words .slot').length], ['stopped', 22]);
  eq(element(w, 'play').textContent, 'Начать');
  eq(shownNumbers(w), RECOMMENDED);
  ok(element(w, 's-sound').checked && element(w, 's-chat_commands').checked);
  eq(w.document.getElementById('save'), null);
  const author = w.document.querySelector('.author a');
  eq([author.textContent, author.getAttribute('href')], ['Sumaizu', 'https://twitch.tv/sumaizu']);
  frame.remove();
  forget();
});

test('страница: кнопка «Настройки» открывает панель рядом с игрой', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow;
  const place = (node) => node.getBoundingClientRect();
  const toggle = element(w, 'toggle-settings'), panel = element(w, 'settings'), screen = element(w, 'game');
  ok(panel.hidden);
  eq(toggle.getAttribute('aria-expanded'), 'false');
  const wide = place(screen).width;
  toggle.click();
  no(panel.hidden);
  eq(toggle.getAttribute('aria-expanded'), 'true');
  ok(place(panel).left >= place(screen).right && place(screen).width < wide);
  ok(Math.abs(place(screen).width / place(screen).height - 16 / 9) < 0.02);
  const title = place(w.document.querySelector('h1')), credit = place(w.document.querySelector('.author a'));
  ok(credit.left > title.right + 300 && credit.top < title.bottom && credit.bottom > title.top);
  for (const id of ['s-accent', 'hide-chat', 'hide-side', 'hide-bg', 'defaults']) {
    ok(place(element(w, id)).left >= place(panel).left && place(element(w, id)).right <= place(panel).right, id);
  }
  ok(place(w.document.querySelector('.switch')).height < 48);
  const commands = Array.from(w.document.querySelectorAll('.check code'));
  eq(commands.map((node) => node.textContent), ['!словолов-раунд', '!словолов-сброс']);
  ok(place(commands[1]).top > place(commands[0]).bottom - 2);
  toggle.click();
  ok(panel.hidden);
  eq(Math.round(place(screen).width), Math.round(wide));
  frame.remove();
  forget();
});

test('страница: «Начать» запускает игру в браузере, «Остановить» возвращает пример', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow, game = gameOf(w), api = game.slovolov;
  const sockets = fakeSockets(api.chat);
  element(w, 'play').click();
  eq([api.game.state, sockets.length], ['stopped', 0]);
  ok(element(w, 'status').classList.contains('warn') && element(w, 'status').textContent.includes('канал'));
  eq(w.document.activeElement, element(w, 's-channel'));
  element(w, 's-channel').value = 'https://twitch.tv/Some_One';
  element(w, 'play').click();
  eq([element(w, 's-channel').value, query(w), api.game.state, sockets.length], ['some_one', 'channel=some_one',
    'countdown', 1]);
  eq(element(w, 'play').textContent, 'Остановить');
  await until(() => !element(game, 'lobby').hidden, 'отсчёт в рамке');
  api.game.tick(api.game.startsAt);
  await until(() => all(game, '#words .slot').length && element(game, 'lobby').hidden, 'раунд в рамке');
  await until(() => element(w, 'status').textContent.includes('Игра идёт'), 'страница знает, что игра идёт');
  api.chat.onMessage('Вася', api.game.answers().words[0].word, false, {});
  await until(() => all(game, '#words .slot.open').length === 1, 'слово открылось');
  element(w, 'play').click();
  eq([api.game.state, element(w, 'play').textContent, sockets[0].closed], ['stopped', 'Начать', true]);
  await until(() => element(game, 'chat').innerText.includes('уже было'), 'снова пример');
  ok(element(w, 'status').textContent.includes('пример'));
  frame.remove();
  forget();
});

test('страница: настройки действуют сразу — и на игру, и на ссылку для OBS', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow, game = gameOf(w), api = game.slovolov;
  fakeSockets(api.chat);
  type(w, 's-channel', 'some_one');
  element(w, 'play').click();
  api.game.tick(api.game.startsAt);
  await until(() => all(game, '#words .slot').length && element(game, 'lobby').hidden, 'раунд в рамке');
  element(w, 'toggle-settings').click();
  type(w, 's-hint_every', '25');
  type(w, 's-shuffle_every', '0');
  eq([api.game.s.hint_every, api.game.s.shuffle_every, api.game.state, api.game.snapshot().round],
    [25, 0, 'playing', 1]);
  eq(query(w), 'channel=some_one&hint_every=25&shuffle_every=0');
  eq(JSON.parse(localStorage.getItem('slovolov.settings')).hint_every, 25);
  type(w, 'hide-chat', true);
  w.document.querySelector('[data-webcam="0"]').click();
  ok(w.document.querySelector('[data-webcam="0"]').classList.contains('on'));
  await until(() => game.document.body.classList.contains('nochat'), 'чат скрыт на ходу');
  eq(query(w), 'channel=some_one&hint_every=25&shuffle_every=0&webcam=0&chat=0');
  type(w, 's-shuffle_every', '2');
  eq([element(w, 's-shuffle_every').value, api.game.s.shuffle_every], ['5', 5]);
  element(w, 'defaults').click();
  eq(shownNumbers(w), RECOMMENDED);
  eq([query(w), element(w, 's-channel').value, element(w, 'hide-chat').checked, api.game.s.hint_every],
    ['channel=some_one', 'some_one', false, 10]);
  eq(api.game.state, 'playing');
  frame.remove();
  forget();
});

test('страница: настройки запоминаются между заходами, адрес страницы важнее запомненного', async () => {
  forget();
  localStorage.setItem('slovolov.settings', JSON.stringify({ pause: 12, extra_letters: 3, chat: false }));
  let frame = await mainPage();
  let w = frame.contentWindow;
  eq(query(w), 'pause=12&extra_letters=3&chat=0');
  eq([element(w, 's-pause').value, element(w, 's-extra_letters').value, element(w, 'hide-chat').checked],
    ['12', '3', true]);
  ok(gameOf(w).document.body.classList.contains('nochat'));
  eq(all(gameOf(w), '#letters .tile').length, 10);
  frame.remove();
  frame = await mainPage('?pause=45&min_len=3');
  w = frame.contentWindow;
  eq(query(w), 'pause=45&min_len=3');
  frame.remove();
  forget();
});

test('страница: расписание сброса, звук и «Послушать»', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow;
  ok(element(w, 'reset-hour-field').hidden && element(w, 'reset-hours-field').hidden);
  type(w, 's-reset_mode', 'week');
  no(element(w, 'reset-hour-field').hidden);
  ok(element(w, 'reset-hours-field').hidden);
  type(w, 's-reset_hour', '9');
  type(w, 's-sound', false);
  type(w, 's-volume', '35');
  eq(element(w, 'volume-text').textContent, '35%');
  eq(query(w), 'reset_mode=week&reset_hour=9&sound=0&volume=35');
  type(w, 's-reset_mode', 'timer');
  ok(element(w, 'reset-hour-field').hidden);
  no(element(w, 'reset-hours-field').hidden);
  let volume = null;
  gameOf(w).slovolov.playSounds = (value) => { volume = value; };
  element(w, 'listen').click();
  eq(volume, 35);
  frame.remove();
  forget();
});

test('страница: настройки, под которые нет слов, не применяются', async () => {
  forget();
  const frame = await mainPage();
  const w = frame.contentWindow, api = gameOf(w).slovolov;
  ok(element(w, 'summary').textContent.includes('Главных слов'));
  type(w, 's-base_min', '4');
  type(w, 's-base_max', '4');
  type(w, 's-max_words', '45');
  const before = query(w);
  type(w, 's-min_words', '40');
  ok(element(w, 'summary').classList.contains('bad') && element(w, 'summary').textContent.includes('не применены'));
  eq([query(w), api.game.s.min_words, element(w, 's-min_words').value], [before, 6, '40']);
  eq(JSON.parse(localStorage.getItem('slovolov.settings')).min_words, 6);
  type(w, 's-min_words', '3');
  no(element(w, 'summary').classList.contains('bad'));
  eq(api.game.s.min_words, 3);
  frame.remove();
  forget();
});
