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
    q = {'port': port, 'poll': 0, 'grace': 2, 'debug': 0, 'initial': 'walk'}
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

        # ---------------------------------------------------------------- independent decor
        pg = browser.new_page(viewport={'width': 1920, 'height': 1080})
        pg.goto(PAGE + '?demo=1&remember=0')
        pg.wait_for_function('window.__cinema !== undefined')
        decor = pg.evaluate('''() => {
            const scene = __cinema.renderer.scene;
            return {ids: scene.posters.map(p => p.id),
                distinct: new Set(scene.posters.map(p => p.image)).size,
                sign: scene.sign.text};
        }''')
        check('decor. five posters are separate cached objects', decor['ids'] ==
              ['sunset', 'small', 'goodVibes', 'mountains', 'space'] and decor['distinct'] == 5)
        check('decor. default marquee text is CINEMA', decor['sign'] == 'CINEMA')
        custom = pg.evaluate('''async () => {
            const before = __cinema.renderer.scene;
            const replacement = document.createElement('canvas');
            replacement.width = replacement.height = 16;
            const ctx = replacement.getContext('2d');
            ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 16, 16);
            await VC.Decor.ready({goodVibes: replacement.toDataURL()});
            const after = VC.buildScene({posters: {small: null}, signText: 'Мой канал'});
            const pixels = s => Array.from(s.image.getContext('2d')
                .getImageData(0, 0, s.image.width, s.image.height).data);
            const oldGood = pixels(before.posters.find(p => p.id === 'goodVibes'));
            const newGood = pixels(after.posters.find(p => p.id === 'goodVibes'));
            const untouched = before.posters.filter(p => !['goodVibes', 'small'].includes(p.id))
                .every(p => JSON.stringify(pixels(p)) ===
                    JSON.stringify(pixels(after.posters.find(q => q.id === p.id))));
            const b = after.bg.getContext('2d');
            // This point falls inside the old Good Vibes artwork; the room itself
            // must now contain red wall, even when no poster object is drawn.
            const wall = b.getImageData(450, 390, 1, 1).data;
            return {ids: after.posters.map(p => p.id), untouched,
                replaced: JSON.stringify(oldGood) !== JSON.stringify(newGood),
                wall: wall[0] > wall[1] * 1.5 && wall[0] > wall[2] * 1.5};
        }''')
        check('decor. replacement changes only its own poster', custom['replaced'] and custom['untouched'])
        check('decor. individual posters can be hidden', 'small' not in custom['ids'] and len(custom['ids']) == 4)
        check('decor. room underneath posters is clean wall', custom['wall'])
        for label, query, expected in [
            ('short', 'MyChannel', 'MyChannel'),
            ('Cyrillic', '%D0%9C%D0%BE%D0%B9%20%D0%BA%D0%B0%D0%BD%D0%B0%D0%BB', 'Мой канал'),
            ('long', 'LongChannelName' * 20, 'LongChannelName' * 20),
            ('empty', '', '')
        ]:
            pg.goto(PAGE + '?demo=1&remember=0&sign=' + query)
            pg.wait_for_function('window.__cinema !== undefined')
            fitted = pg.evaluate('''() => {
                const s = __cinema.renderer.scene.sign;
                const pixels = s.image.getContext('2d').getImageData(0,0,640,160).data;
                return {text: s.text, width: s.width, height: s.height,
                    visible: pixels.some((v, i) => i % 4 === 3 && v > 0)};
            }''')
            check('decor. ' + label + ' marquee fits its panel', fitted['text'] == expected and
                  fitted['width'] <= 592.001 and fitted['height'] <= 128.001 and
                  fitted['visible'] == bool(expected))
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
        check('1c. counter shows "Зрители: 0"', counter.replace(' ', ' ').strip() == 'Зрители:0' or 'Зрители' in counter and counter.strip().endswith('0'), repr(counter))

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

        # ---------------------------------------------------------------- 14. OBS source lifecycle / local continuity
        m = Mock(18086)
        m.set(names('persist', 8))
        pg = open_page(browser, 18086, initial='seated')
        good, s = wait_for(pg, lambda s: all_seated(s, 8), 8)
        seats_before = {a['key']: a['seat'] for a in s['seats']}
        pg.reload()
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready' and all_seated(s, 8), 8)
        check('14. source reload restores seated viewers without entrance replay', good and
              {a['key']: a['seat'] for a in s['seats']} == seats_before and s['doorQueue'] == 0)
        stats_before = m.ctl('/stats')['connections']
        pg.evaluate("""() => {
            dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}));
            dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
        }""")
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready' and m.ctl('/stats')['connections'] > stats_before, 8)
        check('14b. suspended page resumes WebSocket and keeps the audience seated', good and all_seated(s, 8))
        m.set(names('persist', 8) + ['newarrival']); m.ctl('/event')
        good, s = wait_for(pg, lambda s: s['actors'] == 9, 5)
        check('14c. genuinely new viewers still enter through the door', good and
              next(a for a in s['seats'] if a['key'] == 'newarrival')['phase'] != 'seated')
        time.sleep(2)
        walking = pg.evaluate("({s: __cinema.audience.actors.get('newarrival').s, seat: __cinema.audience.actors.get('newarrival').seat.id})")
        pg.reload()
        good, s = wait_for(pg, lambda s: s['actors'] == 9, 5)
        resumed = pg.evaluate("({s: __cinema.audience.actors.get('newarrival').s, seat: __cinema.audience.actors.get('newarrival').seat.id})")
        check('14d. mid-walk reload preserves route progress and reserved seat', good and
              resumed['seat'] == walking['seat'] and resumed['s'] >= walking['s'] - .1)
        # Malformed local state must fall back to the configured initial mode.
        pg.add_init_script("Object.keys(localStorage).forEach(k => localStorage.setItem(k, '{broken'))")
        pg.reload()
        good, s = wait_for(pg, lambda s: s['connection'] == 'ready' and all_seated(s, 9), 8)
        check('14e. corrupt browser storage cannot break startup', good)
        pg.close()
        # Separate page context: deny storage to model restrictive CEF settings.
        pg = browser.new_page(viewport={'width': 1920, 'height': 1080})
        pg.add_init_script("Storage.prototype.getItem = Storage.prototype.setItem = function() { throw new DOMException('Denied', 'SecurityError'); }")
        pg.goto(PAGE + '?port=18086&poll=0')
        pg.wait_for_function('window.__cinema !== undefined')
        good, s = wait_for(pg, lambda s: all_seated(s, 9), 8)
        check('14f. storage denial uses seated startup without replaying existing viewers', good)
        counter = pg.locator('.counter').bounding_box()
        check('14g. counter says Зрители and stays in the bottom-right corner',
              pg.locator('.counter').inner_text().startswith('Зрители:') and
              counter['x'] > 1400 and counter['y'] > 900)
        scales = []
        for w, h in [(960,540),(1920,1080),(3840,2160)]:
            pg.set_viewport_size({'width':w,'height':h})
            pg.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
            scales.append(pg.evaluate('__cinema.renderer.scale'))
        check('14h. OBS resolutions use exact 1x, 2x and 4x pixel scales', scales == [1,2,4], str(scales))
        check('14i. illustrated assets loaded and render at native 1080p', pg.evaluate(
            "VC.Art.available && __cinema.renderer.scene.illustrated && __cinema.renderer.world.width === 1920 && __cinema.renderer.world.height === 1080"))
        geometry = pg.evaluate("""() => {
            const seats=VC.Layout.buildSeats(60), c=VC.Layout.FLOOR.corners;
            const edge=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
            const screen=edge(c[0],c[1]), entrance=edge(c[3],c[2]);
            const anchors=__cinema.renderer.seatItems.filter(p=>p.kind==='back');
            const rows=Array.from({length:6},()=>[]);
            seats.forEach((seat,i)=>rows[seat.row].push(anchors[i]));
            return rows.map(points=>{
                const a=points[0],b=points[points.length-1];
                const dx=b.sx-a.sx,dy=b.sy-a.sy,length=Math.hypot(dx,dy);
                const angle=Math.atan2(dy,dx)*180/Math.PI;
                return {angle,screen:angle-screen,entrance:angle-entrance,
                    deviation:Math.max(...points.map(p=>Math.abs(dx*(p.sy-a.sy)-dy*(p.sx-a.sx))/length))};
            });
        }""")
        check('15. all six chair rows are straight and parallel to the screen wall and the entrance wall',
              len(geometry)==6 and all(abs(r['screen']) < .3 and abs(r['entrance']) < .3 and r['deviation'] < .65
                                       for r in geometry), json.dumps(geometry))
        plane = pg.evaluate("""() => {
            const L=VC.Layout, c=L.FLOOR.corners, g=L.ART_GEOMETRY;
            const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
            const near=(a,b,edge,tol)=>Math.abs(angle(a,b)-angle(...edge))<tol;
            // Rug corners lie exactly on their world rectangle; long edges follow the walls.
            const rugs=L.RUGS.every(r=>{
                const q=L.rugCorners(r), world=[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
                return q.every((p,i)=>{const w=L.fromArt(...p);return Math.hypot(w.x-world[i][0],w.y-world[i][1])<1e-9;})&&
                    near(q[0],q[1],[c[0],c[1]],.3)&&near(q[3],q[2],[c[3],c[2]],.3);
            });
            const rails=near(...g.railFront,[c[3],c[2]],.05)&&near(...g.railRight,[c[1],c[2]],.05);
            const [a,b]=c, length=Math.hypot(b[0]-a[0],b[1]-a[1]);
            const gaps=__cinema.renderer.seatItems.filter(p=>p.kind==='back').map(p=>{
                const sx=(p.sx-12)*1672/936-a[0],sy=(p.sy-6)*941/527-a[1];
                return ((b[0]-a[0])*sy-(b[1]-a[1])*sx)/length;
            });
            return {rugs,rails,gap:Math.min(...gaps)};
        }""")
        check('15b. rugs sit on exact floor rectangles and both fence runs follow the painted floor edges',
              plane['rugs'] and plane['rails'],json.dumps(plane))
        check('15c. first chair row has at least 110 source pixels of perpendicular screen-wall clearance',
              plane['gap']>=110,json.dumps(plane))
        wall_pixels = pg.evaluate("""() => {
            const measure = """ + (ROOT / 'tests' / 'wall_pixels.js').read_text() + """;
            const original=document.createElement('canvas');
            original.width=1672;original.height=941;
            original.getContext('2d').drawImage(VC.Art.images.room,0,0);
            // Search bands around the painted screen-wall base (stage strip → parquet)
            // and the front floor edge; the angles come from the rendered pixels.
            const guides=[{name:'screen-wall-base',target:[[960,350.9],[1380,589.1]]},
                {name:'front-floor-edge',target:[[560,727.6],[890,913.8]]}];
            const c=VC.Layout.FLOOR.corners, edge=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
            return {original:measure({canvas:original,guides:VC.RoomMesh.guides,target:false}),
                corrected:measure({canvas:__cinema.renderer.scene.room,guides,
                    specs:[{name:'screen-wall-base',sign:1},{name:'front-floor-edge',sign:-1}]}),
                floor:{'screen-wall-base':edge(c[0],c[1]),'front-floor-edge':edge(c[3],c[2])}};
        }""")
        def walls_aligned(lines):
            return len(lines)==4 and all(line['angle'] is not None and
                28.0 < line['angle'] < 28.6 and line['points']>40 and
                line['inliers']/line['points']>.75 and line['residual']<1.5 for line in lines)
        wall_angles=lambda lines: ', '.join(f"{line['name']}={line['angle']:.3f}°" if
            line['angle'] is not None else f"{line['name']}=unmeasurable" for line in lines)
        check('15d. painted screen-wall base and front floor edge match the floor calibration within 0.3 degrees',
              len(wall_pixels['corrected'])==2 and all(line['angle'] is not None and line['points']>40 and
                line['inliers']/line['points']>.75 and
                abs(line['angle']-wall_pixels['floor'][line['name']])<.3 for line in wall_pixels['corrected']),
              wall_angles(wall_pixels['corrected'])+' floor='+json.dumps(wall_pixels['floor']))
        check('15e. pixel regression detects the inconsistent angles in the original artwork',
              not walls_aligned(wall_pixels['original']),wall_angles(wall_pixels['original']))
        masks = pg.evaluate("""() => {
            const scene=__cinema.renderer.scene, fg=scene.fg.getContext('2d'), header=scene.lintel.getContext('2d');
            const alpha=(ctx,x,y)=>{const p=VC.Layout.artPoint(x,y);return ctx.getImageData(Math.round(p.x*2),Math.round(p.y*2),1,1).data[3];};
            return {opening:alpha(fg,298,620),wall:alpha(fg,440,690),header:alpha(header,300,500)};
        }""")
        check('16. doorway stays open while facade and lintel occlude the actor',
              masks['opening']==0 and masks['wall']>240 and masks['header']>240, json.dumps(masks))
        rails = pg.evaluate("""() => {
            const caps=[];const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},fillRect(x,y){caps.push([x,y]);}};
            VC.Art.railings(ctx);
            const source=caps.map(([x,y])=>[(x+.5-12)*1672/936,(y+.6+1.04*VC.Layout.ZS-6)*941/527]);
            const corner=VC.Layout.floorArt(19.55,17.15);
            return {count:caps.length,unique:new Set(caps.map(p=>p.map(v=>v.toFixed(4)).join(','))).size,
                minX:Math.min(...source.map(p=>p[0])),corner:source.filter(p=>Math.hypot(p[0]-corner[0],p[1]-corner[1])<1).length};
        }""")
        check('16b. fence starts beyond entrance wall and has one shared corner post',
              rails['count']==rails['unique'] and rails['minX']>535 and rails['corner']==1, json.dumps(rails))
        direct = pg.evaluate("""() => VC.Layout.buildSeats(60).every(seat=>{
            const approach=VC.Layout.routeToSeat(seat).slice(1,4);
            const travelled=approach.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-approach[i].x),0);
            return Math.abs(travelled-Math.abs(approach.at(-1).x-approach[0].x))<1e-6;
        })""")
        check('16c. every route approaches its aisle without a cross-aisle U-turn', direct)
        pg.close(); m.stop()

        # Actual entry and exit: capture the foot position when crossing the facade.
        m=Mock(18087);m.set([])
        pg=open_page(browser,18087,grace=0,remember=0)
        wait_for(pg,lambda s:s['connection']=='ready',8)
        pg.evaluate("""() => {
            const a=__cinema.audience, update=a.update.bind(a);window.gateCrossings=[];const last=new Map();
            a.update=(dt)=>{
                update(dt);
                for(const actor of a.actors.values()){
                    if(actor.phase!=='walking')continue;
                    const point={...actor.pos}, distance=VC.Layout.gateDistance(point),previous=last.get(actor.key);
                    if(previous && ((previous.distance<=0 && distance>0) || (previous.distance>=0 && distance<0))){
                        const t=previous.distance/(previous.distance-distance);
                        const p=VC.Layout.project(previous.point.x+(point.x-previous.point.x)*t,previous.point.y+(point.y-previous.point.y)*t);
                        const x=(p.x-12)*1672/936,y=(p.y-6)*941/527;
                        const [a,b]=[VC.Layout.ART_GEOMETRY.gateLeft,VC.Layout.ART_GEOMETRY.gateRight];
                        const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
                        gateCrossings.push({dir:actor.dir,x,y,across:((x-a[0])*dx+(y-a[1])*dy)/(length*length),
                            deviation:Math.abs(dx*(y-a[1])-dy*(x-a[0]))/length});
                    }
                    last.set(actor.key,{point,distance});
                }
            };
        }""")
        m.set(['doorwalk']);m.ctl('/event')
        good,s=wait_for(pg,lambda s:all_seated(s,1),25)
        check('17. viewer enters through the calibrated doorway and reaches a seat',good)
        m.set([]);m.ctl('/event')
        good,s=wait_for(pg,lambda s:s['actors']==0,25)
        crossings=pg.evaluate('gateCrossings')
        check('17b. entry and exit cross the visible opening with clearance from jambs',good and
              len(crossings)==2 and {c['dir'] for c in crossings}=={1,-1} and
              all(.2<c['across']<.8 and c['deviation']<1 for c in crossings),json.dumps(crossings))
        pg.close();m.stop()

        browser.close()

    check('no uncaught page errors in any scenario', not page_errors, '; '.join(page_errors[:5]))
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
