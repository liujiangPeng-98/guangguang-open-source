import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="text-sm">正在检查登录态...</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return (
      <Navigate
        to={`/login${redirect ? `?redirect=${redirect}` : ""}`}
        replace
      />
    );
  }

  return <>{children}</>;
}
