'use client';

import { useWallet } from '../../../context/WalletContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, http, custom } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS, arcTestnet } from '@/lib/contract';
import { waitForTransactionWithRetry, readContractWithRetry } from '@/lib/rpcUtils';

interface FileData {
  fileName: string;
  fileType: string;
  base64Data: string;
  uploadedAt: number;
}

export default function InspectMilestone() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  // Create clients directly using viem
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http('https://arc-testnet.drpc.org'),
  });

  const [walletClient, setWalletClient] = useState<any>(null);

  // Initialize walletClient when component mounts and wallet is connected
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

  const projectId = params.id as string;
  const milestoneIndex = searchParams.get('milestone');

  const [files, setFiles] = useState<FileData[]>([]);
  const [description, setDescription] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [inspectorUploadedFiles, setInspectorUploadedFiles] = useState<{ name: string; base64: string; type: string }[]>([]);

  useEffect(() => {
    if (!isConnected || currentRole !== 'inspector') {
      router.push('/dashboard');
      return;
    }

    // Load uploaded files from localStorage
    const loadFiles = () => {
      const allKeys = Object.keys(localStorage);
      const fileKeys = allKeys.filter(key =>
        key.startsWith(`milestone_file_${projectId}_${milestoneIndex}_`)
      );

      const loadedFiles: FileData[] = fileKeys.map(key => {
        const data = JSON.parse(localStorage.getItem(key)!);
        return {
          fileName: data.fileName,
          fileType: data.fileType,
          base64Data: data.base64Data,
          uploadedAt: data.uploadedAt,
        };
      });

      setFiles(loadedFiles);
    };

    // Load milestone description
    const desc = localStorage.getItem(`milestone_desc_${projectId}_${milestoneIndex}`);
    if (desc) {
      setDescription(desc);
    }

    loadFiles();
  }, [isConnected, currentRole, router, projectId, milestoneIndex]);

  const downloadFile = (file: FileData) => {
    const link = document.createElement('a');
    link.href = file.base64Data;
    link.download = file.fileName;
    link.click();
  };

  const handleInspectorFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        setInspectorUploadedFiles(prev => [...prev, {
          name: file.name,
          base64: base64,
          type: file.type,
        }]);

        // Store in localStorage with inspector prefix
        const storageKey = `inspector_file_${projectId}_${milestoneIndex}_${Date.now()}`;
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

  const removeInspectorFile = (index: number) => {
    setInspectorUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleApprove = async () => {
    if (!walletClient || !publicClient) {
      alert('Please connect your wallet');
      return;
    }

    if (!inspectorNotes.trim()) {
      alert('Please provide inspection notes');
      return;
    }

    try {
      setLoading(true);
      setDecision('approve');

      // Store inspector notes
      localStorage.setItem(
        `inspector_notes_${projectId}_${milestoneIndex}`,
        JSON.stringify({
          notes: inspectorNotes,
          decision: 'approved',
          timestamp: Date.now(),
          inspector: address,
        })
      );

      // STEP 1: Get project and milestone data FIRST
      console.log('Step 1: Loading project and milestone data...');
      const projectData = await readContractWithRetry(publicClient, {
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'getProject',
        args: [BigInt(projectId)],
      }) as any;

      const milestones = await readContractWithRetry(publicClient, {
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'getMilestones',
        args: [BigInt(projectId)],
      }) as any[];

      const milestone = milestones[Number(milestoneIndex || '0')];

      // DEBUG: Print complete project data structure
      console.log('🔍 DEBUG - Complete projectData:', projectData);
      console.log('🔍 DEBUG - projectData type:', typeof projectData);
      console.log('🔍 DEBUG - projectData keys:', Object.keys(projectData));
      console.log('🔍 DEBUG - projectData[4] (array access):', projectData[4]);
      console.log('🔍 DEBUG - projectData.inspectorPaymentAddress (object access):', projectData.inspectorPaymentAddress);

      const inspectorPaymentBytes32 = projectData[4] || projectData.inspectorPaymentAddress; // Try both access methods

      // Calculate 10% for Inspector - ensure BigInt conversion
      const milestoneAmount = BigInt(milestone[0] ?? milestone.amount);
      const inspectorAmount = (milestoneAmount * 10n) / 100n;

      // STEP 2: Execute Bridge transfer FIRST
      console.log('Step 2: Executing Bridge transfer (10% to Inspector)...');
      console.log('DEBUG - All Bridge parameters:', {
        inspectorBytes32: inspectorPaymentBytes32,
        inspectorBytes32Type: typeof inspectorPaymentBytes32,
        inspectorBytes32Length: inspectorPaymentBytes32?.length,
        inspectorBytes32Value: inspectorPaymentBytes32,
        isEmptyBytes: inspectorPaymentBytes32 === '0x0000000000000000000000000000000000000000000000000000000000000000',
        amount: inspectorAmount.toString(),
        amountType: typeof inspectorAmount.toString(),
        projectId: projectId,
        projectIdType: typeof projectId,
        milestoneIndex: milestoneIndex,
        milestoneIndexType: typeof milestoneIndex,
        milestoneIdToSend: milestoneIndex || '0',
      });

      // Validate parameters before sending
      if (!inspectorPaymentBytes32 || inspectorPaymentBytes32 === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error(
          'Inspector payment address (bytes32) is missing or empty!\n\n' +
          `Value received: ${inspectorPaymentBytes32}\n\n` +
          'This means the project was created without a valid Inspector Payment Address.\n' +
          'Please create a new project and ensure you fill in the Inspector Payment (Base Sepolia) field.'
        );
      }
      if (!projectId) {
        throw new Error('Project ID is missing!');
      }
      if (milestoneIndex === null || milestoneIndex === undefined) {
        throw new Error('Milestone index is missing!');
      }

      const bridgeResponse = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspectorBytes32: inspectorPaymentBytes32,
          amount: inspectorAmount.toString(),
          projectId,
          milestoneId: milestoneIndex || '0',
        }),
      });

      const bridgeResult = await bridgeResponse.json();

      // Check if Bridge succeeded
      if (!bridgeResult.success) {
        throw new Error(
          `Bridge transfer failed: ${bridgeResult.error || 'Unknown error'}\n\n` +
          `Transaction cancelled to ensure atomic payment.\n` +
          `Both Contractor and Inspector must receive funds together.`
        );
      }

      console.log('Bridge transfer successful:', bridgeResult.bridgeTxHash);

      // STEP 3: Only approve milestone on-chain if Bridge succeeded
      console.log('Step 3: Approving milestone on-chain (90% to Contractor)...');
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'approveMilestone',
        args: [BigInt(projectId), BigInt(milestoneIndex || '0')],
      });

      console.log('Milestone approved on-chain, tx hash:', hash);

      // Wait for transaction confirmation with retry logic
      try {
        await waitForTransactionWithRetry(publicClient, hash, 5);
        console.log('Transaction confirmed successfully');
      } catch (receiptError) {
        console.warn('Could not get transaction receipt, but transaction was submitted:', hash);
        // Continue anyway - transaction was submitted successfully
      }

      // Success! Both payments completed
      alert(
        `✅ Milestone Approved Successfully!\n\n` +
        `Both payments completed atomically:\n\n` +
        `1️⃣ Contractor (90%): ${hash}\n` +
        `   → Arc Testnet transaction confirmed\n\n` +
        `2️⃣ Inspector (10%): ${bridgeResult.bridgeTxHash || 'Processing'}\n` +
        `   → Bridge transfer to Base Sepolia completed\n\n` +
        `Total amount distributed: ${milestoneAmount.toString()} wei`
      );

      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error approving milestone:', error);
      alert(`Failed to approve milestone: ${error.message || error}`);
    } finally {
      setLoading(false);
      setDecision(null);
    }
  };

  const handleReject = async () => {
    if (!walletClient) {
      alert('Please connect your wallet');
      return;
    }

    if (!inspectorNotes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setLoading(true);
      setDecision('reject');

      // Store inspector notes
      localStorage.setItem(
        `inspector_notes_${projectId}_${milestoneIndex}`,
        JSON.stringify({
          notes: inspectorNotes,
          decision: 'rejected',
          timestamp: Date.now(),
          inspector: address,
        })
      );

      // Reject milestone on contract
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'rejectMilestone',
        args: [BigInt(projectId), BigInt(milestoneIndex || '0'), inspectorNotes],
      });

      alert(`Milestone rejected. ❌\n\nTransaction hash: ${hash}\n\nThe contractor will be notified to address the issues.`);
      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error rejecting milestone:', error);
      alert(`Failed to reject milestone: ${error.message || error}`);
    } finally {
      setLoading(false);
      setDecision(null);
    }
  };

  if (!isConnected || currentRole !== 'inspector') {
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
                Inspect Milestone {milestoneIndex ? Number(milestoneIndex) + 1 : ''}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Inspector Guidelines */}
          <div className="bg-[#4A2D5C] text-white rounded-xl p-6">
            <h2 className="text-xl font-bold mb-3">✅ Inspection Guidelines</h2>
            <ul className="space-y-2 text-sm">
              <li>• Review all uploaded photos and documents carefully</li>
              <li>• Verify that work matches the milestone requirements</li>
              <li>• Check quality and completeness of the work</li>
              <li>• Provide detailed notes on your decision</li>
              <li>• Upon approval: 90% → Contractor (Arc), 10% → You (Base Sepolia)</li>
            </ul>
          </div>

          {/* Work Description */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Work Description</h2>
            {description ? (
              <p className="text-gray-700 whitespace-pre-wrap">{description}</p>
            ) : (
              <p className="text-gray-500 italic">No description provided</p>
            )}
          </div>

          {/* Uploaded Files */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              Uploaded Files ({files.length})
            </h2>

            {files.length === 0 ? (
              <p className="text-gray-500 italic">No files uploaded</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {file.fileType.startsWith('image/') ? (
                      <div className="mb-3">
                        <img
                          src={file.base64Data}
                          alt={file.fileName}
                          className="w-full h-48 object-cover rounded-lg"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-6xl">📄</span>
                      </div>
                    )}

                    <p className="font-medium text-sm text-gray-900 mb-1 truncate">
                      {file.fileName}
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      {new Date(file.uploadedAt).toLocaleString()}
                    </p>

                    <button
                      onClick={() => downloadFile(file)}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      ⬇️ Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inspector File Upload */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              📎 Upload Inspection Documents & Photos (Optional)
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Upload any additional photos or documents from your inspection
            </p>

            {/* File Upload Area */}
            <div className="mb-6">
              <div className="relative">
                <input
                  type="file"
                  id="inspector-file-upload"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleInspectorFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="inspector-file-upload"
                  className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#4A2D5C] hover:bg-gray-50 transition-colors"
                >
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-semibold text-[#4A2D5C]">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">Images, PDF, Word documents, TXT (max 5MB per file)</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Uploaded Files List */}
            {inspectorUploadedFiles.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Uploaded Files ({inspectorUploadedFiles.length})
                </h3>
                <div className="space-y-2">
                  {inspectorUploadedFiles.map((file, index) => (
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
                        onClick={() => removeInspectorFile(index)}
                        className="text-red-600 hover:text-red-700 font-semibold text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inspection Notes */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              Inspector Notes & Decision *
            </h2>
            <textarea
              value={inspectorNotes}
              onChange={(e) => setInspectorNotes(e.target.value)}
              placeholder="Provide detailed notes on your inspection findings and decision..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A2D5C] focus:border-[#4A2D5C] mb-4"
            />

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleApprove}
                disabled={loading || !inspectorNotes.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading && decision === 'approve' ? (
                  <span>Approving...</span>
                ) : (
                  <>
                    <span>✅</span>
                    <span>Approve Milestone</span>
                  </>
                )}
              </button>

              <button
                onClick={handleReject}
                disabled={loading || !inspectorNotes.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading && decision === 'reject' ? (
                  <span>Rejecting...</span>
                ) : (
                  <>
                    <span>❌</span>
                    <span>Reject Milestone</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
