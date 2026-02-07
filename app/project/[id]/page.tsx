'use client';

import { useWallet } from '../../context/WalletContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS, arcTestnet } from '@/lib/contract';
import BridgeStatusIndicator from '@/components/BridgeStatusIndicator';
import { bytes32ToAddress, calculatePaymentSplit } from '@/lib/bridge';

interface Project {
  id: bigint;
  homeowner: string;
  contractor: string;
  inspectorOperatingAddress: string;
  inspectorPaymentAddress: string;
  arbitrator: string;
  baseAmount: bigint;
  contingency: bigint;
  downPayment: bigint;
  retention: bigint;
  status: number;
  currentMilestone: bigint;
  fundsDeposited: boolean;
  projectStarted: boolean;
  contingencyUsed: bigint;
  createdAt: bigint;
  completedAt: bigint;
}

interface Milestone {
  amount: bigint;
  percentage: bigint;
  status: number;
  proofHash: string;
  description: string;
}

export default function ProjectDetails() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();

  const [walletClient, setWalletClient] = useState<any>(null);

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

  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [projectName, setProjectName] = useState<string>('');
  const [scopeDocument, setScopeDocument] = useState<{
    fileName: string;
    fileType: string;
    base64Data: string;
    uploadedAt: number;
  } | null>(null);

  const [activeDispute, setActiveDispute] = useState<{
    key: string;
    projectId: string;
    milestoneIndex: string;
    openedBy: string;
    reason: string;
    description: string;
    openedAt: number;
    status: string;
    resolution: {
      contractorPercent: number;
      homeownerPercent: number;
      reasoning: string;
      proposedAt: number;
      contractorApproved: boolean | null;
      homeownerApproved: boolean | null;
    } | null;
  } | null>(null);

  const projectId = params.id as string;

  // Load project data
  useEffect(() => {
    if (!isConnected) {
      router.push('/');
      return;
    }

    const loadProject = async () => {
      try {
        setLoading(true);

        // Create publicClient inside useEffect to avoid re-render loop
        const publicClient = createPublicClient({
          chain: arcTestnet,
          transport: http('https://arc-testnet.drpc.org'),
        });

        // Load project
        const projectData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getProject',
          args: [BigInt(projectId)],
        }) as any;

        const projectObj: Project = {
          id: projectData.id ?? projectData[0],
          homeowner: projectData.homeowner ?? projectData[1],
          contractor: projectData.contractor ?? projectData[2],
          inspectorOperatingAddress: projectData.inspectorOperatingAddress ?? projectData[3],
          inspectorPaymentAddress: projectData.inspectorPaymentAddress ?? projectData[4],
          arbitrator: projectData.arbitrator ?? projectData[5],
          baseAmount: projectData.baseAmount ?? projectData[6],
          contingency: projectData.contingency ?? projectData[7],
          downPayment: projectData.downPayment ?? projectData[8],
          retention: projectData.retention ?? projectData[9],
          status: Number(projectData.status ?? projectData[10]),
          currentMilestone: projectData.currentMilestone ?? projectData[11],
          fundsDeposited: projectData.fundsDeposited ?? projectData[12],
          projectStarted: projectData.projectStarted ?? projectData[13],
          contingencyUsed: projectData.contingencyUsed ?? projectData[14],
          createdAt: projectData.createdAt ?? projectData[15],
          completedAt: projectData.completedAt ?? projectData[16],
        };

        setProject(projectObj);

        // Load project name from localStorage
        const storedName = localStorage.getItem(`project_name_${projectId}`);
        setProjectName(storedName || `Renovation Project #${projectId}`);

        // Load scope document from localStorage
        const storedScope = localStorage.getItem(`scope_document_${projectId}`);
        if (storedScope) {
          try {
            const scopeData = JSON.parse(storedScope);
            setScopeDocument(scopeData);
          } catch (error) {
            console.error('Failed to parse scope document:', error);
          }
        }

        // Load milestones
        const milestonesData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getMilestones',
          args: [BigInt(projectId)],
        }) as any[];

        const milestonesObj = milestonesData.map((m: any) => ({
          amount: m.amount ?? m[0],
          percentage: m.percentage ?? m[1],
          status: Number(m.status ?? m[2]),
          proofHash: m.proofHash ?? m[3],
          description: m.description ?? m[4],
        }));

        setMilestones(milestonesObj);

        // Load change orders from contract
        try {
          const changeOrdersData = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: RENOVATION_ESCROW_ABI,
            functionName: 'getChangeOrders',
            args: [BigInt(projectId)],
          }) as any[];

          const changeOrdersObj = changeOrdersData.map((co: any, index: number) => ({
            id: index,
            milestoneId: co.milestoneId ?? co[0],
            amount: co.amount ?? co[1],
            documentHash: co.documentHash ?? co[2],
            reason: co.reason ?? co[3],
            approved: co.approved ?? co[4],
            processed: co.processed ?? co[5],
          }));

          setChangeOrders(changeOrdersObj);
        } catch (error) {
          console.error('Error loading change orders:', error);
          setChangeOrders([]);
        }

        // Load active dispute for this project
        const disputeKeys = Object.keys(localStorage).filter(key =>
          key.startsWith('dispute_') && localStorage.getItem(key)?.includes(`"projectId":"${projectId}"`)
        );

        if (disputeKeys.length > 0) {
          const latestDisputeKey = disputeKeys[disputeKeys.length - 1];
          const disputeData = localStorage.getItem(latestDisputeKey);
          if (disputeData) {
            try {
              const dispute = JSON.parse(disputeData);
              if (dispute.status === 'pending') {
                setActiveDispute({ ...dispute, key: latestDisputeKey });
              }
            } catch (error) {
              console.error('Failed to parse dispute data:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error loading project:', error);
        alert('Failed to load project data');
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [isConnected, projectId, router]);

  // Download scope document
  const handleDownloadScope = () => {
    if (!scopeDocument) return;

    const link = document.createElement('a');
    link.href = scopeDocument.base64Data;
    link.download = scopeDocument.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Approve resolution (Contractor or Homeowner)
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

        // Mark that resolution needs execution
        localStorage.setItem(
          `resolution_ready_${projectId}_${activeDispute.milestoneIndex || '0'}`,
          JSON.stringify({
            timestamp: Date.now(),
            contractorPercent: updatedResolution.contractorPercent,
            homeownerPercent: updatedResolution.homeownerPercent
          })
        );
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error approving resolution:', error);
      alert(`Failed to approve resolution: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject resolution (Contractor or Homeowner)
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

  // Approve project (Homeowner)
  const handleApproveProject = async () => {
    if (!walletClient || !project) return;

    try {
      setActionLoading(true);
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'approveProject',
        args: [BigInt(projectId)],
      });

      alert(`Project approved! Transaction hash: ${hash}`);
      window.location.reload();
    } catch (error: any) {
      console.error('Error approving project:', error);
      alert(`Failed to approve project: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Deposit to escrow (Homeowner)
  const handleDepositToEscrow = async () => {
    console.log('Deposit to Escrow button clicked!', {
      hasWalletClient: !!walletClient,
      hasProject: !!project,
      address,
      isConnected,
      projectStatus: project?.status,
      fundsDeposited: project?.fundsDeposited
    });

    if (!walletClient) {
      alert('❌ Error: Wallet client not initialized.\n\nPlease try:\n1. Refresh the page\n2. Reconnect your wallet\n3. Make sure you are connected as Homeowner');
      return;
    }

    if (!project) {
      alert('❌ Error: Project data not loaded.\n\nPlease refresh the page.');
      return;
    }

    const totalAmount = project.baseAmount + project.contingency;
    console.log('Attempting to deposit:', {
      totalAmount: totalAmount.toString(),
      formatted: formatUnits(totalAmount, 18),
      projectId,
      contractAddress: CONTRACT_ADDRESS
    });

    try {
      setActionLoading(true);
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'depositToEscrow',
        args: [BigInt(projectId)],
        value: totalAmount,
      });

      alert(`Funds deposited to escrow! Transaction hash: ${hash}\nAmount: ${formatUnits(totalAmount, 18)} USDC`);
      window.location.reload();
    } catch (error: any) {
      console.error('Error depositing to escrow:', error);
      alert(`Failed to deposit: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Pay down payment and start project (Homeowner)
  const handlePayDownPaymentAndStart = async () => {
    console.log('Pay Down Payment button clicked!', {
      hasWalletClient: !!walletClient,
      hasProject: !!project,
      address,
      isConnected
    });

    if (!walletClient) {
      alert('❌ Error: Wallet client not initialized.\n\nPlease try:\n1. Refresh the page\n2. Reconnect your wallet\n3. Make sure you are connected as Homeowner');
      return;
    }

    if (!project) {
      alert('❌ Error: Project data not loaded.\n\nPlease refresh the page.');
      return;
    }

    try {
      setActionLoading(true);
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'payDownPaymentAndStart',
        args: [BigInt(projectId)],
      });

      alert(`Project started! Down payment released to contractor.\nTransaction hash: ${hash}`);
      window.location.reload();
    } catch (error: any) {
      console.error('Error starting project:', error);
      alert(`Failed to start project: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Return contingency to homeowner (after all milestones complete)
  const handleReturnContingency = async () => {
    if (!walletClient || !project) return;

    const remainingContingency = project.contingency - project.contingencyUsed;

    if (remainingContingency <= 0n) {
      alert('No contingency remaining to return.');
      return;
    }

    const confirmed = confirm(
      `Return remaining contingency to homeowner?\n\n` +
      `Amount: ${formatUnits(remainingContingency, 18)} USDC\n\n` +
      `Note: This will complete the project and return unused contingency funds.`
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);

      // TODO: Call smart contract function to return contingency
      // For now, show a message that this feature is pending smart contract implementation
      alert(
        '⚠️ Smart Contract Function Pending\n\n' +
        'The return contingency function needs to be added to the smart contract.\n\n' +
        `Remaining contingency: ${formatUnits(remainingContingency, 18)} USDC\n\n` +
        'Please contact the contract administrator to implement this feature.'
      );

      // When the smart contract function is ready, use this:
      /*
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: RENOVATION_ESCROW_ABI,
        functionName: 'returnContingency',  // This function needs to be added to the contract
        args: [BigInt(projectId)],
      });

      alert(`Contingency returned! Transaction hash: ${hash}\nAmount: ${formatUnits(remainingContingency, 18)} USDC`);
      window.location.reload();
      */
    } catch (error: any) {
      console.error('Error returning contingency:', error);
      alert(`Failed to return contingency: ${error.message || error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusInfo = (status: number) => {
    switch (status) {
      case 0: return { label: 'Pending Approval', color: 'bg-[#F5C878] text-[#8B6914]', icon: '⏳' };
      case 1: return { label: 'In Progress', color: 'bg-[#C5D5E8] text-[#2D4A7C]', icon: '🚧' };
      case 2: return { label: 'Completed', color: 'bg-green-100 text-green-800', icon: '✅' };
      case 3: return { label: 'Frozen (Dispute)', color: 'bg-red-100 text-red-800', icon: '❄️' };
      default: return { label: 'Unknown', color: 'bg-gray-100 text-gray-800', icon: '❓' };
    }
  };

  const getMilestoneStatusInfo = (status: number, milestoneIndex: number) => {
    // Check if this milestone has pending change orders
    const hasPendingChangeOrder = changeOrders.some(
      (co) => Number(co.milestoneId) === milestoneIndex && !co.approved && !co.processed
    );

    // Check if change order was rejected in localStorage
    const hasRejectedChangeOrder = changeOrders.some((co) => {
      if (Number(co.milestoneId) === milestoneIndex) {
        const rejectionKey = `change_order_rejected_${projectId}_${co.id}`;
        return localStorage.getItem(rejectionKey) !== null;
      }
      return false;
    });

    // Check if this milestone has an approved change order
    const hasApprovedChangeOrder = changeOrders.some(
      (co) => Number(co.milestoneId) === milestoneIndex && co.approved
    );

    // If milestone is rejected but has an approved change order, show "In Progress"
    if (status === 4 && hasApprovedChangeOrder) {
      return { label: 'In Progress', color: 'text-[#2D4A7C]', icon: '🔨' };
    }

    // If milestone is rejected but has pending change order (and not rejected), show "Change Orders Requested"
    if (status === 4 && hasPendingChangeOrder && !hasRejectedChangeOrder) {
      return { label: 'Change Orders Requested', color: 'text-[#E8A047]', icon: '📝' };
    }

    // Check if there's an active dispute for this milestone
    if (status === 4 && activeDispute && activeDispute.milestoneIndex === milestoneIndex.toString()) {
      return { label: 'Dispute', color: 'text-red-600', icon: '⚠️' };
    }

    switch (status) {
      case 0: return { label: 'Locked', color: 'text-gray-500', icon: '🔒' };
      case 1: return { label: 'In Progress', color: 'text-[#2D4A7C]', icon: '🔨' };
      case 2: return { label: 'Submitted', color: 'text-[#E8A047]', icon: '📤' };
      case 3: return { label: 'Approved', color: 'text-green-600', icon: '✅' };
      case 4: return { label: 'Rejected', color: 'text-red-600', icon: '❌' };
      case 5: return { label: 'Paid', color: 'text-green-700', icon: '💰' };
      default: return { label: 'Unknown', color: 'text-gray-500', icon: '❓' };
    }
  };

  if (!isConnected) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D4A7C]"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 text-[#2D4A7C] hover:text-[#1e3254] font-semibold"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(project.status);
  const totalBudget = project.baseAmount + project.contingency;

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
              <h1 className="text-2xl font-bold text-gray-900">
                {projectName}
              </h1>
            </div>

            <div className={`${statusInfo.color} px-4 py-2 rounded-lg font-semibold flex items-center space-x-2`}>
              <span>{statusInfo.icon}</span>
              <span>{statusInfo.label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Info Card */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Project Information</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Contractor</p>
                  <p className="font-mono text-sm text-gray-900">
                    {project.contractor.slice(0, 6)}...{project.contractor.slice(-4)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Homeowner</p>
                  <p className="font-mono text-sm text-gray-900">
                    {project.homeowner.slice(0, 6)}...{project.homeowner.slice(-4)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Inspector</p>
                  <div className="space-y-1">
                    <div>
                      <p className="text-xs text-gray-400">Operating (Arc)</p>
                      <p className="font-mono text-xs text-gray-900">
                        {project.inspectorOperatingAddress.slice(0, 6)}...
                        {project.inspectorOperatingAddress.slice(-4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Payment (Base Sepolia)</p>
                      <p className="font-mono text-xs text-gray-900">
                        {bytes32ToAddress(project.inspectorPaymentAddress).slice(0, 6)}...
                        {bytes32ToAddress(project.inspectorPaymentAddress).slice(-4)}
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        🌉 Receives 10% via Bridge Kit
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Arbitrator</p>
                  <p className="font-mono text-sm text-gray-900">
                    {project.arbitrator.slice(0, 6)}...{project.arbitrator.slice(-4)}
                  </p>
                </div>
              </div>
            </div>

            {/* Scope of Work Document Card */}
            {scopeDocument && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📄 Scope of Work Document</h2>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-[#2D4A7C] text-white p-3 rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{scopeDocument.fileName}</p>
                        <p className="text-xs text-gray-500">
                          Uploaded: {new Date(scopeDocument.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleDownloadScope}
                      className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {/* Show preview for images */}
                {scopeDocument.fileType.startsWith('image/') && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-2">Preview:</p>
                    <img
                      src={scopeDocument.base64Data}
                      alt="Scope of Work Preview"
                      className="max-w-full h-auto rounded-lg border border-gray-200"
                      style={{ maxHeight: '400px' }}
                    />
                  </div>
                )}

                {/* Show preview for PDF */}
                {scopeDocument.fileType === 'application/pdf' && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-2">PDF Preview:</p>
                    <iframe
                      src={scopeDocument.base64Data}
                      className="w-full rounded-lg border border-gray-200"
                      style={{ height: '400px' }}
                      title="PDF Preview"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Budget Card */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Budget Details</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Base Amount</span>
                  <span className="font-semibold text-gray-900">
                    {formatUnits(project.baseAmount, 18)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Contingency</span>
                  <span className="font-semibold text-gray-900">
                    {formatUnits(project.contingency, 18)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                  <span className="text-gray-900 font-semibold">Total Budget</span>
                  <span className="font-bold text-[#2D4A7C] text-lg">
                    {formatUnits(totalBudget, 18)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Down Payment</span>
                  <span className="font-semibold text-green-600">
                    {formatUnits(project.downPayment, 18)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Retention</span>
                  <span className="font-semibold text-gray-900">
                    {formatUnits(project.retention, 18)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Contingency Used</span>
                  <span className="font-semibold text-[#E8A047]">
                    {formatUnits(project.contingencyUsed, 18)} USDC
                  </span>
                </div>

                {/* Contingency Usage Progress Bar */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Contingency Usage</span>
                    <span className="text-sm font-semibold text-[#E8A047]">
                      {project.contingency > 0n
                        ? `${((Number(project.contingencyUsed) / Number(project.contingency)) * 100).toFixed(1)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-[#E8A047] h-4 rounded-full transition-all duration-300"
                      style={{
                        width: project.contingency > 0n
                          ? `${Math.min(100, (Number(project.contingencyUsed) / Number(project.contingency)) * 100)}%`
                          : '0%'
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-500">
                      Remaining: {formatUnits(project.contingency - project.contingencyUsed, 18)} USDC
                    </span>
                    <span className="text-xs text-gray-500">
                      Total: {formatUnits(project.contingency, 18)} USDC
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestones */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Milestones</h2>

              <div className="space-y-4">
                {milestones.map((milestone, index) => {
                  const statusInfo = getMilestoneStatusInfo(milestone.status, index);

                  return (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">
                          Milestone {index + 1}: {milestone.description}
                        </h3>
                        <span className={`${statusInfo.color} font-semibold flex items-center space-x-1`}>
                          <span>{statusInfo.icon}</span>
                          <span>{statusInfo.label}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Amount:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {formatUnits(milestone.amount, 18)} USDC
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Percentage:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {Number(milestone.percentage)}%
                          </span>
                        </div>
                      </div>

                      {/* Bridge Status for Approved/Paid Milestones */}
                      {(milestone.status === 3 || milestone.status === 5) && project && (
                        <div className="mt-4">
                          <BridgeStatusIndicator
                            status="completed"
                            amount={formatUnits(calculatePaymentSplit(milestone.amount).inspectorAmount, 18)}
                            recipientAddress={bytes32ToAddress(project.inspectorPaymentAddress)}
                            bridgeTxHash={`0xbridge${projectId}${index}`}
                          />
                        </div>
                      )}

                      {/* Action buttons based on role and status */}
                      <div className="mt-3 flex space-x-2">
                        {/* Contractor: Submit when InProgress, View Details otherwise */}
                        {currentRole === 'contractor' && milestone.status === 1 && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/submit-milestone?milestone=${index}`)}
                            className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            Submit Milestone
                          </button>
                        )}
                        {currentRole === 'contractor' && milestone.status !== 1 && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/milestone-details?milestone=${index}`)}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            📋 View Details
                          </button>
                        )}

                        {/* Inspector: Inspect when Submitted, View Details otherwise */}
                        {currentRole === 'inspector' && milestone.status === 2 && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/inspect-milestone?milestone=${index}`)}
                            className="bg-[#4A2D5C] hover:bg-[#3a2348] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            Inspect Milestone
                          </button>
                        )}
                        {currentRole === 'inspector' && milestone.status !== 2 && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/milestone-details?milestone=${index}`)}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            📋 View Details
                          </button>
                        )}

                        {/* Homeowner can always view milestone details */}
                        {currentRole === 'homeowner' && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/milestone-details?milestone=${index}`)}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            📋 View Details
                          </button>
                        )}

                        {/* Arbitrator can always view details */}
                        {currentRole === 'arbitrator' && (
                          <button
                            onClick={() => router.push(`/project/${projectId}/milestone-details?milestone=${index}`)}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            📋 View Details
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar - Actions */}
          <div className="space-y-6">

            {/* Homeowner Actions */}
            {currentRole === 'homeowner' && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">🏠 Homeowner Actions</h3>

                <div className="space-y-3">
                  {/* Approve Project - Status 0 (Pending Approval) */}
                  {project.status === 0 && (
                    <button
                      onClick={handleApproveProject}
                      disabled={actionLoading || !!activeDispute}
                      className="w-full bg-[#7FA3D1] hover:bg-[#6B8FBF] text-white px-5 py-3 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <span className="flex items-center justify-center space-x-2">
                        <span>✅</span>
                        <span>{actionLoading ? 'Processing...' : 'Approve Project'}</span>
                      </span>
                    </button>
                  )}

                  {/* Deposit to Escrow - Only after project is approved (Status 1) */}
                  {project.status === 1 && !project.fundsDeposited && (
                    <button
                      onClick={handleDepositToEscrow}
                      disabled={actionLoading || !!activeDispute}
                      className="w-full bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-5 py-3 rounded-lg font-bold transition-all shadow-sm hover:shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <span className="flex items-center justify-center space-x-2">
                        <span>💰</span>
                        <span>{actionLoading ? 'Processing...' : 'Deposit to Escrow'}</span>
                      </span>
                    </button>
                  )}

                  {/* Pay Down Payment and Start */}
                  {project.status === 1 && project.fundsDeposited && !project.projectStarted && (
                    <button
                      onClick={handlePayDownPaymentAndStart}
                      disabled={actionLoading || !!activeDispute}
                      className="w-full bg-gradient-to-r from-[#1e3254] to-[#2D4A7C] hover:from-[#132033] hover:to-[#1e3254] text-white px-6 py-4 rounded-lg font-bold transition-all shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none disabled:from-gray-400 disabled:to-gray-400"
                    >
                      {actionLoading ? (
                        <span>Processing...</span>
                      ) : (
                        <span className="flex flex-col items-center justify-center space-y-1">
                          <span className="flex items-center space-x-2">
                            <span className="text-xl">🚀</span>
                            <span>Pay Down Payment</span>
                          </span>
                          <span>& Start Project</span>
                        </span>
                      )}
                    </button>
                  )}

                  {/* Already Started */}
                  {project.projectStarted && (
                    <div className="bg-[#C5D5E8] border-2 border-[#7FA3D1] rounded-lg p-4 text-center">
                      <p className="text-[#2D4A7C] font-bold text-sm">
                        ✓ Project Started
                      </p>
                      <p className="text-[#2D4A7C] text-xs mt-1 opacity-80">
                        Down payment has been released to contractor
                      </p>
                    </div>
                  )}

                  {/* Return Contingency - All milestones completed */}
                  {(() => {
                    const allMilestonesCompleted = milestones.every(m => (m.status ?? m[2]) === 5);
                    const remainingContingency = project.contingency - project.contingencyUsed;

                    return allMilestonesCompleted && remainingContingency > 0n && (
                      <div className="space-y-3">
                        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-green-800 text-sm">🎉 All Milestones Completed!</h4>
                          </div>
                          <div className="bg-white rounded-lg p-3 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700">Remaining Contingency:</span>
                              <span className="text-lg font-bold text-green-700">
                                {formatUnits(remainingContingency, 18)} USDC
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={handleReturnContingency}
                            disabled={actionLoading}
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-lg font-bold transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                          >
                            <span className="flex items-center justify-center space-x-2">
                              <span>💵</span>
                              <span>{actionLoading ? 'Processing...' : 'Return Contingency to Homeowner'}</span>
                            </span>
                          </button>
                          <p className="text-xs text-green-700 mt-2 text-center">
                            Click to receive your unused contingency funds
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Info Text */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600">
                      {project.status === 0 && (
                        <>
                          💡 First, review the project details and approve to proceed.
                        </>
                      )}
                      {project.status === 1 && !project.fundsDeposited && (
                        <>
                          💡 After approval, deposit the total project amount (base + contingency) to the escrow contract.
                        </>
                      )}
                      {project.fundsDeposited && !project.projectStarted && (
                        <>
                          💡 Release the down payment to contractor to officially start the project.
                        </>
                      )}
                      {project.projectStarted && (
                        <>
                          💡 The project is in progress. Monitor milestones and approve work as completed.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Project Status Summary */}
            <div className="bg-[#C5D5E8] rounded-xl p-6 border border-[#7FA3D1]">
              <h3 className="text-lg font-bold text-[#2D4A7C] mb-3">Project Status</h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#2D4A7C]">Funds Deposited:</span>
                  <span className={`font-semibold ${project.fundsDeposited ? 'text-green-700' : 'text-red-700'}`}>
                    {project.fundsDeposited ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#2D4A7C]">Project Started:</span>
                  <span className={`font-semibold ${project.projectStarted ? 'text-green-700' : 'text-red-700'}`}>
                    {project.projectStarted ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#2D4A7C]">Milestones Completed:</span>
                  <span className="font-semibold text-[#1e3254]">
                    {milestones.filter(m => (m.status ?? m[2]) === 5).length} / {milestones.length}
                  </span>
                </div>

                {/* Remaining Contingency */}
                {project.contingency > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#2D4A7C]">Remaining Contingency:</span>
                    <span className="font-semibold text-green-700">
                      {formatUnits(project.contingency - project.contingencyUsed, 18)} USDC
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
