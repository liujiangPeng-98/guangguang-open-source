import { app } from "../utils/cloudbase";
import { rpc, checkResult, requireCurrentUid } from "./pgCheckin";
import {
  parseHomeContent,
  validateHomeContent,
  type HomeContent,
} from "./home-content-model";
export interface ContentEditorState {
  draft: HomeContent;
  published: HomeContent;
  version: number;
  publishedAt: string | null;
}
export async function getHomeContent(): Promise<HomeContent> {
  return parseHomeContent(await rpc("get_home_content", {}));
}
export async function isSiteAdmin(): Promise<boolean> {
  const data = await rpc("site_access", {});
  return (
    !!data && typeof data === "object" && "admin" in data && data.admin === true
  );
}
function editorState(value: unknown): ContentEditorState {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    typeof value.version !== "number" ||
    !("draft" in value) ||
    !("published" in value)
  )
    throw new Error("管理配置读取失败");
  return {
    draft: parseHomeContent(value.draft),
    published: parseHomeContent(value.published),
    version: value.version,
    publishedAt:
      "publishedAt" in value && typeof value.publishedAt === "string"
        ? value.publishedAt
        : null,
  };
}
export async function getEditorContent(): Promise<ContentEditorState> {
  return editorState(await rpc("admin_home_content", {}));
}
export async function saveHomeContent(
  content: HomeContent,
  version: number,
  publish: boolean,
): Promise<ContentEditorState> {
  const error = validateHomeContent(content);
  if (error) throw new Error(error);
  return editorState(
    await rpc("save_home_content", {
      p_content: content,
      p_version: version,
      p_publish: publish,
    }),
  );
}
export async function uploadSiteImage(file: File): Promise<string> {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!ext[file.type] || file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new Error("请选择 5MB 以内的 JPG、PNG 或 WEBP 图片");
  const uid = await requireCurrentUid();
  const key = `${uid}/${crypto.randomUUID()}.${ext[file.type]}`;
  const bucket = app.storage.from("site-assets");
  const { error } = await bucket.upload(key, file, {
    contentType: file.type,
    upsert: false,
  });
  checkResult(error);
  const result: unknown = bucket.getPublicUrl(key);
  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    result.data &&
    typeof result.data === "object" &&
    "publicUrl" in result.data &&
    typeof result.data.publicUrl === "string"
  )
    return result.data.publicUrl;
  throw new Error("图片已上传，但公开地址获取失败，请重试");
}
