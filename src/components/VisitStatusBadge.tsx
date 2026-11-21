// 来店の状態（入店中・精算済・自動退店・取消）
import { Badge } from '@/components/ui'

export function VisitStatusBadge({ status, auto = false }: { status: 'in' | 'out' | 'void'; auto?: boolean }) {
  if (status === 'in') return <Badge tone="blue">入店中</Badge>
  if (status === 'void') return <Badge tone="gray">取消</Badge>
  return auto ? <Badge tone="amber">自動退店</Badge> : <Badge tone="green">精算済</Badge>
}
