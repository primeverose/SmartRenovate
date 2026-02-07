'use client';

import { useWallet } from '@/app/context/WalletContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function ProposeResolution() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params.id as string;
  const milestoneIndex = searchParams.get('milestone') || '0';

  const [contractorPercent, setContractorPercent] = useState(50);
  const [homeownerPercent, setHomeownerPercent] = useState(50);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDispute, setActiveDispute] = useState<any>(null);

  // Load active dispute
  useEffect(() => {
    const disputeKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('dispute_') && localStorage.getItem(key)?.includes(`"projectId":"${projectId}"`)
    );

    if (disputeKeys.length > 0) {
      for (const disputeKey of disputeKeys) {
        const disputeData = localStorage.getItem(disputeKey);
        if (disputeData) {
          try {
            const dispute = JSON.parse(disputeData);
            if (dispute.status === 'pending' && dispute.milestoneIndex === milestoneIndex) {
              setActiveDispute({ ...dispute, key: disputeKey });
              break;
            }
          } catch (error) {
            console.error('Failed to parse dispute data:', error);
          }
        }
      }
    }
  }, [projectId, milestoneIndex]);

  // Auto-adjust percentages to total 100%
  const handleContractorChange = (value: number) => {
    const clampedValue = Math.max(0, Math.min(100, value));
    setContractorPercent(clampedValue);
    setHomeownerPercent(100 - clampedValue);
  };

  const handleHomeownerChange = (value: number) => {
    const clampedValue = Math.max(0, Math.min(100, value));
    setHomeownerPercent(clampedValue);
    setContractorPercent(100 - clampedValue);
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
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          base64: base64,
          type: file.type,
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitResolution = async () => {
    if (!activeDispute) {
      alert('No active dispute found');
      return;
    }

    if (contractorPercent + homeownerPercent !== 100) {
      alert('Percentages must total 100%');
      return;
    }

    try {
      setLoading(true);

      // Save uploaded files to localStorage if any
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((file, index) => {
          const storageKey = `resolution_file_${projectId}_${milestoneIndex}_${Date.now()}_${index}`;
          localStorage.setItem(storageKey, JSON.stringify({
            projectId,
            milestoneIndex,
            fileName: file.name,
            fileType: file.type,
            base64Data: file.base64,
            uploadedAt: Date.now(),
          }));
        });
      }

      const resolution = {
        contractorPercent,
        homeownerPercent,
        uploadedFiles: uploadedFiles.length,
        proposedAt: Date.now(),
        proposedBy: address,
        contractorApproved: null, // null = pending, true = approved, false = rejected
        homeownerApproved: null,
      };

      const updatedDispute = {
        ...activeDispute,
        resolution,
        status: 'pending', // Still pending until both parties approve
      };

      localStorage.setItem(activeDispute.key, JSON.stringify(updatedDispute));

      alert(
        '⚖️ Resolution Proposed!\n\n' +
        `Contractor: ${contractorPercent}%\n` +
        `Homeowner Refund: ${homeownerPercent}%\n\n` +
        'Both parties will be notified to review and approve/reject this resolution.'
      );

      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error proposing resolution:', error);
      alert(`Failed to propose resolution: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected || currentRole !== 'arbitrator') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Access denied. Arbitrator role required.</p>
        </div>
      </div>
    );
  }

  if (!activeDispute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Loading dispute...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-purple-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="text-purple-600 hover:text-purple-800"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                ⚖️ Propose Resolution
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Dispute Info */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Dispute Details</h2>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Opened By:</p>
                <p className="text-gray-900">{activeDispute.openedBy} ({activeDispute.openedByAddress?.slice(0, 6)}...{activeDispute.openedByAddress?.slice(-4)})</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700">Reason:</p>
                <p className="text-gray-900">{activeDispute.reason.replace(/_/g, ' ')}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700">Description:</p>
                <p className="text-gray-900 bg-gray-50 p-4 rounded-lg">{activeDispute.description}</p>
              </div>

              {activeDispute.evidence && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Evidence:</p>
                  <p className="text-gray-900 bg-gray-50 p-4 rounded-lg">{activeDispute.evidence}</p>
                </div>
              )}
            </div>
          </div>

          {/* Resolution Form */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Proposed Payment Split</h2>

            <div className="space-y-6">
              {/* Contractor Percentage */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Prime Contractor Payment (%)
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={contractorPercent}
                    onChange={(e) => handleContractorChange(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2D4A7C]"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={contractorPercent}
                    onChange={(e) => handleContractorChange(parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-bold text-[#2D4A7C]"
                  />
                  <span className="text-lg font-bold text-[#2D4A7C]">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Percentage of milestone amount to be paid to the contractor
                </p>
              </div>

              {/* Homeowner Percentage */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Homeowner Refund (%)
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={homeownerPercent}
                    onChange={(e) => handleHomeownerChange(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#7FA3D1]"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={homeownerPercent}
                    onChange={(e) => handleHomeownerChange(parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-bold text-[#7FA3D1]"
                  />
                  <span className="text-lg font-bold text-[#7FA3D1]">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Percentage to be refunded back to homeowner
                </p>
              </div>

              {/* Visual Split */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Payment Split Visualization:</p>
                <div className="flex h-12 rounded-lg overflow-hidden border-2 border-gray-300">
                  <div
                    className="bg-[#2D4A7C] flex items-center justify-center text-white font-bold transition-all"
                    style={{ width: `${contractorPercent}%` }}
                  >
                    {contractorPercent > 10 && `${contractorPercent}%`}
                  </div>
                  <div
                    className="bg-[#7FA3D1] flex items-center justify-center text-white font-bold transition-all"
                    style={{ width: `${homeownerPercent}%` }}
                  >
                    {homeownerPercent > 10 && `${homeownerPercent}%`}
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-[#2D4A7C] font-semibold">Contractor</span>
                  <span className="text-[#7FA3D1] font-semibold">Homeowner</span>
                </div>
              </div>

              {/* Supporting Documents (Optional) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Supporting Documents (Optional)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    id="resolution-file-upload"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="resolution-file-upload"
                    className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors"
                  >
                    <div className="text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-semibold text-purple-600">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">Photos, PDF, Word, Text documents (max 5MB per file)</p>
                    </div>
                  </label>
                </div>

                {/* Uploaded Files */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center space-x-3">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-900">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-600 hover:text-red-800 text-sm font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <p className="text-purple-800 text-sm font-semibold mb-2">📋 Important Notes:</p>
                <ul className="text-purple-700 text-sm space-y-1">
                  <li>• Both parties must approve this resolution for the project to proceed</li>
                  <li>• If either party rejects, the project remains frozen</li>
                  <li>• Once approved by both, payment will be executed according to these percentages</li>
                  <li>• Your decision will be recorded on-chain through the milestone approval mechanism</li>
                </ul>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => router.push(`/project/${projectId}`)}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitResolution}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <span>⚖️</span>
                  <span>{loading ? 'Submitting...' : 'Propose Resolution'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
