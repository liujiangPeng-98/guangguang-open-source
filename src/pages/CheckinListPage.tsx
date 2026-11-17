import { Link } from "react-router-dom";
import { Camera, Plus, MapPin, Calendar, RefreshCw, Search, X, Map as MapIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listMyCheckins } from "../services/checkinService";
import type { CheckinRecord } from "../types/checkin";
import RecordPhoto from "../components/map/RecordPhoto";
import { detailPath } from "../maps/model";
import "../components/map/personal-map.css";

interface Result { ownerId: string; revision: number; records: CheckinRecord[]; error?: string }
const EMPTY: CheckinRecord[] = [];

export default function CheckinListPage() {
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const current = result?.ownerId === ownerId && result.revision === revision ? result : undefined;
  const records = current?.records ?? EMPTY;
  const loading = !current;
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    void listMyCheckins({ limit: 200 }).then(data => {
      if (!cancelled) setResult({ ownerId, revision, records: data.filter(record => record.authorId === ownerId) });
    }).catch((error: unknown) => {
      if (!cancelled) setResult({ ownerId, revision, records: [], error: error instanceof Error ? error.message : "加载失败，请稍后再试" });
    });
    return () => { cancelled = true; };
  }, [ownerId, revision]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return records.filter(record => [record.title, record.location.name, record.location.adminArea, record.location.locality, record.description].some(value => value?.toLocaleLowerCase().includes(keyword)))
      .sort((a, b) => sort === "oldest" ? a.checkinDate.localeCompare(b.checkinDate) : b.checkinDate.localeCompare(a.checkinDate));
  }, [records, query, sort]);
  return <div className="collection-page page-width">
    <header className="page-heading"><div><p className="eyebrow">MOMENTS TO KEEP</p><h1>风景手记</h1><p>把路上的片刻，收进自己的风景册。{!loading && !current?.error && ` · 已加载 ${records.length} 条`}</p></div>
      <div className="page-heading-actions"><Link to="/map" className="btn btn-secondary"><MapIcon size={17} />我的足迹</Link><button type="button" className="btn btn-secondary" onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label="刷新风景手记"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button><Link to="/checkin/new" className="btn btn-primary"><Plus size={17} />记下这一刻</Link></div>
    </header>
    <div className="collection-toolbar"><div className="search-field"><Search size={17} aria-hidden="true" /><input aria-label="搜索风景手记" placeholder="搜索地点、标题或心情" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="icon-button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={16} /></button>}</div><div className="collection-sort"><span aria-live="polite">{loading ? "正在读取记录…" : current?.error ? "记录暂不可用" : `${filtered.length} 条回忆`}</span><select aria-label="记录排序" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">最近记录优先</option><option value="oldest">最早记录优先</option></select></div></div>
    {loading ? <div className="collection-grid" role="status" aria-label="正在读取风景手记">{Array.from({ length: 6 }, (_, i) => <div className="journal-card animate-pulse" key={i}><div className="journal-card-cover" /><div className="h-4 w-2/3 m-4 rounded bg-gray-200" /><div className="h-3 w-1/2 m-4 rounded bg-gray-100" /></div>)}</div>
      : current?.error ? <div className="ui-notice" role="alert"><p>暂时无法展开你的风景册</p><p className="mt-2 text-xs break-words">{current.error}</p><button type="button" className="btn btn-secondary mt-4" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />重新加载</button></div>
      : !filtered.length ? <div className="empty-panel">{query ? <Search /> : <Camera />}<h2>{query ? "还没找到这段回忆" : "从身边的第一处风景开始"}</h2><p>{query ? "换一个地点或关键词试试，也可以清空搜索查看全部记录。" : "一次散步、一家小店，或一片远方的山海，都值得留在这里。"}</p>{query ? <button className="btn btn-secondary" onClick={() => setQuery("")}>查看全部记录</button> : <Link className="btn btn-primary" to="/checkin/new"><Plus size={16} />记下这一刻</Link>}</div>
      : <div className="collection-grid">{filtered.map(record => <Link key={record._id} to={detailPath(record._id)} className="journal-card"><div className="journal-card-cover"><RecordPhoto record={record} />{record.photos.length > 0 && <span className="photo-badge"><Camera size={12} />{record.photos.length}</span>}</div><div className="journal-card-content"><h2>{record.title || record.location.name}</h2><div className="journal-meta"><span><MapPin size={12} />{record.location.name}</span><span><Calendar size={12} />{record.checkinDate}</span></div>{record.description && <p>{record.description}</p>}</div></Link>)}</div>}
    {!loading && records.length === 200 && <p className="mt-6 text-xs text-gray-500">当前展示最近加载的 200 条记录，搜索与排序作用于这些记录。</p>}
  </div>;
}
