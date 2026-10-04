import { clean } from '../../site/js/config.js';
import { Game } from '../../site/js/engine.js';
import { Dictionary } from '../../site/js/words.js';

export const SMALL = {
  'метла': ['метла', 40.0], 'тема': ['тема', 50.0], 'мат': ['мат', 30.0], 'мел': ['мел', 25.0],
  'лет': ['лёт', 10.0], 'тля': ['тля', 9.0], 'ам': ['ам', 99.0], 'лемма': ['лемма', 8.0],
  'метал': ['метал', 0.1], 'ател': ['ател', 0.05],
  'корона': ['корона', 50.0], 'окно': ['окно', 60.0], 'кора': ['кора', 30.0], 'нора': ['нора', 20.0],
  'крона': ['крона', 10.0], 'рок': ['рок', 15.0], 'акр': ['акр', 0.2],
  'полет': ['полёт', 40.0], 'плот': ['плот', 20.0], 'пот': ['пот', 20.0], 'лот': ['лот', 5.0],
};
export const PLAIN = { pause: 30, hint_every: 45, extra_letters: 0, min_len: 3, max_words: 20 };
export const ONLY_METLA = { ...PLAIN, base_min: 5, base_max: 5, min_words: 5 };
export const METLA_WORDS = ['мат', 'мел', 'лёт', 'тема', 'метла'];

export const KOTIK = {
  'котик': ['котик', 50.0], 'кот': ['кот', 50.0], 'ток': ['ток', 40.0], 'кит': ['кит', 30.0],
  'тик': ['тик', 0.1], 'кок': ['кок', 0.2], 'кик': ['кик', 0.01],
};
export const ONLY_KOTIK = { base_min: 5, base_max: 5, min_words: 4, hint_every: 0 };

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fakeClock(start = 1000) {
  const clock = () => clock.t;
  clock.t = start;
  return clock;
}

export function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

export function canBuild(word, letters) {
  const pool = Array.from(letters);
  for (const ch of word.replace(/ё/g, 'е')) {
    const i = pool.indexOf(ch);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

export function makeGame({ settings = {}, words = SMALL, scores = null, at = 1000, seed = 1 } = {}) {
  const clock = fakeClock(at);
  const game = new Game(new Dictionary(words), clean({ ...ONLY_METLA, ...settings }), scores,
    { rng: seeded(seed), clock });
  const events = [];
  game.listeners.push((event) => events.push(event));
  return { game, clock, events };
}

export function startRound(options = {}) {
  const made = makeGame(options);
  made.game.open(0);
  made.game.tick();
  return made;
}

export const local = (...when) => new Date(...when).getTime() / 1000;
