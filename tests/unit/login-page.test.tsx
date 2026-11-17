// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({ signIn: vi.fn(), refresh: vi.fn(), begin: vi.fn(), success: vi.fn() }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => ({ status: "unauthenticated", signIn: mock.signIn, refresh: mock.refresh }) }));
vi.mock("../../src/components/ui/Toast", () => ({ useToast: () => ({ success: mock.success }) }));
vi.mock("../../src/services/email-auth", async original => ({ ...await original<typeof import("../../src/services/email-auth")>(), beginEmailChallenge: mock.begin }));
vi.mock("../../src/utils/cloudbase", () => ({ auth: {}, checkLogin: vi.fn() }));
import LoginPage from "../../src/pages/LoginPage";
function page() { render(<MemoryRouter initialEntries={["/login?redirect=//bad.example"]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/map" element={<p>已进入地图</p>} /></Routes></MemoryRouter>); }
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, {exact:true}), {target:{value}});
const click = (name: string) => fireEvent.click(screen.getByRole("button", {name}));
beforeEach(() => { vi.resetAllMocks(); mock.signIn.mockResolvedValue({ok:true}); mock.refresh.mockResolvedValue(undefined); });
afterEach(cleanup);
describe("登录页流程", () => {
  it("默认保留原账号登录且拒绝站外跳转", async () => { page(); fill("用户名或邮箱"," trial "); fill("密码","Pass123"); click("登录"); await screen.findByText("已进入地图"); expect(mock.signIn).toHaveBeenCalledWith("trial","Pass123"); });
  it("密码不一致时不发送注册邮件", async () => { page(); click("注册新账号"); fill("邮箱地址","a@example.com"); fill("密码","Pass12345"); fill("确认密码","Other1234"); click("获取验证码"); expect(await screen.findByRole("alert")).toHaveProperty("textContent","两次输入的密码不一致"); expect(mock.begin).not.toHaveBeenCalled(); });
  it("验证码未获取时不可提交；发送后倒计时，修改邮箱使验证失效", async () => {
    mock.begin.mockResolvedValue({email:"a@example.com",mode:"email",expiresAt:Date.now()+600000,complete:vi.fn()});
    page(); click("邮箱验证码"); fill("邮箱地址","a@example.com"); expect(screen.getByRole("button",{name:"登录"}).hasAttribute("disabled")).toBe(true);
    click("获取验证码"); await screen.findByRole("status"); expect(screen.getByRole("button",{name:/秒后重发/}).hasAttribute("disabled")).toBe(true);
    fill("邮箱地址","b@example.com"); expect(screen.getByRole("button",{name:"登录"}).hasAttribute("disabled")).toBe(true);
    fill("邮箱地址","a@example.com"); expect(screen.getByRole("button",{name:/秒后重发/}).hasAttribute("disabled")).toBe(true);
  });
  it("验证码错误保留表单并允许重试", async () => {
    const complete=vi.fn().mockRejectedValue(new Error("验证码不正确")); mock.begin.mockResolvedValue({email:"a@example.com",mode:"email",expiresAt:Date.now()+600000,complete});
    page(); click("邮箱验证码"); fill("邮箱地址","a@example.com"); click("获取验证码"); await screen.findByRole("status");
    fill("邮箱验证码","012345"); click("登录"); await screen.findByRole("alert"); expect(mock.success).not.toHaveBeenCalled(); expect(complete).toHaveBeenCalledWith("012345",undefined);
  });
  it("找回密码提交恢复验证码与新密码", async () => {
    const complete=vi.fn().mockResolvedValue(undefined); mock.begin.mockResolvedValue({email:"a@example.com",mode:"reset",expiresAt:Date.now()+600000,complete});
    page(); click("忘记密码？"); fill("邮箱地址","a@example.com"); click("获取验证码"); await screen.findByRole("status");
    fill("新密码","Next12345"); fill("确认密码","Next12345"); fill("邮箱验证码","123456"); click("验证并重设密码");
    await waitFor(()=>expect(complete).toHaveBeenCalledWith("123456","Next12345")); await screen.findByText("已进入地图");
  });
  it("发送期间禁用重复点击和模式切换", async () => {
    mock.begin.mockReturnValue(new Promise(()=>{})); page(); click("邮箱验证码"); fill("邮箱地址","a@example.com"); click("获取验证码");
    expect(screen.getByRole("button",{name:"发送中…"}).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button",{name:"注册新账号"}).hasAttribute("disabled")).toBe(true); expect(mock.begin).toHaveBeenCalledOnce();
  });
});

