import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText, REVOKE_DELAY_MS } from './download';

describe('downloadText', () => {
  let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:fake');
    revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads the text through a temporary anchor', async () => {
    let clicked: { download: string; href: string } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      const anchor = document.querySelector<HTMLAnchorElement>('a[download]');
      clicked = anchor ? { download: anchor.download, href: anchor.href } : null;
    });

    expect(downloadText('notes.md', '# Hi')).toBe(true);

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/markdown;charset=utf-8');
    expect(await blob?.text()).toBe('# Hi');
    expect(clicked).toEqual({ download: 'notes.md', href: 'blob:fake' });
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revokes the URL and removes the anchor even when click throws', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(downloadText('notes.md', 'text', 'text/plain')).toBe(false);
    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('logs and returns false when the object URL cannot be created', () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('no blobs');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(downloadText('notes.md', 'text')).toBe(false);
    vi.runAllTimers();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
