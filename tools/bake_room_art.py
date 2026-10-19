#!/usr/bin/env python3
"""Bake the room's calibrated illustration for fast, untainted OBS startup.

Authoring only: install NumPy, Pillow and SciPy, then run from the repository:

    python3 tools/build_room_mesh.py
    python3 tools/bake_room_art.py --room /path/to/original-room.png \
        --floor /path/to/original-floor.png --output /tmp/rebuilt-room.png

The browser loads the resulting PNG directly and needs no image readback or
Python packages. The original room/floor PNGs stay unchanged. This script uses
the deterministic mesh from build_room_mesh.build(), restores the two old rug
footprints, and rasterizes each face with premultiplied bilinear interpolation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from build_room_mesh import build

# Original painted rug footprints, matching Layout.RUGS[*].source. New rugs are
# composited separately by the browser in the exact floor coordinate plane.
OLD_RUGS = (
    ((883, 299), (1403, 618), (1176, 733), (653, 410)),
    ((596, 426), (1118, 751), (899, 862), (395, 520)),
)


def polygon_mask(size, points, supersampling=8):
    """Antialiased clip coverage; restore only the inflated rug footprint."""
    width, height = size
    mask = Image.new('L', (width * supersampling, height * supersampling))
    ImageDraw.Draw(mask).polygon(
        [(x * supersampling - .5, y * supersampling - .5) for x, y in points], fill=255)
    return np.asarray(mask.resize(size, Image.Resampling.BOX), dtype=float) / 255


def source_room(room_path, floor_path, source_height):
    room = np.asarray(Image.open(room_path).convert('RGBA'), dtype=float)
    floor = np.asarray(Image.open(floor_path).convert('RGBA'), dtype=float)
    height, width = room.shape[:2]
    if (width, height) != (1672, 941) or floor.shape != room.shape:
        raise ValueError('Room and clean floor must both be native 1672×941 RGBA artwork')
    source = np.zeros((source_height, width, 4), dtype=float)
    source[:height] = room
    for rug in OLD_RUGS:
        points = np.asarray(rug, dtype=float)
        center = points.mean(axis=0)
        points = center + (points - center) * 1.025
        coverage = polygon_mask((width, height), points)
        front_alpha = floor[:, :, 3] / 255 * coverage
        back_alpha = source[:height, :, 3] / 255
        alpha = front_alpha + back_alpha * (1 - front_alpha)
        premultiplied = (floor[:, :, :3] * front_alpha[:, :, None] +
                         source[:height, :, :3] * (back_alpha * (1 - front_alpha))[:, :, None])
        source[:height, :, :3] = np.divide(premultiplied, alpha[:, :, None],
                                          out=np.zeros_like(premultiplied), where=alpha[:, :, None] > 0)
        source[:height, :, 3] = alpha * 255
        # Canvas stores each compositing operation in an 8-bit backing buffer.
        source[:height] = np.rint(source[:height])
    # The supplied image truncates the wooden apron. Continue its final texel
    # row only inside the fitted silhouette, exactly as the former compositor.
    xs = np.arange(850, 900)
    for y in range(941, min(953, source_height)):
        inside = y + .5 <= np.minimum(.613855 * xs + 414.419, -.491 * xs + 1380.138)
        source[y, xs[inside]] = source[940, xs[inside]]
    return source


def coefficients(source, target):
    s, p, q = source
    t, u, v = target
    px, py = p - s
    qx, qy = q - s
    ux, uy = u - t
    vx, vy = v - t
    det = px * qy - py * qx
    a, c = (ux * qy - vx * py) / det, (vx * px - ux * qx) / det
    b, d = (uy * qy - vy * py) / det, (vy * px - uy * qx) / det
    return np.array([a, b, c, d, t[0] - a * s[0] - c * s[1], t[1] - b * s[0] - d * s[1]])


def render(source, mesh):
    """Inverse-sample each triangle using the browser rasterizer's pixel rules.

    Half-open scanline edges give every output pixel exactly one owner. Sampling
    at pixel centers and interpolating premultiplied RGBA avoids both mesh cracks
    and dark fringes at the transparent room silhouette.
    """
    width, height = mesh['width'], mesh['height']
    sh, sw = source.shape[:2]
    output = np.zeros((height, width, 4), dtype=np.uint8)
    owners = np.zeros((height, width), dtype=np.uint8)
    source_points, target_points = np.array(mesh['source']), np.array(mesh['target'])
    for ids in mesh['triangles']:
        points = target_points[ids]
        inv = coefficients(points, source_points[ids])
        first = max(0, int(np.ceil(points[:, 1].min() - .5)))
        last = min(height - 1, int(np.floor(points[:, 1].max() - .5)))
        if last < first:
            continue
        rows = np.arange(first, last + 1)
        yc = rows + .5
        intersections = np.full((3, len(rows)), np.nan)
        for i in range(3):
            p, q = points[i], points[(i + 1) % 3]
            active = (yc >= min(p[1], q[1])) & (yc < max(p[1], q[1]))
            if p[1] != q[1]:
                intersections[i, active] = p[0] + (q[0] - p[0]) * (yc[active] - p[1]) / (q[1] - p[1])
        valid = np.sum(np.isfinite(intersections), axis=0) >= 2
        if not valid.any():
            continue
        rows, yc, intersections = rows[valid], yc[valid], intersections[:, valid]
        left = np.maximum(0, np.ceil(np.nanmin(intersections, axis=0) - .5).astype(int))
        right = np.minimum(width - 1, np.ceil(np.nanmax(intersections, axis=0) - .5).astype(int) - 1)
        columns = np.arange(max(0, int(left.min())), min(width - 1, int(right.max())) + 1)
        iy_grid, ix_grid = np.where((columns[None, :] >= left[:, None]) &
                                    (columns[None, :] <= right[:, None]))
        y, x = rows[iy_grid], columns[ix_grid]
        if not len(x):
            continue
        fx = np.clip(inv[0] * (x + .5) + inv[2] * (y + .5) + inv[4] - .5, 0, sw - 1)
        fy = np.clip(inv[1] * (x + .5) + inv[3] * (y + .5) + inv[5] - .5, 0, sh - 1)
        ix, iy = fx.astype(int), fy.astype(int)
        wx, wy = fx - ix, fy - iy
        neighbors = np.stack((source[iy, ix], source[iy, np.minimum(sw - 1, ix + 1)],
                              source[np.minimum(sh - 1, iy + 1), ix],
                              source[np.minimum(sh - 1, iy + 1), np.minimum(sw - 1, ix + 1)]))
        weights = np.stack(((1 - wx) * (1 - wy), wx * (1 - wy), (1 - wx) * wy, wx * wy))
        alpha_weights = neighbors[:, :, 3] * weights
        alpha = alpha_weights.sum(axis=0)
        rgb = (neighbors[:, :, :3] * alpha_weights[:, :, None]).sum(axis=0)
        rgba = np.zeros((len(x), 4), dtype=float)
        rgba[:, :3] = np.divide(rgb, alpha[:, None], out=np.zeros_like(rgb), where=alpha[:, None] > 0)
        rgba[:, 3] = alpha
        output[y, x] = np.clip(np.rint(rgba), 0, 255).astype(np.uint8)
        owners[y, x] += 1
    # The warped transparent canvas border need not coincide with the output
    # rectangle. Verify coverage inside its actual mapped boundary instead.
    boundary = []
    for axis, value, sort_axis, reverse in ((1, 0, 0, False), (0, sw, 1, False),
                                           (1, sh, 0, True), (0, 0, 1, True)):
        ids = np.flatnonzero(source_points[:, axis] == value)
        ids = sorted(ids, key=lambda i: source_points[i, sort_axis], reverse=reverse)
        boundary.extend(target_points[ids])
    missing_y, missing_x = np.where(owners == 0)
    px, py = missing_x + .5, missing_y + .5
    inside = np.zeros(len(px), dtype=bool)
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        if a[1] != b[1]:
            crossing = ((a[1] > py) != (b[1] > py))
            inside ^= crossing & (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])
    interior_holes = int(inside.sum())
    overlaps = int(np.count_nonzero(owners > 1))
    if interior_holes or overlaps:
        raise ValueError(f'Invalid mesh coverage: {interior_holes} interior holes, {overlaps} overlaps')
    return Image.fromarray(output), {'pixels': int(owners.size), 'interiorHoles': 0,
                                    'transparentBorderPixels': len(px), 'overlaps': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    # Legacy source paintings are no longer runtime assets or bundled duplicates.
    # Require explicit inputs/output so this cannot overwrite the hand-edited room.
    parser.add_argument('--room', type=Path, required=True)
    parser.add_argument('--floor', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    mesh, report = build()
    source = source_room(args.room, args.floor, mesh['sourceHeight'])
    image, coverage = render(source, mesh)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True, compress_level=9)
    print(json.dumps({'output': str(args.output), 'size': list(image.size),
                      'bytes': args.output.stat().st_size, 'coverage': coverage, 'mesh': report}, indent=2))


if __name__ == '__main__':
    main()
