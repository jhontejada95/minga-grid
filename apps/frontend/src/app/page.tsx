import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { LandingSections } from "@/components/landing/LandingSections";

export default function LandingPage() {
  return (
    <div className="bg-surface">
      <SiteHeader variant="landing" />
      <main className="w-full bg-surface pt-28">
        <div className="flex w-full flex-col">
          <LandingSections />
        </div>
      </main>
      <Footer />
    </div>
  );
}
