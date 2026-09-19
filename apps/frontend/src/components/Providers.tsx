"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { api } from "@/data/api";
import { useMe } from "@/data/queries";

/** Ends a backend session that belongs to a different account than the one connected now (or to no account). */
function SessionSync() {
  const { address, status } = useAccount();
  const me = useMe();
  const qc = useQueryClient();
  const sessionWallet = me.data?.wallet ?? null;

  useEffect(() => {
    if (!sessionWallet) return;
    const mismatch = status === "connected" && address?.toLowerCase() !== sessionWallet;
    const gone = status === "disconnected";
    if (!mismatch && !gone) return;
    void api("/api/v1/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => qc.invalidateQueries());
  }, [address, status, sessionWallet, qc]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <SessionSync />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
