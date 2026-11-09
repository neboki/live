import { ExternalServiceError } from '@/shared/errors';
import { CONNECT_TIMEOUT_MS } from '../config';
import { type OpenAiAccess, type SocketTarget, transcriptionSocket } from '../endpoint';

function connectionFailed(reason: string): ExternalServiceError {
  return new ExternalServiceError(
    `Could not open the transcription socket (${reason})`,
    'errors.connectionFailed',
  );
}

/** Removes every handler, so a socket we let go of can't call back into a session. */
export function detach(socket: WebSocket): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
}

/** Detaches and closes a socket that is still open or opening. */
export function shut(socket: WebSocket): void {
  detach(socket);
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
}

/** Opens a socket and settles once: open, error, early close or timeout. */
export function openSocket(
  access: OpenAiAccess,
  targetOf: (access: OpenAiAccess) => SocketTarget = transcriptionSocket,
): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    let target: SocketTarget;
    let socket: WebSocket;
    try {
      target = targetOf(access);
    } catch (err) {
      reject(err);
      return;
    }
    try {
      socket = new WebSocket(target.url, target.protocols);
    } catch {
      // A key with characters a subprotocol can't carry; the browser's message would echo it
      reject(connectionFailed('invalid subprotocol'));
      return;
    }
    let timer = 0;
    const fail = (reason: string): void => {
      window.clearTimeout(timer);
      shut(socket);
      reject(connectionFailed(reason));
    };
    timer = window.setTimeout(() => fail('timeout'), CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      window.clearTimeout(timer);
      detach(socket);
      resolve(socket);
    };
    socket.onerror = () => fail('error');
    socket.onclose = () => fail('closed');
  });
}
