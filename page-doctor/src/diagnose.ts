import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { analyzeAudit } from './analyze.js';
import { auditPage, THROTTLE_PRESETS } from './audit.js';
import { printReport, saveReport } from './report.js';
import type { AuditReport } from './audit.js';
import type { AnalysisResult } from './analyze.js';
import type { ThrottlePresetName } from './constants.js';

export interface DiagnoseOptions {
  throttle?: ThrottlePresetName;
  settleMs?: number;
}

export interface DiagnoseResult {
  audit: AuditReport;
  analysis: AnalysisResult;
  files: { markdown: string; html: string; json: string };
}

/**
 * Run the full diagnosis flow: audit a page, analyze the results, print a report, and save artifacts.
 */
export async function diagnose(url: string, options: DiagnoseOptions = {}): Promise<DiagnoseResult> {
  const audit = await auditPage(url, options);

  if (!audit?.vitals) {
    throw new Error(
      'auditPage() did not return audit data - implement src/audit.js first.\n' +
        '   It should return an object with a `vitals` property.'
    );
  }

  const analysis = await analyzeAudit(audit);

  printReport(audit, analysis);

  const files = await saveReport(audit, analysis);
  console.log(chalk.gray('Saved:'));
  console.log(chalk.gray(`   ${files.markdown}`));
  console.log(chalk.gray(`   ${files.html}`));
  console.log(chalk.gray(`   ${files.json}\n`));

  return { audit, analysis, files };
}

/**
 * Parse CLI arguments into a URL plus a small options object.
 */
function parseArgs(argv: string[]): { url: string | null; options: Record<string, string> } {
  const options: Record<string, string> = {};
  let url: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value = 'true'] = arg.slice(2).split('=');
      options[key] = value;
    } else if (!url) {
      url = arg;
    }
  }

  return { url, options };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url, options } = parseArgs(process.argv.slice(2));

  if (!url) {
    console.log(chalk.bold.cyan('\n🩺 Page Doctor\n'));
    console.log('Usage:');
    console.log('  npm run diagnose <url>');
    console.log('  npm run diagnose <url> -- --throttle=none\n');
    console.log(`Throttle presets: ${Object.keys(THROTTLE_PRESETS).join(', ')}`);
    console.log(
      chalk.gray('  mobile   Lighthouse mobile profile - matches PageSpeed Insights (default)')
    );
    console.log(chalk.gray('  slow-3g  Worst realistic case'));
    console.log(chalk.gray('  desktop  Fast connection, no CPU slowdown'));
    console.log(chalk.gray('  none     Your actual machine and network\n'));
    console.log('Examples:');
    console.log('  npm run diagnose https://example.com');
    console.log('  npm run diagnose https://example.com -- --throttle=slow-3g\n');
    process.exit(1);
  }

  try {
    new URL(url);
  } catch {
    console.error(chalk.red(`Not a valid URL: ${url}`));
    console.error(chalk.gray('   Include the scheme, e.g. https://example.com'));
    process.exit(1);
  }

  try {
    await diagnose(url, {
      throttle: (options.throttle ?? 'mobile') as ThrottlePresetName,
      settleMs: options.settle ? Number(options.settle) : 3000
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('\nError:'), message);
    process.exit(1);
  }
}
