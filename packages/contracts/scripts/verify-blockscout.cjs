#!/usr/bin/env node
/**
 * Verifies a deployed contract on the HSK testnet Blockscout explorer.
 *
 * Why this exists: `hardhat verify` posts the whole standard-JSON input to
 * https://testnet-explorer.hskchain.net, whose API gateway (APISIX/openresty) answers
 * "413 Request Entity Too Large" above ~100 KB (measured 2026-09-19: 94 KB passes, 100 KB fails).
 * Contracts that depend on OpenZeppelin's SignatureChecker (AgreementFactoryRegistry,
 * ConservationAgreement) exceed that. MockUSD is small enough for `npm run verify:hsk`.
 *
 * Strategy: send only the sources in the contract's own dependency closure. If that still
 * exceeds the limit, strip comments and indentation. Stripping does not change the executable
 * bytecode but changes the metadata hash, so Blockscout reports a PARTIAL match. The script says so.
 *
 * Usage (from packages/contracts, after `hardhat compile`):
 *   node scripts/verify-blockscout.cjs <address> <ContractName>
 */
const fs = require("fs");
const path = require("path");

const EXPLORER = process.env.BLOCKSCOUT_URL || "https://testnet-explorer.hskchain.net";
const LIMIT_BYTES = 95_000; // stay under the measured ~100 KB gateway limit

function stripSource(src) {
  const spdx = (src.match(/^\s*\/\/\s*SPDX-License-Identifier:[^\n]*/m) || [""])[0].trim();
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      out += " ";
    } else if (c === "/" && d === "/") {
      const j = src.indexOf("\n", i);
      i = j < 0 ? n : j;
    } else {
      out += c;
      i++;
    }
  }
  const body = out.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  return (spdx ? spdx + "\n" : "") + body + "\n";
}

function findBuild(contractName) {
  const dir = path.join(__dirname, "..", "artifacts", "build-info");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".output.json"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const build = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const [sourcePath, contracts] of Object.entries(build.output.contracts || {})) {
      if (contracts[contractName]) return { build, sourcePath };
    }
  }
  throw new Error(`No build-info contains ${contractName}. Run \`hardhat compile\` first.`);
}

async function main() {
  const [address, contractName] = process.argv.slice(2);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address || "") || !contractName) {
    console.error("Usage: node scripts/verify-blockscout.cjs <address> <ContractName>");
    process.exit(2);
  }

  const { build, sourcePath } = findBuild(contractName);
  const metadata = JSON.parse(build.output.contracts[sourcePath][contractName].metadata);
  const needed = Object.keys(metadata.sources);
  const input = { ...build.input, sources: Object.fromEntries(needed.map((k) => [k, build.input.sources[k]])) };

  let payload = JSON.stringify(input);
  let partial = false;
  console.log(`${contractName}: ${needed.length} sources, ${payload.length} bytes of standard JSON`);
  if (payload.length > LIMIT_BYTES) {
    for (const v of Object.values(input.sources)) v.content = stripSource(v.content);
    payload = JSON.stringify(input);
    partial = true;
    console.log(`Over the gateway limit: comments/indentation stripped -> ${payload.length} bytes (expect a PARTIAL match)`);
    if (payload.length > LIMIT_BYTES) throw new Error("Still over the gateway limit after stripping; cannot submit.");
  }

  const form = new FormData();
  form.append("compiler_version", `v${build.solcLongVersion}`);
  form.append("contract_name", contractName);
  form.append("autodetect_constructor_args", "true");
  form.append("license_type", "mit");
  form.append("files[0]", new Blob([payload], { type: "application/json" }), "input.json");

  const res = await fetch(`${EXPLORER}/api/v2/smart-contracts/${address}/verification/via/standard-input`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  console.log(`Submit: HTTP ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) process.exit(1);

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const r = await fetch(`${EXPLORER}/api/v2/smart-contracts/${address}`);
    const j = await r.json().catch(() => ({}));
    if (j.is_verified) {
      console.log(
        `Verified on explorer: name=${j.name} partial=${j.is_partially_verified} ` +
          `(sources stripped by this script: ${partial}) ${EXPLORER}/address/${address}#code`
      );
      return;
    }
  }
  console.error("Not verified after 48 s. Check the explorer page for a verification error.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
