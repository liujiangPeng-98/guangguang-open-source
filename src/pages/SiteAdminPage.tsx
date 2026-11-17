import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  ImagePlus,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import HomeCarousel from "../components/HomeCarousel";
import { useAuth } from "../context/AuthContext";
import {
  getEditorContent,
  saveHomeContent,
  uploadSiteImage,
  type ContentEditorState,
} from "../services/home-content";
import {
  DEFAULT_HOME,
  HERO_LABELS,
  imageSource,
  validateHomeContent,
  type HomeContent,
  type HomeSlide,
  type HeroCopy,
} from "../services/home-content-model";
import "./site-admin.css";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "操作未完成，请重试";
export default function SiteAdminPage() {
  const { user } = useAuth();
  const [state, setState] = useState<ContentEditorState | null>(null);
  const [draft, setDraft] = useState<HomeContent | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setState(null);
    setDraft(null);
    setError("");
    void getEditorContent()
      .then((value) => {
        if (active) {
          setState(value);
          setDraft(value.draft);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [user?.id, loadKey]);
  const dirty =
    !!state && !!draft && JSON.stringify(draft) !== JSON.stringify(state.draft);
  const unpublished =
    !!state &&
    !!draft &&
    JSON.stringify(draft) !== JSON.stringify(state.published);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  const change = (next: HomeContent) => {
    setDraft(next);
    setNotice("");
  };
  function slideChange(id: string, patch: Partial<HomeSlide>) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            slides: previous.slides.map((s) =>
              s.id === id ? { ...s, ...patch } : s,
            ),
          }
        : previous,
    );
    setNotice("");
  }
  function reorder(i: number, step: number) {
    if (!draft) return;
    const slides = [...draft.slides];
    [slides[i], slides[i + step]] = [slides[i + step], slides[i]];
    change({ ...draft, slides });
  }
  async function upload(id: string, file: File) {
    if (lock.current) return;
    lock.current = true;
    setBusy("上传图片");
    setError("");
    try {
      const url = await uploadSiteImage(file);
      slideChange(id, { image: url });
      setNotice("图片已上传，请保存草稿或发布。");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function save(publish: boolean) {
    if (!draft || !state || lock.current) return;
    const invalid = validateHomeContent(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    lock.current = true;
    setBusy(publish ? "发布" : "保存");
    setError("");
    setNotice("");
    try {
      const next = await saveHomeContent(draft, state.version, publish);
      setState(next);
      setDraft(next.draft);
      setNotice(
        publish
          ? "已发布，访客刷新首页即可看到更新。"
          : "草稿已保存，首页展示保持不变。",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  if (!state || !draft)
    return (
      <section className="page-width site-admin">
        <p className="eyebrow">逛逛 · 内容管理</p>
        <h1>首页展示管理</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <p>请使用管理员账号登录。此页面的编辑权限由云端验证。</p>
            <button
              className="btn btn-secondary"
              onClick={() => setLoadKey((k) => k + 1)}
            >
              重新载入
            </button>
            <Link className="btn btn-text" to="/">
              返回首页
            </Link>
          </>
        ) : (
          <p role="status">正在确认管理权限…</p>
        )}
      </section>
    );
  return (
    <section className="page-width site-admin">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">GUANG GUANG · 内容管理</p>
          <h1>把首页，布置成你喜欢的样子。</h1>
          <p>先编辑和预览，准备好后再发布给访客。</p>
        </div>
        <Link
          to="/"
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary"
        >
          <Eye size={17} />
          查看首页
        </Link>
      </header>
      <div className="admin-actions">
        <div>
          <strong>
            {dirty
              ? "有未保存的修改"
              : unpublished
                ? "草稿已保存，尚未发布"
                : "已与线上同步"}
          </strong>
          <small>
            版本 {state.version} ·{" "}
            {state.publishedAt
              ? `最近发布 ${new Date(state.publishedAt).toLocaleString("zh-CN")}`
              : "使用默认首页"}
          </small>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            disabled={!!busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("放弃未保存的修改，重新读取云端配置？")
              )
                setLoadKey((k) => k + 1);
            }}
          >
            重新载入
          </button>
          <button
            className="btn btn-secondary"
            disabled={!!busy || !dirty}
            onClick={() => void save(false)}
          >
            <Save size={16} />
            保存草稿
          </button>
          <button
            className="btn btn-primary"
            disabled={!!busy || (!dirty && !unpublished)}
            onClick={() => void save(true)}
          >
            <Send size={16} />
            {busy || "发布到首页"}
          </button>
        </div>
      </div>
      {error && (
        <p className="admin-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      <div className="admin-layout">
        <fieldset className="admin-fields" disabled={!!busy}>
          <section className="admin-section">
            <p className="eyebrow">01 / 首页文案</p>
            <h2>第一眼，想说些什么？</h2>
            {(Object.entries(HERO_LABELS) as [keyof HeroCopy, string][]).map(
              ([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={160}
                    value={draft.hero[key]}
                    onChange={(e) =>
                      change({
                        ...draft,
                        hero: { ...draft.hero, [key]: e.target.value },
                      })
                    }
                  />
                </label>
              ),
            )}
          </section>
          <section className="admin-section">
            <p className="eyebrow">02 / 轮播设置</p>
            <h2>让风景慢慢流动</h2>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={draft.autoplay}
                onChange={(e) =>
                  change({ ...draft, autoplay: e.target.checked })
                }
              />
              自动播放
            </label>
            <label>
              每张停留时间（秒）
              <input
                type="number"
                min={3}
                max={30}
                step={1}
                value={draft.intervalSec}
                onChange={(e) =>
                  change({ ...draft, intervalSec: Number(e.target.value) })
                }
              />
            </label>
            <p className="admin-help">
              支持 1～8
              张，至少启用一张。鼠标停留、键盘操作、切到后台或系统启用减少动态效果时会暂停。
            </p>
          </section>
          <section className="admin-section">
            <p className="eyebrow">03 / 风景素材</p>
            <h2>选择要展示的风景</h2>
            <p className="admin-help">
              此处上传的图片用于公开首页，请只上传适合公开的素材。个人打卡照片不会自动出现在这里。
            </p>
            {draft.slides.map((slide, i) => (
              <article className="admin-slide" key={slide.id}>
                <div className="admin-slide-head">
                  <strong>风景 {String(i + 1).padStart(2, "0")}</strong>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={slide.enabled}
                      onChange={(e) =>
                        slideChange(slide.id, { enabled: e.target.checked })
                      }
                    />
                    启用
                  </label>
                  <div>
                    <button
                      type="button"
                      aria-label={`上移第 ${i + 1} 张`}
                      disabled={i === 0}
                      onClick={() => reorder(i, -1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`下移第 ${i + 1} 张`}
                      disabled={i === draft.slides.length - 1}
                      onClick={() => reorder(i, 1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`移除第 ${i + 1} 张`}
                      disabled={draft.slides.length === 1}
                      onClick={() =>
                        change({
                          ...draft,
                          slides: draft.slides.filter((s) => s.id !== slide.id),
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <img
                  className="admin-thumbnail"
                  src={imageSource(slide.image)}
                  alt={slide.alt}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  onLoad={(e) => {
                    e.currentTarget.style.visibility = "visible";
                  }}
                />
                <label className="admin-upload">
                  <ImagePlus size={17} /> 上传或替换图片
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`上传第 ${i + 1} 张图片`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(slide.id, file);
                    }}
                  />
                </label>
                <small className="admin-help">
                  JPG / PNG / WEBP，每张不超过 5MB
                </small>
                <label>
                  图片地址
                  <input
                    value={slide.image}
                    maxLength={2000}
                    onChange={(e) =>
                      slideChange(slide.id, { image: e.target.value })
                    }
                  />
                </label>
                {(
                  [
                    ["alt", "图片描述（无障碍）"],
                    ["title", "卡片标题"],
                    ["subtitle", "卡片说明"],
                    ["caption", "地点或来源说明"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      maxLength={160}
                      value={slide[key]}
                      onChange={(e) =>
                        slideChange(slide.id, { [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </article>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={draft.slides.length >= 8}
              onClick={() =>
                change({
                  ...draft,
                  slides: [
                    ...draft.slides,
                    {
                      ...DEFAULT_HOME.slides[0],
                      id: crypto.randomUUID(),
                      title: "新的一处风景",
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              添加一张风景
            </button>
          </section>
        </fieldset>
        <aside className="admin-preview">
          <p className="eyebrow">实时预览 · {dirty ? "有未保存的修改" : unpublished ? "草稿尚未发布" : "已与线上同步"}</p>
          <p className="preview-eyebrow">{draft.hero.eyebrow}</p>
          <h2>
            {draft.hero.titleLine1}
            <span>{draft.hero.titleAccent}</span>
            <br />
            {draft.hero.titleLine2}
          </h2>
          <p>{draft.hero.slogan}</p>
          <p className="admin-help">{draft.hero.description}</p>
          <HomeCarousel content={draft} preview />
          <p className="admin-help">
            预览中可手动切换。发布后，首页按设置自动播放。
          </p>
        </aside>
      </div>
    </section>
  );
}

