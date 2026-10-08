# Options menu

Every setting, its choices, and the default. Anything left out of a shot list takes the default.

## Camera movements (steps in `sequence`)

| Move | Step | What it does | Default |
|---|---|---|---|
| Static | *(no camera step)* | Full frame, no movement | ✓ |
| Zoom in | `{ "camera": "zoom", "to": target, "scale": 1.5, "ms": 900 }` | Push in on a target | scale 1.5, 900ms |
| Zoom out / reset | `{ "camera": "reset", "ms": 900 }` | Back to the full frame | 900ms |
| Pan | `{ "camera": "pan", "to": target, "ms": 900 }` | Slide to a target at the current zoom | 900ms |
| Follow cursor | `{ "camera": "follow", "scale": 1.6, "lag": 300 }` | Zoomed in, trailing the cursor smoothly until the next camera step | scale 1.6, lag 300ms |
| Slow drift (Ken Burns) | `{ "camera": "drift", "scale": 1.05, "ms": 6000 }` | A slow, linear push-in for holds and rest shots | +5% |

All take `"ease"`: `inOut` (default), `out`, `in`, `linear`, and `"wait": true` to hold the
sequence until the move ends. The frame never shows past the page's edge. Zooms up to 2× stay
fully sharp at the default output scale.

## Interaction steps

| Step | Example |
|---|---|
| Wait / hold | `{ "wait": 1500 }` |
| Move the cursor | `{ "move": target, "ms": 1000 }` |
| Hover (move + hold) | `{ "hover": target, "ms": 1000, "hold": 1500 }` |
| Click (moves there first) | `{ "click": target }` · in place: `{ "click": true }` |
| Double-click | `{ "doubleClick": target }` |
| Tap (touch mode; same as click) | `{ "tap": target, "lead": 250, "hold": 500 }` · `"count": 2` for a double tap |
| Long press | `{ "longPress": target, "hold": 700 }` |
| Swipe | `{ "swipe": { "from": target, "to": target, "ms": 450 } }` or `{ "swipe": { "direction": "up", "distance": 300, "at": target } }` |
| Type (human cadence) | `{ "type": "text", "speed": 1 }` · into a field: add `"into": target` |
| Key | `{ "key": "Enter", "hold": 500 }` — Enter, Escape, Tab, Backspace, Delete, Space, Arrow keys |
| Scroll / wheel | `{ "scroll": { "dy": 400, "dx": 0 }, "ms": 800, "at": target }` |
| Drag | `{ "drag": { "from": target, "to": target, "ms": 900 } }` |
| Wait for something | `{ "waitFor": ".selector", "timeout": 5000 }` |
| Cursor on/off | `{ "cursor": "hide" }` / `{ "cursor": "show" }` |
| Jump cursor (no glide) | `{ "jump": target }` |
| Still frame (PNG) | `{ "still": "name" }` — current frame, no cursor, on the stage |
| Run JS in the page | `{ "js": "document.querySelector('x').focus()" }` |

## FPS

`"fps"`: **60** (default, smoothest UI motion) · 30 (smaller files, social) · 24 (filmic) · any number.

## Output

`"output"`:

| Setting | Choices | Default |
|---|---|---|
| `formats` | `mp4` (H.264, plays everywhere) · `mov` (ProRes — for editing in After Effects / Premiere / Final Cut; ProRes 4444 with alpha on a transparent background) · `webm` (VP9, for the web; with alpha on transparent) · `gif` (1200px wide, ≤30fps, for quick previews) | `["mp4"]` |
| `poster` | first frame, without the cursor, as `<name>-poster.png` | `true` |
| `scale` | 2 (retina) · 1 | 2 |
| `fadeIn` / `fadeOut` | ms; fades the window in from / out to the background | 0 |
| `dir` | where files are saved | `~/Movies/Prototype Recordings` |
| `keepFrames` | keep the raw frames | `false` |

## Treatments (presets)

`"treatment"` sets the window framing in one word; any `frame` setting given alongside overrides it.

| Treatment | Equivalent `frame` |
|---|---|
| `clean` (default) | no bar, soft shadow, white |
| `browser` | `browser: "browser"`, medium shadow, `#f4f4f5` (add `address`) |
| `floating` | `browser: "minimal"`, float shadow, padding 160, soft lilac-to-pink gradient |
| `dark` | `#111113`, a faint light rim and a deep shadow |

## Window and stage

`"frame"`:

| Setting | Choices | Default |
|---|---|---|
| `browser` | `none` (just the app, rounded window) · `minimal` (traffic lights bar) · `browser` (traffic lights + address field) | `none` |
| `address` | text in the address field when `browser` | `""` |
| `background` | any hex/CSS colour · CSS gradient (`"linear-gradient(135deg,#f5f3ff,#fdf2f8)"`) · path to an image · `transparent` (needs `mov` or `webm`) | `#ffffff` |
| `shadow` | `none` · `hairline` · `soft` (layered, the Meta-video look) · `medium` · `strong` · `float` (lifted, offset downward) · any CSS `box-shadow` | `soft` |
| `radius` | window corner radius, px | 12 |
| `padding` | stage margin around the window, px (raise for `strong` / `float`) | 120 |
| `device` | `iphone`: draws an iPhone body around the screen (rounded bezel, side buttons, Dynamic Island over the page). Use with a phone `viewport` | none |
| `color` | with `device: "iphone"`: `black` · `gray` (dark grey) · `white` | `black` |
| `island` | with `device: "iphone"`: `false` hides the Dynamic Island | `true` |

## Page

| Setting | Meaning | Default |
|---|---|---|
| `url` | the running prototype | `http://localhost:5173/` |
| `device` | `iphone` (390×844, touch, iPhone body, radius 47) · `mobile` (390×844, touch, radius 44) · `tablet` (820×1180, touch) — shorthand; anything set alongside wins | none |
| `touch` | `true`: iPhone user agent, touch events instead of a mouse, a finger dot instead of an arrow. Desktop steps map over: click→tap, drag→finger drag, scroll→finger swipe (opposite direction), hover→wait. `userAgent` overrides the UA | `false` |
| `viewport` | `{ width, height }` of the app window in CSS px — 1440×900 laptop · 1280×800 · 1920×1080 · 390×844 phone | 1440×900 |
| `colorScheme` | `light` · `dark` | `light` |
| `settle` | ms the page runs before anything happens (cover any loading screen) | 1500 |
| `hide` | selectors hidden for the film, e.g. a debug or lab bar | `[]` |
| `css` | extra CSS injected for the film | `""` |
| `intercept` | `[{ "match": "/src/data/mock.ts", "find": "regex", "replace": "text" }]` — rewrite a source file as it loads, for film-only tweaks | `[]` |

## Cursor

`"cursor"`: `show` (true) · `start` (target, default `{x: .78, y: .82}`) · `size` (1) ·
`click`: `press` (cursor dips, default) · `ripple` (expanding ring) · `none`.

### Touch (`"device": "mobile"` or `"touch": true`)

The cursor becomes a 44px translucent finger dot (`cursor.size` scales it). It appears when the
finger lands (90ms ramp), follows a drag or swipe, and fades 260ms after it lifts; between touches
nothing is on screen. A tap lands on its target with no glide: `lead` (default 250ms) is the beat
before touch-down. `cursor.click: "ripple"` adds a ring on each tap. The same shot list therefore
re-renders as mobile by adding `"device": "mobile"`; retarget only what the narrow layout moves
(off-screen elements are not scrolled into view). The app sees real touch events (touchstart/end,
pointer events with `pointerType: "touch"`, then a click), so hover-only UI behaves as on a phone.
