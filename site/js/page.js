import { clean, fromQuery, toQuery } from './config.js';

const STORAGE_KEY = 'slovolov.settings';
const NUMBERS = ['pause', 'hint_every', 'round_time', 'shuffle_every', 'base_min', 'base_max', 'extra_letters',
  'min_len', 'max_words', 'min_words', 'reset_hour', 'reset_hours', 'volume'];
const TEXTS = ['reset_mode', 'accent'];
const FLAGS = ['chat_commands', 'sound'];
const HIDDEN_PARTS = { chat: 'hide-chat', side: 'hide-side', bg: 'hide-bg' };
const DATE_MODES = ['day', 'week', 'month'];
const SYNC_MS = 500;

const $ = (id) => document.getElementById(id);
const frame = $('game'), form = $('settings'), channelField = $('s-channel');

let settings = restore();
let playing = false;
let connected = false;
let notice = '';

function restore() {
  if (location.search.length > 1) return fromQuery(location.search);
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (error) {
    return clean({});
  }
}

function remember() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    return;
  }
}

function overlayLink(query) {
  return new URL('overlay.html', location.href).href + (query ? '?' + query : '');
}

function overlay() {
  return (frame.contentWindow && frame.contentWindow.slovolov) || null;
}

function fillForm() {
  channelField.value = settings.channel;
  for (const key of NUMBERS.concat(TEXTS)) $('s-' + key).value = settings[key];
  for (const key of FLAGS) $('s-' + key).checked = settings[key];
  for (const key of Object.keys(HIDDEN_PARTS)) $(HIDDEN_PARTS[key]).checked = !settings[key];
  showDependentFields(settings);
}

function readForm() {
  const raw = { channel: settings.channel, webcam: settings.webcam };
  for (const key of NUMBERS) raw[key] = $('s-' + key).value === '' ? null : Number($('s-' + key).value);
  for (const key of TEXTS) raw[key] = $('s-' + key).value;
  for (const key of FLAGS) raw[key] = $('s-' + key).checked;
  for (const key of Object.keys(HIDDEN_PARTS)) raw[key] = !$(HIDDEN_PARTS[key]).checked;
  return clean(raw);
}

function showDependentFields(shown) {
  $('reset-hour-field').hidden = !DATE_MODES.includes(shown.reset_mode);
  $('reset-hours-field').hidden = shown.reset_mode !== 'timer';
  $('volume-text').textContent = shown.volume + '%';
  for (const button of document.querySelectorAll('[data-webcam]')) {
    button.classList.toggle('on', (button.dataset.webcam === '1') === shown.webcam);
  }
}

function showStatus(id, kind, text) {
  $(id).className = 'status ' + kind;
  $(id).textContent = text;
}

function showLink() {
  $('link').value = overlayLink(toQuery(settings));
  showStatus('link-status', 'warn', settings.channel ? '' : 'Впиши канал Twitch — без него оверлей не увидит чат.');
}

function countBases(candidate) {
  const api = overlay();
  if (!api) return null;
  return api.game.dict.bases({ baseMin: candidate.base_min, baseMax: candidate.base_max, minLen: candidate.min_len,
    minWords: candidate.min_words }).length;
}

function showSummary(bases) {
  const summary = $('summary');
  summary.className = bases === 0 ? 'summary bad' : 'summary';
  if (bases === null) summary.textContent = '';
  else if (bases) summary.textContent = 'Главных слов под такие настройки: ' + bases;
  else summary.textContent = 'Под такие настройки нет ни одного главного слова — они не применены. Ослабь условия.';
}

function adopt(candidate, refill) {
  const bases = countBases(candidate);
  showSummary(bases);
  if (bases === 0) {
    showDependentFields(candidate);
    return;
  }
  settings = candidate;
  remember();
  if (refill) fillForm();
  else showDependentFields(settings);
  showLink();
  const api = overlay();
  if (api) api.apply(settings);
}

function commitChannel() {
  const channel = clean({ channel: channelField.value }).channel;
  if (channel !== settings.channel) adopt(clean(Object.assign({}, settings, { channel })), false);
  channelField.value = settings.channel;
}

function toggleGame() {
  const api = overlay();
  if (!api) return;
  commitChannel();
  if (playing) {
    api.stop();
    playing = false;
  } else if (!settings.channel) {
    notice = 'Впиши канал Twitch — без него игра не увидит чат.';
    channelField.focus();
  } else {
    api.start();
    playing = true;
  }
  sync();
}

function sync() {
  const api = overlay();
  $('play').disabled = !api;
  if (!api) {
    showStatus('status', '', 'Загружаю словарь…');
    return;
  }
  if (!connected) {
    connected = true;
    api.apply(settings);
    showSummary(countBases(settings));
  }
  if (playing && api.game.state === 'stopped') {
    api.stop();
    playing = false;
    notice = 'Под эти настройки не нашлось слов — игра остановлена.';
  }
  $('play').textContent = playing ? 'Остановить' : 'Начать';
  if (playing) {
    notice = '';
    const chat = api.chat.status;
    showStatus('status', chat.state === 'connected' ? 'ok' : 'warn', 'Игра идёт: ' + chat.text);
  } else if (notice) {
    showStatus('status', 'warn', notice);
  } else {
    showStatus('status', '', 'Сейчас на экране пример: слова, чат и счёт выдуманные.');
  }
}

function toggleSettings() {
  const open = form.hidden;
  form.hidden = !open;
  $('layout').classList.toggle('with-settings', open);
  $('toggle-settings').setAttribute('aria-expanded', String(open));
}

async function copyLink() {
  const link = $('link'), button = $('copy');
  try {
    await navigator.clipboard.writeText(link.value);
  } catch (error) {
    link.select();
    document.execCommand('copy');
  }
  button.textContent = 'Скопировано';
  setTimeout(() => { button.textContent = 'Копировать'; }, 1500);
}

form.addEventListener('input', () => adopt(readForm(), false));
form.addEventListener('change', () => adopt(readForm(), true));
form.addEventListener('submit', (event) => event.preventDefault());
for (const button of document.querySelectorAll('[data-webcam]')) {
  button.addEventListener('click', () => {
    adopt(clean(Object.assign(readForm(), { webcam: button.dataset.webcam === '1' })), true);
  });
}
$('defaults').addEventListener('click', () => adopt(clean({ channel: settings.channel }), true));
$('listen').addEventListener('click', () => {
  const api = overlay();
  if (api) api.playSounds(settings.volume);
});
$('start').addEventListener('submit', (event) => {
  event.preventDefault();
  toggleGame();
});
channelField.addEventListener('change', commitChannel);
channelField.addEventListener('input', () => { notice = ''; });
$('toggle-settings').addEventListener('click', toggleSettings);
$('copy').addEventListener('click', copyLink);

fillForm();
showLink();
frame.src = overlayLink(['embed=1', toQuery(settings)].filter(Boolean).join('&'));
sync();
setInterval(sync, SYNC_MS);
