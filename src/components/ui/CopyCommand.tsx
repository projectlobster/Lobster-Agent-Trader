"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyCommand({
  command,
  prefix = "$",
  label = "install command",
  wrap = false,
  className,
}: {
  command: string;
  prefix?: string;
  label?: string;
  wrap?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex w-full items-center gap-4 bg-panel px-4 py-3", className)}>
      <pre
        className={cn(
          "min-w-0 flex-1 font-mono text-[12px] leading-5 text-panel-code",
          wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto whitespace-nowrap",
        )}
      >
        <code>
          <span className="select-none text-panel-fg-label">{prefix} </span>
          {command}
        </code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-mono text-label-xs font-medium text-panel-fg-label transition-colors hover:text-panel-fg"
      >
        {copied ? "COPIED" : "COPY"}
        <span className="sr-only"> {label}</span>
      </button>
    </div>
  );
}
