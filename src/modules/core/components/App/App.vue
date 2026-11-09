<script setup lang="ts">
import { watch } from 'vue';
import { CloudSessionActions } from '@/modules/account';
import { LiveCaptions, LiveView, MobileLiveView, useLiveSession } from '@/modules/live';
import { MobileHome, OnboardingView } from '@/modules/onboarding';
import { useFloatingWindow } from '@/modules/overlay';
import { PrivacyView } from '@/modules/privacy';
import { SessionView, useSessionRecord, useSessionViewer } from '@/modules/session';
import { SettingsView } from '@/modules/settings';
import { isPhoneLayout } from '@/shared/device';
import { useAppPage } from '../../store/useAppPage';
import AppShell from '../AppShell/AppShell.vue';

/** A phone gets big buttons and one task per screen; a computer, the full app */
const phone = isPhoneLayout(useFloatingWindow().isSupported);
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
      <MobileLiveView v-if="session.showLive && phone" />
      <LiveView v-else-if="session.showLive" />
      <SessionView v-else-if="viewer.snapshot">
        <template v-if="viewer.source === 'cloud'" #actions><CloudSessionActions /></template>
      </SessionView>
      <PrivacyView v-else-if="appPage.privacyOpen" />
      <SettingsView v-else-if="appPage.settingsOpen" />
      <MobileHome v-else-if="phone" @privacy="appPage.openPrivacy()" />
      <OnboardingView v-else @privacy="appPage.openPrivacy()" />
    </Transition>
  </AppShell>
  <LiveCaptions />
</template>
