import type { HTMLAttributes, ReactNode } from 'react';

export interface OpenXiangdaAdminPageProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: ReactNode;
}

/** Semantic root for application pages inside the standard admin Shell. */
export function OpenXiangdaAdminPage({
  children,
  className,
  ...props
}: OpenXiangdaAdminPageProps) {
  const classes = ['oxa-admin-page', className].filter(Boolean).join(' ');
  return (
    <section {...props} className={classes}>
      {children}
    </section>
  );
}
