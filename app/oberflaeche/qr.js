// QR-Codes zeigen und scannen (Spec 010). Die Bibliotheken liegen in dist/lib und werden erst geladen, wenn man sie
// braucht. Offline sind sie über den Service Worker da: qrcode-generator (MIT), jsQR (Apache 2.0).
import { h } from "./dom.js";
const geladen = new Map();
function ladeSkript(pfad) {
    let p = geladen.get(pfad);
    if (!p) {
        p = new Promise((ok, fehler) => {
            const s = document.createElement("script");
            s.src = pfad;
            s.onload = () => ok();
            s.onerror = () => fehler(new Error(`${pfad} fehlt`));
            document.head.append(s);
        });
        geladen.set(pfad, p);
    }
    return p;
}
/** QR-Code als SVG-Element. */
export async function qrCode(text, beschriftung) {
    await ladeSkript("lib/qrcode.js");
    const qr = window.qrcode(0, "L");
    qr.addData(text, "Byte");
    qr.make();
    const box = h("div", { class: "qr", role: "img", "aria-label": beschriftung });
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return box;
}
/** Kamera öffnen und den ersten QR-Code melden. Liefert eine Stopp-Funktion. */
export async function scanne(ziel, gefunden, fehler) {
    const video = h("video", { playsinline: true, muted: true, autoplay: true, class: "scanner" });
    ziel.replaceChildren(video);
    let laeuft = true;
    let strom = null;
    const stopp = () => { laeuft = false; strom?.getTracks().forEach((t) => t.stop()); ziel.replaceChildren(); };
    try {
        strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    }
    catch {
        stopp();
        fehler("Die Kamera ist nicht verfügbar. Erlaube den Zugriff oder füge den Code als Text ein.");
        return stopp;
    }
    video.srcObject = strom;
    await video.play().catch(() => undefined);
    const detektor = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    if (!detektor)
        await ladeSkript("lib/jsQR.js");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const runde = async () => {
        if (!laeuft)
            return;
        if (video.readyState >= 2) {
            let text = null;
            try {
                if (detektor)
                    text = (await detektor.detect(video))[0]?.rawValue ?? null;
                else {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0);
                    text = window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" })?.data ?? null;
                }
            }
            catch { /* nächster Versuch */ }
            if (text) {
                stopp();
                gefunden(text);
                return;
            }
        }
        requestAnimationFrame(() => void runde());
    };
    void runde();
    return stopp;
}
//# sourceMappingURL=qr.js.map