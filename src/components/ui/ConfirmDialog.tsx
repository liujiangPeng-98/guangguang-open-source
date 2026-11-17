import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls = danger
    ? "bg-red-600 hover:bg-red-700 focus:ring-red-200 text-white"
    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-200 text-white";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          {danger ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 break-words">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm text-gray-600">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onCancel}
            className="-m-1 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`min-h-[44px] rounded-xl px-4 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-4 disabled:opacity-60 ${confirmCls}`}
          >
            {loading ? "处理中..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
