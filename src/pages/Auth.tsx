import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get("next"));
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const goNext = () => {
    if (nextPath) window.location.href = nextPath;
    else navigate("/dashboard", { replace: true });
  };

  useEffect(() => {
    if (!loading && user) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Signed in"); goNext(); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const emailRedirectTo = nextPath
      ? `${window.location.origin}${nextPath}`
      : window.location.origin;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo },
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — check your email to confirm.");
  };

  const handleGoogle = async () => {
    const redirect_uri = nextPath
      ? `${window.location.origin}${nextPath}`
      : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri });
    if (result.error) toast.error("Google sign-in failed");
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">Full Event Project</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password (min 6 chars)</Label>
                <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Creating account..." : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
