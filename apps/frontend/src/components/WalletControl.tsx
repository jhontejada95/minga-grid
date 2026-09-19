"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { mockUsdAbi } from "@minga/shared";
import { chain, MOCK_USD_ADDRESS, WALLETCONNECT_PROJECT_ID } from "@/lib/config";
import { explorerAddress, formatToken, shortAddress } from "@/lib/format";
import { translateError } from "@/lib/errors";
import { useSession, useSignIn, useSignOut } from "@/data/session";
import { Button, Icon, Notice } from "./ui";

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const [error, setError] = useState<string | null>(null);

  // Generic "injected" is a fallback: hide it when EIP-6963 already listed the installed wallets individually.
  const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const list = connectors.filter((c) => c.id !== "injected" || discovered.length === 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/50 p-4" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Connect a wallet" className="w-full max-w-md rounded-xl bg-surface-container-lowest p-space-lg shadow-[0_8px_24px_-4px_rgba(20,61,43,0.2)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-space-sm flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-primary">Connect a wallet</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-outline hover:text-primary"><Icon name="close" /></button>
        </div>
        <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
          You keep your keys. MINGA never sees them and never signs for you.
        </p>
        <ul className="space-y-space-sm">
          {list.map((c) => (
            <li key={c.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  setError(null);
                  try {
                    await connectAsync({ connector: c, chainId: chain.id });
                    onClose();
                  } catch (err) {
                    setError(translateError(err).message);
                  }
                }}
                className="flex w-full items-center gap-space-md rounded-lg border border-[#e2e8f0] px-space-md py-3 text-left hover:bg-[#f0fdf4] disabled:opacity-60"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-7 w-7 rounded" />
                ) : (
                  <Icon name={c.type === "walletConnect" ? "qr_code_2" : "account_balance_wallet"} className="text-primary" />
                )}
                <span className="flex-1">
                  <span className="block font-label-md text-label-md text-on-surface">
                    {c.id === "injected" ? "Browser wallet" : c.type === "walletConnect" ? "WalletConnect (mobile wallets)" : c.name}
                  </span>
                  {c.type === "walletConnect" && <span className="block font-body-sm text-body-sm text-on-surface-variant">Scan a QR code or open your wallet app</span>}
                </span>
                {isPending && variables?.connector === c && <Icon name="progress_activity" className="animate-spin" />}
              </button>
            </li>
          ))}
        </ul>
        {!WALLETCONNECT_PROJECT_ID && (
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
            Mobile wallets via WalletConnect are not enabled in this build. On a phone, open this page inside your wallet&apos;s browser.
          </p>
        )}
        {error && <Notice tone="error" icon="error" className="mt-space-md">{error}</Notice>}
        <p className="mt-space-md font-code-xs text-code-xs text-outline">
          Smart-contract wallets and passkey wallets are not supported in this demo.
        </p>
      </div>
    </div>
  );
}

export function WalletControl() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { signedIn, sessionWallet } = useSession();
  const signIn = useSignIn();
  const signOut = useSignOut();
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const balance = useReadContract({
    address: MOCK_USD_ADDRESS,
    abi: mockUsdAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && MOCK_USD_ADDRESS), refetchInterval: 10_000 },
  });

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!isConnected || !address) {
    return (
      <>
        <Button variant="onchain" onClick={() => setDialog(true)}>
          <Icon name="account_balance_wallet" className="!text-[18px]" /> Connect wallet
        </Button>
        {dialog && <ConnectDialog onClose={() => setDialog(false)} />}
      </>
    );
  }

  const wrong = chainId !== chain.id;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="flex items-center gap-space-sm rounded-full bg-surface-container px-space-md py-space-xs transition-colors hover:bg-surface-container-high"
      >
        {typeof balance.data === "bigint" && <span className="hidden font-code-sm text-code-sm font-semibold text-primary sm:inline">{formatToken(balance.data)}</span>}
        <span className="hidden text-outline-variant sm:inline">|</span>
        <span className="font-code-xs text-code-xs font-medium text-on-surface">{shortAddress(address)}</span>
        {wrong && <Icon name="warning" className="!text-[16px] text-error" />}
        <Icon name="expand_more" className="!text-[16px] text-on-surface-variant" />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 z-50 mt-space-xs w-72 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest py-space-xs shadow-[0_8px_24px_-4px_rgba(20,61,43,0.12)]">
          <div className="px-space-md py-space-xs font-code-xs text-code-xs text-on-surface-variant">
            {wrong ? "Wrong network" : `Connected to ${chain.name}`}
          </div>
          <div className="px-space-md pb-space-xs font-code-xs text-code-xs text-on-surface-variant">
            {signedIn ? "Signed in — private evidence available" : sessionWallet ? "Signed in with another account" : "Not signed in"}
          </div>
          {!signedIn && (
            <div className="px-space-md pb-space-sm">
              <Button variant="secondary" className="w-full !py-2" busy={signIn.isPending} onClick={() => signIn.mutate()}>
                Sign in (free, no payment)
              </Button>
              {signIn.error && <p className="mt-1 font-code-xs text-code-xs text-error">{translateError(signIn.error).message}</p>}
            </div>
          )}
          <button type="button" role="menuitem" className="flex w-full items-center gap-space-sm px-space-md py-space-xs text-left font-body-sm text-body-sm hover:bg-surface-container-low" onClick={() => navigator.clipboard?.writeText(address)}>
            <Icon name="content_copy" className="!text-[16px]" /> Copy address
          </button>
          <a role="menuitem" href={explorerAddress(address)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-space-sm px-space-md py-space-xs font-body-sm text-body-sm hover:bg-surface-container-low">
            <Icon name="open_in_new" className="!text-[16px]" /> View on explorer
          </a>
          {signedIn && (
            <button type="button" role="menuitem" className="flex w-full items-center gap-space-sm px-space-md py-space-xs text-left font-body-sm text-body-sm hover:bg-surface-container-low" onClick={() => signOut.mutate()}>
              <Icon name="lock" className="!text-[16px]" /> Sign out
            </button>
          )}
          <div className="my-space-xs h-px bg-surface-container-high" />
          <button type="button" role="menuitem" className="flex w-full items-center gap-space-sm px-space-md py-space-xs text-left font-body-sm text-body-sm text-error hover:bg-error-container" onClick={() => { signOut.mutate(); disconnect(); setMenu(false); }}>
            <Icon name="logout" className="!text-[16px]" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

/** Persistent alert when the wallet is on another network. Every transaction button also checks this. */
export function NetworkGate() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [error, setError] = useState<string | null>(null);
  if (!isConnected || chainId === chain.id) return null;
  return (
    <div className="mx-auto max-w-[1280px] px-margin-mobile pt-space-md md:px-margin">
      <Notice tone="error" icon="wifi_off">
        <p className="font-medium">Wrong network. Switch to {chain.name} (chain ID {chain.id}) to continue.</p>
        <div className="mt-space-sm flex flex-wrap gap-space-sm">
          <Button
            variant="onchain"
            className="!py-1.5"
            busy={isPending}
            onClick={async () => {
              setError(null);
              try { await switchChainAsync({ chainId: chain.id }); } catch (e) { setError(translateError(e).message); }
            }}
          >
            Switch network
          </Button>
          <Button
            variant="secondary"
            className="!py-1.5"
            onClick={async () => {
              setError(null);
              try { await walletClient?.addChain({ chain }); } catch (e) { setError(translateError(e).message); }
            }}
          >
            Add {chain.name} to my wallet
          </Button>
        </div>
        {error && <p className="mt-1 font-code-xs text-code-xs">{error}</p>}
      </Notice>
    </div>
  );
}
