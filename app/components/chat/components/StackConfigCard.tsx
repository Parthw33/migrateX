import React from 'react';
import { classNames } from '~/utils/classNames';

interface StackSetupData {
  environment?: { name: string; uid: string };
  deliveryToken?: { name: string; token: string; uid: string };
  environmentAlreadyExists?: boolean;
}

interface StackConfigCardProps {
  stackUid: string;
  onEdit?: () => void;
  isProcessing?: boolean;
  onMigrate?: () => void;

  /** Defaults to "Migrate" (post–content-types flow). */
  primaryActionLabel?: string;
  isSettingUp?: boolean;
  setupData?: StackSetupData | null;
  setupError?: string | null;

  /**
   * When true (default), primary action stays disabled until preview/env setup via `/api/contentstack` succeeds.
   * When false, only the stack API key is required — use for org/stack selection before `POST /scrape`.
   */
  requireContentstackSetup?: boolean;
}

export const StackConfigCard: React.FC<StackConfigCardProps> = ({
  stackUid,
  onEdit,
  isProcessing,
  onMigrate,
  primaryActionLabel,
  isSettingUp,
  setupData,
  setupError,
  requireContentstackSetup = true,
}) => {
  const showEnvBlocks = requireContentstackSetup;
  const primaryDisabled =
    !stackUid || isProcessing || (requireContentstackSetup && (isSettingUp || !setupData || !!setupError));

  // helper to mask sensitive tokens
  const maskToken = (token: string) => {
    if (token.length <= 8) {
      return token;
    }

    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-96 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Stack Configuration</h3>
        {((requireContentstackSetup && setupData && !setupError) || (!requireContentstackSetup && stackUid)) && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <div className="i-ph:check-circle text-sm" />
            Ready
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <div className="i-ph:stack-bold text-purple-600 text-xl" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900">Contentstack Stack</h4>
            <p className="text-xs text-gray-500">
              {!requireContentstackSetup
                ? 'Start scraping runs the Migrate-X crawler (POST /scrape).'
                : isSettingUp
                  ? 'Setting up...'
                  : setupData
                    ? 'Environment and token created'
                    : 'Review your stack details'}
            </p>
          </div>
        </div>

        {/* fields */}
        <div className="space-y-3">
          {/* stack API key */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stack API Key</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono truncate">
              {stackUid || 'Not provided'}
            </div>
          </div>

          {/* setup status indicator */}
          {showEnvBlocks && isSettingUp && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="i-svg-spinners:90-ring-with-bg text-blue-600" />
              <span className="text-sm text-blue-700">Creating environment and delivery token...</span>
            </div>
          )}

          {/* error display */}
          {showEnvBlocks && setupError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <div className="i-ph:warning-circle text-base" />
                <span className="text-sm font-medium">Setup Error</span>
              </div>
              <p className="text-xs text-red-600 mt-1">{setupError}</p>
            </div>
          )}

          {/* environment info */}
          {showEnvBlocks && setupData?.environment && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Environment
                {setupData.environmentAlreadyExists && <span className="ml-1 text-amber-600">(already existed)</span>}
              </label>
              <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="i-ph:globe text-green-600" />
                  <span className="text-sm font-medium text-green-800">{setupData.environment.name}</span>
                </div>
              </div>
            </div>
          )}

          {/* delivery token info */}
          {showEnvBlocks && setupData?.deliveryToken && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Token</label>
              <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <div className="i-ph:key text-green-600" />
                  <span className="text-sm font-medium text-green-800">{setupData.deliveryToken.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-mono">{maskToken(setupData.deliveryToken.token)}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(setupData.deliveryToken?.token ?? '');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <div className="i-ph:copy text-sm" />
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* migration status */}
          {showEnvBlocks && setupData && !setupError && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Migration Status</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                {isProcessing ? 'Working…' : 'Ready'}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onEdit}
            disabled={requireContentstackSetup && isSettingUp}
            className={classNames(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              requireContentstackSetup && isSettingUp
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50',
            )}
          >
            <div className="i-ph:pencil-simple text-base" />
            Edit
          </button>
          <button
            onClick={onMigrate}
            disabled={primaryDisabled}
            className={classNames(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              isProcessing || (requireContentstackSetup && isSettingUp)
                ? 'bg-purple-400 text-white cursor-not-allowed'
                : !primaryDisabled
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
          >
            {isProcessing ? (
              <>
                <div className="i-svg-spinners:90-ring-with-bg text-base" />
                Please wait…
              </>
            ) : (
              <>
                <div className="i-ph:rocket-launch text-base" />
                {primaryActionLabel ?? 'Migrate'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
