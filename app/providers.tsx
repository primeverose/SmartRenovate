'use client';

import { WalletProvider } from "./context/WalletContext";
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/lib/wagmi';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
