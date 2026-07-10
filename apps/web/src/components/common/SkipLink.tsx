// SPDX-License-Identifier: BUSL-1.1

/**
 * SkipLink — canonical skip link (delegates to {@link SkipToContent}).
 *
 * Historically this component maintained its own inline-style + React-state
 * implementation, which diverged from `layout/SkipToContent` (the one actually
 * rendered by the shell). To keep a single source of truth for skip-link
 * behavior and styling (WCAG SC 2.4.1 Bypass Blocks), it now re-exports the
 * canonical component. The visually-hidden-until-focused behavior is provided
 * by the shared `.skip-link` CSS class (see styles/accessibility.css).
 *
 * @module components/common/SkipLink
 * References: issue #1341, #3600
 */

import { SkipToContent, type SkipToContentProps } from '../layout/SkipToContent';

export type SkipLinkProps = SkipToContentProps;

export const SkipLink = SkipToContent;

export default SkipLink;
