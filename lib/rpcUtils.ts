/**
 * RPC Utility functions with retry logic for handling rate limits and timeouts
 */

/**
 * Retry function with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000ms)
 * @returns Promise with the result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if this is a rate limit or timeout error
      const isRateLimitError =
        error?.message?.includes('timeout') ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('tier') ||
        error?.status === 408 ||
        error?.status === 429;

      // If not a rate limit error or last attempt, throw immediately
      if (!isRateLimitError || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);

      console.log(
        `RPC call failed (attempt ${attempt + 1}/${maxRetries + 1}). ` +
        `Retrying in ${delay}ms...`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wait for transaction receipt with retry logic
 * @param publicClient - Viem public client
 * @param hash - Transaction hash
 * @param maxRetries - Maximum number of retries
 * @returns Transaction receipt
 */
export async function waitForTransactionWithRetry(
  publicClient: any,
  hash: `0x${string}`,
  maxRetries: number = 5
) {
  return retryWithBackoff(
    async () => {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 30_000, // 30 seconds timeout
      });
      return receipt;
    },
    maxRetries,
    2000 // Start with 2 second delay
  );
}

/**
 * Read contract with retry logic
 * @param publicClient - Viem public client
 * @param args - Contract read arguments
 * @param maxRetries - Maximum number of retries
 * @returns Contract read result
 */
export async function readContractWithRetry(
  publicClient: any,
  args: any,
  maxRetries: number = 3
) {
  return retryWithBackoff(
    async () => {
      const result = await publicClient.readContract(args);
      return result;
    },
    maxRetries
  );
}

/**
 * Write contract with retry logic
 * Note: Only retries reading the receipt, not the actual write
 * @param walletClient - Viem wallet client
 * @param args - Contract write arguments
 * @param maxRetries - Maximum number of retries for receipt
 * @returns Transaction hash
 */
export async function writeContractWithRetry(
  walletClient: any,
  publicClient: any,
  args: any,
  maxRetries: number = 5
) {
  // Write to contract (don't retry this part)
  const hash = await walletClient.writeContract(args);

  // Wait for receipt with retry
  try {
    await waitForTransactionWithRetry(publicClient, hash, maxRetries);
  } catch (error) {
    console.warn('Failed to get transaction receipt, but transaction may still succeed:', hash);
    // Don't throw - transaction was submitted successfully
  }

  return hash;
}
