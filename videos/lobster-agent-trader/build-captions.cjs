const fs = require("node:fs");
const path = require("node:path");

/**
 * Builds the captions composition.
 *
 * captions.mjs guards its entry with `resolve(process.argv[1]) ===
 * fileURLToPath(import.meta.url)`, which does not match under this project's
 * node/tsx resolution — the script exits 0 having done nothing, silently. This
 * reimplements the same grouping so captions actually get built.
 *
 * Words come from audio_meta.json, already transcribed with word-level timings,
 * and are offset by each frame's start in the assembled timeline.
 */

const HERE = __dirname;
const WINDOW = 2.6; // seconds of speech considered when computing density
const MAX_WORDS = 4; // ceiling for a single caption group
const MAX_CHARS = 34;
const r3 = (n) => Math.round(n * 1000) / 1000;

// ——— frame start offsets ———
const sb = fs.readFileSync(path.join(HERE, "STORYBOARD.md"), "utf8");
const body = sb.replace(/^---[\s\S]*?---\s*/, "");
const blocks = body.split(/^##\s+/m).filter((b) => /^Frame\s+\d+/i.test(b));

const frames = blocks.map((b, i) => {
  const num = Number((b.match(/^Frame\s+(\d+)/i) || [])[1] ?? i + 1);
  const dur = Number((b.match(/^- duration:\s*([\d.]+)s/m) || [])[1] ?? 0);
  return { num, dur };
});

const startByFrame = new Map();
let acc = 0;
for (const f of frames) {
  startByFrame.set(f.num, acc);
  acc += f.dur;
}
const total = r3(acc);

// ——— absolute word stream ———
const meta = JSON.parse(fs.readFileSync(path.join(HERE, "audio_meta.json"), "utf8"));
const words = [];
for (const v of meta.voices) {
  const base = startByFrame.get(v.frame);
  if (base == null || !Array.isArray(v.words)) continue;
  for (const w of v.words) {
    const text = String(w.text ?? "").trim();
    if (!text || /^[.?!,;:—–-]+$/.test(text)) continue;
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    words.push({ text, start: r3(base + w.start), end: r3(base + w.end), frame: v.frame });
  }
}
words.sort((a, b) => a.start - b.start);

if (words.length === 0) {
  console.error("no usable words in audio_meta.json");
  process.exit(1);
}

const densityAt = (i) => {
  const t0 = words[i].start;
  let n = 0;
  for (let j = i; j < words.length && words[j].start < t0 + WINDOW; j += 1) n += 1;
  return n / WINDOW;
};

const groups = [];
let cur = null;

for (let i = 0; i < words.length; i += 1) {
  const w = words[i];
  if (!cur) {
    cur = { words: [w], cap: densityAt(i) > 3.5 ? 2 : densityAt(i) > 2.5 ? 3 : 4 };
    groups.push(cur);
    continue;
  }
  const last = cur.words[cur.words.length - 1];
  const chars = cur.words.reduce((n, x) => n + x.text.length + 1, 0);
  const gap = w.start - last.end;
  const full = cur.words.length >= cur.cap || chars >= MAX_CHARS;
  if (full || gap > 0.7) {
    cur = { words: [w], cap: densityAt(i) > 3.5 ? 2 : densityAt(i) > 2.5 ? 3 : 4 };
    groups.push(cur);
    continue;
  }
  cur.words.push(w);
}

for (const g of groups) {
  g.text = g.words.map((w) => w.text).join(" ");
  g.start = r3(g.words[0].start);
  g.end = r3(g.words[g.words.length - 1].end);
}

// ——— emit ———
const skinPath = path.join(HERE, ".hyperframes/caption-skin.html");
const skin = fs.existsSync(skinPath) ? fs.readFileSync(skinPath, "utf8") : null;

const groupsJson = groups.map((g) => ({ text: g.text, start: g.start, end: g.end, frame: g.words[0].frame }));
fs.writeFileSync(path.join(HERE, "caption_groups.json"), JSON.stringify(groupsJson, null, 2));

const items = groups
  .map(
    (g) =>
      `      <div class="cap" data-start="${g.start}" data-duration="${r3(g.end - g.start)}">${g.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</div>`,
  )
  .join("\n");

const html = `<template>
  <style>
    @font-face {
      font-family: 'Space Grotesk';
      src: url('assets/fonts/0c89a48fa5027cee-s.p.2cyn07wtgehh0.woff2') format('woff2');
      font-weight: 300 700;
      font-style: normal;
      font-display: block;
    }
    #root {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .cap {
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 7%;
      text-align: center;
      font-family: "Space Grotesk", sans-serif;
      font-size: 30px;
      line-height: 1.3;
      color: #12101c;
      background: #f2f0f3;
      border-bottom: 3px solid #7ff0e2;
      padding: 10px 18px;
      opacity: 0;
    }
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1080" data-duration="${total}">
${items}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    (function () {
      var total = ${total};
      var tl = gsap.timeline({ paused: true });
      var caps = document.querySelectorAll(".cap");
      caps.forEach(function (el) {
        var s = parseFloat(el.getAttribute("data-start"));
        var d = parseFloat(el.getAttribute("data-duration"));
        var dur = Math.max(0.2, d);
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, overwrite: "auto" }, s);
        tl.set(el, { opacity: 0, visibility: "hidden" }, s + dur + 0.12);
      });
      tl.to({}, { duration: total }, 0);
      window.__timelines = window.__timelines || {};
      window.__timelines["captions"] = tl;
    })();
  </script>
</template>
`;

fs.writeFileSync(path.join(HERE, "compositions/captions.html"), html);
console.log(
  `✓ captions: ${groups.length} group(s) from ${words.length} words → compositions/captions.html (total ${total}s) · skin: ${skin ? "yes" : "default"}`,
);
