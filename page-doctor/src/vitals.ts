export type Rating = "good" | "needs-improvement" | "poor";

export type Threshold = {
  good: number;
  poor: number;
  label: string;
  unit: "ms" | "";
};

export const THRESHOLDS = {
  lcpMs: {
    good: 2500,
    poor: 4000,
    label: "Largest Contentful Paint",
    unit: "ms",
  },
  fcpMs: {
    good: 1800,
    poor: 3000,
    label: "First Contentful Paint",
    unit: "ms",
  },
  cls: {
    good: 0.1,
    poor: 0.25,
    label: "Cumulative Layout Shift",
    unit: "",
  },
  totalBlockingMs: {
    good: 200,
    poor: 600,
    label: "Total Blocking Time",
    unit: "ms",
  },
  ttfbMs: {
    good: 800,
    poor: 1800,
    label: "Time to First Byte",
    unit: "ms",
  },
} as const satisfies Record<string, Threshold>;

export type MetricName = keyof typeof THRESHOLDS;

export type Vitals = Partial<Record<MetricName, number>>;

export type RatedVital = {
  metric: MetricName;
  label: string;
  value: number;
  display: string;
  target: string;
  rating: Rating;
  icon: string;
};

export function rate(metric: MetricName, value: number): Rating {
  const threshold = THRESHOLDS[metric];

  if (value <= threshold.good) {
    return "good";
  }

  if (value <= threshold.poor) {
    return "needs-improvement";
  }

  return "poor";
}

export function formatValue(
  metric: MetricName,
  value: number,
): string {
  const threshold = THRESHOLDS[metric];

  if (threshold.unit === "ms") {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}s`;
    }

    return `${Math.round(value)}ms`;
  }

  return value.toFixed(3);
}

const ICONS: Record<Rating, string> = {
  good: "✅",
  "needs-improvement": "⚠️ ",
  poor: "❌",
};

export function icon(rating: Rating): string {
  return ICONS[rating] ?? "•";
}

export function rateAll(vitals: Vitals): RatedVital[] {
  return (Object.keys(THRESHOLDS) as MetricName[]).reduce<RatedVital[]>(
    (results, metric) => {
      const value = vitals[metric];

      if (value === undefined) {
        return results;
      }

      const rating = rate(metric, value);
      const threshold = THRESHOLDS[metric];

      results.push({
        metric,
        label: threshold.label,
        value,
        display: formatValue(metric, value),
        target: formatValue(metric, threshold.good),
        rating,
        icon: icon(rating),
      });

      return results;
    },
    [],
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}