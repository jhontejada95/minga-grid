import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <SiteHeader variant="app" />
      <main className="min-h-screen w-full bg-background pt-[124px]">{children}</main>
      <Footer />
    </div>
  );
}
