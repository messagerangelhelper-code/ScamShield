// Sign-in for the ScamShield network (Supabase Auth: email and password).
// Settings on Render (the app's Environment), both safe to be public:
//   VITE_SUPABASE_URL       e.g. https://abcd1234.supabase.co
//   VITE_SUPABASE_ANON_KEY  the project's "anon public" key
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// Read this before the Supabase client starts: it clears the link details from the address bar,
// and the "password recovery" event can fire before the page is listening for it.
const OPENED_FROM_RESET = typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search);

export const supabase = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export function useAuth() {
  const [session, setSession] = useState(null);
  const [recovering, setRecovering] = useState(OPENED_FROM_RESET);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { enabled: !!supabase, ready, session, user: session?.user || null, recovering, setRecovering };
}

export async function currentToken() {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}
