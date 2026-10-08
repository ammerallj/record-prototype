---
name: record-prototype
description: Record a smooth, portfolio-quality demo video (MP4, MOV, WebM or GIF) of a running web prototype from a shot list — a sequence of interactions (hover, click, type, scroll, drag, keys) plus camera moves (zoom, pan, follow the cursor, slow drift), set into a window on a stage with a chosen background, shadow and optional browser bar, with a poster PNG. Frame-stepped at a fixed fps, so it never stutters however heavy the page. Works on experimental prototypes at any stage, rough or polished, because the script films around what isn't built yet, and the same shot list re-renders against each iteration for matched before/after or process clips. Given a sequence it records straight away; given none, it reads the prototype (docs, code and the running page), proposes the flows worth filming, and asks once. Use whenever the user wants to record, film, capture or export a demo, walkthrough, showcase, screen recording, video, GIF or still of a prototype, a case-study / portfolio clip, footage of how an interaction evolved across versions, or asks which flows of a prototype are worth recording.
---

# Record a prototype

A shot list goes in; a video comes out.

**Why a script, not a screen recording.** The shot list is separate from the prototype, so:

- **Any stage.** A half-working experiment can be filmed: `setup` gets it into state off camera
  and the sequence only touches what works. No faking a smooth live demo.
- **Every iteration.** The same shot list re-renders against each new version, giving matched
  clips of one interaction as it evolved — process, not just the final state. Encourage
  keeping each prototype's shot lists (the recorder saves one beside every video) and
  re-rendering at milestones; name takes by stage or date (`"name": "open-card-m2"`).
- **Walkthrough or showcase from one script.** Full frame with no camera for a walkthrough;
  camera moves, fades and a hero framing for a showcase. Same sequence, different settings.
- **Repeatable and exact.** Every take is identical; changing one beat is a one-line edit.

The recorder (`record.mjs`, next to this file) drives the installed Chrome headlessly with its own clock: every frame advances time exactly 1/fps
and is then screenshotted, so motion is perfectly even. The camera is a crop of the page,
rendered at a higher density so zooms stay sharp. ffmpeg sets the frames into a window on a
stage.

## 1. On invoke: what to film

The one thing that cannot be defaulted is **the sequence**: what happens on screen, in order
(e.g. "rest on the page, hover the Pricing card, click the search box, type 'summer sale', hold on
the results"). Everything else has a default. The sequence comes from one of two places:

**A. The user names it → record without asking.** Take the sequence, plus any treatment,
camera or output it names; everything unnamed takes its default (below). Go straight to step 2.
Do not ask to confirm defaults.

**B. The user doesn't name it** (invoked bare, "record the main flows", "what should I film?",
or too vague to script) → **read the prototype, propose flows, then ask once.**

### Finding the flows (path B)

Work out what is worth filming from the prototype itself, quickly (a few minutes, not an audit):

1. **What it says it does.** Read the project's own account: README, CLAUDE.md, and any spec,
   brief, interaction model, decision log or interaction checklist in `docs/`. These name the
   intended flows and which one is the point of the prototype.
2. **What is actually wired up.** Skim the app's entry, top-level state and event handlers
   (screens, routes, what Enter/click/hover change). Propose only flows that work today; a doc
   describing a flow does not mean it is built. A flow that is half-built can still be filmed if
   `setup` gets around the missing part — say so.
3. **What it looks like.** Open the running prototype (built-in browser, `read_page` plus one
   screenshot) to confirm entry points, the visible labels a shot list will target, and the
   state it opens in (a loading screen means a longer `settle`).

Choose **up to four** candidate flows, ranked: the prototype's core idea first, then its
signature interaction or motion, then supporting flows. Each candidate is a short name, its
beats in one line, an estimated length (aim for 6–20s), and what it demonstrates. For example:

> **Search and open a result** — rest → click the search box → type "summer sale" → matching cards
> rise, "Open Summer Sale" offered · ~10s · the core idea: a query finds its result

### Asking (path B)

Start with what the skill does, in two or three plain lines, for example:

> This films your prototype from a shot list: I replay the interactions in a hidden browser frame
> by frame, so the video is perfectly smooth, repeatable, and re-renders against any later
> version. You get an MP4 (or MOV/WebM/GIF) set in a window on a stage, plus a poster PNG.

Then ask everything in **one** `AskUserQuestion` call — the flows first, then the framing, each
framing question with the default first and marked (Recommended):

| Question | Options (default first) |
|---|---|
| **Flows** (multi-select): which to film | the candidates found above, name + one-line beats; "Other" lets the user describe their own |
| **Treatment**: how the window is framed | Clean (rounded window, soft shadow, white) · In a browser (traffic lights + address bar) · Floating (minimal bar, lifted shadow, soft gradient) · Dark stage (near-black, rim + deep shadow) |
| **Camera**: what the frame does | Still (full frame) · Directed (push in on the key moment, pull back, follow while typing) · Follow the cursor (zoomed in throughout) · Slow drift (gentle push-in, for hero loops) |
| **Output**: what you get | MP4 + poster PNG · MP4 + GIF preview · MOV for editing (ProRes) · Transparent MOV/WebM (to place on any layout) |

Purpose (showcase vs walkthrough) is inferred: showcase by default (fades, tighter holds);
walkthrough when the user says walkthrough, demo for a review, or picks several flows that
chain into one story. If the user has a page or clips showing the treatments (e.g. an earlier
comparison artifact), link it so they can see the framings before choosing.
Never ask a second round: anything unanswered takes its default. Mention in one line that
frame rate, window size, dark mode, cursor style and more are adjustable
(`references/options.md`) — do not list them.

Several flows → one clip each, same framing, named `<prototype>-<flow>` (e.g.
`demo-search`), so they sit together as a set.

**Defaults:** treatment clean · camera still · 60fps · MP4 + poster PNG · 1440×900 window ·
light scheme · cursor shown, dips on click · no fades (showcase: 400ms in / 600ms out).

**Mapping the answers:** treatment → `"treatment": "clean" | "browser" | "floating" | "dark"`
(set `frame.address` for browser, e.g. the product's domain). Camera → camera steps placed
around the beats: *Directed* = `zoom` (≈1.5×) on the hero element as its beat starts, `reset`
after it, `follow` (≈1.4×) while typing, `reset` with `"wait": true` before the end; *Follow* =
one `follow` at the start; *Drift* = one `drift` (≈1.07×) spanning the take. Output → `formats`
(transparent: `"background": "transparent"`, `formats: ["mov", "webm"]`).

## 2. Write the shot list

Translate the request into a JSON shot list (format below). Find targets by reading the real
page (the built-in browser's `read_page`, or the source) — prefer a stable selector plus
visible text, e.g. `{ "selector": ".card", "text": "Pricing" }`, over coordinates.

Echo the shot list back as a short numbered list (one line per beat, camera noted) and record
straight away unless something is ambiguous.

**Rehearse first.** Before every render, run the shot list with `--rehearse`: it plays the
whole sequence on the film clock without filming or encoding (about real time, against ~8–10×
for a render) and fails on the exact step whose target is missing. Fix and rehearse again
until it passes; only then render. This matters most for proposed flows, whose targets were
inferred.

Save it in the scratchpad (not the project). The recorder copies it next to the video so it can
be re-run.

## 3. Record

```bash
cd ~/.claude/skills/record-prototype
[ -d node_modules ] || npm install --silent     # once: puppeteer-core + ffmpeg-static
node record.mjs --rehearse /path/to/shot-list.json   # seconds: checks every step
node record.mjs /path/to/shot-list.json              # minutes: films and encodes
```

The dev server must already be running (start it with the project's preview config). Expect
roughly 10–15× real time without camera moves (a 10s clip in about 2 minutes) and up to ~30×
with them, since camera shots are filmed at up to 4× density and cropped afterwards (a 15s
follow-cam clip took about 7 minutes).

## 4. Review before handing over

Make a contact sheet and look at it — never deliver a video you have not looked at:

```bash
FF=$(node -e "import('ffmpeg-static').then(m=>console.log(m.default))")
$FF -y -loglevel error -i OUT.mp4 -vf "fps=1.5,scale=560:-1,tile=4x4" -frames:v 1 sheet.jpg
```

Check: the opening frame is clean (no loader mid-fade unless wanted — raise `settle`), hovers
have settled before the cut, nothing important leaves the frame during a zoom, typing finishes,
the ending holds long enough. Fix the shot list and re-run rather than explaining defects away.

Send the video and poster with `SendUserFile`, with a one-line caption of length and size.

## Shot list format

```json
{
  "name": "open-and-search",
  "url": "http://localhost:5173/",
  "settle": 3500,
  "hide": [".debug-bar"],
  "frame": { "background": "#ffffff", "shadow": "soft", "browser": "none" },
  "output": { "formats": ["mp4"], "fadeOut": 500 },
  "setup": [ ],
  "sequence": [
    { "wait": 1500 },
    { "camera": "zoom", "to": { "selector": ".card", "text": "Pricing" }, "scale": 1.5, "ms": 1000 },
    { "hover": { "selector": ".card", "text": "Pricing", "offset": [8, 18] }, "ms": 1200, "hold": 2500 },
    { "camera": "reset", "ms": 900 },
    { "click": ".search input" },
    { "type": "summer sale" },
    { "key": "Enter", "hold": 2500 }
  ]
}
```

`setup` runs the same steps off camera (the clock runs, nothing is filmed): use it to get the
app into its opening state. Follow any state-changing click in `setup` with `{ "waitFor": selector }` so a
missed click fails at once instead of halfway through the film. `sequence` is what is filmed. Every step may carry a `"note"` for
humans. All steps and settings: `references/options.md`. A worked example:
`examples/demo-open-and-search.json`.

**Targets** (anything a step points at): a CSS selector string; `{ "selector", "text", "inner",
"index", "offset": [dx, dy] }` (text picks the most specific element containing it, `inner`
drills into a child); or `{ "x", "y" }` where 0–1 is a fraction of the viewport, larger is px.
Targets are re-aimed every frame, so the cursor lands on things that drift.

## Rules

- **Recording stays out of the app.** Never add recording switches, query params or demo-only
  code to the prototype. Film-only changes go through `hide`, `css`, `intercept` (rewrite a
  source file as it loads) or `setup` steps — and if a change might be wanted in the prototype
  itself, ask whether it is for the film only.
- Camera moves start and run alongside the following steps; add `"wait": true` to hold the
  sequence until the move finishes.
- Pages that use `IntersectionObserver`, workers or network timing still run on real time;
  everything driven by timers, rAF, CSS/Web Animations, Motion (framer) runs on the film clock.
- Mobile: add `"device": "mobile"` (or `"touch": true` with a `viewport`) for a finger dot and real
  touch input; `tap`, `swipe` and `longPress` steps are in `references/options.md`. A desktop shot
  list re-renders as mobile with that one line, then fix any targets the narrow layout moves.
- Requires Google Chrome at the default macOS path (override with `"chrome"`) and the network
  for any remote images the page loads.
