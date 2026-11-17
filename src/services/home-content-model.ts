export interface HeroCopy {
  eyebrow: string;
  titleLine1: string;
  titleAccent: string;
  titleLine2: string;
  slogan: string;
  description: string;
}
export interface HomeSlide {
  id: string;
  image: string;
  alt: string;
  title: string;
  subtitle: string;
  caption: string;
  enabled: boolean;
}
export interface HomeContent {
  hero: HeroCopy;
  slides: HomeSlide[];
  autoplay: boolean;
  intervalSec: number;
}
export const DEFAULT_HOME: HomeContent = {
  hero: {
    eyebrow: "逛逛 · 留一点时间，给风景",
    titleLine1: "出去",
    titleAccent: "逛逛，",
    titleLine2: "风景就在身边。",
    slogan: "把路过的风景，留在地图上。",
    description: "一张照片，几句心情。散步或远行，都值得记下。",
  },
  autoplay: true,
  intervalSec: 5,
  slides: [
    {
      id: "lake",
      image: "images/moraine-lake.jpg",
      alt: "晨光下的山峰、森林与碧绿湖水",
      title: "走慢一点，风景就在眼前",
      subtitle: "把此刻，留给以后的自己",
      caption: "风景灵感 · 加拿大，梦莲湖",
      enabled: true,
    },
    {
      id: "forest",
      image: "images/forest-walk.svg",
      alt: "阳光穿过树林的小径插画",
      title: "沿着树影，散一会儿步",
      subtitle: "不必走很远，也能遇见好风景",
      caption: "风景插画 · 林间漫步",
      enabled: true,
    },
    {
      id: "coast",
      image: "images/coastal-evening.svg",
      alt: "夕阳、海岸与远山的插画",
      title: "留一点时间，看看晚霞",
      subtitle: "今天路过的颜色，值得收藏",
      caption: "风景插画 · 海边日落",
      enabled: true,
    },
  ],
};
export const HERO_LABELS: Record<keyof HeroCopy, string> = {
  eyebrow: "标题上方短句",
  titleLine1: "主标题第一段",
  titleAccent: "主标题强调词",
  titleLine2: "主标题第二行",
  slogan: "副标题",
  description: "首页说明",
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function isImageAddress(value: string): boolean {
  if (/^images\/[a-zA-Z0-9_.-]+$/.test(value)) return true;
  if (value.length > 2000 || /[\s<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function validateHomeContent(value: unknown): string | null {
  if (!object(value) || !object(value.hero) || !Array.isArray(value.slides))
    return "展示配置格式无效";
  for (const key of Object.keys(HERO_LABELS))
    if (
      typeof value.hero[key] !== "string" ||
      !String(value.hero[key]).trim() ||
      String(value.hero[key]).length > 160
    )
      return "首页文案需为 1～160 字";
  if (
    typeof value.autoplay !== "boolean" ||
    !Number.isInteger(value.intervalSec) ||
    Number(value.intervalSec) < 3 ||
    Number(value.intervalSec) > 30
  )
    return "播放间隔需为 3～30 秒整数";
  if (value.slides.length < 1 || value.slides.length > 8)
    return "轮播需保留 1～8 张图片";
  const ids = new Set<string>();
  let active = 0;
  for (const slide of value.slides) {
    if (!object(slide) || typeof slide.enabled !== "boolean")
      return "轮播数据格式无效";
    for (const key of ["id", "image", "alt", "title", "subtitle", "caption"])
      if (
        typeof slide[key] !== "string" ||
        !String(slide[key]).trim() ||
        String(slide[key]).length > (key === "image" ? 2000 : 160)
      )
        return "每张轮播的图片、描述和配文均需填写（文字不超过 160 字）";
    if (!isImageAddress(String(slide.image)))
      return "图片需使用 HTTPS 地址或内置素材";
    if (ids.has(String(slide.id))) return "轮播标识不能重复";
    ids.add(String(slide.id));
    if (slide.enabled) active++;
  }
  return active ? null : "至少启用一张轮播图";
}
export function parseHomeContent(value: unknown): HomeContent {
  if (object(value) && Object.keys(value).length === 0)
    return structuredClone(DEFAULT_HOME);
  const error = validateHomeContent(value);
  if (error) throw new Error(error);
  return value as HomeContent;
}
export function imageSource(image: string): string {
  return image.startsWith("images/")
    ? `${import.meta.env.BASE_URL}${image}`
    : image;
}
