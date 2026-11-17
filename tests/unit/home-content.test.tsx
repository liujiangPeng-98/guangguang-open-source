// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import HomeCarousel from '../../src/components/HomeCarousel';
import {DEFAULT_HOME,parseHomeContent,validateHomeContent,isImageAddress} from '../../src/services/home-content-model';
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const config=()=>structuredClone(DEFAULT_HOME);
const caption=()=>screen.getByRole('img').getAttribute('alt');
describe('首页内容与轮播',()=>{
 it('内置内容有效且空云端配置回退',()=>{expect(validateHomeContent(DEFAULT_HOME)).toBeNull();expect(parseHomeContent({})).toEqual(DEFAULT_HOME);});
 it('禁止脚本、明文链接和带密码的图片地址',()=>{for(const url of ['javascript:alert(1)','http://example.com/a.jpg','https://a:b@example.com/a.jpg'])expect(isImageAddress(url)).toBe(false);});
 it('拒绝零张图、全部关闭、重复标识和超出播放间隔',()=>{const c=config();c.slides=[];expect(validateHomeContent(c)).toBeTruthy();c.slides=config().slides.map(s=>({...s,enabled:false}));expect(validateHomeContent(c)).toBeTruthy();c.slides=config().slides;c.slides[1].id=c.slides[0].id;expect(validateHomeContent(c)).toBeTruthy();c.slides=config().slides;c.intervalSec=2;expect(validateHomeContent(c)).toBeTruthy();});
 it('按时间播放并循环回第一张',()=>{render(<HomeCarousel content={config()}/>);expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);act(()=>vi.advanceTimersByTime(5000));expect(caption()).toBe(DEFAULT_HOME.slides[1].alt);act(()=>vi.advanceTimersByTime(5000));act(()=>vi.advanceTimersByTime(5000));expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);});
 it('暂停后不切图，恢复后继续',()=>{render(<HomeCarousel content={config()}/>);fireEvent.click(screen.getByRole('button',{name:'暂停自动播放'}));act(()=>vi.advanceTimersByTime(10000));expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);fireEvent.click(screen.getByRole('button',{name:'继续自动播放'}));act(()=>vi.advanceTimersByTime(5000));expect(caption()).toBe(DEFAULT_HOME.slides[1].alt);});
 it('支持手动上一张和指示器，隐藏关闭图片',()=>{const c=config();c.slides[1].enabled=false;render(<HomeCarousel content={c}/>);fireEvent.click(screen.getByRole('button',{name:'上一张风景'}));expect(caption()).toBe(c.slides[2].alt);fireEvent.click(screen.getByRole('button',{name:'查看第 1 张风景'}));expect(caption()).toBe(c.slides[0].alt);expect(screen.queryByRole('button',{name:'查看第 3 张风景'})).toBeNull();});
 it('键盘焦点和后台页面暂停播放',()=>{render(<HomeCarousel content={config()}/>);fireEvent.focus(screen.getByRole('button',{name:'下一张风景'}));act(()=>vi.advanceTimersByTime(5000));expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);fireEvent.blur(screen.getByRole('button',{name:'下一张风景'}));Object.defineProperty(document,'hidden',{configurable:true,value:true});fireEvent(document,new Event('visibilitychange'));act(()=>vi.advanceTimersByTime(5000));expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);});
 it('单张和预览模式不自动播放',()=>{const c=config();c.slides=c.slides.slice(0,1);const view=render(<HomeCarousel content={c}/>);expect(screen.queryByRole('button',{name:'下一张风景'})).toBeNull();view.rerender(<HomeCarousel content={config()} preview/>);act(()=>vi.advanceTimersByTime(10000));expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);});
 it('图片失败回退且不反复加载',()=>{render(<HomeCarousel content={config()}/>);const img=screen.getByRole('img');fireEvent.error(img);expect(img.getAttribute('src')).toContain('moraine-lake.jpg');fireEvent.error(img);expect(img.getAttribute('src')).toContain('moraine-lake.jpg');});
});

describe('轮播恢复播放回归', () => {
 it('按钮保留焦点时，显式继续播放仍会切换', () => {
  render(<HomeCarousel content={config()}/>);
  const pause=screen.getByRole('button',{name:'暂停自动播放'});
  fireEvent.focus(pause); fireEvent.click(pause);
  act(()=>vi.advanceTimersByTime(10000));
  expect(caption()).toBe(DEFAULT_HOME.slides[0].alt);
  fireEvent.click(screen.getByRole('button',{name:'继续自动播放'}));
  act(()=>vi.advanceTimersByTime(5000));
  expect(caption()).toBe(DEFAULT_HOME.slides[1].alt);
 });
});
