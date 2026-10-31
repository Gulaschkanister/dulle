// Kleiner Helfer, um DOM-Knoten zu bauen. Kein Framework: Jeder Bildschirm ist eine Funktion,
// die einen Knoten liefert, und nach jeder Änderung wird neu gezeichnet.
export function h(tag, attr = {}, ...kinder) {
    const el = document.createElement(tag);
    for (const [name, wert] of Object.entries(attr)) {
        if (typeof wert === "function") {
            el.addEventListener(name.slice(2).toLowerCase(), wert);
        }
        else if (name === "style" && typeof wert === "string") {
            el.setAttribute("style", wert);
        }
        else if (wert === true) {
            el.setAttribute(name, "");
        }
        else if (wert !== false && wert !== null && wert !== undefined) {
            el.setAttribute(name, String(wert));
        }
    }
    haengeAn(el, kinder);
    return el;
}
function haengeAn(el, kinder) {
    for (const kind of kinder) {
        if (Array.isArray(kind))
            haengeAn(el, kind);
        else if (kind instanceof Node)
            el.appendChild(kind);
        else if (kind !== false && kind !== null && kind !== undefined)
            el.appendChild(document.createTextNode(String(kind)));
    }
}
/** Zahl mit echtem Minuszeichen und Pluszeichen, wie im Spielblock. */
export function punkteText(n, mitPlus = false) {
    if (n < 0)
        return `−${Math.abs(n)}`;
    return mitPlus && n > 0 ? `+${n}` : String(n);
}
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** „2026-10-16“ → „Do 16.10.“ */
export function datumKurz(iso) {
    const [j, m, t] = iso.split("-").map(Number);
    const tag = new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1));
    return `${WOCHENTAGE[tag.getUTCDay()]} ${String(t).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}
/** Heutiger Kalendertag in lokaler Zeit als JJJJ-MM-TT. */
export function heute(jetzt = new Date()) {
    const z = (n) => String(n).padStart(2, "0");
    return `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`;
}
//# sourceMappingURL=dom.js.map