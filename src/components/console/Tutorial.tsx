"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";

const SEEN_KEY = "lighter-trader-tutorial-seen";

type Step = {
  index: string;
  title: string;
  body: string;
  bullets: string[];
};

const STEPS: Step[] = [
  {
    index: "01",
    title: "Start from your monthly allowance",
    body: "You already pay for a monthly AI token budget. Whatever you do not spend on ordinary work normally just expires. Lobster Agent Trader turns that remainder into an explicit number the agent is allowed to burn, and stops the moment it runs out.",
    bullets: [
      "budget − reserved for real work = tradable allowance",
      "Every cycle's token spend is recorded, per model and per day",
      "Unused allowance can carry into the next period",
    ],
  },
  {
    index: "02",
    title: "Configure the model and the budget",
    body: "On the Settings page, pick a provider and model, paste an API key, and set the monthly budget plus the part you want reserved for normal work. Then choose the markets to watch and the limits the agent has to stay inside.",
    bullets: [
      "OpenRouter is the quickest start — many models are free",
      "“Test model” sends one tiny request to prove the key works",
      "Environment variables always win over anything saved in the UI",
    ],
  },
  {
    index: "03",
    title: "Run one cycle, or let it loop",
    body: "On the Agent page, “Run once” makes a single decision so you can see the whole path. “Start engine” repeats it on an interval. Every cycle is archived, including the ones the guardrails refused.",
    bullets: [
      "Each run keeps the snapshot, the model's reply, a trace and the cost",
      "The in-page timer dies with the server; use `npm run engine` to run unattended",
      "Both paths share one cycle lease, so they never trade at the same time",
    ],
  },
  {
    index: "04",
    title: "Nothing is live until you say so",
    body: "The app ships in paper mode: a local simulation against Lighter's live order books, with no signing and no broadcast. Going live needs three locks open at once, and every order still has to clear the risk layer first.",
    bullets: [
      "Locks: LIGHTER_ENABLE_LIVE=1, the Settings switch, and a typed confirmation",
      "Guardrails cap notional, leverage, position count, cooldown and daily loss",
      "Paper P&L is not live P&L — it ignores funding and order impact",
    ],
  },
];

export function Tutorial() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Open once on a first visit, and mark it seen as soon as it opens. Marking
    // it only on close meant a user who navigated away without dismissing it
    // got the same modal again on every console page.
    try {
      if (window.localStorage.getItem(SEEN_KEY) !== "1") {
        window.localStorage.setItem(SEEN_KEY, "1");
        setOpen(true);
      }
    } catch {
      // Private mode or storage disabled: just do not auto-open.
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setIndex(0);
  }, []);

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        How it works
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={`how it works · ${step.index} / ${String(STEPS.length).padStart(2, "0")}`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={close}>
              Skip
            </Button>
            <div className="flex-1" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
              disabled={isFirst}
            >
              Back
            </Button>
            {isLast ? (
              <Button size="sm" onClick={close}>
                Got it
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex((current) => current + 1)}>
                Next
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex gap-1.5">
            {STEPS.map((entry, entryIndex) => (
              <button
                key={entry.index}
                type="button"
                aria-label={`Step ${entryIndex + 1}: ${entry.title}`}
                aria-current={entryIndex === index}
                onClick={() => setIndex(entryIndex)}
                className={`h-1 flex-1 transition-colors ${
                  entryIndex <= index ? "bg-ink" : "bg-line"
                }`}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{`Step ${step.index}`}</Label>
            <h2 className="text-h2 text-ink">{step.title}</h2>
          </div>

          <p className="text-body text-ink-muted">{step.body}</p>

          <ul className="flex flex-col gap-2.5 border-t border-line pt-5">
            {step.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-body-sm text-ink">
                <span aria-hidden className="mt-2 size-[6px] shrink-0 bg-tint-cyan" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
