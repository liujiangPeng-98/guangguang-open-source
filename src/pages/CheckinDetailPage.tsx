import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import {
  deleteCheckin,
  getCheckin,
} from "../services/checkinService";
import type { CheckinRecord } from "../types/checkin";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Calendar,
  MapPin,
  Globe2,
  Navigation,
  AlertOctagon,
  RefreshCw,
  X,
} from "lucide-react";

const CheckinDetailPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState<CheckinRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    setNoPermission(false);
    try {
      const r = await getCheckin(id);
      if (!r) {
        setError("这条风景手记不存在或已被删除");
      } else if (user && r.authorId !== user.id) {
        setNoPermission(true);
      } else {
        setRecord(r);
      }
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
      const msg = e instanceof Error ? e.message : "加载失败，请稍后再试";
      if (code === "PERMISSION_DENIED" || /无权|permission/i.test(msg)) {
        setNoPermission(true);
      } else {
        setError(msg);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setError("缺少打卡 ID");
      setLoading(false);
      return;
    }
    void load(true);
  }, [id]);

  const handleDeleteConfirm = async () => {
    if (!record) return;
    setDeleting(true);
    try {
      await deleteCheckin(record._id);
      toast.success("删除成功");
      setDeleteDialogOpen(false);
      setTimeout(() => navigate("/checkin", { replace: true }), 300);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "删除失败，请稍后再试");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="flex flex-col items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  if (noPermission) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertOctagon className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h2 className="mb-1 text-lg font-semibold text-amber-900">
            无权限查看此记录
          </h2>
          <p className="mb-4 text-sm text-amber-700">
            这是他人的私密手记。请切换到对应用户账号，或返回查看自己的记录。
          </p>
          <button
            type="button"
            onClick={() => navigate("/checkin", { replace: true })}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
          >
            <ArrowLeft className="h-4 w-4" /> 返回风景手记
          </button>
        </div>
      </div>
    );
  }

  if (error && !record) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-4 text-sm text-red-700">{error}</p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => load(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-100"
            >
              <RefreshCw className="h-4 w-4" /> 重试
            </button>
            <button
              type="button"
              onClick={() => navigate("/checkin", { replace: true })}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" /> 返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!record) return null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">返回</span>
        </button>

        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">删除这条手记</span>
          <span className="sm:hidden">删除</span>
        </button>
      </div>

      <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {record.photos?.length ? (
          <div className="grid grid-cols-2 gap-0.5 sm:gap-1 sm:p-1 md:grid-cols-3">
            {record.photos.map((p, i) => (
              <button
                key={p.fileID + i}
                type="button"
                onClick={() => p.url && setPreviewURL(p.url)}
                className={`group relative block overflow-hidden bg-gray-100 ${
                  record.photos!.length === 1
                    ? "col-span-full"
                    : record.photos!.length === 2
                      ? "col-span-1 aspect-square sm:aspect-[4/3]"
                      : i === 0
                        ? "col-span-2 row-span-2 aspect-square md:aspect-auto"
                        : "aspect-square sm:aspect-[4/3]"
                }`}
              >
                {p.url ? (
                  <img
                    src={p.url}
                    alt={`${record.location.name} 照片 ${i + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="p-5 sm:p-7">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {record.title || record.location.name}
          </h1>

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
            <div className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-gray-700">
                {record.location.name}
              </span>
              {record.location.locality
                ? ` · ${record.location.locality}${
                    record.location.adminArea
                      ? `，${record.location.adminArea}`
                      : ""
                  }`
                : null}
            </div>
            <div className="inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              <span>记录日期：{record.checkinDate}</span>
            </div>
            {(record.location.latitude != null && record.location.longitude != null) ? (
              <div className="inline-flex items-center gap-2">
                <Navigation className="h-4 w-4 text-emerald-500" />
                <span className="font-mono text-xs text-gray-500">
                  {record.location.latitude.toFixed(5)},{" "}
                  {record.location.longitude.toFixed(5)}
                </span>
              </div>
            ) : null}
            {record.location.countryCode ? (
              <div className="inline-flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-emerald-500" />
                <span>
                  国家/地区：{record.location.countryCode}
                  {record.location.address ? ` · ${record.location.address}` : ""}
                </span>
              </div>
            ) : record.location.address ? (
              <div className="inline-flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-emerald-500" />
                <span>详细地址：{record.location.address}</span>
              </div>
            ) : null}
          </div>

          {record.description ? (
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 sm:p-5 sm:text-[15px] whitespace-pre-wrap">
              {record.description}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-400">
              没有文字描述
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-400">
            <span>
              创建于 {new Date(record.createdAt).toLocaleString("zh-CN")}
            </span>
            {record.photos?.length ? (
              <span>共 {record.photos.length} 张照片</span>
            ) : null}
          </div>
        </div>
      </article>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="确认删除这条手记？"
        description="删除后，相关的照片和记录会一并从云端移除，删除操作不可恢复。"
        confirmText="确认删除"
        cancelText="再想想"
        danger
        loading={deleting}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
      />

      {previewURL ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewURL(null)}
          role="dialog"
        >
          <button
            type="button"
            onClick={() => setPreviewURL(null)}
            aria-label="关闭预览"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewURL}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-xl shadow-2xl"
            alt="预览"
          />
        </div>
      ) : null}
    </div>
  );
};

export default CheckinDetailPage;
