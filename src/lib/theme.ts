// 画面の明るさの設定（Cookie に保存し、サーバー描画の時点で反映してちらつきを防ぐ）
export const THEME_COOKIE = 'hs_theme'
export type ThemePref = 'light' | 'dark' | 'system'

export const parseThemePref = (v: string | undefined): ThemePref => (v === 'dark' || v === 'system' ? v : 'light')

/**
 * 最初の描画前に実行するスクリプト（「端末の設定に合わせる」の判定・印刷用ページは常にライト）
 * <html data-theme-pref="..."> を読んで data-theme を確定させる
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,p=d.getAttribute('data-theme-pref')||'light';var k=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(location.pathname.indexOf('/print/')===0)k=false;d.setAttribute('data-theme',k?'dark':'light');}catch(e){}})();`
