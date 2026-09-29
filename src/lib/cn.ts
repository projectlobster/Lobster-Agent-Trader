import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Tailwind v4 puts font sizes and text colours in the same `text-*` namespace.
 * tailwind-merge cannot tell our custom tokens apart on its own, so it treated
 * `text-canvas` (a colour) and `text-body-xs` (a size) as the same class group
 * and silently dropped whichever came first — which made primary buttons render
 * dark-on-dark. Both scales are declared explicitly below.
 */
const FONT_SIZES = [
  "hero",
  "display",
  "h1",
  "h2",
  "h2-cta",
  "card-title",
  "lede",
  "lede-lg",
  "body",
  "body-sm",
  "body-xs",
  "label",
  "label-sm",
  "label-xs",
  "mono-xs",
];

const TEXT_COLORS = [
  "canvas",
  "ink",
  "ink-muted",
  "ink-subtle",
  "surface",
  "line",
  "line-control",
  "accent",
  "panel",
  "panel-fg",
  "panel-fg-muted",
  "panel-fg-label",
  "panel-code",
  "plate",
  "tint-cyan",
  "tint-mint",
  "tint-mint-strong",
  "tint-yellow",
  "tint-yellow-strong",
  "tint-blue",
  "tint-fg",
  "tint-blue-fg",
  "positive",
  "negative",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
      "text-color": [{ text: TEXT_COLORS }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
