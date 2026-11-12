import { pagePath } from './links';
import type { RenderContext } from './types';

function Logo({ ctx }: { ctx: RenderContext }) {
  const { business } = ctx.config;
  return (
    <ctx.Link
      href={ctx.href('/')}
      className="flex items-center gap-2 font-bold tracking-tight"
      aria-label={`${business.name} home`}
    >
      {business.logoUrl ? (
        <ctx.Image
          src={business.logoUrl}
          alt=""
          width={40}
          height={40}
          className="h-9 w-auto object-contain"
          priority
        />
      ) : null}
      <span className="text-lg">{business.name}</span>
    </ctx.Link>
  );
}

function NavLinks({ ctx, className }: { ctx: RenderContext; className: string }) {
  return (
    <ul className={className}>
      {ctx.config.pages.map((page) => {
        const path = pagePath(page.slug);
        const active =
          ctx.currentPath === path || (path !== '/' && ctx.currentPath.startsWith(`${path}/`));
        return (
          <li key={page.slug}>
            <ctx.Link
              href={ctx.href(path)}
              className={`rounded px-1 py-1 text-sm font-medium underline-offset-8 hover:underline ${active ? 'underline' : ''}`}
              {...(active ? { 'aria-current': 'page' as const } : {})}
            >
              {page.title}
            </ctx.Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Mobile menu without client JS: a native disclosure widget. */
function MobileMenu({ ctx, alwaysVisible }: { ctx: RenderContext; alwaysVisible: boolean }) {
  return (
    <details className={`group relative ${alwaysVisible ? '' : 'md:hidden'}`}>
      <summary
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[var(--ms-radius)] [&::-webkit-details-marker]:hidden"
        aria-label="Menu"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </summary>
      <div className="absolute end-0 z-30 mt-2 min-w-52 rounded-[var(--ms-radius)] bg-[var(--ms-nav-bg)] p-3 text-[var(--ms-nav-text)] shadow-xl ring-1 ring-black/10">
        <NavLinks ctx={ctx} className="flex flex-col gap-2" />
      </div>
    </details>
  );
}

export function Navbar({ ctx }: { ctx: RenderContext }) {
  const { navbar } = ctx.config;
  const cart = navbar.showCart ? ctx.cartSlot : null;
  const base = `${navbar.sticky ? 'sticky top-0' : 'relative'} z-20 bg-[var(--ms-nav-bg)] text-[var(--ms-nav-text)] border-b border-black/5`;
  const inner = 'mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6';

  if (navbar.style === 'centered') {
    return (
      <header className={base}>
        <div className={`${inner} justify-between md:flex-col md:gap-2`}>
          <div className="flex w-full items-center justify-between md:justify-center">
            <MobileMenu ctx={ctx} alwaysVisible={false} />
            <Logo ctx={ctx} />
            <div className="md:absolute md:end-6 md:top-4">{cart}</div>
          </div>
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks ctx={ctx} className="flex items-center gap-6" />
          </nav>
        </div>
      </header>
    );
  }

  if (navbar.style === 'split') {
    return (
      <header className={base}>
        <div className={`${inner} grid grid-cols-[1fr_auto_1fr]`}>
          <nav aria-label="Main" className="flex items-center">
            <MobileMenu ctx={ctx} alwaysVisible={false} />
            <NavLinks ctx={ctx} className="hidden items-center gap-6 md:flex" />
          </nav>
          <Logo ctx={ctx} />
          <div className="flex justify-end">{cart}</div>
        </div>
      </header>
    );
  }

  if (navbar.style === 'minimal') {
    return (
      <header className={base}>
        <div className={`${inner} justify-between`}>
          <Logo ctx={ctx} />
          <div className="flex items-center gap-2">
            {cart}
            <nav aria-label="Main">
              <MobileMenu ctx={ctx} alwaysVisible />
            </nav>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={base}>
      <div className={`${inner} justify-between`}>
        <Logo ctx={ctx} />
        <div className="flex items-center gap-4">
          <nav aria-label="Main">
            <NavLinks ctx={ctx} className="hidden items-center gap-6 md:flex" />
            <MobileMenu ctx={ctx} alwaysVisible={false} />
          </nav>
          {cart}
        </div>
      </div>
    </header>
  );
}
