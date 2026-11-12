import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { AppError } from '@/shared/errors';
import { i18n } from '@/shared/i18n';

const fakes = vi.hoisted(() => ({
  fetchFreeBalance: vi.fn(),
  signIn: vi.fn(async () => undefined),
}));
const account = reactive({
  enabled: true,
  ready: true,
  busy: false,
  user: null as { uid: string } | null,
  signIn: fakes.signIn,
});
const session = reactive({ active: false, starting: false });

vi.mock('@/shared/providers/openai/freePlan', () => ({
  hasFreeServer: true,
  fetchFreeBalance: fakes.fetchFreeBalance,
}));
vi.mock('@/modules/account', () => ({ useAccount: () => account }));
vi.mock('@/modules/live', () => ({ useLiveSession: () => session }));

const { default: FreeMinutes } = await import('./FreeMinutes.vue');
const t = i18n.global.t;
enableAutoUnmount(afterEach);

function mountFree(): ReturnType<typeof mount> {
  return mount(FreeMinutes, { props: { disabled: false }, global: { plugins: [i18n] } });
}

describe('FreeMinutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.user = null;
    session.active = false;
    fakes.fetchFreeBalance.mockResolvedValue({
      seconds: 1200,
      monthSeconds: 1800,
      available: true,
    });
  });

  it('offers the Google sign-in when nobody is signed in', async () => {
    const wrapper = mountFree();
    expect(wrapper.text()).toContain(t('start.free.signIn'));
    await wrapper.get('button').trigger('click');
    expect(fakes.signIn).toHaveBeenCalled();
    expect(fakes.fetchFreeBalance).not.toHaveBeenCalled();
  });

  it('tells the minutes left and starts with them', async () => {
    account.user = { uid: 'alice' };
    const wrapper = mountFree();
    await flushPromises();

    expect(wrapper.text()).toContain(t('start.free.left', { left: 20, total: 30 }));
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('start')).toHaveLength(1);
  });

  it('cannot start once the month is used up', async () => {
    account.user = { uid: 'alice' };
    fakes.fetchFreeBalance.mockResolvedValue({ seconds: 20, monthSeconds: 1800, available: true });
    const wrapper = mountFree();
    await flushPromises();

    expect(wrapper.text()).toContain(t('start.free.usedUp'));
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });

  it('says why the minutes could not be read', async () => {
    account.user = { uid: 'alice' };
    fakes.fetchFreeBalance.mockResolvedValue(
      new AppError('down', { userMessageKey: 'errors.freeUnavailable' }),
    );
    const wrapper = mountFree();
    await flushPromises();

    expect(wrapper.text()).toContain(t('errors.freeUnavailable'));
  });

  it('reads the minutes again after a session', async () => {
    account.user = { uid: 'alice' };
    mountFree();
    await flushPromises();
    session.active = true;
    await flushPromises();
    session.active = false;
    await flushPromises();

    expect(fakes.fetchFreeBalance).toHaveBeenCalledTimes(2);
  });
});
