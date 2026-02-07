const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying RenovationEscrow contract to Arc Testnet...\n");

  try {
    // Get deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("📝 Deploying with account:", deployer.address);

    // Check balance
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", hre.ethers.formatEther(balance), "USDC\n");

    if (balance === 0n) {
      console.error("❌ Error: Deployer account has no USDC for gas fees");
      console.log("Please get testnet USDC from: https://faucet.circle.com");
      process.exit(1);
    }

    // Get the contract factory
    console.log("📦 Preparing contract deployment...");
    const RenovationEscrow = await hre.ethers.getContractFactory("RenovationEscrow");

    // Deploy the contract (don't wait for deployment yet)
    console.log("⏳ Sending deployment transaction...");
    const renovationEscrow = await RenovationEscrow.deploy();

    console.log("📡 Transaction sent! Hash:", renovationEscrow.deploymentTransaction().hash);
    console.log("⏰ Waiting for confirmation (this may take a minute)...\n");

    // Wait for deployment with better timeout handling
    try {
      await renovationEscrow.waitForDeployment();
      const address = await renovationEscrow.getAddress();

      console.log("✅ SUCCESS! RenovationEscrow deployed to:", address);
      console.log("\n" + "=".repeat(60));
      console.log("📋 Next Steps:");
      console.log("=".repeat(60));
      console.log("\n1. Save this address to your .env.local file:");
      console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
      console.log("\n2. View your contract on Arc Explorer:");
      console.log(`   https://arc-testnet-explorer.url/address/${address}`);
      console.log("\n3. (Optional) Verify the contract:");
      console.log(`   npx hardhat verify --network arcTestnet ${address}\n`);

    } catch (waitError) {
      console.log("⚠️  Deployment transaction was sent but confirmation timed out");
      console.log("This is likely due to RPC rate limiting, but the contract may still be deploying.");
      console.log("\nTransaction hash:", renovationEscrow.deploymentTransaction().hash);
      console.log("\nPlease check the transaction status on Arc Explorer:");
      console.log("https://arc-testnet-explorer.url/tx/" + renovationEscrow.deploymentTransaction().hash);
      console.log("\nOnce confirmed, get the contract address from the explorer and add it to .env.local");
    }

  } catch (error) {
    console.error("\n❌ Deployment failed:");

    if (error.message.includes("insufficient funds")) {
      console.error("Insufficient funds for gas. Please get testnet USDC from:");
      console.error("https://faucet.circle.com");
    } else if (error.message.includes("nonce")) {
      console.error("Nonce error. Try resetting your MetaMask account or waiting a moment.");
    } else if (error.message.includes("timeout")) {
      console.error("RPC timeout. The contract may still be deploying.");
      console.error("Check your transaction on Arc Explorer.");
    } else {
      console.error(error.message);
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
