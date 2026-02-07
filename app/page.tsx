'use client';

import { useWallet } from './context/WalletContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { isConnected, connect, switchRole } = useWallet();
  const router = useRouter();

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (isConnected) {
      router.push('/dashboard');
    }
  }, [isConnected, router]);

  const roles = [
    {
      id: 'contractor' as const,
      name: 'Prime Contractor',
      description: 'Create and manage renovation projects',
      icon: '🏗️',
      color: 'bg-[#2D4A7C]', // Arc dark blue
    },
    {
      id: 'homeowner' as const,
      name: 'Homeowner',
      description: 'Approve projects and manage payments',
      icon: '🏠',
      color: 'bg-[#7FA3D1]', // Arc light blue
    },
    {
      id: 'inspector' as const,
      name: 'Inspector',
      description: 'Verify and approve milestones',
      icon: '✅',
      color: 'bg-[#4A2D5C]', // Arc purple
    },
    {
      id: 'arbitrator' as const,
      name: 'Arbitrator',
      description: 'Resolve disputes between parties',
      icon: '⚖️',
      color: 'bg-[#E8A047]', // Arc orange
    },
  ];

  const handleRoleSelect = async (roleId: typeof roles[number]['id']) => {
    // Set role first (without alert since not connected yet)
    switchRole(roleId, false);
    // Then connect wallet
    await connect();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="w-48 h-48 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="SmartRenovate Logo"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            SmartRenovate
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Intelligent Construction Payment System
          </p>
          <p className="text-gray-500 mt-2">
            Powered by Arc Blockchain & Circle USDC
          </p>
        </div>

        {/* Role Selection */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-gray-900 mb-8 text-center">
            Select Your Role to Continue
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role.id)}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 text-left group border-2 border-gray-200 hover:border-[#2D4A7C]"
              >
                <div className="flex items-start space-x-4">
                  <div
                    className={`w-16 h-16 ${role.color} rounded-lg flex items-center justify-center text-3xl flex-shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    {role.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {role.name}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {role.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Info Box */}
          <div className="mt-12 bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              🔒 Secure & Transparent
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="mr-2">✓</span>
                Milestone-based payments with escrow protection
              </li>
              <li className="flex items-center">
                <span className="mr-2">✓</span>
                Cross-chain USDC settlements
              </li>
              <li className="flex items-center">
                <span className="mr-2">✓</span>
                Independent inspection and verification
              </li>
              <li className="flex items-center">
                <span className="mr-2">✓</span>
                Immutable record on Arc blockchain
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-gray-500 text-sm">
          <p>Built for ETH Global HackMoney 2026</p>
          <p className="mt-1">Integrating Circle Arc, Wallets & Bridge Kit</p>
        </div>
      </div>
    </div>
  );
}
