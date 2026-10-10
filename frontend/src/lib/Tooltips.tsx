import { useEffect, useRef, useState } from "react";

type Tip = { text: string; x: number; y: number; placement: "top" | "bottom" | "right" };

/**
 * Replaces the browser's plain tooltips with themed ones across the app.
 * Any element with a `title` keeps working as before: on hover or keyboard focus its title
 * moves to `data-tip` (so the native tooltip stays away) and is shown in a styled bubble.
 */
export default function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const adopt = (element: Element) => {
      const title = element.getAttribute("title");
      if (title) {
        element.setAttribute("data-tip", title);
        element.removeAttribute("title");
        // Icon-only controls relied on the title for their name.
        if (!element.getAttribute("aria-label") && !element.textContent?.trim()) element.setAttribute("aria-label", title);
      }
      return element.getAttribute("data-tip");
    };
    const hide = () => { window.clearTimeout(timer.current); current.current = null; setTip(null); };
    const show = (element: Element, delay: number) => {
      const text = adopt(element);
      if (!text) return;
      window.clearTimeout(timer.current);
      current.current = element;
      timer.current = window.setTimeout(() => {
        if (current.current !== element || !element.isConnected) return;
        const box = element.getBoundingClientRect();
        // Sidebar items sit at the screen edge, so their tips open to the right of the menu.
        const sidebar = element.closest(".sh-sidebar");
        if (sidebar) { setTip({ text, x: Math.max(box.right, sidebar.getBoundingClientRect().right) + 10, y: box.top + box.height / 2, placement: "right" }); return; }
        const placement = box.top > 56 ? "top" : "bottom";
        const x = Math.min(window.innerWidth - 12, Math.max(12, box.left + box.width / 2));
        setTip({ text, x, y: placement === "top" ? box.top - 8 : box.bottom + 8, placement });
      }, delay);
    };
    const target = (event: Event) => (event.target instanceof Element ? event.target.closest("[title], [data-tip]") : null);
    const onOver = (event: PointerEvent) => {
      const element = target(event);
      if (element && element !== current.current) show(element, 280);
      else if (!element && current.current) hide();
    };
    const onFocus = (event: FocusEvent) => { const element = target(event); if (element && (event.target as Element).matches(":focus-visible")) show(element, 0); };
    const onOut = (event: FocusEvent) => { if (current.current && current.current === target(event)) hide(); };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  return <div className={`th-tooltip is-${tip.placement}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}
