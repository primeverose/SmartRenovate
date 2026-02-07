import { createConfig, http } from 'wagmi';
import { arcTestnet } from './contract';

export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
  // Disable auto-reconnect to prevent confusion with multiple test accounts
  ssr: true, // This disables client-side auto-connection
});
