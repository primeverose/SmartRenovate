'use client';

import { useWallet } from '../context/WalletContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Dispute {
  key: string;
  projectId: string;
  milestoneIndex: string;
  openedBy: string;
  openedByAddress: string;
  reason: string;
  description: string;
  evidence: string;
  files: { name: string; base64: string; type: string }[];
  openedAt: number;
  status: 'pending' | 'resolved' | 'rejected';
  resolution: {
    contractorPercent: number;
    homeownerPercent: number;
    reasoning: string;
    proposedAt: number;
    contractorApproved: boolean | null;
    homeownerApproved: boolean | null;
  } | null;
}

export default function ArbitratorDashboard() {
  const { isConnected, currentRole } = useWallet();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'arbitration' | 'completed'>('arbitration');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [contractorPercent, setContractorPercent] = useState(50);
  const [homeownerPercent, setHomeownerPercent] = useState(50);
  const [reasoning, setReasoning] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || currentRole !== 'arbitrator') {
      router.push('/dashboard');
      return;
    }

    loadDisputes();
  }, [isConnected, currentRole, router]);

  const loadDisputes = () => {
    const allDisputes: Dispute[] = [];
    const keys = Object.keys(localStorage).filter(key => key.startsWith('dispute_'));

    keys.forEach(key => {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const dispute = JSON.parse(data);
          allDisputes.push({ ...dispute, key });
        } catch (error) {
          console.error('Error parsing dispute:', error);
        }
      }
    });

    // Sort by openedAt (newest first)
    allDisputes.sort((a, b) => b.openedAt - a.openedAt);

    setDisputes(allDisputes);
  };

  const handleProposeResolution = async () => {
    if (!selectedDispute) return;

    if (contractorPercent + homeownerPercent !== 100) {
      alert('Percentages must add up to 100%');
      return;
    }

    if (!reasoning.trim()) {
      alert('Please provide reasoning for your resolution');
      return;
    }

    try {
      setLoading(true);

      const updatedDispute = {
        ...selectedDispute,
        status: 'pending' as const,
        resolution: {
          contractorPercent,
          homeownerPercent,
          reasoning,
          proposedAt: Date.now(),
          contractorApproved: null,
          homeownerApproved: null,
        },
      };

      localStorage.setItem(selectedDispute.key, JSON.stringify(updatedDispute));

      alert(
        '✅ Resolution Proposed!\n\n' +
        `Contractor: ${contractorPercent}%\n` +
        `Homeowner: ${homeownerPercent}%\n\n` +
        'Both parties will be notified to review and approve/reject the proposed resolution.'
      );

      setSelectedDispute(null);
      setReasoning('');
      setContractorPercent(50);
      setHomeownerPercent(50);
      loadDisputes();
    } catch (error: any) {
      console.error('Error proposing resolution:', error);
      alert(`Failed to propose resolution: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const pendingDisputes = disputes.filter(d => d.status === 'pending' && !d.resolution);
  const awaitingApprovalDisputes = disputes.filter(d => d.status === 'pending' && d.resolution);
  const completedDisputes = disputes.filter(d => d.status === 'resolved' || d.status === 'rejected');

  if (!isConnected || currentRole !== 'arbitrator') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-purple-600 hover:text-purple-800"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                ⚖️ Arbitrator Dashboard
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab('arbitration')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'arbitration'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            ⚖️ Arbitration ({pendingDisputes.length + awaitingApprovalDisputes.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'completed'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            ✅ Completed ({completedDisputes.length})
          </button>
        </div>

        {/* Arbitration Tab */}
        {activeTab === 'arbitration' && (
          <div className="space-y-6">
            {/* Pending Review */}
            {pendingDisputes.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  🔍 Pending Review
                </h2>
                <div className="grid gap-4">
                  {pendingDisputes.map(dispute => (
                    <div
                      key={dispute.key}
                      className="bg-white rounded-xl shadow-md p-6 border border-red-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            Project #{dispute.projectId} - Milestone {parseInt(dispute.milestoneIndex) + 1}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Opened by: {dispute.openedBy} • {new Date(dispute.openedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                          {dispute.reason.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Description:</p>
                        <p className="text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                          {dispute.description}
                        </p>
                      </div>

                      {dispute.evidence && (
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">Evidence:</p>
                          <p className="text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            {dispute.evidence}
                          </p>
                        </div>
                      )}

                      {dispute.files.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            Attachments ({dispute.files.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {dispute.files.map((file, index) => (
                              <span key={index} className="text-xs bg-gray-100 px-3 py-1 rounded-full">
                                {file.type.startsWith('image/') ? '🖼️' : '📄'} {file.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setSelectedDispute(dispute);
                            setContractorPercent(50);
                            setHomeownerPercent(50);
                            setReasoning('');
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                        >
                          📝 Propose Resolution
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Awaiting Approval */}
            {awaitingApprovalDisputes.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  ⏳ Awaiting Party Approval
                </h2>
                <div className="grid gap-4">
                  {awaitingApprovalDisputes.map(dispute => (
                    <div
                      key={dispute.key}
                      className="bg-white rounded-xl shadow-md p-6 border border-yellow-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            Project #{dispute.projectId} - Milestone {parseInt(dispute.milestoneIndex) + 1}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Resolution proposed: {new Date(dispute.resolution!.proposedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                        <p className="text-sm font-semibold text-purple-900 mb-3">Proposed Resolution:</p>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-900">
                              {dispute.resolution!.contractorPercent}%
                            </p>
                            <p className="text-sm text-purple-700">Contractor</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-900">
                              {dispute.resolution!.homeownerPercent}%
                            </p>
                            <p className="text-sm text-purple-700">Homeowner</p>
                          </div>
                        </div>
                        <p className="text-sm text-purple-800">
                          <strong>Reasoning:</strong> {dispute.resolution!.reasoning}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-lg border ${
                          dispute.resolution!.contractorApproved === true
                            ? 'bg-green-50 border-green-300'
                            : dispute.resolution!.contractorApproved === false
                            ? 'bg-red-50 border-red-300'
                            : 'bg-gray-50 border-gray-300'
                        }`}>
                          <p className="text-sm font-semibold mb-1">Contractor:</p>
                          <p className="text-sm">
                            {dispute.resolution!.contractorApproved === true && '✅ Approved'}
                            {dispute.resolution!.contractorApproved === false && '❌ Rejected'}
                            {dispute.resolution!.contractorApproved === null && '⏳ Pending'}
                          </p>
                        </div>
                        <div className={`p-3 rounded-lg border ${
                          dispute.resolution!.homeownerApproved === true
                            ? 'bg-green-50 border-green-300'
                            : dispute.resolution!.homeownerApproved === false
                            ? 'bg-red-50 border-red-300'
                            : 'bg-gray-50 border-gray-300'
                        }`}>
                          <p className="text-sm font-semibold mb-1">Homeowner:</p>
                          <p className="text-sm">
                            {dispute.resolution!.homeownerApproved === true && '✅ Approved'}
                            {dispute.resolution!.homeownerApproved === false && '❌ Rejected'}
                            {dispute.resolution!.homeownerApproved === null && '⏳ Pending'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingDisputes.length === 0 && awaitingApprovalDisputes.length === 0 && (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <p className="text-gray-500 text-lg">No pending disputes</p>
              </div>
            )}
          </div>
        )}

        {/* Completed Tab */}
        {activeTab === 'completed' && (
          <div>
            {completedDisputes.length > 0 ? (
              <div className="grid gap-4">
                {completedDisputes.map(dispute => (
                  <div
                    key={dispute.key}
                    className={`bg-white rounded-xl shadow-md p-6 border ${
                      dispute.status === 'resolved' ? 'border-green-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Project #{dispute.projectId} - Milestone {parseInt(dispute.milestoneIndex) + 1}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {dispute.status === 'resolved' ? '✅ Resolved' : '❌ Frozen (Rejected)'}
                        </p>
                      </div>
                    </div>

                    {dispute.resolution && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Final Resolution:</p>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-sm">Contractor: <strong>{dispute.resolution.contractorPercent}%</strong></p>
                          <p className="text-sm">Homeowner: <strong>{dispute.resolution.homeownerPercent}%</strong></p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <p className="text-gray-500 text-lg">No completed disputes</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resolution Proposal Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                📝 Propose Resolution
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Project #{selectedDispute.projectId} - Milestone {parseInt(selectedDispute.milestoneIndex) + 1}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Payment Split */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Split</h3>

                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Contractor %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={contractorPercent}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setContractorPercent(Math.min(100, Math.max(0, val)));
                        setHomeownerPercent(100 - Math.min(100, Math.max(0, val)));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Homeowner %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={homeownerPercent}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setHomeownerPercent(Math.min(100, Math.max(0, val)));
                        setContractorPercent(100 - Math.min(100, Math.max(0, val)));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg font-semibold"
                    />
                  </div>
                </div>

                {contractorPercent + homeownerPercent !== 100 && (
                  <p className="text-sm text-red-600 font-semibold">
                    ⚠️ Total must equal 100% (currently {contractorPercent + homeownerPercent}%)
                  </p>
                )}

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm text-purple-800">
                    💡 <strong>Tip:</strong> A 50/50 split is recommended for disputed work. Adjust percentages based on evidence and completion level.
                  </p>
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reasoning for Resolution *
                </label>
                <textarea
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="Explain your decision and reasoning for this payment split. This will be visible to both parties..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setSelectedDispute(null);
                  setReasoning('');
                  setContractorPercent(50);
                  setHomeownerPercent(50);
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProposeResolution}
                disabled={loading || contractorPercent + homeownerPercent !== 100 || !reasoning.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Proposing...' : '✅ Propose Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
