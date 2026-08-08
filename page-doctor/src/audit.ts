import { chromium } from 'playwright';
import { THROTTLE_PRESETS, type ThrottlePresetName, type ThrottlePreset } from './constants.js';

export { THROTTLE_PRESETS } from './constants.js';

export interface AuditPageOptions {
  throttle?: ThrottlePresetName;
  settleMs?: number;
}

export interface CoverageSummary {
  totalBytes: number;
  unusedBytes: number;
  unusedPercent: number;
  worstFiles: Array<{ url: string; unusedPercent: number; unusedBytes: number; totalBytes: number }>;
}

export interface ConsoleIssue {
  text: string;
  source?: string | null;
  level?: string;
  url?: string;
}

interface VitalsState {
  lcp: number;
  fcp: number;
  cls: number;
  shifts: Array<{ value: number; time: number; elements: Array<string | null> }>;
  longTasks: Array<{ start: number; duration: number }>;
  lcpElement?: string | null;
  lcpUrl?: string | null;
}

interface NavigationMetrics {
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  transferSize: number;
}

interface AuditRequest {
  url: string;
  method?: string;
  type?: string;
  startTime: number;
  initiator?: string | null;
  status?: number;
  mimeType?: string;
  fromCache?: boolean;
  transferBytes?: number;
  durationMs?: number;
  failed?: boolean;
  errorText?: string | null;
  blockedReason?: string | null;
}

interface CoverageEntry {
  url?: string;
  text?: string;
  ranges?: Array<{ start: number; end: number }>;
  source?: string;
  functions?: Array<{ ranges?: Array<{ count: number; startOffset: number; endOffset: number }> }>;
}

type LargestContentfulPaintEntry = PerformanceEntry & {
  element?: { tagName?: string } | null;
  url?: string;
};

type PaintEntry = PerformanceEntry & {
  name: string;
};

type LayoutShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput?: boolean;
  sources?: Array<{ node?: { tagName?: string } | null }>;
};

type LongTaskEntry = PerformanceEntry & {
  duration: number;
};

declare global {
  interface Window {
    __vitals?: VitalsState;
  }
}

export interface AuditReport {
  url: string;
  title: string;
  auditedAt: string;
  conditions: {
    throttle: ThrottlePresetName;
    cpuSlowdown?: number;
    downloadKbps?: number;
    uploadKbps?: number;
    latencyMs?: number;
  };
  loadError: string | null;
  vitals: {
    lcpMs: number;
    lcpElement: string | null;
    lcpUrl: string | null;
    fcpMs: number;
    cls: number;
    totalBlockingMs: number;
    ttfbMs: number;
    loadMs: number;
  };
  layoutShifts: Array<{ value: number; atMs: number; elements: string[] }>;
  network: {
    requestCount: number;
    totalBytes: number;
    byType: Record<string, { count: number; bytes: number }>;
    largest: Array<{ url: string; type: string; bytes: number }>;
    failed: Array<{ url: string; status: number | null; error: string | null }>;
    renderBlocking: Array<{ url: string; type: string; durationMs: number; bytes: number }>;
  };
  coverage: {
    js: CoverageSummary;
    css: CoverageSummary;
  };
  dom: {
    nodes: number;
    jsHeapMb: number;
    layoutCount: number;
    recalcStyleCount: number;
  };
  console: {
    errors: ConsoleIssue[];
    messages: ConsoleIssue[];
    browserWarnings: ConsoleIssue[];
  };
}

/**
 * Convert kilobits per second to bytes per second for network emulation.
 * @param {number} kbps - The throughput in kilobits per second.
 * @returns {number} The equivalent throughput in bytes per second.
 */
const kbpsToBytesPerSecond = (kbps: number): number => (kbps * 1024) / 8;

/**
 * Inject a small helper into the page that collects performance metrics.
 */
function collectVitals(): void {
  const windowWithVitals = window as Window & { __vitals: VitalsState };
  windowWithVitals.__vitals = { lcp: 0, fcp: 0, cls: 0, shifts: [], longTasks: [] };

  const observe = <T extends PerformanceEntry>(type: string, handler: (entry: T) => void): void => {
    try {
      new PerformanceObserver(list => list.getEntries().forEach(entry => handler(entry as T))).observe({
        type,
        buffered: true
      });
    } catch {}
  };

  observe<LargestContentfulPaintEntry>('largest-contentful-paint', entry => {
    windowWithVitals.__vitals.lcp = entry.startTime;
    windowWithVitals.__vitals.lcpElement = entry.element?.tagName ?? null;
    windowWithVitals.__vitals.lcpUrl = entry.url || null;
  });

  observe<PaintEntry>('paint', entry => {
    if (entry.name === 'first-contentful-paint') windowWithVitals.__vitals.fcp = entry.startTime;
  });

  observe<LayoutShiftEntry>('layout-shift', entry => {
    if (entry.hadRecentInput) return;
    windowWithVitals.__vitals.cls += entry.value;
    windowWithVitals.__vitals.shifts.push({
      value: entry.value,
      time: entry.startTime,
      elements: (entry.sources ?? []).map(source => source.node?.tagName).filter((value): value is string => Boolean(value))
    });
  });

  observe<LongTaskEntry>('longtask', entry => {
    windowWithVitals.__vitals.longTasks.push({
      start: entry.startTime,
      duration: entry.duration
    });
  });
}

/**
 * Audit a page by launching a browser, collecting runtime metrics, and building a report.
 * @param {string} url - The page URL to inspect.
 * @param {object} [options] - Optional audit settings.
 * @param {'none'|'mobile'|'slow-3g'|'desktop'} [options.throttle='mobile'] - Throttling preset to apply.
 * @param {number} [options.settleMs=3000] - Extra time to wait after load for metrics to settle.
 * @returns {Promise<object>} A structured performance and diagnostics report.
 */
export async function auditPage(url: string, options: AuditPageOptions = {}): Promise<AuditReport> {
  const { throttle = 'mobile', settleMs = 3000 } = options;

  if (!(throttle in THROTTLE_PRESETS)) {
    throw new Error(
      `Unknown throttle preset "${throttle}". Options: ${Object.keys(THROTTLE_PRESETS).join(', ')}`
    );
  }

  const preset: ThrottlePreset | null = THROTTLE_PRESETS[throttle];
  console.log(`🔍 Auditing ${url}`);
  console.log(
    `   Conditions: ${throttle}${preset ? ` (${preset.cpuSlowdown}x CPU slowdown)` : ''}`
  );

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false'
  });

  try {
    const page = await browser.newPage();
    await page.addInitScript(collectVitals);

    const client = await page.context().newCDPSession(page);

    await Promise.all([
      client.send('Network.enable'),
      client.send('Runtime.enable'),
      client.send('Log.enable'),
      client.send('Performance.enable')
    ]);

    if (preset) {
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: kbpsToBytesPerSecond(preset.downloadKbps),
        uploadThroughput: kbpsToBytesPerSecond(preset.uploadKbps),
        latency: preset.latencyMs
      });
      await client.send('Emulation.setCPUThrottlingRate', {
        rate: preset.cpuSlowdown
      });
    }

    const requests = new Map<string, AuditRequest>();
    const consoleMessages: ConsoleIssue[] = [];
    const exceptions: ConsoleIssue[] = [];
    const browserLogs: ConsoleIssue[] = [];

    client.on('Network.requestWillBeSent', event => {
      requests.set(event.requestId, {
        url: event.request.url,
        method: event.request.method,
        type: event.type,
        startTime: event.timestamp,
        initiator: event.initiator?.type
      });
    });

    client.on('Network.responseReceived', event => {
      const request = requests.get(event.requestId);
      if (!request) return;
      request.status = event.response.status;
      request.mimeType = event.response.mimeType;
      request.fromCache = event.response.fromDiskCache || event.response.fromPrefetchCache;
      request.type = event.type ?? request.type;
    });

    client.on('Network.loadingFinished', event => {
      const request = requests.get(event.requestId);
      if (!request) return;
      request.transferBytes = event.encodedDataLength;
      request.durationMs = (event.timestamp - request.startTime) * 1000;
    });

    client.on('Network.loadingFailed', event => {
      const request = requests.get(event.requestId);
      if (!request) return;
      request.failed = true;
      request.errorText = event.errorText;
      request.blockedReason = event.blockedReason;
    });

    client.on('Runtime.consoleAPICalled', event => {
      consoleMessages.push({
        level: event.type,
        text: event.args.map(describeRemoteObject).join(' '),
        source: firstFrame(event.stackTrace)
      });
    });

    client.on('Runtime.exceptionThrown', event => {
      const details = event.exceptionDetails;
      exceptions.push({
        text: details.exception?.description || details.text,
        source: firstFrame(details.stackTrace) ?? `${details.url}:${details.lineNumber}`
      });
    });

    client.on('Log.entryAdded', event => {
      const entry = event.entry;
      if (entry.level !== 'error' && entry.level !== 'warning') return;
      browserLogs.push({
        level: entry.level,
        source: entry.source,
        text: entry.text,
        url: entry.url
      });
    });

    await Promise.all([
      page.coverage.startJSCoverage({ resetOnNavigation: false }),
      page.coverage.startCSSCoverage({ resetOnNavigation: false })
    ]);

    const navigationStart = Date.now();
    let loadError: string | null = null;

    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      loadError = message;
      console.log(`⚠️  ${message.split('\n')[0]}`);
    }

    await page.waitForTimeout(settleMs);

    const vitals = (await page.evaluate(() => window.__vitals ?? {})) as Partial<VitalsState>;
    const navigation = (await page.evaluate(() => {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (!entry) return {};
      return {
        ttfbMs: entry.responseStart,
        domContentLoadedMs: entry.domContentLoadedEventEnd,
        loadMs: entry.loadEventEnd,
        transferSize: entry.transferSize
      };
    })) as Partial<NavigationMetrics>;

    const domCounters = await client.send('Performance.getMetrics');
    const metrics = Object.fromEntries(
      domCounters.metrics.map((metric: { name: string; value: number }) => [metric.name, metric.value])
    ) as Record<string, number>;

    const [jsCoverage, cssCoverage] = await Promise.all([
      page.coverage.stopJSCoverage(),
      page.coverage.stopCSSCoverage()
    ]);

    const title = await page.title().catch(() => '');

    return buildReport({
      url,
      title,
      throttle,
      preset,
      loadError,
      wallClockMs: Date.now() - navigationStart,
      requests: [...requests.values()],
      consoleMessages,
      exceptions,
      browserLogs,
      vitals,
      navigation,
      metrics,
      jsCoverage,
      cssCoverage
    });
  } finally {
    await browser.close();
  }
}

/**
 * Convert a remote console object into a readable string.
 * @param {object} arg - The remote object from the browser console.
 * @returns {string} A human-readable representation.
 */
function describeRemoteObject(arg: { value?: unknown; unserializableValue?: string; description?: string; type?: string }): string {
  if (arg.value !== undefined) return String(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  return arg.description ?? `[${arg.type}]`;
}

/**
 * Extract the top-most stack frame location for error reporting.
 * @param {object} [stackTrace] - A Chrome DevTools stack trace object.
 * @returns {string|null} A formatted file:line string or null if unavailable.
 */
function firstFrame(stackTrace: { callFrames?: Array<{ url?: string; lineNumber?: number }> } | undefined): string | null {
  const frame = stackTrace?.callFrames?.[0];
  if (!frame) return null;
  const file = frame.url?.split('/').pop() || frame.url || '<anonymous>';
  const line = frame.lineNumber ?? 0;
  return `${file}:${line + 1}`;
}

/**
 * Transform raw audit data into a concise report structure.
 * @param {object} raw - The collected audit data.
 * @returns {object} A normalized report with metrics, network details, coverage, and console issues.
 */
function buildReport(raw: {
  url: string;
  title: string;
  throttle: ThrottlePresetName;
  preset: ThrottlePreset | null;
  loadError: string | null;
  wallClockMs: number;
  requests: AuditRequest[];
  consoleMessages: ConsoleIssue[];
  exceptions: ConsoleIssue[];
  browserLogs: ConsoleIssue[];
  vitals: Partial<VitalsState>;
  navigation: Partial<NavigationMetrics>;
  metrics: Array<{ name: string; value: number }> | Record<string, number>;
  jsCoverage: CoverageEntry[];
  cssCoverage: CoverageEntry[];
}): AuditReport {
  const requests = raw.requests;
  const fcp = raw.vitals.fcp ?? 0;

  const totalBlockingMs = (raw.vitals.longTasks ?? [])
    .filter(task => task.start >= fcp)
    .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);

  const byType: Record<string, { count: number; bytes: number }> = {};
  let totalBytes = 0;

  for (const request of requests) {
    const bytes = request.transferBytes ?? 0;
    totalBytes += bytes;
    const type = request.type ?? 'Other';
    byType[type] ??= { count: 0, bytes: 0 };
    byType[type].count += 1;
    byType[type].bytes += bytes;
  }

  const unusedJs = summarizeCoverage(raw.jsCoverage, usedBytesInScript);
  const unusedCss = summarizeCoverage(raw.cssCoverage, usedBytesInStylesheet);

  const renderBlocking = requests
    .filter(r => (r.type === 'Script' || r.type === 'Stylesheet') && (r.durationMs ?? 0) > 0)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 5)
    .map(r => ({
      url: r.url,
      type: r.type ?? 'Other',
      durationMs: Math.round(r.durationMs ?? 0),
      bytes: r.transferBytes ?? 0
    }));

  return {
    url: raw.url,
    title: raw.title,
    auditedAt: new Date().toISOString(),
    conditions: { throttle: raw.throttle, ...(raw.preset ?? {}) },
    loadError: raw.loadError,

    vitals: {
      lcpMs: Math.round(raw.vitals.lcp ?? 0),
      lcpElement: raw.vitals.lcpElement ?? null,
      lcpUrl: raw.vitals.lcpUrl ?? null,
      fcpMs: Math.round(fcp),
      cls: Number((raw.vitals.cls ?? 0).toFixed(3)),
      totalBlockingMs: Math.round(totalBlockingMs),
      ttfbMs: Math.round(raw.navigation.ttfbMs ?? 0),
      loadMs: Math.round(raw.navigation.loadMs ?? 0)
    },

    layoutShifts: (raw.vitals.shifts ?? [])
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(s => ({
        value: Number(s.value.toFixed(3)),
        atMs: Math.round(s.time),
        elements: s.elements.filter((element): element is string => typeof element === 'string')
      })),

    network: {
      requestCount: requests.length,
      totalBytes,
      byType: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes)),
      largest: requests
        .filter(r => r.transferBytes)
        .sort((a, b) => (b.transferBytes ?? 0) - (a.transferBytes ?? 0))
        .slice(0, 8)
        .map(r => ({ url: r.url, type: r.type ?? 'Other', bytes: r.transferBytes ?? 0 })),
      failed: requests
        .filter(r => r.failed || (r.status !== undefined && r.status >= 400))
        .map(r => ({
          url: r.url,
          status: r.status ?? null,
          error: r.errorText ?? null
        })),
      renderBlocking
    },

    coverage: {
      js: unusedJs,
      css: unusedCss
    },

    dom: {
      nodes: Math.round(metricOf(raw.metrics, 'Nodes')),
      jsHeapMb: Number((metricOf(raw.metrics, 'JSHeapUsedSize') / 1024 / 1024).toFixed(1)),
      layoutCount: Math.round(metricOf(raw.metrics, 'LayoutCount')),
      recalcStyleCount: Math.round(metricOf(raw.metrics, 'RecalcStyleCount'))
    },

    console: {
      errors: raw.exceptions,
      messages: raw.consoleMessages.filter(m => m.level === 'error' || m.level === 'warning'),
      browserWarnings: raw.browserLogs
    }
  };
}

/**
 * Safely read a metric value from the performance metrics collection.
 * @param {object} metrics - The metrics map returned by the browser.
 * @param {string} name - The metric name to retrieve.
 * @returns {number} The metric value, or 0 if it is missing.
 */
function metricOf(metrics: Array<{ name: string; value: number }> | Record<string, number>, name: string): number {
  if (Array.isArray(metrics)) {
    return metrics.find(metric => metric.name === name)?.value ?? 0;
  }
  return metrics[name] ?? 0;
}

/**
 * Measure how much of a stylesheet is used based on coverage ranges.
 * @param {object} entry - A coverage entry for a stylesheet.
 * @returns {{size: number, used: number}} The total size and used bytes.
 */
function usedBytesInStylesheet(entry: CoverageEntry): { size: number; used: number } {
  const size = entry.text?.length ?? 0;
  const used = (entry.ranges ?? []).reduce((sum, range) => sum + (range.end - range.start), 0);
  return { size, used };
}

/**
 * Measure how much of a script is used based on coverage ranges.
 * @param {object} entry - A coverage entry for a JavaScript file.
 * @returns {{size: number, used: number}} The total size and used bytes.
 */
function usedBytesInScript(entry: CoverageEntry): { size: number; used: number } {
  const size = entry.source?.length ?? 0;
  if (!size) return { size: 0, used: 0 };

  const covered = new Uint8Array(size);

  for (const fn of entry.functions ?? []) {
    for (const range of fn.ranges ?? []) {
      const value = range.count > 0 ? 1 : 0;
      const end = Math.min(range.endOffset, size);
      for (let i = range.startOffset; i < end; i++) covered[i] = value;
    }
  }

  return { size, used: covered.reduce((sum, byte) => sum + byte, 0) };
}

/**
 * Summarize code coverage data for JS or CSS assets.
 * @param {Array<object>} entries - Coverage entries to analyze.
 * @param {Function} measure - A function that calculates size and used bytes for one entry.
 * @returns {object} Summary details including total bytes, unused bytes, and the worst files.
 */
function summarizeCoverage(
  entries: CoverageEntry[] | undefined,
  measure: (entry: CoverageEntry) => { size: number; used: number }
): CoverageSummary {
  let total = 0;
  let used = 0;
  const files: Array<{ url: string; unusedPercent: number; unusedBytes: number; totalBytes: number }> = [];

  for (const entry of entries ?? []) {
    const { size, used: usedBytes } = measure(entry);
    if (!size) continue;

    total += size;
    used += usedBytes;
    files.push({
      url: entry.url ?? 'unknown',
      totalBytes: size,
      unusedBytes: size - usedBytes,
      unusedPercent: Math.round(((size - usedBytes) / size) * 100)
    });
  }

  return {
    totalBytes: total,
    unusedBytes: total - used,
    unusedPercent: total ? Math.round(((total - used) / total) * 100) : 0,
    worstFiles: files
      .filter(f => f.unusedBytes > 1024)
      .sort((a, b) => b.unusedBytes - a.unusedBytes)
      .slice(0, 5)
  };
}
