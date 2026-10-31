// Fotos für eigene Karten (Spec 020): im Gerät verkleinern, als WebP (sonst JPEG) mit höchstens 200 KB.
import { istBild, MAX_BILD_BYTES } from "../kern/kartengestaltung.js";
export const FOTO_BREITE = 300;
export const FOTO_HOEHE = 450;
/** Verkleinert ein Bild so, dass es die Karte füllt (höchstens 300 × 450), und liefert eine data:-URL. */
export async function fotoVerkleinern(datei) {
    const bild = await createImageBitmap(datei);
    // Füllen wie object-fit: cover, mittig zugeschnitten.
    const massstab = Math.min(1, Math.max(FOTO_BREITE / bild.width, FOTO_HOEHE / bild.height));
    const w = Math.min(FOTO_BREITE, Math.round(bild.width * massstab));
    const hh = Math.min(FOTO_HOEHE, Math.round(bild.height * massstab));
    const leinwand = document.createElement("canvas");
    leinwand.width = w;
    leinwand.height = hh;
    const ctx = leinwand.getContext("2d");
    if (!ctx)
        throw new Error("Kein Zeichnen möglich");
    const sw = w / massstab;
    const sh = hh / massstab;
    ctx.drawImage(bild, (bild.width - sw) / 2, (bild.height - sh) / 2, sw, sh, 0, 0, w, hh);
    bild.close();
    for (const qualitaet of [0.8, 0.65, 0.5, 0.35]) {
        for (const typ of ["image/webp", "image/jpeg"]) {
            const url = leinwand.toDataURL(typ, qualitaet);
            // Kann der Browser kein WebP, kommt PNG zurück: dann JPEG.
            if (istBild(url))
                return url;
        }
    }
    throw new Error(`Das Foto bleibt über ${MAX_BILD_BYTES / 1024} KB. Bitte ein anderes wählen.`);
}
//# sourceMappingURL=foto.js.map