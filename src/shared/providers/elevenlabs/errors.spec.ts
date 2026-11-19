import { describe, expect, it } from 'vitest';
import { elevenLabsError } from './errors';

function body(status: string, message = 'details'): string {
  return JSON.stringify({ detail: { status, message } });
}

describe('elevenLabsError', () => {
  it('does not blame the key when the free plan is blocked from a VPN or proxy', () => {
    const err = elevenLabsError(401, body('detected_unusual_activity'));
    expect(err.userMessageKey).toBe('errors.ttsUnusual');
  });

  it('says a paid plan is needed for a library voice', () => {
    expect(elevenLabsError(402, body('paid_plan_required')).userMessageKey).toBe('errors.ttsPlan');
  });

  it('says the chosen voice does not exist', () => {
    expect(elevenLabsError(404, body('voice_not_found')).userMessageKey).toBe('errors.ttsVoice');
    expect(elevenLabsError(400, body('voice_not_found')).userMessageKey).toBe('errors.ttsVoice');
  });

  it('still blames the key when ElevenLabs refuses it', () => {
    expect(elevenLabsError(401, body('invalid_api_key')).userMessageKey).toBe('errors.ttsKey');
  });

  it('keeps no credit and missing permission apart', () => {
    expect(elevenLabsError(401, body('quota_exceeded')).userMessageKey).toBe('errors.ttsCredit');
    expect(elevenLabsError(401, body('missing_permissions')).userMessageKey).toBe(
      'errors.ttsPermission',
    );
  });
});
