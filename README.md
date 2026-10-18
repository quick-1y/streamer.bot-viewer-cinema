# Viewer Cinema — Streamer.bot OBS overlay

A pixel-art isometric cinema. Every viewer Streamer.bot reports as present gets a
unique character that walks in through the door, finds a free seat, turns to the
(blank) screen and sits down. When a viewer leaves, the character stands up and
walks out. A single `В зале: N` counter shows how many are inside.

No build step and no external dependencies. It runs from a local folder in an OBS
Browser Source. The font (Pixelify Sans, OFL) is bundled.

---

## 1. Streamer.bot setup

1. **Servers/Clients → WebSocket Server**
   - Turn on **Auto Start** (and start the server once).
   - Defaults: Address `127.0.0.1`, Port `8080`, Endpoint `/`.
   - **Authentication**: optional. If you turn it on **with "Enforce"**, put the same
     password in the overlay (see below). With Authentication on but *not* enforced,
     the overlay works without a password, because it only uses read-only requests.
2. **Platforms → Twitch → Settings → Present Viewers.** This decides who counts as
   "present":
   - *Live Update* off (default): viewers active in chat within the threshold
     (default 5 min) are present; the list ticks every minute.
   - *Live Update* on: the real Twitch chatters list, refreshed every 1–10 min.
   - Make sure the Present Viewers timer isn't disabled.
3. Twitch must be connected in Streamer.bot (broadcaster account).

## 2. OBS setup

Sources → **+** → **Browser**

- **Local file**: ☑, choose `index.html` from this folder
  (or untick it and use a URL like `file:///C:/overlays/viewer-cinema/index.html?bg=transparent`).
- **Width 1920, Height 1080**. The art scales crisply at 960×540, 1920×1080 and 3840×2160.
- Leave **"Shutdown source when not visible"** off, so the audience persists between scenes.
- **"Refresh browser when scene becomes active"**: leave it off. If it's on, the
  viewers walk in again every time.

## 3. Configuration

Edit `config.js` once, **or** add URL parameters per source (URL parameters win):

| Parameter | Default | Meaning |
|---|---|---|
| `host` / `port` / `endpoint` | `127.0.0.1` / `8080` / `/` | Streamer.bot WebSocket Server address |
| `secure=1` | off | use `wss://` (remote setups behind TLS) |
| `password=` | empty | WebSocket password (needed only when *Enforce* is on) |
| `bg=` | `dark` | `dark`, `transparent`, or a colour such as `%23101010` |
| `grace=` | `90` | seconds a viewer may be missing from the list before walking out (lists flicker) |
| `poll=` | `60` | safety re-sync every N seconds; `0` = rely on events only |
| `seats=` | `60` | seat cap (the hall has 60 seats) |
| `initial=` | `walk` | `walk`: viewers present at load walk in. `seated`: they're already seated |
| `hideBroadcaster=1` | off | don't seat the broadcaster |
| `ignore=a,b,c` | common bots | accounts never seated (replaces the list in `config.js`) |
| `counter=0` | on | hide the counter |
| `demo=1` | off | simulated audience, no Streamer.bot needed (preview / testing) |
| `debug=1` | off | log to the browser console only; nothing extra is drawn |

Example: `index.html?port=8080&password=hunter2&bg=transparent&grace=120`

Name colours: mods green, VIPs pink, subscribers cyan, the broadcaster gold, everyone else cream.

## 4. How it talks to Streamer.bot

The protocol was verified against the official `@streamerbot/client` source and
docs.streamer.bot. It was then exercised against a protocol-faithful mock server
(`tests/`); it has not yet been run against a live Streamer.bot instance.

1. Connect to `ws://host:port/endpoint` → server sends `{"request":"Hello", "info":{…}, "authentication":{salt, challenge}?}`.
2. If a challenge is present and a password is set:
   `authentication = base64(sha256( base64(sha256(password + salt)) + challenge ))` →
   `{"request":"Authenticate","id":…,"authentication":…}`.
3. `{"request":"Subscribe","id":…,"events":{"Twitch":["PresentViewers"]}}`
4. `{"request":"GetActiveViewers","id":…}` → `{"status":"ok","count":N,"viewers":[{"login","display","role","subscribed",…}]}`

The list is re-fetched on connect, whenever Streamer.bot fires **Twitch.PresentViewers**,
and by a slow safety poll (default 60 s, skipped if an event refresh just happened).
That is at most one small local request a minute.

**Reliability behaviour**
- Reconnects with exponential backoff (1 s → 30 s cap, with jitter). It never runs a tight loop.
- A wrong password waits 60 s between attempts. The console says why.
- If two requests in a row go unanswered, the socket is treated as half-open and rebuilt.
- Malformed JSON, unknown frames and invalid responses are ignored. A bad reply never empties the hall.
- While disconnected, the audience stays on screen. It reconciles when the connection returns.

## 5. Behaviour details

- **Stable identity.** Appearance (skin, hair, clothes, hats, glasses, popcorn…) is derived
  from the login, so the same viewer always looks the same. Seats are remembered,
  so a returning viewer goes back to their seat when it's free.
- **Seat choice.** Middle rows and seats near the centre are preferred. The hall fills
  spread out, which keeps names readable.
- **No duplicates or double booking.** One character per login and one occupant per seat.
  A seat stays reserved until its character has actually left through the door.
- **Simultaneous arrivals** queue at the door and enter one by one, faster when a crowd is
  waiting. Walkers keep their distance and pass on the right in aisles.
- **Leaving mid-walk / returning mid-exit.** The character turns around in place; there is
  no teleporting.
- **Full hall.** Extra viewers wait outside, unseen and not counted. They walk in as soon as
  a seat frees up.
- **Long streams.** One `requestAnimationFrame` loop, frame-rate independent, with `dt`
  clamped. Sprites are cached per character and freed on exit. Seat memory is capped
  at 500 logins. Timers and the socket are cleaned up on page hide.

## 6. Files

```
index.html               entry point (classic scripts → works from file:// in OBS)
config.js                deployment defaults
css/overlay.css          layout + counter
fonts/                   Pixelify Sans (SIL OFL)
js/util.js               hashing, PRNG, SHA-256 (WebCrypto + pure-JS fallback)
js/streamerbot-client.js WebSocket, Hello/auth, requests, events, reconnect
js/viewer-sync.js        GetActiveViewers polling policy + payload validation
js/layout.js             world geometry, seats, walking routes, projection
js/seats.js              seat allocation
js/audience.js           viewer state: diffing, grace, door queue, waiting line
js/actors.js             character movement / sitting state machine
js/characters.js         procedural pixel-art characters
js/scene.js              static cinema art + light sources
js/renderer.js           frame composition, depth sorting, name labels, counter
js/demo.js               ?demo=1 simulation
tests/                   mock Streamer.bot server + end-to-end scenarios
```

## 7. Testing

```
node tests/mock-streamerbot.js --port 8080 [--password secret --enforce]
# open index.html?port=8080 and drive it:
curl "http://127.0.0.1:8080/set?viewers=alice,bob,carol"
curl "http://127.0.0.1:8080/event"        # fire Twitch.PresentViewers
curl "http://127.0.0.1:8080/drop"         # kill connections
curl "http://127.0.0.1:8080/malformed"    # junk frames + bad response

python3 tests/run_tests.py                # full automated suite (needs Playwright + Chromium)
```

The suite covers the following:
- Empty and pre-populated starts.
- Single and 12-at-once joins.
- Leave with grace, and leave-then-rejoin (mid-exit and after exit).
- Connection drop, and a server restart with backoff.
- Malformed data.
- Capacity overflow with a waiting line.
- Authentication: correct and wrong password, Enforce on and off.
- A half-open socket.
- A 75-second churn run with ~140 visitors, checking heap, queues and frame rate.

### Quick check with real Streamer.bot
Open `index.html?debug=1` in Chrome, press F12 → Console. You should see `state → ready`
and `viewers (connected): N`. Compare N with the viewer list in Streamer.bot's Viewers tab.
After the next Present Viewers tick (≤ 1 min by default) you should see `viewers (PresentViewers): N`.
