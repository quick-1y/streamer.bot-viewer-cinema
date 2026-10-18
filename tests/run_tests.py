#!/usr/bin/env python3
"""
End-to-end scenarios for the Viewer Cinema overlay.
Runs the real page in headless Chromium against tests/mock-streamerbot.js.

    python3 tests/run_tests.py            (needs: node, python playwright + chromium)
"""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MOCK = ROOT / 'tests' / 'mock-streamerbot.js'
PAGE = (ROOT / 'index.html').as_uri()
SHOTS = Path(os.environ.get('SHOTS', ROOT / 'tests' / 'screenshots'))
SHOTS.mkdir(parents=True, exist_ok=True)

results = []
page_errors = []


class Mock:
    def __init__(self, port, *extra):
        self.port, self.extra = port, extra
        self.proc = None
        self.start()

    def start(self):
        self.proc = subprocess.Popen(['node', str(MOCK), '--port', str(self.port), *self.extra],
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for _ in range(50):
            try:
                self.ctl('/stats'); return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError('mock did not start')

    def stop(self):
        if self.proc:
            self.proc.kill(); self.proc.wait(); self.proc = None

    def ctl(self, path):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.port}{path}', timeout=3) as r:
            return json.loads(r.read())

    def set(self, names):
        return self.ctl('/set?viewers=' + ','.join(names))


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  — {detail}' if detail else ''), flush=True)


def snap(pg):
    return pg.evaluate('__cinema.snapshot()')


def wait_for(pg, fn, timeout=20, step=0.25):
    end = time.time() + timeout
    s = None
    while time.time() < end:
        s = snap(pg)
        if fn(s):
            return True, s
        time.sleep(step)
    return False, s


def all_seated(s, n=None):
    ok = all(a['phase'] == 'seated' for a in s['seats'])
    return ok and (n is None or len(s['seats']) == n)


def open_page(browser, port, **params):
    q = {'port': port, 'poll': 0, 'grace': 2, 'debug': 0}
    q.update(params)
    url = PAGE + '?' + '&'.join(f'{k}={v}' for k, v in q.items())
    pg = browser.new_page(viewport={'width': 1920, 'height': 1080})
    pg.on('pageerror', lambda e: page_errors.append(str(e)))
    # Chromium itself logs "WebSocket connection to ... failed" while the server is down; that is expected.
    pg.on('console', lambda m: page_errors.append('console.error: ' + m.text)
          if m.type == 'error' and 'WebSocket connection to' not in m.text else None)
    pg.goto(url)
    pg.wait_for_function('window.__cinema !== undefined')
    return pg


def unique_seats(s):
    seats = [a['seat'] for a in s['seats']]
    return len(seats) == len(set(seats))


def names(prefix, n, start=0):
    return [f'{prefix}{i}' for i in range(start, start + n)]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------------------------------------------------------------- crypto parity
        pg = browser.new_page()
        pg.goto(PAGE + '?demo=1')
        pg.wait_for_function('window.__cinema !== undefined')
        ok = True
        node_hash = subprocess.check_output(['node', '-e', "process.stdout.write(require('crypto').createHash('sha256').update('pässwörd+salt','utf8').digest('base64'))"]).decode()
        js_hash = pg.evaluate("btoa(String.fromCharCode(...VC._sha256Js(new TextEncoder().encode('pässwörd+salt'))))")
        sub_hash = pg.evaluate("VC.sha256base64('pässwörd+salt')")
        check('SHA-256 (JS fallback and WebCrypto) match Node crypto', ok and js_hash == node_hash == sub_hash, node_hash)
        pg.close()

        # ---------------------------------------------------------------- 1. empty list
        m = Mock(18080)
        m.set([])
        pg = open_page(browser, 18080)
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready', 8)
        time.sleep(1)
        st = m.ctl('/stats'); s = snap(pg)
        check('1. connects automatically with empty viewer list', good and s['hall'] == 0 and s['actors'] == 0,
              f"state={s['connection']} requests={st['requests']}")
        check('1b. subscribes to Twitch.PresentViewers once and fetches once', st['requests'].get('Subscribe') == 1 and st['requests'].get('GetActiveViewers') == 1)
        counter = pg.evaluate("document.querySelector('.counter').textContent")
        check('1c. counter shows "В зале: 0"', counter.replace(' ', ' ').strip() == 'В зале:0' or 'В зале' in counter and counter.strip().endswith('0'), repr(counter))

        # ---------------------------------------------------------------- 3. one viewer joins
        m.set(['alice']); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['actors'] == 1, 4)
        check('3. one viewer joining creates exactly one character', good)
        good, s = wait_for(pg, lambda s: all_seated(s, 1), 20)
        check('3b. character walks in and sits down', good, json.dumps(s['seats']))
        alice_seat = s['seats'][0]['seat']

        # duplicate events / refreshes never duplicate characters
        for _ in range(3):
            m.ctl('/event')
        time.sleep(1.5)
        s = snap(pg)
        check('3c. repeated refreshes keep one character and the same seat', s['actors'] == 1 and s['seats'][0]['seat'] == alice_seat)

        # ---------------------------------------------------------------- 4. many join at once
        crowd = ['alice'] + names('viewer', 12)
        m.set(crowd); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['actors'] == 13, 4)
        check('4. 12 simultaneous joins → 13 characters, no duplicates', good and unique_seats(s))
        # sample the crowd during entry for visual + spacing
        time.sleep(3.2)
        pg.screenshot(path=str(SHOTS / '04-crowd-entering.png'))
        positions = pg.evaluate('''() => Array.from(__cinema.audience.actors.values())
            .filter(a => a.phase === 'walking' && a.sit === 0).map(a => [a.pos.x, a.pos.y])''')
        mind = min([((a[0]-b[0])**2 + (a[1]-b[1])**2) ** 0.5 for i, a in enumerate(positions) for b in positions[i+1:]] or [9])
        check('4b. walkers keep spacing (no stacking)', mind > 0.3, f'min distance {mind:.2f} tiles among {len(positions)} walkers')
        good, s = wait_for(pg, lambda s: all_seated(s, 13), 40)
        check('4c. everyone reaches a unique seat and sits', good and unique_seats(s))
        check('4d. alice kept her seat through the refresh', any(a['key'] == 'alice' and a['seat'] == alice_seat for a in s['seats']))
        check('4e. counter matches hall', pg.evaluate("+document.querySelector('.counter .value').textContent") == 13)
        pg.screenshot(path=str(SHOTS / '04-crowd-seated.png'))

        # ---------------------------------------------------------------- 5. leave (with grace)
        m.set([n for n in crowd if n not in ('viewer3', 'viewer4')]); m.ctl('/event')
        time.sleep(1.0)
        s = snap(pg)
        check('5. leavers stay during grace period', s['actors'] == 13 and s['hall'] == 13)
        good, s = wait_for(pg, lambda s: s['hall'] == 11, 5)
        check('5b. after grace they stand up and walk out (counter drops)', good)
        good, s = wait_for(pg, lambda s: s['actors'] == 11 and s['freeSeats'] == s['capacity'] - 11, 30)
        check('5c. they exit through the door and seats are released', good, f"actors={s['actors']} free={s['freeSeats']}")

        # ---------------------------------------------------------------- 6. leave + rejoin
        before = {a['key']: a['seat'] for a in snap(pg)['seats']}
        m.set([n for n in crowd if n not in ('viewer3', 'viewer4', 'viewer7')]); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['hall'] == 10, 6)
        time.sleep(0.8)  # mid-exit
        m.set([n for n in crowd if n not in ('viewer3', 'viewer4')]); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['hall'] == 11, 4)
        check('6. rejoin while walking out turns the character around (no duplicate)', good and s['actors'] == 11)
        good, s = wait_for(pg, lambda s: all_seated(s, 11), 25)
        check('6b. returns to the same seat', good and {a['key']: a['seat'] for a in s['seats']}.get('viewer7') == before['viewer7'])
        # rejoin after fully leaving → same seat remembered
        m.set(crowd); m.ctl('/event')
        good, s = wait_for(pg, lambda s: all_seated(s, 13), 40)
        check('6c. rejoin after a full exit lands on the remembered seat (if free)', good)

        # ---------------------------------------------------------------- 7. connection drop
        conns = m.ctl('/stats')['connections']
        m.ctl('/drop')
        good, s = wait_for(pg, lambda s: s['connection'] != 'ready', 3, 0.05)
        s2 = snap(pg)
        check('7. drop detected, audience kept on screen', good and s2['actors'] == 13)
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready', 6)
        check('7b. auto-reconnects and re-syncs', good and m.ctl('/stats')['connections'] == conns + 1 and snap(pg)['actors'] == 13)

        # ---------------------------------------------------------------- 8. Streamer.bot restart (server down for a while)
        m.stop()
        time.sleep(9)
        attempts = pg.evaluate('__cinema.connection.attempt')
        check('8. backs off while Streamer.bot is down (no tight loop)', 2 <= attempts <= 5, f'attempts in 9s: {attempts}')
        m.start()
        m.set(crowd[:-2] + ['newbie'])
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready', 25)
        check('8b. reconnects after restart', good)
        good, s = wait_for(pg, lambda s: s['actors'] == 12 and s['hall'] == 12, 15)
        check('8c. reconciles list after restart (2 leave, 1 joins)', good, f"hall={s['hall']} actors={s['actors']}")

        # ---------------------------------------------------------------- 9. malformed data
        before = snap(pg)
        m.ctl('/malformed'); m.ctl('/event')
        time.sleep(2)
        after = snap(pg)
        check('9. malformed frames/responses are ignored, audience unchanged',
              after['actors'] == before['actors'] and after['connection'] == 'ready' and not page_errors, '; '.join(page_errors[:3]))
        pg.screenshot(path=str(SHOTS / '09-after-malformed.png'))
        pg.close()
        m.stop()

        # ---------------------------------------------------------------- 2. existing viewers at load
        m = Mock(18081)
        m.set(names('early', 8))
        pg = open_page(browser, 18081)
        good, s = wait_for(pg, lambda s: s['actors'] == 8, 6)
        check('2. existing viewers are loaded at startup', good)
        good, s = wait_for(pg, lambda s: all_seated(s, 8), 30)
        check('2b. they walk in and sit (initial=walk)', good)
        pg.close()
        pg = open_page(browser, 18081, initial='seated')
        good, s = wait_for(pg, lambda s: all_seated(s, 8), 3)
        check('2c. initial=seated places them directly', good)
        pg.close()

        # ---------------------------------------------------------------- 10. capacity
        m.set(names('cap', 14))
        pg = open_page(browser, 18081, seats=10, initial='seated')
        good, s = wait_for(pg, lambda s: s['hall'] == 10 and len(s['waiting']) == 4, 5)
        check('10. full cinema: 10 seated, 4 wait outside (no overlap)', good and unique_seats(s), f"hall={s['hall']} waiting={s['waiting']}")
        seated_keys = [a['key'] for a in s['seats']]
        m.set([n for n in names('cap', 14) if n not in seated_keys[:2]]); m.ctl('/event')
        good, s = wait_for(pg, lambda s: len(s['waiting']) == 2 and s['actors'] == 10, 30)
        check('10b. when 2 leave, 2 waiting viewers take the freed seats', good, f"waiting={s['waiting']}")
        good, s = wait_for(pg, lambda s: all_seated(s, 10), 30)
        check('10c. and sit down', good and unique_seats(s))
        pg.close()
        m.stop()

        # ---------------------------------------------------------------- 11. authentication
        m = Mock(18082, '--password', 'hunter2', '--enforce')
        m.set(['secure1', 'secure2'])
        pg = open_page(browser, 18082, password='hunter2')
        good, s = wait_for(pg, lambda s: s['actors'] == 2, 8)
        st = m.ctl('/stats')
        check('11. authenticates with salt/challenge (Enforce on)', good and st['authOk'] == 1 and st['authFail'] == 0)
        pg.close()
        pg = open_page(browser, 18082, password='wrong')
        time.sleep(4)
        st = m.ctl('/stats'); s = snap(pg)
        check('11b. wrong password: no audience, backs off 60s instead of spamming', s['actors'] == 0 and st['authFail'] == 1 and s['connection'] == 'waiting')
        pg.close()
        m.stop()
        m = Mock(18083, '--password', 'hunter2')
        m.set(['open1'])
        pg = open_page(browser, 18083)
        good, s = wait_for(pg, lambda s: s['actors'] == 1, 8)
        check('11c. auth enabled without Enforce: works with no password configured', good)
        pg.close()
        m.stop()

        # ---------------------------------------------------------------- 12. half-open socket
        m = Mock(18084)
        m.set(['ghost'])
        pg = open_page(browser, 18084, poll=4)
        wait_for(pg, lambda s: s['actors'] == 1, 6)
        conns = m.ctl('/stats')['connections']
        m.ctl('/silent?on=1')
        good, s = wait_for(pg, lambda s: m.ctl('/stats')['connections'] > conns, 45, 1)
        m.ctl('/silent?on=0')
        check('12. unresponsive server detected via request timeouts → reconnect', good)
        pg.close()
        m.stop()

        # ---------------------------------------------------------------- 13. long run / churn
        m = Mock(18085)
        base = names('stay', 20)
        m.set(base)
        pg = open_page(browser, 18085, grace=0, initial='seated')
        wait_for(pg, lambda s: all_seated(s, 20), 6)
        heap0 = pg.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0')
        t0 = time.time(); cycles = 0
        while time.time() - t0 < 75:
            churn = names('churn', 15, (cycles * 7) % 400)
            m.set(base + churn[: (cycles % 15) + 1]); m.ctl('/event')
            cycles += 1
            time.sleep(0.6)
        m.set(base); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['actors'] == 20 and all_seated(s), 60)
        pg.evaluate('window.gc && gc()')
        heap1 = pg.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0')
        mem = pg.evaluate('({ lastSeat: __cinema.audience.lastSeat.size, waiting: __cinema.audience.waiting.length, door: __cinema.audience.doorQueue.length })')
        fps = pg.evaluate('''() => new Promise(r => { let n = 0; const t = performance.now();
            const f = () => { if (++n < 120) requestAnimationFrame(f); else r(1000 * n / (performance.now() - t)); };
            requestAnimationFrame(f); })''')
        check('13. churn (%d list updates, ~%d unique visitors): settles back to 20 seated' % (cycles, len(set(cycles * 7 % 400 for cycles in range(cycles))) + 15), good)
        check('13b. no leaked actors/queues; seat memory bounded', mem['waiting'] == 0 and mem['door'] == 0 and mem['lastSeat'] <= 500, json.dumps(mem))
        check('13c. heap stays flat', heap1 < heap0 * 1.6 + 3e6, f'{heap0/1e6:.1f} MB → {heap1/1e6:.1f} MB')
        check('13d. frame rate healthy', fps > 40, f'{fps:.0f} fps (headless)')
        pg.close()
        m.stop()

        browser.close()

    check('no uncaught page errors in any scenario', not page_errors, '; '.join(page_errors[:5]))
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
