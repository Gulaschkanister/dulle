// Ereignisspeicher auf IndexedDB (Spec 000). Es wird nur angehängt, nie geändert oder gelöscht.
import { pruefeDatei, vereinige, zaehleKonflikte } from "../kern/austausch.js";
import { pruefeForm } from "../kern/form.js";
import { neueUlid } from "../kern/ulid.js";
export const DB_NAME = "doppelkopf";
const DB_VERSION = 1;
const EREIGNISSE = "ereignisse";
const EINSTELLUNGEN = "einstellungen";
export class EreignisSpeicher {
    db;
    constructor(db) {
        this.db = db;
    }
    static async oeffne(fabrik = indexedDB, name = DB_NAME) {
        const anfrage = fabrik.open(name, DB_VERSION);
        anfrage.onupgradeneeded = () => {
            const db = anfrage.result;
            // Spätere Versionen ändern nur Stores und Indizes, nie gespeicherte Ereignisse.
            if (!db.objectStoreNames.contains(EREIGNISSE)) {
                const store = db.createObjectStore(EREIGNISSE, { keyPath: "id" });
                store.createIndex("runde", "runde");
                store.createIndex("sitzungSeq", ["sitzung", "seq"]);
            }
            if (!db.objectStoreNames.contains(EINSTELLUNGEN))
                db.createObjectStore(EINSTELLUNGEN, { keyPath: "name" });
        };
        return new EreignisSpeicher(await alsPromise(anfrage));
    }
    schliesse() {
        this.db.close();
    }
    async alle() {
        const tx = this.db.transaction(EREIGNISSE, "readonly");
        return alsPromise(tx.objectStore(EREIGNISSE).getAll());
    }
    async fuerRunde(rundeId) {
        const tx = this.db.transaction(EREIGNISSE, "readonly");
        return alsPromise(tx.objectStore(EREIGNISSE).index("runde").getAll(rundeId));
    }
    /**
     * Hängt Ereignisse an, alle in einer Transaktion. Bekannte IDs werden übersprungen.
     * Ein Ereignis mit Formfehler bricht alles ab, bevor geschrieben wird.
     */
    async fuegeHinzu(ereignisse) {
        for (const e of ereignisse) {
            const fehler = pruefeForm(e);
            if (fehler.length > 0)
                throw new Error(`Ereignis ${e.id} ist fehlerhaft: ${fehler.join("; ")}`);
        }
        const { neu, vorhanden } = await this.schreibeNeue(ereignisse);
        return { neu: neu.length, vorhanden };
    }
    /** Import einer Exportdatei als eine Transaktion: alles oder nichts. */
    async importiere(eingabe) {
        const pruefung = pruefeDatei(eingabe);
        if (!pruefung.ok)
            return pruefung;
        const { neu, vorhanden, unbekannteTypen, vorher } = await this.schreibeNeue(pruefung.datei.ereignisse);
        const konflikte = zaehleKonflikte([...vorher, ...neu]) - zaehleKonflikte(vorher);
        return { ok: true, neu: neu.length, vorhanden, unbekannteTypen, konflikte };
    }
    /**
     * Liest den Bestand und schreibt die neuen Ereignisse in derselben Transaktion. Gelesen und
     * geschrieben wird im selben Callback, damit die Transaktion dazwischen nicht schließt.
     */
    async schreibeNeue(eingehend) {
        const tx = this.db.transaction(EREIGNISSE, "readwrite");
        const store = tx.objectStore(EREIGNISSE);
        let ergebnis;
        const lesen = store.getAll();
        lesen.onsuccess = () => {
            const vorher = lesen.result;
            const v = vereinige(new Set(vorher.map((e) => e.id)), eingehend);
            for (const e of v.neu)
                store.add(e);
            ergebnis = { ...v, vorher };
        };
        await fertig(tx);
        if (!ergebnis)
            throw new Error("Speichern fehlgeschlagen");
        return ergebnis;
    }
    async einstellung(name) {
        const tx = this.db.transaction(EINSTELLUNGEN, "readonly");
        const eintrag = await alsPromise(tx.objectStore(EINSTELLUNGEN).get(name));
        return eintrag?.wert;
    }
    async setzeEinstellung(name, wert) {
        const tx = this.db.transaction(EINSTELLUNGEN, "readwrite");
        tx.objectStore(EINSTELLUNGEN).put({ name, wert });
        await fertig(tx);
    }
    /** Zufällige Geräte-ID, einmal pro Installation erzeugt. */
    async geraetId() {
        const vorhanden = await this.einstellung("geraetId");
        if (vorhanden)
            return vorhanden;
        const neu = `g-${neueUlid()}`;
        await this.setzeEinstellung("geraetId", neu);
        return neu;
    }
}
function alsPromise(anfrage) {
    return new Promise((aufloesen, ablehnen) => {
        anfrage.onsuccess = () => aufloesen(anfrage.result);
        anfrage.onerror = () => ablehnen(anfrage.error);
    });
}
function fertig(tx) {
    return new Promise((aufloesen, ablehnen) => {
        tx.oncomplete = () => aufloesen();
        tx.onerror = () => ablehnen(tx.error);
        tx.onabort = () => ablehnen(tx.error ?? new Error("Transaktion abgebrochen"));
    });
}
//# sourceMappingURL=speicher.js.map