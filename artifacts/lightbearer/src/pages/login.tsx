import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login({ email, password });
      toast({
        title: "Welcome back",
        description: "Successfully logged in to your studio.",
      });
      setLocation("/studio");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error?.message || "Please check your credentials and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center text-primary mb-8">
          <div className="h-20 w-20 bg-card rounded-2xl flex items-center justify-center border border-primary/20 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
            <Radio className="h-10 w-10" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-4xl font-black text-foreground font-sans tracking-widest uppercase">
          THE LIGHTBEARER
        </h2>
        <p className="mt-4 text-center text-base text-muted-foreground">
          Enter Your Studio
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Card className="bg-card/80 backdrop-blur-xl border-border shadow-2xl rounded-2xl overflow-hidden">
          <CardContent className="pt-8 px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background border-border focus-visible:ring-primary h-12 text-base rounded-lg"
                  placeholder="ministry@example.com"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background border-border focus-visible:ring-primary h-12 text-base rounded-lg"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full h-14 text-lg font-bold tracking-wide mt-8 shadow-lg hover:shadow-primary/25 transition-all" disabled={isLoading}>
                {isLoading ? "AUTHENTICATING..." : "ENTER STUDIO"}
              </Button>
            </form>
          </CardContent>
          <div className="px-8 py-6 bg-background/50 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="font-bold text-primary hover:text-primary/80 transition-colors">
                Register Ministry
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
