import { TwitchChat } from './chat.js';
import { clean, fromQuery } from './config.js';
import { demoState } from './demo.js';
import { Game, Scores } from './engine.js';
import { playAll } from './sound.js';
import { View } from './view.js';
import { Dictionary } from './words.js';

const CODE_FILES = ['overlay.html', 'css/overlay.css', 'js/overlay.js', 'js/view.js', 'js/engine.js', 'js/words.js',
  'js/chat.js', 'js/config.js', 'js/demo.js', 'js/emotes.js', 'js/sound.js'];
const DATA_FILES = ['data/nouns_ru.tsv', 'data/blocklist.txt'];
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const UPDATE_CHECK_SECONDS = LOCAL ? 5 : 300;
const RELOAD_PAUSE_SECONDS = LOCAL ? 0 : 600;
const DICTIONARY_RETRY_SECONDS = 5;
const DEMO = new URLSearchParams(location.search).get('demo') === '1';

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const fileUrl = (name) => new URL(name, location.href).href;

function browserStorage() {
  try {
    localStorage.getItem('slovolov');
    return localStorage;
  } catch (error) {
    return null;
  }
}

async function loadDictionary() {
  for (;;) {
    try {
      return await Dictionary.load(fileUrl('data/'));
    } catch (error) {
      await sleep(DICTIONARY_RETRY_SECONDS);
    }
  }
}

function watchVisibility(onShow, onHide) {
  const pageShown = () => document.visibilityState !== 'hidden';
  const report = (shown) => (shown ? onShow() : onHide());
  document.addEventListener('visibilitychange', () => report(pageShown()));
  window.addEventListener('obsSourceVisibleChanged', (event) => report(Boolean(event.detail && event.detail.visible)));
  if (pageShown()) onShow();
}

async function filesFingerprint() {
  const marks = await Promise.all(CODE_FILES.concat(DATA_FILES).map(async (name) => {
    const response = await fetch(fileUrl(name), { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) throw new Error(name);
    return response.headers.get('etag') || response.headers.get('last-modified') || '';
  }));
  return marks.join('|');
}

function refreshCache() {
  return Promise.all(CODE_FILES.map((name) => fetch(fileUrl(name), { cache: 'reload' })));
}

function watchUpdates(canReload) {
  let fingerprint = null, outdated = false, reloading = false;
  const reload = () => {
    const storage = browserStorage();
    const last = storage ? Number(storage.getItem('slovolov.reloaded')) || 0 : 0;
    if (reloading || Date.now() - last < RELOAD_PAUSE_SECONDS * 1000) return;
    reloading = true;
    if (storage) storage.setItem('slovolov.reloaded', String(Date.now()));
    const restart = () => location.reload();
    refreshCache().then(restart, restart);
  };
  const check = async () => {
    try {
      const current = await filesFingerprint();
      if (fingerprint === null) fingerprint = current;
      outdated = outdated || current !== fingerprint;
    } catch (error) {
      return;
    }
    if (outdated && canReload()) reload();
  };
  check();
  setInterval(check, UPDATE_CHECK_SECONDS * 1000);
}

function showDemo(view) {
  const show = (settings) => {
    view.use(settings);
    view.render(demoState(settings));
  };
  show(fromQuery(location.search));
  window.slovolov = { show: (settings) => show(clean(settings)), playSounds: playAll };
}

async function runGame(view) {
  const settings = fromQuery(location.search);
  view.use(settings);
  const dictionary = await loadDictionary();
  const scores = new Scores(browserStorage(), 'slovolov.scores.' + (settings.channel || '_'));
  const game = new Game(dictionary, settings, scores);
  const chat = new TwitchChat({
    channel: settings.channel,
    onMessage: (name, text, mod, details) => game.feed(name, text, Object.assign({ mod }, details)),
    onClear: (removed) => game.unsay(removed),
    onStatus: () => refresh(),
  });
  let queued = false;
  function refresh() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      view.render(Object.assign(game.snapshot(), { room_id: chat.status.roomId }));
    }, 0);
  }
  const restart = () => {
    game.stop();
    game.open();
  };
  game.onchange = refresh;
  chat.start();
  setInterval(() => game.tick(), 250);
  watchVisibility(restart, () => game.stop());
  watchUpdates(() => game.state !== 'playing');
  window.slovolov = { game, chat, view };
}

const view = new View({ still: DEMO });
if (DEMO) showDemo(view);
else runGame(view);
