import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Browse from "@/pages/browse";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Studio from "@/pages/studio";
import BroadcasterProfile from "@/pages/broadcaster-profile";
import BroadcastListener from "@/pages/broadcast-listener";
import Admin from "@/pages/admin";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/browse" component={Browse} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/studio" component={Studio} />
        <Route path="/profile" component={BroadcasterProfile} />
        <Route path="/broadcaster/:id" component={BroadcasterProfile} />
        <Route path="/broadcast/:id" component={BroadcastListener} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
