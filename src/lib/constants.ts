export const CAIRO_TZ = 'Africa/Cairo';
export const ALADHAN_METHOD = 5; // Egyptian General Authority of Survey

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

export const PRAYER_KEYS: Record<Prayer, 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'> = {
  fajr: 'fajr',
  dhuhr: 'dhuhr',
  asr: 'asr',
  maghrib: 'maghrib',
  isha: 'isha',
};
