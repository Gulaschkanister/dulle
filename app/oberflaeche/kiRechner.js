// Gute KI im Web Worker (Spec 015). Startet der Worker nicht oder bricht er ab, lehnt der Rechner ab; der KI-Spieler
// zieht dann mit der Notfall-KI.
let worker = null;
let naechste = 1;
const offen = new Map();
/** Antwortet der Worker so lange nicht, hängt er: beenden, beim nächsten Auftrag neu starten. */
const HAENGT_MS = 2500;
function wegwerfen(grund) {
    worker?.terminate();
    worker = null;
    for (const a of offen.values())
        a.fehler(new Error(grund));
    offen.clear();
}
function holeWorker() {
    if (worker)
        return worker;
    const w = new Worker(new URL("../ki-worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
        const auftrag = offen.get(e.data.id);
        offen.delete(e.data.id);
        if (e.data.fehler !== undefined)
            auftrag?.fehler(new Error(e.data.fehler));
        else {
            // Für Tests und Fehlersuche sichtbar: Der Worker rechnet wirklich (sonst zöge still die Notfall-KI).
            document.documentElement.dataset["kiWorker"] = "bereit";
            auftrag?.ok(e.data.zug ?? null);
        }
    };
    w.onerror = () => wegwerfen("KI-Worker ausgefallen");
    worker = w;
    return w;
}
export const guteKi = (sicht, profil) => new Promise((ok, fehler) => {
    try {
        const id = naechste++;
        const uhr = setTimeout(() => { if (offen.has(id))
            wegwerfen("KI-Worker hängt"); }, HAENGT_MS);
        offen.set(id, { ok: (z) => { clearTimeout(uhr); ok(z); }, fehler: (f) => { clearTimeout(uhr); fehler(f); } });
        try {
            holeWorker().postMessage({ id, sicht, profil });
        }
        catch (f) {
            offen.get(id)?.fehler(f);
            offen.delete(id);
        }
    }
    catch (f) {
        fehler(f);
    }
});
//# sourceMappingURL=kiRechner.js.map