import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const url =
  Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
