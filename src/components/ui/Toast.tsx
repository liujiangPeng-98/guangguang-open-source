import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

interface ToastContextValue {
  show: (type: ToastType, message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ToastContextValue["show"]>(
    (type, message, durationMs = 3500) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list, { id, type, message, durationMs }]);
      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((list) => list.filter((t) => t.id !== id));
        }, durationMs);
      }
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show("success", m, d),
      error: (m, d) => show("error", m, d),
      info: (m, d) => show("info", m, d),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <ToastView
            key={t.id}
            toast={t}
            onClose={() =>
              setToasts((list) => list.filter((x) => x.id !== t.id))
            }
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

function ToastView({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const colorCls =
    toast.type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : toast.type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  const Icon =
    toast.type === "success"
      ? CheckCircle2
      : toast.type === "error"
        ? XCircle
        : Info;

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${colorCls}`}
      role="status"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1 break-words text-sm leading-relaxed">{toast.message}</div>
      <button
        type="button"
        onClick={onClose}
        className="-m-1 shrink-0 rounded p-1 text-current/60 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        aria-label="关闭提示"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
