import Link from "next/link";
import { Brand } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ButtonLink } from "@/components/ui/Button";

export function Nav() {
  return (
    <header className="relative z-40 bg-canvas">
      <div className="flex h-18 items-center justify-between gap-6 px-5 md:px-10">
        <Link href="/" aria-label="Lobster Agent Trader home" className="flex items-center gap-2.5 text-ink">
          <Brand />
        </Link>

        <div className="flex shrink-0 items-center gap-5">
          <ThemeToggle />
          <ButtonLink href="/console" size="sm">
            Open Console
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
