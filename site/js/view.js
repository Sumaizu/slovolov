import { Emotes } from './emotes.js';
import { play } from './sound.js';

const STAGE_WIDTH = 1280, STAGE_HEIGHT = 720;
const TILE = 84, TILE_DENSE = 62, TILE_GAP = 10, DENSE_FROM = 31;
const COLUMNS = 3, COLUMN_ROWS = 15, CELL_MAX = 46, ROW_GAP = 0.2, COLUMN_GAP = 1.5, CELL_GAP = 0.09;
const FIELD = { width: 704, height: 466 };
const SIDE = { height: 664, rules: 159, row: 24, frame: 42, gap: 12 };
const TOP_ROWS = 10;
const LONG_WORD = 6;
const FINAL_SECONDS = 3;
const RAINBOW_MS = 2400;
const TITLE = 'СЛОВОЛОВ';
const REASONS = { all: 'Всё угадано!', hints: 'Раунд окончен', time: 'Время вышло', skip: 'Раунд окончен' };
const NICK_COLORS = ['#ff8f85', '#ffb547', '#f2dd6e', '#8fe3ae', '#7fd4ff', '#b7a6ff', '#ff9ad5', '#8fe0d2'];
const SOUND_PRIORITY = ['win', 'end', 'start', 'long', 'guess', 'tick', 'hint', 'bonus', 'shuffle'];

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(n, one, few, many) {
  const units = n % 10, tens = n % 100;
  if (units === 1 && tens !== 11) return one;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

function clockText(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

function luminance(red, green, blue) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function nickColor(message) {
  if (!/^#[0-9a-f]{6}$/i.test(message.color || '')) {
    let hash = 0;
    for (const ch of message.user.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return NICK_COLORS[hash % NICK_COLORS.length];
  }
  const value = parseInt(message.color.slice(1), 16);
  let rgb = [value >> 16 & 255, value >> 8 & 255, value & 255];
  const light = luminance(...rgb);
  if (light < 0.45) {
    const lift = (0.45 - light) / (1 - light);
    rgb = rgb.map((channel) => Math.round(channel + (255 - channel) * lift));
  }
  return 'rgb(' + rgb.join(',') + ')';
}

function syncRainbow(event) {
  if (event.animationName === 'rainbow') event.target.style.animationDelay = -(Date.now() % RAINBOW_MS) + 'ms';
}

export function layout(lengths, width, height) {
  const count = lengths.length;
  let best = null;
  for (let columns = 1; columns <= COLUMNS && count; columns++) {
    const rows = Math.ceil(count / columns);
    if (rows > COLUMN_ROWS && columns < COLUMNS) continue;
    const used = Math.ceil(count / rows);
    let units = (used - 1) * COLUMN_GAP;
    for (let column = 0; column < used; column++) {
      const longest = lengths[Math.min(count, (column + 1) * rows) - 1];
      units += longest * (1 + CELL_GAP) - CELL_GAP;
    }
    const cell = Math.min(CELL_MAX, width / units, height / (rows + (rows - 1) * ROW_GAP));
    if (!best || cell > best.cell + 0.5) best = { cell, rows };
  }
  if (!best) return { cell: CELL_MAX, rows: 1 };
  best.cell = Math.floor(best.cell * 2) / 2;
  return best;
}

export function sideRows(roundCount, totalCount, capacity) {
  const round = Math.max(1, roundCount), total = Math.max(1, totalCount);
  if (round + total <= capacity) return { round, total: capacity - round };
  const rows = Math.max(1, Math.min(round, capacity - Math.min(total, TOP_ROWS)));
  return { round: rows, total: capacity - rows };
}

export class View {
  constructor({ still = false } = {}) {
    this.still = still;
    this.settings = null;
    this.state = null;
    this.offset = 0;
    this.heard = [];
    this.emotes = new Emotes(() => this._redrawFeed());
    this._animate = false;
    this._previous = '';
    this._roundKey = '';
    this._lettersKey = '';
    this._slotKeys = [];
    this._listKeys = {};
    this._stars = new Set();
    this._starsKey = '';
    this._cues = [];
    this._feedRows = new Map();
    this._feedNewest = 0;
    this._feedStale = false;
    this._secondsLeft = null;
    this._countdownFrom = null;
    window.addEventListener('resize', () => this._fitStage());
    document.addEventListener('animationstart', syncRainbow);
    this._fitStage();
    if (!still) setInterval(() => this.tick(), 250);
  }

  use(settings) {
    this.settings = settings;
    const root = document.documentElement, body = document.body;
    const value = parseInt(settings.accent.slice(1), 16);
    const light = luminance(value >> 16 & 255, value >> 8 & 255, value & 255);
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-ink', light > 0.55 ? '#241a06' : '#ffffff');
    body.classList.toggle('nocam', !settings.webcam);
    body.classList.toggle('nochat', !settings.chat);
    body.classList.toggle('noside', !settings.side);
    body.classList.toggle('nobg', !settings.bg);
    this._paintRules();
    this._roundKey = '';
    this._listKeys = {};
  }

  render(state) {
    this.state = state;
    this.offset = state.now - Date.now() / 1000;
    this._setStars(state.stars);
    this.emotes.watch(state.room_id);
    const stage = $('stage');
    if (state.state === 'stopped') {
      stage.hidden = $('lobby').hidden = true;
      this._roundKey = '';
      this._previous = 'stopped';
      this._cues = [];
      return;
    }
    stage.hidden = false;
    const waiting = !state.words, over = state.state === 'results';
    const wasWaiting = !$('lobby').hidden;
    $('card').classList.toggle('results', over);
    $('head').hidden = $('play').hidden = waiting;
    $('lobby').hidden = !waiting;
    const roundKey = waiting ? '' : state.round + ':' + state.words.length + ':' + state.started;
    if (roundKey !== this._roundKey) {
      this._roundKey = roundKey;
      this._lettersKey = '';
      this._listKeys = {};
      if (!waiting) this._startRound(state, over);
    }
    if (this._animate && over && this._previous === 'playing') {
      this._cue(state.results && state.results.reason === 'all' ? 'win' : 'end');
    }
    this._paintFeed(state);
    this._paintLists(state);
    if (waiting) {
      if (!wasWaiting) this._paintTitle();
    } else {
      $('round').textContent = state.round;
      $('status').textContent = over ? REASONS[state.results && state.results.reason] || REASONS.skip : '';
      $('found').textContent = state.found;
      $('total').textContent = state.total;
      $('meter').style.width = (state.total ? 100 * state.found / state.total : 0) + '%';
      this._paintLetters(state);
      this._paintSlots(state);
    }
    this._paintClock();
    this._playCues();
    this._previous = state.state;
    this._animate = !this.still;
  }

  tick() {
    this._paintClock();
    this._playCues();
  }

  _paintClock() {
    const state = this.state;
    if (!state || $('stage').hidden) return;
    const now = this.still ? state.now : Date.now() / 1000 + this.offset;
    if (state.state === 'countdown') {
      this._paintCountdown(Math.max(0, state.starts_at - now));
      return;
    }
    if (!state.words) return;
    let label = '', progress = 0, shown = false;
    if (state.state === 'results') {
      const left = Math.max(0, state.results.next_at - now);
      shown = true;
      label = 'следующий раунд через ' + clockText(left);
      progress = left / Math.max(1, state.pause);
    } else if (state.hint_at) {
      const left = Math.max(0, state.hint_at - now);
      shown = true;
      label = 'подсказка через ' + clockText(left);
      progress = left / Math.max(1, state.hint_every);
    }
    $('timeline').style.visibility = shown ? 'visible' : 'hidden';
    $('label').textContent = label;
    $('fill').style.setProperty('--p', Math.max(0, Math.min(1, progress)).toFixed(3));
    const clock = $('clock');
    clock.hidden = !(state.state === 'playing' && state.ends);
    if (!clock.hidden) clock.textContent = clockText(state.ends - now);
  }

  _fitStage() {
    const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
    $('stage').style.setProperty('--k', scale);
  }

  _cue(name) {
    this._cues.push(name);
  }

  _playCues() {
    const name = SOUND_PRIORITY.find((sound) => this._cues.includes(sound));
    this._cues = [];
    if (!name || this.still || !this.settings.sound) return;
    this.heard.push(name);
    if (this.heard.length > 50) this.heard.shift();
    play(name, this.settings.volume);
  }

  _setStars(names) {
    const key = (names || []).join(' ');
    if (key === this._starsKey) return;
    this._starsKey = key;
    this._stars = new Set(names || []);
    this._listKeys = {};
    this._feedStale = true;
  }

  _isStar(name) {
    return Boolean(name) && this._stars.has(String(name).toLowerCase());
  }

  _redrawFeed() {
    this._feedStale = true;
    if (this.state) this.render(this.state);
  }

  _startRound(state, over) {
    const words = $('words');
    words.textContent = '';
    this._slotKeys = state.words.map(() => '');
    $('play').classList.toggle('dense', state.words.length >= DENSE_FROM);
    for (const word of state.words) {
      const slot = el('div', 'slot');
      for (let i = 0; i < word.len; i++) {
        const cell = el('span');
        cell.style.setProperty('--j', i);
        slot.append(cell);
      }
      words.append(slot);
    }
    const fit = layout(state.words.map((word) => word.len), words.clientWidth || FIELD.width,
      words.clientHeight || FIELD.height);
    words.style.setProperty('--cell', fit.cell + 'px');
    words.style.setProperty('--rows', fit.rows);
    if (!this._animate || over) return;
    this._cue('start');
    const play = $('play');
    play.classList.remove('enter');
    void play.offsetWidth;
    play.classList.add('enter');
  }

  _paintSlots(state) {
    const over = state.state === 'results', slots = $('words').children;
    state.words.forEach((word, i) => {
      const kind = !word.word ? '' : word.by ? 'open' : over ? 'missed' : 'closed';
      const key = kind + '|' + (word.word || word.hint);
      if (key === this._slotKeys[i]) return;
      const wasShut = !this._slotKeys[i] || this._slotKeys[i].charAt(0) === '|';
      this._slotKeys[i] = key;
      const cells = slots[i].children, text = word.word || word.hint || '';
      for (let j = 0; j < cells.length; j++) {
        const letter = text.charAt(j).trim();
        const hinted = this._animate && !kind && letter && !cells[j].textContent;
        cells[j].textContent = letter;
        cells[j].className = hinted ? 'hinted' : '';
        if (hinted) this._cue('hint');
      }
      const revealed = this._animate && kind && wasShut;
      if (revealed && kind === 'open') this._cue(word.len >= LONG_WORD ? 'long' : 'guess');
      slots[i].className = 'slot' + (kind ? ' ' + kind : '') + (revealed ? ' pop' : '');
    });
  }

  _tileSize(count, reserved, largest) {
    const room = ($('main').clientWidth || FIELD.width) - TILE_GAP * (count - 1) - reserved;
    return Math.max(24, Math.min(largest, Math.floor(room / count)));
  }

  _paintLetters(state) {
    const results = state.state === 'results' ? state.results : null;
    const base = results ? Array.from(results.base) : [];
    const extra = results ? Array.from(results.extra || '') : [];
    const tiles = results ? base.concat(extra) : state.letters;
    const key = (results ? '=' + base.length : '?') + tiles.join('');
    if (key === this._lettersKey) return;
    const box = $('letters');
    const shuffled = !results && this._lettersKey.charAt(0) === '?' &&
      Array.from(this._lettersKey.slice(1)).sort().join('') === tiles.slice().sort().join('');
    const origins = this._animate && shuffled
      ? Array.from(box.children, (tile) => ({ letter: tile.textContent, left: tile.offsetLeft })) : null;
    this._lettersKey = key;
    box.textContent = '';
    const largest = $('play').classList.contains('dense') ? TILE_DENSE : TILE;
    box.style.setProperty('--tile', this._tileSize(tiles.length, extra.length ? 16 + TILE_GAP : 0, largest) + 'px');
    tiles.forEach((letter, i) => {
      if (extra.length && i === base.length) box.append(el('span', 'plus', '+'));
      const tile = el('div', 'tile' + (!results ? '' : i < base.length ? ' solved' : ' extra'), letter);
      tile.style.setProperty('--i', i);
      if (!this._animate || shuffled) tile.style.animation = 'none';
      box.append(tile);
    });
    if (!origins) return;
    Array.from(box.children).forEach((tile, i) => {
      const from = origins.findIndex((origin) => origin && origin.letter === tile.textContent);
      if (from < 0) return;
      tile.style.setProperty('--dx', (origins[from].left - tile.offsetLeft) + 'px');
      tile.style.setProperty('--hop', (i % 2 ? 14 : -18) + 'px');
      tile.style.animation = '';
      tile.classList.add('moved');
      origins[from] = null;
    });
    this._cue('shuffle');
  }

  _sideCapacity(boxes) {
    const height = $('side').clientHeight || SIDE.height;
    const rules = $('box-rules').offsetHeight || SIDE.rules;
    return Math.max(2, Math.floor((height - rules - boxes * (SIDE.gap + SIDE.frame)) / SIDE.row));
  }

  _paintList(id, rows, limit, total, points, emptyText) {
    const key = JSON.stringify([rows.slice(0, limit).map((row) => [row.name, points(row)]), limit, total]);
    if (this._listKeys[id] === key) return;
    this._listKeys[id] = key;
    const list = $(id);
    list.textContent = '';
    if (!rows.length) {
      list.append(el('li', 'note', emptyText));
      return;
    }
    const cut = total > limit;
    const shown = rows.slice(0, cut ? limit - 1 : limit);
    shown.forEach((row, i) => {
      const name = el('span', this._isStar(row.name) ? 'name rainbow' : 'name', row.name);
      const item = el('li', i === 0 ? 'first' : '');
      item.append(el('span', 'place', i + 1), name, el('span', 'points', points(row)));
      list.append(item);
    });
    if (cut) {
      const rest = total - shown.length;
      list.append(el('li', 'note', 'и ещё ' + rest + ' ' + plural(rest, 'игрок', 'игрока', 'игроков')));
    }
  }

  _paintLists(state) {
    const waiting = !state.words, over = state.state === 'results';
    const round = state.round_scores || [], top = state.top || [], players = state.players || 0;
    $('box-round').hidden = waiting;
    if (waiting) {
      this._paintList('list-total', top, this._sideCapacity(1), players, (row) => row.score, 'пока пусто');
      return;
    }
    const rows = sideRows(round.length, players, this._sideCapacity(2));
    $('h-round').textContent = over ? 'Итоги раунда' : 'В этом раунде';
    this._paintList('list-round', round, rows.round, round.length, (row) => '+' + row.pts,
      over ? 'никто не угадал' : 'пока никто не угадал');
    this._paintList('list-total', top, rows.total, players, (row) => row.score, 'пока пусто');
  }

  _paintRules() {
    const settings = this.settings;
    const rules = [
      'Собери слово, пиши в чат',
      'Только существительные: «река», не «реки»',
      'Первому — очко за букву',
      'От ' + settings.min_len + ' букв, Ё = Е',
    ];
    if (settings.hint_every) rules.push('Подсказка — раз в ' + settings.hint_every + ' с');
    const list = $('rules');
    list.textContent = '';
    for (const rule of rules) list.append(el('li', '', rule));
  }

  _fillText(box, message) {
    const own = message.emotes || null;
    if (message.pts || message.repeat || (!own && !this.emotes.size)) {
      box.textContent = message.text;
      return;
    }
    let plain = '';
    message.text.split(' ').forEach((word, i) => {
      const url = word ? this.emotes.url(word, own) : '';
      if (!url) {
        plain += (i ? ' ' : '') + word;
        return;
      }
      if (plain || i) box.append(plain + (i ? ' ' : ''));
      plain = '';
      const image = el('img');
      image.alt = word;
      image.onerror = () => image.replaceWith(word);
      image.src = url;
      box.append(image);
    });
    if (plain) box.append(plain);
  }

  _messageRow(message, fresh) {
    const star = message.star === true;
    const row = el('div', 'msg' + (message.pts ? ' hit' : '') + (star ? ' star' : '') + (fresh ? ' pop' : ''));
    const nick = el('b', star ? 'rainbow' : '', message.user);
    if (!star) nick.style.color = nickColor(message);
    const text = el('span', 'text');
    this._fillText(text, message);
    row.append(nick, ' ', text);
    if (message.pts) row.append(' ', el('i', 'points', '+' + message.pts));
    if (message.bonus) row.append(' ', el('i', 'mark', 'вне клеток'));
    if (message.repeat) row.append(' ', el('i', 'mark', 'уже было'));
    return row;
  }

  _paintFeed(state) {
    const feed = state.feed || [], box = $('chat');
    if (this._feedStale) {
      this._feedStale = false;
      this._feedRows.clear();
      box.textContent = '';
    }
    const newest = feed.length ? feed[feed.length - 1].id : 0;
    if (newest < this._feedNewest) this._feedNewest = 0;
    const ids = new Set(feed.map((message) => message.id));
    this._feedRows.forEach((row, id) => {
      if (ids.has(id)) return;
      row.remove();
      this._feedRows.delete(id);
    });
    const note = box.querySelector('.note');
    if (feed.length && note) note.remove();
    if (!feed.length && !note) box.append(el('div', 'msg note', 'пока тихо'));
    for (const message of feed) {
      if (this._feedRows.has(message.id)) continue;
      const fresh = this._animate && message.id > this._feedNewest;
      const row = this._messageRow(message, fresh);
      this._feedRows.set(message.id, row);
      box.append(row);
      if (fresh && message.bonus) this._cue('bonus');
    }
    this._feedNewest = Math.max(this._feedNewest, newest);
  }

  _paintTitle() {
    const box = $('lobby-tiles');
    box.textContent = '';
    box.style.setProperty('--tile', this._tileSize(TITLE.length, 0, TILE) + 'px');
    Array.from(TITLE).forEach((letter, i) => {
      const tile = el('div', 'tile', letter);
      tile.style.setProperty('--i', i);
      if (!this._animate) tile.style.animation = 'none';
      box.append(tile);
    });
    this._secondsLeft = null;
    this._countdownFrom = null;
  }

  _paintCountdown(left) {
    const seconds = Math.ceil(left), ring = $('countdown'), number = $('countdown-number');
    if (this._countdownFrom === null) this._countdownFrom = Math.max(1, left);
    ring.style.setProperty('--p', Math.max(0, Math.min(1, left / this._countdownFrom)).toFixed(3));
    if (seconds === this._secondsLeft) return;
    this._secondsLeft = seconds;
    number.textContent = Math.max(1, seconds);
    ring.classList.toggle('final', seconds <= FINAL_SECONDS);
    number.classList.remove('beat');
    void number.offsetWidth;
    number.classList.add('beat');
    if (seconds <= FINAL_SECONDS && seconds > 0 && this._animate) this._cue('tick');
  }
}
