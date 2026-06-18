// SPDX-License-Identifier: BUSL-1.1

export interface HardCodedStringFinding {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly reason: 'jsx-text' | 'user-facing-attribute';
}

export interface I18nAuthoringGuideline {
  readonly topic: string;
  readonly guidance: string;
}

export const I18N_AUTHORING_GUIDELINES: readonly I18nAuthoringGuideline[] = [
  {
    topic: 'Message IDs',
    guidance:
      'Use stable, dotted IDs by surface and purpose, such as settings.currencyRates.retryAria.',
  },
  {
    topic: 'Interpolation',
    guidance: 'Keep user-entered names, currency codes, amounts, and dates in named placeholders.',
  },
  {
    topic: 'Pluralization',
    guidance:
      'Use plural message objects for counts; do not concatenate count text around translated strings.',
  },
  {
    topic: 'Financial translator notes',
    guidance:
      'Document whether tax terms are regional (for example IVA) or generic (for example impuesto).',
  },
  {
    topic: 'Pseudolocalization',
    guidance:
      'Run pseudolocalized catalogs before activating new locales to check expansion and clipping.',
  },
];

const JSX_TEXT_PATTERN = />\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</g;
const USER_FACING_ATTRIBUTE_PATTERN =
  /\b(aria-label|aria-description|placeholder|title|alt)=(['"])([^'"]*[A-Za-z][^'"]*)\2/g;
const IGNORED_TEXT_PATTERN = /^(?:[A-Z_]+|[\d\s.,:;!?$€£¥%()\-+*/#]+)$/;

function getLineColumn(
  content: string,
  index: number,
): { readonly line: number; readonly column: number } {
  const prefix = content.slice(0, index);
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function shouldReport(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length >= 3 && !IGNORED_TEXT_PATTERN.test(normalized);
}

export function findHardCodedUserFacingStrings(
  filePath: string,
  content: string,
): readonly HardCodedStringFinding[] {
  const findings: HardCodedStringFinding[] = [];

  for (const match of content.matchAll(JSX_TEXT_PATTERN)) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (!shouldReport(text) || match.index === undefined) continue;
    findings.push({
      filePath,
      text,
      reason: 'jsx-text',
      ...getLineColumn(content, match.index + 1),
    });
  }

  for (const match of content.matchAll(USER_FACING_ATTRIBUTE_PATTERN)) {
    const text = match[3].trim().replace(/\s+/g, ' ');
    if (!shouldReport(text) || match.index === undefined) continue;
    findings.push({
      filePath,
      text,
      reason: 'user-facing-attribute',
      ...getLineColumn(content, match.index),
    });
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

export function formatHardCodedStringReport(findings: readonly HardCodedStringFinding[]): string {
  if (findings.length === 0) return 'No hard-coded user-facing strings found.';
  return findings
    .map(
      (finding) =>
        `${finding.filePath}:${finding.line}:${finding.column} ${finding.reason}: ${finding.text}`,
    )
    .join('\n');
}
