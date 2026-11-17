import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, checkLogin, logout as cloudbaseLogout } from "../utils/cloudbase";

export interface AppUser { id: string; username?: string; nickname?: string; email?: string; phone?: string; avatarUrl?: string }
type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";
interface AuthContextValue {
  status: AuthStatus; user: AppUser | null;
  signIn: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>; refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
function extractUser(value: unknown): AppUser | null {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") return null;
  if ("is_anonymous" in value && value.is_anonymous) return null;
  const data = value as Record<string, unknown>;
  const meta = data.user_metadata && typeof data.user_metadata === "object" ? data.user_metadata as Record<string, unknown> : {};
  const first = (...values: unknown[]) => values.find((item): item is string => typeof item === "string" && item.length > 0);
  return { id: value.id, username: first(meta.username, data.username), nickname: first(meta.nickName, meta.nickname, data.nickname, meta.username), email: first(data.email), phone: first(data.phone), avatarUrl: first(meta.avatarUrl, meta.picture) };
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [user, setUser] = useState<AppUser | null>(null);
  const applyUser = useCallback((value: unknown) => { const current = extractUser(value); setUser(current); setStatus(current ? "authenticated" : "unauthenticated"); }, []);
  const refresh = useCallback(async () => {
    try { const result = await checkLogin(); applyUser(result.isLoggedIn ? result.user : null); }
    catch (error: unknown) { console.error("读取登录状态失败", error); applyUser(null); }
  }, [applyUser]);
  useEffect(() => {
    void refresh();
    const { data } = auth.onAuthStateChange((_event, session) => applyUser(session?.user));
    return () => data.subscription.unsubscribe();
  }, [refresh, applyUser]);
  const signIn = useCallback<AuthContextValue["signIn"]>(async (username, password) => {
    setStatus("loading");
    try {
      const { error } = await auth.signInWithPassword(username.includes("@") ? { email: username, password } : { username, password });
      if (error) throw error;
      const result = await checkLogin();
      if (!result.isLoggedIn) throw new Error("登录会话未建立，请重试");
      applyUser(result.user);
      return { ok: true };
    } catch (error: unknown) {
      applyUser(null);
      const message = error && typeof error === "object" && "message" in error ? String(error.message) : "登录失败，请稍后重试";
      return { ok: false, error: /password|user not found/i.test(message) ? "用户名或密码错误" : message };
    }
  }, [applyUser]);
  const signOut = useCallback(async () => { await cloudbaseLogout(); applyUser(null); }, [applyUser]);
  const value = useMemo(() => ({ status, user, signIn, signOut, refresh }), [status, user, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

