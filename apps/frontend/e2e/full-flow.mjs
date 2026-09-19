/**
 * End-to-end run of the whole product through the real UI, on the LOCAL stack only (anvil + real contracts + real backend).
 *
 *   1. npm run local:stack --workspace=@minga/backend        (anvil :8545, API :4100)
 *   2. build + serve the frontend against it on :3100         (see docs/local-stack.md)
 *   3. node apps/frontend/e2e/full-flow.mjs
 *
 * The browser is real (Microsoft Edge via playwright-core). Only the wallet is simulated: an EIP-1193 provider injected into the
 * page forwards signing requests to this script, which signs with anvil's public development accounts. Every contract call,
 * signature, API request and indexer read is the real code path. This does NOT prove behaviour with MetaMask, Rabby or
 * WalletConnect, nor on HSK testnet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = JSON.parse(fs.readFileSync(path.resolve(here, "../../../.local-stack/stack.json"), "utf8"));
const OUT = process.env.E2E_SHOTS || path.resolve(here, "../../../.local-stack/shots");
fs.mkdirSync(OUT, { recursive: true });

const MNEMONIC = "test test test test test test test test test test test junk";
const acct = (i) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
const A = { funder: acct(1), community: acct(2), reviewer: acct(3), payeeCommunity: acct(4), payeeMonitoring: acct(5), outsider: acct(6) };
const chainDef = { id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [stack.rpc] } } };
const publicClient = createPublicClient({ chain: chainDef, transport: http(stack.rpc) });
const walletFor = (a) => createWalletClient({ account: a, chain: chainDef, transport: http(stack.rpc) });

let current = A.funder;
let authorized = false;

async function forward(method, params) {
  const res = await fetch(stack.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function rpc(method, params = []) {
  switch (method) {
    case "eth_chainId": return "0x7a69";
    case "net_version": return "31337";
    // Like a real wallet: no accounts are exposed until the user connects.
    case "eth_accounts": return authorized ? [current.address] : [];
    case "eth_requestAccounts": authorized = true; return [current.address];
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain": return null;
    case "wallet_getPermissions":
    case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": return current.signMessage({ message: { raw: params[0] } });
    case "eth_signTypedData_v4": {
      const td = JSON.parse(params[1]);
      const { EIP712Domain: _ignored, ...types } = td.types;
      const message = { ...td.message };
      for (const f of types[td.primaryType]) if (/^u?int/.test(f.type)) message[f.name] = BigInt(message[f.name]);
      return current.signTypedData({ domain: { ...td.domain, chainId: Number(td.domain.chainId) }, types, primaryType: td.primaryType, message });
    }
    case "eth_sendTransaction": {
      const tx = params[0];
      return walletFor(current).sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined });
    }
    default: return forward(method, params);
  }
}

const INIT = `(() => {
  const listeners = {};
  const provider = {
    request: ({ method, params }) => window.__mingaRpc(method, params || []),
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || new Set()).add(fn); },
    removeListener: (ev, fn) => { if (listeners[ev]) listeners[ev].delete(fn); },
  };
  window.__mingaEmit = (ev, arg) => { (listeners[ev] || []).forEach((f) => f(arg)); };
  const info = { uuid: 'minga-e2e-wallet', name: 'E2E Wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'test.minga.e2e' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;

const results = [];
const problems = [];
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 1500 } });
await context.exposeFunction("__mingaRpc", (m, p) => rpc(m, p));
await context.addInitScript(INIT);
const page = await context.newPage();
page.setDefaultTimeout(60_000);
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console.error: ${m.text().slice(0, 300)}`); });

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const text = (t) => page.getByText(t, { exact: false }).first();
const button = (name) => page.getByRole("button", { name });

async function switchTo(account) {
  current = account;
  await page.evaluate((a) => window.__mingaEmit("accountsChanged", [a]), account.address);
  await page.waitForTimeout(800);
}

/** Click a wallet action and wait for the UI outcome that only exists once the tx is confirmed and indexed. Fails fast on a shown error. */
async function clickAndWait(btn, done) {
  await btn.click();
  const failure = page.getByText(/Simulation failed|The transaction failed|reverted on-chain/).first();
  await Promise.race([
    done.first().waitFor({ timeout: 60_000 }),
    failure.waitFor({ timeout: 60_000 }).then(async () => { throw new Error(`transaction error shown: ${(await failure.textContent())?.slice(0, 200)}`); }),
  ]);
}
async function ensureSignedIn() {
  const gate = button(/Sign in with wallet/);
  if (await gate.count()) { await gate.first().click(); await page.waitForTimeout(1500); }
}

try {
  // ------------------------------------------------------------------ 1. connect + create agreement (funder)
  await page.goto(`${stack.frontend}/app/agreements/new`);
  await button(/Connect wallet/).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /E2E Wallet/ }).click();
  await page.getByText(/^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/).first().waitFor();
  step("wallet connects through the injected (EIP-6963) provider", true);

  await text("Fill with the demo example").click();
  await page.getByLabel("Community representative (signs milestones)").fill(A.community.address);
  await page.getByLabel("Independent reviewer").fill(A.reviewer.address);
  await page.getByLabel("Community payment recipient").fill(A.payeeCommunity.address);
  await page.getByLabel("Monitoring payment recipient").fill(A.payeeMonitoring.address);
  await page.getByLabel("Project name").fill(`E2E Mangrove ${Date.now()}`);
  await button(/Review agreement/).click();
  await text("Review before creating").waitFor();
  await shot("01-review");
  await button(/Create agreement on HSK/).click();
  await page.waitForURL(/\/app\/agreements\/0x[0-9a-fA-F]{40}$/, { timeout: 90_000 });
  const agreement = page.url().split("/").pop();
  step("agreement created from the UI (draft saved, factory tx confirmed, redirect)", true, agreement);

  // Wait for the indexer to pick it up.
  await text("Awaiting acceptance").first().waitFor({ timeout: 60_000 });
  await text("Checked against the chain").waitFor();
  await page.getByText("Terms hash recomputed from the on-chain values").waitFor();
  const checks = await page.locator("text=Terms hash recomputed from the on-chain values").locator("xpath=preceding-sibling::span").first().textContent();
  step("terms verified against the chain before anyone accepts", checks === "check_circle", `icon=${checks}`);
  await shot("02-created");

  // ------------------------------------------------------------------ 2. accept terms (community, reviewer)
  for (const [who, acc] of [["community representative", A.community], ["reviewer", A.reviewer]]) {
    await switchTo(acc);
    await page.getByRole("heading", { name: "Accept the terms" }).waitFor();
    await clickAndWait(button(/Accept terms/), page.getByText(/You accepted these terms|Both signers accepted/));
    step(`${who} accepts the terms (on-chain)`, true);
  }

  // ------------------------------------------------------------------ 3. fund (funder)
  await switchTo(A.funder);
  await page.getByRole("heading", { name: "Fund the escrow" }).waitFor({ timeout: 60_000 });
  await clickAndWait(button(/Approve exactly/), button(/Allowance in place/));
  await button(/Fund 100\.00 mUSD/).waitFor({ state: "visible" });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /Fund 100\.00 mUSD/.test(x.textContent || "")); return b && !b.disabled; });
  await clickAndWait(button(/Fund 100\.00 mUSD/), page.getByText(/Funded$/));
  await page.getByText(/Funded$/).first().waitFor({ timeout: 60_000 });
  const escrow = await publicClient.readContract({ address: stack.token, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [agreement] });
  step("funder approves the exact budget and funds the escrow", escrow === 100_000_000n, `escrow=${formatUnits(escrow, 6)} mUSD`);
  await shot("03-funded");

  // ------------------------------------------------------------------ 4. evidence (community)
  await switchTo(A.community);
  await page.getByRole("tab", { name: /Milestone 1/ }).click();
  await ensureSignedIn();
  await text("Add a file").waitFor();
  const files = [
    ["baseline-report.json", { survey: "baseline", plots: 12, notes: "Baseline survey of the demo mangrove plots." }],
    ["assembly-resolution.json", { resolution: "community assembly approves the work plan", attendees: 41 }],
  ];
  for (const [name, body] of files) {
    await page.locator("#upload-0").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(body)) });
    await text(`${name} uploaded. Its SHA-256 matches`).waitFor();
  }
  step("evidence files upload and the SHA-256 is verified against the browser's own hash", true);

  await page.getByLabel("Include baseline-report.json").check();
  await page.getByLabel("Include assembly-resolution.json").check();
  await page.getByLabel("Requirement covered by baseline-report.json").selectOption("baseline-survey-v1");
  await page.getByLabel("Requirement covered by assembly-resolution.json").selectOption("community-assembly-resolution");
  await button(/Create evidence version from 2 selected files/).click();
  await text("Evidence version 1 created.").waitFor();
  await shot("04-evidence");
  step("evidence version created from the selected files", true);

  // ------------------------------------------------------------------ 5. observer cannot see private data
  await switchTo(A.outsider);
  await text("private to the three participants").waitFor();
  step("a non-participant sees the private sections locked", true);

  // ------------------------------------------------------------------ 6. review + sign (reviewer, community)
  await switchTo(A.reviewer);
  await ensureSignedIn();
  await button(/Run review of version 1/).click();
  await text("Document checks only").waitFor();
  await text("Ready for human review").first().waitFor();
  step("review runs (document checks only: no AI key configured in the local stack)", true);
  await shot("05-review");

  await button(/Prepare approval for the current evidence/).click();
  await text("Checked in your browser before you sign").waitFor();
  const bad = await page.locator("svg, span.material-symbols-outlined").filter({ hasText: "error" }).count();
  await button(/Sign as independent reviewer/).click();
  await text("You signed this approval.").waitFor();
  step("reviewer verifies and signs the EIP-712 approval", bad === 0, bad ? `${bad} failing checks` : "all checks passed");

  await switchTo(A.community);
  await ensureSignedIn();
  await button(/Sign as community representative/).waitFor();
  await button(/Sign as community representative/).click();
  await text("Both signatures are in.").first().waitFor();
  await shot("06-signed");
  step("community representative signs the same approval", true);

  // ------------------------------------------------------------------ 7. release (anyone; use the funder)
  await switchTo(A.funder);
  await ensureSignedIn();
  const balBefore = { c: await erc20(A.payeeCommunity.address), m: await erc20(A.payeeMonitoring.address) };
  await clickAndWait(button(/Release 50\.00 mUSD/), text("Payment receipt"));
  await text("Payment receipt").waitFor({ timeout: 60_000 });
  const balAfter = { c: await erc20(A.payeeCommunity.address), m: await erc20(A.payeeMonitoring.address) };
  const okSplit = balAfter.c - balBefore.c === 40_000_000n && balAfter.m - balBefore.m === 10_000_000n;
  step("release pays 80/20 to the two recipients and shows the on-chain receipt", okSplit, `community +${formatUnits(balAfter.c - balBefore.c, 6)}, monitoring +${formatUnits(balAfter.m - balBefore.m, 6)}`);
  await shot("07-paid");

  await page.getByRole("tab", { name: "Activity" }).click();
  await text("Milestone paid").first().waitFor();
  step("activity lists the on-chain events", true);
  await shot("08-activity");
} catch (err) {
  step("flow aborted", false, String(err && err.message ? err.message.split("\n").slice(0, 8).join(" | ") : err));
  await shot("zz-failure").catch(() => {});
} finally {
  await browser.close();
}

async function erc20(who) {
  return publicClient.readContract({ address: stack.token, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [who] });
}

console.log("\nBrowser problems:", problems.length ? "\n  " + [...new Set(problems)].join("\n  ") : "none");
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
