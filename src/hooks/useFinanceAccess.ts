import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true when the current user has `profiles.can_access_finance = true`.
 * Used to gate finance-confidential UI surfaces (operating entity, counterparty,
 * payment status/terms, finance rules card, etc.).
 */
export function useFinanceAccess(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setAllowed(false); return; }
      const { data, error } = await supabase.rpc("has_finance_access", { _user_id: user.id });
      if (cancelled) return;
      setAllowed(!error && data === true);
    })();
    return () => { cancelled = true; };
  }, []);
  return allowed;
}
