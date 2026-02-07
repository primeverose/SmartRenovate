'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { type Address } from 'viem';

export type UserRole = 'contractor' | 'homeowner' | 'inspector' | 'arbitrator';

interface WalletContextType {
  // Wallet state
  address: Address | null;
  chainId: number | null;
  isConnected: boolean;

  // Role state
  currentRole: UserRole;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchRole: (role: UserRole, showAlert?: boolean) => void;
  switchAccount: (address: Address) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>('contractor');

  // Connect wallet
  const connect = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('Please install MetaMask or another Web3 wallet');
      return;
    }

    try {
      const ethereum = (window as any).ethereum;

      // Request account access
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const account = accounts[0] as Address;

      // Get chain ID
      const chainId = await ethereum.request({ method: 'eth_chainId' });
      const chainIdNumber = parseInt(chainId, 16);

      setAddress(account);
      setChainId(chainIdNumber);
      setIsConnected(true);

      // Check if on Arc Testnet
      const expectedChainId = parseInt(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || '5042002');
      if (chainIdNumber !== expectedChainId) {
        // Try to switch to Arc Testnet
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
        } catch (switchError: any) {
          // Chain not added, try to add it
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${expectedChainId.toString(16)}`,
                chainName: 'Arc Testnet',
                nativeCurrency: {
                  name: 'USDC',
                  symbol: 'USDC',
                  decimals: 18,
                },
                rpcUrls: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://arc-testnet.drpc.org'],
                blockExplorerUrls: ['https://testnet.arcscan.io/'],
              }],
            });
          }
        }
      }

      // Load saved role from localStorage
      const savedRole = localStorage.getItem('userRole') as UserRole;
      if (savedRole) {
        setCurrentRole(savedRole);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    }
  };

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    // Revoke MetaMask permissions to truly disconnect
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const ethereum = (window as any).ethereum;

        // Try to revoke permissions (MetaMask specific)
        // This will clear the "Connected Sites" permission
        await ethereum.request({
          method: 'wallet_revokePermissions',
          params: [
            {
              eth_accounts: {},
            },
          ],
        });

        console.log('MetaMask permissions revoked successfully');
      } catch (error: any) {
        // If wallet_revokePermissions is not supported, try alternative method
        console.warn('wallet_revokePermissions not supported, trying alternative:', error);

        // Fallback: Request permissions again will reset the connection
        try {
          // This clears the cached permission state
          await (window as any).ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }],
          }).then(() => {
            // User will see a popup, but we immediately close by rejecting
            return Promise.reject('User cancelled');
          }).catch(() => {
            // Silently catch the rejection - this still clears the cache
            console.log('Permission request cancelled - connection cleared');
          });
        } catch (fallbackError) {
          console.warn('Fallback permission clear failed:', fallbackError);
        }
      }
    }

    // Clear application state
    setAddress(null);
    setChainId(null);
    setIsConnected(false);

    // Clear stored role
    localStorage.removeItem('userRole');

    // Reset role
    setCurrentRole('contractor');

    // Redirect to home page
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  // Switch role and prompt to change MetaMask account
  const switchRole = (role: UserRole, showAlert = true) => {
    setCurrentRole(role);
    localStorage.setItem('userRole', role);

    // Only show alert if wallet is connected and showAlert is true
    if (showAlert && isConnected && address) {
      const roleNames = {
        contractor: 'Prime Contractor',
        homeowner: 'Homeowner',
        inspector: 'Inspector',
        arbitrator: 'Arbitrator',
      };

      alert(
        `Switched to ${roleNames[role]} role!\n\n` +
        `💡 Remember to switch to the correct wallet account in MetaMask:\n` +
        `- Click MetaMask extension\n` +
        `- Select the account for ${roleNames[role]}\n\n` +
        `Current connected wallet: ${address.slice(0, 6)}...${address.slice(-4)}`
      );
    }
  };

  // Switch account (for testing different roles)
  const switchAccount = (newAddress: Address) => {
    setAddress(newAddress);
  };

  // Listen for account and chain changes + Auto-detect existing connection
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;

    const ethereum = (window as any).ethereum;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected in MetaMask
        await disconnect();
      } else {
        // User switched account in MetaMask
        const newAccount = accounts[0] as Address;
        setAddress(newAccount);
        setIsConnected(true);

        if (isConnected) {
          console.log('Account changed to:', newAccount);
        }
      }
    };

    const handleChainChanged = (chainId: string) => {
      setChainId(parseInt(chainId, 16));
      // Reload page on chain change (recommended by MetaMask)
      window.location.reload();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    // Auto-detect if wallet is already connected (for page refreshes)
    const checkExistingConnection = async () => {
      try {
        const accounts = await ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const account = accounts[0] as Address;
          const chainId = await ethereum.request({ method: 'eth_chainId' });
          const chainIdNumber = parseInt(chainId, 16);

          setAddress(account);
          setChainId(chainIdNumber);
          setIsConnected(true);

          // Load saved role from localStorage
          const savedRole = localStorage.getItem('userRole') as UserRole;
          if (savedRole) {
            setCurrentRole(savedRole);
          }

          console.log('Auto-detected existing wallet connection:', account);
        }
      } catch (error) {
        console.error('Failed to check existing connection:', error);
      }
    };

    checkExistingConnection();

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [disconnect, isConnected]);

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        isConnected,
        currentRole,
        connect,
        disconnect,
        switchRole,
        switchAccount,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
