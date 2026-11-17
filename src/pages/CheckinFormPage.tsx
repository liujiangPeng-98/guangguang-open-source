import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useToast } from "../components/ui/Toast";
import { createCheckin } from "../services/checkinService";
import RegionPicker from "../components/map/RegionPicker";
import { validateImageFiles } from "../services/storageService";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Navigation,
  MapPin,
  Calendar,
  FileImage,
  Info,
} from "lucide-react";

type FormInput = {
  title?: string;
  locationName: string;
  latitude?: string;
  longitude?: string;
  countryCode?: string;
  adminArea?: string;
  locality?: string;
  address?: string;
  checkinDate: string;
  description: string;
};

const MAX_PHOTOS = 9;

const todayString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const CheckinFormPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const submissionId = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    fileIndex: number;
    fileName: string;
    percent: number;
  } | null>(null);
  const [expandMore, setExpandMore] = useState(false);

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting: _isSubmitting },
    watch,
  } = useForm<FormInput>({
    mode: "onTouched",
    defaultValues: {
      checkinDate: todayString(),
      description: "",
      locationName: "",
    },
  });

  const watchLocationName = watch("locationName");
  const watchCheckinDate = watch("checkinDate");

  const localPreviews = useMemo(() => {
    return files.map((f) => ({
      key: f.name + "_" + f.size + "_" + f.lastModified,
      url: URL.createObjectURL(f),
      name: f.name,
    }));
  }, [files]);

  useEffect(() => {
    return () => {
      localPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [localPreviews]);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.isArray(incoming) ? incoming : Array.from(incoming ?? []);
    if (list.length === 0) return;
    const combined = [...files, ...list].slice(0, MAX_PHOTOS);
    const next = combined;
    const err = validateImageFiles(next);
    setFileError(err);
    if (!err) setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((arr) => arr.filter((_, i) => i !== idx));
    if (files.length - 1 === 0) setFileError(null);
  };

  const onSubmit = handleSubmit(async (data) => {
    const err1 = validateImageFiles(files);
    if (err1) {
      setFileError(err1);
      toast.error(err1);
      return;
    }
    if (files.length === 0) {
      setFileError("请至少上传 1 张照片");
      toast.error("请至少上传 1 张照片");
      return;
    }

    const latitude =
      data.latitude && !isNaN(Number(data.latitude))
        ? Number(data.latitude)
        : null;
    const longitude =
      data.longitude && !isNaN(Number(data.longitude))
        ? Number(data.longitude)
        : null;
    if (
      (latitude == null) !== (longitude == null) ||
      (latitude !== null && (latitude < -90 || latitude > 90)) ||
      (longitude !== null && (longitude < -180 || longitude > 180))
    ) {
      toast.error("请成对填写有效经纬度（纬度 -90..90，经度 -180..180）");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCheckin({
        __submissionId: submissionId.current,
        title: data.title?.trim() || undefined,
        location: {
          name: data.locationName.trim(),
          latitude,
          longitude,
          countryCode: data.countryCode?.trim(),
          adminArea: data.adminArea?.trim(),
          locality: data.locality?.trim(),
          address: data.address?.trim(),
        },
        checkinDate: data.checkinDate,
        description: data.description?.trim() ?? "",
        photos: files,
        __onProgress: (p) =>
          setUploadProgress({
            fileIndex: p.fileIndex,
            fileName: p.fileName,
            percent: p.percent,
          }),
      });

      toast.success("这一刻，已经记下了", 4500);
      navigate(`/checkin/${result.id}`, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存失败，请稍后再试";
      toast.error(msg, 5000);
      console.error("createCheckin failed:", e);
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  });

  const isSubmitDisabled =
    submitting ||
    Boolean(fileError) ||
    !watchLocationName?.trim() ||
    !watchCheckinDate ||
    files.length === 0;

  return (
    <div className="checkin-editor container mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">返回列表</span>
          <span className="sm:hidden">返回</span>
        </button>

        <Link
          to="/checkin"
          className="hidden text-sm text-emerald-600 hover:underline sm:block"
        >
          风景手记
        </Link>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            记下这一刻
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            不必远行，把今天遇见的风景与心情留在这里。
          </p>
        </div>

        <Field
          label="地点名称 *"
          hint="例：西湖 / 外滩 / 冰岛黑沙滩"
          error={errors.locationName?.message}
          icon={<MapPin className="h-4 w-4 text-emerald-500" />}
        >
          <input
            type="text"
            placeholder="请输入地点名称"
            className={inputCls(errors.locationName)}
            {...register("locationName", {
              required: "请填写地点名称",
              minLength: { value: 1, message: "地点名称不能为空" },
              maxLength: { value: 50, message: "地点名称过长（最多 50 字）" },
            })}
          />
        </Field>

        <RegionPicker initialCountry={params.get("country") ?? ""} initialRegion={params.get("region") ?? ""}
          onSelect={region => {
            setValue("countryCode", region?.countryCode ?? "");
            setValue("adminArea", region?.name ?? "");
            setValue("longitude", region ? String(region.center[0]) : "");
            setValue("latitude", region ? String(region.center[1]) : "");
          }} />

        <Field
          label="记录日期 *"
          icon={<Calendar className="h-4 w-4 text-emerald-500" />}
          error={errors.checkinDate?.message}
        >
          <input
            type="date"
            max={todayString()}
            className={inputCls(errors.checkinDate)}
            {...register("checkinDate", {
              required: "请选择记录日期",
              pattern: {
                value: /^\d{4}-\d{2}-\d{2}$/,
                message: "日期格式不正确",
              },
            })}
          />
        </Field>

        <Field
          label="文字描述 *"
          error={errors.description?.message}
          hint="建议 10 字以上，最多 1000 字"
        >
          <textarea
            rows={5}
            placeholder="这里有什么让你停下脚步？记下当时的风景和心情…"
            className={`${inputCls(errors.description)} resize-y`}
            {...register("description", {
              required: "请填写文字描述",
              minLength: { value: 0, message: "" },
              maxLength: { value: 1000, message: "描述最多 1000 字" },
            })}
          />
        </Field>

        <Field
          label="照片上传 *"
          hint={`建议 1-9 张，JPG/PNG/WEBP，单张 ≤ 5MB（已选 ${files.length}/${MAX_PHOTOS}）`}
          error={fileError ?? undefined}
          icon={<FileImage className="h-4 w-4 text-emerald-500" />}
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="选择风景照片"
            onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); fileInputRef.current?.click(); } }}
            className={`group cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
              fileError
                ? "border-red-300 bg-red-50/60 hover:bg-red-50"
                : "border-gray-300 bg-gray-50/60 hover:border-emerald-400 hover:bg-emerald-50/40"
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files ?? [])}
            />
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                <ImagePlus className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                点击选择图片，或拖拽图片到这里
              </p>
              <p className="text-xs text-gray-500">
                {files.length < MAX_PHOTOS
                  ? `最多可上传 ${MAX_PHOTOS} 张`
                  : "已达数量上限"}
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {localPreviews.map((p, i) => (
                <div
                  key={p.key}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
                >
                  <img
                    src={p.url}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`移除 ${p.name}`}
                    onClick={() => removeFile(i)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-100 shadow transition sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {uploadProgress?.fileIndex === i ? (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/10">
                      <div
                        className="h-full bg-[#245c49] transition-all"
                        style={{ width: `${uploadProgress.percent}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              {files.length < MAX_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 text-gray-500 transition hover:border-emerald-400 hover:text-emerald-600"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">再加一张</span>
                </button>
              ) : null}
            </div>
          )}

          {uploadProgress ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在上传第 {uploadProgress.fileIndex + 1} 张：
              {uploadProgress.fileName}（{uploadProgress.percent}%）
            </p>
          ) : null}
        </Field>

        <details
          open={expandMore}
          onToggle={(e) => setExpandMore((e.currentTarget as HTMLDetailsElement).open)}
          className="group rounded-xl border border-gray-200 bg-gray-50/50"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-700 marker:hidden">
            <span className="inline-flex items-center gap-2">
              <Navigation className="h-4 w-4 text-emerald-500" />
              补充位置信息（可选）
            </span>
            <span className="text-gray-400 transition group-open:rotate-180">
              {expandMore ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-4 px-4 pb-5 sm:grid-cols-2">
            <Field label="纬度 (latitude)" hint="WGS84，-90 ~ 90">
              <input
                type="number"
                step="any"
                placeholder="例如：30.2741"
                className={inputCls()}
                {...register("latitude")}
              />
            </Field>
            <Field label="经度 (longitude)" hint="WGS84，-180 ~ 180">
              <input
                type="number"
                step="any"
                placeholder="例如：120.1551"
                className={inputCls()}
                {...register("longitude")}
              />
            </Field>
            <Field label="国家/地区代码" hint="ISO 两位，如 CN / JP / IS">
              <input
                type="text"
                placeholder="CN"
                className={inputCls()}
                {...register("countryCode", {
                  maxLength: { value: 5, message: "最多 5 位" },
                })}
              />
            </Field>
            <Field label="省/州 / 都道府县">
              <input
                type="text"
                placeholder="例：浙江省"
                className={inputCls()}
                {...register("adminArea", {
                  maxLength: { value: 40, message: "最多 40 字" },
                })}
              />
            </Field>
            <Field label="市 / 区">
              <input
                type="text"
                placeholder="例：杭州市"
                className={inputCls()}
                {...register("locality", {
                  maxLength: { value: 40, message: "最多 40 字" },
                })}
              />
            </Field>
            <Field label="详细地址" hint="街道、门牌号等">
              <input
                type="text"
                placeholder="例：西湖区龙井路 1 号"
                className={inputCls()}
                {...register("address", {
                  maxLength: { value: 120, message: "最多 120 字" },
                })}
              />
            </Field>
          </div>
        </details>

        <Field label="简短标题（可选）" hint="留空则默认使用地点名称作为标题">
          <input
            type="text"
            placeholder="给这一刻起个名字"
            className={inputCls()}
            {...register("title", {
              maxLength: { value: 40, message: "标题最多 40 字" },
            })}
          />
        </Field>

        <div className="flex items-start gap-2 rounded-xl bg-emerald-50/60 p-3.5 text-xs text-emerald-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            照片与文字仅自己可见。保存成功后，可以在其他设备登录同一账号查看。
          </div>
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <Link
            to="/checkin"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 sm:inline-flex"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#245c49] hover:bg-[#184633] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
          >
            {(submitting || _isSubmitting) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {submitting ? "保存中..." : "保存这一刻"}
          </button>
        </div>
      </form>
    </div>
  );
};

const inputCls = (err?: unknown) =>
  `min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:ring-4 ${
    err
      ? "border-red-300 focus:border-red-500 focus:ring-red-100"
      : "border-gray-300 focus:border-emerald-500 focus:ring-emerald-100"
  }`;

function Field({
  label,
  hint,
  error,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {icon}
        {label}
      </span>
      {children}
      {hint && !error ? (
        <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

export default CheckinFormPage;
