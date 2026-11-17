import { useEffect, useRef, useState } from "react";
import { loadAtlas } from "../../maps/atlas";
import type { AtlasRegion } from "../../maps/atlas";

interface Props { initialCountry: string; initialRegion: string; onSelect: (region?: AtlasRegion) => void }
export default function RegionPicker({ initialCountry, initialRegion, onSelect }: Props) {
  const [countries, setCountries] = useState<AtlasRegion[]>([]);
  const [country, setCountry] = useState(initialCountry);
  const [regions, setRegions] = useState<AtlasRegion[]>([]);
  const [selected, setSelected] = useState(initialRegion);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const callback = useRef(onSelect);
  useEffect(() => { callback.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let active = true;
    void loadAtlas().then(data => { if (active) setCountries([...data].sort((a,b) => a.id === "CN" ? -1 : b.id === "CN" ? 1 : a.name.localeCompare(b.name, "zh"))); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "地区读取失败"); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!country) return;
    let active = true;
    void loadAtlas(country).then(data => { if (active) { setRegions(data); setError(""); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "地区读取失败"); });
    return () => { active = false; };
  }, [country, attempt]);
  useEffect(() => { callback.current(regions.find(region => region.id === selected)); }, [regions, selected]);
  return <section className="rounded-xl border border-[#dce5d8] bg-[#f7f9f4] p-4" aria-label="地图地区">
    <p className="text-sm font-medium text-[#20332b]">把风景放到地图上</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-gray-600">国家 / 地区<select aria-label="记录所在国家或地区" className="mt-1.5 min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm" value={country} onChange={event => { setCountry(event.target.value); setRegions([]); setSelected(""); }}><option value="">请选择（可选）</option>{countries.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
      <label className="text-xs text-gray-600">省 / 州<select aria-label="记录所在省级地区" disabled={!country || !regions.length} className="mt-1.5 min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm disabled:opacity-50" value={selected} onChange={event => setSelected(event.target.value)}><option value="">请选择省级地区</option>{regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-gray-500">选择后，照片会标在该地区的代表位置，仅表示省级足迹。也可在下方补充具体坐标。</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>重新加载</button></p>}
  </section>;
}
