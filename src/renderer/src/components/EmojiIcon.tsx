/**
 * The template icons rendered from Apple's emoji artwork (bundled PNGs from
 * `emoji-datasource-apple`), so they look the same on every platform instead
 * of falling back to Noto on Linux or Segoe on Windows. The database keeps
 * the plain emoji character; this map is a rendering concern only.
 */
import brain from 'emoji-datasource-apple/img/apple/64/1f9e0.png'
import laptop from 'emoji-datasource-apple/img/apple/64/1f4bb.png'
import magnifier from 'emoji-datasource-apple/img/apple/64/1f50d.png'
import phone from 'emoji-datasource-apple/img/apple/64/1f4de.png'
import inbox from 'emoji-datasource-apple/img/apple/64/1f4e5.png'
import writing from 'emoji-datasource-apple/img/apple/64/270d-fe0f.png'
import books from 'emoji-datasource-apple/img/apple/64/1f4da.png'
import palette from 'emoji-datasource-apple/img/apple/64/1f3a8.png'
import testTube from 'emoji-datasource-apple/img/apple/64/1f9ea.png'
import tools from 'emoji-datasource-apple/img/apple/64/1f6e0-fe0f.png'
import runner from 'emoji-datasource-apple/img/apple/64/1f3c3.png'
import coffee from 'emoji-datasource-apple/img/apple/64/2615.png'
import memo from 'emoji-datasource-apple/img/apple/64/1f4dd.png'
import chart from 'emoji-datasource-apple/img/apple/64/1f4ca.png'
import speech from 'emoji-datasource-apple/img/apple/64/1f4ac.png'
import bug from 'emoji-datasource-apple/img/apple/64/1f41b.png'
import rocket from 'emoji-datasource-apple/img/apple/64/1f680.png'
import dart from 'emoji-datasource-apple/img/apple/64/1f3af.png'
import fire from 'emoji-datasource-apple/img/apple/64/1f525.png'
import bolt from 'emoji-datasource-apple/img/apple/64/26a1.png'
import lotus from 'emoji-datasource-apple/img/apple/64/1f9d8.png'
import headphones from 'emoji-datasource-apple/img/apple/64/1f3a7.png'
import zzz from 'emoji-datasource-apple/img/apple/64/1f4a4.png'
import poo from 'emoji-datasource-apple/img/apple/64/1f4a9.png'

const APPLE_EMOJI: Record<string, string> = {
  '🧠': brain,
  '💻': laptop,
  '🔍': magnifier,
  '📞': phone,
  '📥': inbox,
  '✍️': writing,
  '📚': books,
  '🎨': palette,
  '🧪': testTube,
  '🛠️': tools,
  '🏃': runner,
  '☕': coffee,
  '📝': memo,
  '📊': chart,
  '💬': speech,
  '🐛': bug,
  '🚀': rocket,
  '🎯': dart,
  '🔥': fire,
  '⚡': bolt,
  '🧘': lotus,
  '🎧': headphones,
  '💤': zzz,
  '💩': poo
}

export function EmojiIcon({
  icon,
  size = 18
}: {
  icon: string
  size?: number
}): React.JSX.Element {
  const src = APPLE_EMOJI[icon]
  // An icon outside the shortlist (older data) still renders, as plain text.
  if (!src) return <span style={{ fontSize: size - 2, lineHeight: 1 }}>{icon}</span>
  return <img src={src} width={size} height={size} alt="" draggable={false} />
}
