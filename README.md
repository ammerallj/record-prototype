# Record prototype skill

A Claude skill that records smooth, portfolio-quality demo videos of a running web prototype from a shot list.

- **Frame-stepped**: the page runs on the recorder's own clock and every frame is rendered before it is filmed, so the video never stutters, however heavy the page
- **Shot lists, not screen recordings**: interactions (hover, click, type, scroll, drag, keys) and camera moves (zoom, pan, follow the cursor, slow drift) are scripted, so every take is identical and re-renders against each new version of the prototype
- **Any stage**: rough experiments can be filmed by getting the app into state off camera and scripting around what isn't built yet
- **Treatments**: clean, in a browser, floating, or dark stage, with control over background, shadow, browser bar, cursor and fades
- **Outputs**: MP4, ProRes MOV (with transparency), WebM, GIF, and a poster PNG

Name a flow and it records straight away. Name none, and it reads the prototype (docs, code and the running page), proposes the flows worth filming, and asks once.

## Install

Download `record-prototype.skill` from the latest release and open it, or copy the `record-prototype` folder to `~/.claude/skills/`. The first recording installs its two dependencies (puppeteer-core and ffmpeg-static) with npm.

Requires Node 18+ and Google Chrome (default macOS path; set `"chrome"` in a shot list to use another).

## Use

Start your prototype's dev server, then either:

- **Describe the flow** and it records straight away: "record opening the filter menu, picking 'Recent', then clicking the first result, in a browser frame with a directed camera".
- **Type `/record-prototype` on its own** and it reads your prototype, proposes up to four flows worth filming, and asks you once which ones and how to frame them.

Every option is listed in `record-prototype/references/options.md`; a worked shot list is in `record-prototype/examples/`.
