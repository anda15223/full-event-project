import { Navigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useFepAdmin } from "@/hooks/useFepAdmin";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useFepAdmin();
  const toasted = useRef(false);

  useEffect(() => {
    if (!loading && isAdmin === false && !toasted.current) {
      toasted.current = true;
      toast.error("Admin access required.");
    }
  }, [loading, isAdmin]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
