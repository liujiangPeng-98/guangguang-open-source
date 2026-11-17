import { auth, app } from "../utils/cloudbase";

export const pg = app.rdb();
export const PHOTO_BUCKET = "checkin-photos";

export interface PhotoRow {
  id: string; checkin_id: string; owner_id: string; object_key: string;
  filename: string; mime_type: string; size_bytes: number; sort_order: number; status: string;
}
export interface CheckinRow {
  id: string; owner_id: string; title: string | null; place_name: string; text: string;
  country_code: string; admin_area: string; locality: string; address: string;
  longitude: number | null; latitude: number | null; visited_on: string;
  created_at: string; updated_at: string; status: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function photoRows(data: unknown): PhotoRow[] {
  if (!Array.isArray(data) || !data.every((row: unknown) => object(row) &&
    ["id", "checkin_id", "owner_id", "object_key", "filename", "mime_type", "status"].every(key => typeof row[key] === "string") &&
    typeof row.size_bytes === "number" && typeof row.sort_order === "number")) throw new Error("照片数据格式异常");
  return data as PhotoRow[];
}
export function checkinRows(data: unknown): CheckinRow[] {
  if (!Array.isArray(data) || !data.every((row: unknown) => object(row) &&
    ["id", "owner_id", "place_name", "text", "country_code", "admin_area", "locality", "address", "visited_on", "created_at", "updated_at", "status"].every(key => typeof row[key] === "string") &&
    (row.title === null || typeof row.title === "string") &&
    (row.longitude === null || typeof row.longitude === "number") && (row.latitude === null || typeof row.latitude === "number"))) throw new Error("风景记录数据格式异常");
  return data as CheckinRow[];
}
export function checkResult(error: unknown): void {
  if (!error) return;
  const message = object(error) && typeof error.message === "string" ? error.message : "云端请求失败，请稍后重试";
  throw new Error(message);
}
export async function requireCurrentUid(): Promise<string> {
  const { data, error } = await auth.getSession();
  checkResult(error);
  if (!data?.session || data.session.user.is_anonymous || !data.session.user.id) throw new Error("请先登录后再操作");
  return data.session.user.id;
}
export async function rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  // SDK 3.10.1 creates a PostgREST client at runtime, but declares rdb as MySQL.
  // Check the actual capability instead of suppressing the SDK type mismatch.
  if (!hasRpc(pg)) throw new Error("当前 CloudBase SDK 不支持数据库函数调用");
  const { data, error } = await pg.rpc(name, parameters);
  checkResult(error);
  return data;
}
function hasRpc(client: unknown): client is { rpc: (name: string, parameters: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> } {
  return object(client) && typeof client.rpc === "function";
}
