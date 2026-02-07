'use client';

import { useWallet } from '../context/WalletContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createWalletClient, custom, parseUnits, type Address } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS, arcTestnet } from '@/lib/contract';

export default function CreateProject() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const [walletClient, setWalletClient] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState<'general' | 'scope'>('general');
  const [loading, setLoading] = useState(false);

  // Initialize walletClient when wallet is connected
  useEffect(() => {
    if (isConnected && address && typeof window !== 'undefined' && (window as any).ethereum) {
      const client = createWalletClient({
        account: address,
        chain: arcTestnet,
        transport: custom((window as any).ethereum),
      });
      setWalletClient(client);
    }
  }, [isConnected, address]);

  // Form state - General Settings
  const [projectName, setProjectName] = useState('');
  const [homeownerAddress, setHomeownerAddress] = useState('');
  const [inspectorOperatingAddress, setInspectorOperatingAddress] = useState('');
  const [inspectorPaymentAddress, setInspectorPaymentAddress] = useState('');
  const [arbitratorAddress, setArbitratorAddress] = useState('');

  // Form state - Scope & Quote
  const [baseAmount, setBaseAmount] = useState('');
  const [contingency, setContingency] = useState('');
  const [downPaymentPct, setDownPaymentPct] = useState('10');
  const [retentionPct, setRetentionPct] = useState('10');

  const [milestones, setMilestones] = useState([
    { description: 'Demolition', percentage: '20' },
    { description: 'Plumbing & Electrical + Masonry', percentage: '20' },
    { description: 'Completion & Handover', percentage: '40' },
  ]);

  const [scopeDocument, setScopeDocument] = useState<string | null>(null);
  const [scopeFileName, setScopeFileName] = useState<string | null>(null);

  // Redirect if not connected or not contractor
  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    } else if (currentRole !== 'contractor') {
      router.push('/dashboard');
    }
  }, [isConnected, currentRole, router]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setScopeDocument(base64);
      setScopeFileName(file.name); // Save file name

      // Store temporarily (will be saved with project ID later)
      // Store in a temporary location first
      localStorage.setItem(`scope_temp`, JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        base64Data: base64,
        uploadedAt: Date.now(),
      }));
    };
    reader.readAsDataURL(file);
  };

  const validateGeneral = () => {
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return false;
    }
    if (!homeownerAddress || !homeownerAddress.startsWith('0x')) {
      alert('Please enter a valid homeowner address');
      return false;
    }
    if (!inspectorOperatingAddress || !inspectorOperatingAddress.startsWith('0x')) {
      alert('Please enter a valid inspector operating address (Arc)');
      return false;
    }
    if (!inspectorPaymentAddress || !inspectorPaymentAddress.startsWith('0x')) {
      alert('Please enter a valid inspector payment address (Base Sepolia)');
      return false;
    }
    if (!arbitratorAddress || !arbitratorAddress.startsWith('0x')) {
      alert('Please enter a valid arbitrator address');
      return false;
    }
    return true;
  };

  const validateScope = () => {
    if (!baseAmount || parseFloat(baseAmount) <= 0) {
      alert('Please enter a valid base amount');
      return false;
    }
    if (!contingency || parseFloat(contingency) < 0) {
      alert('Please enter a valid contingency amount');
      return false;
    }

    // Validate total percentages (Down Payment + Retention + Milestones = 100%)
    const downPayment = parseFloat(downPaymentPct || '0');
    const retention = parseFloat(retentionPct || '0');
    const milestonesTotal = milestones.reduce(
      (sum, m) => sum + parseFloat(m.percentage || '0'),
      0
    );
    const totalPercentage = downPayment + retention + milestonesTotal;

    if (Math.abs(totalPercentage - 100) > 0.01) {
      alert(
        `Total percentages must add up to 100%\n\n` +
        `Down Payment: ${downPayment}%\n` +
        `Retention: ${retention}%\n` +
        `Milestones: ${milestonesTotal}%\n` +
        `Total: ${totalPercentage}% (should be 100%)`
      );
      return false;
    }

    for (const milestone of milestones) {
      if (!milestone.description.trim()) {
        alert('All milestones must have a description');
        return false;
      }
      if (parseFloat(milestone.percentage) <= 0) {
        alert('All milestone percentages must be greater than 0');
        return false;
      }
    }

    return true;
  };

  const handleNextTab = () => {
    if (currentTab === 'general') {
      if (validateGeneral()) {
        setCurrentTab('scope');
      }
    }
  };

  const handleCreateProject = async () => {
    if (!validateScope()) return;
    if (!walletClient || !address) {
      alert('Please connect your wallet');
      return;
    }

    try {
      setLoading(true);

      // Convert Inspector Payment Address (Base Sepolia) to bytes32
      // Remove 0x prefix, then pad to 64 hex characters (32 bytes)
      const inspectorPaymentHex = inspectorPaymentAddress.toLowerCase().replace('0x', '');
      const inspectorPaymentBytes32 = `0x${inspectorPaymentHex.padStart(64, '0')}`;

      // Prepare milestone data
      const milestonePcts = milestones.map(m => BigInt(Math.round(parseFloat(m.percentage))));
      const milestoneDescriptions = milestones.map(m => m.description);

      // Convert amounts to wei (18 decimals for USDC on Arc)
      const baseAmountWei = parseUnits(baseAmount, 18);
      const contingencyWei = parseUnits(contingency, 18);
      const downPaymentPctScaled = BigInt(Math.round(parseFloat(downPaymentPct)));
      const retentionPctScaled = BigInt(Math.round(parseFloat(retentionPct)));

      // Get current project counter before creating project
      const { readContract } = await import('viem/actions');
      const projectCounter = await readContract(walletClient, {
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'getProjectCount',
      }) as bigint;

      const projectId = Number(projectCounter);

      console.log('Creating project with params:', {
        projectId,
        projectName,
        homeowner: homeownerAddress,
        inspectorOperating: inspectorOperatingAddress,
        inspectorPayment: inspectorPaymentBytes32,
        arbitrator: arbitratorAddress,
        baseAmount: baseAmountWei.toString(),
        contingency: contingencyWei.toString(),
        downPaymentPct: downPaymentPctScaled.toString(),
        retentionPct: retentionPctScaled.toString(),
        milestonePcts: milestonePcts.map(p => p.toString()),
        milestoneDescriptions,
      });

      // Store project name BEFORE creating project (since we know the ID)
      localStorage.setItem(`project_name_${projectId}`, projectName);

      // Store scope document if uploaded
      const tempScope = localStorage.getItem('scope_temp');
      if (tempScope) {
        localStorage.setItem(`scope_document_${projectId}`, tempScope);
        localStorage.removeItem('scope_temp'); // Clean up temp storage
      }

      // Call contract with new dual wallet parameters
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'createProject',
        args: [
          homeownerAddress as Address,
          inspectorOperatingAddress as Address,
          inspectorPaymentBytes32 as `0x${string}`,
          arbitratorAddress as Address,
          baseAmountWei,
          contingencyWei,
          downPaymentPctScaled,
          retentionPctScaled,
          milestonePcts,
          milestoneDescriptions,
        ],
      });

      console.log('Transaction sent:', hash);
      alert(`Project creation transaction sent! Hash: ${hash}\n\nWaiting for confirmation...`);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Failed to create project:', error);
      alert(`Failed to create project: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const updateMilestone = (index: number, field: 'description' | 'percentage', value: string) => {
    const updated = [...milestones];
    updated[index][field] = value;
    setMilestones(updated);
  };

  const addMilestone = () => {
    setMilestones([...milestones, { description: '', percentage: '0' }]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length <= 1) {
      alert('At least one milestone is required');
      return;
    }
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  if (!isConnected || currentRole !== 'contractor') {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Tab Navigation */}
        <div className="bg-white rounded-t-xl shadow-md">
          <div className="flex border-b">
            <button
              onClick={() => setCurrentTab('general')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                currentTab === 'general'
                  ? 'bg-[#2D4A7C] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              1. General Settings
            </button>
            <button
              onClick={() => {
                if (validateGeneral()) {
                  setCurrentTab('scope');
                }
              }}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                currentTab === 'scope'
                  ? 'bg-[#2D4A7C] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              2. Scope & Quote
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {currentTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., Downtown Office Renovation"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Homeowner Wallet Address (Arc) *
                  </label>
                  <input
                    type="text"
                    value={homeownerAddress}
                    onChange={(e) => setHomeownerAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C] font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Inspector Operating Wallet (Arc) *
                  </label>
                  <input
                    type="text"
                    value={inspectorOperatingAddress}
                    onChange={(e) => setInspectorOperatingAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C] font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Inspector will use this wallet to login and approve milestones on Arc
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Inspector Payment Wallet (Base Sepolia) *
                  </label>
                  <input
                    type="text"
                    value={inspectorPaymentAddress}
                    onChange={(e) => setInspectorPaymentAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C] font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Inspector will receive 10% of each milestone payment on Base Sepolia via Bridge Kit
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Arbitrator Wallet Address (Arc) *
                  </label>
                  <input
                    type="text"
                    value={arbitratorAddress}
                    onChange={(e) => setArbitratorAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C] font-mono text-sm"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleNextTab}
                    className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Next: Scope & Quote →
                  </button>
                </div>
              </div>
            )}

            {currentTab === 'scope' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Base Amount (USDC) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseAmount}
                      onChange={(e) => setBaseAmount(e.target.value)}
                      placeholder="e.g., 30"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Contingency (USDC) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={contingency}
                      onChange={(e) => setContingency(e.target.value)}
                      placeholder="e.g., 5"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Down Payment (%)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={downPaymentPct}
                      onChange={(e) => setDownPaymentPct(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Retention (%)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={retentionPct}
                      onChange={(e) => setRetentionPct(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                    />
                  </div>
                </div>

                {/* Milestones */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Milestones *
                    </label>
                    <button
                      onClick={addMilestone}
                      className="text-[#2D4A7C] hover:text-[#2D4A7C] text-sm font-semibold"
                    >
                      + Add Milestone
                    </button>
                  </div>

                  <div className="space-y-3">
                    {milestones.map((milestone, index) => (
                      <div key={index} className="flex gap-3">
                        <input
                          type="text"
                          value={milestone.description}
                          onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                          placeholder="Milestone description"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                        />
                        <input
                          type="number"
                          step="0.1"
                          value={milestone.percentage}
                          onChange={(e) => updateMilestone(index, 'percentage', e.target.value)}
                          placeholder="%"
                          className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                        />
                        <button
                          onClick={() => removeMilestone(index)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    Total: {(
                      parseFloat(downPaymentPct || '0') +
                      parseFloat(retentionPct || '0') +
                      milestones.reduce((sum, m) => sum + parseFloat(m.percentage || '0'), 0)
                    ).toFixed(1)}%
                    (Down Payment {downPaymentPct}% + Retention {retentionPct}% + Milestones {milestones.reduce((sum, m) => sum + parseFloat(m.percentage || '0'), 0).toFixed(1)}% = must equal 100%)
                  </p>
                </div>

                {/* Scope Document Upload */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Scope of Work Document (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      id="scope-file-upload"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.txt,image/*"
                      className="hidden"
                    />
                    <label
                      htmlFor="scope-file-upload"
                      className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#2D4A7C] hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-semibold text-[#2D4A7C]">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT or Images (max 5MB)</p>
                      </div>
                    </label>
                  </div>
                  {scopeDocument && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 mr-2 text-green-700 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-green-700">
                            Document uploaded successfully
                          </p>
                          {scopeFileName && (
                            <p className="text-xs text-green-600 mt-1">
                              📄 {scopeFileName}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setCurrentTab('general')}
                    className="px-8 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={loading}
                    className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-8 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary Box */}
        {currentTab === 'scope' && (
          <div className="bg-[#C5D5E8] border border-[#7FA3D1] rounded-b-xl p-6 mt-0">
            <h3 className="font-semibold text-[#2D4A7C] mb-3">💰 Budget Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[#2D4A7C]">Base Amount:</span>
                <span className="font-semibold text-[#1e3254] ml-2">
                  {baseAmount || '0'} USDC
                </span>
              </div>
              <div>
                <span className="text-[#2D4A7C]">Contingency:</span>
                <span className="font-semibold text-[#1e3254] ml-2">
                  {contingency || '0'} USDC
                </span>
              </div>
              <div>
                <span className="text-[#2D4A7C]">Total Budget:</span>
                <span className="font-semibold text-[#1e3254] ml-2">
                  {(parseFloat(baseAmount || '0') + parseFloat(contingency || '0')).toFixed(2)} USDC
                </span>
              </div>
              <div>
                <span className="text-[#2D4A7C]">Down Payment:</span>
                <span className="font-semibold text-[#1e3254] ml-2">
                  {((parseFloat(baseAmount || '0') * parseFloat(downPaymentPct)) / 100).toFixed(2)} USDC
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
