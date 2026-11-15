'use client'

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { useIsDark } from './theme'

// 色はデザイン（紫）に合わせつつ、色覚の違いでも見分けられる明度差を確保（検証済み）
export const CHART = { day: '#b48ae8', night: '#5b2aae', total: '#1e1830', grid: '#efeaf6', axis: '#8a84a0', surface: '#ffffff' }
/** ダーク表示用（暗い背景で明度・色覚の検証済み） */
export const CHART_DARK = { day: '#b977cd', night: '#7a4ee3', total: '#ece8f5', grid: '#2f2843', axis: '#8f88a6', surface: '#1a1426' }
export const useChartColors = () => (useIsDark() ? CHART_DARK : CHART)

export interface TrendPoint {
  label: string
  day: number
  night: number
  total: number
}

const yenAxis = (v: number) => (v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP')}万` : v.toLocaleString('ja-JP'))

function TrendTooltip({ active, payload, label }: TooltipContentProps) {
  const C = useChartColors()
  if (!active || !payload?.length) return null
  const p = payload[0].payload as TrendPoint
  const rows: [string, number, string][] = [
    ['総売上', p.total, C.total],
    ['夜売上', p.night, C.night],
    ['昼売上', p.day, C.day],
  ]
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-bold">{label}</p>
      {rows.map(([name, v, c]) => (
        <p key={name} className="flex items-center gap-2 tabular-nums">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: c }} />
          <span className="text-sub">{name}</span>
          <span className="ml-auto pl-4 font-bold">¥{v.toLocaleString('ja-JP')}</span>
        </p>
      ))}
    </div>
  )
}

export function Legend() {
  const C = useChartColors()
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-sub">
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: C.day }} />昼売上</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: C.night }} />夜売上</span>
      <span className="flex items-center gap-1.5">
        <svg width="26" height="10" aria-hidden><line x1="0" y1="5" x2="26" y2="5" stroke={C.total} strokeWidth="2" /><circle cx="13" cy="5" r="4" fill={C.surface} stroke={C.total} strokeWidth="2" /></svg>
        総売上
      </span>
    </div>
  )
}

/** 売上推移：昼／夜の積み上げ棒＋総売上の折れ線（同じ金額軸） */
export function SalesTrendChart({ data, height = 260, barSize = 34 }: { data: TrendPoint[]; height?: number; barSize?: number }) {
  const C = useChartColors()
  return (
    <div style={{ height }} role="img" aria-label="売上推移のグラフ（昼売上・夜売上・総売上）">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: C.grid }} tick={{ fontSize: 11, fill: C.axis }} interval="preserveStartEnd" />
          <YAxis tickFormatter={yenAxis} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: C.axis }} width={52} />
          <Tooltip content={(p) => <TrendTooltip {...p} />} cursor={{ fill: 'rgba(109,53,201,0.06)' }} />
          <Bar dataKey="night" stackId="s" fill={C.night} barSize={barSize} stroke={C.surface} strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="day" stackId="s" fill={C.day} barSize={barSize} radius={[4, 4, 0, 0]} stroke={C.surface} strokeWidth={1} isAnimationActive={false} />
          <Line dataKey="total" stroke={C.total} strokeWidth={2} dot={{ r: 4, fill: C.surface, stroke: C.total, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
