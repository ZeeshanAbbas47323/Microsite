import { ANNOUNCEMENT_ID, editableAttrs, SmartLink } from './links';
import type { RenderContext } from './types';

/**
 * Keyframes for n rotating messages: each one slides in, stays for its share of the cycle, then
 * slides out upwards. Built from numbers only (no merchant text), so inlining it is safe.
 */
function keyframes(n: number) {
  const share = 100 / n;
  const edge = Math.min(4, share / 6);
  const p = (v: number) => `${v.toFixed(2)}%`;
  return `@keyframes ms-ann-${n}{0%{opacity:0;transform:translateY(100%)}${p(edge)}{opacity:1;transform:none}${p(share - edge)}{opacity:1;transform:none}${p(share)}{opacity:0;transform:translateY(-100%)}100%{opacity:0;transform:translateY(-100%)}}`;
}

const BASE_CSS = `.ms-ann:hover .ms-ann-item{animation-play-state:paused}.ms-ann:focus-within .ms-ann-item{animation:none;opacity:0}.ms-ann .ms-ann-item:focus-within{opacity:1;transform:none}@media (prefers-reduced-motion:reduce){.ms-ann .ms-ann-item{animation:none!important;opacity:0}.ms-ann .ms-ann-item:first-child{opacity:1;transform:none}}`;

/**
 * The thin bar above the header. One message sits still; several rotate like a carousel (pure CSS,
 * so it works without client JavaScript), pausing on hover and staying still for reduced motion.
 */
export function AnnouncementBar({ ctx }: { ctx: RenderContext }) {
  const bar = ctx.config.announcement;
  const messages = bar.messages.filter((m) => m.text.trim() !== '');
  if (!bar.enabled || messages.length === 0) return null;
  const n = messages.length;
  const rotating = n > 1;

  return (
    <div
      role="region"
      aria-label="Announcements"
      className="ms-ann relative z-30 overflow-hidden text-center text-[13px] font-medium tracking-wide"
      style={{ backgroundColor: bar.backgroundColor, color: bar.textColor }}
      {...editableAttrs(ctx, ANNOUNCEMENT_ID, 'Announcement bar')}
    >
      {rotating ? <style>{BASE_CSS + keyframes(n)}</style> : null}
      <ul className="relative mx-auto h-9 max-w-6xl px-4">
        {messages.map((m, i) => (
          <li
            key={i}
            className={`ms-ann-item flex h-9 items-center justify-center ${rotating ? 'absolute inset-x-4 top-0 opacity-0' : ''}`}
            style={
              rotating
                ? {
                    animation: `ms-ann-${n} ${bar.speed * n}s ${bar.speed * i}s infinite both ease-in-out`,
                  }
                : undefined
            }
          >
            {m.link ? (
              <SmartLink
                ctx={ctx}
                href={m.link}
                className="truncate underline-offset-4 hover:underline"
              >
                {m.text}
              </SmartLink>
            ) : (
              <span className="truncate">{m.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
