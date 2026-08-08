import { askAI } from './ai.js';
import type { AuditReport } from './audit.js';
import { formatBytes, rateAll } from './vitals.js';

export type Severity = 'critical' | 'warning' | 'info';
export type Category = 'performance' | 'javascript' | 'network' | 'best-practice';

export interface Finding {
  title: string;
  severity: Severity;
  category: Category;
  evidence: string;
  fix: string;
  impact: string;
}

export interface AnalysisResult {
  verdict: string;
  findings: Finding[];
  digest: string;
}

const FINDINGS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
          category: {
            type: 'string',
            enum: ['performance', 'javascript', 'network', 'best-practice']
          },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          impact: { type: 'string' }
        },
        required: ['title', 'severity', 'category', 'evidence', 'fix', 'impact']
      }
    }
  },
  required: ['verdict', 'findings']
};

const SYSTEM_PROMPT = `You are a senior web performance engineer reviewing a page audit.

You are given real measurements captured from Chrome via the DevTools Protocol.
Produce a ranked list of concrete fixes.

Rules:
1. Rank by real user impact - the biggest win first. Do not pad the list.
2. Every finding must cite the actual numbers from the data as its evidence.
   Never invent a measurement that isn't there.
3. "fix" must be a specific, actionable change (a tag to add, a file to split,
   an attribute to set) - not generic advice like "optimize images".
4. "impact" should estimate the improvement, tied to a metric. Say "roughly" -
   these are estimates, not promises.
5. severity: critical = fails a Core Web Vitals threshold or breaks the page.
   warning = measurably hurts but passes. info = worth knowing.
6. If a JavaScript error is present, that is almost always critical - a broken
   page is worse than a slow one.
7. If the page is genuinely healthy, return few findings and say so in the
   verdict. Do not manufacture problems.
8. Write for a developer who has not seen this data. Be concise and specific.`;

/**
 * Turn an audit object into a compact text digest for the AI analyzer.
 */
function buildDigest(audit: AuditReport): string {
  const lines: string[] = [];

  lines.push(`URL: ${audit.url}`);
  if (audit.title) lines.push(`Title: ${audit.title}`);
  lines.push(
    `Test conditions: ${audit.conditions.throttle}` +
      (audit.conditions.cpuSlowdown ? ` (${audit.conditions.cpuSlowdown}x CPU slowdown)` : '')
  );
  if (audit.loadError) lines.push(`PAGE FAILED TO LOAD CLEANLY: ${audit.loadError}`);

  lines.push('', 'CORE WEB VITALS (measured / target / rating):');
  for (const row of rateAll(audit.vitals)) {
    lines.push(`  ${row.label}: ${row.display} / target ${row.target} / ${row.rating}`);
  }

  if (audit.vitals.lcpElement) {
    lines.push(
      `  The largest element painted was <${audit.vitals.lcpElement}>` +
        (audit.vitals.lcpUrl ? ` loading ${audit.vitals.lcpUrl}` : '')
    );
  }

  if (audit.layoutShifts.length) {
    lines.push('', 'LAYOUT SHIFTS (largest first):');
    for (const shift of audit.layoutShifts) {
      const elements = shift.elements.length ? shift.elements.join(', ') : 'unknown element';
      lines.push(`  ${shift.value} at ${shift.atMs}ms - moved: ${elements}`);
    }
  }

  lines.push('', 'NETWORK:');
  lines.push(
    `  ${audit.network.requestCount} requests, ${formatBytes(audit.network.totalBytes)} transferred`
  );
  for (const [type, stats] of Object.entries(audit.network.byType)) {
    lines.push(`  ${type}: ${stats.count} requests, ${formatBytes(stats.bytes)}`);
  }

  if (audit.network.largest.length) {
    lines.push('', 'LARGEST RESOURCES:');
    for (const resource of audit.network.largest.slice(0, 6)) {
      lines.push(`  ${formatBytes(resource.bytes)} - ${resource.type} - ${resource.url}`);
    }
  }

  if (audit.network.renderBlocking.length) {
    lines.push('', 'SLOWEST SCRIPTS/STYLESHEETS (these can delay first paint):');
    for (const resource of audit.network.renderBlocking) {
      lines.push(`  ${resource.durationMs}ms - ${resource.type} - ${resource.url}`);
    }
  }

  if (audit.network.failed.length) {
    lines.push('', 'FAILED REQUESTS:');
    for (const failure of audit.network.failed.slice(0, 10)) {
      lines.push(`  ${failure.status ?? failure.error} - ${failure.url}`);
    }
  }

  lines.push('', 'UNUSED CODE (downloaded and parsed but never executed):');
  lines.push(
    `  JavaScript: ${audit.coverage.js.unusedPercent}% unused ` +
      `(${formatBytes(audit.coverage.js.unusedBytes)} of ${formatBytes(audit.coverage.js.totalBytes)})`
  );
  lines.push(
    `  CSS: ${audit.coverage.css.unusedPercent}% unused ` +
      `(${formatBytes(audit.coverage.css.unusedBytes)} of ${formatBytes(audit.coverage.css.totalBytes)})`
  );
  for (const file of [...audit.coverage.js.worstFiles, ...audit.coverage.css.worstFiles].slice(0, 6)) {
    lines.push(`  ${file.unusedPercent}% unused (${formatBytes(file.unusedBytes)}) - ${file.url}`);
  }

  lines.push('', 'DOM:');
  lines.push(`  ${audit.dom.nodes} nodes, ${audit.dom.jsHeapMb} MB JS heap`);
  lines.push(`  ${audit.dom.layoutCount} layouts, ${audit.dom.recalcStyleCount} style recalculations`);

  const { errors, messages, browserWarnings } = audit.console;
  if (errors.length || messages.length || browserWarnings.length) {
    lines.push('', 'CONSOLE:');
    for (const error of errors.slice(0, 10)) {
      lines.push(`  UNCAUGHT EXCEPTION at ${error.source ?? 'unknown'}: ${error.text}`);
    }
    for (const message of messages.slice(0, 10)) {
      lines.push(`  ${message.level} at ${message.source ?? 'unknown'}: ${message.text}`);
    }
    for (const warning of browserWarnings.slice(0, 10)) {
      lines.push(`  browser ${warning.level} (${warning.source}): ${warning.text}`);
    }
  } else {
    lines.push('', 'CONSOLE: clean - no errors or warnings.');
  }

  return lines.join('\n');
}

/**
 * Send an audit digest to the AI model and return ranked findings.
 */
export async function analyzeAudit(audit: AuditReport): Promise<AnalysisResult> {
  const digest = buildDigest(audit);

  console.log('Analyzing results...');

  const response = await askAI(SYSTEM_PROMPT, `Audit data:\n\n${digest}`, {
    schema: FINDINGS_SCHEMA,
    maxOutputTokens: 4096,
    temperature: 0.2
  });

  const parsed = parseJSONObject(response);

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  console.log(`${findings.length} findings\n`);

  return { verdict: parsed.verdict ?? '', findings, digest };
}

/**
 * Parse JSON from an AI response that may be wrapped in Markdown code fences.
 */
function parseJSONObject(text: string): { verdict: string; findings: Finding[] } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('AI response did not deserialize to an object');
    }

    const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : '';
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((item): item is Finding => isFinding(item))
      : [];

    return { verdict, findings };
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error(`Could not find JSON in the AI response:\n${cleaned.slice(0, 200)}...`);
    }
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('AI response did not deserialize to an object');
    }

    const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : '';
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((item): item is Finding => isFinding(item))
      : [];

    return { verdict, findings };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === 'string' &&
    (value.severity === 'critical' || value.severity === 'warning' || value.severity === 'info') &&
    (value.category === 'performance' || value.category === 'javascript' || value.category === 'network' || value.category === 'best-practice') &&
    typeof value.evidence === 'string' &&
    typeof value.fix === 'string' &&
    typeof value.impact === 'string'
  );
}
