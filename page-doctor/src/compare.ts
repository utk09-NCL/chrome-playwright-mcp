import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { auditPage, THROTTLE_PRESETS } from './audit.js';
import type { AuditReport } from './audit.js';
import { formatValue, rate, THRESHOLDS, type MetricName } from './vitals.js';
import type { ThrottlePresetName } from './constants.js';

const COMPARED: MetricName[] = ['lcpMs', 'fcpMs', 'totalBlockingMs', 'cls', 'ttfbMs'];

/**
 * Compare page metrics across two throttling presets and print the differences.
 */
export async function compareThrottling(
  url: string,
  fromPreset: ThrottlePresetName = 'none',
  toPreset: ThrottlePresetName = 'mobile'
): Promise<{ before: AuditReport; after: AuditReport }> {
  console.log(chalk.bold.cyan('\n Comparing network + CPU conditions\n'));

  const before = await auditPage(url, { throttle: fromPreset, settleMs: 2500 });
  console.log('');
  const after = await auditPage(url, { throttle: toPreset, settleMs: 2500 });

  if (!before?.vitals || !after?.vitals) {
    throw new Error(
      'auditPage() did not return audit data - implement src/audit.js first.\n' +
        '   It should return an object with a `vitals` property.'
    );
  }

  console.log(
    chalk.bold(
      `\n${'Metric'.padEnd(26)}${fromPreset.padStart(10)}${toPreset.padStart(12)}${'Change'.padStart(16)}`
    )
  );
  console.log(chalk.gray('─'.repeat(64)));

  for (const metric of COMPARED) {
    const a = before.vitals[metric] ?? 0;
    const b = after.vitals[metric] ?? 0;

    const times = a > 0 ? b / a : 0;

    let changeText: string;
    let changeColor = chalk.gray;

    if (a === 0 && b === 0) {
      changeText = '-';
    } else if (times >= 1.15) {
      changeText = `${times.toFixed(1)}x worse`;
      changeColor = chalk.red;
    } else if (times <= 0.85 && a > 0) {
      changeText = `${(1 / times).toFixed(1)}x better`;
      changeColor = chalk.green;
    } else {
      changeText = '~same';
    }

    const ratingAfter = rate(metric, b);
    const color =
      ratingAfter === 'poor' ? chalk.red : ratingAfter === 'good' ? chalk.green : chalk.yellow;

    console.log(
      THRESHOLDS[metric].label.padEnd(26) +
        chalk.gray(formatValue(metric, a).padStart(10)) +
        color(formatValue(metric, b).padStart(12)) +
        changeColor(changeText.padStart(16))
    );
  }

  console.log('');

  const lcpBefore = rate('lcpMs', before.vitals.lcpMs);
  const lcpAfter = rate('lcpMs', after.vitals.lcpMs);

  if (lcpBefore === 'good' && lcpAfter !== 'good') {
    console.log(
      chalk.yellow.bold('  This page passes LCP on a fast connection and fails on a real phone.')
    );
    console.log(chalk.gray('   This is the single most common reason "it works on my machine".\n'));
  } else if (lcpAfter === 'good') {
    console.log(chalk.green.bold(' LCP stays within target even under throttling.\n'));
  }

  return { before, after };
}

/**
 * Parse CLI arguments into a target URL and option values.
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
    console.log(chalk.bold.cyan('\n📊 Throttle comparison\n'));
    console.log('Usage:');
    console.log('  npm run compare <url>');
    console.log('  npm run compare <url> -- --from=none --to=slow-3g\n');
    console.log(`Presets: ${Object.keys(THROTTLE_PRESETS).join(', ')}\n`);
    process.exit(1);
  }

  const from = (options.from ?? 'none') as ThrottlePresetName;
  const to = (options.to ?? 'mobile') as ThrottlePresetName;

  for (const preset of [from, to]) {
    if (!(preset in THROTTLE_PRESETS)) {
      console.error(chalk.red(` Unknown preset "${preset}".`));
      console.error(chalk.gray(`   Options: ${Object.keys(THROTTLE_PRESETS).join(', ')}`));
      process.exit(1);
    }
  }

  try {
    await compareThrottling(url, from, to);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('\n Error:'), message);
    process.exit(1);
  }
}
