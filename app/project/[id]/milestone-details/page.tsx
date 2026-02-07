'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useWallet } from '@/app/context/WalletContext';
import { createPublicClient, createWalletClient, http, custom, formatUnits, keccak256, toBytes } from 'viem';
import { CONTRACT_ADDRESS, RENOVATION_ESCROW_ABI, arcTestnet } from '@/lib/contract';

interface Milestone {
  amount: bigint;
  percentage: bigint;
  status: number;
  proofHash: string;
  description: string;
}

interface UploadedFile {
  fileName: string;
  fileType: string;
  base64Data: string;
  uploadedAt: number;
}

interface ChangeOrder {
  id: number;
  milestoneId: bigint;
  amount: bigint;
  documentHash: string;
  reason: string;
  approved: boolean;
  processed: boolean;
}

export default function MilestoneDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isConnected, currentRole, address } = useWallet();

  const projectId = params.id as string;
  const milestoneIndex = parseInt(searchParams.get('milestone') || '0');

  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletClient, setWalletClient] = useState<any>(null);
  const [processingChangeOrder, setProcessingChangeOrder] = useState(false);
  const [activeDispute, setActiveDispute] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // For submitting milestone
  const [description, setDescription] = useState('');
  const [newFiles, setNewFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  // Load milestone data
  useEffect(() => {
    if (!projectId) return;

    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http('https://arc-testnet.drpc.org'),
    });

    const loadData = async () => {
      try {
        // Load project name
        const storedName = localStorage.getItem(`project_name_${projectId}`);
        setProjectName(storedName || `Renovation Project #${projectId}`);

        // Load milestones
        const milestonesData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getMilestones',
          args: [BigInt(projectId)],
        }) as any[];

        const milestoneObj = {
          amount: milestonesData[milestoneIndex].amount ?? milestonesData[milestoneIndex][0],
          percentage: milestonesData[milestoneIndex].percentage ?? milestonesData[milestoneIndex][1],
          status: Number(milestonesData[milestoneIndex].status ?? milestonesData[milestoneIndex][2]),
          proofHash: milestonesData[milestoneIndex].proofHash ?? milestonesData[milestoneIndex][3],
          description: milestonesData[milestoneIndex].description ?? milestonesData[milestoneIndex][4],
        };

        setMilestone(milestoneObj);

        // Load change orders from contract
        const changeOrdersData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getChangeOrders',
          args: [BigInt(projectId)],
        }) as any[];

        // Filter change orders for this milestone
        const milestoneChangeOrders = changeOrdersData
          .map((co: any, index: number) => ({
            id: index,
            milestoneId: co.milestoneId ?? co[0],
            amount: co.amount ?? co[1],
            documentHash: co.documentHash ?? co[2],
            reason: co.reason ?? co[3],
            approved: co.approved ?? co[4],
            processed: co.processed ?? co[5],
          }))
          .filter((co: any) => Number(co.milestoneId) === milestoneIndex);

        setChangeOrders(milestoneChangeOrders);

        // Load uploaded files from localStorage (both contractor and inspector files)
        const files: UploadedFile[] = [];
        const keys = Object.keys(localStorage).filter(key =>
          key.startsWith(`milestone_file_${projectId}_${milestoneIndex}_`) ||
          key.startsWith(`inspector_file_${projectId}_${milestoneIndex}_`)
        );

        keys.forEach(key => {
          const fileData = localStorage.getItem(key);
          if (fileData) {
            try {
              files.push(JSON.parse(fileData));
            } catch (error) {
              console.error('Error parsing file data:', error);
            }
          }
        });

        // Sort files by upload time (newest first)
        files.sort((a, b) => b.uploadedAt - a.uploadedAt);

        setUploadedFiles(files);

        // Load active dispute for this milestone
        const disputeKeys = Object.keys(localStorage).filter(key =>
          key.startsWith('dispute_') && localStorage.getItem(key)?.includes(`"projectId":"${projectId}"`)
        );

        if (disputeKeys.length > 0) {
          for (const disputeKey of disputeKeys) {
            const disputeData = localStorage.getItem(disputeKey);
            if (disputeData) {
              try {
                const dispute = JSON.parse(disputeData);
                if (dispute.status === 'pending' && dispute.milestoneIndex === milestoneIndex.toString()) {
                  setActiveDispute({ ...dispute, key: disputeKey });
                  break;
                }
              } catch (error) {
                console.error('Failed to parse dispute data:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading milestone data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, milestoneIndex]);

  const getMilestoneStatusInfo = (status: number) => {
    // Check if this milestone has an approved change order
    const hasApprovedChangeOrder = changeOrders.some(co => co.approved);

    // If milestone is rejected but has an approved change order, show "In Progress"
    if (status === 4 && hasApprovedChangeOrder) {
      return { label: 'In Progress', color: 'text-blue-600', icon: '🔨', bgColor: 'bg-blue-50' };
    }

    // Check if there's an active dispute for this milestone
    if (status === 4 && activeDispute) {
      return { label: 'Dispute', color: 'text-red-600', icon: '⚠️', bgColor: 'bg-red-50' };
    }

    switch (status) {
      case 0: return { label: 'Locked', color: 'text-gray-500', icon: '🔒', bgColor: 'bg-gray-100' };
      case 1: return { label: 'In Progress', color: 'text-blue-600', icon: '🔨', bgColor: 'bg-blue-50' };
      case 2: return { label: 'Submitted', color: 'text-yellow-600', icon: '📋', bgColor: 'bg-yellow-50' };
      case 3: return { label: 'Approved', color: 'text-green-600', icon: '✅', bgColor: 'bg-green-50' };
      case 4: return { label: 'Rejected', color: 'text-red-600', icon: '❌', bgColor: 'bg-red-50' };
      case 5: return { label: 'Paid', color: 'text-purple-600', icon: '💰', bgColor: 'bg-purple-50' };
      default: return { label: 'Unknown', color: 'text-gray-500', icon: '❓', bgColor: 'bg-gray-100' };
    }
  };

  const handleDownloadFile = (file: UploadedFile) => {
    const link = document.createElement('a');
    link.href = file.base64Data;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApproveChangeOrder = async (changeOrderId: number) => {
    if (!walletClient) {
      alert('Please connect your wallet');
      return;
    }

    const changeOrder = changeOrders.find(co => co.id === changeOrderId);
    if (!changeOrder) {
      alert('Change order not found');
      return;
    }

    const confirmed = confirm(
      `Approve this change order?\n\n` +
      `Amount: ${formatUnits(changeOrder.amount, 18)} USDC\n` +
      `This will be paid from your Contingency fund.`
    );

    if (!confirmed) return;

    try {
      setProcessingChangeOrder(true);

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'approveChangeOrder',
        args: [BigInt(projectId), BigInt(changeOrderId)],
      });

      alert(`✅ Change Order approved!\n\nTransaction hash: ${hash}\n\nThe contractor will receive payment from the Contingency fund.`);

      // Refresh the page
      window.location.reload();
    } catch (error: any) {
      console.error('Error approving change order:', error);
      alert(`Failed to approve change order: ${error.message || error}`);
    } finally {
      setProcessingChangeOrder(false);
    }
  };

  const handleRejectChangeOrder = async (changeOrderId: number) => {
    const confirmed = confirm(
      `Reject this change order?\n\n` +
      `The contractor will be notified and can either:\n` +
      `• Resubmit a revised change order\n` +
      `• Open a dispute`
    );

    if (!confirmed) return;

    try {
      setProcessingChangeOrder(true);

      // Store rejection in localStorage (no smart contract function for rejection)
      const rejectionKey = `change_order_rejected_${projectId}_${changeOrderId}`;
      localStorage.setItem(rejectionKey, JSON.stringify({
        projectId,
        changeOrderId,
        rejectedAt: Date.now(),
        rejectedBy: address,
      }));

      alert('❌ Change Order rejected.\n\nThe contractor has been notified and can resubmit or dispute.');

      // Refresh the page
      window.location.reload();
    } catch (error: any) {
      console.error('Error rejecting change order:', error);
      alert(`Failed to reject change order: ${error.message || error}`);
    } finally {
      setProcessingChangeOrder(false);
    }
  };

  const handleApproveResolution = async () => {
    if (!activeDispute || !activeDispute.resolution || !walletClient) return;

    const confirmed = confirm(
      `Approve this resolution?\n\n` +
      `You will receive: ${currentRole === 'contractor' ? activeDispute.resolution.contractorPercent : activeDispute.resolution.homeownerPercent}%\n\n` +
      `Both parties must approve for the project to proceed.`
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);

      const updatedResolution = {
        ...activeDispute.resolution,
        [currentRole === 'contractor' ? 'contractorApproved' : 'homeownerApproved']: true,
      };

      const updatedDispute = {
        ...activeDispute,
        resolution: updatedResolution,
      };

      // Save the approval first
      localStorage.setItem(activeDispute.key, JSON.stringify(updatedDispute));

      // Check if both parties have approved
      if (updatedResolution.contractorApproved && updatedResolution.homeownerApproved) {
        updatedDispute.status = 'resolved';
        localStorage.setItem(activeDispute.key, JSON.stringify(updatedDispute));

        // Mark resolution as ready for execution
        localStorage.setItem(
          `resolution_ready_${projectId}_${milestoneIndex}`,
          JSON.stringify({
            timestamp: Date.now(),
            contractorPercent: updatedResolution.contractorPercent,
            homeownerPercent: updatedResolution.homeownerPercent
          })
        );

        window.location.reload();
      } else {
        // Only one party approved so far
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Error approving resolution:', error);
      alert(`Failed to approve resolution: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectResolution = async () => {
    if (!activeDispute || !activeDispute.resolution) return;

    const confirmed = confirm(
      `Reject this resolution?\n\n` +
      'The project will remain FROZEN.\n' +
      'The arbitrator may propose a new resolution, or the project may need to be terminated.'
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);

      const updatedResolution = {
        ...activeDispute.resolution,
        [currentRole === 'contractor' ? 'contractorApproved' : 'homeownerApproved']: false,
      };

      const updatedDispute = {
        ...activeDispute,
        status: 'rejected',
        resolution: updatedResolution,
      };

      localStorage.setItem(activeDispute.key, JSON.stringify(updatedDispute));

      alert(
        '❌ Resolution Rejected\n\n' +
        'The project remains frozen.\n' +
        'Please contact the arbitrator to discuss next steps.'
      );

      window.location.reload();
    } catch (error: any) {
      console.error('Error rejecting resolution:', error);
      alert(`Failed to reject resolution: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteResolutionStep1 = async () => {
    // Contractor re-submits milestone
    if (currentRole !== 'contractor') {
      alert('Please switch to Contractor wallet to complete this step.');
      return;
    }

    try {
      setActionLoading(true);

      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http('https://arc-testnet.drpc.org'),
      });

      // Get current milestone data
      const milestones = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'getMilestones',
        args: [BigInt(projectId)],
      }) as any[];

      const milestoneData = milestones[milestoneIndex];
      const proofHash = milestoneData.proofHash || milestoneData[3];

      // Resubmit milestone
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'resubmitMilestone',
        args: [BigInt(projectId), BigInt(milestoneIndex), proofHash],
      });

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash });

      alert('✅ Step 1 Complete!\n\nMilestone has been re-submitted. Inspector can now approve to execute payment.');

      window.location.reload();
    } catch (error: any) {
      console.error('Error resubmitting:', error);
      alert(`Failed: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteResolutionStep2 = async () => {
    // Inspector approves milestone
    if (currentRole !== 'inspector') {
      alert('Please switch to Inspector wallet to complete this step.');
      return;
    }

    try {
      setActionLoading(true);

      const resolutionData = JSON.parse(localStorage.getItem(`resolution_ready_${projectId}_${milestoneIndex}`) || '{}');

      const confirmed = confirm(
        `Execute payment according to arbitration resolution?\n\n` +
        `Contractor: ${resolutionData.contractorPercent}%\n` +
        `Homeowner Refund: ${resolutionData.homeownerPercent}%\n\n` +
        `Note: Full milestone amount will be paid to contractor. Percentage split is recorded for reference.`
      );

      if (!confirmed) return;

      // Approve milestone
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'approveMilestone',
        args: [BigInt(projectId), BigInt(milestoneIndex)],
      });

      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http('https://arc-testnet.drpc.org'),
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Clean up resolution ready marker
      localStorage.removeItem(`resolution_ready_${projectId}_${milestoneIndex}`);

      alert('🎉 Payment Executed!\n\nThe milestone has been approved and payment has been released.');

      window.location.reload();
    } catch (error: any) {
      console.error('Error approving:', error);
      alert(`Failed: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

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
        setNewFiles(prev => [...prev, {
          name: file.name,
          base64: base64,
          type: file.type,
        }]);

        // Store in localStorage
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
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitMilestone = async () => {
    if (!walletClient) {
      alert('Please connect your wallet');
      return;
    }

    if (newFiles.length === 0) {
      alert('Please upload at least one file');
      return;
    }

    if (!description.trim()) {
      alert('Please provide a description');
      return;
    }

    try {
      setSubmitting(true);

      // Create combined data for hashing
      const combinedData = JSON.stringify({
        files: newFiles.map(f => ({ name: f.name, type: f.type })),
        description,
        timestamp: Date.now(),
      });

      const proofHash = keccak256(toBytes(combinedData));

      // Store description in localStorage
      localStorage.setItem(`milestone_desc_${projectId}_${milestoneIndex}`, description);

      // Determine which function to call based on milestone status
      const isResubmit = milestone!.status === 4;
      const functionName = isResubmit ? 'resubmitMilestone' : 'submitMilestone';

      // Submit or resubmit milestone to contract
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: functionName,
        args: [BigInt(projectId), BigInt(milestoneIndex), proofHash],
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
      setSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D4A7C] mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading milestone data...</p>
        </div>
      </div>
    );
  }

  if (!milestone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Milestone not found</p>
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="mt-4 bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-2 rounded-lg"
          >
            Back to Project
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getMilestoneStatusInfo(milestone.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="text-[#2D4A7C] hover:underline mb-2 flex items-center"
          >
            <span className="mr-2">←</span> Back to Project
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{projectName}</h1>
          <p className="text-gray-600 mt-1">Milestone {milestoneIndex + 1}: {milestone.description}</p>
        </div>

        {/* Milestone Status Card */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {statusInfo.icon} Milestone {milestoneIndex + 1}
            </h2>
            <span className={`${statusInfo.bgColor} ${statusInfo.color} px-4 py-2 rounded-lg font-semibold`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Description</p>
              <p className="text-lg font-semibold text-gray-900">{milestone.description}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatUnits(milestone.amount, 18)} USDC
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Percentage of Base Budget</p>
              <p className="text-lg font-semibold text-gray-900">
                {Number(milestone.percentage)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Proof Hash</p>
              <p className="text-xs font-mono text-gray-600 break-all">
                {milestone.proofHash || 'Not submitted yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Dispute / Resolution Card */}
        {activeDispute && activeDispute.milestoneIndex === milestoneIndex.toString() && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl shadow-md p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-red-800 mb-2">
                  ⚠️ Project Frozen - Dispute Active
                </h2>
                <p className="text-sm text-red-700">
                  Opened by: {activeDispute.openedBy} • {new Date(activeDispute.openedAt).toLocaleString()}
                </p>
              </div>
              <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                {activeDispute.reason.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            <div className="bg-white border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Dispute Description:</p>
              <p className="text-gray-900">{activeDispute.description}</p>
            </div>

            {/* Resolution Proposed */}
            {activeDispute.resolution ? (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-6">
                <h3 className="text-lg font-bold text-purple-900 mb-4">
                  ⚖️ Arbitrator's Proposed Resolution
                </h3>

                <div className="bg-white border border-purple-200 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-6 mb-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-purple-900 mb-1">
                        {activeDispute.resolution.contractorPercent}%
                      </p>
                      <p className="text-sm text-purple-700 font-semibold">Contractor Payment</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-purple-900 mb-1">
                        {activeDispute.resolution.homeownerPercent}%
                      </p>
                      <p className="text-sm text-purple-700 font-semibold">Homeowner Refund</p>
                    </div>
                  </div>

                  {activeDispute.resolution.uploadedFiles > 0 && (
                    <div className="pt-4 border-t border-purple-200">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Supporting Documents:</p>
                      <p className="text-sm text-gray-600">
                        📎 {activeDispute.resolution.uploadedFiles} file(s) uploaded by arbitrator
                      </p>
                    </div>
                  )}
                </div>

                {/* Approval Status */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-lg border-2 ${
                    activeDispute.resolution.contractorApproved === true
                      ? 'bg-green-50 border-green-400'
                      : activeDispute.resolution.contractorApproved === false
                      ? 'bg-red-100 border-red-400'
                      : 'bg-gray-50 border-gray-300'
                  }`}>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Contractor:</p>
                    <p className="text-lg font-bold">
                      {activeDispute.resolution.contractorApproved === true && '✅ Approved'}
                      {activeDispute.resolution.contractorApproved === false && '❌ Rejected'}
                      {activeDispute.resolution.contractorApproved === null && '⏳ Pending'}
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg border-2 ${
                    activeDispute.resolution.homeownerApproved === true
                      ? 'bg-green-50 border-green-400'
                      : activeDispute.resolution.homeownerApproved === false
                      ? 'bg-red-100 border-red-400'
                      : 'bg-gray-50 border-gray-300'
                  }`}>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Homeowner:</p>
                    <p className="text-lg font-bold">
                      {activeDispute.resolution.homeownerApproved === true && '✅ Approved'}
                      {activeDispute.resolution.homeownerApproved === false && '❌ Rejected'}
                      {activeDispute.resolution.homeownerApproved === null && '⏳ Pending'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons for Contractor/Homeowner */}
                {(currentRole === 'contractor' || currentRole === 'homeowner') && (
                  <>
                    {(currentRole === 'contractor' && activeDispute.resolution.contractorApproved === null) ||
                     (currentRole === 'homeowner' && activeDispute.resolution.homeownerApproved === null) ? (
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={handleRejectResolution}
                          disabled={actionLoading}
                          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400"
                        >
                          {actionLoading ? 'Processing...' : '❌ Reject Resolution'}
                        </button>
                        <button
                          onClick={handleApproveResolution}
                          disabled={actionLoading}
                          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400"
                        >
                          {actionLoading ? 'Processing...' : '✅ Approve Resolution'}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800">
                          {(currentRole === 'contractor' && activeDispute.resolution.contractorApproved === true) ||
                           (currentRole === 'homeowner' && activeDispute.resolution.homeownerApproved === true)
                            ? '✅ You have approved this resolution. Waiting for the other party...'
                            : '❌ You have rejected this resolution. The project remains frozen.'}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                <p className="text-sm text-yellow-800 font-semibold mb-3">
                  ⏳ Waiting for arbitrator to propose a resolution...
                </p>

                {/* Arbitrator Action Button */}
                {currentRole === 'arbitrator' && (
                  <button
                    onClick={() => router.push(`/project/${projectId}/propose-resolution?milestone=${activeDispute.milestoneIndex || '0'}`)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2"
                  >
                    <span>⚖️</span>
                    <span>Propose Resolution</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Resolution Execution Section */}
        {activeDispute && activeDispute.status === 'resolved' && (() => {
          const resolutionReadyData = localStorage.getItem(`resolution_ready_${projectId}_${milestoneIndex}`);
          if (!resolutionReadyData || milestone?.status === 5) return null;

          const resolutionData = JSON.parse(resolutionReadyData);

          return (
            <div className="bg-green-50 border-2 border-green-500 rounded-xl shadow-md p-6 mb-6">
              <h3 className="text-xl font-bold text-green-800 mb-3">
                ✅ Resolution Approved by Both Parties!
              </h3>
              <p className="text-green-700 mb-4">
                The dispute has been resolved. Please complete the following steps to execute payment:
              </p>

              <div className="bg-white rounded-lg p-4 mb-4 border border-green-300">
                <p className="text-sm font-semibold text-gray-700 mb-2">Agreed Payment Split:</p>
                <div className="flex justify-between text-sm">
                  <span className="text-[#2D4A7C] font-semibold">
                    Contractor: {resolutionData.contractorPercent}%
                  </span>
                  <span className="text-[#7FA3D1] font-semibold">
                    Homeowner Refund: {resolutionData.homeownerPercent}%
                  </span>
                </div>
              </div>

              {/* Step 1: Contractor Resubmit */}
              {milestone?.status === 4 && (
                <>
                  {currentRole === 'contractor' ? (
                    <button
                      onClick={handleExecuteResolutionStep1}
                      disabled={actionLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold mb-3 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? 'Processing...' : '🔄 Step 1/2: Re-submit Milestone (Contractor)'}
                    </button>
                  ) : (
                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-3">
                      <p className="text-blue-800 text-sm">
                        ⏳ Waiting for Contractor to re-submit milestone (Step 1/2)
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Step 1 Complete Indicator */}
              {milestone?.status === 2 && (
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-3">
                  <p className="text-blue-800 text-sm">
                    ✅ Step 1 Complete! Milestone re-submitted.
                  </p>
                </div>
              )}

              {/* Step 2: Inspector Approve */}
              {milestone?.status === 2 && (
                <>
                  {currentRole === 'inspector' ? (
                    <button
                      onClick={handleExecuteResolutionStep2}
                      disabled={actionLoading}
                      className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? 'Processing...' : '✅ Step 2/2: Approve & Execute Payment (Inspector)'}
                    </button>
                  ) : (
                    <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                      <p className="text-green-800 text-sm">
                        ⏳ Waiting for Inspector to approve and execute payment (Step 2/2)
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                <p className="text-yellow-800 text-xs">
                  💡 <strong>Note:</strong> Due to smart contract requirements, this is a 2-step process.
                  First, the Contractor must re-submit the milestone. Then, the Inspector can approve to execute payment.
                </p>
              </div>
            </div>
          );
        })()}

        {/* Uploaded Files - Only show to non-homeowners when empty, or to everyone when there are files */}
        {(currentRole !== 'homeowner' || uploadedFiles.length > 0) && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">📄 Uploaded Documents & Photos</h2>

            {uploadedFiles.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="mt-4 text-gray-600 font-semibold">No files uploaded yet</p>
                <p className="text-sm text-gray-500 mt-2">
                  {milestone.status === 0 && 'This milestone is locked. Files will appear after contractor starts work.'}
                  {milestone.status === 1 && 'Contractor is working on this milestone. Files will be uploaded soon.'}
                  {milestone.status >= 2 && 'Contractor has not uploaded any files for this milestone.'}
                </p>
              </div>
            ) : (
            <div className="space-y-4">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-[#2D4A7C] text-white p-3 rounded-lg">
                        {file.fileType.startsWith('image/') ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{file.fileName}</p>
                        <p className="text-xs text-gray-500">
                          Uploaded: {new Date(file.uploadedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadFile(file)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>

                  {/* Image Preview */}
                  {file.fileType.startsWith('image/') && (
                    <div className="mt-4">
                      <img
                        src={file.base64Data}
                        alt={file.fileName}
                        className="max-w-full h-auto rounded-lg border border-gray-200"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>
                  )}

                  {/* PDF Preview */}
                  {file.fileType === 'application/pdf' && (
                    <div className="mt-4">
                      <iframe
                        src={file.base64Data}
                        className="w-full border border-gray-200 rounded-lg"
                        style={{ height: '400px' }}
                        title={file.fileName}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        )}

        {/* Change Orders - Show to Homeowner and Contractor */}
        {(currentRole === 'homeowner' || currentRole === 'contractor') && changeOrders.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              📝 Change Orders
            </h2>

            <div className="space-y-4">
              {changeOrders.map((changeOrder) => {
                // Check if this change order is rejected in localStorage
                const rejectionKey = `change_order_rejected_${projectId}_${changeOrder.id}`;
                const isRejected = localStorage.getItem(rejectionKey) !== null;

                // Determine status
                let statusLabel = '';
                let statusColor = '';
                let showActions = false;

                if (isRejected) {
                  statusLabel = '❌ Rejected';
                  statusColor = 'bg-red-100 text-red-800 border-red-300';
                } else if (changeOrder.approved) {
                  statusLabel = '✅ Approved';
                  statusColor = 'bg-green-100 text-green-800 border-green-300';
                } else {
                  statusLabel = '⏳ Pending Approval';
                  statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-300';
                  showActions = currentRole === 'homeowner';
                }

                return (
                  <div key={changeOrder.id} className={`border-2 rounded-lg p-6 ${statusColor}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            Change Order #{changeOrder.id + 1}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor} border-2`}>
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          Related to: Milestone {milestoneIndex + 1}
                        </p>
                      </div>
                      <div className="bg-[#E8A047] text-white px-4 py-2 rounded-lg font-semibold ml-4">
                        {formatUnits(changeOrder.amount, 18)} USDC
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Reason:</p>
                      <p className="text-gray-900 bg-white p-4 rounded-lg border border-gray-200">
                        {changeOrder.reason}
                      </p>
                    </div>

                    {/* Load and display uploaded change order files */}
                    {(() => {
                      const coFiles: UploadedFile[] = [];
                      const keys = Object.keys(localStorage).filter(key =>
                        key.startsWith(`change_order_file_${projectId}_`)
                      );

                      keys.forEach(key => {
                        const fileData = localStorage.getItem(key);
                        if (fileData) {
                          try {
                            const parsed = JSON.parse(fileData);
                            coFiles.push(parsed);
                          } catch (error) {
                            console.error('Error parsing file data:', error);
                          }
                        }
                      });

                      if (coFiles.length > 0) {
                        return (
                          <div className="mb-4">
                            <p className="text-sm font-semibold text-gray-700 mb-2">Supporting Documents:</p>
                            <div className="space-y-2">
                              {coFiles.map((file, fileIndex) => (
                                <div key={fileIndex} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-2xl">
                                      {file.fileType.startsWith('image/') ? '🖼️' : '📄'}
                                    </span>
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                                      <p className="text-xs text-gray-500">{file.fileType}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleDownloadFile(file)}
                                    className="text-[#2D4A7C] hover:underline text-sm font-semibold"
                                  >
                                    Download
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Action Buttons - Only show to Homeowner for Pending change orders */}
                    {showActions && currentRole === 'homeowner' && (
                      <>
                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <button
                            onClick={() => handleRejectChangeOrder(changeOrder.id)}
                            disabled={processingChangeOrder}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {processingChangeOrder ? 'Processing...' : '❌ Reject Change Order'}
                          </button>
                          <button
                            onClick={() => handleApproveChangeOrder(changeOrder.id)}
                            disabled={processingChangeOrder}
                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {processingChangeOrder ? 'Processing...' : '✅ Approve Change Order'}
                          </button>
                        </div>

                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-blue-800 text-xs">
                            💡 <strong>Note:</strong> Approving this change order will deduct {formatUnits(changeOrder.amount, 18)} USDC from your Contingency fund and pay it to the contractor.
                          </p>
                        </div>
                      </>
                    )}

                    {/* Status messages for Contractor */}
                    {currentRole === 'contractor' && (
                      <div className={`mt-4 rounded-lg p-3 border ${
                        changeOrder.approved
                          ? 'bg-green-50 border-green-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <p className={`text-xs ${
                          changeOrder.approved
                            ? 'text-green-800'
                            : 'text-yellow-800'
                        }`}>
                          {changeOrder.approved
                            ? '✅ Approved by homeowner. You can now proceed to submit the milestone.'
                            : '⏳ Waiting for homeowner approval...'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            ← Back to Project
          </button>

          {/* Contractor Actions for In Progress Milestone */}
          {currentRole === 'contractor' && milestone.status === 1 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => router.push(`/project/${projectId}/submit-milestone?milestone=${milestoneIndex}`)}
                className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                📤 Submit Milestone
              </button>
            </div>
          )}

          {/* Contractor Actions for Rejected Milestone with Approved Change Order */}
          {currentRole === 'contractor' && milestone.status === 4 && changeOrders.some(co => co.approved) && (
            <div className="mt-6 space-y-6">
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-semibold mb-2">✅ Change Order Approved!</p>
                <p className="text-green-700 text-sm">
                  The homeowner has approved your change order. You can now proceed with the work and submit this milestone for inspection.
                </p>
              </div>

              {/* File Upload Section */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">📤 Submit Milestone Work</h3>

                {/* Description */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Work Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the work completed for this milestone..."
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2D4A7C] focus:border-[#2D4A7C]"
                  />
                </div>

                {/* File Upload */}
                <div className="mb-4">
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
                        <p className="text-xs text-gray-500">Photos, PDF, Word, Text documents (max 5MB per file)</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Uploaded Files */}
                {newFiles.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      Uploaded Files ({newFiles.length})
                    </h4>
                    <div className="space-y-2">
                      {newFiles.map((file, index) => (
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
                <div className="flex justify-end">
                  <button
                    onClick={handleSubmitMilestone}
                    disabled={submitting || newFiles.length === 0 || !description.trim()}
                    className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : '📤 Submit Milestone'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contractor Actions for Rejected Milestone without Approved Change Order */}
          {currentRole === 'contractor' && milestone.status === 4 && !changeOrders.some(co => co.approved) && (
            <div className="mt-6">
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-semibold mb-2">❌ This milestone was rejected by the Inspector</p>
                <p className="text-red-700 text-sm">
                  You can resubmit with corrections, request a change order if scope changed, or open a dispute if you disagree.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Resubmit Button */}
                <button
                  onClick={() => router.push(`/project/${projectId}/submit-milestone?milestone=${milestoneIndex}`)}
                  className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                >
                  <span>🔄</span>
                  <span>Resubmit</span>
                </button>

                {/* Change Order Button */}
                <button
                  onClick={() => router.push(`/project/${projectId}/change-order?milestone=${milestoneIndex}`)}
                  className="bg-[#E8A047] hover:bg-[#d18a35] text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                >
                  <span>📝</span>
                  <span>Change Order</span>
                </button>

                {/* Dispute Button */}
                <button
                  onClick={() => router.push(`/project/${projectId}/open-dispute?milestone=${milestoneIndex}`)}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                >
                  <span>⚠️</span>
                  <span>Dispute</span>
                </button>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm font-semibold mb-2">💡 What should I do?</p>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• <strong>Resubmit</strong>: Fix the issues and upload new photos/documents</li>
                  <li>• <strong>Change Order</strong>: Request additional budget if scope has changed</li>
                  <li>• <strong>Dispute</strong>: Challenge the rejection if you believe it's unfair</li>
                </ul>
              </div>
            </div>
          )}


          {/* Inspector Actions */}
          {currentRole === 'inspector' && milestone.status === 2 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => router.push(`/project/${projectId}/inspect-milestone?milestone=${milestoneIndex}`)}
                className="bg-[#4A2D5C] hover:bg-[#3a2348] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                🔍 Inspect Milestone
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
