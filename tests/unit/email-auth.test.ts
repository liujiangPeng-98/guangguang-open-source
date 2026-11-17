import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { signUp: vi.fn(), signInWithOtp: vi.fn(), resetPasswordForEmail: vi.fn() }, checkLogin: vi.fn() }));
vi.mock("../../src/utils/cloudbase", () => mocks);
import { beginEmailChallenge, authErrorMessage } from "../../src/services/email-auth";
beforeEach(() => { vi.resetAllMocks(); mocks.checkLogin.mockResolvedValue({ isLoggedIn: true }); });
describe("邮箱认证与验证码生命周期", () => {
  it("注册前验证邮箱和密码，不触发发送", async () => {
    await expect(beginEmailChallenge("register", "bad", "Pass12345")).rejects.toThrow("邮箱");
    await expect(beginEmailChallenge("register", "a@example.com", "short")).rejects.toThrow("密码");
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("注册绑定邮箱和密码，校验回调只接收验证码", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null }); mocks.auth.signUp.mockResolvedValue({ data: { verifyOtp }, error: null });
    const c = await beginEmailChallenge("register", " a@example.com ", "Pass12345");
    await c.complete("012345");
    expect(mocks.auth.signUp).toHaveBeenCalledWith({ email: "a@example.com", password: "Pass12345" });
    expect(verifyOtp).toHaveBeenCalledWith({ token: "012345" });
    expect(mocks.checkLogin).toHaveBeenCalledOnce();
    await expect(c.complete("012345")).rejects.toThrow("已使用");
  });
  it("验证码登录禁止意外注册新用户", async () => {
    mocks.auth.signInWithOtp.mockResolvedValue({ data: { verifyOtp: vi.fn() }, error: null });
    await beginEmailChallenge("email", "a@example.com");
    expect(mocks.auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com", options: { shouldCreateUser: false } });
  });
  it("找回密码通过恢复回调提交验证码和新密码", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null }); mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: { updateUser }, error: null });
    const c = await beginEmailChallenge("reset", "a@example.com");
    await expect(c.complete("123456", "short")).rejects.toThrow("密码");
    expect(updateUser).not.toHaveBeenCalled();
    await c.complete("123456", "NextPass123");
    expect(updateUser).toHaveBeenCalledWith({ nonce: "123456", password: "NextPass123" });
  });
  it("发送失败与缺失回调都不能进入验证阶段", async () => {
    mocks.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: new Error("offline") }).mockResolvedValueOnce({ data: {}, error: null });
    await expect(beginEmailChallenge("email", "a@example.com")).rejects.toThrow("offline");
    await expect(beginEmailChallenge("email", "a@example.com")).rejects.toThrow("未建立");
  });
  it("错误格式与过期验证码不调用云端校验", async () => {
    const verifyOtp = vi.fn(); mocks.auth.signInWithOtp.mockResolvedValue({ data: { verifyOtp }, error: null });
    const c = await beginEmailChallenge("email", "a@example.com");
    await expect(c.complete("12abc3")).rejects.toThrow("6 位");
    vi.spyOn(Date, "now").mockReturnValue(c.expiresAt);
    await expect(c.complete("123456")).rejects.toThrow("过期");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("验证码错误可修正重试，不把失败当登录成功", async () => {
    const verifyOtp = vi.fn().mockResolvedValueOnce({ error: new Error("invalid_code") }).mockResolvedValueOnce({ error: null });
    mocks.auth.signInWithOtp.mockResolvedValue({ data: { verifyOtp }, error: null });
    const c = await beginEmailChallenge("email", "a@example.com");
    await expect(c.complete("123456")).rejects.toThrow("invalid_code");
    expect(mocks.checkLogin).not.toHaveBeenCalled();
    await c.complete("654321");
  });
  it("没有真实会话时不能声称登录成功", async () => {
    mocks.auth.signInWithOtp.mockResolvedValue({ data: { verifyOtp: vi.fn().mockResolvedValue({ error: null }) }, error: null });
    mocks.checkLogin.mockResolvedValue({ isLoggedIn: false });
    const c = await beginEmailChallenge("email", "a@example.com");
    await expect(c.complete("123456")).rejects.toThrow("会话未建立");
  });
  it("阻止验证码重复并发提交", async () => {
    let resolve!: (v: { error: null }) => void;
    const verifyOtp = vi.fn(() => new Promise<{error:null}>(r => { resolve=r; }));
    mocks.auth.signInWithOtp.mockResolvedValue({ data: { verifyOtp }, error: null });
    const c = await beginEmailChallenge("email", "a@example.com"); const first = c.complete("123456");
    await expect(c.complete("123456")).rejects.toThrow("正在验证"); resolve({ error: null }); await first;
    expect(verifyOtp).toHaveBeenCalledOnce();
  });
  it("账号存在性错误使用中性提示", () => {
    expect(authErrorMessage({ code: "user_not_found", message: "private@example.com" })).not.toContain("private");
    expect(authErrorMessage({ code: "resource_exhausted" })).toContain("频繁");
    expect(authErrorMessage({ code: "code_expired" })).toContain("过期");
  });
});
