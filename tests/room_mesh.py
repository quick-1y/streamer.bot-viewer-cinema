"""Offline geometry regression for the illustrated room's calibrated mesh.

Run with `python tests/room_mesh.py`; no authoring dependencies are required.
Pixel tests in wall_pixels.js independently verify the resulting artwork.
"""

import json
import math
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
DATA = (ROOT / "js/room-mesh.js").read_text().split("window.VC.RoomMesh = ", 1)[1]
MESH = json.loads(DATA.rstrip().removesuffix(";"))
U, V = 344 / 639, -313 / 645


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def difference(a, b):
    return a[0] - b[0], a[1] - b[1]


def map_point(point):
    for ids in MESH["triangles"]:
        a, b, c = (MESH["source"][i] for i in ids)
        ab, ac, ap = difference(b, a), difference(c, a), difference(point, a)
        area = cross(ab, ac)
        u, v = cross(ap, ac) / area, cross(ab, ap) / area
        if min(u, v, 1 - u - v) >= -1e-7:
            aa, bb, cc = (MESH["target"][i] for i in ids)
            return [aa[k] + u * (bb[k] - aa[k]) + v * (cc[k] - aa[k]) for k in range(2)]
    raise AssertionError(f"Point outside mesh: {point}")


class RoomMeshTest(unittest.TestCase):
    def test_no_flipped_faces_or_excessive_stretch(self):
        for ids in MESH["triangles"]:
            source = [MESH["source"][i] for i in ids]
            target = [MESH["target"][i] for i in ids]
            a = cross(difference(source[1], source[0]), difference(source[2], source[0]))
            b = cross(difference(target[1], target[0]), difference(target[2], target[0]))
            self.assertGreater(a * b, 0)
            self.assertGreater(b / a, .60)
            self.assertLess(b / a, 1.55)
        self.assertLess(max(math.dist(a, b) for a, b in zip(MESH["source"], MESH["target"])), 20)

    def test_surveyed_edges_are_mesh_edges(self):
        edges = {tuple(sorted((a, b))) for ids in MESH["triangles"]
                 for a, b in zip(ids, ids[1:] + ids[:1])}
        for guide in MESH["guides"]:
            a, b = guide["source"]
            direction = difference(b, a)
            squared = direction[0] ** 2 + direction[1] ** 2
            points = []
            for i, point in enumerate(MESH["source"]):
                offset = difference(point, a)
                t = (offset[0] * direction[0] + offset[1] * direction[1]) / squared
                if -.000001 <= t <= 1.000001 and abs(cross(direction, offset)) / math.sqrt(squared) < .000003:
                    points.append((t, i))
            points.sort()
            self.assertGreaterEqual(len(points), 2, guide["name"])
            for (_, i), (_, j) in zip(points, points[1:]):
                self.assertIn(tuple(sorted((i, j))), edges, guide["name"])

    def test_entire_visible_guides_have_exact_target_axes(self):
        for guide in MESH["guides"]:
            a, b = guide["target"]
            expected = V if guide["name"] in {"left-roof-silhouette", "right-floor-silhouette"} else U
            self.assertAlmostEqual((b[1] - a[1]) / (b[0] - a[0]), expected, places=7)
            for i in range(41):
                t = i / 40
                source = [guide["source"][0][k] * (1 - t) + guide["source"][1][k] * t for k in range(2)]
                expected_point = [a[k] * (1 - t) + b[k] * t for k in range(2)]
                self.assertLess(math.dist(map_point(source), expected_point), .00002, guide["name"])

    def test_guides_reach_artwork_endpoints(self):
        guides = {guide["name"]: guide for guide in MESH["guides"]}
        for name in ["screen-upper-edge", "screen-lower-edge"]:
            a, b = guides[name]["source"]
            self.assertLessEqual(a[0], 953)
            self.assertGreaterEqual(b[0], 1371)
        self.assertLessEqual(guides["left-roof-silhouette"]["source"][0][0], 155)
        self.assertGreaterEqual(guides["screen-roof-silhouette"]["source"][1][0], 1517)
        self.assertGreaterEqual(guides["right-floor-silhouette"]["source"][1][0], 1522)

    def test_calibrated_centers_and_common_corners_stay_fixed(self):
        for point in [[321, 574], [321, 670.5],
                      [1165, .55506613 * 1165 - 418.06645187],
                      [1165, .60336744 * 1165 - 300.78311674]]:
            self.assertLess(math.dist(map_point(point), point), .00002)
        guides = {guide["name"]: guide for guide in MESH["guides"]}
        self.assertEqual(guides["front-floor-silhouette"]["target"][1], [873, 940])
        self.assertEqual(guides["right-floor-silhouette"]["target"][0], [873, 940])
        self.assertEqual(guides["left-roof-silhouette"]["target"][1],
                         guides["screen-roof-silhouette"]["target"][0])


if __name__ == "__main__":
    unittest.main()
