'use client'
// 新規入会の受付（4ステップ）：規約の確認 → 本人確認 → 会員情報 → 料金・お会計
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, IdCard, Loader2, ShieldCheck } from 'lucide-react'
import { Button, Card, Textarea, buttonCls, cx } from '@/components/ui'
import type { Category } from '@/db/schema'
import { ageOn, fmtJaDate } from '@/lib/format'
import type { TermsLine } from '@/lib/terms'
import { ERAS, NumBox, parseBirthday, type Era } from '@/components/members/BirthdayInput'
import { checkHandleAction, registerMemberAction } from '../actions'
import { MoneyRow, Notice } from '../_components/bits'
import { CashBox, paidOk } from '../_components/CashBox'
import { CheckTile, Choice } from '../_components/CheckTile'
import { MemberPicker } from '../_components/MemberPicker'
import { buildQuote, parseYen } from '../_lib/quote'
import type { Gender, MemberCard, TodayView } from '../_lib/types'

const STEPS = ['会員規約の説明・確認', '本人確認', '会員情報', '料金・お会計'] as const
const SHORT = ['規約・確認', '本人確認', '会員情報', '料金・お会計'] as const

export interface WizardProps {
  terms: TermsLine[]
  pledge: string
  termsVersion: string
  nextMemberNo: string
  today: TodayView & { partLabel: string; dayTypeLabel: string }
  joinFee: number
  annual: { enabled: boolean; fee: number }
  photoDocs: string[]
  subDocs: string[]
  referrals: string[]
  initialPartner: MemberCard | null
}

export function NewMemberWizard(p: WizardProps) {
  const [step, setStep] = useState(0)
  const [signed, setSigned] = useState(false)
  const [photoId, setPhotoId] = useState('')
  const [subId, setSubId] = useState('')
  const [copied, setCopied] = useState(false)
  const [era, setEra] = useState<Era>('西暦')
  const [by, setBy] = useState('')
  const [bm, setBm] = useState('')
  const [bd, setBd] = useState('')
  const [handle, setHandle] = useState('')
  const [gender, setGender] = useState<Gender | ''>(p.initialPartner ? (p.initialPartner.gender === '男性' ? '女性' : '男性') : '')
  const [referral, setReferral] = useState('')
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState<Category | ''>(p.initialPartner ? 'カップル' : '')
  const [partner, setPartner] = useState<MemberCard | null>(p.initialPartner)
  const [registerOnly, setRegisterOnly] = useState(false)
  const [paid, setPaid] = useState('')
  const [dups, setDups] = useState<{ memberNo: string; handle: string; gender: string; status: string }[]>([])
  const [state, action, pending] = useActionState(registerMemberAction, undefined)
  const dupTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const topRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  const birthday = parseBirthday(era, by, bm, bd)
  const age = birthday ? ageOn(birthday, p.today.businessDate) : null
  const under20 = age != null && age < 20
  const cat: Category = category || (gender || '男性')
  const partnerNew = cat === 'カップル' && !!partner?.newToday
  const partnerAnnual = partnerNew && p.annual.enabled && !!partner?.feeDue
  const quote = registerOnly
    ? null
    : buildQuote({
        category: cat, partLabel: p.today.partLabel, base: p.today.prices[cat],
        joinFee: p.joinFee * (partnerNew ? 2 : 1), joinNote: partnerNew ? `パートナー（${partner?.memberNo}・本日登録）分を含む2名分` : undefined,
        annualFee: p.annual.enabled ? p.annual.fee * (partnerAnnual ? 2 : 1) : 0,
      })
  const total = quote?.total ?? 0

  const valid = [
    signed,
    !!photoId && !!subId && copied && !!birthday && age != null && age >= 20 && age <= 110,
    !!handle.trim() && !!gender,
    registerOnly || ((cat !== 'カップル' || !!partner) && paidOk(paid, total)),
  ]
  const missing = [
    '会員規約の内容確認にチェックしてください',
    !photoId || !subId ? '確認した書類を2点選んでください' : !copied ? 'コピーを取ったことを確認してください' : !birthday ? '生年月日を入力してください' : under20 ? '20歳未満は入会できません' : '生年月日を確認してください',
    !handle.trim() ? 'ハンドルネームを入力してください' : '性別を選んでください',
    cat === 'カップル' && !partner ? 'パートナーの会員を選んでください' : '預かり金が不足しています',
  ]

  const onHandle = (v: string) => {
    setHandle(v)
    clearTimeout(dupTimer.current)
    dupTimer.current = setTimeout(async () => {
      const r = await checkHandleAction(v)
      setDups(r.matches)
    }, 450)
  }

  const payload = JSON.stringify({
    termsSigned: signed, photoId, subId, copied, birthday: birthday ?? '', handle: handle.trim(), gender, referral, memo,
    category: cat, partnerId: cat === 'カップル' && !registerOnly ? (partner?.id ?? null) : null, registerOnly,
    paid: registerOnly ? null : parseYen(paid),
  })

  return (
    <div ref={topRef} className="animate-fade-in mx-auto max-w-4xl scroll-mt-24 space-y-5">
      {/* 進捗 */}
      <ol className="card flex items-center gap-1 px-3 py-3 sm:px-5">
        {STEPS.map((label, i) => {
          const done = i < step
          const reachable = i < step || valid.slice(0, i).every(Boolean)
          return (
            <li key={label} className="flex flex-1 items-center gap-1 last:flex-none">
              <button type="button" disabled={!reachable || i === step} onClick={() => setStep(i)}
                className={cx('flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition', reachable && i !== step && 'hover:bg-page')}>
                <span className={cx('grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold',
                  i === step ? 'btn-brand' : done ? 'bg-ok text-white' : 'bg-[#efeaf7] text-mute')}>
                  {done ? <Check className="size-5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cx('hidden text-[13px] leading-tight font-bold md:block', i === step ? 'text-brand' : done ? 'text-ink' : 'text-mute')}>{SHORT[i]}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cx('h-0.5 min-w-3 flex-1 rounded', i < step ? 'bg-ok' : 'bg-line')} />}
            </li>
          )
        })}
      </ol>
      <p className="-mt-2 text-center text-[13px] font-bold text-brand md:hidden">STEP {step + 1}　{STEPS[step]}</p>

      {step === 0 && (
        <Card title="会員規約の説明・確認" action={<span className="text-[12px] text-sub">規約バージョン {p.termsVersion}</span>}>
          <div className="scrollbar-thin max-h-[46vh] overflow-y-auto rounded-xl border border-line bg-[#fcfbfe] px-5 py-4 text-[14px] leading-[1.9]">
            <TermsBody lines={p.terms} />
            <p className="mt-4 rounded-lg border border-brand/30 bg-white px-4 py-3 text-center font-bold">{p.pledge}</p>
          </div>
          <p className="mt-3 text-[12px] text-sub">太字・下線の項目は特にご説明ください。</p>
          <div className="mt-4">
            <CheckTile checked={signed} onChange={setSigned} required testId="terms-signed" sub="お客様に会員規約を説明し、内容を確認・理解していただいたことを確認します">
              会員規約の内容を確認し、理解しました
            </CheckTile>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="本人確認">
          <p className="mb-3 flex items-center gap-1.5 text-[13px] text-sub"><ShieldCheck className="size-4 text-brand" />書類の原本を確認してコピーを取ります。システムには書類の種類のみ記録します（顔写真・住所は登録しません）。</p>
          <h3 className="mb-2 text-[14px] font-bold">① 顔写真付きの身分証<span className="ml-1 text-up">*</span></h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {p.photoDocs.map((d) => <Choice key={d} selected={photoId === d} onClick={() => setPhotoId(d)}>{d}</Choice>)}
          </div>
          <h3 className="mt-5 mb-2 text-[14px] font-bold">② 2点目の確認書類<span className="ml-1 text-up">*</span></h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {p.subDocs.map((d) => <Choice key={d} selected={subId === d} onClick={() => setSubId(d)}>{d}</Choice>)}
          </div>
          <div className="mt-5">
            <CheckTile checked={copied} onChange={setCopied} required testId="id-copied" sub="2点の原本を確認し、コピーを保管しました">
              <IdCard className="mr-1.5 inline size-5 align-[-4px] text-brand" />本人確認書類のコピーを取りました
            </CheckTile>
          </div>
          <h3 className="mt-6 mb-2 text-[14px] font-bold">③ 生年月日<span className="ml-1 text-up">*</span><span className="ml-2 text-[12px] font-normal text-sub">20歳未満は入会できません</span></h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex overflow-hidden rounded-xl border border-line">
              {(Object.keys(ERAS) as Era[]).map((e) => (
                <button key={e} type="button" onClick={() => { if (e !== era) { setEra(e); setBy(''); yearRef.current?.focus() } }}
                  className={cx('h-14 px-4 text-[15px] font-bold transition', era === e ? 'bg-brand text-white' : 'bg-white text-sub hover:bg-page')}>{e}</button>
              ))}
            </div>
            <div className="flex items-end gap-1.5 sm:gap-3">
            <NumBox ref={yearRef} label="年" value={by} width="w-[4.5rem] sm:w-28" max={era === '西暦' ? 4 : 2} placeholder={era === '西暦' ? '1990' : '2'} testId="birth-y"
              onChange={(v) => { setBy(v); if (v.length === (era === '西暦' ? 4 : 2)) monthRef.current?.focus() }} />
            <NumBox ref={monthRef} label="月" value={bm} width="w-12 sm:w-20" max={2} placeholder="5" testId="birth-m"
              onChange={(v) => { setBm(v); if (v.length === 2 || +v > 1) dayRef.current?.focus() }} />
            <NumBox ref={dayRef} label="日" value={bd} width="w-12 sm:w-20" max={2} placeholder="14" testId="birth-d" onChange={setBd} />
            </div>
          </div>
          <div className="mt-3">
            {birthday && age != null && !under20 && (
              <Notice tone="ok">{fmtJaDate(birthday)}生まれ・<b className="text-[17px]">{age}歳</b>（入会できます）</Notice>
            )}
            {under20 && (
              <div className="rounded-2xl bg-up px-5 py-4 text-white" role="alert">
                <p className="text-[22px] font-bold">20歳未満のため入会・入店できません</p>
                <p className="mt-1 text-[15px]">{birthday && fmtJaDate(birthday)}生まれ・{age}歳。当店はアルコール類提供店舗のため、如何なる理由があってもお断りしてください。</p>
              </div>
            )}
            {!birthday && (by || bm || bd) && <p className="text-[13px] text-sub">日付を最後まで入力してください（和暦は「昭和」「平成」を選んでから年を入力）</p>}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="会員情報">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-brand/30 bg-brand-soft/50 px-5 py-4">
            <div>
              <p className="text-[13px] font-bold text-sub">会員番号（この番号を用紙に記入）</p>
              <p className="text-[44px] leading-tight font-bold tracking-wide text-brand tabular-nums" data-testid="next-no">{p.nextMemberNo}</p>
            </div>
            <p className="max-w-xs text-[12px] text-sub">番号は確定時に払い出されます。同時に別の受付があって番号が変わった場合は、完了画面の番号を記入してください。</p>
          </div>
          <div className="space-y-5">
            <div>
              <label htmlFor="handle" className="mb-1.5 block text-[14px] font-bold">ハンドルネーム<span className="ml-1 text-up">*</span></label>
              <input id="handle" autoFocus value={handle} onChange={(e) => onHandle(e.target.value)} maxLength={40} autoComplete="off"
                placeholder="店内で呼ぶ名前（本名は不要）"
                className="h-14 w-full rounded-xl border border-line bg-white px-4 text-[20px] font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
              {dups.length > 0 && handle.trim() && (
                <Notice tone="warn" className="mt-2">
                  同じハンドルネームの会員がいます：{dups.map((d) => `${d.memberNo}（${d.gender}${d.status !== 'active' ? `・${d.status === 'banned' ? '出入禁止' : '退会'}` : ''}）`).join('、')}
                  <span className="block text-[12px]">登録はできますが、呼び分けのため数字などを付けることをおすすめします。</span>
                </Notice>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[14px] font-bold">性別<span className="ml-1 text-up">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Choice selected={gender === '男性'} tone="male" onClick={() => setGender('男性')} className="h-16 text-[18px]">男性</Choice>
                <Choice selected={gender === '女性'} tone="female" onClick={() => setGender('女性')} className="h-16 text-[18px]">女性</Choice>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[14px] font-bold">来店のきっかけ<span className="ml-2 text-[12px] font-normal text-sub">任意</span></p>
              <div className="flex flex-wrap gap-2">
                {p.referrals.map((r) => (
                  <Choice key={r} selected={referral === r} onClick={() => setReferral(referral === r ? '' : r)} className="min-h-11 px-4 text-[14px]">{r}</Choice>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="memo" className="mb-1.5 block text-[14px] font-bold">メモ<span className="ml-2 text-[12px] font-normal text-sub">任意・スタッフのみ閲覧</span></label>
              <Textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} rows={2} placeholder="例：番号で呼ぶこと" />
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card title="料金・お会計" action={<span className="text-[12px] font-bold text-sub">{fmtJaDate(p.today.businessDate)}・{p.today.dayTypeLabel}・{p.today.partLabel}</span>}>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-page px-4 py-3 text-[14px]">
              <span className="font-bold text-brand tabular-nums">{p.nextMemberNo}</span>
              <span className="text-[16px] font-bold">{handle}</span>
              <span>{gender}</span>
              {age != null && <span>{age}歳</span>}
              <span className="text-sub">確認書類：{photoId}・{subId}</span>
            </div>

            <CheckTile checked={registerOnly} onChange={setRegisterOnly} testId="register-only"
              sub="カップルで2名とも新規の場合は、1人目をこちらで登録し、続けて2人目を「カップル」で受付してください（入会金は2名分）">
              登録のみ（入店しない）
            </CheckTile>

            {!registerOnly && (
              <>
                <p className="mt-5 mb-2 text-[14px] font-bold">区分</p>
                <div className="grid grid-cols-3 gap-3">
                  {(['男性', '女性', 'カップル'] as Category[]).map((c) => (
                    <Choice key={c} selected={cat === c} tone={c === '男性' ? 'male' : c === '女性' ? 'female' : 'brand'} onClick={() => setCategory(c)} className="h-16 text-[17px]">
                      {c}<span className="block text-[12px] font-medium opacity-80">¥{p.today.prices[c].toLocaleString('ja-JP')}</span>
                    </Choice>
                  ))}
                </div>
                {cat === 'カップル' && (
                  <div className="mt-4">
                    <MemberPicker value={partner} onChange={setPartner} />
                    {partner && partner.newToday && (
                      <Notice tone="info" className="mt-2">パートナーは本日登録の新規会員のため、入会金を2名分いただきます。</Notice>
                    )}
                  </div>
                )}

                <div className="mt-5 divide-y divide-line rounded-xl border border-line px-4">
                  {quote?.lines.map((l) => <MoneyRow key={l.label} label={l.label} amount={l.amount} note={l.note} />)}
                  <MoneyRow label="合計" amount={total} strong />
                </div>
                <p className="mt-1.5 text-[12px] text-sub">新規入会のお客様はリピーター割引の対象外です。</p>
              </>
            )}
          </Card>

          {!registerOnly && <CashBox total={total} paid={paid} onPaid={setPaid} />}
        </>
      )}

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      {/* 操作 */}
      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[0_8px_28px_rgba(42,20,80,0.14)] backdrop-blur">
        {step > 0 ? (
          <Button type="button" size="lg" onClick={() => setStep(step - 1)} className="h-14 shrink-0 px-4 sm:px-6"><ArrowLeft className="size-5" />戻る</Button>
        ) : (
          <Link href="/reception" className={cx(buttonCls('ghost', 'lg'), 'h-14 shrink-0 px-3 sm:px-5')}>キャンセル</Link>
        )}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          {!valid[step] && <span className="hidden min-w-0 text-right text-[13px] text-sub sm:inline">{missing[step]}</span>}
          {step < 3 ? (
            <Button type="button" variant="brand" size="lg" disabled={!valid[step]} onClick={() => setStep(step + 1)} className="h-14 w-full shrink-0 text-[17px] sm:w-auto sm:min-w-44" data-testid="next">
              次へ<ArrowRight className="size-5" />
            </Button>
          ) : (
            <form action={action} className="w-full shrink-0 sm:w-auto">
              <input type="hidden" name="payload" value={payload} />
              <Button variant="brand" size="lg" disabled={!valid.every(Boolean) || pending} className="h-14 w-full px-3 text-[16px] sm:min-w-56 sm:px-5 sm:text-[17px]" data-testid="confirm">
                {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
                <span className="sm:hidden">{registerOnly ? '登録を確定' : `確定 ¥${total.toLocaleString('ja-JP')}`}</span>
                <span className="hidden sm:inline">{registerOnly ? '会員登録を確定する' : `入会・入店を確定（¥${total.toLocaleString('ja-JP')}）`}</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function TermsBody({ lines }: { lines: TermsLine[] }) {
  return (
    <div>
      {lines.map((l, i) =>
        'blank' in l ? (
          <div key={i} className="h-3" />
        ) : (
          <p key={i} className={cx(l.bullet && 'pl-[1em] -indent-[1em]', l.level >= 1 && 'font-bold', l.level === 2 && 'underline underline-offset-2')}>
            {l.text}
          </p>
        ),
      )}
    </div>
  )
}
