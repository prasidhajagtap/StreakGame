// ============================================================================
//  supabaseClient.js — single shared Supabase client instance.
// ----------------------------------------------------------------------------
//  Loaded buildless from a CDN as an ES module. Works on GitHub Pages (HTTPS).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from './config.js';

if (CONFIG.SUPABASE_URL.includes('YOUR-PROJECT')) {
  console.warn(
    '[HR Jump] Supabase is not configured yet. Edit js/config.js with your ' +
    'project URL and anon key.'
  );
}

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,      // survives cache clears via secure token refresh
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
