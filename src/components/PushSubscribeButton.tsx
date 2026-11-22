'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

type State = 'idle' | 'loading' | 'enabled' | 'unsupported' | 'error';

export function PushSubscribeButton() {
  const { t } = useI18n();
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    // Detect already-subscribed state.
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setState('enabled');
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const subscribe = useCallback(async () => {
    setState('loading');
    setMessage(null);

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setState('error');
        setMessage('VAPID public key missing');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('idle');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('bad subscription');
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not signed in');

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' }
      );
      if (error) throw error;

      setState('enabled');
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : t('common.error'));
    }
  }, [t]);

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-muted-foreground">{t('settings.pushUnsupported')}</p>
    );
  }

  if (state === 'enabled') {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
      >
        <span aria-hidden>✓</span> {t('settings.pushEnabled')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void subscribe()}
        disabled={state === 'loading'}
        className="min-h-[44px] rounded-lg border border-teal-600 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60 dark:text-teal-400 dark:hover:bg-teal-950/40"
      >
        {state === 'loading' ? t('common.loading') : t('settings.pushEnable')}
      </button>
      {message && (
        <p className="text-xs text-red-600 dark:text-red-400">{message}</p>
      )}
    </div>
  );
}
