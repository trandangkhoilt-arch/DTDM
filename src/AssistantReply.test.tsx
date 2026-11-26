import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssistantReply } from './AssistantReply'

describe('AssistantReply', () => {
  it('formats a saved task reply for Vietnamese readers', () => {
    const html = renderToStaticMarkup(<AssistantReply content={[
      '**Báo cáo Cloudflare**',
      '',
      '- **Hạn:** 2026-12-01T10:00:00.000Z',
      '- **Độ ưu tiên**: HIGH',
      '- **Danh mục:** Học tập (id: f3c37101-aaa3-46ff-93d2-89edad0ec719)',
      '',
      '1. Lên dàn ý',
      '2. Rà soát nội dung',
    ].join('\n')} />)

    expect(html).toContain('<strong>Báo cáo Cloudflare</strong>')
    expect(html).toContain('17:00')
    expect(html).toContain('Cao')
    expect(html).toContain('<ol start="1"><li>Lên dàn ý</li><li>Rà soát nội dung</li></ol>')
    expect(html).not.toMatch(/f3c37101|\.000Z|HIGH/)
  })

  it('renders embedded HTML as text', () => {
    const html = renderToStaticMarkup(<AssistantReply content={'<img src=x onerror=alert(1)>'} />)
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })
})
