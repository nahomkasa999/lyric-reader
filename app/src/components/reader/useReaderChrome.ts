// The chrome (v4.13): the top bar, the progress hairline, the bottom
// nav — one state, one idle timer.
//
// Hidden means opacity 0 and no pointer events: an invisible bar must
// never intercept a tap. The timer re-arms itself while the page field
// is being edited or the overflow menu is open.
import { useCallback, useEffect, useRef, useState } from "react";

export interface ReaderChrome {
  /** the chrome is on screen */
  visible: boolean;
  /** mirrors `visible`, for the handlers that read it */
  shown: React.RefObject<boolean>;
  show: (ms?: number) => void;
  hide: () => void;
  /** the overflow menu is open */
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** the page field is being edited — it owns the keys */
  editing: React.RefObject<boolean>;
}

export function useReaderChrome(): ReaderChrome {
  const [visible, setVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const editing = useRef(false);
  const shown = useRef(false);
  const timer = useRef<number | null>(null);
  const menuRef = useRef(menuOpen);
  menuRef.current = menuOpen;

  const show = useCallback((ms = 2500) => {
    shown.current = true;
    setVisible(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // The page field is being edited — the bar must stay put.
      if (editing.current) {
        show(2500);
        return;
      }
      // The overflow menu is open — the bar must stay put.
      if (menuRef.current) {
        show(2500);
        return;
      }
      shown.current = false;
      setVisible(false);
      setMenuOpen(false);
    }, ms);
  }, []);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    shown.current = false;
    setVisible(false);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { visible, shown, show, hide, menuOpen, setMenuOpen, editing };
}
