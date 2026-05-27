import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, useLogin, useLogout, useRegister } from "@workspace/api-client-react";
import type { BroadcasterProfile, LoginBody, RegisterBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthContextType {
  broadcaster: BroadcasterProfile | null;
  isLoading: boolean;
  login: (data: LoginBody) => Promise<void>;
  register: (data: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: me, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  const [broadcaster, setBroadcaster] = useState<BroadcasterProfile | null>(null);

  useEffect(() => {
    if (me) {
      setBroadcaster(me);
    } else if (error) {
      setBroadcaster(null);
    }
  }, [me, error]);

  const handleLogin = async (data: LoginBody) => {
    const res = await loginMutation.mutateAsync({ data });
    if (res.broadcaster) {
      setBroadcaster(res.broadcaster);
      queryClient.setQueryData(getGetMeQueryKey(), res.broadcaster);
    }
  };

  const handleRegister = async (data: RegisterBody) => {
    const res = await registerMutation.mutateAsync({ data });
    if (res.broadcaster) {
      setBroadcaster(res.broadcaster);
      queryClient.setQueryData(getGetMeQueryKey(), res.broadcaster);
    }
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setBroadcaster(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
  };

  return (
    <AuthContext.Provider value={{
      broadcaster,
      isLoading,
      login: handleLogin,
      register: handleRegister,
      logout: handleLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
