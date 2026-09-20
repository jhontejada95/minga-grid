import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { chain, RPC_URL, WALLETCONNECT_PROJECT_ID } from "./config";

/**
 * Wallet connectors:
 *  - injected: browser and in-app-browser wallets. EIP-6963 discovery (on by default) lists every installed wallet
 *    (MetaMask, Rabby, Coinbase Wallet extension, ...) individually.
 *  - WalletConnect: mobile wallets via QR code or deep link. Enabled only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 * Standard (EOA) wallets are supported; smart-contract and passkey wallets are not part of this demo.
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  transports: { [chain.id]: http(RPC_URL) },
  connectors: [
    injected(),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: "MINGA Grid",
              description: "Get paid for the electricity you do not use when the grid is about to fall (HSK testnet demonstration)",
              url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  ssr: true,
});
