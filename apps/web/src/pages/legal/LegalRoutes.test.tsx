// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LegalLinks } from '../../components/legal/LegalLinks';
import { AppRoutes } from '../../routes';

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('legal routes', () => {
  it.each([
    ['/legal', 'Legal'],
    ['/legal/privacy', 'Privacy Policy'],
    ['/legal/terms', 'Terms of Service'],
    ['/legal/ccpa', 'California Privacy Notice'],
  ])('mounts %s before auth', async (path, heading) => {
    renderRoute(path);

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('DRAFT — pending legal review by jrmoulckers')).toBeInTheDocument();
  });

  it('renders links from the legal index to each hosted document', async () => {
    renderRoute('/legal');

    await screen.findByRole('heading', { name: 'Legal', level: 1 });
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(screen.getByRole('link', { name: 'California Privacy Notice' })).toHaveAttribute(
      'href',
      '/legal/ccpa',
    );
  });
});

describe('LegalLinks', () => {
  it('renders footer links for the legal index and hosted legal documents', () => {
    render(<LegalLinks />);

    expect(screen.getByRole('navigation', { name: 'Legal links' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Legal' })).toHaveAttribute('href', '/legal');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/legal/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: 'CCPA' })).toHaveAttribute('href', '/legal/ccpa');
  });
});
