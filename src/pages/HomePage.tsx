import { useEffect, useState } from "react";
import HomeCarousel from "../components/HomeCarousel";
import { getHomeContent } from "../services/home-content";
import { DEFAULT_HOME } from "../services/home-content-model";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Compass,
  NotebookPen,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { status } = useAuth();
  const [content, setContent] = useState(DEFAULT_HOME);
  useEffect(() => {
    let active = true;
    void getHomeContent()
      .then((value) => {
        if (active) setContent(value);
      })
      .catch(() => {
        console.warn("首页配置暂时不可用，显示内置内容");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="home-page">
      <section className="home-hero page-width" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="eyebrow">
            <span className="live-dot" /> {content.hero.eyebrow}
          </p>
          <h1 id="home-title">
            {content.hero.titleLine1}
            <span>{content.hero.titleAccent}</span>
            <br />
            {content.hero.titleLine2}
          </h1>
          <p className="home-description">
            <span className="home-slogan">{content.hero.slogan}</span>
            <br />
            {content.hero.description}
          </p>
          <div className="home-cta">
            <Link
              className="btn btn-primary"
              to={status === "authenticated" ? "/map" : "/login?redirect=/map"}
            >
              展开我的足迹 <ArrowUpRight size={18} />
            </Link>
            <Link className="btn btn-text" to="/checkin/new">
              <Camera size={18} /> 记下这一刻
            </Link>
          </div>
          <a
            className="home-scroll"
            href="#how-it-works"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
            }}
          >
            <span>
              <ArrowDown size={16} />
            </span>{" "}
            一张地图，慢慢装下你的世界
          </a>
        </div>
        <HomeCarousel content={content} />
      </section>
      <section
        id="how-it-works"
        className="home-journey page-width"
        aria-labelledby="journey-title"
      >
        <div className="journey-heading">
          <p className="eyebrow">WANDER. NOTICE. REMEMBER.</p>
          <h2 id="journey-title">
            不必走很远，
            <br />
            也能遇见好风景。
          </h2>
          <p>楼下的树、路边的晚霞，都可以是逛逛的起点。</p>
        </div>
        <div className="journey-links">
          <Link to="/checkin/new">
            <span className="journey-number">01</span>
            <Camera />
            <div>
              <h3>记下这一刻</h3>
              <p>留一张照片，写几句心情，记住此刻的自己。</p>
            </div>
            <ArrowUpRight className="journey-arrow" />
          </Link>
          <Link to="/map">
            <span className="journey-number">02</span>
            <Compass />
            <div>
              <h3>看看我的足迹</h3>
              <p>照片落在地图上，走过的地方逐渐连成回忆。</p>
            </div>
            <ArrowUpRight className="journey-arrow" />
          </Link>
          <Link to="/checkin">
            <span className="journey-number">03</span>
            <NotebookPen />
            <div>
              <h3>翻翻风景手记</h3>
              <p>翻开自己的风景册，找回当时的光和温度。</p>
            </div>
            <ArrowRight className="journey-arrow" />
          </Link>
        </div>
      </section>
    </div>
  );
}
