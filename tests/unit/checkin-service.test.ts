import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckinRow, PhotoRow } from "../../src/services/pgCheckin";
import { checkinRow, newInput, photoRow } from "./fixtures";

const cloud = vi.hoisted(() => ({
  getSession: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(),
}));
vi.mock("../../src/utils/cloudbase", () => ({
  auth: { getSession: cloud.getSession },
  app: { rdb: () => ({ from: cloud.from, rpc: cloud.rpc }), storage: { from: () => cloud } },
}));
import { createCheckin, deleteCheckin, getCheckin, listMyCheckins } from "../../src/services/checkinService";

interface QueryResult { data: unknown; error: unknown }
interface Query extends PromiseLike<QueryResult> {
  select: (...args: unknown[]) => Query; eq: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query; order: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query; range: (...args: unknown[]) => Query;
}
function query(data: unknown, error: unknown = null): Query {
  const result: Query = {
    select: vi.fn(() => result), eq: vi.fn(() => result), in: vi.fn(() => result),
    order: vi.fn(() => result), limit: vi.fn(() => result), range: vi.fn(() => result),
    then: Promise.resolve({ data, error }).then.bind(Promise.resolve({ data, error })),
  };
  return result;
}
let row: CheckinRow;
let photos: PhotoRow[];
let events: string[];
const queries: { table: string; query: Query }[] = [];

beforeEach(() => {
  row = checkinRow(); photos = []; events = []; queries.length = 0;
  cloud.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "user-1", is_anonymous: false } } }, error: null });
  cloud.from.mockReset().mockImplementation((table: string) => {
    const request = query(table === "checkins" ? [row] : [...photos]);
    queries.push({ table, query: request }); return request;
  });
  cloud.upload.mockReset().mockImplementation(async () => { events.push("upload"); return { error: null }; });
  cloud.remove.mockReset().mockImplementation(async () => { events.push("remove"); return { error: null }; });
  cloud.createSignedUrl.mockReset().mockResolvedValue({ data: { fullSignedURL: "https://photos.example.test/cover.jpg" }, error: null });
  cloud.rpc.mockReset().mockImplementation(async (name: string) => {
    events.push(name);
    // Only SDK responses are simulated. All client validation, uploading,
    // recovery, hydration and cleanup run through the production services.
    if (name === "begin_checkin") return { data: { id: row.id }, error: null };
    if (name === "clear_checkin_upload") photos = [];
    if (name === "prepare_checkin_photos") photos = [photoRow()];
    if (name === "finish_checkin") { row = { ...row, status: "active" }; photos = photos.map(p => ({ ...p, status: "ready" })); }
    if (name === "delete_checkin") { row = { ...row, status: "deleted" }; return { data: photos, error: null }; }
    return { data: name === "prepare_checkin_photos" ? photos : { id: row.id }, error: null };
  });
});

describe("打卡保存与异常恢复", () => {
  it("成功提交传入稳定提交 ID，上传完成后才提交，并返回可用的首图", async () => {
    const input = newInput();
    const saved = await createCheckin(input);
    expect(saved.id).toBe("checkin-1");
    expect(saved.record.photos[0].url).toBe("https://photos.example.test/cover.jpg");
    expect(saved.record.location.name).toBe("西湖");
    expect(cloud.rpc).toHaveBeenCalledWith("begin_checkin", expect.objectContaining({
      p_submission_id: input.__submissionId,
      p_payload: expect.objectContaining({ place_name: "西湖", longitude: 120.15 }),
    }));
    expect(events.indexOf("upload")).toBeLessThan(events.indexOf("finish_checkin"));
    expect(saved.record.createdAt).toBe(Date.parse(row.created_at));
  });
  it("同一个提交 ID 重试已成功记录时，不重新上传、不清理已保存照片", async () => {
    const input = newInput();
    const first = await createCheckin(input);
    cloud.upload.mockClear(); cloud.remove.mockClear(); cloud.rpc.mockClear();
    const second = await createCheckin(input);
    expect(second.id).toBe(first.id);
    expect(cloud.rpc.mock.calls.map(([name]) => name)).toEqual(["begin_checkin"]);
    expect(cloud.upload).not.toHaveBeenCalled();
    expect(cloud.remove).not.toHaveBeenCalled();
  });
  it.each([
    ["没有照片", { photos: [] }, "1～9"],
    ["空地点名称", { location: { name: "  " } }, "地点名称"],
    ["缺纬度", { location: { name: "西湖", longitude: 120 } }, "同时填写"],
    ["缺经度", { location: { name: "西湖", latitude: 30 } }, "同时填写"],
  ])("提交前拒绝%s，不创建云端草稿", async (_label, override, message) => {
    await expect(createCheckin({ ...newInput(), ...override })).rejects.toThrow(String(message));
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(cloud.upload).not.toHaveBeenCalled();
  });
  it("上传失败清理未完成照片，保留原始错误供页面提示", async () => {
    cloud.upload.mockResolvedValue({ error: { message: "upload offline" } });
    await expect(createCheckin(newInput())).rejects.toThrow("upload offline");
    expect(cloud.remove).toHaveBeenCalledWith([photoRow().object_key]);
    expect(events.filter(e => e === "finish_checkin")).toHaveLength(0);
    expect(events.slice(-2)).toEqual(["remove", "clear_checkin_upload"]);
  });
  it("云端提交成功但响应丢失，查回成功记录，不误删照片", async () => {
    const normalRpc = cloud.rpc.getMockImplementation()!;
    cloud.rpc.mockImplementation(async (name: string, parameters: unknown) => {
      const response = await normalRpc(name, parameters);
      if (name === "finish_checkin") throw new Error("response lost");
      return response;
    });
    const saved = await createCheckin(newInput());
    expect(saved.record.photos).toHaveLength(1);
    expect(row.status).toBe("active");
    expect(cloud.remove).not.toHaveBeenCalled();
    expect(events.filter(e => e === "clear_checkin_upload")).toHaveLength(1);
  });
  it("提交未成功时回收文件并保留提交错误", async () => {
    const normalRpc = cloud.rpc.getMockImplementation()!;
    cloud.rpc.mockImplementation((name: string, parameters: unknown) =>
      name === "finish_checkin" ? Promise.resolve({ data: null, error: { message: "commit rejected" } }) : normalRpc(name, parameters));
    await expect(createCheckin(newInput())).rejects.toThrow("commit rejected");
    expect(cloud.remove).toHaveBeenCalledOnce();
    expect(row.status).toBe("draft");
  });
  it("上传失败且清理也失败，提示保留页面重试，不清除云端照片元数据", async () => {
    cloud.upload.mockResolvedValue({ error: { message: "upload offline" } });
    cloud.remove.mockResolvedValue({ error: { message: "cleanup offline" } });
    await expect(createCheckin(newInput())).rejects.toThrow("部分文件仍待清理");
    expect(events.filter(e => e === "clear_checkin_upload")).toHaveLength(1);
    expect(photos).toHaveLength(1);
  });
  it("失败后无法确认云端保存状态时，不冒险删除照片", async () => {
    cloud.upload.mockImplementation(async () => {
      cloud.from.mockImplementation(() => query(null, { message: "read offline" }));
      return { error: { message: "upload response lost" } };
    });
    await expect(createCheckin(newInput())).rejects.toThrow("read offline");
    expect(cloud.remove).not.toHaveBeenCalled();
  });
  it("云端返回无效编号时停止，不上传照片", async () => {
    cloud.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(createCheckin(newInput())).rejects.toThrow("未返回记录编号");
    expect(cloud.upload).not.toHaveBeenCalled();
  });
});

describe("读取和删除的客户端约束", () => {
  it("读取本人 active 记录，查询带所有者条件，过滤未完成及其他记录照片", async () => {
    row = checkinRow("active");
    photos = [photoRow("ready"), { ...photoRow("pending"), id: "pending" }, { ...photoRow("ready"), id: "other", checkin_id: "other-checkin" }];
    const result = await listMyCheckins({ skip: -1, limit: 999, sortKey: "createdAt", sortOrder: "asc" });
    expect(result).toHaveLength(1);
    expect(result[0].photos).toHaveLength(1);
    const recordsQuery = queries.find(q => q.table === "checkins")!.query;
    expect(recordsQuery.eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(recordsQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(recordsQuery.range).toHaveBeenCalledWith(0, 199);
    expect(recordsQuery.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(queries.find(q => q.table === "checkin_photos")!.query.eq).toHaveBeenCalledWith("owner_id", "user-1");
  });
  it("草稿和已删除记录不作为详情返回", async () => {
    await expect(getCheckin("checkin-1")).resolves.toBeNull();
    row = checkinRow("deleted");
    await expect(getCheckin("checkin-1")).resolves.toBeNull();
    expect(cloud.createSignedUrl).not.toHaveBeenCalled();
  });
  it("照片真正删除后才完成记录删除", async () => {
    photos = [photoRow("ready")];
    await deleteCheckin("checkin-1");
    expect(events).toEqual(["delete_checkin", "remove", "finish_delete_checkin"]);
  });
  it("删除对象失败时不完成记录删除，保留重试机会", async () => {
    photos = [photoRow("ready")];
    cloud.remove.mockResolvedValue({ error: { message: "remove offline" } });
    await expect(deleteCheckin("checkin-1")).rejects.toThrow("remove offline");
    expect(cloud.rpc.mock.calls.map(([name]) => name)).toEqual(["delete_checkin"]);
  });
});
