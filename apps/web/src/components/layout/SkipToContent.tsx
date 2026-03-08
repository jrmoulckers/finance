import { type FC, type KeyboardEvent, useCallback } from 'react';
import { moveFocusTo } from '../../accessibility/aria';

export interface SkipToContentProps { targetId?: string; label?: string; }

export const SkipToContent: FC<SkipToContentProps> = ({
  targetId = 'main-content', label = 'Skip to main content',
}) => {
  const handleClick = useCallback(() => {
    const target = document.getElementById(targetId);
    moveFocusTo(target);
  }, [targetId]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
  }, [handleClick]);

  return (
    <a href={`#${targetId}`} className="skip-to-content"
      onClick={(e) => { e.preventDefault(); handleClick(); }}
      onKeyDown={handleKeyDown}>
      {label}
    </a>
  );
};