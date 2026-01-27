import { Text } from "@shopify/polaris";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AnalyticsPoint = {
  date: string;
  views: number;
  clicks: number;
};

type AnalyticsLineChartProps = {
  data: AnalyticsPoint[];
};

function formatDateLabel(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsLineChart({ data }: AnalyticsLineChartProps) {
  const hasData = data.some((row) => row.views > 0 || row.clicks > 0);

  return (
    <div className="bainners-analytics-chart">
      {!hasData ? (
        <Text as="p" variant="bodySm" tone="subdued">
          No data yet.
        </Text>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              minTickGap={12}
              tick={{ fontSize: 11, fill: "#6b7280" }}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} width={28} />
            <Tooltip
              labelFormatter={(label) => formatDateLabel(String(label))}
              formatter={(value, name) => [
                value,
                name === "views" ? "Views" : name === "clicks" ? "Clicks" : name,
              ]}
            />
            <Legend verticalAlign="top" align="right" iconType="circle" />
            <Line type="monotone" dataKey="views" stroke="#111827" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="clicks" stroke="#0f766e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
