// SPDX-License-Identifier: BUSL-1.1

import { useId, type ReactNode } from 'react';

export interface DangerZoneProps {
  title?: ReactNode;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DangerZone({ title = 'Danger Zone', description, children, className }: DangerZoneProps) {
  const headingId = useId();
  const sectionClassName = ['page-section', 'danger-zone-section', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby={headingId} className={sectionClassName}>
      <div className="danger-zone">
        <div className="danger-zone__header">
          <h3 id={headingId} className="danger-zone__title">
            {title}
          </h3>
          <p className="danger-zone__description">{description}</p>
        </div>
        <div className="danger-zone__content">{children}</div>
      </div>
    </section>
  );
}

export default DangerZone;
