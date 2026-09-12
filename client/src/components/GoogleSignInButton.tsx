import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAuthConfig } from '@/lib/api';

/**
 * Renders Google's own sign-in button.
 *
 * The button hands back a signed ID token which the server verifies against
 * Google's keys - the browser never holds an OAuth secret, and nothing here is
 * trusted until the API has checked the signature.
 *
 * Google Identity Services is loaded on demand rather than in index.html: the
 * script is only needed on two screens, and the app must work unchanged when
 * Google sign-in is switched off.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi-load-failed')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi-load-failed'));
    document.head.appendChild(script);
  });
}

export function GoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: fetchAuthConfig,
    staleTime: Infinity,
    retry: 1,
  });

  // Kept in a ref so re-renders never re-initialise the Google client.
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!config?.googleEnabled || !config.googleClientId) return;

    let cancelled = false;

    void loadGsi()
      .then(() => {
        if (cancelled || !holderRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId as string,
          callback: (response) => callbackRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(holderRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setScriptFailed(true);
        onError('Google sign-in could not load. Use your email and password instead.');
      });

    return () => {
      cancelled = true;
    };
    // onError is intentionally excluded: a new function identity each render
    // would tear down and re-render Google's button on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.googleEnabled, config?.googleClientId]);

  // Not configured on this server, or the script is blocked: the page simply
  // shows email sign-in, which always works.
  if (!config?.googleEnabled || scriptFailed) return null;

  return (
    <div className="mt-4">
      <div ref={holderRef} className="flex justify-center" />
      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
