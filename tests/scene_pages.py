"""Scene pages: real Chromium, local HTTP and Streamer.bot protocol mock.
CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 tests/scene_pages.py
"""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 19080
checks = 0


def check(name, condition):
    global checks
    assert condition, name
    checks += 1
    print('PASS', name, flush=True)


def ctl(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', data=data)
    return json.load(urllib.request.urlopen(req, timeout=3))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    mock = subprocess.Popen(['node', str(ROOT / 'tests/mock-streamerbot.js'), '--port', str(PORT)], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                ctl('/stats')
                break
            except OSError:
                time.sleep(.1)
        with sync_playwright() as p:
            opts = {'executable_path': os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}
            browser = p.chromium.launch(**opts)
            page = browser.new_page(viewport={'width': 1920, 'height': 1080})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))

            def open_scene(name, **params):
                q = {'port': PORT, 'remember': 0, 'poll': 0, **params}
                page.goto(f'http://127.0.0.1:{server.server_port}/{name}.html?' + urllib.parse.urlencode(q))
                page.wait_for_function('window.__cinema !== undefined')
                if not params.get('demo'):
                    page.wait_for_function("__cinema.snapshot().connection === 'ready'")

            open_scene('starting', demo=1)
            check('starting default text and same cinema canvas', page.locator('.screen-message').inner_text() == 'Стрим скоро начнется' and page.locator('canvas.world').count() == 1)
            for value in ['Скоро начнем!', 'Очень длинный текст ' * 120, 'Длинноеслово' * 100, '<img src=x onerror=alert(1)>', 'Первая строка\nВторая строка']:
                open_scene('starting', demo=1, text=value)
                check('custom text fits both dimensions', page.evaluate('''() => {
                  const b=document.querySelector('.screen-message'), s=b.firstChild;
                  return s.scrollHeight<=b.clientHeight && s.scrollWidth<=b.clientWidth && s.textContent===new URLSearchParams(location.search).get('text');
                }'''))
            check('text is never interpreted as markup', page.locator('.cinema-screen img').count() == 0)
            for width, height in [(960, 540), (2560, 1080), (3840, 2160)]:
                page.set_viewport_size({'width': width, 'height': height})
                page.wait_for_timeout(100)
                check('projected screen remains inside resized stage', page.evaluate('''() => {
                  const b=document.querySelector('.cinema-screen').getBoundingClientRect();
                  return b.left>=0 && b.top>=0 && b.right<=innerWidth && b.bottom<=innerHeight;
                }'''))
            page.set_viewport_size({'width': 1920, 'height': 1080})
            open_scene('break')
            page.wait_for_function("document.querySelector('.chat-empty').textContent.includes('подключён')")
            ctl('/chat?' + urllib.parse.urlencode({'name': 'Котейка', 'text': '<script>unsafe</script> Привет!'}))
            page.wait_for_selector('.chat-line')
            check('real subscribed ChatMessage rendered as text', '<script>unsafe</script>' in page.locator('.chat-line').inner_text() and page.locator('.chat-line script').count() == 0)
            ctl('/chat?type=ChatMessageDeleted')
            page.wait_for_function("document.querySelectorAll('.chat-line').length===0")
            check('moderation clears messages', page.locator('.chat-line').count() == 0)
            for i in range(30):
                ctl('/chat?' + urllib.parse.urlencode({'text': f'Сообщение {i}'}))
            page.wait_for_function("document.querySelector('.chat-messages').textContent.includes('Сообщение 29')")
            check('bounded chat buffer keeps latest messages', 2 <= page.locator('.chat-line').count() <= 20)
            open_scene('break', chatUrl=f'http://127.0.0.1:{server.server_port}/index.html?demo=1')
            check('widget URL uses isolated iframe', page.locator('iframe').get_attribute('src').endswith('index.html?demo=1'))
            open_scene('break', chatUrl='javascript:alert(1)')
            check('invalid widget URL rejected', page.locator('iframe').count() == 0)

            fixture = {'users': {'users': ['alice', 'Alice', 'Котейка'], 'moderators': []},
                       'events': {'follows': ['Новый'], 'subs': ['Подписчик']}, 'groups': {'donors': ['Донатер']}}
            ctl('/credits', fixture)
            open_scene('ending', creditsIntro=0, creditsSpeed=300)
            page.wait_for_function('__cinema.screenScene.loaded')
            check('GetCredits consumed, groups ordered, names deduplicated', page.evaluate("__cinema.screenScene.groups.map(g=>g.names)") == [['alice', 'Котейка'], ['Донатер'], ['Новый'], ['Подписчик']])
            page.wait_for_selector('.credits-roll')
            before = page.evaluate('__cinema.screenScene.offset')
            page.wait_for_timeout(250)
            check('credits scroll with animation', page.evaluate('__cinema.screenScene.offset') < before)
            ctl('/drop')
            page.wait_for_function("__cinema.snapshot().connection!=='ready'")
            page.wait_for_function("__cinema.snapshot().connection==='ready'", timeout=15000)
            check('reconnect does not restart credits', page.evaluate('__cinema.screenScene.loaded && __cinema.screenScene.phase !== "intro"'))
            page.wait_for_function("__cinema.screenScene.phase === 'thanks'", timeout=15000)
            check('thanks remains after credits', page.locator('.screen-message').inner_text() == 'Спасибо, что были с нами!')
            ctl('/credits', {'users': {'users': []}, 'events': {}})
            open_scene('ending', creditsIntro=0, thanks='До встречи!')
            page.wait_for_function("__cinema.screenScene.phase==='thanks'")
            check('empty credits skip to customized thanks', page.locator('.screen-message').inner_text() == 'До встречи!')
            ctl('/credits?error=1', {})
            open_scene('ending')
            page.wait_for_function("__cinema.screenScene.phase==='error'")
            check('failed Credits request shows failure instead of fabricated names', 'Не удалось' in page.locator('.screen-message').inner_text())
            ctl('/credits', fixture)
            ctl('/drop')
            page.wait_for_function("__cinema.snapshot().connection!=='ready'")
            page.wait_for_function('__cinema.screenScene.loaded', timeout=15000)
            check('failed Credits request retries after reconnect', page.evaluate('__cinema.screenScene.groups.length') == 4)
            open_scene('index', demo=1)
            check('original index keeps blank screen', page.locator('.cinema-screen').count() == 0)
            check('no browser errors', not errors)
            shots = Path(os.environ.get('SHOTS', '/tmp/cinema-scenes'))
            shots.mkdir(parents=True, exist_ok=True)
            for name in ['starting', 'break', 'ending']:
                open_scene(name, demo=1, creditsIntro=0 if name == 'ending' else 4)
                page.wait_for_timeout(2000 if name == 'ending' else 100)
                page.screenshot(path=str(shots / f'{name}.png'))
            browser.close()
        print(f'{checks} checks passed')
    finally:
        mock.terminate()
        mock.wait(timeout=5)
        server.shutdown()


if __name__ == '__main__':
    main()
