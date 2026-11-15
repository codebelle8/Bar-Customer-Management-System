'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { CHART } from '@/components/charts'

export interface CountPoint {
  label: string
  value: number | null
}

function CountTooltip({ active, payload, label, name, unit }: TooltipContentProps & { name: string; unit: string }) {
  if (!active || !payload?.length) return null
  const v = (payload[0].payload as CountPoint).value
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-bold">{label}</p>
      <p className="flex items-center gap-2 tabular-nums">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: CHART.night }} />
        <span className="text-sub">{name}</span>
        <span className="ml-auto pl-4 font-bold">{v === null ? 'データなし' : `${v.toLocaleString('ja-JP')}${unit}`}</span>
      </p>
    </div>
  )
}

/** 人数などの月別推移（1 系列・単位は 1 つだけ） */
export function CountChart({ data, name, unit, height = 200 }: { data: CountPoint[]; name: string; unit: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${name}の月別推移のグラフ`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fontSize: 11, fill: CHART.axis }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString('ja-JP')} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART.axis }} width={44} />
          <Tooltip content={(p) => <CountTooltip {...p} name={name} unit={unit} />} cursor={{ fill: 'rgba(109,53,201,0.06)' }} />
          <Bar dataKey="value" fill={CHART.night} barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
