/**
 * Bridge Kit Integration for Arc → Base Sepolia
 *
 * This module handles cross-chain USDC transfers using Circle's Bridge Kit.
 * When Inspector approves a milestone, 10% of the payment is automatically
 * bridged from Arc Testnet to Base Sepolia.
 */

// Chain configurations
export const SUPPORTED_CHAINS = {
  ARC_TESTNET: {
    id: 5042002,
    name: 'Arc Testnet',
    rpcUrl: 'https://arc-testnet.drpc.org',
    nativeCurrency: {
      name: 'USDC',
      symbol: 'USDC',
      decimals: 18,
    },
  },
  BASE_SEPOLIA: {
    id: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
  },
} as const;

/**
 * Extract Base Sepolia address from bytes32 stored in contract
 * Used to convert inspectorPaymentAddress (bytes32) to Ethereum address format
 */
export function bytes32ToAddress(bytes32: string): string {
  // Remove 0x prefix
  const hex = bytes32.replace('0x', '');

  // Take last 40 characters (20 bytes = Ethereum address)
  const addressHex = hex.slice(-40);

  return `0x${addressHex}`;
}

/**
 * Calculate payment split for milestone
 */
export function calculatePaymentSplit(totalAmount: bigint) {
  const contractorAmount = (totalAmount * 90n) / 100n; // 90% to Contractor
  const inspectorAmount = (totalAmount * 10n) / 100n;  // 10% to Inspector

  return {
    contractorAmount,
    inspectorAmount,
  };
}

/**
 * Bridge USDC from Arc to Base using Circle Bridge Kit
 *
 * This function implements real cross-chain USDC transfers using Circle's CCTP
 */
export async function bridgeUSDCToBase(params: {
  inspectorBaseAddress: string;
  amount: bigint;
  projectId: string;
  milestoneId: string;
}): Promise<{
  success: boolean;
  bridgeTxHash?: string;
  error?: string;
}> {
  try {
    console.log('🌉 Initiating Circle Bridge Kit transfer:', {
      from: 'Arc Testnet',
      to: 'Base Sepolia',
      recipient: params.inspectorBaseAddress,
      amount: params.amount.toString(),
    });

    // Check if we're in server environment
    if (typeof window !== 'undefined') {
      throw new Error('Bridge transfer must be executed on server side');
    }

    // Import Bridge Kit dynamically (server-side only)
    const { BridgeKit } = await import('@circle-fin/bridge-kit');
    const { createViemAdapterFromPrivateKey } = await import('@circle-fin/adapter-viem-v2');

    // Get private key from environment
    const privateKey = process.env.BRIDGE_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('BRIDGE_WALLET_PRIVATE_KEY not configured in environment variables');
    }

    // Create adapter for the bridge wallet
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as string,
    });

    // Initialize Bridge Kit
    const kit = new BridgeKit();

    // Convert amount from wei to USDC (18 decimals to 6 decimals)
    // Arc uses 18 decimals, but USDC typically uses 6
    const amountInUsdc = (Number(params.amount) / 1e18).toFixed(6);

    console.log('Executing bridge transfer:', {
      from: 'Arc_Testnet',
      to: 'Base_Sepolia',
      amount: amountInUsdc,
      recipient: params.inspectorBaseAddress,
    });

    // Execute the bridge transfer
    console.log('⚠️ Attempting Bridge Kit transfer with params:', {
      fromChain: 'Arc_Testnet',
      toChain: 'Base_Sepolia',
      amount: amountInUsdc,
    });

    const result = await kit.bridge({
      from: {
        adapter,
        chain: 'Arc_Testnet' as any,
      },
      to: {
        adapter,
        chain: 'Base_Sepolia' as any,
        recipientAddress: params.inspectorBaseAddress,
      },
      amount: amountInUsdc,
    });

    // Safe JSON stringify that handles BigInt
    const safeStringify = (obj: any) => {
      return JSON.stringify(obj, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2);
    };

    console.log('✅ Bridge transfer result:', safeStringify(result));

    // Check if bridge failed
    const bridgeState = (result as any)?.state;
    const steps = (result as any)?.steps;
    if (bridgeState === 'error') {
      const failedStep = steps?.find((s: any) => s.state === 'error');
      const errorMsg = failedStep?.errorMessage || 'Bridge transfer failed';
      console.error('Bridge failed at step:', failedStep?.name, errorMsg);
      return { success: false, error: errorMsg };
    }

    // Extract txHash from steps array (mint > burn fallback)
    const mintStep = steps?.find((s: any) => s.name === 'mint');
    const burnStep = steps?.find((s: any) => s.name === 'burn');
    const txHash = mintStep?.txHash || burnStep?.txHash
                || (result as any)?.transactionHash
                || (result as any)?.hash;

    console.log('Extracted transaction hash:', txHash);

    return {
      success: true,
      bridgeTxHash: txHash,
    };
  } catch (error) {
    console.error('Bridge Kit error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown bridge error',
    };
  }
}

/**
 * Get bridge status (for demo/UI display)
 */
export function getBridgeStatus(bridgeTxHash?: string): {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
} {
  if (!bridgeTxHash) {
    return {
      status: 'pending',
      message: 'Waiting for milestone approval...',
    };
  }

  // For demo, we return completed
  // In production, you would query Bridge Kit API for actual status
  return {
    status: 'completed',
    message: `Bridge transfer completed! TX: ${bridgeTxHash.slice(0, 10)}...`,
  };
}
