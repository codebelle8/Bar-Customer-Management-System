import type { Metadata } from 'next'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { ArrowLeft } from 'lucide-react'
import { MINCHO, TermsBody } from '@/components/settings/TermsBody'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { TERMS_PLEDGE } from '@/lib/terms'
import { AutoFit } from './AutoFit'
import { PrintButton } from './PrintButton'

export const metadata: Metadata = { title: '会員規約（印刷用）' }

// A4 縦・1枚。紙の原本（会員規約 原本.pdf）のレイアウトを再現する
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  .print-wrap { background: #fff !important; padding: 0 !important; }
  .sheet { width: auto !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
}
.sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`

export default async function PrintTermsPage() {
  const ctx = await requireCtx()
  const [s] = await query(
    (tx) => tx.select({ version: t.storeSettings.termsVersion, text: t.storeSettings.termsText }).from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId)),
    ctx,
  )
  const row = 'flex items-end border-b border-black pb-[1mm] h-[11.5mm]'
  const gap = (w: string) => <span className="inline-block" style={{ width: w }} />
  return (
    <div className="print-wrap min-h-screen bg-[#e9e6ef] py-6">
      <style>{PRINT_CSS}</style>

      <div className="no-print mx-auto mb-5 flex w-[210mm] max-w-[calc(100%-32px)] flex-wrap items-center gap-3">
        <Link href="/terms" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-4 text-[13px] font-medium hover:bg-page">
          <ArrowLeft className="size-4" />会員規約に戻る
        </Link>
        <p className="text-[12px] text-sub">A4縦・1枚で印刷されます（{ctx.store.name}・版 {s.version}）</p>
        <div className="ml-auto"><PrintButton /></div>
      </div>

      <div className="overflow-x-auto">
        <article
          className="sheet mx-auto box-border w-[210mm] min-h-[297mm] bg-white px-[12mm] py-[12mm] text-black shadow-[0_4px_24px_rgba(30,24,48,0.18)]"
          style={{ fontFamily: MINCHO, fontFeatureSettings: 'normal' }}
        >
          <AutoFit>
            <h1 className="mb-[3mm] text-center text-[15pt] font-bold underline decoration-1 underline-offset-[1.2mm]">会員規約</h1>
            <div data-fit className="text-[10pt]">
              <TermsBody text={s.text} className="leading-[1.72] tracking-[0.03em]" />
            </div>

            <p className="mt-[6mm] text-[13pt] font-bold tracking-[0.02em]">{TERMS_PLEDGE}</p>

            <div className="mt-[3mm] text-[13pt] font-bold">
              <div className={row}>
                <span className="w-[47%]">署名：</span>
                <span>ハンドルネーム：</span>
              </div>
              <div className={row}>
                <span>生年月日：</span>{gap('24mm')}<span>年</span>{gap('12mm')}<span>月</span>{gap('12mm')}<span>日（</span>{gap('12mm')}<span>歳）</span>
                <span className="mr-[6mm] ml-auto">性別：男・女</span>
              </div>
              <div className={row}>
                <span>来店日：</span>{gap('25mm')}<span>年</span>{gap('12mm')}<span>月</span>{gap('12mm')}<span>日</span>
                <span className="ml-auto w-[39%]">会員番号：</span>
              </div>
            </div>

            {/* スタッフ使用欄（原本どおり） */}
            <div className="mt-[3mm] text-[13pt] font-bold">
              <div className="flex items-end">
                <span className="w-[37%] pb-[1mm] text-[9pt]">（スタッフ使用欄）</span>
                <span className="flex h-[11.5mm] flex-1 items-end border-b border-black pb-[1mm]">当店を知ったきっかけ：</span>
              </div>
              <div className="flex justify-end">
                <span className="flex h-[11.5mm] w-[38%] items-end border-b border-black pb-[1mm]">受付担当者：</span>
              </div>
            </div>
          </AutoFit>
        </article>
      </div>
    </div>
  )
}
