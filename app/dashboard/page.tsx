'use client';

import { useWallet } from '../context/WalletContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { RENOVATION_ESCROW_ABI, CONTRACT_ADDRESS } from '@/lib/contract';

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
  status: number; // 0: Pending, 1: InProgress, 2: Completed, 3: Frozen
  currentMilestone: bigint;
  fundsDeposited: boolean;
  projectStarted: boolean;
  contingencyUsed: bigint;
  createdAt: bigint;
  completedAt: bigint;
}

export default function Dashboard() {
  const { address, isConnected, currentRole, disconnect } = useWallet();
  const router = useRouter();
  const publicClient = usePublicClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  // Load projects
  useEffect(() => {
    if (!isConnected || !address || !publicClient) return;

    const loadProjects = async () => {
      try {
        setLoading(true);

        // Get project count
        const count = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: RENOVATION_ESCROW_ABI,
          functionName: 'getProjectCount',
        }) as bigint;

        // Load all projects (project IDs start from 0)
        const projectPromises = [];
        for (let i = 0n; i < count; i++) {
          projectPromises.push(
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: RENOVATION_ESCROW_ABI,
              functionName: 'getProject',
              args: [i],
            })
          );
        }

        const projectsData = await Promise.all(projectPromises);

        // Filter projects based on role
        const allProjects = projectsData.map((data: any) => {
          // Viem returns struct as object
          // Use ?? instead of || to handle 0, false, and other falsy values correctly
          return {
            id: data.id ?? data[0],
            homeowner: data.homeowner ?? data[1],
            contractor: data.contractor ?? data[2],
            inspectorOperatingAddress: data.inspectorOperatingAddress ?? data[3],
            inspectorPaymentAddress: data.inspectorPaymentAddress ?? data[4],
            arbitrator: data.arbitrator ?? data[5],
            baseAmount: data.baseAmount ?? data[6],
            contingency: data.contingency ?? data[7],
            downPayment: data.downPayment ?? data[8],
            retention: data.retention ?? data[9],
            status: Number(data.status ?? data[10]),
            currentMilestone: data.currentMilestone ?? data[11],
            fundsDeposited: data.fundsDeposited ?? data[12],
            projectStarted: data.projectStarted ?? data[13],
            contingencyUsed: data.contingencyUsed ?? data[14],
            createdAt: data.createdAt ?? data[15],
            completedAt: data.completedAt ?? data[16],
          };
        });

        // Helper function to check if project has active dispute
        const hasActiveDispute = (projectId: bigint): boolean => {
          const disputeKeys = Object.keys(localStorage).filter(key =>
            key.startsWith('dispute_') && localStorage.getItem(key)?.includes(`"projectId":"${projectId.toString()}"`)
          );

          for (const key of disputeKeys) {
            const disputeData = localStorage.getItem(key);
            if (disputeData) {
              try {
                const dispute = JSON.parse(disputeData);
                if (dispute.status === 'pending') {
                  return true;
                }
              } catch (error) {
                console.error('Failed to parse dispute data:', error);
              }
            }
          }
          return false;
        };

        const filteredProjects = allProjects.filter((project) => {
          // Wallet-based access control: only show projects where current wallet is assigned
          const currentAddress = address.toLowerCase();

          // Check if current wallet matches any role in this project
          const isHomeowner = project.homeowner.toLowerCase() === currentAddress;
          const isContractor = project.contractor.toLowerCase() === currentAddress;
          const isInspector = project.inspectorOperatingAddress.toLowerCase() === currentAddress;
          const isArbitrator = project.arbitrator.toLowerCase() === currentAddress;

          // User can see project if their wallet is assigned to ANY role
          // But they can only perform actions for their assigned role
          const hasAccess = isHomeowner || isContractor || isInspector || isArbitrator;

          // Special filter for Arbitrator: only show projects with active disputes
          if (currentRole === 'arbitrator' && isArbitrator) {
            return hasAccess && hasActiveDispute(project.id);
          }

          return hasAccess;
        });

        setProjects(filteredProjects);
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [isConnected, address, currentRole, publicClient]);

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 0: return { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800' };
      case 1: return { label: 'In Progress', color: 'bg-blue-100 text-blue-800' };
      case 2: return { label: 'Completed', color: 'bg-green-100 text-green-800' };
      case 3: return { label: 'Frozen (Dispute)', color: 'bg-red-100 text-red-800' };
      default: return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'contractor': return { name: 'Prime Contractor', icon: '🏗️', color: 'bg-[#2D4A7C]' }; // Arc dark blue
      case 'homeowner': return { name: 'Homeowner', icon: '🏠', color: 'bg-[#7FA3D1]' }; // Arc light blue
      case 'inspector': return { name: 'Inspector', icon: '✅', color: 'bg-[#4A2D5C]' }; // Arc purple
      case 'arbitrator': return { name: 'Arbitrator', icon: '⚖️', color: 'bg-[#E8A047]' }; // Arc orange
      default: return { name: 'Unknown', icon: '❓', color: 'bg-gray-500' };
    }
  };

  const roleInfo = getRoleLabel(currentRole);

  // Group projects by status
  const pendingProjects = projects.filter(p => p.status === 0);
  const inProgressProjects = projects.filter(p => p.status === 1);
  const completedProjects = projects.filter(p => p.status === 2);
  const frozenProjects = projects.filter(p => p.status === 3);

  if (!isConnected) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-lg shadow-md flex items-center justify-center border-2 border-[#2D4A7C]">
                <span className="text-2xl">🏗️</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SmartRenovate</h1>
                <p className="text-sm text-gray-500">Dashboard</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Role Badge */}
              <div className={`${roleInfo.color} text-white px-4 py-2 rounded-lg flex items-center space-x-2`}>
                <span className="text-xl">{roleInfo.icon}</span>
                <span className="font-semibold">{roleInfo.name}</span>
              </div>

              {/* Wallet Address */}
              <div className="hidden md:block bg-gray-100 px-4 py-2 rounded-lg">
                <p className="text-xs text-gray-500">Connected Wallet</p>
                <p className="font-mono text-sm">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>

              {/* Disconnect Button */}
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Create Project Button (only for contractor) */}
        {currentRole === 'contractor' && (
          <div className="mb-8">
            <button
              onClick={() => router.push('/create-project')}
              className="bg-[#2D4A7C] hover:bg-[#1e3254] text-white px-6 py-3 rounded-lg font-semibold flex items-center space-x-2 transition-colors"
            >
              <span className="text-xl">➕</span>
              <span>Create New Project</span>
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D4A7C]"></div>
            <p className="mt-4 text-gray-600">Loading projects...</p>
          </div>
        )}

        {/* No Projects */}
        {!loading && projects.length === 0 && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="text-6xl mb-4">
              {currentRole === 'arbitrator' ? '⚖️' : '📋'}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {currentRole === 'arbitrator' ? 'No Active Disputes' : 'No Projects Yet'}
            </h3>
            <p className="text-gray-600">
              {currentRole === 'contractor'
                ? 'Create your first renovation project to get started.'
                : currentRole === 'arbitrator'
                ? 'No projects with active disputes require your attention at this time.'
                : 'No projects assigned to your role yet.'}
            </p>
          </div>
        )}

        {/* Projects List */}
        {!loading && projects.length > 0 && (
          <div className="space-y-8">
            {/* Pending Projects - Hidden for Inspector */}
            {pendingProjects.length > 0 && currentRole !== 'inspector' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">⏳</span>
                  Pending Approval ({pendingProjects.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingProjects.map((project) => (
                    <ProjectCard key={project.id.toString()} project={project} />
                  ))}
                </div>
              </div>
            )}

            {/* In Progress Projects */}
            {inProgressProjects.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">🚧</span>
                  In Progress ({inProgressProjects.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inProgressProjects.map((project) => (
                    <ProjectCard key={project.id.toString()} project={project} />
                  ))}
                </div>
              </div>
            )}

            {/* Frozen Projects */}
            {frozenProjects.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">❄️</span>
                  Frozen (Disputes) ({frozenProjects.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {frozenProjects.map((project) => (
                    <ProjectCard key={project.id.toString()} project={project} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Projects */}
            {completedProjects.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">✅</span>
                  Completed ({completedProjects.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedProjects.map((project) => (
                    <ProjectCard key={project.id.toString()} project={project} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const status = getStatusLabel(project.status);

  function getStatusLabel(status: number) {
    switch (status) {
      case 0: return { label: 'Pending Approval', color: 'bg-[#F5C878] text-[#8B6914]' }; // Arc light gold
      case 1: return { label: 'In Progress', color: 'bg-[#C5D5E8] text-[#2D4A7C]' }; // Arc light blue
      case 2: return { label: 'Completed', color: 'bg-green-100 text-green-800' };
      case 3: return { label: 'Frozen (Dispute)', color: 'bg-red-100 text-red-800' };
      default: return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
    }
  }

  function getProjectName(projectId: bigint) {
    // Try to get project name from localStorage
    const storedName = localStorage.getItem(`project_name_${projectId.toString()}`);
    if (storedName) {
      return storedName;
    }
    // Fallback to default name
    return `Renovation Project #${projectId.toString()}`;
  }

  return (
    <div
      onClick={() => router.push(`/project/${project.id}`)}
      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 cursor-pointer border-2 border-gray-200 hover:border-[#2D4A7C]"
    >
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`${status.color} px-3 py-1 rounded-full text-xs font-semibold`}>
          {status.label}
        </span>
        <span className="text-gray-400 text-sm">ID: #{project.id.toString()}</span>
      </div>

      {/* Project Name */}
      <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">
        {getProjectName(project.id)}
      </h3>

      {/* Budget Info */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Base Amount:</span>
          <span className="font-semibold text-gray-900">
            {formatUnits(project.baseAmount, 18)} USDC
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Contingency:</span>
          <span className="font-semibold text-gray-900">
            {formatUnits(project.contingency, 18)} USDC
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Down Payment:</span>
          <span className="font-semibold text-green-600">
            {formatUnits(project.downPayment, 18)} USDC
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Funds Deposited:</span>
          <span className={`font-semibold ${project.fundsDeposited ? 'text-green-600' : 'text-red-600'}`}>
            {project.fundsDeposited ? '✓ Yes' : '✗ No'}
          </span>
        </div>
      </div>

      {/* Progress Bar (for in-progress projects) */}
      {project.status === 1 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Milestone Progress</span>
            <span>Milestone {project.currentMilestone.toString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-[#2D4A7C] h-2 rounded-full transition-all"
              style={{ width: `${(Number(project.currentMilestone) / 3) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* View Details Button */}
      <div className="pt-4 border-t border-gray-100">
        <span className="text-[#2D4A7C] text-sm font-semibold hover:text-[#1e3254]">
          View Details →
        </span>
      </div>
    </div>
  );
}
