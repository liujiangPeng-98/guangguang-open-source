// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { AtlasRegion } from "../../src/maps/atlas";
import type { MapPoint } from "../../src/maps/model";
import type { CheckinRecord } from "../../src/types/checkin";
import PhotoMap from "../../src/components/map/PhotoMap";
import RecordPhoto from "../../src/components/map/RecordPhoto";

const atlas = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../src/maps/atlas", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/maps/atlas")>(),
  loadAtlas: atlas.load,
}));
const china: AtlasRegion = { id: "CN", countryCode: "CN", name: "中国", center: [105, 35], bounds: [750, 100, 880, 200], d: "M750,100L880,100L880,200Z" };
const japan: AtlasRegion = { ...china, id: "JP", countryCode: "JP", name: "日本" };
const anhui: AtlasRegion = { ...china, id: "CHN-1179", name: "安徽省", bounds: [810, 160, 820, 170] };
const jiangsu: AtlasRegion = { ...china, id: "CHN-1818", name: "江苏省", bounds: [815, 155, 825, 165] };
const record: CheckinRecord = { _id: "one", authorId: "user-1", location: { name: "合肥", countryCode: "CN", adminArea: "安徽省", longitude: 117, latitude: 32 }, checkinDate: "2026-10-10", description: "", photos: [], createdAt: 1, updatedAt: 1 };
const points: MapPoint[] = [{ record, position: [117, 32] }];
const countrySelect = () => screen.getByRole("combobox", { name: "选择国家或地区" });
const provinceSelect = () => screen.getByRole("combobox", { name: "选择省级地区" });
const pathFor = (id: string) => document.querySelector(`path[data-region="${id}"]`);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function renderMap() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PhotoMap points={points} onChooseGroup={vi.fn()} /></MemoryRouter>);
}
// jsdom does not implement the browser pointer-capture API. Model its state
// here, without changing the production event handlers or suppressing errors.
const capture = new WeakMap<Element, Set<number>>();
const pointerMethods = ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"] as const;
const originalPointerDescriptors = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const name of pointerMethods) originalPointerDescriptors.set(name, Object.getOwnPropertyDescriptor(Element.prototype, name));
  Object.defineProperties(Element.prototype, {
    setPointerCapture: { configurable: true, value(this: Element, id: number) { const ids = capture.get(this) ?? new Set<number>(); ids.add(id); capture.set(this, ids); } },
    releasePointerCapture: { configurable: true, value(this: Element, id: number) { capture.get(this)?.delete(id); } },
    hasPointerCapture: { configurable: true, value(this: Element, id: number) { return capture.get(this)?.has(id) ?? false; } },
  });
});
afterAll(() => {
  for (const name of pointerMethods) {
    const descriptor = originalPointerDescriptors.get(name);
    if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
    else Reflect.deleteProperty(Element.prototype, name);
  }
});
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  atlas.load.mockReset().mockImplementation(async (code?: string) =>
    code === "CN" ? [anhui, jiangsu] : code === "JP" ? [] : [china, japan]);
});
afterEach(cleanup);

describe("地图图层和选择交互", () => {
  it("省级地图加载时保留国家轮廓，加载后替换它以避免沿海重叠碎片", async () => {
    const pending = deferred<AtlasRegion[]>();
    atlas.load.mockImplementation(async (code?: string) => code ? pending.promise : [china, japan]);
    renderMap();
    await screen.findByRole("option", { name: "中国" });
    await userEvent.selectOptions(countrySelect(), "CN");
    expect(pathFor("CN")).not.toBeNull();
    expect(document.querySelectorAll(".atlas-province")).toHaveLength(0);
    await act(async () => pending.resolve([anhui, jiangsu]));
    await waitFor(() => expect(document.querySelectorAll(".atlas-province")).toHaveLength(2));
    expect(pathFor("CN")).toBeNull();
    expect(pathFor("JP")).not.toBeNull();
  });
  it("省级资源失败时保留国家轮廓并提供有效重试", async () => {
    atlas.load.mockImplementation(async (code?: string) => {
      if (code) throw new Error("省级文件暂时不可用");
      return [china];
    });
    renderMap();
    await screen.findByRole("option", { name: "中国" });
    await userEvent.selectOptions(countrySelect(), "CN");
    expect((await screen.findByRole("alert")).textContent).toContain("省级文件暂时不可用");
    expect(pathFor("CN")).not.toBeNull();
    atlas.load.mockImplementation(async (code?: string) => code ? [anhui, jiangsu] : [china]);
    await userEvent.click(screen.getByRole("button", { name: "重新加载地图" }));
    await waitFor(() => expect(document.querySelectorAll(".atlas-province")).toHaveLength(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pathFor("CN")).toBeNull();
  });
  it("没有省级数据的国家仍然可见", async () => {
    renderMap();
    await screen.findByRole("option", { name: "日本" });
    await userEvent.selectOptions(countrySelect(), "JP");
    await waitFor(() => expect(atlas.load).toHaveBeenCalledWith("JP"));
    expect(pathFor("JP")).not.toBeNull();
    expect(document.querySelectorAll(".atlas-province")).toHaveLength(0);
  });
  it("快速切换国家后，较慢的旧响应不会把地图切回去", async () => {
    const slowChina = deferred<AtlasRegion[]>();
    const tokyo: AtlasRegion = { ...japan, id: "JP-TOKYO", name: "东京" };
    atlas.load.mockImplementation(async (code?: string) =>
      code === "CN" ? slowChina.promise : code === "JP" ? [tokyo] : [china, japan]);
    renderMap();
    await screen.findByRole("option", { name: "中国" });
    await userEvent.selectOptions(countrySelect(), "CN");
    await userEvent.selectOptions(countrySelect(), "JP");
    await screen.findByRole("option", { name: "东京" });
    await act(async () => slowChina.resolve([anhui, jiangsu]));
    expect((countrySelect() as HTMLSelectElement).value).toBe("JP");
    expect(screen.queryByRole("option", { name: "安徽省" })).toBeNull();
    expect(pathFor("JP-TOKYO")).not.toBeNull();
  });
  it("悬浮不会改变选择；取消选择仍保留点亮状态", async () => {
    renderMap();
    await screen.findByRole("option", { name: "中国" });
    await userEvent.selectOptions(countrySelect(), "CN");
    await screen.findByRole("option", { name: "安徽省" });
    await userEvent.selectOptions(provinceSelect(), anhui.id);
    expect(pathFor(anhui.id)?.classList.contains("is-selected")).toBe(true);
    expect(pathFor(anhui.id)?.classList.contains("is-visited")).toBe(true);
    await userEvent.hover(pathFor(jiangsu.id)!);
    expect((provinceSelect() as HTMLSelectElement).value).toBe(anhui.id);
    expect(pathFor(jiangsu.id)?.classList.contains("is-selected")).toBe(false);
    await userEvent.unhover(pathFor(jiangsu.id)!);
    await userEvent.click(screen.getByRole("button", { name: "取消地区选择" }));
    expect(pathFor(anhui.id)?.classList.contains("is-selected")).toBe(false);
    expect(pathFor(anhui.id)?.classList.contains("is-visited")).toBe(true);
  });
  it("点击省份生成对应的新建记录链接，回到世界后清除省份选择", async () => {
    renderMap();
    await screen.findByRole("option", { name: "中国" });
    await userEvent.selectOptions(countrySelect(), "CN");
    await screen.findByRole("option", { name: "江苏省" });
    await userEvent.click(pathFor(jiangsu.id)!);
    expect((provinceSelect() as HTMLSelectElement).value).toBe(jiangsu.id);
    expect(screen.getByRole("link", { name: "记下这一刻" }).getAttribute("href")).toBe("/checkin/new?country=CN&region=CHN-1818");
    await userEvent.click(screen.getByRole("button", { name: "世界" }));
    expect(screen.queryByRole("combobox", { name: "选择省级地区" })).toBeNull();
    expect(document.querySelectorAll(".atlas-province")).toHaveLength(0);
    expect(pathFor("CN")).not.toBeNull();
  });
});

describe("首张照片的组件行为", () => {
  const first = { fileID: "a", filename: "a.jpg", size: 1, mimeType: "image/jpeg", url: "https://photos.example.test/a.jpg" };
  const second = { ...first, fileID: "b", url: "https://photos.example.test/b.jpg" };
  it("首图失败时显示降级提示，不擅自换成第二张", () => {
    render(<RecordPhoto record={{ ...record, photos: [first, second] }} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "首张照片加载失败，仍可打开记录" })).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
  it("更新签名链接后可重新展示首图", () => {
    const { rerender } = render(<RecordPhoto record={{ ...record, photos: [first] }} />);
    fireEvent.error(screen.getByRole("img"));
    rerender(<RecordPhoto record={{ ...record, photos: [{ ...first, url: first.url + "?fresh=1" }] }} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(first.url + "?fresh=1");
  });
  it("没有照片时显示可理解的占位提示", () => {
    render(<RecordPhoto record={record} />);
    expect(screen.getByRole("img", { name: "暂无首张照片，仍可打开记录" })).toBeTruthy();
  });
});
