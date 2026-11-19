'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, LoaderCircle, RotateCcw, TriangleAlert, Upload, Wand2 } from 'lucide-react'
import { findExistingNumbers, importMembers, type ImportResult } from '@/app/(app)/members/actions'
import { Badge, Button, Card, Select, Td, Th, buttonCls, cx } from '@/components/ui'
import { ageOn } from '@/lib/format'
import { IMPORT_FIELDS, ROSTER_PRESET, checkImportRow, detectColumns, isBlankRow, norm, parseDateLoose, type CheckedRow, type ImportKey, type ImportRow } from './rules'

type Mapping = Record<ImportKey, number>
const NONE = -1
const CHUNK = 100
/** 読み込む列の上限（名簿のシートは右側に空の列が数千列あるため、左から60列だけ読む） */
const MAX_COLS = 60
/** 問題の内容から個別の値（「…」）を除いて、種類ごとに数える */
const reasonKind = (s: string) => s.replace(/「[^」]*」/g, '')

/** 既定のシート：「2026.11」のような年.月の名前なら一番新しい月、なければ先頭 */
function defaultSheet(names: string[]) {
  const ym = names
    .map((n) => ({ n, m: n.trim().match(/^(\d{4})\.(\d{1,2})$/) }))
    .filter((x) => x.m)
    .sort((a, b) => +b.m![1] * 100 + +b.m![2] - (+a.m![1] * 100 + +a.m![2]))
  return ym[0]?.n ?? names[0]
}
const colName = (i: number) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** セルの値を文字列に（日付列はExcelのシリアル値も日付に直す） */
function cellText(v: unknown, asDate: boolean): string {
  if (v === null || v === undefined) return ''
  if (asDate) {
    if (typeof v === 'number' && v >= 61 && v <= 80000) return parseDateLoose(v) ?? String(v)
    if (v instanceof Date) return parseDateLoose(v) ?? ''
  }
  return norm(v)
}

interface Sheet {
  fileName: string
  sheetName: string
  rows: unknown[][]
  /** シート上の先頭行の行番号（1始まり） */
  firstLine: number
  headerIdx: number
}

export function ImportClient({ prefix, todayJst, joinDefault, storeName }: { prefix: string; todayJst: string; joinDefault: string; storeName: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [parseError, setParseError] = useState('')
  const [existing, setExisting] = useState<Set<string> | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<(ImportResult & { failed?: string }) | null>(null)
  const [drag, setDrag] = useState(false)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bookRef = useRef<{ name: string; buf: ArrayBuffer } | null>(null)

  /** 1 シート分の行を取り出し、見出し行と列の対応を推定する */
  function loadRows(XLSX: typeof import('xlsx'), ws: import('xlsx').WorkSheet | undefined, fileName: string, sheetName: string) {
    if (!ws || !ws['!ref']) throw new Error('シートが空です')
    const ref = XLSX.utils.decode_range(ws['!ref'])
    const first = ref.s.r
    const range = { s: { r: ref.s.r, c: 0 }, e: { r: ref.e.r, c: Math.min(ref.e.c, MAX_COLS - 1) } }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true, range })
    if (!rows.some((r) => r.some((c) => norm(c)))) throw new Error('データがありません')
    // 見出し行を探す（先頭10行のうち、項目名が最も多く見つかった行）
    let headerIdx = -1
    let best = 1
    rows.slice(0, 10).forEach((r, i) => {
      const n = Object.keys(detectColumns(r)).length
      if (n > best) {
        best = n
        headerIdx = i
      }
    })
    const detected = headerIdx >= 0 ? detectColumns(rows[headerIdx]) : {}
    const m = Object.fromEntries(
      IMPORT_FIELDS.map((f, i) => [f.key, detected[f.key] ?? (headerIdx < 0 ? i : NONE)]),
    ) as Mapping
    setSheet({ fileName, sheetName, rows, firstLine: first + 1, headerIdx })
    setMapping(m)
  }

  async function readFile(file: File) {
    setParseError('')
    setResult(null)
    setExisting(null)
    setSheetNames([])
    bookRef.current = null
    setLoading(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      if (/\.(csv|txt)$/i.test(file.name)) {
        // CSV は UTF-8 / Shift_JIS（Excel の既定）の両方に対応
        let text: string
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
        } catch {
          text = new TextDecoder('shift_jis').decode(buf)
        }
        const wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', raw: true })
        loadRows(XLSX, wb.Sheets[wb.SheetNames[0]], file.name, wb.SheetNames[0])
      } else {
        // シートが多い名簿でも重くならないよう、シート名だけ先に読み、選んだシートだけを読み込む
        const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames
        if (!names.length) throw new Error('シートがありません')
        bookRef.current = { name: file.name, buf }
        setSheetNames(names)
        const name = defaultSheet(names)
        const wb = XLSX.read(buf, { type: 'array', sheets: name, dense: true })
        loadRows(XLSX, wb.Sheets[name], file.name, name)
      }
    } catch (e) {
      setSheet(null)
      setMapping(null)
      setParseError(`ファイルを読み込めませんでした：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  async function changeSheet(name: string) {
    const book = bookRef.current
    if (!book) return
    setLoading(true)
    setExisting(null)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(book.buf, { type: 'array', sheets: name, dense: true })
      loadRows(XLSX, wb.Sheets[name], book.name, name)
      setParseError('')
    } catch (e) {
      setParseError(`シート「${name}」を読み込めませんでした：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  // 列の対応に従って 1 行ずつチェック
  const { checked, blank } = useMemo<{ checked: CheckedRow[]; blank: number }>(() => {
    if (!sheet || !mapping) return { checked: [], blank: 0 }
    const get = (r: unknown[], k: ImportKey, asDate = false) => (mapping[k] >= 0 ? cellText(r[mapping[k]], asDate) : '')
    const out: CheckedRow[] = []
    let blank = 0
    sheet.rows.forEach((r, i) => {
      if (i <= sheet.headerIdx || !r.some((c) => norm(c))) return
      const raw: ImportRow = {
        line: sheet.firstLine + i,
        memberNo: get(r, 'memberNo'), handleName: get(r, 'handleName'), kana: get(r, 'kana'), realName: get(r, 'realName'), gender: get(r, 'gender'),
        birthday: get(r, 'birthday', true), joinedAt: get(r, 'joinedAt', true), memo: get(r, 'memo'), ban: get(r, 'ban'),
      }
      // 番号だけの行（名簿の空き番号）や、計算用のセルだけの行は対象にしない
      if (isBlankRow(raw)) {
        blank++
        return
      }
      out.push(checkImportRow(raw, prefix, todayJst, joinDefault))
    })
    // ファイル内の重複
    const count = new Map<string, number>()
    for (const c of out) if (c.memberNo) count.set(c.memberNo, (count.get(c.memberNo) ?? 0) + 1)
    for (const c of out) if (c.memberNo && (count.get(c.memberNo) ?? 0) > 1) c.errors.push('ファイル内で会員番号が重複')
    return { checked: out, blank }
  }, [sheet, mapping, prefix, todayJst, joinDefault])

  // 登録済みの番号を確認
  const numbersKey = useMemo(() => [...new Set(checked.map((c) => c.memberNo).filter(Boolean))].join('\n'), [checked])
  useEffect(() => {
    if (!numbersKey) return
    let alive = true
    findExistingNumbers(numbersKey.split('\n'))
      .then((nos) => alive && setExisting(new Set(nos)))
      .catch(() => alive && setExisting(new Set()))
    return () => {
      alive = false
      setExisting(null)
    }
  }, [numbersKey])

  const rows = useMemo(
    () => checked.map((c) => (existing?.has(c.memberNo) ? { ...c, errors: [...c.errors, '既に登録済みの会員番号'] } : c)),
    [checked, existing],
  )
  const okRows = rows.filter((r) => !r.errors.length)
  const errRows = rows.length - okRows.length
  const warnRows = okRows.filter((r) => r.warnings.length).length
  const missingRequired = mapping ? IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] < 0) : []
  const bannedRows = okRows.filter((r) => r.banned).length
  // 問題の種類ごとの件数（エラー＝取り込まない、注意＝取り込む）
  const reasons = useMemo(() => {
    const m = new Map<string, { kind: 'error' | 'warning'; n: number }>()
    for (const r of rows) {
      for (const e of r.errors) {
        const k = reasonKind(e)
        m.set(k, { kind: 'error', n: (m.get(k)?.n ?? 0) + 1 })
      }
      if (!r.errors.length) {
        for (const w of r.warnings) {
          const k = reasonKind(w)
          m.set(k, { kind: 'warning', n: (m.get(k)?.n ?? 0) + 1 })
        }
      }
    }
    return [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => Number(a.kind === 'warning') - Number(b.kind === 'warning') || b.n - a.n)
  }, [rows])

  /** 問題のある行の一覧を Excel で保存（名簿を直して取り込み直すため） */
  async function downloadProblems() {
    const XLSX = await import('xlsx')
    const list = rows.filter((r) => r.errors.length || r.warnings.length)
    const ws = XLSX.utils.aoa_to_sheet([
      ['行', '判定', '会員番号', 'ハンドルネーム', '内容'],
      ...list.map((r) => [r.line, r.errors.length ? 'エラー（取り込まない）' : '注意（取り込む）', r.memberNo, r.handleName, (r.errors.length ? r.errors : r.warnings).join('・')]),
    ])
    ws['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 60 }]
    ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '確認が必要な行')
    XLSX.writeFile(wb, `取込チェック_${sheet?.sheetName ?? ''}_${todayJst.replaceAll('-', '')}.xlsx`)
  }

  async function runImport() {
    if (!okRows.length) return
    const payload: ImportRow[] = okRows.map((r) => ({
      line: r.line, memberNo: r.memberNo, handleName: r.handleName, kana: r.kana, realName: r.realName, gender: r.gender ?? '', birthday: r.birthday ?? '',
      joinedAt: r.joinedAt, memo: r.memo, ban: r.banned ? '出禁' : '',
    }))
    const agg: ImportResult & { failed?: string } = { inserted: 0, skipped: [] }
    setProgress({ done: 0, total: payload.length })
    for (let i = 0; i < payload.length; i += CHUNK) {
      try {
        const r = await importMembers(payload.slice(i, i + CHUNK))
        agg.inserted += r.inserted
        agg.skipped.push(...r.skipped)
      } catch {
        agg.failed = `${i + 1}件目以降の取込中にエラーが発生しました。会員一覧で取り込まれた件数を確認してください。`
        break
      }
      setProgress({ done: Math.min(i + CHUNK, payload.length), total: payload.length })
    }
    agg.skipped.push(...rows.filter((r) => r.errors.length).map((r) => ({ line: r.line, memberNo: r.memberNo, reason: r.errors.join('・') })))
    agg.skipped.sort((a, b) => a.line - b.line)
    setProgress(null)
    setResult(agg)
  }

  function reset() {
    setSheet(null)
    setMapping(null)
    setResult(null)
    setExisting(null)
    setSheetNames([])
    bookRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      IMPORT_FIELDS.map((f) => f.label),
      ['10001', 'タカ', 'タカ', '', '男性', '1985/04/12', '2023/05/20', '番号で呼ぶこと', ''],
      ['10002', 'ミキ', 'ミキ', '', '女性', '1992/11/03', '2024/01/08', '', ''],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 10 }]
    const help = XLSX.utils.aoa_to_sheet([
      ['項目', '必須', '書き方'],
      ['会員番号', '必須', `紙の会員カードの番号。数字だけでも可（自動で「${prefix}」が付きます）`],
      ['ハンドルネーム', '必須', '受付で呼ぶお名前（40文字以内）'],
      ['フリガナ', '', 'ハンドルネームの読み（検索に使います）'],
      ['本名', '', '40文字以内'],
      ['性別', '必須', '男性／女性（男・女、M・F でも可）'],
      ['生年月日', '', '1985/04/12 の形式（和暦 S60.4.12 も可）。20歳未満は登録できません'],
      ['入会日', '', '空欄の場合は取込日になります'],
      ['メモ（紹介者・備考）', '', 'スタッフ間の申し送り・紹介者など（500文字以内）'],
      ['出禁の印', '', '「出禁」と書かれた会員は出入禁止として登録します'],
      [],
      ['※ サンプル行（10001・10002）は消してからご記入ください。1行目の項目名は変えないでください。'],
    ])
    help['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 70 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '会員一覧')
    XLSX.utils.book_append_sheet(wb, help, '記入方法')
    XLSX.writeFile(wb, '会員取込テンプレート.xlsx')
  }

  const header = sheet && sheet.headerIdx >= 0 ? sheet.rows[sheet.headerIdx] : null
  const width = sheet ? Math.max(...sheet.rows.slice(0, 50).map((r) => r.length), 1) : 0
  const shown = onlyErrors ? rows.filter((r) => r.errors.length) : rows

  /* ------------------------------ 取込結果 ------------------------------ */
  if (result) {
    return (
      <Card title="取込結果">
        <div className={cx('flex items-center gap-4 rounded-xl px-5 py-4', result.inserted ? 'bg-[#effaf3]' : 'bg-page')}>
          <CircleCheck className={cx('size-9', result.inserted ? 'text-ok' : 'text-mute')} />
          <div>
            <p className="text-[18px] font-bold">{result.inserted}件の会員を取り込みました</p>
            <p className="text-[13px] text-sub">{storeName}・取り込まなかった行 {result.skipped.length}件</p>
          </div>
        </div>
        {result.failed && <p role="alert" className="mt-3 rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{result.failed}</p>}
        {result.skipped.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8f6fc]"><tr><Th>行</Th><Th>会員番号</Th><Th>取り込まなかった理由</Th></tr></thead>
              <tbody>
                {result.skipped.map((s) => (
                  <tr key={`${s.line}-${s.memberNo}`} className="border-t border-line">
                    <Td className="tabular-nums">{s.line}行目</Td><Td className="font-medium tabular-nums">{s.memberNo || '—'}</Td><Td className="whitespace-normal text-up">{s.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/members" className={buttonCls('brand', 'lg')}>会員一覧を見る</Link>
          <Button size="lg" onClick={reset}><RotateCcw className="size-4" />別のファイルを取り込む</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="1. ファイルを選ぶ">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files?.[0]
              if (f) readFile(f)
            }}
            className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition',
              drag ? 'border-brand bg-brand-soft' : 'border-brand-light/70 bg-[#fbf9fe] hover:border-brand hover:bg-brand-soft/60')}
          >
            <Upload className="size-8 text-brand" />
            <span className="text-[15px] font-bold">{loading ? '読み込み中…' : sheet ? sheet.fileName : 'Excel（.xlsx / .xls）または CSV ファイルを選択'}</span>
            <span className="text-[12px] text-sub">{sheet ? `「${sheet.sheetName}」の${rows.length}行を読み込みました・別のファイルを選ぶ場合はクリック` : 'ここにドラッグ＆ドロップしても読み込めます'}</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f) }} />
          </label>
          {sheetNames.length > 1 && (
            <label className="mt-3 flex items-center gap-3">
              <span className="shrink-0 text-[13px] font-medium text-sub">読み込むシート</span>
              <Select value={sheet?.sheetName ?? ''} disabled={loading} onChange={(e) => changeSheet(e.target.value)} data-testid="import-sheet">
                {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
          )}
          {parseError && <p role="alert" className="mt-3 rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{parseError}</p>}
          <p className="mt-3 text-[12px] leading-relaxed text-sub">
            1行目に「会員番号・ハンドルネーム・性別・生年月日・入会日・メモ」などの見出しがあれば自動で対応付けます。
            店舗の会員名簿（.xls）は、シートを選んで「店舗の会員名簿の並びに合わせる」を押してください（保険証の番号の列は取り込みません）。
            ファイルの内容はこの端末の中で読み取り、確認後に取り込む行だけを送信します。
          </p>
        </Card>
        <Card title="テンプレート" className="self-start">
          <p className="text-[13px] text-sub">記入用の Excel ファイルです。「記入方法」シートに書き方の説明があります。</p>
          <Button size="lg" variant="outline" className="mt-3 w-full" onClick={downloadTemplate}><FileSpreadsheet className="size-4" />テンプレートをダウンロード</Button>
        </Card>
      </div>

      {sheet && mapping && (
        <Card title="2. 列の対応を確認"
          action={<Button size="sm" variant="soft" data-testid="roster-preset" onClick={() => setMapping(Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, ROSTER_PRESET[f.key] < width ? ROSTER_PRESET[f.key] : NONE])) as Mapping)}><Wand2 className="size-3.5" />店舗の会員名簿の並びに合わせる</Button>}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-sub">{f.label}{f.required && <span className="ml-1 text-up">*</span>}</span>
                <Select value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                  className={cx(f.required && mapping[f.key] < 0 && 'border-up')}>
                  <option value={NONE}>（使わない）</option>
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>{colName(i)}列{header?.[i] !== undefined && norm(header[i]) ? `：${norm(header[i])}` : ''}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {sheet.headerIdx < 0 && <p className="mt-3 text-[12px] text-[#b7791f]">見出し行が見つからなかったため、左の列から順に対応付けました。内容を確認してください。</p>}
          {missingRequired.length > 0 && <p role="alert" className="mt-3 text-[13px] font-medium text-up">必須の項目（{missingRequired.map((f) => f.label).join('・')}）の列を選んでください。</p>}
        </Card>
      )}

      {sheet && mapping && (
        <Card title="3. 内容を確認して取り込む" bodyClass="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <span className="flex items-center gap-1.5 text-[14px]"><CircleCheck className="size-4 text-ok" />取込できる行 <b className="text-[18px] text-ok tabular-nums">{okRows.length}</b>件</span>
            <span className="flex items-center gap-1.5 text-[14px]"><CircleAlert className="size-4 text-up" />エラー <b className="text-[18px] text-up tabular-nums">{errRows}</b>件</span>
            {warnRows > 0 && <span className="flex items-center gap-1.5 text-[13px] text-[#b7791f]"><TriangleAlert className="size-4" />注意 {warnRows}件（取込可）</span>}
            {bannedRows > 0 && <span className="text-[13px] text-sub">うち出禁 <b className="text-up tabular-nums">{bannedRows}</b>件</span>}
            {blank > 0 && <span className="text-[12px] text-sub">番号だけの行（空き番号など）{blank}件は対象外</span>}
            {!existing && rows.length > 0 && <span className="flex items-center gap-1.5 text-[12px] text-sub"><LoaderCircle className="size-3.5 animate-spin" />登録済みの番号を確認中…</span>}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-[13px] text-sub">
              <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="size-4 accent-[#6d35c9]" />エラーの行だけ表示
            </label>
          </div>
          {reasons.length > 0 && (
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-line bg-[#fffaf5] px-5 py-3" data-testid="import-reasons">
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                {reasons.map((r) => (
                  <li key={r.label} className={r.kind === 'error' ? 'text-up' : 'text-[#b7791f]'}>{r.label} <b className="tabular-nums">{r.n}</b>件</li>
                ))}
              </ul>
              <Button size="sm" className="ml-auto" onClick={downloadProblems} data-testid="import-problems"><Download className="size-3.5" />確認が必要な行をExcelで保存</Button>
            </div>
          )}
          {shown.length ? (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#f8f6fc]">
                  <tr><Th>行</Th><Th>判定</Th><Th>会員番号</Th><Th>ハンドルネーム</Th><Th>本名</Th><Th>性別</Th><Th>生年月日</Th><Th>入会日</Th><Th>メモ</Th><Th>内容</Th></tr>
                </thead>
                <tbody className="tabular-nums">
                  {shown.slice(0, 1000).map((r) => (
                    <tr key={r.line} className={cx('border-t border-line align-top', r.errors.length > 0 && 'bg-[#fff6f8]')}>
                      <Td className="text-sub">{r.line}</Td>
                      <Td>{r.errors.length ? <Badge tone="red">エラー</Badge> : r.warnings.length ? <Badge tone="amber">注意</Badge> : <Badge tone="green">OK</Badge>}</Td>
                      <Td className="font-bold">{r.memberNo || <span className="text-mute">—</span>}</Td>
                      <Td className="max-w-40 truncate">
                        {r.handleName || <span className="text-mute">—</span>}{r.banned && <Badge tone="red" className="ml-1.5">出禁</Badge>}
                        {r.kana && <span className="block text-[11px] text-sub">{r.kana}</span>}
                      </Td>
                      <Td className="max-w-32 truncate">{r.realName || <span className="text-mute">—</span>}</Td>
                      <Td>{r.gender ?? <span className="text-mute">—</span>}</Td>
                      <Td>{r.birthday ? <>{r.birthday.replaceAll('-', '/')}<span className="ml-1 text-[11px] text-sub">{ageOn(r.birthday, todayJst)}歳</span></> : <span className="text-mute">—</span>}</Td>
                      <Td>{r.joinedAt.replaceAll('-', '/')}</Td>
                      <Td className="max-w-48 truncate text-sub">{r.memo}</Td>
                      <Td className="min-w-48 whitespace-normal">
                        {r.errors.map((e) => <span key={e} className="block text-[12px] font-medium text-up">{e}</span>)}
                        {r.warnings.map((w) => <span key={w} className="block text-[12px] text-[#b7791f]">{w}</span>)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 1000 && <p className="px-5 py-3 text-[12px] text-sub">先頭1,000行を表示しています（取込はすべての行が対象です）。</p>}
            </div>
          ) : <p className="py-10 text-center text-[13px] text-mute">{onlyErrors ? 'エラーの行はありません' : '取り込む行がありません'}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
            <Button variant="brand" size="lg" className="min-w-56" onClick={runImport}
              disabled={!okRows.length || !existing || !!progress || missingRequired.length > 0}>
              {progress ? <LoaderCircle className="size-5 animate-spin" /> : <Upload className="size-5" />}
              {progress ? `取込中… ${progress.done}/${progress.total}` : `${okRows.length}件を取り込む`}
            </Button>
            {progress && (
              <div className="h-2 w-48 overflow-hidden rounded-full bg-brand-soft">
                <div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            )}
            <span className="text-[12px] text-sub">エラーの行は取り込まれません。取り込んだ会員の規約は「紙」として登録されます。</span>
          </div>
        </Card>
      )}
    </div>
  )
}
