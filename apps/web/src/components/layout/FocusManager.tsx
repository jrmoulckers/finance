import { type FC, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { announce, moveFocusTo } from '../../accessibility/aria';

export interface FocusManagerProps {
  targetSelector?: string;
  resolveTitle?: (pathname: string) => string | undefined;
}

export const FocusManager: FC<FocusManagerProps> = ({
  targetSelector = '#main-content', resolveTitle,
}) => {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      moveFocusTo(target);
      const title = resolveTitle?.(pathname) ?? document.title ?? 'Page loaded';
      announce(`Navigated to ${title}`);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [pathname, targetSelector, resolveTitle]);

  return null;
};