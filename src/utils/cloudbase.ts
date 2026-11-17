import cloudbase from "@cloudbase/js-sdk";

type CloudBase = ReturnType<typeof cloudbase.init>;

// Inert placeholder for unconfigured local previews; never targets the maintainer environment.
const ENV_ID_FALLBACK = "your-cloudbase-env-id";

export const ENV_ID =
  (import.meta.env.VITE_CLOUDBASE_ENV_ID as string | undefined) ||
  (import.meta.env.VITE_ENV_ID as string | undefined) ||
  ENV_ID_FALLBACK;

export const isValidEnvId = Boolean(ENV_ID) && !ENV_ID.startsWith("your-");

const PUBLISHABLE_KEY =
  (import.meta.env.VITE_PUBLISHABLE_KEY as string | undefined) || "";

export const init = (
  config: { env?: string; timeout?: number; accessKey?: string } = {}
): CloudBase => {
  const appConfig = {
    env: config.env || ENV_ID,
    timeout: config.timeout || 30000,
    region: (import.meta.env.VITE_CLOUDBASE_REGION as string | undefined) || "ap-shanghai",
    accessKey: config.accessKey || PUBLISHABLE_KEY,
    auth: { detectSessionInUrl: true },
  };

  if (!appConfig.accessKey) {
    console.warn(
      "[cloudbase] Publishable Key 未配置（VITE_PUBLISHABLE_KEY），DB / 存储调用可能 401。"
    );
  }

  return cloudbase.init(appConfig);
};

export const app = init();

declare global {
  interface Window {
    app?: CloudBase;
  }
}
if (typeof window !== "undefined") {
  window.app = app;
}

export const auth = app.auth;


export const checkEnvironment = (): boolean => {
  if (!isValidEnvId) {
    console.error(
      "❌ CloudBase envId 未配置。请设置 VITE_CLOUDBASE_ENV_ID（或 VITE_ENV_ID）"
    );
    return false;
  }
  return true;
};

export interface LoginResult {
  isLoggedIn: boolean;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: {
      id: string;
      is_anonymous: boolean;
      user_metadata?: { nickName?: string; username?: string };
      phone?: string;
      email?: string;
    };
  } | null;
  user: NonNullable<LoginResult["session"]>["user"] | null;
}

export const checkLogin = async (): Promise<LoginResult> => {
  if (!checkEnvironment()) {
    return { isLoggedIn: false, session: null, user: null };
  }

  const { data, error } = (await auth.getSession()) as {
    data?: { session?: LoginResult["session"] };
    error?: { message: string };
  };

  if (error) {
    console.warn("获取会话失败:", error.message);
    return { isLoggedIn: false, session: null, user: null };
  }

  if (data?.session && !data.session.user?.is_anonymous) {
    return {
      isLoggedIn: true,
      session: data.session,
      user: data.session.user as LoginResult["user"],
    };
  }

  return { isLoggedIn: false, session: null, user: null };
};

export const logout = async (): Promise<{ success: boolean; message: string }> => {
  const response = await auth.signOut();
  const error: unknown = response && "error" in response ? response.error : undefined;
  if (error) {
    console.error("退出登录失败");
    throw error;
  }
  return { success: true, message: "已成功退出登录" };
};

export default {
  init,
  app,
  auth,
  checkLogin,
  logout,
  checkEnvironment,
  isValidEnvId,
  ENV_ID,
};
