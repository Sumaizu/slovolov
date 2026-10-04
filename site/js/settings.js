import { clean, fromQuery, toQuery } from './config.js';
import { Dictionary } from './words.js';

const STORAGE_KEY = 'slovolov.settings';
const NUMBERS = ['pause', 'hint_every', 'round_time', 'base_min', 'base_max', 'extra_letters', 'min_len', 'max_words',
  'min_words', 'reset_hour', 'reset_hours', 'volume'];
const TEXTS = ['channel', 'reset_mode', 'accent'];
const FLAGS = ['chat_commands', 'sound'];
const HIDDEN_PARTS = { chat: 'hide-chat', side: 'hide-side', bg: 'hide-bg' };
const DATE_MODES = ['day', 'week', 'month'];
const SUMMARY_DELAY_MS = 300;

const $ = (id) => document.getElementById(id);
const form = $('settings'), preview = $('preview');

let saved = restore();
let draft = saved;
let dictionary = null;
let summaryTimer = 0;

function restore() {
  if (location.search.length > 1) return fromQuery(location.search);
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (error) {
    return clean({});
  }
}

function remember(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    return;
  }
}

function overlayLink(settings, demo = false) {
  const query = [demo ? 'demo=1' : '', toQuery(settings)].filter(Boolean).join('&');
  return new URL('overlay.html', location.href).href + (query ? '?' + query : '');
}

function fillForm(settings) {
  for (const key of NUMBERS.concat(TEXTS)) $('s-' + key).value = settings[key];
  for (const key of FLAGS) $('s-' + key).checked = settings[key];
  for (const key of Object.keys(HIDDEN_PARTS)) $(HIDDEN_PARTS[key]).checked = !settings[key];
  showDependentFields(settings);
}

function readForm() {
  const raw = { webcam: draft.webcam };
  for (const key of NUMBERS) raw[key] = $('s-' + key).value === '' ? null : Number($('s-' + key).value);
  for (const key of TEXTS) raw[key] = $('s-' + key).value;
  for (const key of FLAGS) raw[key] = $('s-' + key).checked;
  for (const key of Object.keys(HIDDEN_PARTS)) raw[key] = !$(HIDDEN_PARTS[key]).checked;
  return clean(raw);
}

function showDependentFields(settings) {
  $('reset-hour-field').hidden = !DATE_MODES.includes(settings.reset_mode);
  $('reset-hours-field').hidden = settings.reset_mode !== 'timer';
  $('volume-text').textContent = settings.volume + '%';
  for (const button of document.querySelectorAll('[data-webcam]')) {
    button.classList.toggle('on', (button.dataset.webcam === '1') === settings.webcam);
  }
}

function showStatus(kind, text) {
  $('status').className = 'status ' + kind;
  $('status').textContent = text;
}

function showLink() {
  const dirty = toQuery(draft) !== toQuery(saved);
  $('link').value = overlayLink(saved);
  $('link').classList.toggle('stale', dirty);
  if (dirty) showStatus('warn', 'Настройки изменены — нажми «Сохранить», и ссылка обновится.');
  else if (!saved.channel) showStatus('warn', 'Впиши свой канал Twitch — без него оверлей не увидит чат.');
  else showStatus('', '');
}

function showPreview() {
  const demo = preview.contentWindow && preview.contentWindow.slovolov;
  if (demo && demo.show) demo.show(draft);
  else preview.src = overlayLink(draft, true);
}

function countBases(settings) {
  return dictionary.bases({ baseMin: settings.base_min, baseMax: settings.base_max, minLen: settings.min_len,
    minWords: settings.min_words }).length;
}

function showSummary() {
  clearTimeout(summaryTimer);
  if (!dictionary) return;
  summaryTimer = setTimeout(() => {
    const bases = countBases(draft), summary = $('summary');
    summary.className = bases ? 'summary' : 'summary bad';
    summary.textContent = bases
      ? 'Главных слов под такие настройки: ' + bases
      : 'Под такие настройки нет ни одного главного слова — ослабь условия.';
  }, SUMMARY_DELAY_MS);
}

function edit(settings, refill) {
  draft = settings;
  if (refill) fillForm(draft);
  else showDependentFields(draft);
  showLink();
  showPreview();
  showSummary();
}

function save() {
  draft = readForm();
  fillForm(draft);
  if (dictionary && !countBases(draft)) {
    showStatus('bad', 'Не сохранено: под такие настройки нет ни одного главного слова.');
    return;
  }
  saved = draft;
  remember(saved);
  showLink();
  showPreview();
  if (saved.channel) showStatus('ok', 'Сохранено. Вставь ссылку в OBS.');
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

form.addEventListener('input', () => edit(readForm(), false));
form.addEventListener('change', () => edit(readForm(), true));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  save();
});
for (const button of document.querySelectorAll('[data-webcam]')) {
  button.addEventListener('click', () => {
    edit(clean(Object.assign(readForm(), { webcam: button.dataset.webcam === '1' })), true);
  });
}
$('defaults').addEventListener('click', () => edit(clean({ channel: draft.channel }), true));
$('copy').addEventListener('click', copyLink);
$('listen').addEventListener('click', () => {
  const demo = preview.contentWindow && preview.contentWindow.slovolov;
  if (demo && demo.playSounds) demo.playSounds(draft.volume);
});

fillForm(saved);
showLink();
showPreview();
Dictionary.load(new URL('data/', location.href).href).then((loaded) => {
  dictionary = loaded;
  showSummary();
});
