import { NextRequest, NextResponse } from 'next/server';
import { bridgeUSDCToBase, bytes32ToAddress } from '@/lib/bridge';

/**
 * POST /api/bridge
 *
 * Handles cross-chain USDC transfer from Arc to Base Sepolia
 * Called after Inspector approves a milestone
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      inspectorBytes32,
      amount,
      projectId,
      milestoneId,
    } = body;

    // Validate inputs
    if (!inspectorBytes32 || !amount || !projectId || milestoneId === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Convert bytes32 to Base Sepolia address
    const inspectorBaseAddress = bytes32ToAddress(inspectorBytes32);

    console.log('Bridge API called:', {
      projectId,
      milestoneId,
      inspectorBaseAddress,
      amount: amount.toString(),
    });

    // Execute bridge transfer
    const result = await bridgeUSDCToBase({
      inspectorBaseAddress,
      amount: BigInt(amount),
      projectId,
      milestoneId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Bridge transfer failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bridgeTxHash: result.bridgeTxHash,
      inspectorAddress: inspectorBaseAddress,
      message: `Successfully initiated bridge transfer to ${inspectorBaseAddress}`,
    });
  } catch (error) {
    console.error('Bridge API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bridge?txHash=...
 *
 * Get status of a bridge transfer
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const txHash = searchParams.get('txHash');

    if (!txHash) {
      return NextResponse.json(
        { error: 'Missing txHash parameter' },
        { status: 400 }
      );
    }

    // In production, query Bridge Kit API for actual status
    // For demo, return mock status
    return NextResponse.json({
      status: 'completed',
      txHash,
      sourceChain: 'Arc Testnet',
      destinationChain: 'Base Sepolia',
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Bridge status error:', error);
    return NextResponse.json(
      { error: 'Failed to get bridge status' },
      { status: 500 }
    );
  }
}
