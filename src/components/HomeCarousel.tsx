import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Mountain,
  Pause,
  Play,
} from "lucide-react";
import { imageSource, type HomeContent } from "../services/home-content-model";
import "./home-carousel.css";
export default function HomeCarousel({
  content,
  preview = false,
}: {
  content: HomeContent;
  preview?: boolean;
}) {
  const slides = useMemo(
    () => content.slides.filter((s) => s.enabled),
    [content.slides],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const current = index % Math.max(slides.length, 1);
  const running =
    content.autoplay &&
    !preview &&
    !paused &&
    !hover &&
    !focused &&
    !hidden &&
    !reduced &&
    slides.length > 1;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % slides.length),
      content.intervalSec * 1000,
    );
    return () => clearTimeout(timer);
  }, [running, current, content.intervalSec, slides.length]);
  const move = (step: number) =>
    setIndex((current + step + slides.length) % slides.length);
  if (!slides.length)
    return <div className="carousel-empty">至少启用一张图片后预览</div>;
  const slide = slides[current];
  return (
    <figure
      className="home-landscape home-carousel"
      role="region"
      aria-roledescription="轮播"
      aria-label="首页风景轮播"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        }
      }}
    >
      <img
        key={slide.id + slide.image}
        src={imageSource(slide.image)}
        alt={slide.alt}
        fetchPriority={current === 0 ? "high" : "auto"}
        onError={(e) => {
          if (e.currentTarget.dataset.fallback) return;
          e.currentTarget.dataset.fallback = "true";
          e.currentTarget.src = imageSource("images/moraine-lake.jpg");
        }}
      />
      <div className="landscape-topline">
        <span>
          <Mountain size={15} /> GUANG GUANG · 慢慢看世界
        </span>
        <span>
          {String(current + 1).padStart(2, "0")} /{" "}
          {String(slides.length).padStart(2, "0")}
        </span>
      </div>
      <div aria-live={running ? "off" : "polite"} aria-atomic="true">
        <div className="landscape-note">
          <span className="landscape-note-icon">
            <MapPin size={19} />
          </span>
          <div>
            <strong>{slide.title}</strong>
            <span>{slide.subtitle}</span>
          </div>
        </div>
        <figcaption>{slide.caption}</figcaption>
      </div>
      {slides.length > 1 && (
        <div className="carousel-controls">
          <button
            type="button"
            aria-label="上一张风景"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={19} />
          </button>
          <div className="carousel-dots">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`查看第 ${i + 1} 张风景`}
                aria-current={i === current ? "true" : undefined}
                onClick={() => setIndex(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button type="button" aria-label="下一张风景" onClick={() => move(1)}>
            <ChevronRight size={19} />
          </button>
          {content.autoplay && !preview && !reduced && (
            <button
              type="button"
              aria-label={paused ? "继续自动播放" : "暂停自动播放"}
              aria-pressed={paused}
              onClick={() => {
                if (paused) {
                  setFocused(false);
                  setHover(false);
                }
                setPaused((p) => !p);
              }}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
        </div>
      )}
    </figure>
  );
}

