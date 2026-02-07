'use client';

import { useWallet } from '../../../context/WalletContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits, keccak256, toBytes } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS, arcTestnet } from '@/lib/contract';

export default function ChangeOrder() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [walletClient, setWalletClient] = useState<any>(null);

  const projectId = params.id as string;
  const milestoneIndex = searchParams.get('milestone') || '0';

  const [availableContingency, setAvailableContingency] = useState<bigint>(0n);
  const [reason, setReason] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProject, setLoadingProject] = useState(true);

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

  useEffect(() => {
    if (!isConnected || currentRole !== 'contractor') {
      router.push('/dashboard');
      return;
    }

    const loadProjectData = async () => {
      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http('https://arc-testnet.drpc.org'),
      });

      try {
        setLoadingProject(true);
        const projectData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getProject',
          args: [BigInt(projectId)],
        }) as any;

        const contingency = projectData.contingency ?? projectData[7]; // contingency
        const contingencyUsed = projectData.contingencyUsed ?? projectData[14]; // contingencyUsed
        const available: bigint = BigInt(contingency) - BigInt(contingencyUsed);

        setAvailableContingency(available);
      } catch (error) {
        console.error('Error loading project:', error);
      } finally {
        setLoadingProject(false);
      }
    };

    loadProjectData();
  }, [isConnected, currentRole, router, projectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 5MB.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          base64: base64,
          type: file.type,
        }]);

        // Store in localStorage
        const storageKey = `change_order_file_${projectId}_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
          projectId,
          fileName: file.name,
          fileType: file.type,
          base64Data: base64,
          uploadedAt: Date.now(),
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitChangeOrder = async () => {
    if (!walletClient) {
      alert('Please connect your wallet');
      return;
    }

    if (!reason.trim()) {
      alert('Please provide a reason for the change order');
      return;
    }

    if (!requestAmount || parseFloat(requestAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const amountWei = parseUnits(requestAmount, 18);

    if (amountWei > availableContingency) {
      alert(`Requested amount exceeds available contingency.\nAvailable: ${formatUnits(availableContingency, 18)} USDC`);
      return;
    }

    try {
      setLoading(true);

      // Create document hash
      const documentData = JSON.stringify({
        reason,
        amount: requestAmount,
        files: uploadedFiles.map(f => ({ name: f.name, type: f.type })),
        timestamp: Date.now(),
      });

      const documentHash = keccak256(toBytes(documentData));

      // Store change order details in localStorage
      localStorage.setItem(`change_order_${projectId}_${Date.now()}`, JSON.stringify({
        projectId,
        reason,
        amount: requestAmount,
        files: uploadedFiles.length,
        timestamp: Date.now(),
        documentHash,
      }));

      // Submit to contract
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'proposeChangeOrder',
        args: [
          BigInt(projectId),
          BigInt(milestoneIndex),
          amountWei,
          documentHash,
          reason,
        ],
      });

      alert(`Change order submitted! 📝\n\nTransaction hash: ${hash}\n\nWaiting for homeowner approval...`);
      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error submitting change order:', error);
      alert(`Failed to submit change order: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected || currentRole !== 'contractor') {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Request Change Order
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-6">
          {/* Info Box */}
          <div className="bg-[#E8A047] bg-opacity-20 border border-[#E8A047] rounded-xl p-6">
            <h2 className="text-lg font-bold text-[#8B6914] mb-3">💡 Change Order Information</h2>
            <ul className="space-y-2 text-sm text-[#8B6914]">
              <li>• Use contingency funds for unforeseen changes</li>
              <li>• Provide detailed justification and documentation</li>
              <li>• Homeowner must approve before funds are released</li>
              <li>• Available Contingency: <span className="font-bold">
                {loadingProject ? '...' : `${formatUnits(availableContingency, 18)} USDC`}
              </span></li>
            </ul>
          </div>

          {/* Change Order Form */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Change Order Details</h2>

            {/* Reason */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Change Order *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this change is necessary (e.g., unforeseen structural issues, client-requested upgrades, code compliance requirements...)"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E8A047] focus:border-[#E8A047]"
              />
            </div>

            {/* Amount */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Requested Amount (USDC) *
              </label>
              <input
                type="number"
                step="0.01"
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                placeholder="e.g., 5"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E8A047] focus:border-[#E8A047]"
              />
              {requestAmount && parseFloat(requestAmount) > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {parseFloat(requestAmount) <= parseFloat(formatUnits(availableContingency, 18))
                    ? `✓ Within available contingency`
                    : `⚠️ Exceeds available contingency (${formatUnits(availableContingency, 18)} USDC)`}
                </p>
              )}
            </div>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Supporting Documents (Optional)
              </label>
              <div className="relative">
                <input
                  type="file"
                  id="change-order-file-upload"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="change-order-file-upload"
                  className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#E8A047] hover:bg-gray-50 transition-colors"
                >
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-semibold text-[#E8A047]">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">Photos, PDF, Word documents (max 5MB per file)</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Uploaded Files ({uploadedFiles.length})
                </h3>
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">
                          {file.type.startsWith('image/') ? '🖼️' : '📄'}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{file.name}</p>
                          <p className="text-xs text-gray-500">{file.type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-700 font-semibold text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitChangeOrder}
                disabled={loading || !reason.trim() || !requestAmount || parseFloat(requestAmount) <= 0}
                className="bg-[#E8A047] hover:bg-[#d18a35] text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : '📝 Submit Change Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
