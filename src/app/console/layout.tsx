import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { ConsoleTabs } from "@/components/console/ConsoleTabs";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="flex-1 pb-20">
        <div className="page-measure">
          <ConsoleTabs />
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
