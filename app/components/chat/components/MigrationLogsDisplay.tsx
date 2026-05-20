import React, { useEffect, useRef } from 'react';
import { classNames } from '~/utils/classNames';
import type { MigrationLog } from '~/components/chat/types';
import { formatTimestamp, getLogStyles } from '~/components/chat/utils';
import { StepActionButtons } from './StepActionButtons';

interface MigrationLogsDisplayProps {
  logs: MigrationLog[];
  isComplete: boolean;
  hasError: boolean;
  stackApiKey: string;
  onContinue: () => void;
  onRetry: () => void;
  onPrevious?: () => void;
}

export const MigrationLogsDisplay: React.FC<MigrationLogsDisplayProps> = ({
  logs,
  isComplete,
  hasError,
  stackApiKey,
  onContinue,
  onRetry,
  onPrevious,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
      {/* header card */}
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200">
                <div className="i-ph:cloud-arrow-up-duotone text-white text-2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">Migration in Progress</h1>
                <p className="text-sm text-gray-500 truncate mt-0.5 font-mono">{stackApiKey}</p>
              </div>
              <StepActionButtons
                onReRun={onRetry}
                onNext={onContinue}
                onPrevious={onPrevious}
                reRunLabel="Re-Run Migration"
                nextLabel="Next"
                show={isComplete || hasError}
                showReRun
                variant="header"
              />
            </div>

            {/* status bar */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              {hasError ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <div className="i-ph:warning-bold text-red-600 text-sm" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-600">Migration Failed</p>
                    <p className="text-xs text-gray-500 mt-0.5">Click Retry to try again</p>
                  </div>
                </div>
              ) : isComplete ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <div className="i-ph:check-bold text-green-600 text-sm" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-600">Migration Complete</p>
                    <p className="text-xs text-gray-500 mt-0.5">Content Types and Entries have been migrated</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="i-svg-spinners:90-ring-with-bg text-purple-600 text-xl" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Migrating to Contentstack...</p>
                    <p className="text-xs text-gray-500 mt-0.5">This may take a few moments</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* logs section */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          {/* logs header */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <div className="i-ph:list-bullets text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Migration Log</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* logs container */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {logs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {logs.map((log) => {
                    const logStyles = getLogStyles(log.type);

                    return (
                      <div
                        key={log.id}
                        className={classNames(
                          'flex items-start gap-3 px-4 py-3 animate-fadeIn transition-colors hover:bg-gray-50',
                          { 'bg-purple-50/50': log.type === 'section' },
                        )}
                      >
                        <span className="text-xs text-gray-400 font-mono shrink-0 pt-0.5 w-16">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className="shrink-0 pt-0.5">
                          <div className={logStyles.iconClass} />
                        </span>
                        <span className={classNames('text-sm flex-1', logStyles.textClass)}>{log.message}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <div className="i-svg-spinners:3-dots-bounce text-xl text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">Waiting for logs...</p>
                  <p className="text-xs text-gray-400 mt-1">Logs will appear here as the migration runs</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(isComplete || hasError) && (
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto flex justify-end">
            <StepActionButtons
              onReRun={onRetry}
              onNext={onContinue}
              onPrevious={onPrevious}
              reRunLabel="Re-Run Migration"
              nextLabel="Continue to Website Creation"
              show
              variant="footer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
