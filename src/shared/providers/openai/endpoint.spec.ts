import { describe, expect, it } from 'vitest';
import { OPENAI_API, REALTIME_TRANSCRIPTION_URL } from './config';
import { apiBase, authHeaders, normalizeAzureEndpoint, transcriptionSocket } from './endpoint';

describe('normalizeAzureEndpoint', () => {
  it.each([
    ['https://my-res.openai.azure.com', 'https://my-res.openai.azure.com'],
    ['https://my-res.openai.azure.com/openai/v1/', 'https://my-res.openai.azure.com'],
    [' https://My-Res.cognitiveservices.azure.com/ ', 'https://my-res.cognitiveservices.azure.com'],
    ['https://proj.services.ai.azure.com/openai', 'https://proj.services.ai.azure.com'],
  ])('keeps the origin of %s', (input, origin) => {
    expect(normalizeAzureEndpoint(input)).toBe(origin);
  });

  it.each([
    '',
    'my-res.openai.azure.com',
    'http://my-res.openai.azure.com',
    'https://api.openai.com',
    'https://openai.azure.com.evil.com',
  ])('rejects %j', (input) => {
    expect(normalizeAzureEndpoint(input)).toBeNull();
  });
});

describe('OpenAI access', () => {
  it('uses api.openai.com and a Bearer key without an endpoint', () => {
    const access = { apiKey: 'sk-k' };
    expect(apiBase(access)).toBe(OPENAI_API);
    expect(authHeaders(access)).toEqual({ Authorization: 'Bearer sk-k' });
    expect(transcriptionSocket(access)).toEqual({
      url: REALTIME_TRANSCRIPTION_URL,
      protocols: ['realtime', 'openai-insecure-api-key.sk-k'],
    });
  });

  it('uses the Azure resource and api-key with an endpoint', () => {
    const access = { apiKey: 'az', endpoint: 'https://my-res.openai.azure.com/openai/v1' };
    expect(apiBase(access)).toBe('https://my-res.openai.azure.com/openai/v1');
    expect(authHeaders(access)).toEqual({ 'api-key': 'az' });
    expect(transcriptionSocket(access)).toEqual({
      url: 'wss://my-res.openai.azure.com/openai/v1/realtime?intent=transcription&api-key=az',
      protocols: [],
    });
  });

  it('throws rather than fall back to OpenAI for a bad or empty endpoint', () => {
    expect(() => apiBase({ apiKey: 'az', endpoint: '' })).toThrow();
    expect(() => authHeaders({ apiKey: 'az', endpoint: 'https://x.example.com' })).toThrow();
  });
});
