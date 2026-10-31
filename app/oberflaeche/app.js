// Zustand und Abläufe der Oberfläche (Spec 001). Die Wahrheit liegt im Speicher; nach jeder Änderung
// werden Ereignisse neu geladen, die Projektion neu berechnet und der aktuelle Bildschirm neu gezeichnet.
import { erzeugeEreignis } from "../kern/erzeugen.js";
import { projiziere, zusammenfuehrungenAus } from "../kern/projektion.js";
import { neueUlid } from "../kern/ulid.js";
import { h } from "./dom.js";
export const RUECKGAENGIG_MS = 5000;
const AUSSTEHEND = "dulle.ausstehend";
export class App {
    speicher;
    geraet;
    wurzel;
    routen;
    ereignisse = [];
    projektion = {};
    blatt = null;
    ausstehend = null;
    updateBereit = null;
    hinweisHomeBildschirm = false;
    meldung = null;
    meldungArt = "fehler";
    /** Nur beim allerersten Zeichnen true: Dann springt der Start direkt in einen offenen Abend. */
    ersteAnsicht = true;
    timer;
    constructor(speicher, geraet, wurzel, routen) {
        this.speicher = speicher;
        this.geraet = geraet;
        this.wurzel = wurzel;
        this.routen = routen;
    }
    async start() {
        // Ein beim Schließen noch nicht gespeichertes Spiel wird jetzt gespeichert.
        const rest = leseLokal(AUSSTEHEND);
        if (rest) {
            await this.speicher.fuegeHinzu([rest.ereignis]);
            schreibeLokal(AUSSTEHEND, null);
        }
        await this.ladeNeu();
        addEventListener("hashchange", () => void this.navigiert());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden")
                void this.festschreiben();
        });
        addEventListener("pagehide", () => void this.festschreiben());
        this.zeichne();
    }
    // ---------- Daten ----------
    async ladeNeu() {
        this.ereignisse = await this.speicher.alle();
        this.projektion = projiziere(this.ereignisse);
    }
    /** Projektion inklusive eines noch nicht gespeicherten Spiels, damit es sofort im Spielblock steht. */
    get sicht() {
        return this.ausstehend ? projiziere([...this.ereignisse, this.ausstehend.ereignis]) : this.projektion;
    }
    runde(id) {
        return this.sicht[id];
    }
    sitzung(id) {
        for (const runde of Object.values(this.sicht)) {
            const sitzung = runde.sitzungen[id];
            if (sitzung)
                return { runde, sitzung };
        }
        return undefined;
    }
    offeneSitzung(rundeId) {
        const kandidaten = Object.values(this.sicht)
            .filter((r) => rundeId === undefined || r.id === rundeId)
            .flatMap((runde) => Object.values(runde.sitzungen).filter((s) => !s.abgeschlossen && !s.verworfen).map((sitzung) => ({ runde, sitzung })));
        return kandidaten.sort((a, b) => (a.sitzung.id < b.sitzung.id ? 1 : -1))[0];
    }
    /**
     * Erzeugt und speichert sofort ein Ereignis. Ein noch ausstehendes Spiel wird vorher gespeichert,
     * damit die Reihenfolge (seq) stimmt.
     */
    async speichere(typ, daten, ort) {
        await this.festschreiben();
        const ereignis = this.baue(typ, daten, ort);
        if (!ereignis)
            return null;
        await this.speicher.fuegeHinzu([ereignis]);
        await this.ladeNeu();
        this.zeichne();
        return ereignis;
    }
    /** Baut ein geprüftes Ereignis, ohne es zu speichern. Bei Fehlern erscheint eine Meldung. */
    baue(typ, daten, ort) {
        const runde = this.projektion[ort.runde];
        const sitzung = ort.sitzung ? runde?.sitzungen[ort.sitzung] : undefined;
        const ergebnis = erzeugeEreignis(typ, daten, {
            rundeId: ort.runde,
            geraet: this.geraet,
            ...(ort.sitzung ? { sitzungId: ort.sitzung } : {}),
            hoechsteSeq: sitzung?.hoechsteSeq ?? 0,
            runde,
            sitzung,
            zusammenfuehrungen: zusammenfuehrungenAus(this.ereignisse, ort.runde),
        });
        if (!ergebnis.ok) {
            this.melde(ergebnis.fehler[0] ?? "Das ging nicht.");
            return null;
        }
        return ergebnis.wert;
    }
    /** Merkt ein Spiel 5 Sekunden lang vor (Rückgängig), danach wird es gespeichert. */
    async vormerken(ereignis, text, entwurf) {
        await this.festschreiben();
        this.ausstehend = { ereignis, text, entwurf };
        schreibeLokal(AUSSTEHEND, this.ausstehend);
        this.timer = setTimeout(() => void this.festschreiben(), RUECKGAENGIG_MS);
    }
    async festschreiben() {
        clearTimeout(this.timer);
        const ausstehend = this.ausstehend;
        if (!ausstehend)
            return;
        this.ausstehend = null;
        await this.speicher.fuegeHinzu([ausstehend.ereignis]);
        schreibeLokal(AUSSTEHEND, null);
        await this.ladeNeu();
        this.zeichne();
    }
    /** Rückgängig: Das vorgemerkte Spiel wird verworfen, ohne je gespeichert worden zu sein. */
    rueckgaengig() {
        clearTimeout(this.timer);
        const weg = this.ausstehend;
        this.ausstehend = null;
        schreibeLokal(AUSSTEHEND, null);
        return weg;
    }
    // ---------- Oberfläche ----------
    geheZu(pfad) {
        const ziel = `#${pfad}`;
        if (location.hash === ziel)
            this.zeichne();
        else
            location.hash = ziel;
    }
    async navigiert() {
        this.blatt = null;
        // Seitenwechsel (Spec 006): Filzkopf bleibt, Inhalt blendet per CSS ein. Bewusst keine View Transitions:
        // Sie haben WebKit in den Tests abstürzen lassen (siehe CLAUDE.md, Fallstricke).
        this.seitenwechsel = true;
        this.zeichne();
    }
    seitenwechsel = false;
    zeigeBlatt(inhalt) {
        this.blatt = inhalt;
        this.zeichne();
        if (inhalt)
            this.wurzel.querySelector(".blatt input, .blatt button")?.focus();
    }
    melde(text, art = "fehler") {
        this.meldung = text;
        this.meldungArt = art;
        this.zeichne();
    }
    zeichne() {
        const fokus = document.activeElement?.dataset["fokus"];
        // Cursor in Textfeldern behalten, damit Live-Vorschauen beim Tippen nicht springen (Spec 020).
        const feld = document.activeElement;
        const auswahl = feld && typeof feld.selectionStart === "number" ? [feld.selectionStart, feld.selectionEnd ?? feld.selectionStart] : null;
        const teile = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
        const ansicht = this.routen(teile)(this, teile);
        const knoten = [ansicht];
        if (this.blatt) {
            knoten.push(h("div", { class: "blatt-hintergrund", onclick: (e) => { if (e.target === e.currentTarget)
                    this.zeigeBlatt(null); } }, h("div", { class: "blatt", role: "dialog", "aria-modal": "true" }, this.blatt)));
        }
        if (this.ausstehend) {
            knoten.push(h("div", { class: "toast", role: "status" }, h("span", { class: "text" }, this.ausstehend.text), h("button", { "data-fokus": "rueckgaengig", onclick: () => this.rueckgaengigKlick() }, "Rückgängig")));
        }
        else if (this.updateBereit && !teile.includes("eintragen")) {
            const neuLaden = this.updateBereit;
            knoten.push(h("div", { class: "toast", role: "status" }, h("span", { class: "text" }, "Neue Version da"), h("button", { onclick: () => neuLaden() }, "Jetzt neu laden")));
        }
        if (this.seitenwechsel && ansicht instanceof HTMLElement)
            ansicht.classList.add("seitenwechsel");
        this.seitenwechsel = false;
        this.wurzel.replaceChildren(...knoten);
        // Platz für den Hinweis unten, damit er die Hauptaktion nicht verdeckt.
        this.wurzel.classList.toggle("mit-toast", knoten.some((k) => k instanceof HTMLElement && k.classList.contains("toast")));
        this.ersteAnsicht = false;
        if (fokus) {
            const ziel = this.wurzel.querySelector(`[data-fokus="${fokus}"]`);
            ziel?.focus();
            if (ziel && auswahl)
                try {
                    ziel.setSelectionRange(auswahl[0], auswahl[1]);
                }
                catch { /* Felder ohne Cursor */ }
        }
    }
    /** Wird von Bildschirmen gesetzt, die bei „Rückgängig“ ihren Entwurf zurückhaben wollen. */
    beiRueckgaengig = null;
    rueckgaengigKlick() {
        const weg = this.rueckgaengig();
        if (weg && this.beiRueckgaengig)
            this.beiRueckgaengig(weg);
        else
            this.zeichne();
    }
    neueId() {
        return neueUlid();
    }
}
// ---------- localStorage (nur Einstellungen und Entwürfe, nie Ereignisse dauerhaft) ----------
export function leseLokal(schluessel) {
    try {
        const text = localStorage.getItem(schluessel);
        return text ? JSON.parse(text) : null;
    }
    catch {
        return null;
    }
}
export function schreibeLokal(schluessel, wert) {
    try {
        if (wert === null)
            localStorage.removeItem(schluessel);
        else
            localStorage.setItem(schluessel, JSON.stringify(wert));
    }
    catch {
        // Kein localStorage (z. B. gesperrt): Entwürfe gehen dann beim Schließen verloren, mehr nicht.
    }
}
//# sourceMappingURL=app.js.map