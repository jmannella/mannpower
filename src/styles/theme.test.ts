import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read from the project root rather than import.meta.url, which is not a file URL under the
// vmThreads pool this suite runs in.
const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8')

/**
 * jsdom does no layout, so this cannot measure a chart. It guards the one CSS rule whose
 * reintroduction silently blanks every chart in the app, which no rendering test would catch
 * either, since Recharts still draws the points and the axes into a zero width SVG.
 */
describe('chart width rules', () => {
  test('never clamps the Recharts wrapper or surface', () => {
    for (const selector of ['.recharts-wrapper', '.recharts-surface', '.recharts-legend-wrapper']) {
      const clamped = new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{[^}]*max-width`)
      expect(css).not.toMatch(clamped)
    }
  })

  test('still clamps the responsive container, which is what keeps the page from scrolling sideways', () => {
    expect(css).toMatch(/\.recharts-responsive-container[^{]*\{[^}]*max-width:\s*100%/)
  })

  test('keeps the horizontal overflow guard that the clamp was added to help', () => {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*clip/)
  })
})
