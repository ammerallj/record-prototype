#!/usr/bin/env node
// Frame-stepped recorder for prototype demos.
//
//   node record.mjs <shot-list.json>
//
// Time on the page is ours: a virtual clock replaces performance.now, Date, rAF and timers,
// and every Web Animation (CSS transitions and keyframes) is paused and set to that clock.
// Each video frame advances the clock exactly 1/fps, then screenshots, so however long Chrome
// takes to paint, nothing in the video can stall or skip. The camera is a crop of the page,
// rendered at a higher pixel density so a zoom stays sharp. The frames are then set into a
// window on a stage (background, shadow, optional browser bar) by ffmpeg.
// See SKILL.md for the workflow and references/options.md for every setting.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import ffmpeg from 'ffmpeg-static'

const DEFAULTS = {
  name: null,
  url: 'http://localhost:5173/',
  viewport: { width: 1440, height: 900 },
  fps: 60,
  colorScheme: 'light',
  settle: 1500,
  hide: [],
  css: '',
  intercept: [],
  frame: { background: '#ffffff', shadow: 'soft', radius: 12, padding: 120, browser: 'none', address: '', device: null, color: 'black', island: true },
  touch: false,
  userAgent: null,
  cursor: { show: true, start: { x: 0.78, y: 0.82 }, size: 1, click: 'press' },
  output: { dir: '~/Movies/Prototype Recordings', formats: ['mp4'], scale: 2, poster: true, fadeIn: 0, fadeOut: 0, keepFrames: false },
  setup: [],
  sequence: [],
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}

const SHADOWS = {
  none: 'none',
  hairline: '0 0 0 0.5px rgba(0,0,0,.18)',
  soft: '0 0 0 0.5px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.06), 0 12px 28px rgba(0,0,0,.10), 0 40px 80px rgba(0,0,0,.14)',
  medium: '0 0 0 0.5px rgba(0,0,0,.20), 0 4px 10px rgba(0,0,0,.08), 0 20px 44px rgba(0,0,0,.16), 0 56px 110px rgba(0,0,0,.20)',
  strong: '0 0 0 0.5px rgba(0,0,0,.22), 0 6px 14px rgba(0,0,0,.12), 0 28px 60px rgba(0,0,0,.24), 0 70px 140px rgba(0,0,0,.30)',
  float: '0 0 0 0.5px rgba(0,0,0,.12), 0 50px 100px -20px rgba(0,0,0,.25), 0 30px 60px -30px rgba(0,0,0,.30)',
}
// "device" shorthand: a viewport, touch input (finger dot instead of an arrow), a phone-shaped window
const DEVICES = {
  mobile: { viewport: { width: 390, height: 844 }, touch: true, frame: { radius: 44 } },
  iphone: { viewport: { width: 390, height: 844 }, touch: true, frame: { device: 'iphone', radius: 47 } },
  tablet: { viewport: { width: 820, height: 1180 }, touch: true, frame: { radius: 28 } },
}
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const BAR = { none: 0, minimal: 36, browser: 44 }

// named framings ("treatment" in a shot list); any frame setting given alongside wins
const TREATMENTS = {
  clean: {},
  browser: { browser: 'browser', shadow: 'medium', background: '#f4f4f5' },
  floating: { browser: 'minimal', shadow: 'float', padding: 160, background: 'linear-gradient(135deg,#eef0ff 0%,#fdf0f7 100%)' },
  dark: { background: '#111113', shadow: '0 0 0 1px rgba(255,255,255,.10), 0 40px 100px rgba(0,0,0,.6)' },
}

const KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
}

const CLOCK = `(() => {
  let now = 0
  const base = Date.now(), RealDate = Date
  performance.now = () => now
  window.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(base + now) }
    static now() { return base + now }
  }
  let raf = [], timers = new Map(), id = 1
  window.requestAnimationFrame = (cb) => { const i = id++; raf.push({ i, cb }); return i }
  window.cancelAnimationFrame = (i) => { raf = raf.filter((r) => r.i !== i) }
  window.setTimeout = (cb, ms = 0, ...a) => { const i = id++; timers.set(i, { t: now + Math.max(0, +ms || 0), cb: () => (typeof cb === 'function' ? cb(...a) : 0) }); return i }
  window.clearTimeout = (i) => timers.delete(i)
  window.setInterval = (cb, ms = 0, ...a) => {
    const i = id++, step = Math.max(1, +ms || 0)
    const tick = () => { timers.set(i, { t: now + step, cb: tick }); cb(...a) }
    timers.set(i, { t: now + step, cb: tick }); return i
  }
  window.clearInterval = (i) => timers.delete(i)
  const started = new WeakMap(), done = new WeakSet()
  window.__advance = (dt) => {
    const target = now + dt
    for (;;) {
      let next = null
      for (const [i, t] of timers) if (t.t <= target && (!next || t.t < next[1].t)) next = [i, t]
      if (!next) break
      timers.delete(next[0]); now = next[1].t
      try { next[1].cb() } catch (e) { console.error(e) }
    }
    now = target
    const q = raf; raf = []
    for (const r of q) { try { r.cb(now) } catch (e) { console.error(e) } }
    void document.body.offsetWidth
    for (const a of document.getAnimations()) {
      if (done.has(a)) continue
      if (!started.has(a)) { started.set(a, now - (a.currentTime || 0)); a.pause() }
      const t = now - started.get(a), end = a.effect ? a.effect.getComputedTiming().endTime : Infinity
      // a paused animation never finishes on its own, and whatever awaits its end (motion's
      // onAnimationComplete, a finished promise, animationend) would wait forever
      if (t >= end) { done.add(a); a.finish() } else a.currentTime = t
    }
  }
  // targets: a selector, {selector, text, inner, index, offset}, or {x, y} (0–1 is a fraction of the viewport)
  window.__target = (t) => {
    if (Array.isArray(t)) t = { x: t[0], y: t[1] }
    if (typeof t === 'string') t = { selector: t }
    let x, y
    if (t.selector || t.text) {
      let els = [...document.querySelectorAll(t.selector || 'body *')]
      if (t.text) els = els.filter((e) => e.textContent.includes(t.text)).sort((a, b) => a.textContent.length - b.textContent.length)
      let el = els[t.index || 0]
      if (el && t.inner) el = el.querySelector(t.inner)
      if (!el) return null
      const r = el.getBoundingClientRect()
      x = r.x + r.width / 2; y = r.y + r.height / 2
    } else {
      x = t.x <= 1 ? t.x * innerWidth : t.x
      y = t.y <= 1 ? t.y * innerHeight : t.y
    }
    const [dx, dy] = t.offset || [0, 0]
    return [x + dx, y + dy]
  }
})()`

const CURSOR = (size, touch) => `(() => {
  const c = document.createElement('div')
  if (${touch}) {
    const d = 44 * ${size}
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: d + 'px', height: d + 'px', borderRadius: '50%', zIndex: '2147483647', pointerEvents: 'none',
      background: 'rgba(20,20,20,.22)', border: '2px solid rgba(255,255,255,.92)', boxSizing: 'border-box',
      boxShadow: '0 0 0 1px rgba(0,0,0,.12), 0 4px 14px rgba(0,0,0,.18)' })
    document.documentElement.appendChild(c)
    window.__cursor = (x, y, s, show, a) => {
      c.style.display = show ? '' : 'none'
      c.style.opacity = a
      c.style.transform = 'translate(' + (x - d / 2) + 'px, ' + (y - d / 2) + 'px) scale(' + s + ')'
    }
  } else
  c.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 24 L7.5 18.8 L11.2 27.2 L15 25.6 L11.4 17.4 L19 17.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transformOrigin: '2px 2px' })
  document.documentElement.appendChild(c)
  window.__cursor = (x, y, s, show) => {
    c.style.display = show ? '' : 'none'
    c.style.transform = 'translate(' + (x - 2) + 'px, ' + (y - 2) + 'px) scale(' + s * ${size} + ')'
  }
  window.__ripple = (x, y) => {
    const r = document.createElement('div')
    Object.assign(r.style, { position: 'fixed', left: (x - 22) + 'px', top: (y - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%',
      background: 'rgba(0,0,0,.18)', zIndex: '2147483646', pointerEvents: 'none' })
    document.documentElement.appendChild(r)
    r.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
    setTimeout(() => r.remove(), 500)
  }
})()`

// ---------------------------------------------------------------------------------------------

const merge = (a, b) => {
  if (b === undefined) return a
  if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object' && !Array.isArray(b)) {
    const o = { ...a }
    for (const k of Object.keys(b)) o[k] = merge(a[k], b[k])
    return o
  }
  return b
}
const home = (p) => p.replace(/^~(?=$|\/)/, os.homedir())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EASES = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
}
const isAlphaBg = (bg) => bg === 'transparent'

// iPhone bodies: the coloured band, its gradient and edge highlight (the screen's black bezel is the same on all)
const PHONES = {
  black: { band: 'linear-gradient(145deg,#2a2a2d 0%,#111113 45%,#0a0a0b 100%)', ring: 'rgba(255,255,255,.16)', key: '#1c1c1e' },
  gray: { band: 'linear-gradient(145deg,#5a5a5e 0%,#3b3b3e 45%,#2c2c2f 100%)', ring: 'rgba(255,255,255,.22)', key: '#3d3d40' },
  white: { band: 'linear-gradient(145deg,#fbfbf9 0%,#e6e6e2 45%,#d3d3cf 100%)', ring: 'rgba(0,0,0,.14)', key: '#dcdcd8' },
}
PHONES.grey = PHONES.darkgray = PHONES.gray
PHONES.silver = PHONES.white
const phoneEdge = (W) => Math.round(14 * Math.max(0.8, W / 390)) // band + bezel around the screen

function stageHtml(o, W, H, mode) {
  const f = o.frame, B = BAR[f.browser] ?? 0, P = f.padding, R = f.radius
  const dark = o.colorScheme === 'dark'
  let bg = f.background
  if (bg !== 'transparent' && fs.existsSync(home(bg))) bg = `url("file://${home(bg)}") center / cover`
  const shadow = SHADOWS[f.shadow] ?? f.shadow
  const barBg = dark ? '#2b2b2d' : '#f2f2f2', barLine = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'
  const addrBg = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)', addrInk = dark ? '#aaa' : '#666'
  const dev = f.device === 'iphone'
  const ph = dev ? PHONES[f.color] : null
  if (dev && !ph) throw new Error(`unknown frame.color: ${f.color} (black, white, gray)`)
  const T = dev ? phoneEdge(W) : 0, k = W / 390
  const phoneCss = !dev ? '' : `
    .phone { position: absolute; left: ${P - T}px; top: ${P - T}px; width: ${W + 2 * T}px; height: ${H + 2 * T}px; border-radius: ${R + T}px;
      background: ${ph.band}; box-shadow: ${shadow}, inset 0 0 0 1.5px ${ph.ring}; display: ${mode === 'stage' ? 'block' : 'none'}; }
    .phone::after { content: ''; position: absolute; inset: ${Math.round(T * 0.64)}px; border-radius: ${R + Math.round(T * 0.36)}px; background: #000;
      box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
    .phone b { position: absolute; background: ${ph.key}; box-shadow: inset 0 0 0 1px ${ph.ring}; }
    .island { position: absolute; z-index: 5; left: 50%; top: ${Math.round(11 * k)}px; width: ${Math.round(126 * k)}px; height: ${Math.round(37 * k)}px;
      transform: translateX(-50%); border-radius: 999px; background: #000; }`
  const phone = !dev ? '' : `<div class="phone">${[ // [side, top, height] in screen points: action, volume up, volume down, power
    ['l', 118, 32], ['l', 172, 62], ['l', 244, 62], ['r', 196, 100],
  ].map(([sd, y, h]) => `<b style="${sd === 'l' ? 'left' : 'right'}:-3px;top:${T + Math.round(y * k)}px;width:4px;height:${Math.round(h * k)}px;border-radius:2px"></b>`).join('')}</div>`
  const island = dev && f.island ? '<div class="island"></div>' : ''
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${W + 2 * P}px; height: ${H + B + 2 * P}px; overflow: hidden; }
    body { background: ${mode === 'mask' ? '#000' : bg}; }
    .window { position: absolute; left: ${P}px; top: ${P}px; width: ${W}px; height: ${H + B}px; border-radius: ${R}px; overflow: hidden;
      background: ${mode === 'mask' || dev ? '#000' : '#fff'}; box-shadow: ${mode === 'stage' && !dev ? shadow : 'none'}; }
    .window.gone { visibility: hidden; }
    .bar { height: ${B}px; background: ${barBg}; border-bottom: 0.5px solid ${barLine}; display: flex; align-items: center; padding: 0 16px; gap: 8px; position: relative;
      visibility: ${mode === 'mask' ? 'hidden' : 'visible'}; }
    .bar i { width: 12px; height: 12px; border-radius: 50%; display: block; }
    .bar i:nth-child(1) { background: #ff5f57; } .bar i:nth-child(2) { background: #febc2e; } .bar i:nth-child(3) { background: #28c840; }
    .addr { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 38%; height: 28px; border-radius: 8px; background: ${addrBg};
      color: ${addrInk}; font: 13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; display: flex; align-items: center; justify-content: center; }
    .content { height: ${H}px; background: ${mode === 'mask' ? '#fff' : dark || dev ? '#000' : '#fff'}; }${phoneCss}`
  const bar = B ? `<div class="bar"><i></i><i></i><i></i>${f.browser === 'browser' ? `<div class="addr">${f.address || ''}</div>` : ''}</div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
    <body>${phone}<div class="window${mode === 'bg' ? ' gone' : ''}">${bar}<div class="content"></div>${island}</div></body></html>`
}

// ---------------------------------------------------------------------------------------------

// --rehearse runs the whole shot list on the film clock without filming or encoding: seconds,
// not minutes, and it fails on the exact step whose target is missing
const REHEARSE = process.argv.includes('--rehearse')
const specPath = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!specPath) { console.error('usage: node record.mjs [--rehearse] <shot-list.json>'); process.exit(1) }
const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'))
if (raw.treatment && !(raw.treatment in TREATMENTS)) { console.error(`unknown treatment: ${raw.treatment} (${Object.keys(TREATMENTS).join(', ')})`); process.exit(1) }
if (raw.device && !(raw.device in DEVICES)) { console.error(`unknown device: ${raw.device} (${Object.keys(DEVICES).join(', ')})`); process.exit(1) }
const o = merge(merge(merge(DEFAULTS, { frame: TREATMENTS[raw.treatment] ?? {} }), DEVICES[raw.device] ?? {}), raw)
const TOUCH = !!o.touch
const name = o.name || path.basename(specPath, '.json')
const W = o.viewport.width, H = o.viewport.height, FPS = o.fps, DT = 1000 / FPS
const OS = o.output.scale
const B = BAR[o.frame.browser] ?? 0, P = o.frame.padding
const alpha = isAlphaBg(o.frame.background)
if (o.frame.device === 'iphone' && P < phoneEdge(W) + 8) console.warn(`note: frame.padding ${P} is tight for the iPhone body (${phoneEdge(W)}px edge); raise it`)

// the deepest zoom anywhere in the shot list sets how densely the page is rendered
const zooms = [...o.setup, ...o.sequence].filter((s) => s.camera).map((s) => s.scale || (s.camera === 'follow' ? 1.6 : 1))
const maxZ = Math.max(1, ...zooms)
const DPR = Math.min(4, OS * maxZ)
if (OS * maxZ > 4) console.warn(`note: zoom ${maxZ}× at output scale ${OS} is rendered at density 4; the deepest zoom will be slightly soft`)

const outDir = home(o.output.dir)
const work = fs.mkdtempSync(path.join(os.tmpdir(), `record-${name}-`))
fs.mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: o.chrome,
  headless: true,
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR, isMobile: TOUCH, hasTouch: TOUCH },
})
const stills = [], rects = []
const usesCamera = maxZ > 1
const rawDir = usesCamera ? path.join(work, 'raw') : work
fs.mkdirSync(rawDir, { recursive: true })
let filmed = 0
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))
  if (TOUCH) await page.setUserAgent(o.userAgent || MOBILE_UA)
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: o.colorScheme }])
  await page.evaluateOnNewDocument(CLOCK)
  if (o.intercept.length) {
    await page.setRequestInterception(true)
    page.on('request', async (req) => {
      const rules = o.intercept.filter((r) => req.url().includes(r.match))
      if (!rules.length) return req.continue()
      const res = await fetch(req.url())
      let body = await res.text()
      for (const r of rules) {
        const next = body.replace(new RegExp(r.find, r.flags ?? ''), r.replace)
        if (next === body) console.warn(`intercept: "${r.find}" changed nothing in ${r.match}`)
        body = next
      }
      req.respond({ status: res.status, contentType: res.headers.get('content-type') || 'application/javascript', body })
    })
  }
  const cdp = await page.createCDPSession()
  await page.goto(o.url, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  const hideCss = (o.hide.length ? `${o.hide.join(', ')} { display: none !important; }\n` : '') + o.css
  if (hideCss) await page.addStyleTag({ content: hideCss })
  await page.evaluate(CURSOR(o.cursor.size, TOUCH))

  // ---- state ----
  let filming = false, n = 0
  let cx = 0, cy = 0, press = 1, pressed = false, showCursor = o.cursor.show
  let finger = false, fingerA = 0 // touch: a finger is on the glass; its dot fades in and out
  const cam = { z: 1, x: W / 2, y: H / 2, tween: null, follow: null }
  const target = async (t) => {
    const p = await page.evaluate((t) => window.__target(t), t)
    if (!p) throw new Error(`target not found: ${JSON.stringify(t)}`)
    return p
  }
  ;[cx, cy] = await target(o.cursor.start)

  const stepCamera = () => {
    if (cam.tween) {
      const tw = cam.tween, p = Math.min(1, (n - tw.n0) / tw.frames), e = tw.ease(p)
      cam.z = tw.from.z + (tw.to.z - tw.from.z) * e
      cam.x = tw.from.x + (tw.to.x - tw.from.x) * e
      cam.y = tw.from.y + (tw.to.y - tw.from.y) * e
      if (p >= 1) cam.tween = null
    } else if (cam.follow) {
      const k = 1 - Math.exp(-DT / cam.follow.lag)
      cam.z += (cam.follow.scale - cam.z) * (1 - Math.exp(-DT / cam.follow.zoomLag))
      cam.x += (cx - cam.x) * k
      cam.y += (cy - cam.y) * k
    }
    const w = W / cam.z, h = H / cam.z
    return { x: Math.min(Math.max(cam.x - w / 2, 0), W - w), y: Math.min(Math.max(cam.y - h / 2, 0), H - h), w, h }
  }
  // The whole viewport is filmed every frame; the camera is applied afterwards (see "camera
  // pass"). Chrome snaps a screenshot clip to whole CSS pixels, so cropping here made every
  // camera move step instead of glide.
  const capture = async (format, file) => {
    const c = stepCamera()
    // the page's deviceScaleFactor is not honoured by a CDP capture; the clip's own scale is,
    // and it re-rasterises (sharp), so the whole viewport is clipped at the render density
    const [sx, sy] = await page.evaluate(() => [scrollX, scrollY])
    const shot = await cdp.send('Page.captureScreenshot', {
      format, ...(format === 'jpeg' ? { quality: 95 } : {}),
      clip: { x: sx, y: sy, width: W, height: H, scale: DPR },
    })
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return c
  }
  // one video frame: let the app commit what the last input did, advance the clock, film it
  const frame = async () => {
    if (TOUCH) fingerA = Math.min(1, Math.max(0, fingerA + (finger ? DT / 90 : -DT / 260)))
    await page.evaluate((x, y, s, show, a) => window.__cursor(x, y, s, show, a),
      cx, cy, TOUCH ? 0.7 + 0.3 * fingerA : press, showCursor && (!TOUCH || fingerA > 0), TOUCH ? fingerA : 1)
    await sleep(2)
    await page.evaluate((d) => window.__advance(d), DT)
    if (filming) {
      rects[filmed] = await capture('jpeg', path.join(rawDir, `f${String(filmed).padStart(5, '0')}.jpg`))
      filmed++
      if (filmed % (FPS * 2) === 0) console.log(`  filmed ${(filmed / FPS).toFixed(0)}s`)
    } else stepCamera()
    n++
  }
  const wait = async (ms) => { for (let i = 0; i < Math.round(ms / DT); i++) await frame() }
  const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', {
    type, x, y, ...(pressed ? { button: 'left', buttons: 1 } : { button: 'none', buttons: 0 }), ...extra })

  // touch: one finger. Without a finger down, moving is silent (nothing on screen to show it).
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const down = async () => {
    if (TOUCH) { finger = true; await touch('touchStart', cx, cy) }
    else { press = o.cursor.click === 'none' ? 1 : 0.86; pressed = true; await mouse('mousePressed', cx, cy, { button: 'left', buttons: 1, clickCount: 1 }) }
  }
  const up = async () => {
    if (TOUCH) { finger = false; await touch('touchEnd', cx, cy) }
    else { pressed = false; press = 1; await mouse('mouseReleased', cx, cy, { button: 'left', buttons: 0, clickCount: 1 }) }
  }
  const pointer = (x, y) => TOUCH ? (finger ? touch('touchMove', x, y) : null) : mouse('mouseMoved', x, y)

  // glide to a target that may itself drift, re-aiming each frame, on a slight arc
  const moveTo = async (t, ms = 1000, easeName = 'inOut') => {
    const x0 = cx, y0 = cy, steps = Math.max(1, Math.round(ms / DT)), ease = EASES[easeName]
    for (let i = 1; i <= steps; i++) {
      const [x, y] = await target(t)
      const e = ease(i / steps), arc = Math.sin(Math.PI * e) * Math.hypot(x - x0, y - y0) * 0.08
      cx = x0 + (x - x0) * e; cy = y0 + (y - y0) * e - arc
      await pointer(cx, cy)
      await frame()
    }
  }
  // touch: the finger lands on the target (no glide), taps, and lifts
  const tap = async (count = 1, lead = 250) => {
    await wait(lead)
    for (let k = 1; k <= count; k++) {
      if (o.cursor.click === 'ripple' && showCursor) await page.evaluate((x, y) => window.__ripple(x, y), cx, cy)
      await down(); await wait(80); await up()
      await wait(k < count ? 70 : 50)
    }
  }
  const click = async (count = 1) => {
    if (TOUCH) return tap(count, 0)
    for (let k = 1; k <= count; k++) {
      press = o.cursor.click === 'none' ? 1 : 0.86
      if (o.cursor.click === 'ripple' && showCursor) await page.evaluate((x, y) => window.__ripple(x, y), cx, cy)
      pressed = true
      await mouse('mousePressed', cx, cy, { button: 'left', buttons: 1, clickCount: k })
      await wait(83)
      pressed = false
      await mouse('mouseReleased', cx, cy, { button: 'left', buttons: 0, clickCount: k })
      press = 1
      await wait(k < count ? 60 : 50)
    }
  }
  const key = async (k) => {
    const d = KEYS[k] || { key: k, code: k }
    const base = { key: d.key || k, code: d.code, windowsVirtualKeyCode: d.keyCode, nativeVirtualKeyCode: d.keyCode }
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
    if (d.text) await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...base, text: d.text })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }
  const type = async (text, speed = 1) => {
    for (const ch of text) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
      await wait((ch === ' ' ? 130 : 70 + ((ch.charCodeAt(0) * 37) % 60)) / speed)
    }
  }
  const still = async (file) => {
    if (REHEARSE) return
    const was = showCursor
    showCursor = false
    await page.evaluate((x, y) => window.__cursor(x, y, 1, false), cx, cy)
    const png = path.join(rawDir, `still-${stills.length}.png`)
    const rect = await capture('png', png)
    stills.push({ png, file, rect })
    showCursor = was
  }

  const camera = async (s) => {
    const ms = s.ms ?? 900, frames = Math.max(1, Math.round(ms / DT)), ease = EASES[s.ease || 'inOut']
    const from = { z: cam.z, x: cam.x, y: cam.y }
    cam.follow = null
    if (s.camera === 'follow') {
      cam.follow = { scale: s.scale ?? 1.6, lag: s.lag ?? 300, zoomLag: ms / 3 }
    } else {
      let to
      if (s.camera === 'reset') to = { z: 1, x: W / 2, y: H / 2 }
      else if (s.camera === 'zoom') { const [x, y] = s.to ? await target(s.to) : [cam.x, cam.y]; to = { z: s.scale ?? 1.5, x, y } }
      else if (s.camera === 'pan') { const [x, y] = await target(s.to); to = { z: cam.z, x, y } }
      else if (s.camera === 'drift') { const [x, y] = s.to ? await target(s.to) : [cam.x, cam.y]; to = { z: s.scale ?? cam.z * 1.05, x, y } }
      else throw new Error(`unknown camera move: ${s.camera}`)
      // a zoom-out from a clamped edge starts from where the frame really is
      const c = stepCamera(); from.x = c.x + c.w / 2; from.y = c.y + c.h / 2
      cam.tween = { from, to, n0: n, frames, ease: s.camera === 'drift' ? EASES[s.ease || 'linear'] : ease }
    }
    if (s.wait) await wait(ms)
  }

  const run = async (steps) => {
    for (const [i, s] of steps.entries()) {
      try { await step(s) } catch (e) {
        e.message = `step ${i + 1}${s.note ? ` ("${s.note}")` : ''} ${JSON.stringify(s)}: ${e.message}`
        throw e
      }
    }
  }
  const step = async (s) => {
    {
      if ('wait' in s && !s.camera) await wait(s.wait)
      else if (s.move) { if (TOUCH && !finger) await wait(s.ms ?? 1000); await moveTo(s.move, TOUCH && !finger ? 1 : s.ms, s.ease) }
      else if (s.hover) { if (TOUCH) await wait((s.ms ?? 1000) + (s.hold ?? 1500)); else { await moveTo(s.hover, s.ms); await wait(s.hold ?? 1500) } }
      else if ('tap' in s || 'click' in s || 'doubleClick' in s) {
        const t = s.tap ?? s.click ?? s.doubleClick, count = 'doubleClick' in s ? 2 : (s.count || 1)
        if (TOUCH) { if (t !== true) [cx, cy] = await target(t); await tap(count, s.lead ?? 250) }
        else { if (t !== true) await moveTo(t, s.ms); await click(count) }
        if (s.hold) await wait(s.hold)
      }
      else if ('longPress' in s) {
        if (s.longPress !== true) { if (TOUCH) [cx, cy] = await target(s.longPress); else await moveTo(s.longPress, s.ms) }
        await wait(TOUCH ? (s.lead ?? 250) : 0); await down(); await wait(s.hold ?? 700); await up(); await wait(50)
      }
      else if (s.swipe) {
        // { from, to } or { direction: up|down|left|right, distance (px, default 300), at }; the page follows the finger
        const sw = s.swipe
        let to = sw.to
        if (sw.from) { if (TOUCH) [cx, cy] = await target(sw.from); else await moveTo(sw.from, s.ms ?? 800) }
        else if (sw.at) { if (TOUCH) [cx, cy] = await target(sw.at); else await moveTo(sw.at, s.ms ?? 800) }
        if (!to) {
          const d = sw.distance ?? 300, v = { up: [0, -d], down: [0, d], left: [-d, 0], right: [d, 0] }[sw.direction]
          if (!v) throw new Error(`swipe needs "to" or a direction (up/down/left/right)`)
          to = { x: cx + v[0], y: cy + v[1] }
        }
        await wait(TOUCH ? (s.lead ?? 250) : 0); await down(); await wait(80)
        await moveTo(to, sw.ms ?? 450, 'out')
        await up(); await wait(s.hold ?? 50)
      }
      else if (s.type !== undefined) { if (s.into) { await step({ tap: s.into, ms: s.ms }) } await type(s.type, s.speed) }
      else if (s.key) { await key(s.key); await wait(s.hold ?? 0) }
      else if (s.scroll) {
        if (s.at) { if (TOUCH) [cx, cy] = await target(s.at); else await moveTo(s.at, 600) }
        if (TOUCH) {
          // wheel +dy scrolls down, which is a finger moving up
          await wait(s.lead ?? 250); await down(); await wait(60)
          const x0 = cx, y0 = cy, frames = Math.max(1, Math.round((s.ms ?? 800) / DT)), e = EASES.out
          for (let i = 1; i <= frames; i++) {
            cx = x0 - (s.scroll.dx || 0) * e(i / frames); cy = y0 - (s.scroll.dy || 0) * e(i / frames)
            await pointer(cx, cy); await frame()
          }
          await up(); await wait(50)
          return
        }
        const frames = Math.max(1, Math.round((s.ms ?? 800) / DT)), e = EASES.inOut
        for (let i = 1; i <= frames; i++) {
          const d = e(i / frames) - e((i - 1) / frames)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: (s.scroll.dx || 0) * d, deltaY: (s.scroll.dy || 0) * d })
          await frame()
        }
      } else if (s.drag) {
        if (TOUCH) { [cx, cy] = await target(s.drag.from); await wait(s.lead ?? 250) } else await moveTo(s.drag.from, s.ms ?? 800)
        await down(); await wait(120)
        await moveTo(s.drag.to, s.drag.ms ?? 900)
        await wait(80); await up(); await wait(50)
      } else if (s.camera) await camera(s)
      else if (s.cursor) showCursor = s.cursor === 'show'
      else if (s.jump) { [cx, cy] = await target(s.jump); await pointer(cx, cy); await frame() }
      else if (s.waitFor) {
        const limit = Math.round((s.timeout ?? 5000) / DT)
        for (let i = 0; !(await page.$(s.waitFor)); i++) { if (i > limit) throw new Error(`waitFor timed out: ${s.waitFor}`); await frame() }
      }
      else if (s.js) { await page.evaluate(s.js); await frame() }
      else if (s.still) await still(s.still)
      else if (!s.note) throw new Error(`unknown step: ${JSON.stringify(s)}`)
    }
  }

  // off camera: let the page settle on its own clock, then any setup
  await pointer(cx, cy)
  await wait(o.settle)
  await run(o.setup)
  if (o.output.poster) await still(`${name}-poster.png`)
  filming = !REHEARSE
  const n0 = n
  console.log(`${REHEARSE ? 'rehearsing' : 'filming'} ${name} at ${W}×${H}, ${FPS}fps, render density ${DPR}`)
  await run(o.sequence)
  if (REHEARSE) console.log(JSON.stringify({ rehearsal: 'ok', name, seconds: +((n - n0) / FPS).toFixed(2) }))
} finally {
  await browser.close()
}
if (REHEARSE) process.exit(0)

// ---- stage: background + window + shadow + bar, a mask for the window's rounded content, the bare background ----
// ---- camera pass: crop each full frame to its camera rect with sub-pixel precision ----
// A canvas samples a fractional source rect smoothly, so a slow pan or drift moves by
// fractions of a pixel per frame instead of jumping a whole one every few frames.
if (usesCamera) {
  const cw = W * OS, ch = H * OS
  fs.writeFileSync(path.join(work, 'cam.html'), `<!doctype html><html><body style="margin:0;background:#fff">
    <canvas id="c" width="${cw}" height="${ch}" style="display:block"></canvas>
    <script>
      const ctx = document.getElementById('c').getContext('2d')
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      window.draw = async (src, r, k) => {
        const img = new Image(); img.src = src; await img.decode()
        ctx.drawImage(img, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, ${cw}, ${ch})
      }
    </script></body></html>`)
  const b3 = await puppeteer.launch({ executablePath: o.chrome, headless: true, args: ['--allow-file-access-from-files'] })
  const pg = await b3.newPage()
  await pg.setViewport({ width: cw, height: ch, deviceScaleFactor: 1 })
  await pg.goto('file://' + path.join(work, 'cam.html'))
  const cdp3 = await pg.createCDPSession()
  const crop = async (src, rect, out, format) => {
    await pg.evaluate((s, r, k) => window.draw(s, r, k), 'file://' + src, rect, DPR)
    const shot = await cdp3.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 95 } : {}) })
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  }
  console.log('applying camera')
  for (let i = 0; i < filmed; i++) {
    const f = `f${String(i).padStart(5, '0')}.jpg`
    await crop(path.join(rawDir, f), rects[i], path.join(work, f), 'jpeg')
  }
  for (const [i, st] of stills.entries()) {
    const out = path.join(work, `still-${i}.png`)
    await crop(st.png, st.rect, out, 'png')
    st.png = out
  }
  await b3.close()
  if (!o.output.keepFrames) fs.rmSync(rawDir, { recursive: true, force: true })
}

const SW = (W + 2 * P) * OS, SH = (H + B + 2 * P) * OS, CW = W * OS, CH = H * OS, OX = P * OS, OY = (P + B) * OS
{
  const b2 = await puppeteer.launch({ executablePath: o.chrome, headless: true })
  const st = await b2.newPage()
  await st.setViewport({ width: W + 2 * P, height: H + B + 2 * P, deviceScaleFactor: OS })
  for (const mode of ['stage', 'mask', 'bg']) {
    const html = path.join(work, `${mode}.html`)
    fs.writeFileSync(html, stageHtml(o, W, H, mode))
    await st.goto('file://' + html)
    await st.screenshot({ path: path.join(work, `${mode}.png`), omitBackground: alpha && mode !== 'mask',
      ...(mode === 'mask' ? { clip: { x: P, y: P + B, width: W, height: H } } : {}) })
  }
  await b2.close()
}

const T = filmed / FPS
const fi = o.output.fadeIn / 1000, fo = o.output.fadeOut / 1000
const ff = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const looped = (f) => ['-loop', '1', '-framerate', String(FPS), '-t', T.toFixed(3), '-i', path.join(work, f)]
// [0] frames  [1] stage  [2] mask  [3] background only
const composite = (flatten) => {
  let g = `[0:v]scale=${CW}:${CH},format=rgba[v];[2:v]scale=${CW}:${CH},format=gray[m];[v][m]alphamerge[va];` +
    `[1:v]format=rgba[st];[st][va]overlay=${OX}:${OY}:format=rgb[o]`
  if (fi || fo) {
    const fades = [fi && `fade=t=in:st=0:d=${fi}:alpha=1`, fo && `fade=t=out:st=${(T - fo).toFixed(3)}:d=${fo}:alpha=1`].filter(Boolean).join(',')
    g += `;[o]${fades}[of];[3:v]format=rgba[bg];[bg][of]overlay=0:0:format=rgb[o2]`
  } else g += ';[o]null[o2]'
  if (flatten) g += `;color=c=white:s=${SW}x${SH}:r=${FPS}[w];[w][o2]overlay=0:0:shortest=1[out]`
  else g += ';[o2]null[out]'
  return g
}
const inputs = ['-framerate', String(FPS), '-i', path.join(work, 'f%05d.jpg'), ...looped('stage.png'), ...looped('mask.png'), ...looped('bg.png')]
const written = []
const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
for (const fmt of o.output.formats) {
  const out = path.join(outDir, `${name}.${fmt}`)
  if (alpha && (fmt === 'mp4' || fmt === 'gif')) console.warn(`note: .${fmt} has no transparency; it is rendered on white`)
  console.log(`encoding .${fmt}`)
  if (fmt === 'mp4') {
    ff([...inputs, '-filter_complex', composite(alpha) + `;[out]${even},format=yuv420p[e]`, '-map', '[e]', '-t', T.toFixed(3),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(FPS), '-movflags', '+faststart', out])
  } else if (fmt === 'mov') {
    ff([...inputs, '-filter_complex', composite(false), '-map', '[out]', '-t', T.toFixed(3), '-c:v', 'prores_ks',
      ...(alpha ? ['-profile:v', '4444', '-pix_fmt', 'yuva444p10le'] : ['-profile:v', '3', '-pix_fmt', 'yuv422p10le']), '-r', String(FPS), out])
  } else if (fmt === 'webm') {
    ff([...inputs, '-filter_complex', composite(false) + `;[out]${even},format=${alpha ? 'yuva420p' : 'yuv420p'}[e]`, '-map', '[e]', '-t', T.toFixed(3),
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-r', String(FPS), out])
  } else if (fmt === 'gif') {
    const gfps = Math.min(FPS, 30)
    ff([...inputs, '-filter_complex', composite(alpha) + `;[out]fps=${gfps},scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a[e]`,
      '-map', '[e]', '-t', T.toFixed(3), out])
  } else { console.warn(`unknown format: ${fmt}`); continue }
  written.push(out)
}
for (const s of stills) {
  const out = path.join(outDir, s.file.endsWith('.png') ? s.file : `${s.file}.png`)
  ff(['-i', s.png, '-i', path.join(work, 'stage.png'), '-i', path.join(work, 'mask.png'),
    '-filter_complex', `[0:v]scale=${CW}:${CH},format=rgba[v];[2:v]scale=${CW}:${CH},format=gray[m];[v][m]alphamerge[va];[1:v]format=rgba[st];[st][va]overlay=${OX}:${OY}:format=rgb`,
    '-frames:v', '1', out])
  written.push(out)
}
fs.copyFileSync(specPath, path.join(outDir, `${name}.json`))
if (!o.output.keepFrames) fs.rmSync(work, { recursive: true, force: true })
console.log(JSON.stringify({ seconds: +T.toFixed(2), frames: filmed, size: `${SW}×${SH}`, files: written, frames_dir: o.output.keepFrames ? work : undefined }, null, 2))
