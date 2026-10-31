// Farbsehen und Farbabstand für die Prüfung im Card Builder (Spec 020). Reines TS ohne DOM.
//
// Simulation: Machado, Oliveira, Fernandes (2009), „A Physiologically-based Model for Simulation of Color Vision
// Deficiency“, Matrizen für Schweregrad 1.0 von https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
// (abgerufen 2026-10-28). Die Seite nennt den Farbraum nicht; das Modell des Papers rechnet in linearem RGB, deshalb
// wird vorher linearisiert und danach wieder kodiert.
//
// Farbabstand: CIEDE2000 nach Sharma, Wu, Dalal (2005), „The CIEDE2000 Color-Difference Formula: Implementation Notes,
// Supplementary Test Data, and Mathematical Observations“. Getestet mit deren Testdaten.
const MATRIX = {
    protanopie: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopie: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
};
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const kodiert = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const klemme = (c) => Math.min(1, Math.max(0, c));
function rgbLinear(hex) {
    return [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
}
function hexAusLinear([r, g, b]) {
    return `#${[r, g, b].map((c) => Math.round(kodiert(klemme(c)) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
/** Wie eine Farbe bei Protanopie bzw. Deuteranopie aussieht (Schweregrad 1.0). */
export function simuliere(hex, art) {
    const [r, g, b] = rgbLinear(hex);
    const m = MATRIX[art];
    return hexAusLinear([m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b]);
}
/** sRGB (D65) → CIELAB. */
export function lab(hex) {
    const [r, g, b] = rgbLinear(hex);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const grad = (r) => (r * 180) / Math.PI;
const rad = (g) => (g * Math.PI) / 180;
/** CIEDE2000 (kL = kC = kH = 1). */
export function deltaE2000([l1, a1, b1], [l2, a2, b2]) {
    const c1 = Math.hypot(a1, b1);
    const c2 = Math.hypot(a2, b2);
    const cMittel = (c1 + c2) / 2;
    const g = 0.5 * (1 - Math.sqrt(cMittel ** 7 / (cMittel ** 7 + 25 ** 7)));
    const a1s = (1 + g) * a1;
    const a2s = (1 + g) * a2;
    const c1s = Math.hypot(a1s, b1);
    const c2s = Math.hypot(a2s, b2);
    const h = (b, a) => (b === 0 && a === 0 ? 0 : (grad(Math.atan2(b, a)) + 360) % 360);
    const h1s = h(b1, a1s);
    const h2s = h(b2, a2s);
    const dL = l2 - l1;
    const dC = c2s - c1s;
    let dh = 0;
    if (c1s * c2s !== 0) {
        dh = h2s - h1s;
        if (dh > 180)
            dh -= 360;
        else if (dh < -180)
            dh += 360;
    }
    const dH = 2 * Math.sqrt(c1s * c2s) * Math.sin(rad(dh / 2));
    const lMittel = (l1 + l2) / 2;
    const cMittelS = (c1s + c2s) / 2;
    let hMittel = h1s + h2s;
    if (c1s * c2s !== 0) {
        if (Math.abs(h1s - h2s) <= 180)
            hMittel = (h1s + h2s) / 2;
        else
            hMittel = h1s + h2s < 360 ? (h1s + h2s + 360) / 2 : (h1s + h2s - 360) / 2;
    }
    const t = 1 - 0.17 * Math.cos(rad(hMittel - 30)) + 0.24 * Math.cos(rad(2 * hMittel)) + 0.32 * Math.cos(rad(3 * hMittel + 6)) - 0.2 * Math.cos(rad(4 * hMittel - 63));
    const dTheta = 30 * Math.exp(-(((hMittel - 275) / 25) ** 2));
    const rc = 2 * Math.sqrt(cMittelS ** 7 / (cMittelS ** 7 + 25 ** 7));
    const sl = 1 + (0.015 * (lMittel - 50) ** 2) / Math.sqrt(20 + (lMittel - 50) ** 2);
    const sc = 1 + 0.045 * cMittelS;
    const sh = 1 + 0.015 * cMittelS * t;
    const rt = -Math.sin(rad(2 * dTheta)) * rc;
    return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}
/** Abstand zweier Farben, wie ihn jemand mit dieser Sehschwäche sieht. */
export function abstandBei(a, b, art) {
    return deltaE2000(lab(simuliere(a, art)), lab(simuliere(b, art)));
}
//# sourceMappingURL=farbsehen.js.map