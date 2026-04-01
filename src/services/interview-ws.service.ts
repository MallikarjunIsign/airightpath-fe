import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { ENV } from "@/config/env";
import { APP_CONFIG } from "@/config/app.config";
import { getAccessToken } from "@/services/api.service";

type MessageHandler = (body: any) => void;

class InterviewWebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, StompSubscription> = new Map();
  private subscriptionHandlers: Map<string, MessageHandler> = new Map();
  private scheduleId: number | null = null;
  private reconnectAttempts = 0;
  private onConnectedCallback: (() => void) | null = null;
  private onDisconnectedCallback: (() => void) | null = null;
  private isConnecting = false;
  private lastError: string | null = null;
  private onErrorCallback: ((err: string) => void) | null = null;
  // queue for small messages when socket is temporarily disconnected
  private pendingSends: Array<{ destination: string; body: any }> = [];
  private readonly MAX_PENDING_SENDS = 200;

  connect(
    scheduleId: number,
    onConnected?: () => void,
    onDisconnected?: () => void,
  ): void {
    if (this.isConnecting || this.client?.connected) return;

    this.scheduleId = scheduleId;
    this.onConnectedCallback = onConnected || null;
    this.onDisconnectedCallback = onDisconnected || null;
    this.isConnecting = true;

    const token = getAccessToken();
    const wsUrl = token
      ? `${ENV.API_BASE_URL}/ws?token=${encodeURIComponent(token)}`
      : `${ENV.API_BASE_URL}/ws`;

    console.info("WS connect attempt to:", wsUrl, "tokenPresent:", !!token);

    this.client = new Client({
      debug: (msg: string) => {
        if (import.meta.env.DEV) console.debug("STOMP:", msg);
      },
      // SockJS client for proper protocol compatibility with Spring's SockJS endpoint
      webSocketFactory: () => new SockJS(wsUrl) as any,
      reconnectDelay: APP_CONFIG.WS_RECONNECT_BASE_DELAY_MS,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onWebSocketError: (event) => {
        const msg = `websocket-error:${(event as any)?.message ?? "unknown"}`;
        console.error("WebSocket error", event);
        this.lastError = msg;
        this.onErrorCallback?.(msg);
      },

      onConnect: () => {
        console.info("WebSocket connected");
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.lastError = null;
        this.resubscribeAll();
        this.flushPendingSends();
        this.onConnectedCallback?.();
      },

      onStompError: (frame) => {
        const msg = frame?.headers?.["message"] ?? "STOMP error";
        console.error("STOMP error:", msg, frame);
        this.lastError = msg;
        this.onErrorCallback?.(msg);
        this.isConnecting = false;
      },

      onDisconnect: () => {
        console.warn("WebSocket disconnected");
        this.lastError = "disconnected";
        this.onErrorCallback?.(this.lastError);
        this.isConnecting = false;
        this.onDisconnectedCallback?.();
      },

      onWebSocketClose: (event) => {
        const code = event?.code ?? 0;
        const reason = event?.reason ?? "";
        console.warn("WebSocket closed", code, reason);
        this.lastError = `closed:${code}:${reason}`;
        this.onErrorCallback?.(this.lastError);
        this.isConnecting = false;
        this.reconnectAttempts++;

        if (this.reconnectAttempts >= APP_CONFIG.WS_RECONNECT_MAX_ATTEMPTS) {
          this.onDisconnectedCallback?.();
        }
      },
    });

    this.client.activate();
  }

  disconnect(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions.clear();
    this.subscriptionHandlers.clear();
    this.client?.deactivate();
    this.client = null;
    this.scheduleId = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  subscribe(topic: string, handler: MessageHandler): void {
    // Always store the handler for resubscription on reconnect
    this.subscriptionHandlers.set(topic, handler);

    if (!this.client?.connected || this.scheduleId === null) {
      console.warn(
        "Cannot subscribe: not connected (handler stored for reconnect)",
      );
      return;
    }

    this.subscribeInternal(topic, handler);
  }

  private flushPendingSends(): void {
    if (!this.client?.connected || this.scheduleId === null) return;
    while (this.pendingSends.length > 0) {
      const m = this.pendingSends.shift()!;
      try {
        this.client.publish({
          destination: `/app/interview/${this.scheduleId}/${m.destination}`,
          body: JSON.stringify(m.body),
        });
      } catch (e) {
        console.warn("Failed to flush pending message", e);
        // push back and stop flushing to avoid tight loop
        this.pendingSends.unshift(m);
        break;
      }
    }
  }

  private subscribeInternal(topic: string, handler: MessageHandler): void {
    if (!this.client?.connected || this.scheduleId === null) return;

    const destination = `/topic/interview/${this.scheduleId}/${topic}`;

    if (this.subscriptions.has(destination)) {
      this.subscriptions.get(destination)!.unsubscribe();
    }

    const subscription = this.client.subscribe(
      destination,
      (message: IMessage) => {
        try {
          const body = JSON.parse(message.body);
          handler(body);
        } catch {
          handler(message.body);
        }
      },
    );

    this.subscriptions.set(destination, subscription);
  }

  private resubscribeAll(): void {
    if (!this.client?.connected || this.scheduleId === null) return;

    this.subscriptionHandlers.forEach((handler, topic) => {
      this.subscribeInternal(topic, handler);
    });
  }

  send(destination: string, body: any): void {
    if (!this.client?.connected || this.scheduleId === null) {
      // Queue small messages (proctoring, interrupts, metadata). Drop if queue too large.
      if (this.pendingSends.length >= this.MAX_PENDING_SENDS) {
        // drop oldest
        this.pendingSends.shift();
        console.warn("Pending send queue full; dropping oldest message");
      }
      this.pendingSends.push({ destination, body });
      console.info("WS not connected — queued message for", destination);
      return;
    }

    const jsonBody = JSON.stringify(body);
    const sizeKB = jsonBody.length / 1024;
    if (sizeKB > 100) {
      console.warn(
        `Large message being sent to ${destination}: ${sizeKB.toFixed(2)} KB`,
      );
    }

    this.client.publish({
      destination: `/app/interview/${this.scheduleId}/${destination}`,
      body: jsonBody,
    });
  }

  sendBinary(destination: string, data: ArrayBuffer): void {
    if (!this.client?.connected || this.scheduleId === null) {
      console.warn("Cannot send binary: not connected — dropping audio chunk");
      return;
    }

    const bytes = new Uint8Array(data);

    // Guard: drop chunks larger than 512 KB to avoid hitting server buffer limits
    if (bytes.length > 512 * 1024) {
      console.warn(`Audio chunk too large (${(bytes.length / 1024).toFixed(0)} KB) — dropping`);
      return;
    }

    // SockJS only supports text frames — encode binary as base64 JSON
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    this.client.publish({
      destination: `/app/interview/${this.scheduleId}/${destination}`,
      body: JSON.stringify({ audio: base64 }),
    });
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  get currentReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  // Error callback registration — caller can display errors or metrics
  setErrorCallback(cb: ((err: string) => void) | null): void {
    this.onErrorCallback = cb;
  }

  // Expose last error string for ad-hoc checks
  get lastErrorString(): string | null {
    return this.lastError;
  }
}

export const interviewWsService = new InterviewWebSocketService();
