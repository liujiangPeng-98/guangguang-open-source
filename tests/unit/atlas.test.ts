import { beforeEach, describe, expect, it, vi } from "vitest";
import { clampCamera, fitBounds, fitRegion, mapInsets, MAX_ZOOM, PHOTO_ZOOM, projectPosition } from "../../src/maps/atlas";

describe("地图投影和缩放", () => {
  it("投影零经纬度、世界四角，而不是把 0 当作缺失", () => {
    expect(projectPosition([0, 0])).toEqual([500, 250]);
    expect(projectPosition([-180, 90])).toEqual([0, 0]);
    expect(projectPosition([180, -90])).toEqual([1000, 500]);
  });
  it("平移和缩放被限制在地图范围内", () => {
    expect(clampCamera({ x: -10, y: 510, zoom: 1e9 })).toEqual({ x: 0, y: 500, zoom: MAX_ZOOM });
    expect(clampCamera({ x: 510, y: -10, zoom: 0 })).toEqual({ x: 510, y: 0, zoom: 1 });
    expect(clampCamera({ x: 300, y: 240, zoom: 3 })).toEqual({ x: 300, y: 240, zoom: 3 });
  });
  it.each([[1200, 600], [390, 700]])("宽高 %i × %i 时区域完整落在视野内", (width, height) => {
    const bounds: [number, number, number, number] = [700, 100, 750, 170];
    const camera = fitBounds(bounds, width, height);
    const visibleWidth = 1000 / camera.zoom;
    const visibleHeight = visibleWidth * height / width;
    expect(camera.x - visibleWidth / 2).toBeLessThan(bounds[0]);
    expect(camera.x + visibleWidth / 2).toBeGreaterThan(bounds[2]);
    expect(camera.y - visibleHeight / 2).toBeLessThan(bounds[1]);
    expect(camera.y + visibleHeight / 2).toBeGreaterThan(bounds[3]);
  });
  it("只有一个坐标和暂时为零的容器高度不会产生无限缩放", () => {
    expect(fitBounds([500, 250, 500, 250], 800, 550).zoom).toBe(PHOTO_ZOOM);
    const camera = fitBounds([400, 200, 450, 220], 800, 0);
    expect(Object.values(camera).every(Number.isFinite)).toBe(true);
    expect(camera.zoom).toBeGreaterThanOrEqual(1);
  });
});

describe("手机小地区取景", () => {
  it.each([[284,520],[354,562],[394,620],[900,650]])("%i × %i 时巴法塔区避开工具栏和卡片", (width,height) => {
    const bounds: [number,number,number,number]=[459.2,215,461.22,218.001];
    const c=fitBounds(bounds,width,height,mapInsets(width,true));
    const scale=width*c.zoom/1000, inset=mapInsets(width,true);
    expect(c.zoom).toBeGreaterThan(100);
    expect((bounds[0]-c.x)*scale+width/2).toBeGreaterThan(inset.left);
    expect((bounds[1]-c.y)*scale+height/2).toBeGreaterThan(inset.top);
    expect((bounds[2]-c.x)*scale+width/2).toBeLessThan(width-inset.right);
    expect((bounds[3]-c.y)*scale+height/2).toBeLessThan(height-inset.bottom);
    expect((bounds[3]-bounds[1])*scale).toBeGreaterThan(150);
  });
  it("微小区域可以展开，单张照片仍保持街区级取景", () => {
    expect(fitBounds([534,134,534.004,134.003],354,562,mapInsets(354,true)).zoom).toBeGreaterThan(100000);
    expect(fitBounds([534,134,534,134],354,562).zoom).toBe(PHOTO_ZOOM);
  });
  it("远离主体的岛屿不拉远默认取景，全域边界仍然保留", () => {
    const region={id:"islands",countryCode:"IS",name:"Islands",d:"M0,0Z",center:[0,0] as [number,number],bounds:[20,100,900,400] as [number,number,number,number],focusBounds:[300,200,310,210] as [number,number,number,number]};
    expect(fitRegion(region,354,562,true).zoom).toBeGreaterThan(50);
    expect(fitBounds(region.bounds,354,562).zoom).toBeLessThan(2);
  });
});

describe("地图资源加载", () => {
  const region = { id: "CN", countryCode: "CN", name: "中国", d: "M0,0L1,0L1,1Z", center: [104, 35], bounds: [0, 0, 1, 1] };
  beforeEach(() => vi.resetModules());
  it("拒绝路径注入，不发起请求", async () => {
    const { loadAtlas } = await import("../../src/maps/atlas");
    await expect(loadAtlas("../secret")).rejects.toThrow("地区编码无效");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("同一个资源的并行和后续读取共用请求", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([region])));
    const { loadAtlas } = await import("../../src/maps/atlas");
    const [a, b] = await Promise.all([loadAtlas("CN"), loadAtlas("CN")]);
    expect(a).toEqual([region]);
    expect(b).toBe(a);
    expect(await loadAtlas("CN")).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("maps/provinces/CN.json");
  });
  it("请求失败不污染缓存，重试可恢复", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([region])));
    const { loadAtlas } = await import("../../src/maps/atlas");
    await expect(loadAtlas()).rejects.toThrow("地图文件暂时无法读取");
    await expect(loadAtlas()).resolves.toEqual([region]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("畸形边界被拒绝，重新请求可恢复", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([{ ...region, bounds: [0, 1] }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([region])));
    const { loadAtlas } = await import("../../src/maps/atlas");
    await expect(loadAtlas("CN")).rejects.toThrow("地图文件格式异常");
    await expect(loadAtlas("CN")).resolves.toEqual([region]);
  });
  it("超时和断网错误保留给调用者，不缓存失败", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
      .mockResolvedValueOnce(new Response("[]"));
    const { loadAtlas } = await import("../../src/maps/atlas");
    await expect(loadAtlas("JP")).rejects.toMatchObject({ name: "TimeoutError" });
    await expect(loadAtlas("JP")).resolves.toEqual([]);
  });
});
