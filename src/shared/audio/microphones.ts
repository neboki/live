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
