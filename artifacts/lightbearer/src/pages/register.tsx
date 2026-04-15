import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    phone: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await register(formData);
      toast({
        title: "Account created",
        description: "Welcome to The Lightbearer. Your studio is ready.",
      });
      setLocation("/studio");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error?.message || "There was an error creating your account.",
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
        <div className="flex justify-center text-primary mb-6">
          <div className="h-16 w-16 bg-card rounded-2xl flex items-center justify-center border border-primary/20 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
            <Radio className="h-8 w-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-black text-foreground font-sans tracking-widest uppercase">
          THE LIGHTBEARER
        </h2>
        <p className="mt-2 text-center text-base text-muted-foreground">
          Register Ministry Account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <Card className="bg-card/80 backdrop-blur-xl border-border shadow-2xl rounded-2xl overflow-hidden">
          <CardContent className="pt-8 px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ministry Name</Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="bg-background border-border focus-visible:ring-primary h-12 rounded-lg"
                    placeholder="e.g. Grace Fellowship"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Handle</Label>
                  <Input
                    id="username"
                    required
                    value={formData.username}
                    onChange={handleChange}
                    className="bg-background border-border focus-visible:ring-primary h-12 rounded-lg"
                    placeholder="grace_fellowship"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="bg-background border-border focus-visible:ring-primary h-12 rounded-lg"
                  placeholder="ministry@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number (Optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  className="bg-background border-border focus-visible:ring-primary h-12 rounded-lg"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={handleChange}
                  className="bg-background border-border focus-visible:ring-primary h-12 rounded-lg"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <Button type="submit" className="w-full h-14 text-lg font-bold tracking-wide mt-8 shadow-lg hover:shadow-primary/25 transition-all" disabled={isLoading}>
                {isLoading ? "CREATING STUDIO..." : "CREATE ACCOUNT"}
              </Button>
            </form>
          </CardContent>
          <div className="px-8 py-6 bg-background/50 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              Already broadcasting?{" "}
              <Link href="/login" className="font-bold text-primary hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
