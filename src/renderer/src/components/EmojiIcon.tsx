/**
 * The template icons rendered from Apple's emoji artwork (bundled PNGs from
 * `emoji-datasource-apple`), so they look the same on every platform instead
 * of falling back to Noto on Linux or Segoe on Windows. The database keeps
 * the plain emoji character; this map is a rendering concern only.
 *
 * `?inline` on every import, so each picture is a data URI rather than a file
 * the bundler emits: a report written by hand carries its icons to the printer,
 * and the offscreen window that prints it can reach no asset of the renderer's.
 */
import brain from 'emoji-datasource-apple/img/apple/64/1f9e0.png?inline'
import laptop from 'emoji-datasource-apple/img/apple/64/1f4bb.png?inline'
import magnifier from 'emoji-datasource-apple/img/apple/64/1f50d.png?inline'
import phone from 'emoji-datasource-apple/img/apple/64/1f4de.png?inline'
import inbox from 'emoji-datasource-apple/img/apple/64/1f4e5.png?inline'
import writing from 'emoji-datasource-apple/img/apple/64/270d-fe0f.png?inline'
import books from 'emoji-datasource-apple/img/apple/64/1f4da.png?inline'
import palette from 'emoji-datasource-apple/img/apple/64/1f3a8.png?inline'
import testTube from 'emoji-datasource-apple/img/apple/64/1f9ea.png?inline'
import tools from 'emoji-datasource-apple/img/apple/64/1f6e0-fe0f.png?inline'
import runner from 'emoji-datasource-apple/img/apple/64/1f3c3.png?inline'
import coffee from 'emoji-datasource-apple/img/apple/64/2615.png?inline'
import memo from 'emoji-datasource-apple/img/apple/64/1f4dd.png?inline'
import chart from 'emoji-datasource-apple/img/apple/64/1f4ca.png?inline'
import speech from 'emoji-datasource-apple/img/apple/64/1f4ac.png?inline'
import bug from 'emoji-datasource-apple/img/apple/64/1f41b.png?inline'
import rocket from 'emoji-datasource-apple/img/apple/64/1f680.png?inline'
import dart from 'emoji-datasource-apple/img/apple/64/1f3af.png?inline'
import fire from 'emoji-datasource-apple/img/apple/64/1f525.png?inline'
import bolt from 'emoji-datasource-apple/img/apple/64/26a1.png?inline'
import lotus from 'emoji-datasource-apple/img/apple/64/1f9d8.png?inline'
import headphones from 'emoji-datasource-apple/img/apple/64/1f3a7.png?inline'
import zzz from 'emoji-datasource-apple/img/apple/64/1f4a4.png?inline'
import poo from 'emoji-datasource-apple/img/apple/64/1f4a9.png?inline'

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

/**
 * The shortlist offered by the pickers, in the order the artwork was declared:
 * one list, so an icon can never be offered without a picture behind it.
 * The macOS-flavoured set — work, calls, writing, rest — and the poo.
 */
export const ICONS: string[] = Object.keys(APPLE_EMOJI)

/**
 * The artwork behind an icon as a data URI, or `null` for an emoji the app does
 * not bundle. Vite inlines these PNGs (see `electron.vite.config.ts`), so the
 * picture can travel to a report printed by a window that has no assets of its
 * own — and this returns `null` rather than a path the printer cannot follow.
 */
export function emojiDataUri(icon: string): string | null {
  const src = APPLE_EMOJI[icon]
  return src !== undefined && src.startsWith('data:') ? src : null
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
