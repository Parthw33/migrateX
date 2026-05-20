import React, { useState, useRef, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import type { ContentTypeLog, ContentTypeSubStep } from '~/components/chat/types';
import {
  stripTimestampPrefix,
  getLogTypeFromMessage,
  mapSSELogType,
  formatTimestamp,
  getLogStyles,
} from '~/components/chat/utils';
import { StepActionButtons } from './StepActionButtons';

interface CreateContentTypesProps {
  websiteUrl: string;
  onProceed: () => void;
  onPrevious?: () => void;
}

export const CreateContentTypesStep: React.FC<CreateContentTypesProps> = ({ websiteUrl, onProceed, onPrevious }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<ContentTypeLog[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSubStep, setCurrentSubStep] = useState<ContentTypeSubStep>('ANALYSIS');
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [assetsComplete, setAssetsComplete] = useState(false);
  const [entriesComplete, setEntriesComplete] = useState(false);
  const [streamingConnection, setStreamingConnection] = useState<EventSource | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const [reconnectTimeout, setReconnectTimeout] = useState<NodeJS.Timeout | null>(null);

  const [streamingText, setStreamingText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  const currentSubStepRef = useRef<ContentTypeSubStep>('ANALYSIS');

  const updateSubStep = useCallback((step: ContentTypeSubStep) => {
    currentSubStepRef.current = step;
    setCurrentSubStep(step);
  }, []);

  // helper to add a log entry
  const addLog = (message: string, type: ContentTypeLog['type']) => {
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

  // connect to streaming logs endpoint for real-time monitoring
  const connectToStreamingLogs = (isReconnect = false) => {
    if (streamingConnection) {
      streamingConnection.close();
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      setReconnectTimeout(null);
    }

    const streamingUrl = '/logs/stream';

    const eventSource = new EventSource(streamingUrl);

    eventSource.onopen = () => {
      if (isReconnect) {
        addLog(`Reconnected to real-time logging system (attempt ${reconnectAttempts + 1})`, 'success');
        setReconnectAttempts(0);
      } else {
        addLog('Connected to real-time logging system', 'success');
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log('SSE Event received:', data);

        switch (data.type) {
          case 'connected': {
            addLog(`Connected to streaming logs service`, 'success');
            break;
          }

          case 'heartbeat': {
            console.log('Heartbeat received');
            break;
          }

          case 'session_start': {
            addLog(`Session started: ${data.message || 'New logging session'}`, 'info');
            setStreamingText('');
            setIsStreaming(true);
            break;
          }

          case 'batch_start': {
            addLog(
              `Batch ${data.batchNumber}/${data.totalBatches} started - Processing ${data.imageCount} images`,
              'info',
            );
            break;
          }

          case 'streaming_chunk': {
            const chunkContent = data.chunkPreview || '';
            console.log('Adding chunk content:', chunkContent, 'isStreaming:', isStreaming);

            if (!isStreaming) {
              setIsStreaming(true);
            }

            if (chunkContent) {
              setStreamingText((prev) => {
                const newText = prev + chunkContent;
                console.log('Updated streamingText length:', newText.length);

                return newText;
              });
            }

            break;
          }

          case 'batch_complete': {
            if (streamingText.trim()) {
              addLog(streamingText.trim(), 'info');
            }

            addLog(
              `Batch ${data.batchNumber}/${data.totalBatches} completed - ${data.responseLength || 'Response received'}`,
              'success',
            );
            setIsStreaming(false);
            setStreamingText('');
            break;
          }

          case 'segment_complete': {
            addLog(`Segment completed: ${data.message || 'Segment processing finished'}`, 'success');
            break;
          }

          case 'error_logged': {
            addLog(`Error: ${data.message || 'An error occurred'}`, 'error');
            break;
          }

          case 'session_end': {
            addLog(`Session ended: ${data.message || 'Logging session completed'}`, 'success');
            setIsStreaming(false);
            setStreamingText('');

            const subStep = currentSubStepRef.current;

            if (subStep === 'ANALYSIS') {
              setAnalysisComplete(true);
              addLog('Content type analysis completed!', 'success');
              addLog('Ready to download assets. Click "Download Assets" to continue.', 'info');
            } else if (subStep === 'CREATE_ENTRIES') {
              setEntriesComplete(true);
              setIsComplete(true);
              addLog('Entry creation completed!', 'success');
            }

            break;
          }

          default: {
            const logType = mapSSELogType(data.type || 'INFO');
            addLog(data.message || `Event: ${data.type}`, logType);
          }
        }
      } catch (error) {
        console.error('Error parsing streaming log:', error, 'Raw data:', event.data);
        addLog('Received streaming log data', 'info');
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);

      if (eventSource.readyState === EventSource.CLOSED) {
        addLog('Streaming logs service not available', 'warning');

        if (reconnectAttempts < maxReconnectAttempts) {
          const nextAttempt = reconnectAttempts + 1;
          const backoffDelay = Math.min(1000 * Math.pow(2, nextAttempt - 1), 30000);

          addLog(
            `Retrying connection in ${Math.round(backoffDelay / 1000)}s (${nextAttempt}/${maxReconnectAttempts})`,
            'info',
          );
          setReconnectAttempts(nextAttempt);

          const timeout = setTimeout(() => {
            connectToStreamingLogs(true);
          }, backoffDelay);

          setReconnectTimeout(timeout);
        } else {
          addLog(`Streaming logs unavailable. Make sure ct-entry server is running on localhost:5002`, 'error');
          addLog(`Continuing with basic logging...`, 'info');
        }
      } else {
        addLog('Streaming logs connection interrupted, attempting to reconnect...', 'warning');
      }
    };

    setStreamingConnection(eventSource);

    return eventSource;
  };

  // cleanup streaming connection
  const disconnectStreamingLogs = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      setReconnectTimeout(null);
    }

    if (streamingConnection) {
      streamingConnection.close();
      setStreamingConnection(null);
    }

    setReconnectAttempts(0);
  };

  const ensureStreamingConnection = () => {
    if (!streamingConnection || streamingConnection.readyState === EventSource.CLOSED) {
      try {
        connectToStreamingLogs(true);
      } catch {
        console.warn('Could not re-establish streaming connection');
      }
    }
  };

  // extract domain from URL for file paths
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);

      return urlObj.hostname;
    } catch {
      return url.replace(/https?:\/\//, '').split('/')[0];
    }
  };

  // generic function to handle streaming response
  const handleStreamingResponse = async (
    response: Response,
    onComplete: () => void,
    completionKeywords: string[] = [],
  ) => {
    let localHasError = false;

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';
      let streamComplete = false;

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

                  const lowerMsg = msg.toLowerCase();

                  for (const keyword of completionKeywords) {
                    if (lowerMsg.includes(keyword.toLowerCase())) {
                      streamComplete = true;
                    }
                  }
                }
              } else if (currentEventType === 'complete' || currentEventType === 'done') {
                streamComplete = true;
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

      if (streamComplete || !localHasError) {
        onComplete();
      }
    } else {
      // non-streaming response
      const data = (await response.json()) as { success?: boolean; result?: unknown };

      if (data.success) {
        onComplete();
      }
    }
  };

  // step 1: start content type analysis
  const startAnalysis = async () => {
    setHasError(false);
    updateSubStep('ANALYSIS');
    console.info('[CreateContentTypesStep] Progress state -> ANALYSIS started', { websiteUrl, isProcessing, hasError });

    const domain = extractDomain(websiteUrl);
    const basePath = `/Users/parth.wattamwar/Documents/Marketplace-Apps/migrate-x/ct-entry/crawler-output/${domain}`;
    const imagesFolder = `${basePath}/pages`;
    const sitemapPath = `${basePath}/sitemap.json`;

    addLog(`Step 1: Starting content type analysis`, 'section');
    addLog(`Website: ${websiteUrl}`, 'info');
    addLog('Content type analysis started...', 'info');

    try {
      connectToStreamingLogs();
    } catch (error) {
      addLog('Streaming logs not available, using basic logging', 'warning');
      console.error('Streaming logs not available, using basic logging', error);
    }

    try {
      const response = await fetch('/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagesFolder,
          sitemapPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis API returned status ${response.status}`);
      }

      await handleStreamingResponse(response, () => {
        addLog('Content type analysis completed!', 'success');
        addLog('Ready to download assets. Click "Download Assets" to continue.', 'info');
        setAnalysisComplete(true);
        console.info('[CreateContentTypesStep] Progress state -> ANALYSIS complete');
      }, ['success', 'content']);
    } catch (error) {
      console.error('Analysis error:', error);
      console.info('[CreateContentTypesStep] Progress state -> ANALYSIS error', error);
      addLog('You can skip to the next step or retry.', 'warning');
      setHasError(true);
    }
  };

  // skip to next step after analysis error
  const skipToAssets = () => {
    setHasError(false);
    setAnalysisComplete(true);
    addLog('Skipped content type analysis. Proceeding to asset download...', 'warning');
    setTimeout(() => {
      startDownloadAssets();
    }, 500);
  };

  // step 2: download assets
  const startDownloadAssets = async () => {
    updateSubStep('DOWNLOAD_ASSETS');
    ensureStreamingConnection();
    console.info('[CreateContentTypesStep] Progress state -> DOWNLOAD_ASSETS started', {
      websiteUrl,
      analysisComplete,
      hasError,
    });
    addLog(`Step 2: Downloading assets...`, 'section');

    try {
      console.info('[CreateContentTypesStep] Starting asset download with websiteUrl:', websiteUrl);

      const response = await fetch('/download-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ websiteUrl }),
      });

      if (!response.ok) {
        throw new Error(`Download assets API returned status ${response.status}`);
      }

      addLog('Connected to asset download service...', 'success');

      await handleStreamingResponse(response, () => {
        addLog('Asset download completed!', 'success');
        setAssetsComplete(true);
        console.info('[CreateContentTypesStep] Progress state -> DOWNLOAD_ASSETS complete');

        addLog('Ready to create entries. Click "Create Entries" to continue.', 'info');
      }, ['complete', 'success', 'finished', 'done']);
    } catch (error) {
      console.error('Asset download error:', error);
      console.info('[CreateContentTypesStep] Progress state -> DOWNLOAD_ASSETS error', error);
      addLog(`Error: ${error instanceof Error ? error.message : 'Failed to download assets'}`, 'error');
      addLog('You can skip to the next step or retry.', 'warning');
      setHasError(true);
    }
  };

  // skip to next step after assets error
  const skipToEntries = () => {
    setHasError(false);
    setAssetsComplete(true);
    addLog('Skipped asset download. Ready to create entries.', 'warning');
    addLog('Click "Create Entries" to continue.', 'info');
  };

  // step 3: create entries
  const startCreateEntries = async () => {
    updateSubStep('CREATE_ENTRIES');
    ensureStreamingConnection();
    console.info('[CreateContentTypesStep] Progress state -> CREATE_ENTRIES started', {
      websiteUrl,
      analysisComplete,
      assetsComplete,
      hasError,
    });
    addLog(`Step 3: Creating entries...`, 'section');

    try {
      const response = await fetch('/entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Entry creation API returned status ${response.status}`);
      }

      addLog('Connected to entry creation service...', 'success');

      await handleStreamingResponse(response, () => {
        addLog('Entry creation completed!', 'success');
        setEntriesComplete(true);
        setIsComplete(true);
        console.info('[CreateContentTypesStep] Progress state -> CREATE_ENTRIES complete, all sub-steps done');
      }, ['complete', 'success', 'finished', 'done', 'created']);
    } catch (error) {
      console.error('Entry creation error:', error);
      console.info('[CreateContentTypesStep] Progress state -> CREATE_ENTRIES error', error);
      addLog(`Error: ${error instanceof Error ? error.message : 'Failed to create entries'}`, 'error');
      addLog('You can skip to continue or retry.', 'warning');
      setHasError(true);
    }
  };

  // skip entries and proceed to migration
  const skipToMigration = () => {
    setHasError(false);
    setEntriesComplete(true);
    setIsComplete(true);
    addLog('Skipped entry creation. Proceeding to migration...', 'warning');
  };

  // get skip handler based on current step
  const getSkipHandler = () => {
    switch (currentSubStep) {
      case 'ANALYSIS': {
        return skipToAssets;
      }

      case 'DOWNLOAD_ASSETS': {
        return skipToEntries;
      }

      case 'CREATE_ENTRIES': {
        return skipToMigration;
      }

      default: {
        return undefined;
      }
    }
  };

  // get skip button label based on current step
  const getSkipButtonLabel = () => {
    switch (currentSubStep) {
      case 'ANALYSIS': {
        return 'Skip to Assets';
      }

      case 'DOWNLOAD_ASSETS': {
        return 'Skip to Entries';
      }

      case 'CREATE_ENTRIES': {
        return 'Skip to Migration';
      }

      default: {
        return 'Skip';
      }
    }
  };

  const handleCreateContentTypes = () => {
    console.info('[CreateContentTypesStep] Progress state -> Starting full content type pipeline', { websiteUrl });
    setIsProcessing(true);
    setShowLogs(true);
    setLogs([]);
    startAnalysis();
  };

  const handleRetry = () => {
    console.info('[CreateContentTypesStep] Progress state -> Retry from ANALYSIS', { currentSubStep, hasError });
    setLogs([]);
    setIsComplete(false);
    setHasError(false);
    setAnalysisComplete(false);
    setAssetsComplete(false);
    setEntriesComplete(false);
    updateSubStep('ANALYSIS');
    disconnectStreamingLogs();
    startAnalysis();
  };

  const handleContinue = () => {
    console.info('[CreateContentTypesStep] Progress state -> Continue to next main step (onProceed)');
    disconnectStreamingLogs();
    onProceed();
  };

  React.useEffect(() => {
    return () => {
      disconnectStreamingLogs();
    };
  }, []);

  // auto-scroll to bottom when logs or streaming text changes
  React.useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, streamingText]);

  const handleDownloadAssets = () => {
    startDownloadAssets();
  };

  const handleCreateEntries = () => {
    startCreateEntries();
  };

  const reRunCurrentSubStep = () => {
    setHasError(false);

    switch (currentSubStep) {
      case 'ANALYSIS': {
        setAnalysisComplete(false);
        setAssetsComplete(false);
        setEntriesComplete(false);
        setIsComplete(false);
        disconnectStreamingLogs();
        startAnalysis();
        break;
      }

      case 'DOWNLOAD_ASSETS': {
        setAssetsComplete(false);
        setEntriesComplete(false);
        setIsComplete(false);
        startDownloadAssets();
        break;
      }

      case 'CREATE_ENTRIES': {
        setEntriesComplete(false);
        setIsComplete(false);
        startCreateEntries();
        break;
      }
    }
  };

  const getReRunHandler = () => {
    if (isComplete) {
      return handleRetry;
    }

    return reRunCurrentSubStep;
  };

  const getNextHandler = (): (() => void) => {
    if (isComplete) {
      return handleContinue;
    }

    if (hasError) {
      return getSkipHandler() ?? handleContinue;
    }

    if (analysisComplete && !assetsComplete && currentSubStep === 'ANALYSIS') {
      return handleDownloadAssets;
    }

    if (assetsComplete && !entriesComplete) {
      return handleCreateEntries;
    }

    return handleContinue;
  };

  const getReRunLabel = () => {
    if (isComplete) {
      return 'Re-Run All';
    }

    switch (currentSubStep) {
      case 'ANALYSIS': {
        return 'Re-Run Analysis';
      }

      case 'DOWNLOAD_ASSETS': {
        return 'Re-Run Download';
      }

      case 'CREATE_ENTRIES': {
        return 'Re-Run Entries';
      }

      default: {
        return 'Re-Run';
      }
    }
  };

  const getNextLabel = () => {
    if (isComplete) {
      return 'Continue to Migration';
    }

    if (hasError) {
      return getSkipButtonLabel();
    }

    if (analysisComplete && !assetsComplete && currentSubStep === 'ANALYSIS') {
      return 'Download Assets';
    }

    if (assetsComplete && !entriesComplete) {
      return 'Create Entries';
    }

    return 'Next';
  };

  const shouldShowActions =
    hasError ||
    isComplete ||
    (analysisComplete && currentSubStep === 'ANALYSIS' && !assetsComplete && !hasError) ||
    (assetsComplete && !entriesComplete && !hasError);

  // manual reconnect to streaming logs
  const handleReconnectLogs = () => {
    addLog('Manually reconnecting to streaming logs...', 'info');
    setReconnectAttempts(0);
    connectToStreamingLogs(true);
  };

  // get current step label
  const getCurrentStepLabel = () => {
    switch (currentSubStep) {
      case 'ANALYSIS': {
        return 'Analyzing Content Types';
      }

      case 'DOWNLOAD_ASSETS': {
        return 'Downloading Assets';
      }

      case 'CREATE_ENTRIES': {
        return 'Creating Entries';
      }

      default: {
        return 'Processing';
      }
    }
  };

  // show logs display when processing
  if (showLogs) {
    return (
      <div className="flex flex-col h-full w-full bg-gray-50">
        {/* header card */}
        <div className="px-6 pt-6 pb-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <div className="i-ph:stack-duotone text-white text-2xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold text-gray-900">{getCurrentStepLabel()}</h1>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{websiteUrl}</p>
                </div>
                <div className="flex items-center gap-3">
                  {reconnectAttempts >= maxReconnectAttempts && (
                    <button
                      onClick={handleReconnectLogs}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm shadow-sm"
                      title="Reconnect to streaming logs"
                    >
                      <div className="i-ph:link text-base" />
                      Reconnect Logs
                    </button>
                  )}
                  <StepActionButtons
                    onReRun={getReRunHandler()}
                    onNext={getNextHandler()}
                    onPrevious={onPrevious}
                    reRunLabel={getReRunLabel()}
                    nextLabel={getNextLabel()}
                    show={shouldShowActions}
                    showReRun={isProcessing}
                    variant="header"
                  />
                </div>
              </div>

              {/* step indicator */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {/* step 1 */}
                  <div className="flex items-center gap-2">
                    <div
                      className={classNames(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                        analysisComplete
                          ? 'bg-green-500 text-white'
                          : currentSubStep === 'ANALYSIS'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500',
                      )}
                    >
                      {analysisComplete ? <div className="i-ph:check text-sm" /> : '1'}
                    </div>
                    <span
                      className={classNames(
                        'text-xs font-medium',
                        analysisComplete
                          ? 'text-green-600'
                          : currentSubStep === 'ANALYSIS'
                            ? 'text-blue-600'
                            : 'text-gray-400',
                      )}
                    >
                      Analysis
                    </span>
                  </div>
                  <div className={classNames('flex-1 h-0.5', analysisComplete ? 'bg-green-500' : 'bg-gray-200')} />
                  {/* step 2 */}
                  <div className="flex items-center gap-2">
                    <div
                      className={classNames(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                        assetsComplete
                          ? 'bg-green-500 text-white'
                          : currentSubStep === 'DOWNLOAD_ASSETS'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500',
                      )}
                    >
                      {assetsComplete ? <div className="i-ph:check text-sm" /> : '2'}
                    </div>
                    <span
                      className={classNames(
                        'text-xs font-medium',
                        assetsComplete
                          ? 'text-green-600'
                          : currentSubStep === 'DOWNLOAD_ASSETS'
                            ? 'text-blue-600'
                            : 'text-gray-400',
                      )}
                    >
                      Assets
                    </span>
                  </div>
                  <div className={classNames('flex-1 h-0.5', assetsComplete ? 'bg-green-500' : 'bg-gray-200')} />
                  {/* step 3 */}
                  <div className="flex items-center gap-2">
                    <div
                      className={classNames(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                        entriesComplete
                          ? 'bg-green-500 text-white'
                          : currentSubStep === 'CREATE_ENTRIES'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500',
                      )}
                    >
                      {entriesComplete ? <div className="i-ph:check text-sm" /> : '3'}
                    </div>
                    <span
                      className={classNames(
                        'text-xs font-medium',
                        entriesComplete
                          ? 'text-green-600'
                          : currentSubStep === 'CREATE_ENTRIES'
                            ? 'text-blue-600'
                            : 'text-gray-400',
                      )}
                    >
                      Entries
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* logs section */}
        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="max-w-4xl mx-auto h-full flex flex-col">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <div className="i-ph:list-bullets text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-700">Execution Log</h2>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div ref={logsContainerRef} className="h-full overflow-y-auto scroll-smooth">
                {/* Unified log display - shows all logs and streaming content */}
                <div className="divide-y divide-gray-50">
                  {/* Show existing logs */}
                  {logs.map((log) => {
                    const logStyles = getLogStyles(log.type);

                    return (
                      <div
                        key={log.id}
                        className={classNames(
                          'flex items-start gap-3 px-4 py-3 animate-fadeIn transition-colors hover:bg-gray-50',
                          {
                            'bg-purple-50/50': log.type === 'section',
                          },
                        )}
                      >
                        <span className="text-xs text-gray-400 font-mono shrink-0 pt-0.5 w-16">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className="shrink-0 pt-0.5">
                          <div className={logStyles.iconClass} />
                        </span>
                        <div className={classNames('text-sm flex-1', logStyles.textClass)}>
                          <span className="whitespace-pre-wrap break-words">{log.message}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Show streaming text as a single entry when streaming */}
                  {isStreaming && streamingText && (
                    <div className="flex items-start gap-3 px-4 py-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-l-3 border-blue-400 animate-fadeIn">
                      <span className="text-xs text-gray-400 font-mono shrink-0 pt-1 w-16">
                        {formatTimestamp(new Date())}
                      </span>
                      <span className="shrink-0 pt-1">
                        <div className="i-svg-spinners:pulse text-blue-500" />
                      </span>
                      <div className="flex-1 text-gray-800 leading-relaxed">
                        <span className="text-sm whitespace-pre-wrap break-words">
                          {streamingText}
                          <span className="inline-block w-2 h-5 bg-blue-500 animate-pulse ml-0.5">|</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Show waiting message when no logs and not streaming */}
                {logs.length === 0 && !isStreaming && (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <div className="i-svg-spinners:3-dots-bounce text-xl text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">Waiting for logs...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {shouldShowActions && (
          <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="max-w-4xl mx-auto flex justify-end">
              <StepActionButtons
                onReRun={getReRunHandler()}
                onNext={getNextHandler()}
                onPrevious={onPrevious}
                reRunLabel={getReRunLabel()}
                nextLabel={getNextLabel()}
                show
                variant="footer"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // initial view with button to start
  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
      {/* header */}
      <div className="px-6 pt-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                <div className="i-ph:check-bold text-white text-2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">Scraping Complete!</h1>
                <p className="text-sm text-gray-500 truncate mt-0.5">{websiteUrl}</p>
              </div>
            </div>

            {/* step indicator */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                    1
                  </div>
                  <span className="text-sm font-medium text-purple-600">Content Types</span>
                </div>
                <div className="flex-1 h-0.5 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-semibold">
                    2
                  </div>
                  <span className="text-sm font-medium text-gray-400">Migration</span>
                </div>
                <div className="flex-1 h-0.5 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-semibold">
                    3
                  </div>
                  <span className="text-sm font-medium text-gray-400">Website</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* main content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <div className="i-ph:stack-bold text-blue-600 text-3xl" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Create Content Types & Entries</h2>
            <p className="text-gray-500 text-sm mb-6">
              Based on the scraped content, we'll analyze and create Content Types and Entries structure for your
              Contentstack stack.
            </p>

            <button
              onClick={handleCreateContentTypes}
              disabled={isProcessing}
              className={classNames(
                'w-full py-3 px-6 rounded-lg font-medium text-white transition-all',
                isProcessing
                  ? 'bg-purple-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 shadow-sm hover:shadow-md',
              )}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="i-svg-spinners:90-ring-with-bg text-lg" />
                  Starting Analysis...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <div className="i-ph:stack-plus text-lg" />
                  Create Content Types & Entries
                </span>
              )}
            </button>

            <p className="text-xs text-gray-400 mt-4">
              This will analyze the scraped data and create appropriate Content Types
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
