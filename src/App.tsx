import { lazy, Suspense, useEffect } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { checkLogin } from "./utils/cloudbase";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import AgentPage from "./pages/AgentPage";
import LoginPage from "./pages/LoginPage";
import CheckinListPage from "./pages/CheckinListPage";
import CheckinFormPage from "./pages/CheckinFormPage";
import CheckinDetailPage from "./pages/CheckinDetailPage";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

const SiteAdminPage = lazy(() => import("./pages/SiteAdminPage"));
const PersonalMapPage = lazy(() => import("./pages/PersonalMapPage"));

function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  useEffect(() => {
    const init = async () => {
      try {
        const r = await checkLogin();
        console.debug(
          "[cloudbase] 启动登录态检查:",
          r.isLoggedIn ? "已登录" : "未登录",
        );
      } catch (e) {
        console.debug("[cloudbase] 登录态检查失败(不阻塞UI):", e);
      }
    };
    void init();
  }, []);

  return (
    <div className={`app-shell${pathname === "/map" ? " app-shell-map" : ""}`}>
      <Navbar />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Suspense
                  fallback={
                    <p className="p-8" role="status">
                      正在打开管理页…
                    </p>
                  }
                >
                  <SiteAdminPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/agent" element={<AgentPage />} />
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <Suspense
                  fallback={
                    <p className="p-8 text-center" role="status">
                      正在展开你的足迹…
                    </p>
                  }
                >
                  <PersonalMapPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkin"
            element={
              <ProtectedRoute>
                <CheckinListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkin/new"
            element={
              <ProtectedRoute>
                <CheckinFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkin/:id"
            element={
              <ProtectedRoute>
                <CheckinDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      {pathname !== "/map" && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <AppShell />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
