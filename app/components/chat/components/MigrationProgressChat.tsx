import React, { useState, useEffect } from 'react';
import type { MigrationLog } from '~/components/chat/types';
import { stripTimestampPrefix, getLogTypeFromMessage, mapSSELogType } from '~/components/chat/utils';
import { MigrationLogsDisplay } from './MigrationLogsDisplay';

interface MigrationProgressChatProps {
  stackUid: string;
  websiteUrl: string;
  onComplete: () => void;
  onPrevious?: () => void;
}

export const MigrationProgressChat: React.FC<MigrationProgressChatProps> = ({
  stackUid,
  websiteUrl: _websiteUrl,
  onComplete,
  onPrevious,
}) => {
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);

  // helper to add a log entry
  const addLog = (message: string, type: MigrationLog['type']) => {
    const cleanMessage = stripTimestampPrefix(message);

    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random()}`,
        message: cleanMessage,
        type,
        timestamp: new Date(),
      },
    ]);
  };

  const startMigration = async () => {
    setHasError(false);
    setLogs([]);

    let localComplete = false;
    let localHasError = false;

    addLog(`Starting migration to Contentstack stack...`, 'section');
    addLog(`Stack API Key: ${stackUid}`, 'info');

    try {
      const response = await fetch('/migrate/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stack-api-key': stackUid,
        },
      });

      if (!response.ok) {
        throw new Error(`Migration API returned status ${response.status}`);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        addLog('Connected to migration service, receiving logs...', 'success');

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine) {
              currentEventType = '';

              continue;
            }

            if (trimmedLine.startsWith('event:')) {
              currentEventType = trimmedLine.slice(6).trim();

              continue;
            }

            if (trimmedLine.startsWith('data:')) {
              const dataStr = trimmedLine.slice(5).trim();

              try {
                const data = JSON.parse(dataStr);

                if (currentEventType === 'log' || !currentEventType) {
                  const msg = data.msg || data.message || '';
                  const logType = mapSSELogType(data.type || 'INFO');

                  if (msg) {
                    addLog(msg, logType);

                    if (
                      msg.toLowerCase().includes('migration complete') ||
                      msg.toLowerCase().includes('import complete') ||
                      msg.toLowerCase().includes('import command completed successfully') ||
                      msg.toLowerCase().includes('successfully migrated')
                    ) {
                      localComplete = true;

                      setTimeout(() => {
                        setIsComplete(true);
                      }, 500);
                    }
                  }
                } else if (currentEventType === 'complete' || currentEventType === 'done') {
                  localComplete = true;
                  addLog('Migration completed successfully!', 'success');
                  setIsComplete(true);
                } else if (currentEventType === 'error') {
                  const errorMsg = data.msg || data.message || 'Unknown error occurred';
                  addLog(`Error: ${errorMsg}`, 'error');
                  localHasError = true;
                  setHasError(true);
                }
              } catch {
                if (dataStr) {
                  addLog(dataStr, getLogTypeFromMessage(dataStr));
                }
              }
            }
          }
        }

        if (buffer.trim()) {
          addLog(buffer.trim(), getLogTypeFromMessage(buffer.trim()));
        }

        if (!localComplete && !localHasError) {
          addLog('Migration completed! Ready to proceed.', 'success');
          setIsComplete(true);
        }
      } else {
        const data = (await response.json()) as { logs?: Array<string | { message?: string }>; success?: boolean };
        addLog('Received migration response', 'info');

        if (data.logs && Array.isArray(data.logs)) {
          for (const log of data.logs) {
            const msg = typeof log === 'string' ? log : (log as { message?: string }).message || JSON.stringify(log);
            addLog(msg, getLogTypeFromMessage(msg));
          }
        }

        addLog('Migration completed! Ready to proceed.', 'success');
        setIsComplete(true);
      }
    } catch (error) {
      console.error('Migration error:', error);
      addLog(`Error: ${error instanceof Error ? error.message : 'Failed to connect to migration service'}`, 'error');
      addLog('Please ensure the migration server is running on localhost:5002', 'warning');
      setHasError(true);
    }
  };

  // start migration on mount
  useEffect(() => {
    startMigration();
  }, []);

  const handleRetry = () => {
    setLogs([]);
    setIsComplete(false);
    setHasError(false);
    startMigration();
  };

  const handleContinue = () => {
    onComplete();
  };

  return (
    <MigrationLogsDisplay
      logs={logs}
      isComplete={isComplete}
      hasError={hasError}
      stackApiKey={stackUid}
      onContinue={handleContinue}
      onRetry={handleRetry}
      onPrevious={onPrevious}
    />
  );
};
