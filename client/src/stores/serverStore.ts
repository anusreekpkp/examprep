import { create } from 'zustand';
import { setServerWakingHandler } from '@/lib/api';

interface ServerState {
  /** True while a request is being retried because the API is cold-starting. */
  isWaking: boolean;
  setWaking: (value: boolean) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  isWaking: false,
  setWaking: (value) => set((state) => (state.isWaking === value ? state : { isWaking: value })),
}));

// The axios interceptor reports cold-start retries here so the UI can explain
// the wait instead of showing a bare error.
setServerWakingHandler((waking) => {
  useServerStore.getState().setWaking(waking);
});
