import { useEffect, useRef } from 'react';
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!active) {
      lockRef.current?.release();
      lockRef.current = null;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      return;
    }
    if ('wakeLock' in navigator) {
      let cancelled = false;
      const acquire = async () => {
        try {
          lockRef.current = await navigator.wakeLock.request('screen');
          lockRef.current.addEventListener('release', () => {
            if (!cancelled) reacquireOnVisible();
          });
        } catch (e) {
          console.warn('[wakeLock]', e);
        }
      };
      const reacquireOnVisible = () => {
        const fn = async () => {
          if (document.visibilityState === 'visible' && !cancelled) {
            document.removeEventListener('visibilitychange', fn);
            await acquire();
          }
        };
        document.addEventListener('visibilitychange', fn);
      };
      acquire();
      return () => {
        cancelled = true;
        lockRef.current?.release();
        lockRef.current = null;
      };
    }
  }, [active]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (active) {
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Voice Assistant',
        artist: 'Jeeves',
      });
      navigator.mediaSession.setActionHandler('pause', () => {});
      navigator.mediaSession.setActionHandler('stop', () => {});
    } else {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    }
  }, [active]);
}
