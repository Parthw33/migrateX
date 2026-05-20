import { useCallback, useEffect, useRef, useState } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'error' | 'warning' | 'success' | 'debug';
  message: string;
  source?: string;
}

export interface SocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

export interface UseSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export function useSocket(options: UseSocketOptions = {}) {
  const {
    url = '/api/socket',
    autoConnect = false,
    reconnectAttempts = 3,
    reconnectInterval = 3000,
  } = options;

  const [state, setState] = useState<SocketState>({
    connected: false,
    connecting: false,
    error: null,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setLogs((prev) => [...prev, newEntry]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setState({ connected: true, connecting: false, error: null });
        reconnectCountRef.current = 0;
        addLog({ type: 'success', message: 'Connected to server', source: 'socket' });
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'log') {
            addLog({
              type: data.logType || 'info',
              message: data.message,
              source: data.source,
            });
          } else if (data.type === 'logs') {
            // Batch logs
            data.logs.forEach((log: Omit<LogEntry, 'id' | 'timestamp'>) => {
              addLog(log);
            });
          }
        } catch {
          addLog({ type: 'info', message: event.data, source: 'socket' });
        }
      };

      socket.onerror = () => {
        setState((prev) => ({ ...prev, error: 'Connection error' }));
        addLog({ type: 'error', message: 'Socket connection error', source: 'socket' });
      };

      socket.onclose = () => {
        setState((prev) => ({ ...prev, connected: false, connecting: false }));
        addLog({ type: 'warning', message: 'Disconnected from server', source: 'socket' });

        // Attempt reconnection
        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          addLog({
            type: 'info',
            message: `Reconnecting... (${reconnectCountRef.current}/${reconnectAttempts})`,
            source: 'socket',
          });
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };
    } catch (error) {
      setState({ connected: false, connecting: false, error: 'Failed to connect' });
      addLog({ type: 'error', message: `Connection failed: ${error}`, source: 'socket' });
    }
  }, [url, reconnectAttempts, reconnectInterval, addLog]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectCountRef.current = reconnectAttempts; // Prevent auto-reconnect

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setState({ connected: false, connecting: false, error: null });
  }, [reconnectAttempts]);

  const send = useCallback((data: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  const emit = useCallback(
    (event: string, payload?: unknown) => {
      send({ event, payload });
    },
    [send],
  );

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    logs,
    connect,
    disconnect,
    send,
    emit,
    addLog,
    clearLogs,
  };
}

// Socket context for sharing across components
import { createContext, useContext, type ReactNode } from 'react';

interface SocketContextValue extends ReturnType<typeof useSocket> {}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({
  children,
  options,
}: {
  children: ReactNode;
  options?: UseSocketOptions;
}) {
  const socket = useSocket(options);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }

  return context;
}
