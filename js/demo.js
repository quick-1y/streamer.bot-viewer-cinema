/* ?demo=1 — simulated audience for previewing the overlay without Streamer.bot. */
(function () {
  'use strict';
  const VC = window.VC;
  const NAMES = ['NightRain', 'Frosty', 'MisterCat', 'Kira', 'Deniska', 'Sakura', 'Pixel', 'BlueSky', 'Tsunami',
    'Veles', 'Raven', 'Zelda', 'Lunara', 'ShadowFox', 'Котейка', 'Aurora', 'GrimLock', 'Milo', 'Sora', 'Tundra',
    'Belka', 'Orion', 'MapleLeaf', 'Wisp', 'Nova', 'Yuki', 'Борщ_Мастер', 'IronFern', 'Coco', 'Drift', 'Lynx', 'Nimbus'];

  VC.startDemo = function (emit) {
    const rnd = VC.rng(Date.now() & 0xffff);
    const present = new Set(NAMES.slice(0, 14));
    const viewer = (n, i) => ({ login: n.toLowerCase(), display: n, role: i === 0 ? 'Moderator' : 'Viewer', subscribed: i % 4 === 1 });
    const publish = () => emit(Array.from(present).map((n) => viewer(n, NAMES.indexOf(n))));
    publish();
    const timer = setInterval(() => {
      const absent = NAMES.filter((n) => !present.has(n));
      if ((rnd() < 0.55 && absent.length) || present.size < 8) {
        present.add(absent[Math.floor(rnd() * absent.length)]);
        if (rnd() < 0.3 && absent.length > 2) present.add(absent[Math.floor(rnd() * absent.length)]);
      } else if (present.size) {
        const arr = Array.from(present);
        present.delete(arr[Math.floor(rnd() * arr.length)]);
      }
      publish();
    }, 4000);
    return { stop: () => clearInterval(timer) };
  };
})();
