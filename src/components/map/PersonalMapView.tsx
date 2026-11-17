import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronDown, ChevronUp, List, MapPin, Plus, RefreshCw, Search, X } from "lucide-react";
import type { CheckinRecord } from "../../types/checkin";
import { detailPath, toMapPoint } from "../../maps/model";
import PhotoMap from "./PhotoMap";
import RecordPhoto from "./RecordPhoto";
import "./personal-map.css";
import "./map-layout.css";

interface Props {
  records: CheckinRecord[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}

export default function PersonalMapView({ records, loading, error, onRefresh }: Props) {
  const [region, setRegion] = useState("");
  const [selected, setSelected] = useState<CheckinRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const regions = useMemo(() => [...new Set(records.map(record => record.location.adminArea?.trim()).filter(Boolean))].sort(), [records]);
  const activeRegion = regions.includes(region) ? region : "";
  const filtered = useMemo(() => records.filter(record => (!activeRegion || record.location.adminArea?.trim() === activeRegion) && [record.title, record.location.name, record.description].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [records, activeRegion, query]);
  const points = useMemo(() => filtered.map(toMapPoint).filter(point => point !== null), [filtered]);
  const photoCount = filtered.reduce((count, record) => count + record.photos.length, 0);
  const unavailable = loading || Boolean(error);

  useEffect(() => {
    if (selected.length) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);

  return (
    <div className="personal-map-page">
      <header className="photo-map-heading"><div><span className="photo-map-eyebrow">YOUR PERSONAL ATLAS</span><h1>我的足迹</h1><p>每一张照片，都是你与世界相遇的坐标。</p></div><Link className="btn btn-primary" to="/checkin/new"><Plus size={17} />记下这一刻</Link></header>
      <PhotoMap points={points} onChooseGroup={group => setSelected(group.map(point => point.record))} />

      <section className={`photo-map-sheet${expanded ? "" : " is-collapsed"}`} aria-label="我的足迹">
        <button className="photo-map-sheet-toggle" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="footprint-panel"><span className="photo-map-handle" /><span>{expanded ? "收起足迹面板" : "展开足迹面板"}</span>{expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
        <div className="photo-map-sheet-heading">
          <h2>走过的风景</h2>
          <div className="photo-map-actions">
            <button className="photo-map-action" type="button" onClick={onRefresh} disabled={loading} aria-label="刷新风景记录">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
            </button>
            <Link className="photo-map-action" to="/checkin"><List size={16} /> 列表</Link>
          </div>
        </div>
        <div id="footprint-panel" className="photo-map-panel-content">
        <dl className="photo-map-stats">
          <div><dt>风景记录</dt><dd>{unavailable ? "—" : filtered.length}<small>条</small></dd></div>
          <div><dt>已标记坐标</dt><dd>{unavailable ? "—" : points.length}<small>条</small></dd></div>
          <div><dt>风景照片</dt><dd>{unavailable ? "—" : photoCount}<small>张</small></dd></div>
        </dl>
        <div className="search-field photo-map-search"><Search size={16} aria-hidden="true" /><input aria-label="搜索地图中的风景" placeholder="寻找一处去过的风景" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(20); }} />{query && <button className="icon-button" type="button" aria-label="清空地图搜索" onClick={() => setQuery("")}><X size={15} /></button>}</div>
        <div className="photo-map-filter-row">
          <label><MapPin size={16} aria-hidden="true" /><span className="sr-only">按地区筛选记录</span>
            <select value={activeRegion} onChange={event => { setRegion(event.target.value); setVisibleCount(20); }} disabled={unavailable}>
              <option value="">全部地区</option>
              {regions.map(area => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
          <Link className="photo-map-new" to="/checkin/new"><Plus size={18} /> 记下这一刻</Link>
        </div>
        {loading ? (
          <p className="photo-map-notice" role="status">正在读取你的风景记录…</p>
        ) : error ? (
          <div className="photo-map-notice photo-map-error" role="alert">
            <p>{error}</p><button className="photo-map-action" type="button" onClick={onRefresh}>重试读取记录</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="photo-map-empty"><Camera size={28} aria-hidden="true" />
            <h3>{query ? "没有找到这处风景" : activeRegion ? "这个地区还没有记录" : "从身边的第一处风景开始"}</h3>
            <p>{query ? "换个关键词试试，或清空搜索查看全部记录。" : activeRegion ? "切换地区，或记录一处新的风景。" : "选择省级地区并保存记录，第一张照片就会出现在地图上。"}</p>
          </div>
        ) : (
          <>
            {points.length < filtered.length && <p className="photo-map-notice">{filtered.length - points.length} 条记录缺少有效坐标，暂未标到地图；仍可从下方查看详情。</p>}
            <p className="photo-map-caption">每条记录展示第一张照片 · 照片叠层上的数字表示记录数</p>
            <ul className="photo-map-records" aria-label="地图中的风景记录">
              {filtered.slice(0, visibleCount).map(record => (
                <li key={record._id}><Link to={detailPath(record._id)}>
                  <div className="photo-map-record-cover"><RecordPhoto record={record} /></div>
                  <strong>{record.title || record.location.name}</strong>
                  <span>{record.checkinDate}{!toMapPoint(record) ? " · 缺少坐标" : ""}</span>
                </Link></li>
              ))}
            </ul>
            {visibleCount < filtered.length && <button className="photo-map-action" type="button" onClick={() => setVisibleCount(count => count + 20)}>显示更多记录</button>}
          </>
        )}
        </div>
      </section>

      <dialog ref={dialog} className="photo-map-dialog" onClose={() => setSelected([])}
        onClick={event => { if (event.target === event.currentTarget) setSelected([]); }} aria-labelledby="photo-map-dialog-title">
        <div className="photo-map-dialog-body">
          <div className="photo-map-sheet-heading"><h2 id="photo-map-dialog-title">此处的 {selected.length} 条记录</h2>
            <button type="button" className="photo-map-action" aria-label="关闭地点记录" onClick={() => setSelected([])}><X size={20} /></button>
          </div>
          <p className="photo-map-caption">选择一张照片，打开对应记录</p>
          <ul className="photo-map-group-records">
            {selected.map(record => <li key={record._id}><Link to={detailPath(record._id)}>
              <div className="photo-map-record-cover"><RecordPhoto record={record} /></div>
              <div><strong>{record.title || record.location.name}</strong><span>{record.location.name} · {record.checkinDate}</span></div>
            </Link></li>)}
          </ul>
        </div>
      </dialog>
    </div>
  );
}
