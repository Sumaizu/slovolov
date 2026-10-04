const COMMON_SCORE = 1.5;
const SHORT_FACTOR = { 2: 4.0, 3: 1.3, 4: 1.2 };
const SHORT_FLOOR = { 2: 20.0, 3: 1.0, 4: 0.75 };
const NEVER_SHOWN_SCORE = 0.01;
const FILLER_LETTERS = 'оеаинтсрвлкмдпу';
const WORD_RE = /^[а-я]+$/;

export const norm = (word) => String(word == null ? '' : word).trim().toLowerCase().replace(/ё/g, 'е');

export const isWord = (text) => WORD_RE.test(text);

const signature = (word) => Array.from(word).sort().join('');

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

export function pickWeighted(rng, list, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

export class Dictionary {
  constructor(entries, blocked = []) {
    this.blocked = new Set(Array.from(blocked, norm));
    this.entries = new Map();
    for (const [key, value] of entries instanceof Map ? entries : Object.entries(entries)) {
      if (!this.blocked.has(key)) this.entries.set(key, value);
    }
    this._bySignature = new Map();
    for (const key of this.entries.keys()) {
      const sig = signature(key);
      const list = this._bySignature.get(sig);
      if (list) list.push(key);
      else this._bySignature.set(sig, [key]);
    }
    this._bases = new Map();
    this._common = null;
  }

  static parse(words, blocklist = '') {
    const entries = new Map();
    for (const line of words.split('\n')) {
      const tab = line.indexOf('\t');
      const word = (tab < 0 ? line : line.slice(0, tab)).trim().toLowerCase();
      const key = norm(word);
      if (!isWord(key)) continue;
      const score = tab < 0 ? 0 : parseFloat(line.slice(tab + 1)) || 0;
      const known = entries.get(key);
      if (!known || score > known[1]) entries.set(key, [word, score]);
    }
    return new Dictionary(entries, blocklist.split('\n').map((line) => line.trim()).filter(Boolean));
  }

  static async load(base = 'data/') {
    const read = async (name) => {
      const response = await fetch(base + name, { cache: 'no-cache' });
      if (!response.ok) throw new Error(name + ': HTTP ' + response.status);
      return response.text();
    };
    const [words, blocklist] = await Promise.all([read('nouns_ru.tsv'), read('blocklist.txt')]);
    return Dictionary.parse(words, blocklist);
  }

  get size() {
    return this.entries.size;
  }

  has(word) {
    return this.entries.has(norm(word));
  }

  spelling(key) {
    const entry = this.entries.get(norm(key));
    return entry ? entry[0] : key;
  }

  score(key) {
    const entry = this.entries.get(norm(key));
    return entry ? entry[1] : 0;
  }

  isCommon(key) {
    key = norm(key);
    if (!this.entries.has(key)) return false;
    const need = COMMON_SCORE * (SHORT_FACTOR[key.length] || 1);
    return this.score(key) >= Math.max(need, SHORT_FLOOR[key.length] || 0);
  }

  canShow(key) {
    return this.score(key) > NEVER_SHOWN_SCORE;
  }

  subwords(letters, minLen = 3) {
    const chars = [], counts = [];
    for (const ch of Array.from(norm(letters)).sort()) {
      if (chars[chars.length - 1] === ch) counts[counts.length - 1]++;
      else {
        chars.push(ch);
        counts.push(1);
      }
    }
    const least = Math.max(1, minLen), found = new Set();
    const walk = (i, sig) => {
      if (i === chars.length) {
        const hit = sig.length >= least && this._bySignature.get(sig);
        if (hit) for (const word of hit) found.add(word);
        return;
      }
      for (let n = 0; n <= counts[i]; n++) {
        walk(i + 1, sig);
        sig += chars[i];
      }
    };
    walk(0, '');
    return found;
  }

  roundWords(base, { letters = null, minLen = 3, maxWords = 20 } = {}) {
    base = norm(base);
    const sig = signature(base);
    const all = this.subwords(letters || base, minLen);
    const common = Array.from(all).filter((w) => w === base || this.isCommon(w));
    const byScore = (a, b) => this.score(b) - this.score(a) || byText(a, b);
    const slots = common.filter((w) => signature(w) === sig)
      .sort((a, b) => (a !== base) - (b !== base) || byScore(a, b))
      .slice(0, Math.max(1, maxWords));
    const byLength = new Map();
    for (const w of common) {
      if (signature(w) === sig) continue;
      const list = byLength.get(w.length);
      if (list) list.push(w);
      else byLength.set(w.length, [w]);
    }
    for (const list of byLength.values()) list.sort(byScore);
    const lengths = Array.from(byLength.keys()).sort((a, b) => b - a);
    while (slots.length < maxWords && lengths.some((n) => byLength.get(n).length)) {
      for (const n of lengths) {
        if (byLength.get(n).length && slots.length < maxWords) slots.push(byLength.get(n).shift());
      }
    }
    const chosen = new Set(slots);
    return [slots, Array.from(all).filter((w) => !chosen.has(w)).sort()];
  }

  _commonWords() {
    if (!this._common) {
      this._common = [];
      for (const key of this.entries.keys()) {
        if (!this.isCommon(key)) continue;
        const letters = new Map();
        for (const ch of key) letters.set(ch, (letters.get(ch) || 0) + 1);
        this._common.push([key, Array.from(letters)]);
      }
    }
    return this._common;
  }

  extraLetters(base, count, rng = Math.random, minLen = 3) {
    const pool = norm(base);
    let added = '';
    for (let step = 0; step < count; step++) {
      const have = new Map();
      for (const ch of pool + added) have.set(ch, (have.get(ch) || 0) + 1);
      const longest = pool.length + added.length + 1;
      const gain = new Map();
      for (const [key, need] of this._commonWords()) {
        if (key.length < minLen || key.length > longest) continue;
        let lacking = 0, missing = '';
        for (const [ch, n] of need) {
          const lack = n - (have.get(ch) || 0);
          if (lack > 0) {
            lacking += lack;
            missing = ch;
            if (lacking > 1) break;
          }
        }
        if (lacking === 1) gain.set(missing, (gain.get(missing) || 0) + 1);
      }
      if (gain.size) {
        const options = Array.from(gain.keys()).sort();
        added += pickWeighted(rng, options, options.map((ch) => gain.get(ch) ** 2));
      } else {
        added += pick(rng, FILLER_LETTERS);
      }
    }
    return added;
  }

  bases({ baseMin = 6, baseMax = 8, minLen = 3, minWords = 6 } = {}) {
    const cacheKey = [baseMin, baseMax, minLen, minWords].join('|');
    let found = this._bases.get(cacheKey);
    if (!found) {
      found = [];
      for (const [word, entry] of this.entries) {
        if (word.length < baseMin || word.length > baseMax || entry[0].includes('ё') || !this.isCommon(word)) continue;
        let count = 0;
        for (const sub of this.subwords(word, minLen)) if (sub === word || this.isCommon(sub)) count++;
        if (count >= minWords) found.push(word);
      }
      found.sort();
      this._bases.set(cacheKey, found);
    }
    return found;
  }

  pickBase(rng = Math.random, exclude = [], options = {}) {
    const pool = this.bases(options);
    if (!pool.length) return null;
    const used = new Set(Array.from(exclude, norm));
    const fresh = pool.filter((w) => !used.has(w));
    return pick(rng, fresh.length ? fresh : pool);
  }
}
