"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-plate/60 p-4 pt-16 backdrop-blur-sm">
      <div className={cn("w-full bg-surface", width)}>
        <div className="flex items-center justify-between gap-6 border-b border-line px-5 py-3">
          <p className="font-mono text-label-sm uppercase text-ink-muted">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-label-sm uppercase text-ink-muted transition-colors hover:text-ink"
          >
            CLOSE
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
