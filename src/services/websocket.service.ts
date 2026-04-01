import { ENV } from '@/config/env';
import { getAccessToken } from './api.service';

type MessageHandler = (data: unknown) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers = new Map<string, Set<MessageHandler>>();
  private isConnecting = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;

    const token = getAccessToken();
    if (!token) return;

    this.isConnecting = true;
    const url = `${ENV.WS_URL}/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.debug('[WS] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type: string; data: unknown };
          const typeHandlers = this.handlers.get(message.type);
          typeHandlers?.forEach((handler) => handler(message.data));

          // Also notify wildcard handlers
          const wildcardHandlers = this.handlers.get('*');
          wildcardHandlers?.forEach((handler) => handler(message));
        } catch {
          // Non-JSON message
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        console.debug('[WS] Disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch {
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.ws?.close();
    this.ws = null;
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.debug(`[WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect();
    }, delay);
  }
}

export const wsService = new WebSocketService();
