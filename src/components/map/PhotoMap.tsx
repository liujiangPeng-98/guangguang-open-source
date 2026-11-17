import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Globe2, LocateFixed, Minus, Plus, RefreshCw, MapPinned, X } from "lucide-react";
import { detailPath, groupPhotoPoints } from "../../maps/model";
import type { MapPoint, PhotoGroup } from "../../maps/model";
import { clampCamera, fitBounds, fitRegion, loadAtlas, mapInsets, MAX_ZOOM, PHOTO_ZOOM, projectPosition, WORLD_CAMERA } from "../../maps/atlas";
import type { AtlasRegion, Camera } from "../../maps/atlas";
import RecordPhoto from "./RecordPhoto";

interface Props { points: MapPoint[]; onChooseGroup: (points: PhotoGroup["points"]) => void }
export default function PhotoMap({ points, onChooseGroup }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 550 });
  const [camera, setCamera] = useState<Camera>(WORLD_CAMERA);
  const [countries, setCountries] = useState<AtlasRegion[]>([]);
  const [country, setCountry] = useState("");
  const [provinceState, setProvinceState] = useState<{ country: string; regions: AtlasRegion[] }>({ country: "", regions: [] });
  const [selection, setSelection] = useState<AtlasRegion>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const provinces = provinceState.country === country ? provinceState.regions : [];
  // Replace the coarse country shape once detailed provinces are ready. Keeping
  // both creates coastal slivers that have no province click/selection target.
  const visibleCountries = countries.filter(region => region.id !== country || provinces.length === 0);
  const focusedRegion = selection ?? countries.find(region => region.id === country);
  const viewWidth = 1000 / camera.zoom;
  const viewHeight = viewWidth * size.height / Math.max(size.width, 1);
  const left = camera.x - viewWidth / 2;
  const top = camera.y - viewHeight / 2;
  const countriesSorted = useMemo(() => [...countries].sort((a, b) => a.id === "CN" ? -1 : b.id === "CN" ? 1 : a.name.localeCompare(b.name, "zh")), [countries]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    void loadAtlas().then(data => { if (active) { setCountries(data); setError(""); } }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "地图读取失败"); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!country) return;
    let active = true;
    void loadAtlas(country).then(regions => { if (active) { setProvinceState({ country, regions }); setError(""); } }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "省级地图读取失败"); });
    return () => { active = false; };
  }, [country, attempt]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setCamera(value => clampCamera({ ...value, zoom: value.zoom * Math.exp(-event.deltaY * .008) }));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const project = (position: [number, number]) => {
    const [x, y] = projectPosition(position);
    return { x: (x - left) * size.width / viewWidth, y: (y - top) * size.height / viewHeight };
  };
  const groups = groupPhotoPoints(points, project).map(group => ({ group, pixel: project(group.position) }))
    .filter(({ pixel }) => pixel.x > -60 && pixel.x < size.width + 60 && pixel.y > -60 && pixel.y < size.height + 64);
  const selectCountry = (code: string) => {
    setCountry(code); setSelection(undefined); setError("");
    const region = countries.find(item => item.id === code);
    setCamera(region ? fitRegion(region, size.width, size.height) : WORLD_CAMERA);
  };
  const zoom = (factor: number) => setCamera(value => clampCamera({ ...value, zoom: value.zoom * factor }));
  const fitPhotos = () => {
    if (!points.length) { selectCountry(""); return; }
    setSelection(undefined);
    const positions = points.map(point => projectPosition(point.position));
    setCamera(fitBounds([Math.min(...positions.map(p => p[0])), Math.min(...positions.map(p => p[1])), Math.max(...positions.map(p => p[0])), Math.max(...positions.map(p => p[1]))], size.width, size.height, mapInsets(size.width, false), PHOTO_ZOOM));
    const codes = [...new Set(points.map(point => point.record.location.countryCode).filter(Boolean))];
    if (codes.length === 1 && countries.some(item => item.id === codes[0])) setCountry(codes[0] ?? "");
  };
  return <div ref={container} className="photo-map-stage atlas-stage">
    <svg className="photo-map-canvas atlas-canvas" viewBox={`${left} ${top} ${viewWidth} ${viewHeight}`} role="img" aria-label="简略世界地图，可选择国家和省级地区" tabIndex={0}
      onKeyDown={event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault(); const step = viewWidth * .1;
          setCamera(value => clampCamera({ ...value, x: value.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), y: value.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) }));
        } else if (event.key === "+" || event.key === "=") zoom(1.4); else if (event.key === "-") zoom(1 / 1.4); else if (event.key === "Home") selectCountry("");
      }}
      onPointerDown={event => { if (!pointers.current.size) { moved.current = false; pointerStart.current = { x: event.clientX, y: event.clientY }; } else moved.current = true; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }}
      onPointerMove={event => {
        const previous = pointers.current.get(event.pointerId); if (!previous) return;
        const oldPoints = [...pointers.current.values()];
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const deltaX = event.clientX - previous.x, deltaY = event.clientY - previous.y;
        if (Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 5) { moved.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
        if (oldPoints.length === 2) {
          const next = [...pointers.current.values()];
          const before = Math.hypot(oldPoints[0].x - oldPoints[1].x, oldPoints[0].y - oldPoints[1].y);
          const after = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
          if (before > 1) setCamera(value => clampCamera({ ...value, zoom: value.zoom * after / before }));
        } else setCamera(value => clampCamera({ ...value, x: value.x - deltaX * viewWidth / size.width, y: value.y - deltaY * viewHeight / size.height }));
      }}
      onPointerUp={event => { pointers.current.delete(event.pointerId); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointers.current.delete(event.pointerId); }}
      onPointerCancel={event => pointers.current.delete(event.pointerId)}>
      <g className="atlas-grid" aria-hidden="true">{[0, 250, 500, 750, 1000].map(x => <path key={`x${x}`} d={`M${x},0V500`} />)}{[83.33, 166.67, 250, 333.33, 416.67].map(y => <path key={`y${y}`} d={`M0,${y}H1000`} />)}</g>
      <g>{visibleCountries.map(region => <path key={region.id} data-region={region.id} d={region.d} className={`atlas-land${region.id === country ? " is-selected" : ""}`}
        onClick={() => { if (!moved.current) selectCountry(region.id); }}><title>{region.name}</title></path>)}</g>
      <g>{provinces.map(region => <path key={region.id} data-region={region.id} d={region.d} className={`atlas-province${selection?.id === region.id ? " is-selected" : ""}${points.some(point => point.record.location.adminArea === region.name && point.record.location.countryCode === region.countryCode) ? " is-visited" : ""}`}
        onClick={event => { event.stopPropagation(); if (!moved.current) { setSelection(region); setCamera(fitRegion(region, size.width, size.height, true)); } }}><title>{region.name}</title></path>)}</g>
      <g className="atlas-labels" aria-hidden="true">{(country ? provinces : countries).filter(region => {
        const width = (region.bounds[2] - region.bounds[0]) * size.width / viewWidth;
        return width > (country ? 50 : 80);
      }).map(region => { const [x, y] = projectPosition(region.center); return <text key={region.id} x={x} y={y} fontSize={11 * viewWidth / size.width} textAnchor="middle">{region.name}</text>; })}</g>
    </svg>
    <div className="atlas-toolbar">
      <button className="photo-map-action" type="button" onClick={() => selectCountry("")}><Globe2 size={16} /> 世界</button>
      <select aria-label="选择国家或地区" value={country} onChange={event => selectCountry(event.target.value)}><option value="">选择国家 / 地区</option>{countriesSorted.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select>
      {focusedRegion?.focusBounds && <button className="photo-map-action" type="button" onClick={() => setCamera(fitBounds(focusedRegion.bounds, size.width, size.height, mapInsets(size.width, !!selection)))}>查看全域</button>}
      {country && <select aria-label="选择省级地区" value={selection?.id ?? ""} onChange={event => { const region = provinces.find(item => item.id === event.target.value); setSelection(region); if (region) setCamera(fitRegion(region, size.width, size.height, true)); }}><option value="">{provinceState.country === country ? "选择省级地区" : "正在读取…"}</option>{provinces.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select>}
      <div className="atlas-legend" aria-label="地图状态图例">
        <span><i className="is-visited" aria-hidden="true" />已点亮</span>
        <span><i className="is-selected" aria-hidden="true" />已选择</span>
        <span><i className="is-hovered" aria-hidden="true" />悬浮预览</span>
      </div>
    </div>
    <div className="atlas-photos">{groups.map(({ group, pixel }) => <div className="atlas-photo-anchor" key={group.id} style={{ left: pixel.x, top: pixel.y }}>
      {group.points.length === 1 ? <Link className="photo-map-marker" to={detailPath(group.points[0].record._id)} aria-label={`查看${group.points[0].record.location.name}的风景记录`}><RecordPhoto record={group.points[0].record} /></Link>
        : <button className="photo-map-marker photo-map-marker-stack" type="button" aria-label={`查看此处的 ${group.points.length} 条记录`} onClick={() => onChooseGroup(group.points)}><RecordPhoto record={group.points[0].record} /><span className="photo-map-count">{group.points.length}</span></button>}
    </div>)}</div>
    {(!countries.length || error) && <div className="photo-map-status" role={error ? "alert" : "status"}><MapPinned size={28} /><p>{error || "正在展开世界地图…"}</p>{error && <button className="photo-map-action" onClick={() => { setError(""); setAttempt(value => value + 1); }}><RefreshCw size={16} />重新加载地图</button>}</div>}
    <div className="photo-map-tools" aria-label="地图操作"><button type="button" aria-label="查看全部足迹地点" title="查看全部地点" onClick={fitPhotos}><LocateFixed /></button><button type="button" aria-label="放大地图" disabled={camera.zoom >= MAX_ZOOM} onClick={() => zoom(1.5)}><Plus /></button><button type="button" aria-label="缩小地图" disabled={camera.zoom <= 1} onClick={() => zoom(1 / 1.5)}><Minus /></button></div>
    {selection && <div className="atlas-selection"><div><strong>{selection.name}</strong><span>把这里的风景留在地图上</span></div><Link className="btn btn-primary" to={`/checkin/new?country=${encodeURIComponent(country)}&region=${encodeURIComponent(selection.id)}`}><Plus size={15} />记下这一刻</Link><button type="button" className="icon-button" aria-label="取消地区选择" onClick={() => setSelection(undefined)}><X size={16} /></button></div>}
    <div className="atlas-frame" aria-hidden="true" />
    <div className="atlas-caption"><span>{camera.zoom >= MAX_ZOOM ? "已到最大放大倍率" : focusedRegion?.focusBounds ? "优先展示主要陆地 · 可查看全域" : "双指缩放 · 点击地区自动取景"}</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · 简略边界</a></div>
  </div>;
}
