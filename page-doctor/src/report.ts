import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { AuditReport } from './audit.js';
import type { AnalysisResult } from './analyze.js';
import { formatBytes, rateAll } from './vitals.js';

/**
 * Rendering helpers for presenting audit results in the terminal, Markdown, HTML, and JSON files.
 */

type Severity = 'critical' | 'warning' | 'info';

type StyleMap = Record<Severity, { icon: string; label: string; color: (value: string) => string }>;

const SEVERITY_STYLE: StyleMap = {
  critical: { icon: '🔴', label: 'CRITICAL', color: chalk.red.bold },
  warning: { icon: '🟡', label: 'WARNING', color: chalk.yellow.bold },
  info: { icon: '🔵', label: 'INFO', color: chalk.blue.bold }
};

const RATING_COLOR: Record<'good' | 'needs-improvement' | 'poor', (value: string) => string> = {
  good: chalk.green,
  'needs-improvement': chalk.yellow,
  poor: chalk.red
};

/**
 * Print a human-readable console summary of the audit and AI analysis.
 */
export function printReport(audit: AuditReport, analysis: AnalysisResult): void {
  console.log(chalk.bold.cyan(`\n ${audit.title || audit.url}`));
  console.log(chalk.gray(`   ${audit.url}`));
  console.log(chalk.gray(`   Tested on: ${audit.conditions.throttle}\n`));

  console.log(chalk.bold('Core Web Vitals'));
  for (const row of rateAll(audit.vitals)) {
    const color = RATING_COLOR[row.rating] ?? chalk.white;
    console.log(
      `  ${row.icon} ${row.label.padEnd(26)} ${color(row.display.padStart(8))}` +
        chalk.gray(`   target ${row.target}`)
    );
  }

  console.log(chalk.bold('\nPage weight'));
  console.log(
    `     ${audit.network.requestCount} requests, ${formatBytes(audit.network.totalBytes)} transferred`
  );
  console.log(
    `     JS  ${audit.coverage.js.unusedPercent}% unused ` +
      chalk.gray(`(${formatBytes(audit.coverage.js.unusedBytes)} wasted)`)
  );
  console.log(
    `     CSS ${audit.coverage.css.unusedPercent}% unused ` +
      chalk.gray(`(${formatBytes(audit.coverage.css.unusedBytes)} wasted)`)
  );
  console.log(`     DOM ${audit.dom.nodes} nodes, ${audit.dom.jsHeapMb} MB heap`);

  const errorCount = audit.console.errors.length;
  const warningCount = audit.console.messages.length + audit.console.browserWarnings.length;
  if (errorCount || warningCount) {
    console.log(
      chalk.bold('\nConsole  ') +
        (errorCount ? chalk.red(`${errorCount} errors  `) : '') +
        (warningCount ? chalk.yellow(`${warningCount} warnings`) : '')
    );
  } else {
    console.log(chalk.bold('\nConsole  ') + chalk.green('clean'));
  }

  if (analysis.verdict) {
    console.log(chalk.bold('\nVerdict'));
    console.log(`  ${analysis.verdict}`);
  }

  console.log(chalk.bold(`\nFindings (${analysis.findings.length})\n`));

  analysis.findings.forEach((finding, index) => {
    const style = SEVERITY_STYLE[finding.severity as Severity] ?? SEVERITY_STYLE.info;
    console.log(`${style.icon} ${style.color(`${index + 1}. ${finding.title}`)}`);
    console.log(chalk.gray(`   evidence: ${finding.evidence}`));
    console.log(`   ${chalk.bold('fix:')} ${finding.fix}`);
    console.log(chalk.green(`   impact: ${finding.impact}\n`));
  });
}

/**
 * Convert the audit and analysis into a Markdown report.
 */
export function toMarkdown(audit: AuditReport, analysis: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`# Page audit: ${audit.title || audit.url}`, '');
  lines.push(`**URL:** <${audit.url}>  `);
  lines.push(`**Tested:** ${new Date(audit.auditedAt).toLocaleString()}  `);
  lines.push(`**Conditions:** ${audit.conditions.throttle}`, '');

  if (analysis.verdict) lines.push(`> ${analysis.verdict}`, '');

  lines.push('## Core Web Vitals', '');
  lines.push('| Metric | Measured | Target | Rating |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of rateAll(audit.vitals)) {
    lines.push(`| ${row.label} | ${row.display} | ${row.target} | ${row.icon} ${row.rating} |`);
  }
  lines.push('');

  lines.push('## Page weight', '');
  lines.push(
    `- ${audit.network.requestCount} requests, ${formatBytes(audit.network.totalBytes)} transferred`
  );
  lines.push(
    `- JavaScript: ${audit.coverage.js.unusedPercent}% unused ` +
      `(${formatBytes(audit.coverage.js.unusedBytes)} of ${formatBytes(audit.coverage.js.totalBytes)})`
  );
  lines.push(
    `- CSS: ${audit.coverage.css.unusedPercent}% unused ` +
      `(${formatBytes(audit.coverage.css.unusedBytes)} of ${formatBytes(audit.coverage.css.totalBytes)})`
  );
  lines.push(`- DOM: ${audit.dom.nodes} nodes, ${audit.dom.jsHeapMb} MB JS heap`, '');

  if (audit.network.largest.length) {
    lines.push('### Largest resources', '');
    lines.push('| Size | Type | URL |');
    lines.push('| --- | --- | --- |');
    for (const resource of audit.network.largest) {
      lines.push(`| ${formatBytes(resource.bytes)} | ${resource.type} | \`${resource.url}\` |`);
    }
    lines.push('');
  }

  if (audit.network.failed.length) {
    lines.push('### Failed requests', '');
    for (const failure of audit.network.failed) {
      lines.push(`- \`${failure.status ?? failure.error}\` - ${failure.url}`);
    }
    lines.push('');
  }

  lines.push(`## Findings (${analysis.findings.length})`, '');
  analysis.findings.forEach((finding, index) => {
    const style = SEVERITY_STYLE[finding.severity as Severity] ?? SEVERITY_STYLE.info;
    lines.push(`### ${index + 1}. ${style.icon} ${finding.title}`, '');
    lines.push(`**Severity:** ${finding.severity} · **Category:** ${finding.category}`, '');
    lines.push(`**Evidence:** ${finding.evidence}`, '');
    lines.push(`**Fix:** ${finding.fix}`, '');
    lines.push(`**Estimated impact:** ${finding.impact}`, '');
  });

  const { errors, messages, browserWarnings } = audit.console;
  if (errors.length || messages.length || browserWarnings.length) {
    lines.push('## Console', '');
    for (const error of errors) lines.push(`-  **Uncaught** \`${error.source ?? ''}\` - ${error.text}`);
    for (const message of messages) lines.push(`- ${message.level} \`${message.source ?? ''}\` - ${message.text}`);
    for (const warning of browserWarnings) lines.push(`- browser ${warning.level} (${warning.source}) - ${warning.text}`);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '*Captured over the Chrome DevTools Protocol. Analysis by AI - verify before acting.*'
  );

  return lines.join('\n');
}

/**
 * Escape a string for safe inclusion in an HTML document.
 */
const escapeHTML = (str: string | number | boolean | null | undefined): string =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Build a standalone HTML report from the audit and analysis data.
 */
export function toHTML(audit: AuditReport, analysis: AnalysisResult): string {
  const vitalRows = rateAll(audit.vitals)
    .map(
      row => `<div class="metric ${row.rating}">
        <div class="metric-value">${escapeHTML(row.display)}</div>
        <div class="metric-label">${escapeHTML(row.label)}</div>
        <div class="metric-target">target ${escapeHTML(row.target)}</div>
      </div>`
    )
    .join('\n');

  const findingCards = analysis.findings
    .map(
      (finding, index) => `<article class="finding ${escapeHTML(finding.severity)}">
        <h3><span class="num">${index + 1}</span> ${escapeHTML(finding.title)}</h3>
        <p class="tags"><span class="sev">${escapeHTML(finding.severity)}</span> ${escapeHTML(finding.category)}</p>
        <p><strong>Evidence:</strong> ${escapeHTML(finding.evidence)}</p>
        <p><strong>Fix:</strong> ${escapeHTML(finding.fix)}</p>
        <p class="impact">${escapeHTML(finding.impact)}</p>
      </article>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page audit - ${escapeHTML(audit.title || audit.url)}</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#666; --line:#e4e4e7; --card:#fafafa; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f0f11; --fg:#e8e8ea; --muted:#9a9aa2; --line:#2a2a30; --card:#17171b; }
  }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 860px;
         margin: 0 auto; padding: 2rem 1.25rem; background: var(--bg); color: var(--fg); line-height: 1.6; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  .url { color: var(--muted); font-size: .9rem; word-break: break-all; }
  .verdict { border-left: 3px solid #3b82f6; padding: .75rem 1rem; background: var(--card);
             border-radius: 0 6px 6px 0; margin: 1.5rem 0; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin: 1.5rem 0; }
  .metric { border: 1px solid var(--line); border-radius: 8px; padding: .85rem; background: var(--card); }
  .metric-value { font-size: 1.5rem; font-weight: 650; }
  .metric-label { font-size: .8rem; color: var(--muted); }
  .metric-target { font-size: .72rem; color: var(--muted); margin-top: .2rem; }
  .metric.good .metric-value { color: #16a34a; }
  .metric.needs-improvement .metric-value { color: #d97706; }
  .metric.poor .metric-value { color: #dc2626; }
  .finding { border: 1px solid var(--line); border-left-width: 4px; border-radius: 8px;
             padding: 1rem 1.15rem; margin: 1rem 0; background: var(--card); }
  .finding.critical { border-left-color: #dc2626; }
  .finding.warning  { border-left-color: #d97706; }
  .finding.info     { border-left-color: #3b82f6; }
  .finding h3 { margin: 0 0 .4rem; font-size: 1.05rem; }
  .num { color: var(--muted); font-weight: 400; }
  .tags { margin: 0 0 .6rem; font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .sev { font-weight: 700; }
  .finding.critical .sev { color: #dc2626; }
  .finding.warning .sev { color: #d97706; }
  .impact { color: #16a34a; font-weight: 550; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  td, th { border-bottom: 1px solid var(--line); padding: .45rem .5rem; text-align: left; }
  td:last-child { word-break: break-all; color: var(--muted); }
  .stats { display: flex; gap: 1.5rem; flex-wrap: wrap; font-size: .9rem; margin: 1rem 0; }
  footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line);
           color: var(--muted); font-size: .8rem; }
  .scroll { overflow-x: auto; }
</style>
</head>
<body>
  <h1>${escapeHTML(audit.title || 'Page audit')}</h1>
  <p class="url">${escapeHTML(audit.url)}</p>
  <p class="url">Tested ${escapeHTML(new Date(audit.auditedAt).toLocaleString())} · ${escapeHTML(audit.conditions.throttle)}</p>

  ${analysis.verdict ? `<div class="verdict">${escapeHTML(analysis.verdict)}</div>` : ''}

  <h2>Core Web Vitals</h2>
  <div class="metrics">${vitalRows}</div>

  <h2>Page weight</h2>
  <div class="stats">
    <span><strong>${audit.network.requestCount}</strong> requests</span>
    <span><strong>${escapeHTML(formatBytes(audit.network.totalBytes))}</strong> transferred</span>
    <span><strong>${audit.coverage.js.unusedPercent}%</strong> JS unused</span>
    <span><strong>${audit.coverage.css.unusedPercent}%</strong> CSS unused</span>
    <span><strong>${audit.dom.nodes}</strong> DOM nodes</span>
  </div>

  ${
    audit.network.largest.length
      ? `<div class="scroll"><table>
      <tr><th>Size</th><th>Type</th><th>URL</th></tr>
      ${audit.network.largest
        .map(
          r =>
            `<tr><td>${escapeHTML(formatBytes(r.bytes))}</td><td>${escapeHTML(r.type)}</td><td>${escapeHTML(r.url)}</td></tr>`
        )
        .join('')}
    </table></div>`
      : ''
  }

  <h2>Findings (${analysis.findings.length})</h2>
  ${findingCards || '<p>No findings.</p>'}

  <footer>Captured over the Chrome DevTools Protocol. Analysis by AI - verify before acting.</footer>
</body>
</html>`;
}

/**
 * Save the Markdown, HTML, and JSON versions of a report to disk.
 */
export async function saveReport(
  audit: AuditReport,
  analysis: AnalysisResult,
  outputDir = 'reports'
): Promise<{ markdown: string; html: string; json: string }> {
  await fs.mkdir(outputDir, { recursive: true });

  const slug = `${slugify(audit.url)}-${Date.now()}`;
  const base = path.join(outputDir, slug);

  await Promise.all([
    fs.writeFile(`${base}.md`, toMarkdown(audit, analysis)),
    fs.writeFile(`${base}.html`, toHTML(audit, analysis)),
    fs.writeFile(`${base}.json`, JSON.stringify({ audit, analysis }, null, 2))
  ]);

  return { markdown: `${base}.md`, html: `${base}.html`, json: `${base}.json` };
}

/**
 * Create a safe file name slug from a URL.
 */
function slugify(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname}${pathname}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60);
  } catch {
    return 'page';
  }
}
