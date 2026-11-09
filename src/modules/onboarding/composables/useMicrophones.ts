import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import {
  listMicrophones,
  revealMicrophoneNames,
  type MicrophoneInfo,
} from '@/shared/audio/microphones';
import { logError } from '@/shared/errors';

export interface MicrophonesState {
  devices: Ref<MicrophoneInfo[]>;
  /** False until the page was allowed the microphone: the browser hides the names */
  named: ComputedRef<boolean>;
  revealing: Ref<boolean>;
  /** Asks for the microphone once, then lists the devices with their names */
  reveal: () => Promise<void>;
}

/** The microphones plugged in, kept current as devices come and go. */
export function useMicrophones(): MicrophonesState {
  const devices = ref<MicrophoneInfo[]>([]);
  const revealing = ref(false);
  const named = computed(() => devices.value.some((device) => device.label !== ''));

  async function refresh(): Promise<void> {
    devices.value = await listMicrophones();
  }

  function onDeviceChange(): void {
    refresh().catch((err: unknown) => logError('Refreshing the microphones failed', err));
  }

  async function reveal(): Promise<void> {
    revealing.value = true;
    try {
      if (await revealMicrophoneNames()) await refresh();
    } finally {
      revealing.value = false;
    }
  }

  onMounted(() => {
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    onDeviceChange();
  });
  onBeforeUnmount(() =>
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange),
  );

  return { devices, named, revealing, reveal };
}
