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
                q = {'port': PORT, 'remember': 0, 'poll': 0, 'chatUrl': '', **params}
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
            def corners_match():
                return page.evaluate('''() => {
                  const r=__cinema.renderer, el=document.querySelector('.cinema-screen');
                  const m=new DOMMatrix(getComputedStyle(el).transform);
                  const measured=[[960,123],[1375,343],[1375,523],[960,290]];
                  return [[0,0],[1000,0],[1000,400],[0,400]].every(([x,y],i)=>{
                    const p=new DOMPoint(x,y).matrixTransform(m), target=VC.Layout.artPoint(...measured[i]);
                    return Math.hypot(p.x/p.w-(r.offX+target.x*r.scale),p.y/p.w-(r.offY+target.y*r.scale))<.15;
                  });
                }''')
            check('all four screen corners match the painted frame', corners_match())
            for width, height in [(960, 540), (2560, 1080), (3840, 2160)]:
                page.set_viewport_size({'width': width, 'height': height})
                page.wait_for_timeout(100)
                check('four-corner projection stays aligned after resize', corners_match())
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
            check('iframe uses readable viewport and dark backing', page.evaluate("""() => {
                const f=document.querySelector('iframe'), box=f.parentElement;
                return f.clientWidth===500 && f.clientHeight===200 && getComputedStyle(box).backgroundColor==='rgb(25, 21, 25)';
            }"""))
            # Synthetic widget fixture: no personal URL or exported configuration.
            widget_url = "https://chat-widget.example/overlay?" + urllib.parse.urlencode({"config": "sample+/=&value"})
            page.route('https://chat-widget.example/overlay?*', lambda route: route.fulfill(
                content_type='text/html', body='<meta charset="utf-8"><body style="margin:0;color:white;background:transparent;font:20px Arial">Проверка виджета</body>'))
            open_scene('break', demo=1, chatUrl=widget_url)
            page.wait_for_function('window.__cinema !== undefined')
            widget = page.frame_locator('iframe')
            widget.get_by_text('Проверка виджета', exact=True).wait_for()
            check('no personal chat URL in default config', page.evaluate("CINEMA_CONFIG.chatUrl === ''"))
            check('synthetic widget URL loads inside screen', widget.locator('body').inner_text() == 'Проверка виджета')
            check('nested config URL preserved without double decoding', page.evaluate("""() => {
                const url=new URL(document.querySelector('iframe').src);
                return url.hostname==='chat-widget.example' && url.searchParams.get('config')==='sample+/=&value';
            }"""))
            page.unroute('https://chat-widget.example/overlay?*')
            open_scene('break', chatUrl='javascript:alert(1)')
            check('invalid widget URL rejected', page.locator('iframe').count() == 0)

            fixture = {'users': {'users': ['alice', 'Alice', 'Котейка'], 'moderators': []},
                       'events': {'follows': ['Новый'], 'subs': ['Подписчик']}}
            ctl('/credits', fixture)
            open_scene('ending', creditsIntro=0, creditsSpeed=300)
            page.wait_for_function('__cinema.screenScene.loaded')
            check('GetCredits consumed, groups ordered, names deduplicated', page.evaluate("__cinema.screenScene.groups.map(g=>g.names)") == [['alice', 'Котейка'], ['Новый'], ['Подписчик']])
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
            # Exercise two full cycles, including both messages, without wall-clock delays.
            open_scene('ending', creditsIntro=.2, creditsThanks=.2, creditsSpeed=300)
            page.wait_for_function('__cinema.screenScene.loaded')
            cycle = page.evaluate('''() => {
              const s=__cinema.screenScene;
              s.cfg.creditsLoop=true; s.beginCredits();
              const phases=[s.phase], messages=[s.el.textContent];
              for(let i=0;i<2000 && phases.filter(p=>p==='thanks').length<2;i++) {
                s.update(.1);
                if(s.phase!==phases[phases.length-1]) { phases.push(s.phase); messages.push(s.el.textContent); }
              }
              return {phases,messages};
            }''')
            check('config loop repeats intro, roll and thanks in order', cycle['phases'] == ['intro','roll','thanks','intro','roll','thanks'])
            check('both repeated cycles display customized stage messages', cycle['messages'][0] == cycle['messages'][3] == 'Стрим завершен' and cycle['messages'][2] == cycle['messages'][5] == 'Спасибо, что были с нами!')
            check('query can turn config loop off and retain final thanks', page.evaluate('''() => {
              const s=__cinema.screenScene; s.q.set('creditsLoop','0'); s.update(20);
              return s.phase==='thanks';
            }'''))
            check('query can turn loop on after thanks duration', page.evaluate('''() => {
              const s=__cinema.screenScene; s.cfg.creditsLoop=false; s.q.set('creditsLoop','1'); s.finish();
              s.update(.1); const waiting=s.phase==='thanks'; s.update(.11);
              return waiting && s.phase==='intro';
            }'''))
            # Older scrolling credits resolves section/key names case-insensitively.
            variants = [
                ('case-insensitive section and event keys', {'Users': {'Users': ['Зритель']}, 'Events': {'reSubs': ['Продление'], 'giftSubs': ['Подарок']}}, [['Зритель'], ['Продление'], ['Подарок']]),
                ('enabled subscribers category from old headers', {'users': {'subscribers': ['Саб'], 'editors': ['Редактор']}}, [['Саб'], ['Редактор']]),
                ('enabled Hype Train and top categories', {'hypeTrain': {'conductors': ['Проводник']}, 'top': {'monthBits': ['Топ']}}, [['Проводник'], ['Топ']]),
                ('events without enabled Users category', {'events': {'follows': ['Фолловер']}}, [['Фолловер']]),
                ('wrapped Credits response', {'credits': {'EVENTS': {'FOLLOWS': ['Обёртка']}}}, [['Обёртка']]),
            ]
            for label, payload, expected in variants:
                ctl('/credits', payload)
                open_scene('ending', creditsIntro=0, creditsSpeed=300)
                page.wait_for_function("__cinema.screenScene.loaded || __cinema.screenScene.phase==='error'")
                check(label, page.evaluate('__cinema.screenScene.groups.map(g=>g.names)') == expected)
            ctl('/credits', {'unexpected': ['not credits']})
            open_scene('ending')
            page.wait_for_function("__cinema.screenScene.phase==='error'")
            check('malformed Credits remains an error', not page.evaluate('__cinema.screenScene.loaded'))
            ctl('/credits', {'users': {'users': []}, 'events': {}})
            open_scene('ending', creditsIntro=0, thanks='До встречи!')
            page.wait_for_function("__cinema.screenScene.phase==='empty'")
            check('empty credits are explained on screen', 'нет записей' in page.locator('.screen-message').inner_text())
            page.wait_for_function("__cinema.screenScene.phase==='thanks'")
            check('empty credits end with customized thanks', page.locator('.screen-message').inner_text() == 'До встречи!')
            ctl('/credits', {'custom': {'unconfigured': ['Запись']}})
            open_scene('ending', creditsIntro=0)
            page.wait_for_function("__cinema.screenScene.phase==='empty'")
            check('unmatched category distinguished from empty Credits', 'выбранные группы' in page.locator('.screen-message').inner_text())
            check('diagnostics contain paths/counts without names', page.evaluate('__cinema.screenScene.creditsDiagnostics') == [{'path': ['custom', 'unconfigured'], 'count': 1}])
            ctl('/credits?error=1', {})
            open_scene('ending')
            page.wait_for_function("__cinema.screenScene.phase==='error'")
            check('failed Credits request shows failure instead of fabricated names', 'Не удалось' in page.locator('.screen-message').inner_text())
            ctl('/credits', fixture)
            ctl('/drop')
            page.wait_for_function("__cinema.snapshot().connection!=='ready'")
            page.wait_for_function('__cinema.screenScene.loaded', timeout=15000)
            check('failed Credits request retries after reconnect', page.evaluate('__cinema.screenScene.groups.length') == 3)
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
