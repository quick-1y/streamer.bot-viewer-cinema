# Cinema artwork

Bundled, generated illustrations used by the overlay; no remote image requests at runtime.

- `cinema-room.png`: transparent cutaway interior, illuminated CINEMA facade, wall lights and shadows. No people or seats are baked into this image.
- `cinema-floor.png`: clean wooden floor restoration, clipped to the old carpet footprints. Existing rug textures are resampled onto exact parallelograms in the shared floor plane.
- `cinema-chair.png`: transparent velvet chair, sampled into a cached seat layer with a floor contact shadow.
- `viewers.png`, `viewers-extra.png`: two transparent sheets, each with four character rows and three pose columns (front, walking back, seated).

`js/art.js` contains the source crop rectangles, native canvas caches, facade occlusion mask, lighting positions and stable wardrobe variants. The composition renders in 1920×1080. Movement uses logical coordinates from `js/layout.js`; its `FLOOR` basis (three measured corners), `RUGS` rectangles, `ART_GEOMETRY` anchors, door threshold, fence endpoints and `seatPoint` row calibration follow this room artwork. When replacing an image, update that calibration and inspect both seated and walking viewers, including the entrance and a full hall.

Floor calibration in source-image pixels is `P(x,y) = (879,274) + (x/19.8)·(639,344) + (y/17.4)·(-645,313)`. The three measured corners are `(879,274)`, `(1518,618)` and `(873,931)`. Fence runs keep one world coordinate constant; rugs are world rectangles, and all six seat rows use constant world y. Do not fit those objects independently to the old painted rug edges. The inverse of this same affine matrix converts the existing door anchors into movement coordinates.
