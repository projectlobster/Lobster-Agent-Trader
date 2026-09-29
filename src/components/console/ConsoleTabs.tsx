"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Tutorial } from "./Tutorial";

const tabs = [
  { href: "/console", label: "Dashboard" },
  { href: "/console/runs", label: "Runs" },
  { href: "/console/agent", label: "Agent" },
  { href: "/console/settings", label: "Settings" },
];

export function ConsoleTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3">
      <nav aria-label="Console" className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-button px-3 py-1.5 font-mono text-label-sm uppercase transition-colors",
                active ? "bg-ink text-canvas" : "text-ink-muted hover:bg-surface hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Tutorial />
    </div>
  );
}
