'use client';

import { useWallet } from '../../../context/WalletContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, http, custom, keccak256, toBytes } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS, arcTestnet } from '@/lib/contract';

export default function SubmitMilestone() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [walletClient, setWalletClient] = useState<any>(null);

  const projectId = params.id as string;
  const milestoneIndex = searchParams.get('milestone');

  const [description, setDescription] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [milestoneStatus, setMilestoneStatus] = useState<number | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

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
    }
  }, [isConnected, currentRole, router]);

  // Load milestone status to determine if we should use submitMilestone or resubmitMilestone
  useEffect(() => {
    if (!projectId || !milestoneIndex) return;

    const loadMilestoneStatus = async () => {
      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http('https://arc-testnet.drpc.org'),
      });

      try {
        setLoadingStatus(true);
        const milestonesData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getMilestones',
          args: [BigInt(projectId)],
        }) as any[];

        const milestone = milestonesData[parseInt(milestoneIndex)];
        const status = Number(milestone.status ?? milestone[2]);
        setMilestoneStatus(status);
      } catch (error) {
        console.error('Error loading milestone status:', error);
      } finally {
        setLoadingStatus(false);
      }
    };

    loadMilestoneStatus();
  }, [projectId, milestoneIndex]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      // Check file size (max 5MB per file)
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 5MB.`);
        continue;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;

        setUploadedFiles(prev => [...prev, {
          name: file.name,
          base64: base64,
          type: file.type,
        }]);

        // Store in localStorage with correct key pattern
        const storageKey = `milestone_file_${projectId}_${milestoneIndex}_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
          projectId,
          milestoneIndex,
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

  const handleSubmit = async () => {
    if (!walletClient) {
      alert('Please connect your wallet');
      return;
    }

    if (uploadedFiles.length === 0) {
      alert('Please upload at least one file (photos, documents, etc.)');
      return;
    }

    if (!description.trim()) {
      alert('Please provide a description of the completed work');
      return;
    }

    try {
      setLoading(true);

      // Create a combined hash of all files and description
      const combinedData = JSON.stringify({
        description,
        files: uploadedFiles.map(f => ({ name: f.name, type: f.type })),
        timestamp: Date.now(),
      });

      const proofHash = keccak256(toBytes(combinedData));

      // Store description in localStorage
      localStorage.setItem(`milestone_desc_${projectId}_${milestoneIndex}`, description);

      // Determine which function to call based on milestone status
      // Status 4 = Rejected, use resubmitMilestone
      // Status 1 = InProgress, use submitMilestone
      const isResubmit = milestoneStatus === 4;
      const functionName = isResubmit ? 'resubmitMilestone' : 'submitMilestone';

      // Submit or resubmit milestone to contract
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: functionName,
        args: [BigInt(projectId), BigInt(milestoneIndex || '0'), proofHash],
      });

      alert(
        `Milestone ${isResubmit ? 'resubmitted' : 'submitted'} successfully!\n\n` +
        `Transaction hash: ${hash}\n\n` +
        `The inspector will now review your submission.`
      );
      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error submitting milestone:', error);
      alert(`Failed to submit milestone: ${error.message || error}`);
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
                {milestoneStatus === 4 ? '🔄 Resubmit' : '📤 Submit'} Milestone {milestoneIndex ? Number(milestoneIndex) + 1 : ''}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
          {/* Rejection Notice */}
          {milestoneStatus === 4 && (
            <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-semibold mb-2">❌ Previous submission was rejected</p>
              <p className="text-red-700 text-sm">
                Please review the inspector's feedback and make the necessary corrections before resubmitting.
              </p>
            </div>
          )}

          <div className="mb-6">
            <div className="bg-[#C5D5E8] border border-[#7FA3D1] rounded-lg p-4 mb-6">
              <p className="text-[#2D4A7C] font-semibold mb-2">📋 Submission Guidelines</p>
              <ul className="text-sm text-[#2D4A7C] space-y-1">
                <li>• Upload photos showing completed work</li>
                <li>• Include any relevant documents or reports</li>
                <li>• Provide a detailed description of the work done</li>
                <li>• Inspector will review your submission</li>
              </ul>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Work Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the work completed for this milestone..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
            />
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Upload Photos & Documents *
            </label>
            <div className="relative">
              <input
                type="file"
                id="milestone-file-upload"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="milestone-file-upload"
                className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#2D4A7C] hover:bg-gray-50 transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-semibold text-[#2D4A7C]">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">Images, PDF, Word documents, TXT (max 5MB per file)</p>
                </div>
              </label>
            </div>
          </div>

          {/* Uploaded Files List */}
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
              onClick={handleSubmit}
              disabled={loading || uploadedFiles.length === 0 || !description.trim()}
              className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading
                ? (milestoneStatus === 4 ? 'Resubmitting...' : 'Submitting...')
                : (milestoneStatus === 4 ? '🔄 Resubmit Milestone' : '📤 Submit Milestone')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
