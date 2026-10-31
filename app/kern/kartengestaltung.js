// Gestaltung eigener Karten (Spec 020): Vorlagen, Rückseiten, Elemente (Text, Form, Sticker), Sperrbereich der Ecken,
// Import von SVG-Symbolen und die Prüfung im Builder. Reines TS ohne DOM: Elemente sind Daten, gezeichnet wird von der App.
import { abstandBei } from "./farbsehen.js";
/** Kartenkoordinaten: 100 breit, 140 hoch (Seitenverhältnis der Handkarte 70 × 98). */
export const BREITE = 100;
export const HOEHE = 140;
export const STILE = ["klassisch", "modern", "minimal", "verspielt"];
export const STIL_NAME = { klassisch: "Klassisch", modern: "Modern", minimal: "Minimal", verspielt: "Verspielt" };
export const MUSTER = ["uni", "streifen", "raute", "punkte", "kreise"];
export const MUSTER_NAME = { uni: "Uni", streifen: "Streifen", raute: "Raute", punkte: "Punkte", kreise: "Kreise" };
export const FORMEN = ["kreis", "rechteck", "stern", "herz", "linie"];
export const FORM_NAME = { kreis: "Kreis", rechteck: "Rechteck", stern: "Stern", herz: "Herz", linie: "Linie" };
/** Formen als Pfad im Feld 0…24 (selbst gezeichnet). */
export const FORM_PFAD = {
    kreis: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z",
    rechteck: "M3 3h18v18H3z",
    stern: "M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z",
    herz: "M12 21.3l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.5z",
    linie: "M1 11h22v2H1z",
};
/** Sticker-Sammlung, selbst gezeichnet (Feld 0…24, eine Farbe je Sticker). */
export const STICKER = {
    krone: { name: "Krone", farbe: "#B8860B", pfad: "M3 18h18l1-11-5 4-5-7-5 7-5-4zM3 20h18v2H3z" },
    krug: { name: "Bierkrug", farbe: "#A0601A", pfad: "M5 6h11v15H5zM16 9h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3v-2h3v-5h-3zM5 3c1-1 3-1 4 0 1-1 3-1 4 0 1-1 3-1 3 1v1H5z" },
    klee: { name: "Kleeblatt", farbe: "#2E7D32", pfad: "M12 11a4 4 0 1 1 0-8 4 4 0 1 1 0 8zM12 11a4 4 0 1 1-8 0 4 4 0 1 1 8 0zM12 11a4 4 0 1 1 8 0 4 4 0 1 1-8 0zM11 11h2v11h-2z" },
    stern: { name: "Stern", farbe: "#D4A017", pfad: "M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z" },
    anker: { name: "Anker", farbe: "#1F3A5F", pfad: "M11 2h2v3h-2zM12 5a2 2 0 1 1 0 4 2 2 0 1 1 0-4zM11 9h2v11.9c3.4-.4 6-3 6.6-6.4L17 15l2-5 3 4-1.4-.4C20 18.5 16.4 22 12 22s-8-3.5-8.6-8.4L2 14l3-4 2 5-2.6-.5c.6 3.4 3.2 6 6.6 6.4z" },
    sonne: { name: "Sonne", farbe: "#E08A00", pfad: "M12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM11 0h2v4h-2zM11 20h2v4h-2zM0 11h4v2H0zM20 11h4v2h-4zM3.5 4.9l1.4-1.4 2.8 2.8-1.4 1.4zM16.3 17.7l1.4-1.4 2.8 2.8-1.4 1.4zM3.5 19.1l2.8-2.8 1.4 1.4-2.8 2.8zM16.3 6.3l2.8-2.8 1.4 1.4-2.8 2.8z" },
    herz: { name: "Herz", farbe: "#C0281F", pfad: FORM_PFAD.herz },
    wuerfel: { name: "Würfel", farbe: "#3A3A3A", pfad: "M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3zm10 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3zm-5-5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z" },
};
export const MAX_ELEMENTE = 20;
export const MAX_TEXT = 24;
/** Ein Foto nach dem Verkleinern: höchstens 200 KB (als data:-URL etwa ein Drittel mehr). */
export const MAX_BILD_BYTES = 200 * 1024;
// ---------- Sperrbereich ----------
/** Ecken, die immer frei bleiben: oben links Rang und kleines Symbol, unten rechts das große Symbol. */
export const SPERRBEREICHE = [
    { x0: 0, y0: 0, x1: 40, y1: 44 },
    { x0: 47, y0: 86, x1: BREITE, y1: HOEHE },
];
/**
 * Hält ein Element aus den Sperrbereichen und auf der Karte: Mitte und halbe Größe als Kreis gerechnet. Liegt es in einem
 * Bereich, wird es auf dem kürzesten Weg (waagrecht oder senkrecht) hinausgeschoben.
 */
export function begrenze(e) {
    const r = Math.max(2, Math.min(e.groesse, 90) / 2);
    let x = Math.min(BREITE - r, Math.max(r, e.x));
    let y = Math.min(HOEHE - r, Math.max(r, e.y));
    for (let runde = 0; runde < 3; runde++) {
        for (const z of SPERRBEREICHE) {
            const x0 = z.x0 - r, x1 = z.x1 + r, y0 = z.y0 - r, y1 = z.y1 + r;
            if (x <= x0 || x >= x1 || y <= y0 || y >= y1)
                continue;
            const wege = [
                { dx: x0 - x, dy: 0 }, { dx: x1 - x, dy: 0 }, { dx: 0, dy: y0 - y }, { dx: 0, dy: y1 - y },
            ].filter((w) => x + w.dx >= r && x + w.dx <= BREITE - r && y + w.dy >= r && y + w.dy <= HOEHE - r);
            const kurz = wege.sort((a, b) => Math.abs(a.dx + a.dy) - Math.abs(b.dx + b.dy))[0];
            if (kurz) {
                x += kurz.dx;
                y += kurz.dy;
            }
        }
    }
    return { ...e, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, groesse: Math.round(Math.min(Math.max(e.groesse, 4), 90) * 10) / 10 };
}
// ---------- SVG-Import ----------
const PFAD_ZEICHEN = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;
/**
 * Liest aus einer SVG-Datei nur die Pfade (`d` aller `<path>`) und die viewBox. Die Datei wird nie eingebunden:
 * Skripte, Bilder und Verweise fallen damit weg. Ergebnis null, wenn keine brauchbare Form drin ist.
 */
export function symbolAusSvg(text) {
    if (text.length > 500_000)
        return null;
    const pfade = [];
    for (const m of text.matchAll(/<path\b[^>]*?\sd\s*=\s*(["'])([^"']*)\1/gi)) {
        const d = m[2].trim();
        if (d && PFAD_ZEICHEN.test(d))
            pfade.push(d);
    }
    const pfad = pfade.join(" ");
    if (!pfad || pfad.length > 20_000)
        return null;
    const vb = /<svg\b[^>]*?\sviewBox\s*=\s*(["'])([^"']*)\1/i.exec(text)?.[2];
    const zahlen = (vb ?? "").trim().split(/[\s,]+/).map(Number);
    if (zahlen.length === 4 && zahlen.every(Number.isFinite) && zahlen[2] > 0 && zahlen[3] > 0)
        return { pfad, box: zahlen.join(" ") };
    const w = Number.parseFloat(/<svg\b[^>]*?\swidth\s*=\s*(["'])([^"']*)\1/i.exec(text)?.[2] ?? "");
    const hh = Number.parseFloat(/<svg\b[^>]*?\sheight\s*=\s*(["'])([^"']*)\1/i.exec(text)?.[2] ?? "");
    return { pfad, box: w > 0 && hh > 0 ? `0 0 ${w} ${hh}` : "0 0 24 24" };
}
export const istPfad = (w) => typeof w === "string" && w.length > 0 && w.length <= 20_000 && PFAD_ZEICHEN.test(w);
export const istBox = (w) => typeof w === "string" && /^-?[\d.]+(\s+-?[\d.]+){3}$/.test(w.trim());
// ---------- Prüfung der Gestaltungs-Felder ----------
const istHex = (w) => typeof w === "string" && /^#[0-9A-Fa-f]{6}$/.test(w);
const istZahl = (w, min, max) => typeof w === "number" && Number.isFinite(w) && w >= min && w <= max;
const istObjekt = (w) => typeof w === "object" && w !== null && !Array.isArray(w);
/** Nur WebP- und JPEG-Bilder als data:-URL, höchstens MAX_BILD_BYTES. */
export function istBild(w) {
    if (typeof w !== "string")
        return false;
    const m = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(w);
    return !!m && (m[2].length * 3) / 4 <= MAX_BILD_BYTES;
}
function pruefeElemente(liste, wo) {
    if (liste === undefined)
        return [];
    if (!Array.isArray(liste))
        return [`${wo}: Elemente ungültig`];
    if (liste.length > MAX_ELEMENTE)
        return [`${wo}: höchstens ${MAX_ELEMENTE} Elemente`];
    const fehler = [];
    liste.forEach((e, i) => {
        if (!istObjekt(e) || !istZahl(e["x"], 0, BREITE) || !istZahl(e["y"], 0, HOEHE) || !istZahl(e["groesse"], 1, 100) || !istZahl(e["drehung"], -360, 360)) {
            fehler.push(`${wo}, Element ${i + 1}: Lage ungültig`);
            return;
        }
        if (e["art"] === "text") {
            if (typeof e["text"] !== "string" || e["text"].length === 0 || e["text"].length > MAX_TEXT || !istHex(e["farbe"]))
                fehler.push(`${wo}, Element ${i + 1}: Text bis ${MAX_TEXT} Zeichen und Farbe nötig`);
        }
        else if (e["art"] === "form") {
            if (!FORMEN.includes(e["form"]) || !istHex(e["farbe"]))
                fehler.push(`${wo}, Element ${i + 1}: unbekannte Form`);
        }
        else if (e["art"] === "sticker") {
            if (!(String(e["sticker"]) in STICKER))
                fehler.push(`${wo}, Element ${i + 1}: unbekannter Sticker`);
        }
        else
            fehler.push(`${wo}, Element ${i + 1}: unbekannte Art`);
    });
    return fehler;
}
/** Prüft die optionalen Felder aus Spec 020 (stil, karten, rueckseite.*). Unbekanntes bleibt erlaubt. */
export function pruefeGestaltung(satz) {
    const fehler = [];
    if (satz["stil"] !== undefined && !STILE.includes(satz["stil"]))
        fehler.push(`stil: „${String(satz["stil"])}“ gibt es nicht`);
    const karten = satz["karten"];
    if (karten !== undefined) {
        if (!istObjekt(karten))
            fehler.push("karten: ungültig");
        else
            for (const [schluessel, k] of Object.entries(karten)) {
                if (!/^(kreuz|pik|herz|karo)-(A|10|K|D|B|9)$/.test(schluessel)) {
                    fehler.push(`karten: „${schluessel}“ ist keine Karte`);
                    continue;
                }
                if (!istObjekt(k)) {
                    fehler.push(`karten.${schluessel}: ungültig`);
                    continue;
                }
                const hg = k["hintergrund"];
                if (hg !== undefined && !istHex(hg) && !istBild(hg))
                    fehler.push(`karten.${schluessel}: Hintergrund ist weder Farbe noch Foto (WebP/JPEG bis 200 KB)`);
                fehler.push(...pruefeElemente(k["elemente"], `karten.${schluessel}`));
            }
    }
    const r = satz["rueckseite"];
    if (istObjekt(r)) {
        if (r["muster"] !== undefined && !MUSTER.includes(r["muster"]))
            fehler.push("rueckseite.muster: unbekannt");
        if (r["farbe2"] !== undefined && !istHex(r["farbe2"]))
            fehler.push("rueckseite.farbe2: keine Farbe");
        if (r["bild"] !== undefined && !istBild(r["bild"]))
            fehler.push("rueckseite.bild: nur WebP oder JPEG bis 200 KB");
        if (r["text"] !== undefined && (typeof r["text"] !== "string" || r["text"].length > MAX_TEXT))
            fehler.push(`rueckseite.text: bis ${MAX_TEXT} Zeichen`);
        fehler.push(...pruefeElemente(r["elemente"], "rueckseite"));
    }
    const farben = satz["farben"];
    if (istObjekt(farben))
        for (const [f, x] of Object.entries(farben)) {
            if (istObjekt(x) && x["box"] !== undefined && !istBox(x["box"]))
                fehler.push(`Farbe ${f}: viewBox ungültig`);
        }
    return fehler;
}
/** Mindestabstand (CIEDE2000) zwischen zwei Farben bei simulierter Rot-Grün-Schwäche. */
export const MIN_ABSTAND_FARBSEHEN = 20;
export function pruefeFarbsehen(farben) {
    const liste = Object.values(farben);
    const paare = [];
    for (let i = 0; i < liste.length; i++) {
        for (let j = i + 1; j < liste.length; j++) {
            const a = liste[i], b = liste[j];
            const knapp = Math.min(abstandBei(a.farbe, b.farbe, "deuteranopie"), abstandBei(a.farbe, b.farbe, "protanopie"));
            if (knapp < MIN_ABSTAND_FARBSEHEN && a.farbe.toUpperCase() !== b.farbe.toUpperCase())
                paare.push(`${a.name} und ${b.name}`);
        }
    }
    // Ein Hinweis für alle Paare; die verschiedenen Symbole (Pflicht, siehe pruefeEindeutig) helfen schon.
    if (paare.length === 0)
        return [];
    const aufzaehlung = paare.length > 1 ? `${paare.slice(0, -1).join(", ")} sowie ${paare.at(-1)}` : paare[0];
    return [`Bei Rot-Grün-Schwäche sehen ${aufzaehlung} fast gleich aus. Die Symbole helfen, andere Farben helfen mehr.`];
}
export function pruefeEindeutig(farben) {
    const liste = Object.values(farben);
    const fehler = [];
    for (let i = 0; i < liste.length; i++) {
        for (let j = i + 1; j < liste.length; j++) {
            if (liste[i].name.trim().toLowerCase() === liste[j].name.trim().toLowerCase())
                fehler.push(`Zwei Farben heißen „${liste[i].name}“.`);
            if (liste[i].symbol === liste[j].symbol)
                fehler.push(`${liste[i].name} und ${liste[j].name} haben dasselbe Symbol.`);
        }
    }
    return fehler;
}
export function pruefeLesbarkeit(werte) {
    return Object.values(werte).filter((w) => w.kurz.trim().length > 2).map((w) => `„${w.kurz}“ ist als Kurzzeichen lang. Ein oder zwei Zeichen lesen sich am Tisch besser.`);
}
//# sourceMappingURL=kartengestaltung.js.map