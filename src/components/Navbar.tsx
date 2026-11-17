import { isSiteAdmin } from "../services/home-content";
import { Link, NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Home,
  LogOut,
  Map,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./ui/Toast";

const destinations = [
  { to: "/", label: "首页", icon: Home },
  { to: "/map", label: "我的足迹", icon: Map },
  { to: "/checkin", label: "风景手记", icon: BookOpen },
];

export default function Navbar() {
  const { status, user, signOut } = useAuth();
  const toast = useToast();
  const [adminUser, setAdminUser] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setAdminUser(null);
    if (user?.id)
      void isSiteAdmin()
        .then((value) => {
          if (active && value) setAdminUser(user.id);
        })
        .catch(() => console.warn("管理入口暂时不可用"));
    return () => {
      active = false;
    };
  }, [user?.id]);
  const admin = !!user?.id && adminUser === user.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const isAuthed = status === "authenticated";
  const displayName = user?.nickname || user?.username || user?.email || "旅人";
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      toast.success("已退出登录");
      setMenuOpen(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setSigningOut(false);
    }
  };
  return (
    <header className="app-header">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      <div className="nav-shell page-width">
        <Link
          to="/"
          className="brand"
          aria-label="逛逛首页"
          onClick={() => setMenuOpen(false)}
        >
          <img
            className="brand-symbol"
            src={`${import.meta.env.BASE_URL}images/guangguang-mark.svg`}
            alt=""
            width="42"
            height="42"
          />
          <span>
            逛逛<small>慢慢走 · 好好看</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          {[
            ...destinations,
            ...(admin ? [{ to: "/admin", label: "内容管理", icon: Home }] : []),
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item${isActive ? " is-active" : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-account">
          {isAuthed ? (
            <>
              <Link className="btn btn-primary nav-create" to="/checkin/new">
                <Plus size={16} /> 记下这一刻
              </Link>
              <span
                className="user-avatar"
                title={displayName}
                aria-label={`当前账号：${displayName}`}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <button
                className="icon-button desktop-logout"
                aria-label="退出登录"
                title="退出登录"
                onClick={handleLogout}
                disabled={signingOut}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <Link className="btn btn-primary nav-login" to="/login">
              试用登录 <ArrowUpRight size={16} />
            </Link>
          )}
          <button
            ref={menuButton}
            type="button"
            className="icon-button mobile-menu-button"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="手机导航"
        >
          {[
            ...destinations,
            ...(admin ? [{ to: "/admin", label: "内容管理", icon: Home }] : []),
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `mobile-nav-item${isActive ? " is-active" : ""}`
              }
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={18} />
              {label}
              <ArrowUpRight size={16} />
            </NavLink>
          ))}
          {isAuthed && (
            <button
              type="button"
              className="mobile-nav-item"
              onClick={handleLogout}
              disabled={signingOut}
            >
              <LogOut size={18} />
              退出登录<span className="account-name">{displayName}</span>
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
