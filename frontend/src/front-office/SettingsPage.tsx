import { useState, type CSSProperties } from "react";
import { Check, ChevronRight, LoaderCircle, Palette as PaletteIcon, Settings } from "lucide-react";
import { updateHotelTheme, useHotelProfile } from "../lib/property";
import { applyPalette, DEFAULT_PALETTE, PALETTES, type Palette, type PaletteColors } from "../lib/theme";
import "./settings.css";

const SWATCH_ORDER: (keyof PaletteColors)[] = ["navy", "steel", "gold", "ivory", "stone"];

export default function SettingsPage() {
  const hotel = useHotelProfile();
  const active = hotel?.theme || DEFAULT_PALETTE;
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const choose = async (palette: Palette) => {
    if (palette.key === active || saving) return;
    const previous = active;
    applyPalette(palette.key);          // show it straight away
    setSaving(palette.key); setError("");
    try { await updateHotelTheme(palette.key); }
    catch (reason) { applyPalette(previous); setError(reason instanceof Error ? reason.message : "Unable to save the colour palette."); }
    finally { setSaving(null); }
  };

  return <div className="st-page">
    <header className="st-hero">
      <nav className="st-crumbs" aria-label="Breadcrumb"><Settings size={18}/><ChevronRight size={15}/><span>Settings</span></nav>
      <h1>Appearance</h1>
      <p>Choose the colour palette for {hotel?.name || "your hotel"}. It applies to every screen, for all staff.</p>
    </header>

    {error && <p className="st-error" role="alert">{error}</p>}

    <section className="st-palettes" aria-label="Colour palettes">
      {PALETTES.map(palette => {
        const selected = palette.key === active;
        const vars = { "--p-navy": palette.colors.navy, "--p-steel": palette.colors.steel, "--p-gold": palette.colors.gold, "--p-photo": `url('${palette.photo}')` } as CSSProperties;
        return <article key={palette.key} className={`st-palette${selected ? " is-active" : ""}`} style={vars}>
          <div className="st-banner">
            <button type="button" className="st-use" aria-pressed={selected} disabled={selected || (saving !== null && saving !== palette.key)} onClick={() => void choose(palette)}>
              {saving === palette.key ? <><LoaderCircle size={15} className="st-spin"/>Applying</> : selected ? <><Check size={15}/>In use</> : "Use"}
            </button>
          </div>
          <div className="st-palette-title"><h2>{palette.name}</h2><p>{palette.mood}</p></div>
          <ul className="st-swatches">
            {SWATCH_ORDER.map(name => <li key={name}><span style={{ background: palette.colors[name] }}/><b>{palette.labels[name]}</b><small>{palette.colors[name]}</small></li>)}
            <li><span style={{ background: "#D9EDE2" }}/><b>Available</b><small>#D9EDE2</small></li>
          </ul>
        </article>;
      })}
    </section>
    <p className="st-note"><PaletteIcon size={15}/>Status colours (available, occupied, cancelled) stay the same in every palette so they are always easy to read.</p>
  </div>;
}
