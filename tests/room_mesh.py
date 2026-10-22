"""Checks for the active room geometry. Requires Python 3 and Node.js."""
import json
import math
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RoomGeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = r"""
        const fs = require('fs'), vm = require('vm');
        const context = {window: {}};
        vm.createContext(context);
        for (const file of ['js/util.js', 'js/layout.js'])
          vm.runInContext(fs.readFileSync(file, 'utf8'), context);
        const L = context.window.VC.Layout;
        const samples = [];
        for (let x = 0; x <= L.W; x += L.W / 8)
          for (let y = 0; y <= L.D; y += L.D / 8) {
            const art = L.floorArt(x, y);
            samples.push({x, y, inverse: L.fromArt(...art)});
          }
        console.log(JSON.stringify({
          width: L.W, depth: L.D, corners: L.FLOOR.corners,
          mappedCorners: [[0,0],[L.W,0],[L.W,L.D],[0,L.D]].map(p=>L.floorArt(...p)),
          screen: L.SCREEN_ART_CORNERS, samples,
          seats: L.buildSeats().map(s=>({id:s.id,x:s.x,y:s.y,row:s.row,route:L.routeToSeat(s)})),
          caps: [1,10,30,60].map(n=>L.buildSeats(n).length),
          outside: L.OUTSIDE, inside: L.INSIDE,
          gateDistances: [L.OUTSIDE,L.GATE.center,L.INSIDE].map(p=>L.gateDistance(p))
        }));
        """
        cls.data = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True))

    def test_floor_projection_matches_corners_and_inverts(self):
        for actual, expected in zip(self.data['mappedCorners'], self.data['corners']):
            self.assertLess(math.dist(actual, expected), 1e-8)
        for p in self.data['samples']:
            self.assertAlmostEqual(p['inverse']['x'], p['x'], places=8)
            self.assertAlmostEqual(p['inverse']['y'], p['y'], places=8)

    def test_seats_are_unique_and_inside_room(self):
        seats = self.data['seats']
        self.assertEqual(len(seats), 60)
        self.assertEqual(len({s['id'] for s in seats}), 60)
        self.assertEqual(len({(s['x'], s['y']) for s in seats}), 60)
        self.assertEqual(len({s['row'] for s in seats}), 6)
        for seat in seats:
            self.assertTrue(0 < seat['x'] < self.data['width'])
            self.assertTrue(0 < seat['y'] < self.data['depth'])

    def test_capacity_limits(self):
        self.assertEqual(self.data['caps'], [1, 10, 30, 60])

    def test_routes_connect_outside_door_and_seat(self):
        self.assertLess(self.data['gateDistances'][0], 0)
        self.assertAlmostEqual(self.data['gateDistances'][1], 0)
        self.assertGreater(self.data['gateDistances'][2], 0)
        for seat in self.data['seats']:
            route = seat['route']
            self.assertEqual(route[0], self.data['outside'])
            self.assertEqual(route[1], self.data['inside'])
            self.assertEqual(route[-1], {k: seat[k] for k in ['x', 'y']})
            for p in route:
                self.assertTrue(math.isfinite(p['x']) and math.isfinite(p['y']))

    def test_screen_corners_form_convex_quad(self):
        points = self.data['screen']
        cross = []
        for i in range(4):
            a, b, c = [points[(i + j) % 4] for j in range(3)]
            cross.append((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))
        self.assertTrue(all(v > 0 for v in cross))


if __name__ == '__main__':
    unittest.main()
