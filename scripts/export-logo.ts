import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Exports the brand mark under docs/brand/.
 *
 * The geometry is read from src/components/ui/Brand.tsx so the exports cannot
 * drift from what the app renders. Colours are the app's own tokens: the mark
 * is `currentColor` plus the tint-cyan layer, so each theme is expressed as the
 * ink colour it sits on.
 *
 * SVG carries the geometry only. The wordmark is not set inside the SVG because
 * ImageMagick renders SVG `<text>` with a broken letter-spacing and the name
 * collapses into itself — the PNG lockups are composited from the mark plus
 * text drawn by ImageMagick, which handles it correctly.
 *
 * Run with: npx tsx scripts/export-logo.ts
 */

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/brand");
const BRAND = join(ROOT, "src/components/ui/Brand.tsx");

const INK_LIGHT = "#12101c";
const INK_DARK = "#f2f0f3";
const CANVAS_LIGHT = "#f2f0f3";
const CANVAS_DARK = "#0e0b1a";
const TINT = "#7ff0e2";

const NAME = "Lobster Agent Trader";
const SIZES = [32, 64, 128, 256, 512];

/** The three path definitions, straight out of the component. */
const PATHS: string[] = (() => {
  const source = readFileSync(BRAND, "utf8");
  const found = [...source.matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);
  if (found.length !== 3) {
    throw new Error(`expected 3 paths in Brand.tsx, found ${found.length}`);
  }
  return found;
})();

/** layer 0 is solid ink, 1 is the tint, 2 is ink at 40%. */
function layers(ink: string): string {
  const [solid, tint, faded] = PATHS;
  return (
    `<path d="${solid}" fill="${ink}"/>` +
    `<path d="${tint}" fill="${TINT}"/>` +
    `<path d="${faded}" fill="${ink}" fill-opacity="0.4"/>`
  );
}

/** The mark alone, transparent background, sized to `px` wide. */
function markSvg(ink: string, px = 512): string {
  const h = Math.round((px / 24) * 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26" width="${px}" height="${h}" role="img" aria-label="${NAME}">
  <title>${NAME}</title>
  ${layers(ink)}
</svg>
`;
}

/** The mark on a solid background, for places that cannot do transparency. */
function markOnCanvas(ink: string, canvas: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26" width="512" height="555" role="img" aria-label="${NAME}">
  <title>${NAME}</title>
  <rect width="24" height="26" fill="${canvas}"/>
  ${layers(ink)}
</svg>
`;
}

/**
 * The mark inside a lockup-sized frame, so a raster pass can place the name
 * beside it without re-deriving the geometry. The frame is wide enough for the
 * mark and the full name at the size the lockup pass uses.
 */
function markInFrame(ink: string, canvas: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 220" width="900" height="220">
  <rect width="900" height="220" fill="${canvas}"/>
  <g transform="translate(58 55) scale(4.2)">${layers(ink)}</g>
</svg>
`;
}

function findMagick(): string | null {
  for (const bin of ["magick", "convert"]) {
    try {
      execFileSync("which", [bin], { stdio: "ignore" });
      return bin;
    } catch {
      // try the next one
    }
  }
  return null;
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const svgs: Array<[string, string]> = [
    ["lobster-mark-light.svg", markSvg(INK_LIGHT)],
    ["lobster-mark-dark.svg", markSvg(INK_DARK)],
    ["lobster-mark-light-bg.svg", markOnCanvas(INK_LIGHT, CANVAS_LIGHT)],
    ["lobster-mark-dark-bg.svg", markOnCanvas(INK_DARK, CANVAS_DARK)],
  ];

  for (const [name, svg] of svgs) {
    writeFileSync(join(OUT, name), svg);
  }
  console.log(`  ${svgs.length} svg files`);

  const magick = findMagick();
  if (!magick) {
    console.log("\n  ImageMagick not found — wrote the SVGs only.");
    console.log("  Install it (brew install imagemagick) for the PNG set.\n");
    return;
  }

  const scratch = mkdtempSync(join(tmpdir(), "lobster-logo-"));
  let n = 0;

  const raster = (svg: string, out: string, width: number) => {
    const source = join(scratch, `in-${n++}.svg`);
    writeFileSync(source, svg);
    execFileSync(
      magick,
      ["-background", "none", "-density", "900", source, "-resize", `${width}x`, out],
      { stdio: "ignore" },
    );
  };

  for (const size of SIZES) {
    raster(markSvg(INK_LIGHT), join(OUT, `lobster-mark-${size}.png`), size);
  }
  console.log(`  ${SIZES.length} mark png sizes`);

  // Lockup: the mark frame, then the name typeset beside it at the component's
  // weight and tracking. The text is rendered onto its own transparent canvas
  // and composited, because annotating directly onto the mark silently
  // produces an empty layer on some ImageMagick builds.
  //
  // Sizes are measured, not guessed: at 1200px wide the name sets to about
  // 430px at pointsize 50, leaving room for the 130px mark plus its gap.
  const lockup = (ink: string, canvas: string, out: string, width: number) => {
    const base = join(scratch, `lock-${n++}`);

    raster(markInFrame(ink, canvas), `${base}-mark.png`, width);

    const height = Math.round((width / 900) * 220);
    execFileSync(
      magick,
      [
        "-size", `${width}x${height}`,
        "xc:none",
        "-font", "Helvetica",
        "-pointsize", String(Math.round(width * 0.042)),
        "-kerning", String(Math.round(width * 0.001)),
        "-fill", ink,
        "-gravity", "none",
        "-annotate", `+${Math.round(width * 0.245)}+${Math.round(height * 0.63)}`,
        NAME,
        `${base}-text.png`,
      ],
      { stdio: "ignore" },
    );

    execFileSync(
      magick,
      [`${base}-mark.png`, `${base}-text.png`, "-composite", out],
      { stdio: "ignore" },
    );
  };

  lockup(INK_LIGHT, CANVAS_LIGHT, join(OUT, "lobster-lockup-light-1200.png"), 1200);
  lockup(INK_DARK, CANVAS_DARK, join(OUT, "lobster-lockup-dark-1200.png"), 1200);
  console.log("  2 lockup png (light + dark)");

  console.log(`\n  Written to docs/brand/\n`);
}

main();
