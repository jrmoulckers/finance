// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildInviteUrl, getMemberDisplayName, truncateUserId } from './display-name';

describe('getMemberDisplayName', () => {
  it('prefers the member-stored displayName', () => {
    expect(
      getMemberDisplayName(
        { displayName: 'Jordan Smith', userId: 'c4580b09-aaaa-bbbb-cccc-dddddddddddd' },
        { name: 'Other Name', email: 'other@example.com' },
      ),
    ).toBe('Jordan Smith');
  });

  it('falls back to the profile name when displayName is missing', () => {
    expect(
      getMemberDisplayName(
        { displayName: null, userId: 'c4580b09-aaaa-bbbb-cccc-dddddddddddd' },
        { name: 'Jordan from Google', email: 'jordan@example.com' },
      ),
    ).toBe('Jordan from Google');
  });

  it('falls back to email when no displayName or profile name is available', () => {
    expect(
      getMemberDisplayName(
        { displayName: '   ', userId: 'c4580b09-aaaa-bbbb-cccc-dddddddddddd' },
        { name: null, email: 'jordan@example.com' },
      ),
    ).toBe('jordan@example.com');
  });

  it('falls back to a truncated user id when nothing else is available', () => {
    expect(
      getMemberDisplayName(
        { displayName: null, userId: 'c4580b09-aaaa-bbbb-cccc-dddddddddddd' },
        null,
      ),
    ).toBe('c4580b09…');
  });

  it('returns the friendly placeholder when no identifier exists at all', () => {
    expect(getMemberDisplayName({ displayName: null, userId: null })).toBe('Unknown member');
  });

  it('treats whitespace-only fields as missing', () => {
    expect(
      getMemberDisplayName({ displayName: '   ', userId: '   ' }, { name: '   ', email: '   ' }),
    ).toBe('Unknown member');
  });

  it('respects a custom placeholder', () => {
    expect(getMemberDisplayName({ displayName: null, userId: null }, null, 'Pending')).toBe(
      'Pending',
    );
  });
});

describe('truncateUserId', () => {
  it('truncates long UUIDs to the first 8 characters with an ellipsis', () => {
    expect(truncateUserId('c4580b09-aaaa-bbbb-cccc-dddddddddddd')).toBe('c4580b09…');
  });

  it('returns the value unchanged when shorter than the truncate length', () => {
    expect(truncateUserId('short')).toBe('short');
  });

  it('returns null for empty or whitespace input', () => {
    expect(truncateUserId('')).toBeNull();
    expect(truncateUserId('   ')).toBeNull();
    expect(truncateUserId(null)).toBeNull();
    expect(truncateUserId(undefined)).toBeNull();
  });

  it('respects a custom truncate length', () => {
    expect(truncateUserId('abcdef-1234', 4)).toBe('abcd…');
  });
});

describe('buildInviteUrl', () => {
  it('builds an invite URL from an explicit origin', () => {
    expect(buildInviteUrl('abc12345', 'https://finance.example.com')).toBe(
      'https://finance.example.com/invite/abc12345',
    );
  });

  it('strips a trailing slash from the origin', () => {
    expect(buildInviteUrl('abc12345', 'https://finance.example.com/')).toBe(
      'https://finance.example.com/invite/abc12345',
    );
  });

  it('uses window.location.origin when no explicit origin is given', () => {
    // jsdom defaults window.location.origin to http://localhost:3000 / similar.
    const expectedOrigin = window.location.origin.replace(/\/+$/, '');
    expect(buildInviteUrl('abc12345')).toBe(`${expectedOrigin}/invite/abc12345`);
  });

  it('still produces a usable URL with an empty code', () => {
    expect(buildInviteUrl('', 'https://finance.example.com')).toBe(
      'https://finance.example.com/invite/',
    );
  });
});
