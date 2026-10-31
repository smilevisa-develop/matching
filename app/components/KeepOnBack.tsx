"use client";

/**
 * ブラウザの「戻る / 進む」で、前にいたときの状態に戻す。
 *   - スクロール位置: 画面は <main> の中でスクロールするのでブラウザ任せでは戻らない。カンバンの列や横スクロールの表も同じ
 *   - 検索語・絞り込みなど: useKeptState を使っている state
 * サイドバーやリンクから開き直したときは、今までどおり初期状態で開く。
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Saved = Record<string, [number, number]>;

const RESTORE_WINDOW_MS = 10_000;
const RETRY_MS = 3_000;

let restoreUntil = 0;
let hydrated = false;

// ページごと読み直された「戻る」(詳細画面で再読み込みしたあとなど)。読み込み直後だけ有効にする
if (typeof window !== "undefined") {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === "back_forward") restoreUntil = Date.now() + RESTORE_WINDOW_MS;
}

const restoring = () => Date.now() < restoreUntil;

function readStorage<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても画面は動かす
  }
}

const stateKey = (name: string) => `keep:state:${window.location.pathname}:${name}`;

/** useState と同じ使い方。戻る / 進むで開いたときだけ、前の値から始まる */
export function useKeptState<T>(name: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!hydrated || !restoring()) return initial;
    const saved = readStorage<T>(stateKey(name));
    return saved === undefined ? initial : saved;
  });
  // ページごと読み直された「戻る」は、サーバーの HTML と合わせるため描画のあとで戻す
  const late = useRef(!hydrated);

  useEffect(() => {
    if (late.current) {
      late.current = false;
      const saved = restoring() ? readStorage<T>(stateKey(name)) : undefined;
      if (saved !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- サーバーの HTML と合わせたあとで戻す
        setValue(saved);
        return;
      }
    }
    writeStorage(stateKey(name), value);
  }, [name, value]);

  return [value, setValue] as const;
}

/** <main> からの位置 (子の番号の並び) で、スクロールしている要素を覚える */
function pathOf(el: Element, main: Element): string | null {
  const parts: number[] = [];
  let cur: Element = el;
  while (cur !== main) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    parts.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return parts.join("/");
}

function elementAt(path: string, main: Element): Element | null {
  let cur: Element | null = main;
  for (const part of path ? path.split("/") : []) cur = cur?.children[Number(part)] ?? null;
  return cur;
}

export default function KeepOnBack() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // チャットは最新のメッセージまで自動でスクロールするので対象外
  const enabled = pathname !== "/chat";
  const url = `${pathname}?${search}`;

  const saved = useRef<Saved>({});
  const paused = useRef(false);
  const cancelRestore = useRef<(() => void) | null>(null);

  useEffect(() => {
    hydrated = true;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      restoreUntil = Date.now() + RESTORE_WINDOW_MS;
    };
    const onClick = () => {
      restoreUntil = 0;
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onScroll = (e: Event) => {
      if (paused.current) return;
      const main = document.querySelector("main");
      const target = e.target;
      if (!main || !(target instanceof Element) || !main.contains(target)) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const path = pathOf(target, main);
      if (path === null) return;
      saved.current[path] = [target.scrollTop, target.scrollLeft];
      writeStorage(`keep:scroll:${url}`, saved.current);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [enabled, url]);

  useLayoutEffect(() => {
    cancelRestore.current?.();
    if (!enabled) return;
    const key = `keep:scroll:${url}`;
    const target = restoring() ? readStorage<Saved>(key) : undefined;
    saved.current = target ?? {};
    if (!target) {
      // 開き直したときは上から。前の位置は捨てる
      writeStorage(key, {});
      return;
    }

    // 中身があとから伸びることがあるので、届くまで何度か合わせる。自分で動かし始めたらやめる
    paused.current = true;
    const startedAt = Date.now();
    let raf = 0;
    const stop = () => {
      paused.current = false;
      cancelAnimationFrame(raf);
      for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) window.removeEventListener(type, stop, true);
      cancelRestore.current = null;
    };
    const step = () => {
      const main = document.querySelector("main");
      let done = !!main;
      if (main) {
        for (const [path, [top, left]] of Object.entries(target)) {
          const el = elementAt(path, main);
          if (!el) {
            done = false;
            continue;
          }
          el.scrollTop = top;
          el.scrollLeft = left;
          if (Math.abs(el.scrollTop - top) > 2 || Math.abs(el.scrollLeft - left) > 2) done = false;
        }
      }
      if (done || Date.now() - startedAt > RETRY_MS) stop();
      else raf = requestAnimationFrame(step);
    };
    for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) window.addEventListener(type, stop, true);
    cancelRestore.current = stop;
    step();
  }, [enabled, url]);

  return null;
}
