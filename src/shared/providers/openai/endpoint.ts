// Where OpenAI requests go and how they authenticate: api.openai.com with a Bearer
// key, or an Azure OpenAI resource through its v1 API with an `api-key` header.
// On Azure the `model` of every request is the deployment name.

import { BusinessError, ValidationError } from '@/shared/errors';
import {
  FREE_API,
  OPENAI_API,
  REALTIME_URL,
  REALTIME_TRANSCRIPTION_URL,
  REALTIME_TRANSLATION_URL,
} from './config';

export interface OpenAiAccess {
  apiKey: string;
  /** Azure OpenAI resource URL; absent means api.openai.com */
  endpoint?: string;
}

export interface SocketTarget {
  url: string;
  protocols: string[];
}

/** Hosts Azure gives OpenAI resources; connect-src in index.html allows exactly these */
const AZURE_HOST =
  /^[a-z0-9][a-z0-9-]*\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/i;

/**
 * The origin of an Azure OpenAI resource, from whatever the portal let the user copy
 * (with or without `/openai/...` after it). Null for anything that isn't an Azure host.
 */
export function normalizeAzureEndpoint(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === 'https:' && AZURE_HOST.test(url.hostname) ? url.origin : null;
}

/**
 * The free minutes: the endpoint is the free server, which passes text requests on to
 * OpenAI with its own key. The key the user holds is a short-lived OpenAI one for live
 * transcription, so the transcription socket goes straight to OpenAI like a normal key.
 */
export function isFree(access: OpenAiAccess): boolean {
  return FREE_API !== '' && access.endpoint === FREE_API;
}

function azureOrigin(access: OpenAiAccess): string | null {
  if (access.endpoint === undefined || isFree(access)) return null;
  const origin = normalizeAzureEndpoint(access.endpoint);
  // Never fall back to api.openai.com: an Azure key must not travel there
  if (!origin) throw new ValidationError('Not an Azure OpenAI endpoint', 'errors.invalidEndpoint');
  return origin;
}

/** Base URL of the REST API, without a trailing slash. */
export function apiBase(access: OpenAiAccess): string {
  if (isFree(access)) return `${FREE_API}/v1`;
  const azure = azureOrigin(access);
  return azure ? `${azure}/openai/v1` : OPENAI_API;
}

export function authHeaders(access: OpenAiAccess): Record<string, string> {
  return azureOrigin(access)
    ? { 'api-key': access.apiKey }
    : { Authorization: `Bearer ${access.apiKey}` };
}

/**
 * The browser can't set headers on a WebSocket: OpenAI takes the key in the
 * subprotocol, Azure in the `api-key` query parameter.
 */
export function transcriptionSocket(access: OpenAiAccess): SocketTarget {
  const azure = azureOrigin(access);
  if (!azure) {
    return {
      url: REALTIME_TRANSCRIPTION_URL,
      protocols: ['realtime', `openai-insecure-api-key.${access.apiKey}`],
    };
  }
  const url = new URL(`${azure.replace(/^https:/, 'wss:')}/openai/v1/realtime`);
  url.searchParams.set('intent', 'transcription');
  url.searchParams.set('api-key', access.apiKey);
  return { url: url.href, protocols: [] };
}

/**
 * The voice socket: a Realtime session with `model` that reads text aloud, keyed like the
 * transcription one. On Azure `model` is the deployment name. The free minutes have no voice.
 */
export function voiceSocket(access: OpenAiAccess, model: string): SocketTarget {
  if (isFree(access)) {
    throw new BusinessError('The free minutes only write captions', 'errors.freeCaptionsOnly');
  }
  const azure = azureOrigin(access);
  if (!azure) {
    return {
      url: `${REALTIME_URL}?model=${encodeURIComponent(model)}`,
      protocols: ['realtime', `openai-insecure-api-key.${access.apiKey}`],
    };
  }
  const url = new URL(`${azure.replace(/^https:/, 'wss:')}/openai/v1/realtime`);
  url.searchParams.set('model', model);
  url.searchParams.set('api-key', access.apiKey);
  return { url: url.href, protocols: [] };
}

/**
 * The speech translation socket, keyed like the transcription one. Azure does not
 * offer it, and an Azure key must never travel to api.openai.com.
 */
export function translationSocket(access: OpenAiAccess): SocketTarget {
  if (isFree(access)) {
    throw new BusinessError('The free minutes only write captions', 'errors.freeCaptionsOnly');
  }
  if (azureOrigin(access)) {
    throw new BusinessError(
      'Speech translation is not offered on Azure',
      'errors.interpreterAzure',
    );
  }
  return {
    url: REALTIME_TRANSLATION_URL,
    protocols: ['realtime', `openai-insecure-api-key.${access.apiKey}`],
  };
}
