import { lazy, ComponentType } from 'react';

/**
 * Utility wrapper around React.lazy to handle dynamic import chunk load errors
 * (e.g. when server updates asset hashes or dev server restarts, returning 404/text/html MIME error).
 * Retries fetch or reloads the page once cleanly so the user gets updated asset links.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenRefreshed = JSON.parse(
      window.sessionStorage.getItem('retry-lazy-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('retry-lazy-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasBeenRefreshed) {
        // Dynamic chunk import failed. Reload page once to get fresh bundle references.
        window.sessionStorage.setItem('retry-lazy-refreshed', 'true');
        window.location.reload();
        // Return unresolved promise to avoid rendering broken component during reload
        return new Promise<{ default: T }>(() => {});
      }
      // If we already reloaded and it still failed, throw to ErrorBoundary
      throw error;
    }
  });
}
