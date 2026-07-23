import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@run-review/shared";
import { apiClient } from "../api/client.js";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_QUERY_KEY = ["auth", "me"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => apiClient.get<{ user: AuthUser | null }>("/auth/me"),
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiClient.post<{ user: AuthUser }>("/auth/login", vars),
    onSuccess: (result) => queryClient.setQueryData(AUTH_QUERY_KEY, { user: result.user }),
  });

  const signupMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiClient.post<{ user: AuthUser }>("/auth/signup", vars),
    onSuccess: (result) => queryClient.setQueryData(AUTH_QUERY_KEY, { user: result.user }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post("/auth/logout"),
    onSuccess: () => queryClient.setQueryData(AUTH_QUERY_KEY, { user: null }),
  });

  const value: AuthContextValue = {
    user: data?.user ?? null,
    isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password });
    },
    signup: async (email, password) => {
      await signupMutation.mutateAsync({ email, password });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
