import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import { PublicMenuView } from "../pages/PublicMenuPage";
import "./menuPreview.css";

// three.js is only downloaded when someone opens the menu preview.
const FoodSplash = lazy(() => import("./FoodSplash"));

/** The guest menu inside a popup: a 3-second 3D welcome, then the live menu (with ordering) in the same window. */
export default function MenuPreviewModal({ code, hotelName, url, onClose }: { code: string; hotelName: string; url: string; onClose: () => void }) {
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered on <body> so animated dashboard cards cannot clip or trap the popup.
  return createPortal(<div className="mp-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mp-window" role="dialog" aria-modal="true" aria-label={`${hotelName} menu`}>
      <header className="mp-bar">
        <strong>{hotelName} · Menu</strong>
        <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Open in new tab</a>
        <button type="button" onClick={onClose} aria-label="Close"><X size={18}/></button>
      </header>
      <div className="mp-body">
        {splash
          ? <Suspense fallback={<div className="mp-loading"><LoaderCircle size={24} className="mp-spin"/></div>}><FoodSplash hotelName={hotelName} onDone={() => setSplash(false)}/></Suspense>
          : <div className="mp-menu"><PublicMenuView code={code} embedded/></div>}
      </div>
    </section>
  </div>, document.body);
}
