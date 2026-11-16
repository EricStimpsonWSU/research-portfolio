/* record.js: Record / Pause / Stop controls for a simulation canvas; saves an animated WebP.
   Usage: <script src="../../shared/record.js" data-canvas="cv" [data-after="#field"]></script>
   - Frames are copied inside the page's own requestAnimationFrame callbacks. A WebGPU canvas
     can only be read in the same task that drew it; a timer-based copy reads it blank.
   - Only frames that differ from the previous captured frame are kept, so the clip contains
     only time when the simulation is actually moving (paused simulation = nothing recorded).
   - Each frame is encoded with canvas.toBlob('image/webp'), then a dependency-free muxer
     builds RIFF VP8X/ANIM/ANMF. Without WebP encoding (older Safari) a WebM is saved instead. */
(() => {
  const me = document.currentScript;
  const FPS = 12, MAXSEC = 10, MAXW = 320, Q = 0.8, DIFF = 1.0;   // DIFF: mean |Δ| (0-255) on a 24x24 probe
  const u24 = (a, o, v) => { a[o] = v & 255; a[o+1] = (v >> 8) & 255; a[o+2] = (v >> 16) & 255; };
  const chunk = (tag, data) => {               // RIFF chunk with even padding
    const n = data.length, out = new Uint8Array(8 + n + (n & 1));
    out.set([...tag].map(c => c.charCodeAt(0)), 0);
    new DataView(out.buffer).setUint32(4, n, true); out.set(data, 8); return out;
  };
  const cat = parts => { const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
  function frameChunks(b) {                    // keep ALPH/VP8/VP8L chunks of a still WebP
    const dv = new DataView(b.buffer, b.byteOffset), out = []; let alpha = false;
    for (let i = 12; i + 8 <= b.length;) {
      const tag = String.fromCharCode(...b.subarray(i, i + 4)), n = dv.getUint32(i + 4, true);
      if (tag === 'ALPH' || tag === 'VP8 ' || tag === 'VP8L') out.push(b.subarray(i, i + 8 + n + (n & 1)));
      if (tag === 'ALPH' || tag === 'VP8L') alpha = true;
      i += 8 + n + (n & 1);
    }
    return { data: cat(out), alpha };
  }
  function muxWebP(stills, w, h, ms) {
    let alpha = false;
    const frames = stills.map(s => { const f = frameChunks(s); alpha ||= f.alpha;
      const hd = new Uint8Array(16); u24(hd, 6, w - 1); u24(hd, 9, h - 1); u24(hd, 12, ms); hd[15] = 0b10; // no blend
      return chunk('ANMF', cat([hd, f.data])); });
    const vp8x = new Uint8Array(10); vp8x[0] = 0x02 | (alpha ? 0x10 : 0); u24(vp8x, 4, w - 1); u24(vp8x, 7, h - 1);
    const anim = new Uint8Array(6);              // bg 0,0,0,0; loop 0 = forever
    const body = cat([new TextEncoder().encode('WEBP'), chunk('VP8X', vp8x), chunk('ANIM', anim), ...frames]);
    return chunk('RIFF', body.subarray(0)).slice(0, 8 + body.length);
  }
  const save = (blob, ext) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${document.title.replace(/\W+/g, '-').toLowerCase()}-${Date.now()}.${ext}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5e3); };
  const toBlob = (c, t, q) => new Promise(r => c.toBlob(r, t, q));
  const getCv = () => document.getElementById(me?.dataset.canvas || '') || document.querySelector('canvas');

  // ---- state ----
  let R = null;          // active recording: {off, g, probe, pg, prev, frames:[Promise], last, paused, mr, parts}
  let webpOK = true;
  const dt = 1e3 / FPS, maxFrames = FPS * MAXSEC;

  // ---- capture hook: runs synchronously right after each page rAF callback ----
  let lastHookT = -1;
  function hook(t) {
    if (!R || R.paused || t === lastHookT) return; lastHookT = t;
    if (t - R.last < dt * 0.95) return;
    const cv = getCv(); if (!cv || !cv.width) return;
    if (R.off.width === 1) {                       // size on first frame (canvas may be swapped per engine)
      const s = Math.min(1, MAXW / cv.width); R.off.width = Math.round(cv.width * s); R.off.height = Math.round(cv.height * s);
      if (R.mr === null) startWebM();
    }
    R.pg.clearRect(0, 0, 24, 24); R.pg.drawImage(cv, 0, 0, 24, 24);
    const px = R.pg.getImageData(0, 0, 24, 24).data;
    let d = 0; if (R.prev) { for (let i = 0; i < px.length; i += 4) d += Math.abs(px[i] - R.prev[i]) + Math.abs(px[i+1] - R.prev[i+1]) + Math.abs(px[i+2] - R.prev[i+2]); d /= 576 * 3; }
    const changed = !R.prev || d > DIFF;
    if (!changed) { status('waiting for motion'); return; }
    R.prev = px; R.last = t;
    R.g.clearRect(0, 0, R.off.width, R.off.height); R.g.drawImage(cv, 0, 0, R.off.width, R.off.height);
    if (webpOK) R.frames.push(toBlob(R.off, 'image/webp', Q).then(b => b.arrayBuffer()).then(a => new Uint8Array(a)));
    else R.n = (R.n || 0) + 1;                     // WebM: the stream picks up the redraw
    const n = webpOK ? R.frames.length : R.n;
    status(`● ${(n / FPS).toFixed(1)} s`);
    if (n >= maxFrames) stop();
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { cb(t); hook(t); });

  // ---- UI ----
  const bar = document.createElement('div'), mk = (txt, title) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.style.cssText = 'padding:.25rem .7rem;cursor:pointer;font:inherit;font-size:14px'; bar.append(b); return b; };
  bar.style.cssText = 'display:flex;gap:.5rem;align-items:center;margin:.5rem 0';
  const bRec = mk('● Record', `Record up to ${MAXSEC} s of simulation as an animated WebP. Only frames where the field changes are kept.`);
  const bPause = mk('❚❚ Pause', 'Pause / resume the recorder (the simulation keeps running)');
  const lab = document.createElement('span'); lab.style.cssText = 'font-size:13px;opacity:.75'; bar.append(lab);
  const status = s => { lab.textContent = s; };
  const ui = () => { bRec.textContent = R ? '■ Stop' : '● Record'; bPause.disabled = !R; bPause.textContent = R?.paused ? '▶ Resume' : '❚❚ Pause'; if (!R) status(''); };
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) bar.addEventListener(ev, e => e.stopPropagation());

  function startWebM() {
    R.mr = new MediaRecorder(R.off.captureStream(FPS), { mimeType: 'video/webm' }); R.parts = [];
    R.mr.ondataavailable = e => R?.parts.push(e.data); R.mr.start();
  }
  async function stop() {
    const r = R; R = null; ui(); if (!r) return;
    status('encoding…');
    if (webpOK) {
      const stills = await Promise.all(r.frames);
      if (stills.length) save(new Blob([muxWebP(stills, r.off.width, r.off.height, Math.round(dt))], { type: 'image/webp' }), 'webp');
      status(stills.length ? `saved ${stills.length} frames` : 'nothing recorded (simulation never moved)');
    } else if (r.mr) {
      r.mr.onstop = () => { save(new Blob(r.parts, { type: 'video/webm' }), 'webm'); status('saved'); };
      r.mr.stop();
    }
  }
  bRec.onclick = () => {
    if (R) return stop();
    const off = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    const probe = Object.assign(document.createElement('canvas'), { width: 24, height: 24 });
    R = { off, g: off.getContext('2d'), probe, pg: probe.getContext('2d', { willReadFrequently: true }),
          prev: null, frames: [], last: -1e9, paused: false, mr: webpOK ? undefined : null };
    status('waiting for motion'); ui();
  };
  bPause.onclick = () => { if (!R) return; R.paused = !R.paused; R.prev = null; if (R.paused) status('paused'); ui(); };

  async function init() {
    const cv = getCv(); if (!cv) return;
    const host = me?.dataset.after ? document.querySelector(me.dataset.after)
               : (cv.parentElement && cv.parentElement.children.length === 1 && cv.parentElement !== document.body ? cv.parentElement : cv);
    host.insertAdjacentElement('afterend', bar); ui();
    webpOK = (await toBlob(Object.assign(document.createElement('canvas'), { width: 1, height: 1 }), 'image/webp'))?.type === 'image/webp';
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
