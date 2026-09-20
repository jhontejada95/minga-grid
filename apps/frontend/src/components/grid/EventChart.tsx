"use client";

/**
 * Baseline against measured consumption for one event window.
 *
 * The whole product is the gap between the two lines, so the gap is the mark that carries the
 * message: a filled band, directly labelled with the energy it represents. The baseline is a
 * reference, not a rival series, so it is a dashed neutral line rather than a second hue.
 *
 * Palette: protocol blue for what actually happened, emerald for the avoided band. Emerald and
 * cyan are NOT used together here on purpose — validated normal ΔE 12.5 for that pair, which
 * fails. Emerald + protocol blue validates at normal ΔE 26.5, worst CVD ΔE 25.2.
 */
import { useId, useMemo, useState } from "react";
import { cotTime, kwh, type CurvePoint } from "@/lib/grid";
import { useT } from "@/lib/lang";

const BLUE = "#3B82F6";
const EMERALD = "#059669";
const MUTED = "#64748B";
const GRID = "#1E293B";
const INK = "#F8FAFC";
const INK_2 = "#94A3B8";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const W = 720;
const H = 300;
const PAD = { top: 24, right: 20, bottom: 34, left: 46 };

export function EventChart({
  baseline,
  actual,
  actualLabel,
}: {
  baseline: CurvePoint[];
  actual: CurvePoint[];
  actualLabel: string;
}) {
  const { t } = useT();
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { xs, yOf, xOf, maxWh, avoidedWh, ticks } = useMemo(() => {
    const n = Math.min(baseline.length, actual.length);
    const maxWh = Math.max(...baseline.map((p) => p.wh), ...actual.map((p) => p.wh), 1);
    const yMax = Math.ceil(maxWh / 1000) * 1000;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xOf = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yOf = (wh: number) => PAD.top + plotH - (wh / yMax) * plotH;
    const avoidedWh = Array.from({ length: n }, (_, i) =>
      Math.max(0, (baseline[i]?.wh ?? 0) - (actual[i]?.wh ?? 0)),
    ).reduce((a, b) => a + b, 0);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ wh: yMax * f, y: yOf(yMax * f) }));
    return { xs: Array.from({ length: n }, (_, i) => i), yOf, xOf, maxWh: yMax, avoidedWh, ticks };
  }, [baseline, actual]);

  const line = (pts: CurvePoint[]) => xs.map((i) => `${xOf(i)},${yOf(pts[i]?.wh ?? 0)}`).join(" ");
  const band = [
    ...xs.map((i) => `${xOf(i)},${yOf(baseline[i]?.wh ?? 0)}`),
    ...[...xs].reverse().map((i) => `${xOf(i)},${yOf(actual[i]?.wh ?? 0)}`),
  ].join(" ");

  const midIndex = Math.floor(xs.length / 2);
  const labelX = xOf(midIndex);
  const labelY = (yOf(baseline[midIndex]?.wh ?? 0) + yOf(actual[midIndex]?.wh ?? 0)) / 2;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-start gap-x-5 gap-y-2 text-[13px]" style={{ color: INK_2 }}>
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="8" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke={MUTED} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          {t("chart.baselineLegend")}
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="8" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke={BLUE} strokeWidth="2" />
          </svg>
          {actualLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="14" height="10" className="shrink-0" aria-hidden="true">
            <rect width="14" height="10" rx="2" fill={EMERALD} opacity="0.45" />
          </svg>
          {t("chart.avoidedLegend")}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Consumption during the event window. Baseline versus ${actualLabel}. ${kwh(avoidedWh)} kilowatt hours avoided.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const plotW = W - PAD.left - PAD.right;
          const i = Math.round(((x - PAD.left) / plotW) * (xs.length - 1));
          setHover(i >= 0 && i < xs.length ? i : null);
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t.wh}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke={GRID} strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fontFamily={MONO} fill={MUTED}>
              {(t.wh / 1000).toFixed(1)}
            </text>
          </g>
        ))}
        <text x={PAD.left - 8} y={PAD.top - 10} textAnchor="end" fontSize="10" fontFamily={MONO} fill={MUTED}>
          kWh
        </text>

        {xs.map((i) =>
          i % 4 === 0 || i === xs.length - 1 ? (
            <text key={i} x={xOf(i)} y={H - 12} textAnchor="middle" fontSize="11" fontFamily={MONO} fill={MUTED}>
              {cotTime(baseline[i]?.t ?? 0)}
            </text>
          ) : null,
        )}

        <g clipPath={`url(#${clipId})`}>
          <polygon points={band} fill={EMERALD} opacity="0.4" />
          <polyline points={line(baseline)} fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 4" />
          <polyline points={line(actual)} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round" />
        </g>

        {avoidedWh > 0 && (
          <text x={labelX} y={labelY + 4} textAnchor="middle" fontSize="13" fontWeight="600" fontFamily={MONO} fill={INK}>
            {kwh(avoidedWh)} {t("chart.kwhAvoided")}
          </text>
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xOf(hover)} y1={PAD.top} x2={xOf(hover)} y2={H - PAD.bottom} stroke={INK_2} strokeWidth="1" opacity="0.5" />
            <circle cx={xOf(hover)} cy={yOf(baseline[hover]?.wh ?? 0)} r="5" fill={MUTED} stroke="#090D14" strokeWidth="2" />
            <circle cx={xOf(hover)} cy={yOf(actual[hover]?.wh ?? 0)} r="5" fill={BLUE} stroke="#090D14" strokeWidth="2" />
            <g transform={`translate(${Math.min(xOf(hover) + 10, W - 190)}, ${PAD.top + 6})`}>
              <rect width="180" height="66" rx="6" fill="#0F172A" stroke={GRID} />
              <text x="10" y="20" fontSize="11" fontFamily={MONO} fill={MUTED}>
                {cotTime(baseline[hover]?.t ?? 0)} COT
              </text>
              <text x="10" y="38" fontSize="12" fontFamily={MONO} fill={INK_2}>
                {t("chart.baselineHover")} {kwh(baseline[hover]?.wh ?? 0, 2)} kWh
              </text>
              <text x="10" y="56" fontSize="12" fontFamily={MONO} fill={INK}>
                {t("chart.measuredHover")} {kwh(actual[hover]?.wh ?? 0, 2)} kWh
              </text>
            </g>
          </g>
        )}
      </svg>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[12px] underline underline-offset-2"
          style={{ color: MUTED }}
        >
          {showTable ? t("chart.hideTable") : t("chart.showTable")}
        </button>
        {showTable && (
          <div className="mt-2 max-h-48 overflow-auto rounded border" style={{ borderColor: GRID }}>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr style={{ color: MUTED }}>
                  <th className="px-3 py-1.5 font-medium">{t("chart.colInterval")}</th>
                  <th className="px-3 py-1.5 font-medium">{t("chart.colBaseline")}</th>
                  <th className="px-3 py-1.5 font-medium">{t("chart.colMeasured")}</th>
                  <th className="px-3 py-1.5 font-medium">{t("chart.colAvoided")}</th>
                </tr>
              </thead>
              <tbody style={{ color: INK_2, fontFamily: MONO }}>
                {xs.map((i) => (
                  <tr key={i} className="border-t" style={{ borderColor: GRID }}>
                    <td className="px-3 py-1">{cotTime(baseline[i]?.t ?? 0)}</td>
                    <td className="px-3 py-1">{kwh(baseline[i]?.wh ?? 0, 2)}</td>
                    <td className="px-3 py-1">{kwh(actual[i]?.wh ?? 0, 2)}</td>
                    <td className="px-3 py-1">{kwh(Math.max(0, (baseline[i]?.wh ?? 0) - (actual[i]?.wh ?? 0)), 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-[11px]" style={{ color: MUTED }}>
        Peak of {(maxWh / 1000).toFixed(1)} {t("chart.caption")}
      </figcaption>
    </figure>
  );
}
