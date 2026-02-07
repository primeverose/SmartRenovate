'use client';

import { useWallet } from '@/app/context/WalletContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function OpenDispute() {
  const { address, isConnected, currentRole } = useWallet();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params.id as string;
  const milestoneIndex = searchParams.get('milestone') || '0';

  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleSubmitDispute = async () => {
    if (!reason.trim() || !description.trim()) {
      alert('Please provide a reason and detailed description for the dispute');
      return;
    }

    try {
      setLoading(true);

      const disputeData = {
        projectId,
        milestoneIndex,
        openedBy: currentRole,
        openedByAddress: address,
        reason,
        description,
        evidence,
        files: uploadedFiles,
        openedAt: Date.now(),
        status: 'pending', // pending, resolved, rejected
        resolution: null,
      };

      // Store dispute in localStorage
      const disputeKey = `dispute_${projectId}_${Date.now()}`;
      localStorage.setItem(disputeKey, JSON.stringify(disputeData));

      // Store file references
      uploadedFiles.forEach((file, index) => {
        const fileKey = `dispute_file_${projectId}_${Date.now()}_${index}`;
        localStorage.setItem(fileKey, JSON.stringify({
          ...file,
          disputeKey,
          uploadedAt: Date.now(),
        }));
      });

      alert(
        '⚠️ Dispute Opened!\n\n' +
        'The project has been frozen.\n' +
        'An arbitrator will review your case and propose a resolution.\n\n' +
        'Both parties must agree to the resolution for the project to continue.'
      );

      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error('Error opening dispute:', error);
      alert(`Failed to open dispute: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-red-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="text-red-600 hover:text-red-800"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                ⚠️ Open Dispute
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-6">
          {/* Warning Box */}
          <div className="bg-red-100 border-2 border-red-300 rounded-xl p-6">
            <h2 className="text-lg font-bold text-red-800 mb-3">⚠️ Important: Opening a Dispute</h2>
            <ul className="space-y-2 text-sm text-red-700">
              <li>• The project will be <strong>frozen</strong> until the dispute is resolved</li>
              <li>• An arbitrator will review all evidence from both parties</li>
              <li>• The arbitrator will propose a payment split resolution</li>
              <li>• Both parties must agree to the resolution to unfreeze the project</li>
              <li>• If either party rejects, the project remains frozen</li>
            </ul>
          </div>

          {/* Dispute Form */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Dispute Details</h2>

            {/* Reason */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Dispute *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Select a reason...</option>
                <option value="quality_issues">Work Quality Issues</option>
                <option value="incomplete_work">Incomplete Work</option>
                <option value="scope_disagreement">Scope Disagreement</option>
                <option value="payment_disagreement">Payment Disagreement</option>
                <option value="timeline_issues">Timeline Issues</option>
                <option value="change_order_dispute">Change Order Dispute</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Detailed Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide a detailed explanation of the dispute. Include specific facts, dates, and what resolution you're seeking..."
                rows={8}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Evidence */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Key Evidence (Optional)
              </label>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="List key evidence that supports your case (e.g., communications, agreements, previous approvals...)"
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Supporting Documents (Optional)
              </label>
              <div className="relative">
                <input
                  type="file"
                  id="dispute-file-upload"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="dispute-file-upload"
                  className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-red-500 hover:bg-red-50 transition-colors"
                >
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-semibold text-red-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">Photos, PDF, Word, Text documents (max 5MB per file)</p>
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
                onClick={handleSubmitDispute}
                disabled={loading || !reason.trim() || !description.trim()}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Opening Dispute...' : '⚠️ Open Dispute'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
