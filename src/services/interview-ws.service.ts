import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { getAccessToken } from "./api.service";

const getWsBaseUrl = () => {
  let envUrl = import.meta.env.VITE_WS_BASE_URL;
  if (envUrl) {
    envUrl = envUrl.trim();
    // SockJS requires http/https protocols, not ws/wss
    return envUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
  }
  
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;

  // If on localhost or a local IP (e.g. 192.168.x.x), we likely need port 8082 for the backend
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
  ) {
    // If we're currently on the default Vite port, switch to the backend port
    if (port === "5173") {
      return `${protocol}//${hostname}:8082`;
    }
  }

  return `${protocol}//${window.location.host}`;
};

const WS_BASE_URL = getWsBaseUrl();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubscriptionCallback = (message: any) => void;

class InterviewWsService {
  private client: Client | null = null;
  private subscriptions: Map<
    string,
    { unsubscribe: () => void; callback: SubscriptionCallback }
  > = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private errorCallback: ((error: string) => void) | null = null;
  public currentReconnectAttempts = 0;
  private currentParams: string = "";

  setErrorCallback(cb: (error: string) => void) {
    this.errorCallback = cb;
  }

  connect(options: {
    scheduleId?: number;
    token?: string;
    email?: string;
    mobileToken?: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
  }) {
    const { scheduleId, token, email, mobileToken, onConnect, onDisconnect } = options;

    let url = `${WS_BASE_URL}/ws`;
    const params = new URLSearchParams();
    if (scheduleId) params.append("scheduleId", scheduleId.toString());
    if (email) params.append("email", email);

    const jwt = token || getAccessToken() || localStorage.getItem("accessToken");
    if (jwt) {
      params.append("token", jwt);
      params.append("accessToken", jwt);
      params.append("jwt", jwt);
      params.append("access_token", jwt);
    }

    if (mobileToken) params.append("mobileToken", mobileToken);

    const paramsStr = params.toString();
    if (paramsStr) url += "?" + paramsStr;

    if (
      this.client &&
      this.client.connected &&
      this.currentParams === paramsStr
    ) {
      if (onConnect) onConnect();
      return;
    }

    if (this.client) {
      this.disconnect();
    }

    this.currentParams = paramsStr;
    console.log("Connecting to WebSocket. Token present:", !!jwt, "ScheduleId:", scheduleId);

    this.client = new Client({
      webSocketFactory: () => new SockJS(url),
      connectHeaders: jwt ? { 
        Authorization: `Bearer ${jwt}`,
        login: email || "user",
        passcode: jwt
      } : {},
      reconnectDelay: this.reconnectDelay,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log("STOMP connected successfully");
        this.reconnectAttempts = 0;
        this.currentReconnectAttempts = 0;
        if (onConnect) onConnect();
      },
      onDisconnect: () => {
        console.log("STOMP disconnected");
        if (onDisconnect) onDisconnect();
      },
      onStompError: (frame) => {
        console.error("STOMP error", frame);
        if (this.errorCallback) {
          this.errorCallback(frame.headers["message"] || "STOMP error");
        }
      },
      onWebSocketError: (event) => {
        console.error("WebSocket error", event);
        if (this.errorCallback) {
          this.errorCallback("WebSocket connection error");
        }
      },
    });

    this.client.activate();
  }

  // Legacy method for backward compatibility (optional)
  connectLegacy(
    scheduleId: number,
    onConnect?: () => void,
    onDisconnect?: () => void,
  ) {
    this.connect({ scheduleId, onConnect, onDisconnect });
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this.subscriptions.clear();
  }

  send(destination: string, body: unknown, headers: Record<string, string> = {}) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected");
      return;
    }
    this.client.publish({
      destination,
      body: JSON.stringify(body),
      headers,
    });
  }

  subscribe(destination: string, callback: SubscriptionCallback) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected, cannot subscribe");
      return;
    }
    const subscription = this.client.subscribe(destination, (message) => {
      try {
        const parsed = JSON.parse(message.body);
        callback(parsed);
      } catch {
        callback(message.body);
      }
    });
    this.subscriptions.set(destination, {
      unsubscribe: () => subscription.unsubscribe(),
      callback,
    });
  }

  unsubscribe(destination: string) {
    const sub = this.subscriptions.get(destination);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(destination);
    }
  }

  get connected() {
    return this.client !== null && this.client.connected;
  }

  sendBinary(destination: string, buffer: ArrayBuffer) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected");
      return;
    }
    // STOMP allows sending binary data as the body
    this.client.publish({
      destination,
      binaryBody: new Uint8Array(buffer),
    });
  }
}

export const interviewWsService = new InterviewWsService();
