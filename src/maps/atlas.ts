export interface AtlasRegion {
  id: string; countryCode: string; name: string; center: [number, number];
  d: string; focusBounds?: [number, number, number, number]; bounds: [number, number, number, number];
}
export interface Camera { x: number; y: number; zoom: number }
export const WORLD_CAMERA: Camera = { x: 500, y: 250, zoom: 1 };
// Small subdivisions (including Vatican City) need much more than country-scale zoom.
export const MAX_ZOOM = 262144;
export const PHOTO_ZOOM = 24;
export interface ViewInsets { top: number; right: number; bottom: number; left: number }
export function mapInsets(width: number, selected: boolean): ViewInsets {
  return { top: width < 600 ? 138 : 102, right: 68, bottom: selected ? 174 : 48, left: 18 };
}
export function projectPosition([longitude, latitude]: [number, number]): [number, number] {
  return [(longitude + 180) * 1000 / 360, (90 - latitude) * 500 / 180];
}
export function clampCamera(camera: Camera): Camera {
  return { x: Math.max(0, Math.min(1000, camera.x)), y: Math.max(0, Math.min(500, camera.y)), zoom: Math.max(1, Math.min(MAX_ZOOM, camera.zoom)) };
}
export function fitBounds(bounds: AtlasRegion["bounds"], width: number, height: number,
  insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 }, maxZoom = MAX_ZOOM): Camera {
  const [left, top, right, bottom] = bounds;
  const w = Math.max(width, 1), h = Math.max(height, 1);
  const availableWidth = Math.max(1, w - insets.left - insets.right);
  const availableHeight = Math.max(1, h - insets.top - insets.bottom);
  const dx = right - left, dy = bottom - top;
  // A single photo coordinate has no extent: retain a useful neighbourhood view.
  const limit = dx === 0 && dy === 0 ? Math.min(PHOTO_ZOOM, maxZoom) : maxZoom;
  const scale = Math.min(availableWidth / Math.max(dx * 1.15, 1e-12), availableHeight / Math.max(dy * 1.15, 1e-12), w * limit / 1000);
  return clampCamera({
    x: (left + right) / 2 + (insets.right - insets.left) / (2 * scale),
    y: (top + bottom) / 2 + (insets.bottom - insets.top) / (2 * scale),
    zoom: scale * 1000 / w,
  });
}
export function fitRegion(region: AtlasRegion, width: number, height: number, selected = false): Camera {
  return fitBounds(region.focusBounds ?? region.bounds, width, height, mapInsets(width, selected));
}
const cache = new Map<string, Promise<AtlasRegion[]>>();
export function loadAtlas(countryCode?: string): Promise<AtlasRegion[]> {
  if (countryCode && !/^[A-Z0-9_-]{2,3}$/.test(countryCode)) return Promise.reject(new Error("地区编码无效"));
  const file = countryCode ? `provinces/${countryCode}.json` : "countries.json";
  const cached = cache.get(file);
  if (cached) return cached;
  const request = fetch(`${import.meta.env.BASE_URL}maps/${file}?v=20261014-mobile`, { signal: AbortSignal.timeout(15000) }).then(async response => {
    if (!response.ok) throw new Error("地图文件暂时无法读取，请重试");
    const value: unknown = await response.json();
    if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "object" && item !== null &&
      "id" in item && typeof item.id === "string" && "name" in item && typeof item.name === "string" &&
      "d" in item && typeof item.d === "string" && "bounds" in item && Array.isArray(item.bounds) && item.bounds.length === 4 && item.bounds.every(Number.isFinite) &&
      (!("focusBounds" in item) || (Array.isArray(item.focusBounds) && item.focusBounds.length === 4 && item.focusBounds.every(Number.isFinite))) &&
      "center" in item && Array.isArray(item.center) && item.center.length === 2 && item.center.every(Number.isFinite))) throw new Error("地图文件格式异常");
    return value as AtlasRegion[];
  }).catch((error: unknown) => { cache.delete(file); throw error; });
  cache.set(file, request);
  return request;
}
