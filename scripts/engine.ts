import { runOnce } from "@/lib/agent/engine";
import { findKitDir } from "@/lib/kit/locate";
import { getEngineState, updateEngineState } from "@/lib/store/engine";
import { readSettings, resolveApiKey, type TradingMode } from "@/lib/store/settings";
import { loadDotEnv } from "@/lib/load-env";

function parseArgs(argv: string[]) {
  const options = { once: false, interval: null as number | null, mode: null as TradingMode | null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") options.once = true;
    else if (arg === "--interval") options.interval = Number(argv[++index]);
    else if (arg === "--mode") {
      const value = argv[++index];
      if (value === "paper" || value === "live") options.mode = value;
    }
  }
  return options;
}

function sleep(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// .env.local is a Next convention; the scripts have to load it themselves.
loadDotEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const settings = readSettings();

  if (!findKitDir()) {
    console.error("lighter-agent-kit not found. Run `npm run setup` first.");
    process.exit(1);
  }

  if (!resolveApiKey(settings)) {
    console.error(
      `No API key for ${settings.llm.provider}. Add one in Settings, or set it in .env.local.`,
    );
    process.exit(1);
  }

  const current = getEngineState();
  const mode: TradingMode = options.mode ?? (current.mode as TradingMode) ?? "paper";
  const interval = options.interval ?? settings.agent.intervalSeconds;

  if (mode === "live") {
    if (!settings.liveEnabled || process.env.LIGHTER_ENABLE_LIVE !== "1") {
      console.error(
        "Refusing to run live: needs the Settings switch and LIGHTER_ENABLE_LIVE=1 in the environment.",
      );
      process.exit(1);
    }
  }

  updateEngineState({ running: true, mode, intervalSeconds: interval, stopReason: null });

  const runCycle = async () => {
    const attempt = await runOnce();
    if (attempt.kind === "busy") {
      console.log(`${new Date().toISOString()}  skipped (${attempt.reason})`);
      return null;
    }
    const result = attempt.result;
    console.log(
      `${new Date().toISOString()}  ${result.status.padEnd(8)} ${result.mode.padEnd(5)} ` +
        `${(result.decision?.action ?? "-").padEnd(6)} ${result.decision?.symbol ?? "-"}  ` +
        `tok ${result.tokens.input + result.tokens.output}  $${result.tokens.costUsd.toFixed(4)}` +
        (result.error ? `\n    ${result.error}` : ""),
    );
    return result;
  };

  if (options.once) {
    const result = await runCycle();
    updateEngineState({ running: false, lastTickAt: new Date().toISOString() });
    process.exit(result && result.status === "error" ? 1 : 0);
  }

  console.log(
    `engine running · mode=${mode} · every ${interval}s · one shared cycle lease · ctrl-c to stop`,
  );
  let stop = false;
  process.on("SIGINT", () => {
    console.log("\nstopping…");
    stop = true;
  });

  while (!stop) {
    const result = await runCycle();

    if (
      result &&
      (result.stopReason === "budget_exhausted" ||
        result.stopReason === "llm_not_configured" ||
        result.blockedBy.includes("daily_loss_limit"))
    ) {
      console.log(`\nstopping engine: ${result.stopReason ?? "daily_loss_limit"}`);
      break;
    }

    for (let elapsed = 0; elapsed < interval && !stop; elapsed += 1) {
      await sleep(1);
    }
  }

  updateEngineState({ running: false, lastTickAt: new Date().toISOString() });
}

main().catch((error) => {
  console.error(error);
  updateEngineState({ running: false, lastError: String(error) });
  process.exit(1);
});
