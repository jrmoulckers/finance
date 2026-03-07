import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon, title, description, action, className = '',
}) => {
  return (
    <section
      className={`empty-state ${className}`.trim()}
      role="status"
      aria-label={title}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
        padding: 'var(--spacing-10) var(--spacing-4)', gap: 'var(--spacing-4)',
      }}
    >
      {icon && (
        <div className="empty-state__icon" aria-hidden="true"
          style={{ width: '64px', height: '64px', color: 'var(--semantic-text-disabled)' }}>
          {icon}
        </div>
      )}
      <h2 className="empty-state__title" style={{
        fontSize: 'var(--type-scale-title-font-size)',
        fontWeight: 'var(--type-scale-title-font-weight)',
        color: 'var(--semantic-text-primary)',
      }}>{title}</h2>
      {description && (
        <p className="empty-state__description" style={{
          fontSize: 'var(--type-scale-body-font-size)',
          color: 'var(--semantic-text-secondary)', maxWidth: '360px',
        }}>{description}</p>
      )}
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  );
};

export default EmptyState;
