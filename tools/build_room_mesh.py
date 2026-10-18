#!/usr/bin/env python3
"""Author the room illustration's deterministic piecewise-affine rectification.

Runtime has no Python dependency. Rebuild js/room-mesh.js with Python, NumPy
and SciPy after changing surveyed artwork guides here. Coordinates are native
1672-pixel artwork coordinates, before the final OBS canvas placement.

The illustration is not a consistent affine projection: even the light screen's
top and bottom differ by two degrees. Each surveyed straight edge therefore
becomes an exact edge of a Delaunay mesh, with one common pair of target axes.
Unconstrained points use a smooth thin-plate displacement field. The runtime
renderer interpolates the resulting mesh linearly, preserving all guide edges.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import Delaunay


WIDTH, SOURCE_HEIGHT, OUTPUT_HEIGHT = 1672, 960, 941
U, V = 344 / 639, -313 / 645
SPACING = 22.0


def intersection(m1: float, b1: float, m2: float, b2: float) -> np.ndarray:
    x = (b2 - b1) / (m1 - m2)
    return np.array([x, m1 * x + b1])


def target_line(source, slope, anchor_x=None):
    """Keep the source midpoint; the line's squared displacement is minimal."""
    source = np.asarray(source, dtype=float)
    midpoint = source.mean(axis=0)
    if anchor_x is not None:
        source_slope = (source[1, 1] - source[0, 1]) / (source[1, 0] - source[0, 0])
        midpoint = source[0] + [anchor_x - source[0, 0], source_slope * (anchor_x - source[0, 0])]
    intercept = midpoint[1] - slope * midpoint[0]
    return np.array([[x, slope * x + intercept] for x, _ in source])


def make_guides():
    guides = []

    def add(name, source, target):
        guides.append({"name": name, "source": np.asarray(source, dtype=float),
                       "target": np.asarray(target, dtype=float)})

    # Pixel surveys: robust fits to the alpha silhouette of the room PNG.
    roof_u, roof_ub = .55983486, -484.66573583
    roof_v, roof_vb = -.47595728, 416.72179245
    top = intersection(roof_u, roof_ub, roof_v, roof_vb)
    # Extend to the complete visible roof. Keep the original fitted intervals
    # when minimizing displacement, so extending a guide cannot move its line.
    left = np.array([160.0, roof_v * 160 + roof_vb])
    right = np.array([1500.0, roof_u * 1500 + roof_ub])
    # Both lines share one endpoint. Minimize displacement along their complete
    # lengths instead of independently preserving their incompatible midpoints.
    left_length, right_length = np.linalg.norm(left - top), np.linalg.norm(right - top)
    offset = -((V - roof_v) * (left[0] - top[0]) / 2 * left_length
               + (U - roof_u) * (right[0] - top[0]) / 2 * right_length) / (left_length + right_length)
    target_top = top + [0, offset]
    left = np.array([155.0, roof_v * 155 + roof_vb])
    right = np.array([1517.0, roof_u * 1517 + roof_ub])
    add("left-roof-silhouette", [left, top],
        [[left[0], target_top[1] + V * (left[0] - top[0])], target_top])
    add("screen-roof-silhouette", [top, right],
        [target_top, [right[0], target_top[1] + U * (right[0] - top[0])]])

    # Independent fits are intentional: the original screen is a trapezoid.
    for name, x0, x1, slope, intercept, anchor_x in [
        ("screen-upper-edge", 953, 1371, .55506613, -418.06645187, 1165),
        ("screen-lower-edge", 953, 1371, .60336744, -300.78311674, 1165),
        ("cinema-sign-beam", 224, 390, .60122132, 306.1244454, 307.5),
        ("entrance-beam-upper", 400, 530, .6596156, 303.59831265, 462.5),
        ("entrance-beam-lower", 400, 530, .66856302, 314.48578834, 462.5),
    ]:
        source = [[x0, slope * x0 + intercept], [x1, slope * x1 + intercept]]
        add(name, source, target_line(source, U, anchor_x))

    # Keep the door aperture and the exact walking threshold on the same axis.
    # Midpoint anchoring preserves the entry/exit calibration's doorway center.
    for name, source in [
        ("door-opening-header", [[269, 544], [373, 604]]),
        ("door-opening-sill", [[269, 641], [373, 700]]),
    ]:
        add(name, source, target_line(source, U))

    # The source corner is cropped below y=941. The renderer may extend its
    # wooden apron to this fitted intersection before drawing this 960px mesh.
    front_m, front_b = .61385469, 414.41922119
    right_m, right_b = -.490999718, 1380.1381
    bottom = intersection(front_m, front_b, right_m, right_b)
    target_bottom = np.array([873.0, 940.0])
    front_start = np.array([540.0, front_m * 540 + front_b])
    right_start = np.array([1522.0, right_m * 1522 + right_b])
    add("front-floor-silhouette", [front_start, bottom],
        [[front_start[0], target_bottom[1] + U * (front_start[0] - target_bottom[0])], target_bottom])
    add("right-floor-silhouette", [bottom, right_start],
        [target_bottom, [right_start[0], target_bottom[1] + V * (right_start[0] - target_bottom[0])]])
    return guides


def build():
    guides = make_guides()
    source, target, lookup = [], [], {}

    def add_point(point, mapped):
        key = tuple(np.round(point, 8))
        if key in lookup:
            index = lookup[key]
            if not np.allclose(target[index], mapped, atol=1e-6):
                raise ValueError(f"Incompatible shared control point: {point}")
            return index
        index = len(source)
        lookup[key] = index
        source.append(np.array(point, dtype=float))
        target.append(np.array(mapped, dtype=float))
        return index

    paths = []
    for guide in guides:
        length = np.linalg.norm(guide["source"][1] - guide["source"][0])
        count = int(np.ceil(length / SPACING))
        path = []
        for t in np.linspace(0, 1, count + 1):
            point = guide["source"][0] * (1 - t) + guide["source"][1] * t
            mapped = guide["target"][0] * (1 - t) + guide["target"][1] * t
            path.append(add_point(point, mapped))
        paths.append(path)

    # Far transparent corners pin the displacement field. Border anchors and
    # free interior anchors follow its smooth displacement, avoiding folds near
    # the cropped lower corner that fixed y=941 anchors would introduce.
    for corner in [[0, 0], [WIDTH, 0], [0, SOURCE_HEIGHT], [WIDTH, SOURCE_HEIGHT]]:
        add_point(corner, corner)
    controls = np.array(source)
    field = RBFInterpolator(controls, np.array(target) - controls,
                            kernel="thin_plate_spline", smoothing=0)

    def append_free(points):
        points = np.asarray(points, dtype=float)
        mapped = points + field(points)
        for point, destination in zip(points, mapped):
            add_point(point, destination)

    border = []
    for x in np.linspace(0, WIDTH, int(np.ceil(WIDTH / 80)) + 1):
        border.extend([[x, 0], [x, SOURCE_HEIGHT]])
    for y in np.linspace(0, SOURCE_HEIGHT, 13):
        border.extend([[0, y], [WIDTH, y]])
    append_free(border)

    # Free points stabilize large wall/floor triangles without approaching guide
    # edges too closely; samples on those edges remain the authoritative points.
    free = []
    for x in np.arange(80, WIDTH, 95):
        for y in np.arange(70, SOURCE_HEIGHT, 95):
            p = np.array([x, y], dtype=float)
            nearest = float("inf")
            for guide in guides:
                a, b = guide["source"]
                t = np.clip(np.dot(p - a, b - a) / np.dot(b - a, b - a), 0, 1)
                nearest = min(nearest, np.linalg.norm(p - (a + t * (b - a))))
            if nearest > 12:
                free.append(p)
    append_free(free)

    # Delaunay is unconstrained. Split any surveyed segment it did not include
    # until every sampled guide segment is an actual mesh edge. This guarantees
    # linear interpolation preserves the exact target line in the compositor.
    for iteration in range(14):
        triangulation = Delaunay(np.array(source))
        edges = {tuple(sorted((int(a), int(b))))
                 for triangle in triangulation.simplices
                 for a, b in zip(triangle, np.roll(triangle, 1))}
        split_count = 0
        updated_paths = []
        for path in paths:
            updated = [path[0]]
            for a, b in zip(path, path[1:]):
                if tuple(sorted((a, b))) not in edges:
                    distance = np.linalg.norm(source[a] - source[b])
                    if distance < .025:
                        raise ValueError("Cannot recover a constrained guide segment")
                    mid = (source[a] + source[b]) / 2
                    destination = (target[a] + target[b]) / 2
                    updated.append(add_point(mid, destination))
                    split_count += 1
                updated.append(b)
            updated_paths.append(updated)
        paths = updated_paths
        if not split_count:
            break
    else:
        raise ValueError("Guide edge recovery did not converge")

    src, dst = np.array(source), np.array(target)
    triangles = triangulation.simplices.copy()
    def signed_area(points):
        a = points[triangles[:, 1]] - points[triangles[:, 0]]
        b = points[triangles[:, 2]] - points[triangles[:, 0]]
        return a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
    src_area, dst_area = signed_area(src), signed_area(dst)
    if np.any(src_area * dst_area <= 0):
        raise ValueError("Rectification creates flipped or collapsed triangles")
    ratios = dst_area / src_area
    displacement = np.linalg.norm(dst - src, axis=1)
    if displacement.max() > 40:
        raise ValueError(f"Unexpectedly large displacement: {displacement.max():.2f}px")
    guide_errors = []
    for guide in guides:
        line = guide["target"][1] - guide["target"][0]
        expected = V if guide["name"] in {"left-roof-silhouette", "right-floor-silhouette"} else U
        guide_errors.append(abs(line[1] / line[0] - expected))
    assert max(guide_errors) < 1e-12

    output = {
        "width": WIDTH, "sourceHeight": SOURCE_HEIGHT, "height": OUTPUT_HEIGHT,
        "source": np.round(src, 6).tolist(), "target": np.round(dst, 6).tolist(),
        "triangles": triangles.tolist(),
        "guides": [{"name": guide["name"],
                    "source": np.round(guide["source"], 6).tolist(),
                    "target": np.round(guide["target"], 6).tolist()}
                   for guide in guides],
    }
    report = {"vertices": len(src), "triangles": len(triangles),
              "guideSegments": sum(len(path) - 1 for path in paths),
              "edgeRecoveryPasses": iteration + 1,
              "maximumDisplacementPx": round(float(displacement.max()), 6),
              "minimumAreaRatio": round(float(ratios.min()), 6),
              "maximumAreaRatio": round(float(ratios.max()), 6),
              "maximumGuideSlopeError": float(max(guide_errors))}
    return output, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "js/room-mesh.js")
    args = parser.parse_args()
    output, report = build()
    header = ("/* Generated by tools/build_room_mesh.py; native artwork coordinates.\n"
              " * sourceHeight=960 includes the cropped wooden apron; output height=941.\n"
              " * Rebuild instead of editing this data by hand. */\n")
    args.output.write_text(header + "window.VC.RoomMesh = " + json.dumps(output, separators=(",", ":")) + ";\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
