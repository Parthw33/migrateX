import type { LogType, PersistedMigrationState } from './types';
import { MIGRATION_STATE_KEY } from './constants';

// format time for message timestamps
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// format timestamp with seconds for logs
export const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// strip timestamp prefix from log messages (e.g., "[2026-01-28 18:33:11]")
export const stripTimestampPrefix = (message: string): string => {
  return message.replace(/^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s*/g, '');
};

// helper to determine log type from message content
export const getLogTypeFromMessage = (message: string): LogType => {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('exception')) {
    return 'error';
  }

  if (lowerMsg.includes('warning') || lowerMsg.includes('warn') || lowerMsg.includes('skip')) {
    return 'warning';
  }

  if (
    lowerMsg.includes('success') ||
    lowerMsg.includes('complete') ||
    lowerMsg.includes('done') ||
    lowerMsg.includes('found') ||
    lowerMsg.includes('finished') ||
    lowerMsg.includes('created') ||
    lowerMsg.includes('imported')
  ) {
    return 'success';
  }

  if (
    lowerMsg.includes('analyzing') ||
    lowerMsg.includes('processing') ||
    lowerMsg.includes('starting') ||
    lowerMsg.includes('migrating') ||
    lowerMsg.includes('importing')
  ) {
    return 'section';
  }

  return 'info';
};

// map SSE log type to our log type
export const mapSSELogType = (sseType: string): LogType => {
  switch (sseType.toUpperCase()) {
    case 'SUCCESS': {
      return 'success';
    }

    case 'ERROR': {
      return 'error';
    }

    case 'WARNING':
    case 'WARN': {
      return 'warning';
    }

    case 'SECTION': {
      return 'section';
    }

    default: {
      return 'info';
    }
  }
};

// localStorage persistence functions
export const loadMigrationState = (): PersistedMigrationState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = localStorage.getItem(MIGRATION_STATE_KEY);

    if (saved) {
      return JSON.parse(saved) as PersistedMigrationState;
    }
  } catch (error) {
    console.error('Failed to load migration state:', error);
  }

  return null;
};

export const saveMigrationState = (state: PersistedMigrationState): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save migration state:', error);
  }
};

export const clearMigrationState = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(MIGRATION_STATE_KEY);
  } catch (error) {
    console.error('Failed to clear migration state:', error);
  }
};

// get log styles based on type
export const getLogStyles = (type: LogType) => {
  switch (type) {
    case 'success': {
      return {
        iconClass: 'i-ph:check-circle text-green-600',
        textClass: 'text-green-700',
      };
    }

    case 'error': {
      return {
        iconClass: 'i-ph:x-circle text-red-600',
        textClass: 'text-red-700',
      };
    }

    case 'warning': {
      return {
        iconClass: 'i-ph:warning-circle text-amber-600',
        textClass: 'text-amber-700',
      };
    }

    case 'section': {
      return {
        iconClass: 'i-ph:folder-notch-open text-purple-600',
        textClass: 'text-purple-700 font-semibold',
      };
    }

    case 'streaming': {
      return {
        iconClass: 'i-svg-spinners:pulse text-blue-500',
        textClass: 'text-gray-700',
      };
    }

    default: {
      return {
        iconClass: 'i-ph:info text-blue-500',
        textClass: 'text-gray-600',
      };
    }
  }
};
