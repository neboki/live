import { describe, expect, it } from 'vitest';
import { MAX_MEETING_LANGUAGES, parseMeeting } from './meetingHints';

describe('parseMeeting', () => {
  it('keeps offered languages, up to the limit, and the topic', () => {
    const stored = { languages: ['es', 'xx', 'en', 'fr', 'de', 'it'], topic: 'Grid' };
    const meeting = parseMeeting(stored);
    expect(meeting.languages).toEqual(['es', 'en', 'fr', 'de']);
    expect(meeting.languages).toHaveLength(MAX_MEETING_LANGUAGES);
    expect(meeting.topic).toBe('Grid');
  });

  it('starts empty from nothing or from garbage', () => {
    expect(parseMeeting({})).toEqual({ languages: [], topic: '' });
    expect(parseMeeting({ languages: 'es', topic: 3 })).toEqual({ languages: [], topic: '' });
  });
});
