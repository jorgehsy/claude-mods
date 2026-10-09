// Genera docs/catalogo.html: cada skin en cada estado, en SVG (escritorio) y en
// cuartos de bloque (terminal, animado con el mismo cuadro a cuadro).
//   node scripts/catalogo.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { SKINS, svgOf, cellsOf, COLS, ROWS, type Mood } from '../hooks/skins.ts'

const MOODS: Array<[Mood, string]> = [
  ['work', 'trabajando'], ['wait', 'espera respuesta'], ['sleep', 'terminó'], ['dead', 'falló'],
]
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function termFrames(frames: ReturnType<typeof cellsOf>[]): string[] {
  return frames.map(words => {
    let html = ''
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3
        const ch = String.fromCharCode(words[i]!)
        const fg = words[i + 1]! === 0x01000000 ? 'transparent' : css(words[i + 1]!)
        const bg = words[i + 2]! === 0x01000000 ? 'transparent' : css(words[i + 2]!)
        html += `<span style="color:${fg};background:${bg}">${ch === ' ' ? '&nbsp;' : ch}</span>`
      }
      html += '<br>'
    }
    return html
  })
}

let rows = ''
const term: Record<string, { fps: number; frames: string[] }> = {}
for (const skin of Object.values(SKINS)) {
  rows += `<section><h2 style="color:${skin.accent}">${skin.role}<small> · ${skin.label}</small></h2><div class="grid">`
  for (const [mood, label] of MOODS) {
    const anim = skin.animate(mood)
    const id = `${skin.role}-${mood}`
    term[id] = { fps: anim.fps, frames: termFrames(anim.frames.map(cellsOf)) }
    rows += `<figure><div class="svg">${svgOf(anim, mood, 208)}</div><pre class="term" id="${id}"></pre><figcaption>${label}</figcaption></figure>`
  }
  rows += '</div></section>'
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Catálogo de skins</title>
<style>
body{background:#1b1b1a;color:#e8e6e1;font:14px/1.4 ui-sans-serif,system-ui;margin:24px}
h1{font-size:18px;margin:0 0 16px} h2{font-size:15px;margin:24px 0 8px;text-transform:capitalize}
h2 small{color:#8a8a8a;font-weight:400;text-transform:none}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
figure{margin:0;background:#242423;border:1px solid #3a3a38;border-radius:10px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:10px}
.svg{height:140px;display:flex;align-items:center}
.term{font:16px/1 Menlo,ui-monospace,monospace;margin:0;background:#111;padding:8px 10px;border-radius:6px;letter-spacing:0}
figcaption{color:#9a9a96;font-size:12px}
</style></head><body><h1>Catálogo de skins de Clawd · arriba la app, abajo la terminal</h1>${rows}
<script>
const T=${JSON.stringify(term)};
for (const [id,{fps,frames}] of Object.entries(T)){let i=0;const el=document.getElementById(id);const draw=()=>{el.innerHTML=frames[i++%frames.length]};draw();if(frames.length>1)setInterval(draw,1000/fps)}
</script></body></html>`

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
writeFileSync(new URL('../docs/catalogo.html', import.meta.url), html)
console.log('docs/catalogo.html', html.length, 'bytes')
