# Cinema artwork

Bundled, generated illustrations used by the overlay; no remote image requests at runtime.

- `cinema-room.png`: transparent cutaway interior, illuminated CINEMA facade, wall lights and shadows. No people or seats are baked into this image.
- `cinema-chair.png`: transparent velvet chair, sampled into a cached seat layer with a floor contact shadow.
- `viewers.png`, `viewers-extra.png`: two transparent sheets, each with four character rows and three pose columns (front, walking back, seated).

`js/art.js` contains the source crop rectangles, native canvas caches, facade occlusion mask, lighting positions and stable wardrobe variants. The composition renders in 1920×1080. Movement uses logical coordinates from `js/layout.js`; its projection is calibrated against this room artwork. When replacing an image, update that calibration and inspect both seated and walking viewers, including the entrance and a full hall.
