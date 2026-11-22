export type PrayerType = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type LogStatus = 'done' | 'missed';
export type Lang = 'en' | 'ar';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  joined_at: string;
};

export type PrayerLog = {
  id: string;
  user_id: string;
  date: string;
  prayer: PrayerType;
  status: LogStatus;
  logged_at: string;
};

export type PrayerTimes = {
  date: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  is_fallback: boolean;
};

export type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type ReminderSent = {
  user_id: string;
  date: string;
  prayer: PrayerType;
  sent_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  enabled: boolean;
  fajr: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
  lang: Lang;
};

// `type` (not `interface`) so nested Row/Insert/Update satisfy
// GenericTable's Record<string, unknown> constraints.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; display_name: string; created_at?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      groups: {
        Row: Group;
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Omit<Group, 'id'>>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMember;
        Insert: { group_id: string; user_id: string; joined_at?: string };
        Update: { joined_at?: string };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      prayer_logs: {
        Row: PrayerLog;
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          prayer: PrayerType;
          status: LogStatus;
          logged_at?: string;
        };
        Update: Partial<Omit<PrayerLog, 'id' | 'user_id'>>;
        Relationships: [
          {
            foreignKeyName: 'prayer_logs_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      prayer_times: {
        Row: PrayerTimes;
        Insert: {
          date: string;
          fajr: string;
          dhuhr: string;
          asr: string;
          maghrib: string;
          isha: string;
          is_fallback?: boolean;
        };
        Update: Partial<Omit<PrayerTimes, 'date'>>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscription;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: { p256dh?: string; auth?: string };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders_sent: {
        Row: ReminderSent;
        Insert: {
          user_id: string;
          date: string;
          prayer: PrayerType;
          sent_at?: string;
        };
        Update: { sent_at?: string };
        Relationships: [
          {
            foreignKeyName: 'reminders_sent_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: {
          user_id: string;
          enabled?: boolean;
          fajr?: boolean;
          dhuhr?: boolean;
          asr?: boolean;
          maghrib?: boolean;
          isha?: boolean;
          lang?: Lang;
        };
        Update: Partial<Omit<NotificationPreferences, 'user_id'>>;
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_group: {
        Args: { p_name: string };
        Returns: Json;
      };
      join_group: {
        Args: { p_code: string };
        Returns: Json;
      };
      is_group_member: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      shares_group_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      prayer_type: PrayerType;
      log_status: LogStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
