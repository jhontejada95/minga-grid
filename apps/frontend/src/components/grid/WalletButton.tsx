"use client";

/**
 * Connect, disconnect and network guard.
 *
 * A wallet is never required to watch a settlement — no human signature takes part in one. It is
 * required only to RELAY the transaction or to fund a programme, and the copy says so, because
 * "connect your wallet" in front of the main flow would contradict the product on screen.
 */
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "@/lib/config";
import { short } from "@/lib/grid";

const INK = "#F8FAFC";
const INK_2 = "#94A3B8";
const MUTED = "#64748B";
const HAIRLINE = "#1E293B";
const BLUE = "#3B82F6";
const WARN = "#F59E0B";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const usable = connectors.filter((c) => c.type !== "mock");
    return (
      <div className="flex flex-wrap items-center gap-2">
        {usable.map((c) => (
          <button
            key={c.uid}
            type="button"
            onClick={() => connect({ connector: c })}
            disabled={isPending}
            className="rounded-md border px-3 py-1.5 text-[13px] disabled:opacity-50"
            style={{ borderColor: HAIRLINE, color: INK_2 }}
          >
            {isPending ? "Connecting…" : `Connect ${c.name}`}
          </button>
        ))}
        {usable.length === 0 && (
          <span className="text-[12px]" style={{ color: MUTED }}>
            No wallet detected. Install a browser wallet, or set a WalletConnect project id to enable mobile wallets.
          </span>
        )}
      </div>
    );
  }

  const wrongNetwork = chainId !== CHAIN_ID;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {wrongNetwork && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: CHAIN_ID })}
          className="rounded-md border px-3 py-1.5 text-[13px]"
          style={{ borderColor: WARN, color: WARN }}
        >
          Switch to HSK testnet
        </button>
      )}
      <span className="rounded-md border px-3 py-1.5 text-[13px]" style={{ borderColor: HAIRLINE, color: INK, fontFamily: MONO }}>
        {short(address!)}
      </span>
      <button type="button" onClick={() => disconnect()} className="text-[12px] underline underline-offset-2" style={{ color: MUTED }}>
        Disconnect
      </button>
    </div>
  );
}

export const walletTokens = { INK, INK_2, MUTED, HAIRLINE, BLUE };
