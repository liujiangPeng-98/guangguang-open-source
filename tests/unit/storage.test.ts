import { beforeEach, describe, expect, it, vi } from "vitest";
import { photoFile, photoRow } from "./fixtures";

const cloud = vi.hoisted(() => ({
  getSession: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(),
}));
vi.mock("../../src/utils/cloudbase", () => ({
  auth: { getSession: cloud.getSession },
  app: { rdb: () => ({}), storage: { from: () => cloud } },
}));
import { deleteFiles, resolveTempURLs, uploadCheckinPhotos, validateImageFiles } from "../../src/services/storageService";
import { requireCurrentUid } from "../../src/services/pgCheckin";

beforeEach(() => {
  cloud.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "user-1", is_anonymous: false } } }, error: null });
  cloud.upload.mockReset().mockResolvedValue({ error: null });
  cloud.remove.mockReset().mockResolvedValue({ error: null });
  cloud.createSignedUrl.mockReset().mockResolvedValue({ data: { fullSignedURL: "https://photos.example.test/signed.jpg" }, error: null });
});

describe("照片输入边界", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("接受 %s", type => {
    expect(validateImageFiles([photoFile(type)])).toBeNull();
  });
  it("接受 1～9 张以及恰好 5 MB，拒绝空列表和第 10 张", () => {
    expect(validateImageFiles(Array.from({ length: 9 }, () => photoFile()))).toBeNull();
    expect(validateImageFiles([photoFile("image/jpeg", 5 * 1024 * 1024)])).toBeNull();
    expect(validateImageFiles([])).toMatch("1～9");
    expect(validateImageFiles(Array.from({ length: 10 }, () => photoFile()))).toMatch("1～9");
  });
  it("拒绝空文件和超过 5 MB 的文件", () => {
    expect(validateImageFiles([photoFile("image/jpeg", 0)])).toMatch("大小无效");
    expect(validateImageFiles([photoFile("image/jpeg", 5 * 1024 * 1024 + 1)])).toMatch("最多 5MB");
  });
  it.each(["image/svg+xml", "image/gif", "", "application/javascript"])("不能用 jpg 文件名绕过 MIME 校验：%s", type => {
    expect(validateImageFiles([photoFile(type, 10, "fake.jpg")])).toMatch("不支持的图片格式");
  });
});

describe("照片存储与登录边界", () => {
  it.each([null, { user: { id: "", is_anonymous: false } }, { user: { id: "guest", is_anonymous: true } }])("拒绝无有效用户会话 %j", async session => {
    cloud.getSession.mockResolvedValue({ data: { session }, error: null });
    await expect(uploadCheckinPhotos({ files: [photoFile()], rows: [photoRow()] })).rejects.toThrow("请先登录");
    expect(cloud.upload).not.toHaveBeenCalled();
  });
  it("登录接口错误不会被当作有效登录", async () => {
    cloud.getSession.mockResolvedValue({ data: null, error: { message: "session expired" } });
    await expect(requireCurrentUid()).rejects.toThrow("session expired");
  });
  it("逐张报告上传进度并禁止覆盖同名云端对象", async () => {
    const onProgress = vi.fn();
    await uploadCheckinPhotos({ files: [photoFile()], rows: [photoRow()], onProgress });
    expect(cloud.upload).toHaveBeenCalledWith(photoRow().object_key, expect.any(File), { contentType: "image/jpeg", upsert: false });
    expect(onProgress.mock.calls.map(([p]) => p.percent)).toEqual([0, 100]);
  });
  it("某张上传失败后停止，不报告成功或继续上传下一张", async () => {
    cloud.upload.mockResolvedValueOnce({ error: { message: "upload interrupted" } });
    const onProgress = vi.fn();
    await expect(uploadCheckinPhotos({ files: [photoFile(), photoFile()], rows: [photoRow(), photoRow()], onProgress })).rejects.toThrow("upload interrupted");
    expect(cloud.upload).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls.map(([p]) => p.percent)).toEqual([0]);
  });
  it("上传元数据缺失时明确报错", async () => {
    await expect(uploadCheckinPhotos({ files: [photoFile()], rows: [] })).rejects.toThrow("上传信息不完整");
    expect(cloud.upload).not.toHaveBeenCalled();
  });
  it("混入其他用户对象时整批拒绝删除，不能匹配相似用户前缀", async () => {
    await expect(deleteFiles(["user-1/own.jpg", "user-10/not-own.jpg"])).rejects.toThrow("无权删除");
    expect(cloud.remove).not.toHaveBeenCalled();
    await deleteFiles(["user-1/own.jpg"]);
    expect(cloud.remove).toHaveBeenCalledWith(["user-1/own.jpg"]);
  });
  it("空照片列表不请求云端；单张签名失败只降级该照片", async () => {
    await expect(resolveTempURLs([])).resolves.toEqual([]);
    await deleteFiles([]);
    expect(cloud.getSession).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    cloud.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "missing" } });
    const photos = ["first.jpg", "second.jpg"].map(fileID => ({ fileID, filename: fileID, size: 1, mimeType: "image/jpeg" }));
    const result = await resolveTempURLs(photos, 600);
    expect(result.map(p => p.fileID)).toEqual(["first.jpg", "second.jpg"]);
    expect(result[0].url).toBeUndefined();
    expect(result[1].url).toBe("https://photos.example.test/signed.jpg");
    expect(warn).toHaveBeenCalledOnce();
    expect(cloud.createSignedUrl).toHaveBeenCalledWith("second.jpg", 600);
  });
});
