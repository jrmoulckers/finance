// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { Link } from 'react-router';

import './legal-links.css';

const LEGAL_LINKS = [
  { to: '/legal', label: 'Legal' },
  { to: '/legal/privacy', label: 'Privacy' },
  { to: '/legal/terms', label: 'Terms' },
  { to: '/legal/ccpa', label: 'CCPA' },
] as const;

interface LegalLinksProps {
  className?: string;
}

export const LegalLinks: FC<LegalLinksProps> = ({ className }) => (
  <nav className={['legal-links', className].filter(Boolean).join(' ')} aria-label="Legal links">
    {LEGAL_LINKS.map((link) => (
      <Link key={link.to} to={link.to} className="legal-links__link">
        {link.label}
      </Link>
    ))}
  </nav>
);

export default LegalLinks;
