// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { Link } from 'react-router-dom';

import './legal.css';

const DRAFT_NOTICE = 'DRAFT — pending legal review by jrmoulckers';

type LegalDocumentId = 'privacy' | 'terms' | 'ccpa';

interface LegalDocument {
  title: string;
  updatedLabel: string;
  sections: ReadonlyArray<{
    heading: string;
    body: string;
  }>;
}

const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    updatedLabel: 'Placeholder draft for beta readiness',
    sections: [
      {
        heading: 'Purpose of this placeholder',
        body: 'This draft is placeholder boilerplate for a beta application and is not a final privacy policy. It should be replaced or approved by qualified legal counsel before production use.',
      },
      {
        heading: 'Information practices to confirm',
        body: 'The final policy should accurately describe what account, financial, device, usage, support, and diagnostic information the service collects, how it is used, and how long it is retained. Those facts are intentionally not asserted here.',
      },
      {
        heading: 'User choices to confirm',
        body: 'The final policy should describe any available export, deletion, consent, communication, cookie, analytics, and security controls after those details are reviewed.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updatedLabel: 'Placeholder draft for beta readiness',
    sections: [
      {
        heading: 'Purpose of this placeholder',
        body: 'This draft is placeholder boilerplate for beta access and is not a final agreement. It should be replaced or approved by qualified legal counsel before production use.',
      },
      {
        heading: 'Service terms to confirm',
        body: 'The final terms should accurately describe eligibility, account responsibilities, acceptable use, beta limitations, subscription or payment terms if any, support expectations, and termination rights. Those facts are intentionally not asserted here.',
      },
      {
        heading: 'Disclaimers to confirm',
        body: 'The final terms should include appropriate disclaimers, liability limits, dispute terms, governing law, and other clauses only after legal review.',
      },
    ],
  },
  ccpa: {
    title: 'California Privacy Notice',
    updatedLabel: 'Placeholder draft for beta readiness',
    sections: [
      {
        heading: 'Purpose of this placeholder',
        body: 'This draft is placeholder boilerplate for beta readiness and is not a final CCPA/CPRA notice. It should be replaced or approved by qualified legal counsel before production use.',
      },
      {
        heading: 'Disclosures to confirm',
        body: 'The final notice should accurately describe applicable categories of personal information, sources, purposes, sharing, selling, retention, and sensitive personal information practices. Those facts are intentionally not asserted here.',
      },
      {
        heading: 'Rights process to confirm',
        body: 'The final notice should describe any applicable access, deletion, correction, opt-out, limitation, appeal, and authorized-agent processes after those details are reviewed.',
      },
    ],
  },
};

const legalDocumentIds = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[];

const documentPath = (documentId: LegalDocumentId) => `/legal/${documentId}`;

const DraftNotice: FC = () => (
  <p className="legal-page__draft" role="note">
    {DRAFT_NOTICE}
  </p>
);

export const LegalIndexPage: FC = () => (
  <main className="legal-page" aria-labelledby="legal-index-title">
    <DraftNotice />
    <div className="legal-page__card">
      <h1 id="legal-index-title">Legal</h1>
      <p className="legal-page__lede">
        Hosted legal placeholders for beta readiness. These pages are draft boilerplate only and do
        not state final legal, privacy, data, or compliance facts.
      </p>
      <ul className="legal-page__index-list" aria-label="Legal documents">
        {legalDocumentIds.map((documentId) => (
          <li key={documentId}>
            <Link to={documentPath(documentId)}>{LEGAL_DOCUMENTS[documentId].title}</Link>
          </li>
        ))}
      </ul>
    </div>
  </main>
);

interface LegalDocumentPageProps {
  documentId: LegalDocumentId;
}

export const LegalDocumentPage: FC<LegalDocumentPageProps> = ({ documentId }) => {
  const document = LEGAL_DOCUMENTS[documentId];

  return (
    <main className="legal-page" aria-labelledby={`${documentId}-legal-title`}>
      <DraftNotice />
      <article className="legal-page__card">
        <Link to="/legal" className="legal-page__back-link">
          ← Legal index
        </Link>
        <h1 id={`${documentId}-legal-title`}>{document.title}</h1>
        <p className="legal-page__updated">{document.updatedLabel}</p>
        {document.sections.map((section) => (
          <section key={section.heading} className="legal-page__section">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  );
};

export default LegalIndexPage;
