import { useEffect, useCallback } from 'react';
import { wsService } from '@/services/websocket.service';
import { useAuth } from '@/contexts/AuthContext';

export function useWebSocket() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      wsService.connect();
    } else {
      wsService.disconnect();
    }
    return () => wsService.disconnect();
  }, [isAuthenticated]);

  const subscribe = useCallback((type: string, handler: (data: unknown) => void) => {
    return wsService.on(type, handler);
  }, []);

  const send = useCallback((type: string, data: unknown) => {
    wsService.send(type, data);
  }, []);

  return { subscribe, send, isConnected: wsService.isConnected };
}
