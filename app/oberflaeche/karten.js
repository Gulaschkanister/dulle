// Karten zeichnen (Spec 011, 020; Mockup „Spieltisch“). Aussehen kommt aus dem Kartensatz, nie aus dem Code.
// Eigene Gestaltung (Fotos, Elemente) liegt unter den Ecken; Rang und Symbole stehen immer obenauf.
import { FORM_PFAD, HOEHE, BREITE, STICKER } from "../kern/kartengestaltung.js";
import { kartenAnsicht, pruefeKartensatz } from "../kern/kartensatz.js";
import { leseLokal, schreibeLokal } from "./app.js";
import { h } from "./dom.js";
export const KARTENSATZ_IDS = ["franzoesisch", "deutsch", "vierfarben"];
const GEWAEHLT = "dulle.kartensatz";
/** Spec 020: eigene Kartensätze im Einstellungs-Speicher (IndexedDB), nicht in localStorage (Fotos sind zu groß). */
const EIGENE = "eigeneKartensaetze";
const saetze = new Map();
let eigene = [];
let speicher = null;
/** Lädt die mitgelieferten Kartensätze (offline aus dem Service-Worker-Cache) und die eigenen. */
export async function ladeKartensaetze(s) {
    await Promise.all(KARTENSATZ_IDS.map(async (id) => {
        try {
            const antwort = await fetch(`kartensaetze/${id}.json`);
            const r = pruefeKartensatz(await antwort.json());
            if (r.ok)
                saetze.set(id, r.satz);
        }
        catch {
            // Fehlt ein Satz, bleibt die Auswahl bei den anderen.
        }
    }));
    if (s) {
        speicher = s;
        const gespeichert = (await s.einstellung(EIGENE)) ?? [];
        eigene = gespeichert.map((x) => pruefeKartensatz(x)).flatMap((r) => (r.ok ? [r.satz] : []));
    }
}
export function mitgelieferteKartensaetze() {
    return KARTENSATZ_IDS.map((id) => saetze.get(id)).filter((s) => s !== undefined);
}
export function eigeneKartensaetze() { return eigene; }
export function alleKartensaetze() {
    return [...mitgelieferteKartensaetze(), ...eigene];
}
export function istEigener(id) { return eigene.some((s) => s.id === id); }
/** Eigenen Satz speichern (neu oder ersetzen). */
export async function speichereKartensatz(satz) {
    eigene = [...eigene.filter((s) => s.id !== satz.id), satz];
    await speicher?.setzeEinstellung(EIGENE, eigene);
}
export async function loescheKartensatz(id) {
    eigene = eigene.filter((s) => s.id !== id);
    if (leseLokal(GEWAEHLT) === id)
        schreibeLokal(GEWAEHLT, null);
    await speicher?.setzeEinstellung(EIGENE, eigene);
}
/** Der auf diesem Gerät gewählte Kartensatz, sonst Französisch. */
export function kartensatz() {
    const id = leseLokal(GEWAEHLT);
    const satz = (id ? saetze.get(id) ?? eigene.find((s) => s.id === id) : undefined) ?? saetze.get("franzoesisch") ?? alleKartensaetze()[0];
    if (!satz)
        throw new Error("Keine Kartensätze geladen");
    return satz;
}
export function waehleKartensatz(id) {
    schreibeLokal(GEWAEHLT, id);
}
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attribute) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attribute))
        el.setAttribute(k, String(v));
    return el;
}
function svgSymbol(pfad, farbe, klasse, box = "0 0 24 24") {
    const s = svg("svg", { viewBox: box, class: klasse, "aria-hidden": "true" });
    s.append(svg("path", { d: pfad, fill: farbe, "fill-rule": "evenodd" }));
    return s;
}
/** Ein Element (Text, Form, Sticker) in Kartenkoordinaten 100 × 140. Text wird als Text gesetzt, nie als Markup. */
export function elementSvg(e, index) {
    const g = svg("g", { transform: `rotate(${e.drehung} ${e.x} ${e.y})`, ...(index !== undefined ? { "data-element": index } : {}) });
    if (e.art === "text") {
        const t = svg("text", { x: e.x, y: e.y, "font-size": e.groesse, fill: e.farbe, "text-anchor": "middle", "dominant-baseline": "central", "font-weight": 600 });
        t.textContent = e.text;
        g.append(t);
    }
    else {
        const pfad = e.art === "form" ? FORM_PFAD[e.form] : STICKER[e.sticker].pfad;
        const farbe = e.art === "form" ? e.farbe : STICKER[e.sticker].farbe;
        const s = e.groesse / 24;
        g.append(svg("path", { d: pfad, fill: farbe, "fill-rule": "evenodd", transform: `translate(${e.x - e.groesse / 2} ${e.y - e.groesse / 2}) scale(${s})` }));
    }
    return g;
}
/** Ebene mit allen Elementen einer Karte oder Rückseite. */
export function elementEbene(elemente = [], klasse = "karten-elemente") {
    const s = svg("svg", { viewBox: `0 0 ${BREITE} ${HOEHE}`, class: klasse, "aria-hidden": "true" });
    elemente.forEach((e, i) => s.append(elementSvg(e, i)));
    return s;
}
/** Eine Karte: Rang oben links, kleines Symbol darunter, großes Symbol unten rechts; darunter die eigene Gestaltung. */
export function karte(id, o = {}) {
    const satz = o.satz ?? kartensatz();
    const a = kartenAnsicht(id, satz);
    const schluessel = id.split("-").slice(0, 2).join("-");
    const g = satz.karten?.[schluessel];
    const foto = g?.hintergrund?.startsWith("data:") ? g.hintergrund : null;
    const klassen = ["spielkarte", o.groesse ?? "hand", `stil-${satz.stil ?? "klassisch"}`, foto ? "mit-bild" : "",
        o.spielbar ? "spielbar" : "", o.gedaempft ? "gedaempft" : ""].filter(Boolean).join(" ");
    const inhalt = [
        ...(foto ? [h("img", { class: "karten-bild", src: foto, alt: "" })] : []),
        ...(g?.elemente?.length ? [elementEbene(g.elemente)] : []),
        h("span", { class: "rang", style: `color: ${a.farbe}` }, a.rang),
        svgSymbol(a.symbol, a.farbe, "sym-klein", a.box),
        svgSymbol(a.symbol, a.farbe, "sym-gross", a.box),
    ];
    const stil = [`--kartenfarbe: ${a.farbe}`, o.drehung ? `transform: rotate(${o.drehung}deg)` : "", g?.hintergrund && !foto ? `background: ${g.hintergrund}` : ""].filter(Boolean).join("; ");
    if (o.onclick) {
        return h("button", {
            class: klassen, "aria-label": `${a.name}${o.spielbar ? ", spielbar" : ""}`, "data-karte": id, style: stil,
            "data-fokus": o.fokus ?? `karte-${id}`, "aria-disabled": o.gedaempft ? "true" : null, onclick: () => o.onclick(),
        }, ...inhalt);
    }
    return h("div", { class: klassen, role: "img", "aria-label": a.name, "data-karte": id, style: stil }, ...inhalt);
}
/** Hintergrund einer Rückseite nach Muster (Spec 020), nur CSS. */
export function rueckenMuster(satz) {
    const r = satz.rueckseite;
    const f1 = r.farbe;
    const f2 = r.farbe2 ?? "#F3EFE6";
    switch (r.muster ?? "uni") {
        case "streifen": return `repeating-linear-gradient(45deg, ${f1} 0 6px, ${f2} 6px 9px)`;
        case "raute": return `repeating-linear-gradient(45deg, transparent 0 7px, ${f2}55 7px 8px), repeating-linear-gradient(-45deg, transparent 0 7px, ${f2}55 7px 8px), ${f1}`;
        case "punkte": return `radial-gradient(${f2} 22%, transparent 24%) 0 0 / 10px 10px, ${f1}`;
        case "kreise": return `radial-gradient(circle, transparent 38%, ${f2}AA 40% 48%, transparent 50%) 0 0 / 16px 16px, ${f1}`;
        default: return f1;
    }
}
/** Rückseite für verdeckte Karten. */
export function rueckseite(groesse = "klein", satz = kartensatz()) {
    const r = satz.rueckseite;
    return h("div", { class: `spielkarte ${groesse} ruecken`, style: `background: ${rueckenMuster(satz)}`, "aria-hidden": "true" }, r.bild ? h("img", { class: "karten-bild", src: r.bild, alt: "" }) : null, r.elemente?.length ? elementEbene(r.elemente) : null, r.text ? h("span", { class: "ruecken-text" }, r.text) : h("span", { class: "monogramm" }, r.zeichen));
}
//# sourceMappingURL=karten.js.map