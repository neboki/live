// The microphones the browser can see, for the picker on the start page.
//
// Browsers hide the names (and on some, the ids) until the page was granted the
// microphone once; `revealMicrophoneNames` asks for it and lets it go right away.

import { logError } from '@/shared/errors';

export interface MicrophoneInfo {
  deviceId: string;
  /** Empty until the page has been allowed the microphone */
  label: string;
}

/** Chrome's aliases of real devices, listed twice otherwise; the picker offers its own default */
const ALIAS_IDS = new Set(['default', 'communications', '']);

export async function listMicrophones(): Promise<MicrophoneInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audioinput' && !ALIAS_IDS.has(device.deviceId))
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  } catch (err) {
    logError('Listing the microphones failed', err);
    return [];
  }
}

/**
 * Microphones that belong to headphones. With Bluetooth earbuds connected, phones tend to
 * open the earbuds' own microphone, which hears the wearer and not the room, and switch
 * the earbuds to call quality. A name is all the browser gives to tell them apart.
 */
const HEADSET_LABEL = /bluetooth|airpods|buds|headset|hands-?free|auricular|earphone|headphone/i;

export function isHeadsetLabel(label: string): boolean {
  return HEADSET_LABEL.test(label);
}

/** A microphone of the phone itself, when the default one is a headset's; null if none. */
export function phoneMicAmong(microphones: MicrophoneInfo[]): MicrophoneInfo | null {
  return microphones.find((mic) => mic.label && !isHeadsetLabel(mic.label)) ?? null;
}

/** Asks for the microphone once, so the list shows names. True when it was allowed. */
export async function revealMicrophoneNames(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    logError('The microphone was not allowed', err);
    return false;
  }
}
