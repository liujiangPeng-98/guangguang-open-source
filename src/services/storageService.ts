import { app } from "../utils/cloudbase";
import { PHOTO_BUCKET, checkResult, requireCurrentUid } from "./pgCheckin";
import type { PhotoRow } from "./pgCheckin";
import type { CheckinPhoto } from "../types/checkin";

export interface UploadProgress {
  loaded: number; total: number; percent: number; fileIndex: number; fileName: string;
}
export function validateImageFiles(files: File[]): string | null {
  if (!files.length || files.length > 9) return "请选择 1～9 张照片";
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return `不支持的图片格式：${file.name}（仅支持 JPG / PNG / WEBP）`;
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) return `图片大小无效：${file.name}（每张最多 5MB）`;
  }
  return null;
}
export async function uploadCheckinPhotos(options: {
  files: File[]; rows: PhotoRow[]; onProgress?: (progress: UploadProgress) => void;
}): Promise<void> {
  await requireCurrentUid();
  for (const [index, file] of options.files.entries()) {
    const row = options.rows[index];
    if (!row) throw new Error("照片上传信息不完整");
    options.onProgress?.({ fileIndex: index, fileName: file.name, total: file.size, loaded: 0, percent: 0 });
    const { error } = await app.storage.from(PHOTO_BUCKET).upload(row.object_key, file, { contentType: file.type, upsert: false });
    checkResult(error);
    options.onProgress?.({ fileIndex: index, fileName: file.name, total: file.size, loaded: file.size, percent: 100 });
  }
}
export async function deleteFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const uid = await requireCurrentUid();
  if (paths.some(key => !key.startsWith(`${uid}/`))) throw new Error("无权删除其他人的照片");
  const { error } = await app.storage.from(PHOTO_BUCKET).remove(paths);
  checkResult(error);
}
export async function resolveTempURLs(photos: CheckinPhoto[], maxAgeSec = 600): Promise<CheckinPhoto[]> {
  if (!photos.length) return [];
  await requireCurrentUid();
  return Promise.all(photos.map(async photo => {
    const { data, error } = await app.storage.from(PHOTO_BUCKET).createSignedUrl(photo.fileID, maxAgeSec);
    if (error || !data) {
      console.warn("一张私密照片暂时无法读取，请刷新后重试。");
      return { ...photo, url: undefined };
    }
    const url = data.fullSignedURL;
    return { ...photo, url: typeof url === "string" ? url : undefined };
  }));
}
