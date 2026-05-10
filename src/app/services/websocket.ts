import type { BackendWsMessage } from '../types/backend';

type MessageHandler = (msg: BackendWsMessage) => void;
type ErrorHandler  = (err: Event) => void;

/**
 * Cliente WebSocket tipado para la simulación.
 * Conecta a ws://localhost:8080/ws/simulation (proxied por Vite en dev).
 * Implementa auto-reconexión con backoff exponencial.
 */
export class SimulationWebSocket {
  private ws: WebSocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;   // 1s inicial
  private readonly maxDelay = 30_000; // 30s máximo
  private connected = false;
  private shouldReconnect = true;

  private readonly url: string;

  constructor() {
    // En desarrollo Vite redirige /ws → ws://localhost:8080
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws/simulation`;
  }

  /** Conecta al WebSocket del backend */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('🔌 WebSocket conectado al backend');
      this.connected = true;
      this.reconnectDelay = 1000; // reset backoff al conectar
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as BackendWsMessage;
        this.messageHandler?.(msg);
      } catch (e) {
        console.warn('⚠️ Mensaje WS no parseable:', event.data);
      }
    };

    this.ws.onerror = (event: Event) => {
      console.error('⚠️ Error WebSocket:', event);
      this.errorHandler?.(event);
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('🔌 WebSocket desconectado');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  /** Desconecta y deshabilita la reconexión automática */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  /** Registra el callback para mensajes entrantes */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** Registra el callback para errores */
  onError(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private scheduleReconnect(): void {
    console.log(`🔄 Reconectando en ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    }, this.reconnectDelay);
  }
}
