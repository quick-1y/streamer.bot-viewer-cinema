# Cinema artwork

Bundled, generated illustrations used by the overlay; no remote image requests at runtime.

- `cinema-room-aligned.png`: displayed room, mathematically rectified from the original illustration using the shared floor axes. Its old rugs have been removed; the two rug textures are sampled separately onto exact floor rectangles. This is a bundled PNG so OBS local-file startup requires no pixel readback or authoring dependencies.
- `cinema-room.png`: original transparent cutaway interior, illuminated CINEMA facade, wall lights and shadows. No people or seats are baked into this image.
- `cinema-floor.png`: authoring input for wooden floor restoration, clipped to the old carpet footprints. Existing rug textures are resampled onto exact parallelograms in the shared floor plane.
- `cinema-chair.png`: transparent velvet chair, sampled into a cached seat layer with a floor contact shadow.
- `viewers.png`, `viewers-extra.png`: two transparent sheets, each with four character rows and three pose columns (front, walking back, seated).

`js/art.js` contains the source crop rectangles, native canvas caches, facade occlusion mask, lighting positions and stable wardrobe variants. The composition renders in 1920×1080. Movement uses logical coordinates from `js/layout.js`; its `FLOOR` basis (three reference corners), `RUGS` rectangles, `ART_GEOMETRY` anchors, door threshold, fence endpoints and `seatPoint` row calibration follow this room artwork. When replacing an image, update that calibration and inspect both seated and walking viewers, including the entrance and a full hall.

Floor calibration in source-image pixels is `P(x,y) = (879,274) + (x/19.8)·(639,344) + (y/17.4)·(-645,313)`. The three reference corners are `(879,274)`, `(1518,618)` and `(873,931)`. Fence runs keep one world coordinate constant; rugs are world rectangles, and all six seat rows use constant world y. Do not fit those objects independently to the old painted rug edges. The source door anchors and occlusion polygons first follow `RoomWarp` into the corrected illustration; the inverse floor matrix then converts the threshold into movement coordinates.

The original illustration contained incompatible angles (screen top about 29°, screen bottom 31°, entrance beam sections 31–33.4°). `tools/build_room_mesh.py` surveys these visible edges and builds a constrained piecewise-affine correction to the common axes. `tools/bake_room_art.py` restores the old rug footprints and bakes this correction with premultiplied bilinear sampling, avoiding triangle seams on the blank screen. Textures, signage and lighting come from the original artwork.

Rebuild authoring assets with Python, NumPy, SciPy and Pillow (these are not runtime requirements):

```sh
python tools/build_room_mesh.py
python tools/bake_room_art.py
python tests/room_mesh.py
```

After rebaking, run the browser suite as well: it measures the actual corrected wall pixels, checks the original artwork as a negative example, and exercises the transformed door in both directions.
