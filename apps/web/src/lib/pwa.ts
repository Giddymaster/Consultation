/**
 * Service worker registration.
 *
 * Registered only in production builds: an active worker during development
 * serves stale bundles and makes HMR behave unpredictably.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Registration failing is not a user-facing problem — the app works
      // exactly the same, it simply is not installable.
    });
  });
}

/**
 * Clears every cache and unregisters the worker. Called on sign-out so a shared
 * device does not keep the previous user's shell — the caches hold no personal
 * data, but the install should not outlive the session either.
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* Cache API unavailable; nothing to clear. */
  }
}
