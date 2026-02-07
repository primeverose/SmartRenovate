'use client';

import { useEffect, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { arcTestnet } from '@/lib/contract';

/**
 * Network Checker Component
 * Detects if user is on wrong network and prompts to switch to Arc Testnet
 */
export default function NetworkChecker() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (isConnected && chainId !== arcTestnet.id) {
      setShowWarning(true);
    } else {
      setShowWarning(false);
    }
  }, [isConnected, chainId]);

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: arcTestnet.id });
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to switch network:', error);

      // If switch fails, try to add the network
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x4CF752', // 5042002 in hex
              chainName: 'Arc Testnet',
              rpcUrls: ['https://arc-testnet.drpc.org'],
              nativeCurrency: {
                name: 'USDC',
                symbol: 'USDC',
                decimals: 18,
              },
              blockExplorerUrls: ['https://testnet.arcscan.io/'],
            }],
          });
          setShowWarning(false);
        } catch (addError) {
          console.error('Failed to add network:', addError);
          alert('Please manually add Arc Testnet to your MetaMask.\n\nNetwork Details:\n- Chain ID: 5042002\n- RPC URL: https://arc-testnet.drpc.org');
        }
      }
    }
  };

  const handleDismiss = () => {
    setShowWarning(false);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-lg">Wrong Network Detected</p>
              <p className="text-sm text-red-100">
                Please switch to <strong>Arc Testnet</strong> to use SmartRenovate
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSwitchNetwork}
              className="bg-white text-red-600 px-6 py-2 rounded-lg font-semibold hover:bg-red-50 transition-colors"
            >
              Switch to Arc Testnet
            </button>
            <button
              onClick={handleDismiss}
              className="text-white hover:text-red-200 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
