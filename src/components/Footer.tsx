
import { Link } from "react-router-dom";

export default function Footer() {
  return <footer className="app-footer"><div className="page-width footer-inner"><span><img src={`${import.meta.env.BASE_URL}images/guangguang-mark.svg`} width="22" height="22" alt="" /> 逛逛 <small>把路过的风景，留在地图上。</small></span><Link to="/map">去看看我的足迹 <span aria-hidden="true">↗</span></Link></div></footer>;
}
