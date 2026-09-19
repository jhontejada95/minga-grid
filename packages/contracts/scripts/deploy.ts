import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const EXPLORERS: Record<string, string> = {
  "133": "https://testnet-explorer.hskchain.net",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account configured. Set DEPLOYER_PRIVATE_KEY (0x-prefixed) in the root .env file."
    );
  }

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  const explorer = EXPLORERS[chainId] ?? "";
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("==================================================");
  console.log("MINGA Nature — Deploying Contracts");
  console.log("Deployer:", deployer.address);
  console.log("Network:", network.name, "| Chain ID:", chainId);
  console.log("Gas balance:", ethers.formatEther(balance), "(native token)");
  console.log("==================================================");

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has no gas on chain ${chainId}. Fund it from the faucet and retry.`
    );
  }

  // 1. Deploy MockUSD
  console.log("Deploying MockUSD (mUSD)...");
  const mockUSD = await (await ethers.getContractFactory("MockUSD")).deploy();
  const mockUSDReceipt = await mockUSD.deploymentTransaction()!.wait();
  const mockUSDAddress = await mockUSD.getAddress();
  console.log("MockUSD deployed at:", mockUSDAddress);

  // 2. Deploy AgreementFactoryRegistry
  console.log("Deploying AgreementFactoryRegistry...");
  const factory = await (await ethers.getContractFactory("AgreementFactoryRegistry")).deploy();
  const factoryReceipt = await factory.deploymentTransaction()!.wait();
  const factoryAddress = await factory.getAddress();
  console.log("AgreementFactoryRegistry deployed at:", factoryAddress);

  // The indexer must start at the block where the factory was actually created,
  // not at whatever the chain head is when this script finishes.
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    mockUSD: {
      address: mockUSDAddress,
      txHash: mockUSDReceipt!.hash,
      blockNumber: mockUSDReceipt!.blockNumber,
    },
    factory: {
      address: factoryAddress,
      txHash: factoryReceipt!.hash,
      blockNumber: factoryReceipt!.blockNumber,
    },
    factoryDeploymentBlock: factoryReceipt!.blockNumber,
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("==================================================");
  console.log("Saved deployment metadata to:", outputPath);
  if (explorer) {
    console.log("MockUSD  :", `${explorer}/address/${mockUSDAddress}`);
    console.log("Factory  :", `${explorer}/address/${factoryAddress}`);
    console.log("MockUSD tx:", `${explorer}/tx/${mockUSDReceipt!.hash}`);
    console.log("Factory tx:", `${explorer}/tx/${factoryReceipt!.hash}`);
  }
  console.log("\nCopy these into the root .env:");
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`FACTORY_DEPLOYMENT_BLOCK=${factoryReceipt!.blockNumber}`);
  console.log(`MOCK_USD_ADDRESS=${mockUSDAddress}`);
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`NEXT_PUBLIC_MOCK_USD_ADDRESS=${mockUSDAddress}`);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
