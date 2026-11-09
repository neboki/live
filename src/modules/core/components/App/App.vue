<script setup lang="ts">
import { watch } from 'vue';
import { LiveCaptions, LiveView, useLiveSession } from '@/modules/live';
import { OnboardingView } from '@/modules/onboarding';
import { SessionView, useSessionRecord, useSessionViewer } from '@/modules/session';
import { SettingsView } from '@/modules/settings';
import { useAppPage } from '../../store/useAppPage';
import AppShell from '../AppShell/AppShell.vue';

const session = useLiveSession();
const record = useSessionRecord();
const viewer = useSessionViewer();
const appPage = useAppPage();

// A conversation stopped from the bar or the page ends on its own page, ready to download.
// One that ended in an error stays in the bar to say why; home still offers it.
watch(
  () => session.active,
  (active, wasActive) => {
    if (wasActive && !active && !session.liveError && record.lines.length > 0) {
      viewer.showRecent();
    }
  },
);

// Each page starts at its top. On a phone the start page is long, so Start is pressed
// scrolled down; kept, that scroll would hide the live captions under the sticky header.
function toTop(): void {
  window.scrollTo({ top: 0 });
}
</script>

<template>
  <AppShell>
    <Transition name="page" mode="out-in" @before-enter="toTop">
      <LiveView v-if="session.showLive" />
      <SessionView v-else-if="viewer.snapshot" />
      <SettingsView v-else-if="appPage.settingsOpen" />
      <OnboardingView v-else />
    </Transition>
  </AppShell>
  <LiveCaptions />
</template>
