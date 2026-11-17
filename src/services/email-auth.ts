import { auth, checkLogin } from "../utils/cloudbase";

export type EmailMode = "email" | "register" | "reset";
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,32}$/;
export const PASSWORD_HINT = "密码需为 8–32 位，包含字母和数字";
export interface EmailChallenge {
  email: string;
  mode: EmailMode;
  expiresAt: number;
  complete: (code: string, password?: string) => Promise<void>;
}
export function authErrorMessage(error: unknown): string {
  const object = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof object.message === "string" ? object.message : "";
  const details = `${object.code ?? ""} ${object.category ?? ""} ${message}`;
  if (/user.?not.?found|email.?not.?verified|already.?exist|not.?registered|用户不存在|已注册/i.test(details)) return "暂时无法完成操作，请核对邮箱，或尝试其他登录方式";
  if (/rate|too.many|resource_exhausted|频繁|频率/i.test(details)) return "操作较频繁，请稍后再试";
  if (/captcha_required|captcha.*required/i.test(details)) return "请完成安全验证后重试";
  if (/expired|过期/i.test(details)) return "验证码已过期，请重新获取";
  if (/invalid.*code|invalid.*token|验证码.*错误|verification.*fail/i.test(details)) return "验证码不正确或已失效，请检查后重试";
  if (/network|fetch|timeout|网络|超时/i.test(details)) return "网络连接不稳定，请稍后重试";
  return message || "操作未完成，请稍后重试";
}

// The SDK binds verification IDs to callbacks. Keep them in memory only.
export async function beginEmailChallenge(mode: EmailMode, address: string, password?: string): Promise<EmailChallenge> {
  const email = address.trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error("请输入有效的邮箱地址");
  if (mode === "register" && !PASSWORD_PATTERN.test(password ?? "")) throw new Error(PASSWORD_HINT);
  let completeRequest: (code: string, password?: string) => Promise<{ error: unknown }>;
  if (mode === "reset") {
    const { data, error } = await auth.resetPasswordForEmail(email);
    if (error) throw error;
    const update = data?.updateUser;
    if (!update) throw new Error("找回密码请求未建立，请重试");
    completeRequest = (code, nextPassword) => update({ nonce: code, password: nextPassword! });
  } else {
    const { data, error } = mode === "register"
      ? await auth.signUp({ email, password })
      : await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
    const verify = data?.verifyOtp;
    if (!verify) throw new Error("验证码请求未建立，请重试");
    completeRequest = code => verify({ token: code });
  }
  const expiresAt = Date.now() + 600_000;
  let busy = false;
  let consumed = false;
  return { email, mode, expiresAt, async complete(code, nextPassword) {
    if (busy) throw new Error("正在验证，请稍候");
    if (consumed) throw new Error("验证码已使用，请重新获取");
    if (Date.now() >= expiresAt) throw new Error("验证码已过期，请重新获取");
    if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位数字验证码");
    if (mode === "reset" && !PASSWORD_PATTERN.test(nextPassword ?? "")) throw new Error(PASSWORD_HINT);
    busy = true;
    try {
      const { error } = await completeRequest(code, nextPassword);
      if (error) throw error;
      consumed = true;
      if (!(await checkLogin()).isLoggedIn) throw new Error("操作已提交，但登录会话未建立，请使用账号密码登录");
    } finally { busy = false; }
  } };
}
