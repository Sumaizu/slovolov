export const DEFAULTS = {
  channel: '',
  chat_commands: true,
  pause: 20,
  hint_every: 10,
  round_time: 0,
  shuffle_every: 30,
  base_min: 5,
  base_max: 8,
  extra_letters: 2,
  min_len: 4,
  max_words: 45,
  min_words: 6,
  reset_mode: 'never',
  reset_hour: 6,
  reset_hours: 12,
  sound: true,
  volume: 100,
  accent: '#ffb547',
  webcam: true,
  chat: true,
  side: true,
  bg: true,
};
export const RESET_MODES = ['never', 'day', 'week', 'month', 'timer'];
export const MAX_WORDS = 45;

const SHUFFLE_MIN = 5;

const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function int(value, fallback, min, max) {
  const n = typeof value === 'boolean' || value === null || value === '' ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

function flag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function channel(value) {
  let name = String(value == null ? '' : value).trim().toLowerCase().replace(/^[#@]+/, '');
  name = name.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  name = name.slice(name.lastIndexOf('/') + 1).replace(/^@+/, '');
  return LOGIN_RE.test(name) ? name : '';
}

export function clean(raw) {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = DEFAULTS, s = {};
  s.channel = channel(raw.channel);
  s.chat_commands = flag(raw.chat_commands, d.chat_commands);
  s.pause = int(raw.pause, d.pause, 3, 3600);
  s.hint_every = int(raw.hint_every, d.hint_every, 0, 3600);
  s.round_time = int(raw.round_time, d.round_time, 0, 7200);
  s.shuffle_every = int(raw.shuffle_every, d.shuffle_every, 0, 600);
  if (s.shuffle_every) s.shuffle_every = Math.max(SHUFFLE_MIN, s.shuffle_every);
  s.base_min = int(raw.base_min, d.base_min, 4, 12);
  s.base_max = Math.max(s.base_min, int(raw.base_max, d.base_max, 4, 12));
  s.extra_letters = int(raw.extra_letters, d.extra_letters, 0, 4);
  s.min_len = Math.min(int(raw.min_len, d.min_len, 2, 6), s.base_min);
  s.max_words = int(raw.max_words, d.max_words, 3, MAX_WORDS);
  s.min_words = Math.min(int(raw.min_words, d.min_words, 1, 40), s.max_words);
  s.reset_mode = RESET_MODES.includes(raw.reset_mode) ? raw.reset_mode : d.reset_mode;
  s.reset_hour = int(raw.reset_hour, d.reset_hour, 0, 23);
  s.reset_hours = int(raw.reset_hours, d.reset_hours, 1, 720);
  s.sound = flag(raw.sound, d.sound);
  s.volume = int(raw.volume, d.volume, 0, 100);
  s.accent = COLOR_RE.test(String(raw.accent || '')) ? String(raw.accent).toLowerCase() : d.accent;
  s.webcam = flag(raw.webcam, d.webcam);
  s.chat = flag(raw.chat, d.chat);
  s.side = flag(raw.side, d.side);
  s.bg = flag(raw.bg, d.bg);
  return s;
}

export function toQuery(settings) {
  const s = clean(settings), params = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS)) {
    const value = s[key];
    if (value === DEFAULTS[key]) continue;
    if (typeof value === 'boolean') params.set(key, value ? '1' : '0');
    else params.set(key, key === 'accent' ? value.slice(1) : String(value));
  }
  return params.toString();
}

export function fromQuery(search) {
  const params = new URLSearchParams(search), raw = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (params.has(key)) raw[key] = key === 'accent' ? '#' + params.get(key).replace(/^#/, '') : params.get(key);
  }
  return clean(raw);
}
