import { isWord, norm, pick, shuffle } from './words.js';

export const COMMANDS = new Map([['!словолов-раунд', 'skip'], ['!словолов-сброс', 'reset']]);
export const STARS = ['sumaizu'];
export const BOTS = [
  'nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'jeetbot', 'soundalerts', 'sery_bot',
  'kofistreambot', 'tangiabot', 'botisimo', 'lumiastream', 'streamstickers', 'creatisbot', 'own3d', 'dixperbro',
  'pokemoncommunitygame', 'songlistbot', 'pretzelrocks', 'restreambot', 'commanderroot', 'frostytoolsdotcom',
];
export const START_DELAY = 10;
export const SHUFFLE_EVERY = 30;
export const CHAT_KEEP = 60;
export const CHAT_SHOWN = 30;
export const CHAT_TEXT_MAX = 300;
export const TOP_SHOWN = 30;

const EMOTES_MAX = 30;
const RECENT_KEEP = 300;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMOTE_ID_RE = /^[A-Za-z0-9_]{1,80}$/;
const PUNCTUATION = ' \t.,!?…:;"\'«»()[]<>-—';
const INVISIBLE = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD\u034F\u2800\u{E0000}]/gu;
const IGNORED = new Set(BOTS);

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (a, b) => byText(a.name.toLowerCase(), b.name.toLowerCase());

function trim(text, chars) {
  let from = 0, to = text.length;
  while (from < to && chars.includes(text[from])) from++;
  while (to > from && chars.includes(text[to - 1])) to--;
  return text.slice(from, to);
}

function cleanEmotes(raw) {
  const emotes = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emotes;
  let count = 0;
  for (const name of Object.keys(raw)) {
    const id = String(raw[name]);
    if (!name || name.length > 60 || /\s/.test(name) || !EMOTE_ID_RE.test(id)) continue;
    emotes[name] = id;
    if (++count >= EMOTES_MAX) break;
  }
  return emotes;
}

export function nextReset(since, mode, hour = 0, hours = 12) {
  if (mode === 'timer') return since + Math.max(1, hours) * 3600;
  if (mode !== 'day' && mode !== 'week' && mode !== 'month') return null;
  const from = new Date(since * 1000);
  if (isNaN(from.getTime())) return null;
  const year = from.getFullYear(), month = from.getMonth(), day = from.getDate();
  let due;
  if (mode === 'day') {
    due = new Date(year, month, day, hour);
    if (due <= from) due = new Date(year, month, day + 1, hour);
  } else if (mode === 'week') {
    const monday = day - (from.getDay() + 6) % 7;
    due = new Date(year, month, monday, hour);
    if (due <= from) due = new Date(year, month, monday + 7, hour);
  } else {
    due = new Date(year, month, 1, hour);
    if (due <= from) due = new Date(year, month + 1, 1, hour);
  }
  return due.getTime() / 1000;
}

export class Scores {
  constructor(storage = null, key = 'slovolov.scores') {
    this.storage = storage;
    this.key = key;
    this.data = new Map();
    this.since = null;
    if (!storage) return;
    try {
      const saved = JSON.parse(storage.getItem(key) || '{}');
      for (const [id, entry] of Object.entries(saved)) {
        if (!entry || typeof entry !== 'object') continue;
        this.data.set(id, { name: String(entry.name || id), score: Math.trunc(Number(entry.score) || 0),
          words: Math.trunc(Number(entry.words) || 0) });
      }
      const since = Number(storage.getItem(key + '.since'));
      this.since = Number.isFinite(since) && since > 0 ? since : null;
    } catch (error) {
      this.data = new Map();
      this.since = null;
    }
  }

  get size() {
    return this.data.size;
  }

  add(name, points) {
    const id = name.toLowerCase();
    const entry = this.data.get(id) || { name, score: 0, words: 0 };
    entry.name = name;
    entry.score += points;
    entry.words += 1;
    this.data.set(id, entry);
    this._save();
  }

  reset(now) {
    this.data = new Map();
    if (now !== undefined && now !== null) this.since = now;
    this._save();
  }

  mark(now) {
    this.since = now;
    this._save();
  }

  top(count) {
    const rows = Array.from(this.data.values()).sort((a, b) => b.score - a.score || byName(a, b));
    return (count === undefined ? rows : rows.slice(0, count))
      .map((entry) => ({ name: entry.name, score: entry.score, words: entry.words }));
  }

  _save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(Object.fromEntries(this.data)));
      if (this.since === null) this.storage.removeItem(this.key + '.since');
      else this.storage.setItem(this.key + '.since', String(this.since));
    } catch (error) {
      this.storage = null;
    }
  }
}

export class Game {
  constructor(dictionary, settings, scores = null, { rng = Math.random, clock = () => Date.now() / 1000 } = {}) {
    this.dict = dictionary;
    this.s = Object.assign({}, settings);
    this.scores = scores || new Scores();
    this.rng = rng;
    this.clock = clock;
    this.version = 0;
    this.state = 'stopped';
    this.roundNo = 0;
    this.round = null;
    this.results = null;
    this.startsAt = null;
    this.listeners = [];
    this.onchange = null;
    this._events = [];
    this._delivering = false;
    this._recent = [];
    this._chat = [];
    this._chatNo = 0;
    this._resetDue = null;
    this._planReset();
  }

  open(delay = START_DELAY) {
    return this._run(() => {
      if (this.state !== 'stopped') return false;
      this.state = 'countdown';
      this.startsAt = this.clock() + delay;
      this._emit('countdown', { starts_at: this.startsAt });
      this._bump();
      return true;
    });
  }

  stop() {
    return this._run(() => {
      if (this.state === 'stopped') return;
      this._halt();
      this._emit('stopped');
      this._bump();
    });
  }

  skip() {
    return this._run(() => this._skip());
  }

  resetScores() {
    return this._run(() => this._resetScores());
  }

  feed(user, text, { mod = false, msgId = null, login = null, color = null, emotes = null } = {}) {
    return this._run(() => {
      const name = String(user || '').trim();
      const message = String(text || '').normalize('NFC').replace(INVISIBLE, '').trim();
      login = String(login || '').toLowerCase();
      if (!name || !message || IGNORED.has(login || name.toLowerCase())) return null;
      const entry = this._say(name, message, msgId, login, color, emotes);
      if (message.charAt(0) === '!') return this._command(message, mod);
      if (this.state !== 'playing') return null;
      const word = norm(trim(message, PUNCTUATION));
      return isWord(word) ? this._guess(name, word, entry) : null;
    });
  }

  unsay({ msgId = null, user = null, everything = false } = {}) {
    return this._run(() => {
      const who = String(user || '').toLowerCase();
      const gone = (entry) => everything || (msgId ? entry.msgId === String(msgId)
        : Boolean(who) && (entry.login === who || entry.user.toLowerCase() === who));
      const kept = this._chat.filter((entry) => !gone(entry));
      const removed = this._chat.length - kept.length;
      if (removed) {
        this._chat = kept;
        this._bump();
      }
      return removed;
    });
  }

  tick(now = this.clock()) {
    return this._run(() => {
      if (this._resetDue !== null && now >= this._resetDue) this._resetScores(true, now);
      if (this.state === 'countdown') {
        if (now >= this.startsAt) this._newRound();
      } else if (this.state === 'playing') {
        const round = this.round;
        if (round.ends && now >= round.ends) {
          this._finish('time');
          return;
        }
        if (round.hintAt && now >= round.hintAt) this._hint(now);
        if (this.state === 'playing' && now >= round.shuffleAt) this._shuffle(now);
      } else if (this.state === 'results') {
        if (now >= this.results.next_at) this._newRound();
      }
    });
  }

  answers() {
    const round = this.round;
    if (!round) return { base: null, extra: '', words: [], spare: [] };
    return {
      base: this.dict.spelling(round.base),
      extra: round.extra,
      words: round.slots.map((slot) => ({ word: slot.word, by: slot.by, closed: slot.closed })),
      spare: Array.from(round.spare).filter((word) => !round.taken.has(word))
        .map((word) => this.dict.spelling(word)).sort(),
    };
  }

  snapshot() {
    const now = this.clock();
    const state = {
      version: this.version,
      now: Math.round(now * 100) / 100,
      state: this.state,
      round: this.roundNo,
      starts_at: this.state === 'countdown' ? this.startsAt : null,
      pause: this.s.pause,
      hint_every: this.s.hint_every,
      top: this.scores.top(TOP_SHOWN),
      players: this.scores.size,
      stars: STARS.slice(),
      feed: this._chat.slice(-CHAT_SHOWN).map((entry) => {
        const message = { id: entry.id, user: entry.user, text: entry.text, color: entry.color, pts: entry.pts,
          bonus: entry.bonus, repeat: entry.repeat, star: entry.star };
        if (Object.keys(entry.emotes).length) message.emotes = Object.assign({}, entry.emotes);
        return message;
      }),
    };
    const round = this.round;
    if (!round) return state;
    const over = this.state === 'results';
    state.letters = round.letters.slice();
    state.words = round.slots.map((slot) => {
      const open = Boolean(slot.by) || slot.closed || over;
      const hint = open || !slot.hint.size ? ''
        : Array.from(slot.word, (letter, i) => (slot.hint.has(i) ? letter : ' ')).join('');
      return { len: slot.len, word: open ? slot.word : null, by: slot.by, closed: slot.closed && !slot.by,
        missed: over && !slot.by, hint };
    });
    state.total = round.slots.length;
    state.found = round.slots.filter((slot) => slot.by).length;
    state.round_scores = this._roundScores();
    state.started = Math.round(round.started * 100) / 100;
    state.ends = round.ends;
    state.hint_at = this.state === 'playing' ? round.hintAt : null;
    if (this.results) state.results = Object.assign({}, this.results);
    return state;
  }

  _run(action) {
    const result = action();
    this._deliver();
    return result;
  }

  _deliver() {
    if (this._delivering) return;
    this._delivering = true;
    try {
      while (this._events.length) {
        const event = this._events.shift();
        for (const listener of this.listeners.slice()) {
          try {
            listener(event);
          } catch (error) {
            continue;
          }
        }
      }
    } finally {
      this._delivering = false;
    }
  }

  _emit(type, data = {}) {
    const event = Object.assign({ type, at: this.clock() }, data);
    this._events.push(event);
    return event;
  }

  _bump() {
    this.version += 1;
    if (this.onchange) this.onchange();
  }

  _halt() {
    this.state = 'stopped';
    this.round = null;
    this.results = null;
    this.startsAt = null;
  }

  _skip() {
    if (this.state === 'playing') this._finish('skip');
    else if (this.state === 'results') this._newRound();
  }

  _resetScores(auto = false, now = this.clock()) {
    this.scores.reset(now);
    this._planReset();
    this._emit('scores_reset', { auto });
    this._bump();
  }

  _planReset() {
    const s = this.s;
    if (!s.reset_mode || s.reset_mode === 'never') {
      this._resetDue = null;
      return;
    }
    if (this.scores.since === null) this.scores.mark(this.clock());
    this._resetDue = nextReset(this.scores.since, s.reset_mode, s.reset_hour || 0, s.reset_hours || 12);
  }

  _command(message, mod) {
    const command = COMMANDS.get(message.toLowerCase().split(/\s+/)[0]);
    if (!command || !mod || this.s.chat_commands === false) return null;
    if (command === 'skip') this._skip();
    else this._resetScores();
    return { type: 'command', command };
  }

  _say(name, text, msgId, login, color, emotes) {
    this._chatNo += 1;
    const entry = {
      id: this._chatNo,
      user: name,
      text: text.slice(0, CHAT_TEXT_MAX),
      color: typeof color === 'string' && COLOR_RE.test(color) ? color.toLowerCase() : '',
      pts: 0,
      bonus: false,
      repeat: false,
      star: STARS.includes(login || name.toLowerCase()),
      emotes: cleanEmotes(emotes),
      msgId: String(msgId || ''),
      login,
    };
    this._chat.push(entry);
    if (this._chat.length > CHAT_KEEP) this._chat.shift();
    if (this.state !== 'stopped') this._bump();
    return entry;
  }

  _guess(name, word, entry) {
    const round = this.round, now = this.clock();
    let slot = round.index.get(word) || null;
    if (!slot && !round.spare.has(word)) return null;
    if (!slot && !round.taken.has(word)) slot = this._claimSlot(word);
    if (slot ? slot.by || slot.closed : round.taken.has(word)) {
      entry.repeat = true;
      return this._emit('repeat', { user: name, word: this.dict.spelling(word),
        by: slot ? slot.by : round.taken.get(word) });
    }
    if (slot) {
      slot.by = name;
      slot.at = now;
    } else {
      round.taken.set(word, name);
    }
    const points = word.length, viewer = name.toLowerCase();
    const score = round.scores.get(viewer) || { name, pts: 0, words: 0 };
    score.name = name;
    score.pts += points;
    score.words += 1;
    round.scores.set(viewer, score);
    this.scores.add(name, points);
    entry.pts = points;
    entry.bonus = !slot;
    const event = this._emit(slot ? 'guess' : 'bonus', { user: name, word: this.dict.spelling(word), pts: points,
      total: this.scores.data.get(viewer).score });
    if (slot) {
      if (this.s.hint_every) round.hintAt = now + this.s.hint_every;
      if (round.slots.every((other) => other.by || other.closed)) {
        this._finish(round.slots.every((other) => other.by) ? 'all' : 'hints');
      }
    }
    this._bump();
    return event;
  }

  _claimSlot(word) {
    const round = this.round;
    if (!this.dict.canShow(word)) return null;
    let best = null;
    for (const slot of round.slots) {
      if (slot.len !== word.length || slot.by || slot.closed || slot.key === round.base) continue;
      if (Array.from(slot.hint).some((i) => slot.key[i] !== word[i])) continue;
      if (!best || this._yieldsBefore(slot, best)) best = slot;
    }
    if (!best) return null;
    round.index.delete(best.key);
    round.spare.add(best.key);
    round.spare.delete(word);
    best.key = word;
    best.word = this.dict.spelling(word);
    round.index.set(word, best);
    return best;
  }

  _yieldsBefore(slot, other) {
    if (slot.hint.size !== other.hint.size) return slot.hint.size > other.hint.size;
    const a = this.dict.score(slot.key), b = this.dict.score(other.key);
    return a !== b ? a < b : slot.key < other.key;
  }

  _hint(now) {
    const round = this.round;
    const shut = round.slots.filter((slot) => !slot.by && !slot.closed);
    if (!shut.length) return;
    const slot = pick(this.rng, shut);
    const hidden = [];
    for (let i = 0; i < slot.len; i++) if (!slot.hint.has(i)) hidden.push(i);
    const position = pick(this.rng, hidden);
    slot.hint.add(position);
    const closed = [];
    if (slot.hint.size >= slot.len) {
      slot.closed = true;
      closed.push(slot.word);
    }
    round.hintAt = this.s.hint_every ? now + this.s.hint_every : null;
    this._emit('hint', { slot: round.slots.indexOf(slot), position, letter: slot.word[position], closed });
    if (round.slots.every((other) => other.by || other.closed)) this._finish('hints');
    this._bump();
  }

  _shuffle(now) {
    const round = this.round;
    const before = round.letters.join('');
    const letters = round.letters.slice();
    for (let attempt = 0; attempt < 20; attempt++) {
      shuffle(this.rng, letters);
      const order = letters.join('');
      if (order !== before && !order.includes(round.base)) break;
    }
    round.letters = letters;
    round.shuffleAt = now + SHUFFLE_EVERY;
    this._bump();
  }

  _newRound() {
    const s = this.s;
    const base = this.dict.pickBase(this.rng, this._recent,
      { baseMin: s.base_min, baseMax: s.base_max, minLen: s.min_len, minWords: s.min_words });
    if (base === null) {
      this._halt();
      this._emit('no_words');
      this._bump();
      return;
    }
    this._recent.push(base);
    if (this._recent.length > RECENT_KEEP) this._recent.shift();
    const extra = s.extra_letters ? this.dict.extraLetters(base, s.extra_letters, this.rng, s.min_len) : '';
    const [hidden, spare] = this.dict.roundWords(base,
      { letters: base + extra, minLen: s.min_len, maxWords: s.max_words });
    const letters = Array.from(base + extra);
    for (let attempt = 0; attempt < 20; attempt++) {
      shuffle(this.rng, letters);
      if (!letters.join('').includes(base)) break;
    }
    const slots = shuffle(this.rng, hidden.slice()).sort((a, b) => a.length - b.length)
      .map((key) => ({ key, word: this.dict.spelling(key), len: key.length, by: null, at: null, hint: new Set(),
        closed: false }));
    const now = this.clock();
    this.roundNo += 1;
    this.round = {
      base,
      extra,
      letters,
      slots,
      index: new Map(slots.map((slot) => [slot.key, slot])),
      spare: new Set(spare),
      taken: new Map(),
      scores: new Map(),
      started: now,
      ends: s.round_time ? now + s.round_time : null,
      hintAt: s.hint_every ? now + s.hint_every : null,
      shuffleAt: now + SHUFFLE_EVERY,
    };
    this.results = null;
    this.startsAt = null;
    this.state = 'playing';
    this._emit('round_start', { round: this.roundNo, letters: letters.join(''), words: slots.length });
    this._bump();
  }

  _roundScores() {
    return Array.from(this.round.scores.values()).sort((a, b) => b.pts - a.pts || byName(a, b))
      .map((entry) => ({ name: entry.name, pts: entry.pts, words: entry.words }));
  }

  _finish(reason) {
    const round = this.round, now = this.clock();
    this.results = { reason, at: now, round: this.roundNo, base: this.dict.spelling(round.base), extra: round.extra,
      next_at: now + this.s.pause, scores: this._roundScores() };
    this.state = 'results';
    this._emit('round_end', { round: this.roundNo, reason, base: this.results.base, extra: round.extra,
      found: round.slots.filter((slot) => slot.by).length, total: round.slots.length, scores: this.results.scores,
      missed: round.slots.filter((slot) => !slot.by).map((slot) => slot.word) });
    this._bump();
  }
}
