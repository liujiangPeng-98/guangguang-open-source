import type { CheckinRecord, NewCheckinInput, CheckinListOptions, CheckinLocation } from "../types/checkin";
import { pg, rpc, requireCurrentUid, checkResult, checkinRows, photoRows } from "./pgCheckin";
import type { CheckinRow, PhotoRow } from "./pgCheckin";
import { uploadCheckinPhotos, deleteFiles, resolveTempURLs, validateImageFiles } from "./storageService";
import type { UploadProgress } from "./storageService";

export type UploadProgressCb = (progress: UploadProgress) => void;
export const newLocation = (name: string, extras: Partial<CheckinLocation> = {}): CheckinLocation => ({ ...extras, name: name.trim() });
async function photosFor(ids: string[], ownerId: string): Promise<PhotoRow[]> {
  if (!ids.length) return [];
  const { data, error } = await pg.from("checkin_photos").select("*").eq("owner_id", ownerId).in("checkin_id", ids).order("sort_order", { ascending: true });
  checkResult(error);
  return photoRows(data);
}
async function hydrate(row: CheckinRow, photos: PhotoRow[]): Promise<CheckinRecord> {
  return {
    _id: row.id, authorId: row.owner_id, title: row.title ?? undefined,
    location: { name: row.place_name, countryCode: row.country_code, adminArea: row.admin_area, locality: row.locality, address: row.address, longitude: row.longitude, latitude: row.latitude },
    checkinDate: row.visited_on, description: row.text,
    createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
    photos: await resolveTempURLs(photos.filter(photo => photo.checkin_id === row.id && photo.status === "ready").map(photo => ({ fileID: photo.object_key, filename: photo.filename, size: photo.size_bytes, mimeType: photo.mime_type }))),
  };
}
export async function listMyCheckins(options: CheckinListOptions = {}): Promise<CheckinRecord[]> {
  const ownerId = await requireCurrentUid();
  const skip = Math.max(0, options.skip ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? 200, 200));
  const { data, error } = await pg.from("checkins").select("*").eq("owner_id", ownerId).eq("status", "active")
    .order(options.sortKey === "createdAt" ? "created_at" : "visited_on", { ascending: options.sortOrder === "asc" })
    .order("id", { ascending: true }).range(skip, skip + limit - 1);
  checkResult(error);
  const rows = checkinRows(data);
  const photos = await photosFor(rows.map(row => row.id), ownerId);
  return Promise.all(rows.map(row => hydrate(row, photos)));
}
async function ownRow(id: string, ownerId: string): Promise<CheckinRow | undefined> {
  const { data, error } = await pg.from("checkins").select("*").eq("id", id).eq("owner_id", ownerId).limit(1);
  checkResult(error);
  return checkinRows(data)[0];
}
export async function getCheckin(id: string): Promise<CheckinRecord | null> {
  const ownerId = await requireCurrentUid();
  const row = await ownRow(id, ownerId);
  if (!row || row.status !== "active") return null;
  return hydrate(row, await photosFor([id], ownerId));
}
async function cleanPending(id: string, ownerId: string): Promise<void> {
  const pending = await photosFor([id], ownerId);
  await deleteFiles(pending.map(photo => photo.object_key));
  await rpc("clear_checkin_upload", { p_checkin_id: id });
}
export interface CreateCheckinResult { id: string; record: CheckinRecord }
export async function createCheckin(input: NewCheckinInput & { __submissionId?: string; __onProgress?: UploadProgressCb }): Promise<CreateCheckinResult> {
  const ownerId = await requireCurrentUid();
  const invalid = validateImageFiles(input.photos);
  if (invalid) throw new Error(invalid);
  if (!input.location.name.trim()) throw new Error("请填写地点名称");
  const loc = input.location;
  if ((loc.longitude == null) !== (loc.latitude == null)) throw new Error("请同时填写经度与纬度，或都留空");
  const started = await rpc("begin_checkin", { p_submission_id: input.__submissionId ?? crypto.randomUUID(), p_payload: {
    title: input.title ?? null, place_name: loc.name.trim(), text: input.description,
    country_code: loc.countryCode ?? "", admin_area: loc.adminArea ?? "", locality: loc.locality ?? "", address: loc.address ?? "",
    longitude: loc.longitude ?? null, latitude: loc.latitude ?? null, visited_on: input.checkinDate,
  } });
  const id = started && typeof started === "object" && "id" in started ? started.id : undefined;
  if (typeof id !== "string") throw new Error("云端未返回记录编号");
  const existing = await ownRow(id, ownerId);
  if (existing?.status === "active") return { id, record: await hydrate(existing, await photosFor([id], ownerId)) };
  await cleanPending(id, ownerId);
  const rows = photoRows(await rpc("prepare_checkin_photos", { p_checkin_id: id, p_photos: input.photos.map(file => ({ filename: file.name, mime_type: file.type, size_bytes: file.size })) }));
  try {
    await uploadCheckinPhotos({ files: input.photos, rows, onProgress: input.__onProgress });
    await rpc("finish_checkin", { p_checkin_id: id });
  } catch (error: unknown) {
    // A successful final commit may have lost its HTTP response. Never delete its files.
    const saved = await ownRow(id, ownerId);
    if (saved?.status === "active") return { id, record: await hydrate(saved, await photosFor([id], ownerId)) };
    try { await cleanPending(id, ownerId); }
    catch { throw new Error("上传未完成，部分文件仍待清理。请保持当前页面并重试，系统会先清理再上传。"); }
    throw error;
  }
  const record = await getCheckin(id);
  if (!record) throw new Error("已提交，请刷新风景手记确认保存结果");
  return { id, record };
}
export async function deleteCheckin(id: string): Promise<void> {
  await requireCurrentUid();
  const photos = photoRows(await rpc("delete_checkin", { p_checkin_id: id }));
  await deleteFiles(photos.map(photo => photo.object_key));
  await rpc("finish_delete_checkin", { p_checkin_id: id });
}
