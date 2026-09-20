import { Providers } from "@/components/Providers";

/** Only the app needs wallet context. The landing stays static. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
