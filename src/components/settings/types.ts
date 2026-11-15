// サーバーアクションの戻り値（設定系フォーム共通）
export type ActionState =
  | {
      ok?: boolean
      message?: string
      error?: string
      /** 一度だけ表示する値（発行したパスワードなど） */
      secret?: string
      /** secret の補足（ログインIDなど） */
      subject?: string
    }
  | undefined
