'use client';

/**
 * Bridge Status Indicator
 * Shows the status of cross-chain USDC transfers from Arc to Base Sepolia
 */

interface BridgeStatusProps {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  bridgeTxHash?: string;
  amount?: string;
  recipientAddress?: string;
}

export default function BridgeStatusIndicator({
  status,
  bridgeTxHash,
  amount,
  recipientAddress,
}: BridgeStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-300',
          textColor: 'text-gray-700',
          icon: '⏳',
          label: 'Bridge Transfer Pending',
          description: 'Waiting for milestone approval...',
        };
      case 'in_progress':
        return {
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-300',
          textColor: 'text-blue-700',
          icon: '🌉',
          label: 'Bridge Transfer In Progress',
          description: 'Transferring USDC from Arc to Base Sepolia...',
        };
      case 'completed':
        return {
          bgColor: 'bg-green-50',
          borderColor: 'border-green-300',
          textColor: 'text-green-700',
          icon: '✅',
          label: 'Bridge Transfer Completed',
          description: 'USDC successfully transferred to Base Sepolia',
        };
      case 'failed':
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-300',
          textColor: 'text-red-700',
          icon: '❌',
          label: 'Bridge Transfer Failed',
          description: 'Transfer encountered an error. Please contact support.',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4 ${config.textColor}`}
    >
      <div className="flex items-start space-x-3">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">{config.label}</h3>
          <p className="text-xs mb-2">{config.description}</p>

          {amount && (
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Amount:</span>
                <span>{amount} USDC</span>
              </div>
            </div>
          )}

          {recipientAddress && (
            <div className="text-xs mt-1">
              <div className="flex justify-between">
                <span className="font-medium">Recipient (Base):</span>
                <span className="font-mono text-xs">
                  {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                </span>
              </div>
            </div>
          )}

          {bridgeTxHash && (
            <div className="text-xs mt-2 pt-2 border-t border-current border-opacity-20">
              <div className="flex justify-between items-center">
                <span className="font-medium">Bridge TX:</span>
                <a
                  href={`#`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:underline"
                >
                  {bridgeTxHash.slice(0, 10)}...
                </a>
              </div>
            </div>
          )}

          {status === 'in_progress' && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full animate-pulse"
                  style={{ width: '60%' }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
