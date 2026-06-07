import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export const StemotionPageShell = forwardRef<HTMLDivElement, {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  screenLabel?: string;
} & HTMLAttributes<HTMLDivElement>>(function StemotionPageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  screenLabel,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-stemotion-page-shell
      data-screen-label={screenLabel ?? title}
      className={clsx('stemotion-page custom-scrollbar h-full overflow-y-auto px-4 py-4 text-[var(--stemotion-ink)] md:px-6 md:py-5', className)}
      {...props}
    >
      <div className={clsx('mx-auto flex w-full max-w-7xl flex-col gap-4', contentClassName)}>
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1 truncate text-2xl font-bold text-[var(--stemotion-ink)]">
              {title}
            </h1>
            {description && (
              <div className="mt-1 max-w-3xl text-sm leading-6 text-[var(--stemotion-muted)]">
                {description}
              </div>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
});

export function StemotionToolbar({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-stemotion-toolbar
      className={clsx('stemotion-panel rounded-lg p-3', className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function StemotionPanel({
  children,
  className,
  elevated = false,
  screenLabel,
  ...props
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  screenLabel?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-stemotion-panel
      data-screen-label={screenLabel}
      className={clsx(elevated ? 'stemotion-elevated' : 'stemotion-panel', 'rounded-lg', className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function StemotionMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <article
      data-stemotion-metric-card
      className={clsx('rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface)] p-4 shadow-sm', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-[var(--stemotion-muted)]">{label}</p>
        {Icon && <Icon size={18} className="text-[var(--stemotion-primary)]" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-3xl font-bold text-[var(--stemotion-ink)]">{value}</p>
      {detail && <p className="mt-1 text-xs text-[var(--stemotion-muted)]">{detail}</p>}
    </article>
  );
}

export function StemotionEmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-stemotion-empty-state
      className={clsx('rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 py-8 text-center', className)}
    >
      <p className="text-sm font-semibold text-[var(--stemotion-ink)]">{title}</p>
      {description && <div className="mt-2 text-xs leading-5 text-[var(--stemotion-muted)]">{description}</div>}
    </div>
  );
}

export function StemotionFilterPill({
  active,
  className,
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-stemotion-filter-pill
      aria-pressed={active}
      className={clsx(
        'stemotion-pressable inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition',
        active
          ? 'border-teal-300 bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)] shadow-sm'
          : 'border-[var(--stemotion-border)] bg-white text-[var(--stemotion-muted)] hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]',
        className,
      )}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
