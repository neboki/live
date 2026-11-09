import { afterEach, describe, expect, it, vi } from 'vitest';
import { listMicrophones, revealMicrophoneNames } from './microphones';

function mockDevices(value: unknown): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
}

describe('microphones', () => {
  afterEach(() => {
    mockDevices(undefined);
    vi.restoreAllMocks();
  });

  it('lists the real microphones, without the default aliases or other devices', async () => {
    mockDevices({
      enumerateDevices: async () => [
        { kind: 'audioinput', deviceId: 'default', label: 'Default' },
        { kind: 'audioinput', deviceId: 'communications', label: 'Communications' },
        { kind: 'audioinput', deviceId: 'usb', label: 'USB mic' },
        { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
        { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
      ],
    });

    await expect(listMicrophones()).resolves.toEqual([{ deviceId: 'usb', label: 'USB mic' }]);
  });

  it('lists nothing where the browser cannot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(listMicrophones()).resolves.toEqual([]);

    mockDevices({ enumerateDevices: () => Promise.reject(new Error('blocked')) });
    await expect(listMicrophones()).resolves.toEqual([]);
  });

  it('asks for the microphone once and lets it go right away', async () => {
    const stop = vi.fn();
    mockDevices({ getUserMedia: async () => ({ getTracks: () => [{ stop }] }) });

    await expect(revealMicrophoneNames()).resolves.toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it('says so when the microphone is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDevices({ getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) });

    await expect(revealMicrophoneNames()).resolves.toBe(false);
  });
});
