import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { Compass, Loader2 } from "lucide-react";
import { authErrorMessage, beginEmailChallenge, EMAIL_PATTERN, PASSWORD_PATTERN, PASSWORD_HINT, type EmailChallenge } from "../services/email-auth";
import "./login.css";

type Mode = "password" | "email" | "register" | "reset";
const titles: Record<Mode, string> = { password: "账号密码登录", email: "邮箱验证码登录", register: "创建你的逛逛账号", reset: "找回密码" };
export default function LoginPage() {
  const { status, signIn, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get("redirect");
  const redirect = requested && /^\/(map|checkin|admin)(\/|$|\?)/.test(requested) ? requested : "/map";
  const [mode, setMode] = useState<Mode>("password");
  const [account, setAccount] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"send" | "submit" | null>(null);
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const [now, setNow] = useState(Date.now());
  const cooldowns = useRef(new Map<string, number>());
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { mounted.current = false; clearInterval(timer); }; }, []);
  useEffect(() => { if (status === "authenticated") navigate(redirect, { replace: true }); }, [status, navigate, redirect]);
  const cooldown = Math.max(0, Math.ceil(((cooldowns.current.get(email.trim().toLowerCase()) ?? 0) - now) / 1000));
  const expired = !!challenge && now >= challenge.expiresAt;
  const needsPassword = mode === "password" || mode === "register" || mode === "reset";
  function changeMode(next: Mode) {
    if (locked.current) return;
    setMode(next); setChallenge(null); setCode(""); setPassword(""); setConfirm(""); setError(""); setNotice("");
  }
  function invalidate() { setChallenge(null); setCode(""); setNotice(""); setError(""); }
  function validatePassword() {
    if (!PASSWORD_PATTERN.test(password)) throw new Error(PASSWORD_HINT);
    if (password !== confirm) throw new Error("两次输入的密码不一致");
  }
  async function sendCode() {
    if (locked.current || mode === "password" || cooldown > 0) return;
    locked.current = true; setBusy("send"); setError(""); setNotice("");
    try {
      if (!EMAIL_PATTERN.test(email.trim())) throw new Error("请输入有效的邮箱地址");
      if (mode === "register") validatePassword();
      setChallenge(null); setCode("");
      const key = email.trim().toLowerCase();
      const next = await beginEmailChallenge(mode, email, mode === "register" ? password : undefined);
      cooldowns.current.set(key, Date.now() + 60_000);
      if (mounted.current) { setNow(Date.now()); setChallenge(next); setNotice("验证码已发送，请查看收件箱或垃圾邮件，10 分钟内有效。"); }
    } catch (e) { if (mounted.current) setError(authErrorMessage(e)); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy("submit"); setError("");
    try {
      if (mode === "password") {
        if (!account.trim() || !password) throw new Error("请输入账号和密码");
        const result = await signIn(account.trim(), password);
        if (!result.ok) throw new Error(result.error);
      } else {
        if (!challenge || challenge.email !== email.trim() || challenge.mode !== mode) throw new Error("请先获取当前邮箱的验证码");
        if (mode === "register" || mode === "reset") validatePassword();
        await challenge.complete(code.trim(), mode === "reset" ? password : undefined);
        await refresh();
      }
      toast.success(mode === "reset" ? "密码已重设，欢迎回来" : "登录成功");
      navigate(redirect, { replace: true });
    } catch (e) { if (mounted.current) setError(authErrorMessage(e)); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  return <div className="auth-layout">
    <aside className="auth-story"><img src={`${import.meta.env.BASE_URL}images/moraine-lake.jpg`} alt="梦莲湖与远方的山峰" /><p className="eyebrow"><Compass size={17} /> 逛逛 · 慢慢走，好好看</p><h2>今天也出去，<br />逛逛吧。</h2><p>不必等到远行，日常也有值得收藏的风景。<br />把路过的风景，留在地图上。</p></aside>
    <div className="auth-panel">
      <div className="auth-heading"><p className="eyebrow">GUANG GUANG · 内部试用</p><h1>欢迎来到逛逛</h1><p>登录后，展开你的足迹与风景手记。</p></div>
      <div className="auth-card p-5 sm:p-6">
        <div className="auth-tabs" aria-label="登录方式">{(["password", "email"] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} disabled={!!busy} onClick={() => changeMode(item)}>{item === "password" ? "账号密码" : "邮箱验证码"}</button>)}</div>
        <h2 className="auth-form-title">{titles[mode]}</h2>
        <form className="auth-form" onSubmit={submit} noValidate>
          <fieldset disabled={!!busy || status === "loading"}>
            {mode === "password" ? <label>用户名或邮箱<input autoComplete="username" value={account} onChange={e => setAccount(e.target.value)} placeholder="原试用账号或注册邮箱" /></label> : <label>邮箱地址<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e => { setEmail(e.target.value); invalidate(); }} placeholder="请输入你的邮箱" /></label>}
            {needsPassword && <label>{mode === "reset" ? "新密码" : "密码"}<input type="password" autoComplete={mode === "password" ? "current-password" : "new-password"} value={password} maxLength={mode === "password" ? undefined : 32} onChange={e => { setPassword(e.target.value); if (mode === "register") invalidate(); }} placeholder={mode === "password" ? "请输入密码" : PASSWORD_HINT} /></label>}
            {(mode === "register" || mode === "reset") && <><p className="auth-help">{PASSWORD_HINT}</p><label>确认密码<input type="password" autoComplete="new-password" maxLength={32} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="请再次输入密码" /></label></>}
            {mode !== "password" && <label>邮箱验证码<div className="auth-code-row"><input aria-label="邮箱验证码" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6 位数字" /><button type="button" className="btn btn-secondary" onClick={() => void sendCode()} disabled={!!busy || cooldown > 0}>{busy === "send" ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后重发` : "获取验证码"}</button></div></label>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            {expired && <p className="auth-help">验证码已过期，请重新获取。</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={!!busy || status === "loading" || (mode !== "password" && (!challenge || expired))}>{busy === "submit" && <Loader2 size={16} className="animate-spin" />}{mode === "register" ? "验证并注册 / 登录" : mode === "reset" ? "验证并重设密码" : "登录"}</button>
          </fieldset>
        </form>
        <div className="auth-links"><button type="button" disabled={!!busy} onClick={() => changeMode(mode === "register" ? "password" : "register")}>{mode === "register" ? "已有账号，返回登录" : "注册新账号"}</button><button type="button" disabled={!!busy} onClick={() => changeMode(mode === "reset" ? "password" : "reset")}>{mode === "reset" ? "返回登录" : "忘记密码？"}</button></div>
        <p className="auth-footnote">{mode === "reset" ? "请输入账号已验证的邮箱。原试用账号若尚未绑定邮箱，请联系邀请人协助重置。" : mode === "register" ? "验证邮箱后创建账号；若邮箱已有账号，将直接登录且保留原密码。风景记录与照片仅自己可见。" : "原试用账号仍可使用用户名和密码登录。风景记录与照片仅自己可见。"}</p>
      </div>
      <p className="mt-5 text-center text-xs"><Link to="/" className="text-[#245c49] hover:underline">返回首页</Link></p>
    </div>
  </div>;
}

