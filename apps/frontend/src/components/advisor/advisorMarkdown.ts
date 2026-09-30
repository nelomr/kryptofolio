import MarkdownIt from 'markdown-it'

/**
 * A model answer is untrusted input. Raw HTML is never enabled, images are off (a remote image is
 * a request the user never approved), bare URLs are not auto-linked, and the only links that stay
 * clickable are routes inside this app. Anything else keeps its text and loses the anchor.
 */
const IN_APP_PATH = /^\/(?![/\\])[\w\-./?=&#%]*$/

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: true })
md.disable(['image'])

md.core.ruler.push('advisor_links', (state) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || block.children === null) continue
    const open: boolean[] = []
    for (const token of block.children) {
      if (token.type === 'link_open') {
        const rawHref = token.attrGet('href')
        const href = typeof rawHref === 'string' ? rawHref : ''
        const allowed = IN_APP_PATH.test(href)
        open.push(allowed)
        if (allowed) token.attrs = [['href', href]]
        else token.meta = { neutralized: true }
      } else if (token.type === 'link_close') {
        if (open.pop() === false) token.meta = { neutralized: true }
      }
    }
  }
  return true
})

function renderUnlessNeutralized(
  tokens: Parameters<typeof md.renderer.renderToken>[0],
  idx: number,
  options: Parameters<typeof md.renderer.renderToken>[2],
): string {
  if (tokens[idx].meta?.neutralized === true) return ''
  return md.renderer.renderToken(tokens, idx, options)
}

md.renderer.rules.link_open = (tokens, idx, options) => renderUnlessNeutralized(tokens, idx, options)
md.renderer.rules.link_close = (tokens, idx, options) => renderUnlessNeutralized(tokens, idx, options)

md.renderer.rules.code_inline = (tokens, idx) =>
  `<code class="font-mono tabular-nums">${md.utils.escapeHtml(tokens[idx].content)}</code>`

md.renderer.rules.fence = (tokens, idx) =>
  `<pre class="overflow-x-auto rounded-lg border border-border-soft p-3 font-mono text-xs"><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>\n`

export function renderAdvisorMarkdown(source: string): string {
  return md.render(source)
}
