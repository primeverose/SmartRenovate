import { createPublicClient, createWalletClient, custom, http, parseEther } from 'viem';
import { defineChain } from 'viem';
import type { Address } from 'viem';

// Define Arc Testnet chain
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://arc-testnet.drpc.org'],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://arc-testnet.drpc.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://arc-testnet-explorer.url',
    },
  },
  testnet: true,
});

// Contract ABI (will be populated after deployment)
export const RENOVATION_ESCROW_ABI = [
  // Read functions
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'getProject',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'homeowner', type: 'address' },
          { name: 'contractor', type: 'address' },
          { name: 'inspectorOperatingAddress', type: 'address' },
          { name: 'inspectorPaymentAddress', type: 'bytes32' },
          { name: 'arbitrator', type: 'address' },
          { name: 'baseAmount', type: 'uint256' },
          { name: 'contingency', type: 'uint256' },
          { name: 'downPayment', type: 'uint256' },
          { name: 'retention', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'currentMilestone', type: 'uint256' },
          { name: 'fundsDeposited', type: 'bool' },
          { name: 'projectStarted', type: 'bool' },
          { name: 'contingencyUsed', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'getMilestones',
    outputs: [
      {
        components: [
          { name: 'amount', type: 'uint256' },
          { name: 'percentage', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'proofHash', type: 'bytes32' },
          { name: 'description', type: 'string' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getProjectCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Write functions
  {
    inputs: [
      { name: '_homeowner', type: 'address' },
      { name: '_inspectorOperating', type: 'address' },
      { name: '_inspectorPayment', type: 'bytes32' },
      { name: '_arbitrator', type: 'address' },
      { name: '_baseAmount', type: 'uint256' },
      { name: '_contingency', type: 'uint256' },
      { name: '_downPaymentPct', type: 'uint256' },
      { name: '_retentionPct', type: 'uint256' },
      { name: '_milestonePcts', type: 'uint256[]' },
      { name: '_milestoneDescriptions', type: 'string[]' },
    ],
    name: 'createProject',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'approveProject',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'depositToEscrow',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'payDownPaymentAndStart',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneId', type: 'uint256' },
      { name: '_proofHash', type: 'bytes32' },
    ],
    name: 'submitMilestone',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneId', type: 'uint256' },
    ],
    name: 'approveMilestone',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneId', type: 'uint256' },
      { name: '_reason', type: 'string' },
    ],
    name: 'rejectMilestone',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneId', type: 'uint256' },
      { name: '_newProofHash', type: 'bytes32' },
    ],
    name: 'resubmitMilestone',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Change Order functions
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneId', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
      { name: '_documentHash', type: 'bytes32' },
      { name: '_reason', type: 'string' },
    ],
    name: 'proposeChangeOrder',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_changeOrderId', type: 'uint256' },
    ],
    name: 'approveChangeOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_projectId', type: 'uint256' }],
    name: 'getChangeOrders',
    outputs: [
      {
        components: [
          { name: 'milestoneId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'documentHash', type: 'bytes32' },
          { name: 'reason', type: 'string' },
          { name: 'approved', type: 'bool' },
          { name: 'processed', type: 'bool' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'projectId', type: 'uint256' },
      { indexed: true, name: 'contractor', type: 'address' },
      { indexed: true, name: 'homeowner', type: 'address' },
      { indexed: false, name: 'totalAmount', type: 'uint256' },
    ],
    name: 'ProjectCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'projectId', type: 'uint256' },
      { indexed: true, name: 'milestoneId', type: 'uint256' },
      { indexed: false, name: 'contractorAmount', type: 'uint256' },
      { indexed: false, name: 'inspectorAmount', type: 'uint256' },
    ],
    name: 'MilestoneApproved',
    type: 'event',
  },
] as const;

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address;

// Create public client for reading
export function getPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });
}

// Create wallet client for writing (requires wallet connection)
export function getWalletClient() {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected');
  }

  return createWalletClient({
    chain: arcTestnet,
    transport: custom((window as any).ethereum),
  });
}
