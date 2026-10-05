// Fonts: canvas-html ships none. registerFont, fallback per script, missingGlyphs.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')
const here = path.dirname(fileURLToPath(import.meta.url))
const inter = fs.readFileSync(path.join(here, 'assets/Inter-Regular.otf'))

// characters no font has are reported; normal text is not
const m = new HtmlRenderer({ width: 300, height: 60, systemFonts: false })
m.registerFont(inter)
m.load('<p id="ok" style="font-family:Inter">Hello</p><p id="bad" style="font-family:Inter">x \u{F0123}\u{F0124} y \u{F0123}</p>')
const missing = m.missingGlyphs()
assert.equal(missing.length, 1, JSON.stringify(missing))
assert.equal(missing[0].element, 'bad')
assert.equal(missing[0].chars, '\u{F0123}\u{F0124}')
assert.equal(missing[0].count, 3)

// registerFont adds a font, and fallback picks it up for scripts the main font lacks
const t = new HtmlRenderer({ width: 300, height: 60, systemFonts: false })
t.registerFont(inter)
t.load('<p id="ta" style="font-family:Inter">வணக்கம்</p>')
assert.equal(t.missingGlyphs().length, 1, 'without a Tamil font the text is reported missing')
t.registerFont(fs.readFileSync(path.join(here, 'assets/noto/NotoSansTamil-Regular.ttf')))
t.load('<p id="ta" style="font-family:Inter">வணக்கம்</p>')
assert.deepEqual(t.missingGlyphs(), [], 'a registered Tamil font is used as fallback')
console.log('smoke-fonts: all passed')
