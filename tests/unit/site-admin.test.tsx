// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_HOME, type HomeContent } from '../../src/services/home-content-model';
import type { ContentEditorState } from '../../src/services/home-content';
const mock = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), upload: vi.fn() }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-admin' } }) }));
vi.mock('../../src/services/home-content', () => ({ getEditorContent: mock.load, saveHomeContent: mock.save, uploadSiteImage: mock.upload }));
import SiteAdminPage from '../../src/pages/SiteAdminPage';
const initial = (): ContentEditorState => ({ draft: structuredClone(DEFAULT_HOME), published: structuredClone(DEFAULT_HOME), version: 7, publishedAt: null });
async function page() {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SiteAdminPage /></MemoryRouter>);
  await screen.findByLabelText('副标题');
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const edit = () => fireEvent.change(screen.getByLabelText('副标题'), { target: { value: '测试草稿，不应直接上线' } });
beforeEach(() => {
  vi.resetAllMocks();
  mock.load.mockResolvedValue(initial());
  mock.save.mockImplementation(async (content: HomeContent, version: number, publish: boolean) => ({
    draft: structuredClone(content), published: publish ? structuredClone(content) : structuredClone(DEFAULT_HOME), version: version + 1, publishedAt: publish ? new Date().toISOString() : null,
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('首页管理操作', () => {
  it('无权限时不给出编辑表单', async () => {
    mock.load.mockRejectedValue(new Error('无管理权限'));
    render(<MemoryRouter><SiteAdminPage /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toBe('无管理权限');
    expect(screen.queryByLabelText('副标题')).toBeNull();
  });
  it('保存草稿与发布分开执行，并采用服务器返回的新版本号', async () => {
    await page(); edit(); click('保存草稿');
    await screen.findByText('草稿已保存，首页展示保持不变。');
    expect(mock.save).toHaveBeenLastCalledWith(expect.objectContaining({ hero: expect.objectContaining({ slogan: '测试草稿，不应直接上线' }) }), 7, false);
    expect(screen.getByRole('button', { name: '保存草稿' }).hasAttribute('disabled')).toBe(true);
    click('发布到首页');
    await screen.findByText('已发布，访客刷新首页即可看到更新。');
    expect(mock.save).toHaveBeenLastCalledWith(expect.any(Object), 8, true);
    expect(screen.getByText('实时预览 · 已与线上同步')).toBeTruthy();
  });
  it('版本冲突保留输入并允许处理后重试', async () => {
    mock.save.mockRejectedValue(new Error('版本冲突，请重新载入'));
    await page(); edit(); click('发布到首页');
    await screen.findByRole('alert');
    expect(screen.getByLabelText('副标题')).toHaveProperty('value', '测试草稿，不应直接上线');
    expect(screen.getByRole('button', { name: '发布到首页' }).hasAttribute('disabled')).toBe(false);
  });
  it('保存进行中阻止重复提交和编辑', async () => {
    mock.save.mockReturnValue(new Promise(() => {}));
    await page(); edit(); click('保存草稿'); click('保存草稿');
    expect(mock.save).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('副标题').closest('fieldset')?.disabled).toBe(true);
  });
  it('全部素材关闭时禁止发布', async () => {
    await page(); screen.getAllByLabelText('启用').forEach(el => fireEvent.click(el)); click('发布到首页');
    await screen.findByRole('alert'); expect(mock.save).not.toHaveBeenCalled();
  });
  it('上传失败不丢失编辑内容，成功后仍需主动保存', async () => {
    mock.upload.mockRejectedValueOnce(new Error('图片上传失败')).mockResolvedValueOnce('https://example.com/new.jpg');
    await page(); edit();
    const input = screen.getByLabelText('上传第 1 张图片');
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('副标题')).toHaveProperty('value', '测试草稿，不应直接上线');
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('图片已上传，请保存草稿或发布。');
    expect(screen.getAllByLabelText('图片地址')[0]).toHaveProperty('value', 'https://example.com/new.jpg');
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('取消重新载入会保留未保存内容，排序也写入草稿', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await page(); edit(); click('重新载入');
    expect(confirm).toHaveBeenCalledOnce(); expect(mock.load).toHaveBeenCalledOnce();
    click('下移第 1 张'); click('保存草稿');
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].slides.map((s: {id: string}) => s.id)).toEqual(['forest', 'lake', 'coast']);
  });
});
