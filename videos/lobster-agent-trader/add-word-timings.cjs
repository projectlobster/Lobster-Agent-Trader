const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The kokoro TTS path produces audio but no word timings, and captions.mjs
 * skips cleanly when `words` is empty. Transcribing each line back with
 * whisper gives the word-level timestamps the caption builder needs.
 */

const HERE = __dirname;
const VOICE = path.join(HERE, "assets/voice");
const SCRIPT = fs.readFileSync(path.join(HERE, "SCRIPT.md"), "utf8");

const spoken = [...SCRIPT.matchAll(/^## Line \d+ — .*?\(Frame (\d+)\)$([\s\S]*?)^ {4}(\S.*)$/gm)].map(
  (m) => ({ frame: Number(m[1]), text: m[3].trim().split(/\s+/).join(" ") }),
);

const voices = [];

for (const { frame, text } of spoken) {
  const file = path.join(VOICE, `${String(frame).padStart(2, "0")}.wav`);
  if (!fs.existsSync(file)) {
    console.error(`  missing ${file}`);
    process.exit(1);
  }

  process.stdout.write(`  frame ${frame}: transcribing… `);
  execFileSync(
    "npx",
    ["hyperframes", "transcribe", file, "--engine", "whisper", "--model", "small.en",
     "--language", "en", "--json"],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  // The transcript sidecar is a flat array of word objects, not an object
  // with a `words` key — reading it as the latter silently yielded zero words
  // and captions.mjs then skipped the whole film.
  const raw = JSON.parse(fs.readFileSync(path.join(VOICE, "transcript.json"), "utf8"));
  const list = Array.isArray(raw) ? raw : (raw.words ?? []);
  const buf = fs.readFileSync(file);
  const rate = buf.readUInt32LE(28);
  const duration = buf.readUInt32LE(40) / rate;

  const words = list
    .map((w) => ({
      text: String(w.text ?? w.word ?? "").trim(),
      start: Number((w.start ?? w.startTime ?? 0).toFixed(3)),
      end: Number((w.end ?? w.endTime ?? 0).toFixed(3)),
    }))
    .filter((w) => w.text.length > 0);

  voices.push({ frame, path: `assets/voice/${String(frame).padStart(2, "0")}.wav`,
                duration_s: Number(duration.toFixed(3)), words });

  console.log(`${words.length} words / ${duration.toFixed(2)}s`);
}

const total = voices.reduce((a, v) => a + v.duration_s, 0);
fs.writeFileSync(
  path.join(HERE, "audio_meta.json"),
  JSON.stringify({ bgm: null, bgm_pending: false, voices, sfx: [] }, null, 2),
);
console.log(`\n✓ audio_meta.json rebuilt with word timings — ${voices.length} lines, ${total.toFixed(2)}s`);
