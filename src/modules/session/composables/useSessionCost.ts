import { computed, type ComputedRef } from 'vue';
import { useSessionRecord } from '../store/useSessionRecord';
import { costUsd } from '../utils/costUsd';

/** Estimated USD cost of the current session, updated as usage arrives. */
export function useSessionCost(): ComputedRef<number> {
  const record = useSessionRecord();
  return computed(() => costUsd(record.usage));
}
