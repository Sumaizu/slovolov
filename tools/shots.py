import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from browser import ROOT, SITE, Browser, serve

DOCS = ROOT / "docs"
CAMERA_PLACEHOLDER = """(() => {
  const camera = document.querySelector('.cam');
  const frame = camera ? camera.getBoundingClientRect() : null;
  if (!frame || !frame.width) return;
  const person = document.createElement('div');
  person.style.cssText = 'position:fixed;z-index:-1;overflow:hidden;border-radius:18px;' +
    'background:linear-gradient(160deg,#50627f,#28334c);' +
    'left:' + frame.left + 'px;top:' + frame.top + 'px;width:' + frame.width + 'px;height:' + frame.height + 'px';
  const shape = 'position:absolute;left:50%;transform:translateX(-50%);background:#8495b3;';
  person.innerHTML = '<div style="' + shape + 'top:20%;width:25%;height:33%;border-radius:50%"></div>' +
    '<div style="' + shape + 'top:60%;width:60%;height:60%;border-radius:50% 50% 0 0"></div>';
  document.body.prepend(person);
})()"""
OVERLAY_READY = "window.slovolov && document.querySelectorAll('#words .slot').length ? 1 : 0"
SETTINGS_READY = "document.querySelector('#summary:not(:empty)') ? 1 : 0"


def shoot_overlay(browser, base, out, query=""):
    browser.set_size(1280, 720)
    browser.navigate(f"{base}/overlay.html?demo=1{'&' + query if query else ''}")
    browser.wait_for(OVERLAY_READY, 30)
    browser.evaluate(CAMERA_PLACEHOLDER)
    time.sleep(0.5)
    browser.screenshot(out, transparent=True)


def shoot_settings(browser, base, out):
    browser.set_size(1280, 720)
    browser.navigate(f"{base}/index.html")
    browser.wait_for(SETTINGS_READY, 30)
    height = browser.evaluate("Math.ceil(document.documentElement.scrollHeight)")
    browser.set_size(1280, int(height))
    time.sleep(1.0)
    browser.evaluate("document.getElementById('link').value = 'https://gamesonstream.ru/slovolov/overlay.html'")
    browser.screenshot(out)


def main():
    parser = argparse.ArgumentParser(description="Снимки оверлея и страницы настроек для README.")
    parser.add_argument("--out", default=str(DOCS), help="куда сохранить снимки (по умолчанию docs/)")
    out = Path(parser.parse_args().out)
    out.mkdir(parents=True, exist_ok=True)
    server = serve(SITE)
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with Browser() as browser:
            shoot_overlay(browser, base, out / "overlay.png")
            shoot_overlay(browser, base, out / "overlay-compact.png", "chat=0&side=0")
            shoot_settings(browser, base, out / "settings.png")
    finally:
        server.shutdown()
        server.server_close()
    for image in sorted(out.glob("*.png")):
        print(f"{image.name}: {image.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
