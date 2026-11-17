import type {} from "@amap/amap-jsapi-types";
import { load } from "@amap/amap-jsapi-loader";

declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let pending: Promise<typeof AMap> | undefined;

export async function loadAMap(): Promise<typeof AMap> {
  const key = (import.meta.env.VITE_AMAP_KEY as string | undefined)?.trim();
  if (!key || key.startsWith("replace_") || key.startsWith("your_")) {
    throw new Error("地图服务尚未配置，暂时无法显示地图。仍可从下方打开记录。");
  }
  const serviceHost = import.meta.env.DEV
    ? `${window.location.origin}/_AMapService`
    : (import.meta.env.VITE_AMAP_SERVICE_HOST as string | undefined)?.trim();
  if (!serviceHost) throw new Error("地图服务尚未配置，暂时无法显示地图。仍可从下方打开记录。");

  if (!pending) {
    window._AMapSecurityConfig = { serviceHost };
    pending = load({ key, version: "2.0" }) as Promise<typeof AMap>;
    // A transient load failure is retryable. An unresolved script load is
    // bounded by the view's timeout, so it cannot leave an endless spinner.
    pending = pending.catch((error: unknown) => { pending = undefined; throw error; });
  }
  return pending;
}
