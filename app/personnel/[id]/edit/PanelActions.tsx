"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";

/**
 * 候補者詳細の「上部アイコン」と「事前面談の準備パネル」をつなぐ小さな仕組み。
 *
 * モーダルの開閉状態は各アイコンのコンポーネント (ExtractPanel など) が持っているため、
 * 準備パネルのステップカードからは直接開けない。
 * そこで各アイコンが「自分を開く関数」をここに登録し、
 * ステップカードは key を指定して呼び出すだけにする。
 *
 * 例: 準備パネルの「1. 履歴書取込」をクリック → trigger("extract") → AI取込モーダルが開く
 */

export const PANEL_ACTION = {
  extract: "extract",
  japaneseCheck: "japanese-check",
  intakeForm: "intake-form",
} as const;

export type PanelActionKey = (typeof PANEL_ACTION)[keyof typeof PANEL_ACTION];

type PanelActionsValue = {
  /** 開く関数を登録する。戻り値は解除用 (useEffect の cleanup にそのまま返せる) */
  register: (key: PanelActionKey, open: () => void) => () => void;
  /** 登録済みの開く関数を呼ぶ。未登録なら何もしない */
  trigger: (key: PanelActionKey) => void;
};

const PanelActionsContext = createContext<PanelActionsValue | null>(null);

export function PanelActionsProvider({ children }: { children: React.ReactNode }) {
  // 再レンダリングを起こさずに関数を出し入れしたいので ref に持つ
  const openers = useRef(new Map<PanelActionKey, () => void>());

  const register = useCallback((key: PanelActionKey, open: () => void) => {
    openers.current.set(key, open);
    return () => {
      // 別のコンポーネントに置き換わっている場合は消さない
      if (openers.current.get(key) === open) openers.current.delete(key);
    };
  }, []);

  const trigger = useCallback((key: PanelActionKey) => {
    openers.current.get(key)?.();
  }, []);

  const value = useMemo(() => ({ register, trigger }), [register, trigger]);
  return <PanelActionsContext.Provider value={value}>{children}</PanelActionsContext.Provider>;
}

/** Provider の外でも落ちないよう null を返す (アイコン単体で使う場合を許容) */
export function usePanelActions(): PanelActionsValue | null {
  return useContext(PanelActionsContext);
}
