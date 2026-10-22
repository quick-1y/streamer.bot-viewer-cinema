"""Visual presets must share the cinema projection, routes and occlusion masks."""
import functools
import http.server
import os
from pathlib import Path
import threading
import urllib.parse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
checks = 0


def check(name, condition):
    global checks
    assert condition, name
    checks += 1
    print('PASS', name, flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


SNAPSHOT = """async () => {
    const L=VC.Layout, scene=__cinema.renderer.scene;
    const hash=async(canvas,alphaOnly=false)=>{
        const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        const bytes=alphaOnly?rgba.filter((_,i)=>i%4===3):rgba;
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
          .map(v=>v.toString(16).padStart(2,'0')).join('');
    };
    const sample=(ctx,x,y)=>{const p=L.artPoint(x,y);return ctx.getImageData(Math.round(p.x*2),Math.round(p.y*2),1,1).data[3]};
    return {
        theme:__cinema.config.cinemaTheme, attribute:document.querySelector('#stage').dataset.cinemaTheme,
        geometry:{floor:L.FLOOR,screen:L.SCREEN_ART_CORNERS,facade:L.ART_GEOMETRY,
          seats:L.buildSeats(60).map(s=>({id:s.id,x:s.x,y:s.y,route:L.routeToSeat(s)})),
          layers:__cinema.renderer.seatItems},
        background:await hash(scene.bg), chair:await hash(scene.seats.back),
        chairAlpha:await hash(scene.seats.back,true),
        masks:{opening:sample(scene.fg.getContext('2d'),298,620),
          wall:sample(scene.fg.getContext('2d'),440,690),
          header:sample(scene.lintel.getContext('2d'),300,500)},
        posters:scene.posters.map(p=>({id:p.id,x:p.x,y:p.y,w:p.w,h:p.h})),
        screen:document.querySelector('.cinema-screen')?.style.transform || null
    };
}"""


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            options = {'executable_path': os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}
            browser = p.chromium.launch(**options)
            page = browser.new_page(viewport={'width': 1920, 'height': 1080})
            requests, errors = [], []
            page.on('request', lambda req: requests.append(req.url))
            page.on('pageerror', lambda error: errors.append(str(error)))

            def open_scene(scene='index', **params):
                requests.clear()
                query = urllib.parse.urlencode({'demo': 1, 'remember': 0, **params})
                page.goto(f'http://127.0.0.1:{server.server_port}/{scene}.html?{query}')
                page.wait_for_function('window.__cinema !== undefined')
                return page.evaluate(SNAPSHOT)

            classic = open_scene()
            check('classic is the default and does not request cyberpunk textures',
                  classic['theme'] == classic['attribute'] == 'classic' and not any('/assets/art/cyberpunk-' in url for url in requests))
            cyber = open_scene(theme='cyberpunk')
            check('cyberpunk loads its floor and both rugs', cyber['theme'] == cyber['attribute'] == 'cyberpunk' and page.evaluate("""() =>
                ['cyberFloor','cyberRug1','cyberRug2'].every(key=>VC.Art.images[key]?.naturalWidth>0)"""))
            check('floor projection, screen, all routes and seat layers are identical', classic['geometry'] == cyber['geometry'])
            check('posters retain their exact wall positions and dimensions', classic['posters'] == cyber['posters'])
            check('the room and chairs change appearance without changing chair opacity',
                  classic['background'] != cyber['background'] and classic['chair'] != cyber['chair'] and classic['chairAlpha'] == cyber['chairAlpha'])
            check('the entrance stays open and facade/lintel still occlude walkers',
                  classic['masks'] == cyber['masks'] and cyber['masks']['opening'] == 0 and
                  cyber['masks']['wall'] > 240 and cyber['masks']['header'] > 240)
            for name in ['starting', 'break', 'ending']:
                old = open_scene(name)
                new = open_scene(name, theme='cyberpunk')
                check(f'{name} keeps the same projected screen and geometry with cyberpunk enabled',
                      old['geometry'] == new['geometry'] and old['screen'] == new['screen'] and new['theme'] == 'cyberpunk')

            check('custom rugs and null still override the cyberpunk preset', page.evaluate("""async () => {
                const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
                const ctx=canvas.getContext('2d'), r=VC.Layout.RUGS[0];
                const point=VC.Layout.floorArt((r.x0+r.x1)/2,(r.y0+r.y1)/2);
                const sample=()=>Array.from(ctx.getImageData(Math.round(24+point[0]*1872/1672),Math.round(12+point[1]*1054/941),1,1).data);
                VC.Art.rugs(ctx,'cyberpunk');const fallback=sample();
                await VC.Art.configureRugs({rug1:null,rug2:null},'cyberpunk');
                ctx.clearRect(0,0,1920,1080);VC.Art.rugs(ctx,'cyberpunk');if(sample()[3]!==0)return false;
                const custom=document.createElement('canvas');custom.width=custom.height=8;
                custom.getContext('2d').fillStyle='#00ff00';custom.getContext('2d').fillRect(0,0,8,8);
                await VC.Art.configureRugs({rug1:custom.toDataURL(),rug2:null},'cyberpunk');
                VC.Art.rugs(ctx,'cyberpunk');if(JSON.stringify(sample())!=='[0,255,0,255]')return false;
                await VC.Art.configureRugs({rug1:'data:image/png;base64,bad',rug2:null},'cyberpunk');
                ctx.clearRect(0,0,1920,1080);VC.Art.rugs(ctx,'cyberpunk');
                return JSON.stringify(sample())===JSON.stringify(fallback);
            }"""))
            config = (ROOT / 'config.js').read_text().replace("cinemaTheme: 'classic'", "cinemaTheme: 'cyberpunk'")
            page.route('**/config.js', lambda route: route.fulfill(status=200, content_type='application/javascript', body=config))
            check('cinemaTheme in config.js selects the preset without URL parameters', open_scene()['theme'] == 'cyberpunk')
            check('the URL can override the configured preset', open_scene(theme='classic')['theme'] == 'classic')
            check('an unknown theme safely resolves to classic', open_scene(theme='unknown')['theme'] == 'classic')
            page.unroute('**/config.js')
            page.route('**/assets/art/cyberpunk-floor.png', lambda route: route.abort())
            check('missing optional theme assets do not affect the classic cinema', open_scene()['theme'] == 'classic')
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html?demo=1&theme=cyberpunk')
            page.wait_for_selector('#stage.startup-error')
            check('missing selected theme artwork is reported explicitly', page.locator('canvas.world').count() == 0 and 'Не удалось' in page.locator('#stage').inner_text())
            check('no uncaught browser errors', not errors)
            browser.close()
        print(f'{checks} checks passed', flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
