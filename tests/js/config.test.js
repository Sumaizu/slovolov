import { DEFAULTS, clean, fromQuery, toQuery } from '../../site/js/config.js';
import { eq, no, ok, test } from './harness.js';

test('настройки: значения по умолчанию', () => {
  eq(clean({}), DEFAULTS);
  eq(clean(null), DEFAULTS);
  eq(clean('мусор'), DEFAULTS);
  eq(clean([1, 2]), DEFAULTS);
  eq([DEFAULTS.pause, DEFAULTS.hint_every, DEFAULTS.round_time], [20, 10, 0]);
  eq([DEFAULTS.base_min, DEFAULTS.base_max, DEFAULTS.extra_letters, DEFAULTS.min_len], [5, 8, 2, 4]);
  eq([DEFAULTS.max_words, DEFAULTS.min_words, DEFAULTS.sound, DEFAULTS.volume], [45, 6, true, 100]);
});

test('настройки: канал', () => {
  for (const raw of ['SomeOne', '#someone', '@someone', 'https://www.twitch.tv/SomeOne', 'twitch.tv/someone/',
    ' someone ', 'https://twitch.tv/someone?tab=chat']) {
    eq(clean({ channel: raw }).channel, 'someone', raw);
  }
  for (const bad of ['два слова', 'имя', 'a'.repeat(26), '', null, undefined, 42.5]) {
    eq(clean({ channel: bad }).channel, '', String(bad));
  }
});

test('настройки: числа зажаты в пределы', () => {
  const s = clean({ pause: 0, base_min: 99, base_max: 5, min_len: 9, max_words: 1000, min_words: 1000,
    round_time: -5, hint_every: '20', extra_letters: 99, volume: 250, reset_hour: 24, reset_hours: 0 });
  eq(s.pause, 3);
  eq([s.base_min, s.base_max], [12, 12]);
  eq(s.min_len, 6);
  eq([s.max_words, s.min_words], [45, 40]);
  eq([s.round_time, s.hint_every, s.extra_letters, s.volume, s.reset_hour, s.reset_hours], [0, 20, 4, 100, 23, 1]);
  eq(clean({ max_words: 5, min_words: 9 }).min_words, 5);
  eq(clean({ extra_letters: -1 }).extra_letters, 0);
});

test('настройки: негодные значения заменяются обычными', () => {
  const s = clean({ pause: 'много', accent: 'красный', min_len: null, extra_letters: 'много', hint_every: true,
    volume: 'тихо', reset_mode: 'иногда' });
  for (const key of ['pause', 'accent', 'min_len', 'extra_letters', 'hint_every', 'volume', 'reset_mode']) {
    eq(s[key], DEFAULTS[key], key);
  }
});

test('настройки: флажки', () => {
  const s = clean({ chat_commands: '', sound: '0', webcam: 'false', chat: 0, side: 'off', bg: false });
  eq([s.chat_commands, s.sound, s.webcam, s.chat, s.side, s.bg], [false, false, false, false, false, false]);
  const on = clean({ sound: '1', webcam: 'да', side: 1 });
  eq([on.sound, on.webcam, on.side], [true, true, true]);
});

test('настройки: расписание сброса счёта', () => {
  for (const mode of ['never', 'day', 'week', 'month', 'timer']) eq(clean({ reset_mode: mode }).reset_mode, mode);
});

test('настройки: убранные и чужие ключи отбрасываются', () => {
  const s = clean({ ignore: ['bot'], blocked: ['кот'], stars: ['kto_ugodno'], difficulty: 'hard', bonus: false,
    cooldown: 5, auto_next: false, shuffle_every: 0, top_size: 3, autostart: 'off', port: 9000, 'лишнее': 1 });
  eq(s, DEFAULTS);
});

test('ссылка: в неё попадает только то, что отличается от обычного', () => {
  eq(toQuery({}), '');
  eq(toQuery({ channel: 'SomeOne' }), 'channel=someone');
  const query = toQuery({ channel: 'someone', hint_every: 15, extra_letters: 3, webcam: false, chat: false,
    accent: '#00FF7F', pause: DEFAULTS.pause, reset_mode: 'week', sound: false });
  eq(query, 'channel=someone&hint_every=15&extra_letters=3&reset_mode=week&sound=0&accent=00ff7f&webcam=0&chat=0');
});

test('ссылка: настройки возвращаются из неё теми же', () => {
  const settings = clean({ channel: 'someone', pause: 12, base_min: 6, base_max: 9, extra_letters: 3, min_len: 3,
    max_words: 30, min_words: 3, round_time: 300, hint_every: 0, chat_commands: false, reset_mode: 'timer',
    reset_hours: 3, sound: false, volume: 35, accent: '#3fa7ff', webcam: false, chat: false, side: false, bg: false });
  eq(fromQuery('?' + toQuery(settings)), settings);
  eq(fromQuery(''), DEFAULTS);
  eq(fromQuery('?pause=7&мусор=1&accent=%23ff0000').pause, 7);
  eq(fromQuery('?accent=%23ff0000').accent, '#ff0000');
  no('мусор' in fromQuery('?мусор=1'));
  ok(fromQuery('?side=0').side === false);
});
