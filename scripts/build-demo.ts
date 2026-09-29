import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

/**
 * Builds the landing page as a static bundle for GitHub Pages.
 *
 * GitHub Pages serves files and nothing else, so the console cannot be part of
 * this build: every console route reads SQLite and every API route would need a
 * running server, neither of which a static host provides. Rather than making
 * twelve route files conditional, the console and api trees are moved aside for
 * the duration of the build and restored afterwards — the repo is left exactly as
 * it was found, and a failure part-way through still restores them.
 *
 * Run with: npm run build:demo
 */

const ROOT = process.cwd();
const OUT = join(ROOT, "out");
const REPO = "https://github.com/projectlobster/Lobster-Agent-Trader";
const MOVED = [join(ROOT, "src/app/console"), join(ROOT, "src/app/api")];
const STASH = join(ROOT, ".demo-stash");

function log(message: string) {
  console.log(`  ${message}`);
}

function stash() {
  rmSync(STASH, { recursive: true, force: true });
  mkdirSync(STASH, { recursive: true });
  MOVED.forEach((path, index) => {
    if (existsSync(path)) renameSync(path, join(STASH, `moved-${index}`));
  });
}

function restore() {
  MOVED.forEach((path, index) => {
    const back = join(STASH, `moved-${index}`);
    if (existsSync(back)) {
      rmSync(path, { recursive: true, force: true });
      renameSync(back, path);
    }
  });
  rmSync(STASH, { recursive: true, force: true });
}

function main() {
  console.log("\n  Building the static demo → out/\n");

  stash();
  try {
    execSync("npx next build", {
      stdio: "inherit",
      env: { ...process.env, LOBSTER_DEMO: "1" },
    });

    if (!existsSync(OUT)) {
      console.error("\n  expected an out/ directory after next build.\n");
      process.exit(1);
    }

    // The console is not part of this build, so every link to it would 404.
    // Point them at the repository and reword the buttons, rather than shipping
    // a demo whose call to action leads nowhere. Some hrefs carry basePath and
    // some are plain (they come from the RSC payload rather than markup), so
    // both forms are replaced and the result is verified.
    const index = join(OUT, "index.html");
    const html = readFileSync(index, "utf8");
    const patched = html
      .replace(/href="[^"]*\/console[^"]*"/g, `href="${REPO}#quick-start"`)
      .replace(/href="[^"]*\/api\/[^"]*"/g, `href="${REPO}"`)
      .replace(/Open the console/g, "View on GitHub")
      .replace(/Open Console/g, "View on GitHub")
      .replace(/Configure the allowance/g, "Read the setup guide");
    if (patched !== html) {
      writeFileSync(index, patched);
      log("pointed console links at the repository");
    }

    const leftover = patched.match(/href="[^"]*\/console/g) ?? [];
    if (leftover.length > 0) {
      console.error(`\n  ${leftover.length} console link(s) would 404 in the demo.\n`);
      process.exit(1);
    }

    const size = readFileSync(index, "utf8").length;
    log(`out/index.html ready (${Math.round(size / 1024)} KB)`);
  } finally {
    restore();
    log("restored console and api routes");
  }

  console.log(`\n  Preview it with: npx serve out\n`);
}

main();
