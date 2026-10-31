// Gastgeber-Gerät (Spec 010, 012, Skill `netz-sicherheit`): führt die Spielengine, prüft jeden Zug und schickt jedem
// Platz nur dessen Sicht. Verbindungsabbrüche sind ein normaler Zustand. Kein DOM; Kanäle, Speicher und Uhr kommen von
// außen, damit alles ohne Netz testbar ist.
import { erzeugeEreignis } from "../kern/erzeugen.js";
import { projiziere, zusammenfuehrungenAus } from "../kern/projektion.js";
import { neuerSeed } from "../kern/spiel/karten.js";
import { fuehreAus, neuesSpiel, offenlegen, sichtFuer } from "../kern/spiel/engine.js";
import { neueUlid } from "../kern/ulid.js";
import { speicherKanalPaar } from "./kanal.js";
import { KiSpieler } from "./kiSpieler.js";
import { neuerRaum } from "./raum.js";
import { pruefeForm } from "../kern/form.js";
export const PLAETZE = [1, 2, 3, 4];
/** Spec 012: So lange muss ein Platz weg sein, bevor alle gefragt werden (Konzept). */
export const FRAGE_NACH_MS = 60_000;
/** Eine Wahl lässt sich so lange zurücknehmen. */
export const ZURUECKNEHMEN_MS = 5_000;
/** Übernimmt ein anderes Gerät ohne geplante Übergabe, beginnt es mit diesem Abstand bei seq, damit Ereignisse des
 *  alten Gastgebers, die nie verteilt wurden, nicht mit denselben Nummern kollidieren (Spec 000: Konflikte). */
export const SEQ_ABSTAND_BEI_UEBERNAHME = 1000;
/** Reine Protokoll-Ereignisse: Sie ändern die Projektion nicht (nur seq), deshalb kein Neu-Projizieren. */
const NUR_PROTOKOLL = new Set([
    "kartenGegeben", "vorbehalt", "karteGespielt", "angesagt", "stichGewonnen", "armutAntwort", "armutGetauscht", "spielOffengelegt",
    "spielerGetrennt", "spielerZurueck", "geraetGewechselt", "gastgeberGewechselt", "entscheidung", "kiUebernimmt", "kiGibtAb",
]);
function neuesToken() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export class Gastgeber {
    o;
    uebernahme;
    z;
    ereignisse;
    kanaele = new Map();
    seq = new Map();
    /** Bis zu welchem Index der Ereignisliste jedes Gerät die Runde schon bekommen hat. */
    verteilt = new Map();
    /** Plätze, deren Kanal nachweislich dem Besitzer gehört (gewählt oder mit Token). Nur sie bekommen Sicht und Runde. */
    bestaetigt = new Set();
    wackelt = new Set();
    /** Gerätewechsel: neues Gerät wartet auf Bestätigung durch einen anderen Spieler. */
    wechsel = null;
    projektion = null;
    hoechsteSeq = 0;
    /** Spec 013: KI-Mitspieler je Platz, und wer zurück ist, aber auf das Ende des Stichs wartet. */
    kis = new Map();
    wartend = new Map();
    /** Einladungen an einen Platz, auf dem die KI spielt: Sie dürfen nur „hallo“ und „Wer bist du“ schicken. */
    kiEinladungen = new Map();
    /** Spec 030: Kanäle, die über den Raum kamen (für `spielerZurueck.weg`). */
    raumKanaele = new WeakSet();
    /** Nach einer geplanten Übergabe gilt dieses Gerät nicht mehr als Gastgeber: keine Ereignisse, keine Antworten. */
    abgegeben = false;
    /** Für die Oberfläche des Gastgebers: wird nach jeder Änderung aufgerufen. */
    beiAenderung = null;
    /**
     * @param uebernahme Spec 012: Dieses Gerät übernimmt den Tisch eines anderen. `geplant` = ohne Spielverlust.
     */
    constructor(o, eigenerSpielerId, eigenerPlatz, zustand, uebernahme) {
        this.o = o;
        this.uebernahme = uebernahme;
        this.ereignisse = [...o.ereignisse];
        this.z = zustand ? structuredClone(zustand) : {
            tischId: neueUlid(), eigenerPlatz, sitzungId: null, spiel: null,
            plaetze: PLAETZE.map((p) => ({ platz: p, spielerId: p === eigenerPlatz ? eigenerSpielerId : null, token: p === eigenerPlatz ? neuesToken() : null })),
        };
        this.z.eigenerPlatz = eigenerPlatz;
        this.z.raum ??= neuerRaum();
        if (this.z.sitzungId)
            this.hoechsteSeq = Math.max(0, ...this.ereignisse.filter((e) => e.sitzung === this.z.sitzungId).map((e) => e.seq ?? 0));
        if (uebernahme && !uebernahme.geplant)
            this.hoechsteSeq += SEQ_ABSTAND_BEI_UEBERNAHME;
        // Nach Neuladen oder Übernahme ist zunächst niemand außer dem eigenen Gerät verbunden.
        if (zustand)
            for (const s of this.z.plaetze)
                if (s.platz !== eigenerPlatz && s.spielerId && !s.ki)
                    s.wegSeit ??= this.jetzt();
        // KI-Plätze sitzen nach Neuladen oder Übernahme sofort wieder.
        for (const s of this.z.plaetze)
            if (s.ki && s.platz !== eigenerPlatz)
                this.kiAnschliessen(s.platz);
    }
    // ---------- KI (Spec 013) ----------
    /** Die KI sitzt wie ein Mensch am anderen Ende eines Speicher-Kanals und bekommt nur die Sicht ihres Platzes. */
    kiAnschliessen(platz) {
        const [hier, dort] = speicherKanalPaar();
        this.kis.get(platz)?.beende();
        this.kanaele.set(platz, hier);
        hier.beiNachricht((n) => void this.nimm(hier, n));
        this.bestaetigt.add(platz);
        this.kis.set(platz, new KiSpieler(dort, this.o.profil, this.o.kiVerzoegerung, this.o.kiRechner ?? null));
        this.sende(platz, { t: "tisch", tisch: this.tischInfo(platz) });
        this.sendeSicht(platz);
    }
    kiAbmelden(platz) {
        const ki = this.kis.get(platz);
        if (!ki)
            return;
        this.kis.delete(platz);
        this.kanaele.delete(platz);
        this.bestaetigt.delete(platz);
        ki.beende();
    }
    /** Zu dritt: einen freien Platz vor dem Start mit KI besetzen (höchstens einen). */
    setzeKi(platz) {
        const sitz = this.z.plaetze[platz - 1];
        if (this.z.sitzungId)
            return "Die KI setzt sich nur vor dem ersten Spiel dazu.";
        if (sitz.spielerId !== null)
            return "Dieser Platz ist schon vergeben.";
        if (this.z.plaetze.some((s) => s.ki === "platz"))
            return "Es spielt schon eine KI mit.";
        this.kanaele.get(platz)?.schliessen();
        this.kanaele.delete(platz);
        sitz.spielerId = `ki-${platz}`;
        sitz.ki = "platz";
        sitz.token = null;
        this.kiAnschliessen(platz);
        void this.merke();
        this.anAlleTisch();
        return null;
    }
    entferneKi(platz) {
        const sitz = this.z.plaetze[platz - 1];
        if (this.z.sitzungId || sitz.ki !== "platz")
            return;
        this.kiAbmelden(platz);
        sitz.spielerId = null;
        sitz.ki = null;
        void this.merke();
        this.anAlleTisch();
    }
    /** Wer zurück ist, während die KI für ihn spielt, übernimmt erst nach dem laufenden Stich (Konzept). */
    zurueckZurKi(platz, kanal) {
        const vorher = this.wartend.get(platz);
        if (vorher && vorher !== kanal)
            vorher.schliessen();
        this.wartend.set(platz, kanal);
        kanal.senden({ t: "hinweis", text: "Die KI spielt noch diesen Stich zu Ende, dann bist du wieder dran." });
        return this.pruefeKiRueckgabe();
    }
    async pruefeKiRueckgabe() {
        for (const [platz, kanal] of [...this.wartend]) {
            const s = this.z.spiel;
            // Mitten im Stich geht der Platz noch nicht zurück; zwischen Stichen, Spielen und vor dem Ausspielen schon.
            if (s && s.phase === "spiel" && s.stich.length > 0)
                continue;
            this.wartend.delete(platz);
            const sitz = this.z.plaetze[platz - 1];
            this.kiAbmelden(platz);
            this.kanaele.set(platz, kanal);
            sitz.ki = null;
            if (!sitz.token)
                sitz.token = neuesToken();
            if (this.z.sitzungId) {
                await this.erzeuge("kiGibtAb", { platz, an: sitz.spielerId, spielNr: s?.spielNr ?? this.sitzung().naechsteNr, stich: s?.stiche.length ?? 0 }, this.z.sitzungId);
            }
            await this.platzZurueck(platz, false);
        }
    }
    get zustand() { return this.z; }
    get spiel() { return this.z.spiel; }
    get sitzungId() { return this.z.sitzungId; }
    /** Spec 012: Übernahme abschließen (Ereignis, und bei ungeplanter Übernahme: laufendes Spiel neu geben). */
    async uebernimm() {
        if (!this.uebernahme)
            return;
        const { vonGeraet, geplant } = this.uebernahme;
        // Fehlt die Sitzung auf diesem Gerät (erstes Spiel nie beendet), beginnt der Abend neu.
        if (this.z.sitzungId && !this.sitzung())
            this.z.sitzungId = null;
        if (this.z.sitzungId) {
            await this.erzeuge("gastgeberGewechselt", { von: vonGeraet, nach: this.o.geraet, geplant }, this.z.sitzungId);
            const s = this.z.spiel;
            if (!geplant || (s && s.phase !== "ende")) {
                this.z.spiel = null;
                const nr = this.sitzung().naechsteNr;
                await this.erzeuge("spielNeuGegeben", { nr, grund: "Gastgeber-Gerät weg" }, this.z.sitzungId);
            }
        }
        await this.merke();
    }
    /** Der Gastgeber spielt über dieselbe Schnittstelle wie alle anderen: ein Speicher-Kanal zum eigenen Mitspieler. */
    eigenerKanal() {
        const [hier, dort] = speicherKanalPaar();
        this.verbinde(this.z.eigenerPlatz, hier);
        this.bestaetigt.add(this.z.eigenerPlatz);
        this.z.plaetze[this.z.eigenerPlatz - 1].wegSeit = null;
        this.sende(this.z.eigenerPlatz, { t: "tisch", tisch: this.tischInfo(this.z.eigenerPlatz) });
        this.sendeSicht(this.z.eigenerPlatz);
        return dort;
    }
    get raum() { return this.z.raum; }
    /**
     * Spec 030: Ein Gast kommt über den Raum (Link oder Rückkehr). Er bekommt einen freien Platz, sonst einen verwaisten,
     * sonst einen, auf dem die KI für jemanden spielt; mit Token landet er von dort an seinem eigenen. Voll: Absage.
     */
    gastAusRaum(kanal) {
        const frei = (p) => !this.kanaele.has(p) && p !== this.z.eigenerPlatz;
        const s = (p) => this.z.plaetze[p - 1];
        // Ein verwaister Platz geht auch, wenn dort gerade eine QR-Einladung wartet: Wer über den Raum kommt, ist meist
        // genau der, den der Gastgeber zurückholen wollte (mit Token landet er ohnehin an seinem Platz).
        const platz = PLAETZE.find((p) => frei(p) && s(p).spielerId === null)
            ?? PLAETZE.find((p) => frei(p) && this.weg(p))
            ?? PLAETZE.find((p) => p !== this.z.eigenerPlatz && this.weg(p))
            ?? PLAETZE.find((p) => s(p).ki === "fuer");
        if (platz === undefined) {
            kanal.senden({ t: "abgelehnt", grund: "Der Tisch ist voll." });
            kanal.schliessen();
            return null;
        }
        this.raumKanaele.add(kanal);
        this.verbinde(platz, kanal);
        return platz;
    }
    /** Einladung für einen Platz: Der Kanal gehört zu diesem Platz, bis der Mitspieler sich mit Token anders ausweist. */
    verbinde(platz, kanal) {
        if (this.z.plaetze[platz - 1].ki === "fuer") {
            // Die KI behält ihren Kanal, bis der Zurückgekehrte übernimmt (Spec 013).
            this.kiEinladungen.set(kanal, platz);
            kanal.beiNachricht((n) => void this.nimm(kanal, n));
            kanal.beiStatus((s) => { if (s === "zu")
                this.kiEinladungen.delete(kanal); });
            kanal.senden({ t: "tisch", tisch: this.tischInfo(null) });
            this.geaendert();
            return;
        }
        this.kanaele.get(platz)?.schliessen();
        this.kanaele.set(platz, kanal);
        this.verteilt.set(platz, 0);
        this.bestaetigt.delete(platz);
        kanal.beiNachricht((n) => void this.nimm(kanal, n));
        kanal.beiStatus((s) => void this.statusGeaendert(kanal, s));
        this.sende(platz, { t: "tisch", tisch: this.tischInfo(platz) });
        this.geaendert();
    }
    async statusGeaendert(kanal, s) {
        if (this.abgegeben)
            return;
        const platz = [...this.kanaele].find(([, k]) => k === kanal)?.[0];
        if (platz === undefined) {
            if (this.wechsel?.kanal === kanal && s === "zu")
                this.wechsel = null;
            for (const [p, k] of this.wartend)
                if (k === kanal && s === "zu")
                    this.wartend.delete(p);
            if (s === "zu")
                this.kiEinladungen.delete(kanal);
            return this.anAlleTisch();
        }
        if (s === "wackelt")
            this.wackelt.add(platz);
        if (s === "offen")
            this.wackelt.delete(platz);
        if (s === "zu") {
            const warBestaetigt = this.bestaetigt.has(platz);
            this.kanaele.delete(platz);
            this.bestaetigt.delete(platz);
            this.wackelt.delete(platz);
            const sitz = this.z.plaetze[platz - 1];
            if (warBestaetigt && sitz.spielerId) {
                sitz.wegSeit = this.jetzt();
                if (this.z.sitzungId)
                    await this.erzeuge("spielerGetrennt", { platz, spielerId: sitz.spielerId }, this.z.sitzungId);
                await this.merke();
            }
        }
        this.anAlleTisch();
    }
    verbunden(platz) {
        return this.kanaele.get(platz)?.offen ?? false;
    }
    /** Platz verwaist (Spieler gewählt, aber kein bestätigtes Gerät)? */
    weg(platz) {
        const s = this.z.plaetze[platz - 1];
        return s.spielerId !== null && !this.bestaetigt.has(platz);
    }
    alleSitzen() {
        return PLAETZE.every((p) => this.z.plaetze[p - 1].spielerId !== null);
    }
    tischInfo(fuer) {
        const r = this.runde();
        const spieler = r ? Object.values(r.spieler).filter((s) => !s.zusammengefuehrtIn && !s.ausgeblendet).map((s) => ({ id: s.id, name: s.name })) : [];
        const sitzt = fuer !== null && this.bestaetigt.has(fuer) && this.z.plaetze[fuer - 1].spielerId !== null;
        const name = (id) => (id ? (id.startsWith("ki-") ? "KI" : r?.spieler[id]?.name ?? "?") : null);
        const zustand = (s) => (!s.spielerId ? "frei" : this.bestaetigt.has(s.platz) ? (this.wackelt.has(s.platz) ? "wackelt" : "da") : "weg");
        const w = this.z.wahl;
        return {
            tischId: this.z.tischId, rundeId: this.o.rundeId, rundenName: r?.name ?? "", sitzungId: this.z.sitzungId,
            gastgeberName: name(this.z.plaetze[this.z.eigenerPlatz - 1].spielerId) ?? "",
            gastgeberGeraet: this.o.geraet, gastgeberPlatz: this.z.eigenerPlatz,
            profil: this.o.profil, spieler,
            plaetze: this.z.plaetze.map((s) => ({
                platz: s.platz, spielerId: s.spielerId, name: name(s.spielerId), verbunden: this.verbunden(s.platz),
                zustand: zustand(s), wegSeit: zustand(s) === "weg" ? s.wegSeit ?? null : null,
                zurueckgeholt: zustand(s) === "weg" && this.kanaele.has(s.platz),
                ki: s.ki ?? null,
            })),
            frage: this.z.frage ?? null,
            wahl: w ? { platz: w.platz, wahl: w.wahl, bis: w.zeit + ZURUECKNEHMEN_MS } : null,
            wechsel: this.wechsel ? { platz: this.wechsel.platz } : null,
            ersatzFuer: this.z.ersatzFuer ?? null,
            beendet: this.z.beendet ?? false,
            raum: sitzt ? this.z.raum ?? null : null,
            version: this.o.version ?? null,
            ich: sitzt ? fuer : null,
        };
    }
    // ---------- Ablauf ----------
    /** Startet den Abend, sobald vier sitzen: `sitzungBegonnen` (modus direkt) und das erste Spiel. */
    async starte() {
        if (!this.alleSitzen())
            return "Es sitzen noch nicht alle vier.";
        if (this.z.sitzungId && this.z.spiel)
            return null;
        if (!this.z.sitzungId) {
            const sitzungId = neueUlid();
            const ok = await this.erzeuge("sitzungBegonnen", {
                datum: this.heute(), modus: "direkt", profil: this.o.profil, ersteVorhand: 1,
                plaetze: this.platzListe(),
            }, sitzungId);
            if (!ok)
                return "Der Abend konnte nicht beginnen.";
            this.z.sitzungId = sitzungId;
        }
        // Alle erfahren die Sitzung (für Spielblock und Abrechnung).
        this.anAlleTisch();
        await this.teileAus();
        return null;
    }
    /** Plätze für das Ereignis: Mensch mit spielerId, KI-Platz als `ki` (Schlüssel `ki-<platz>`, typen.ts). */
    platzListe() {
        return this.z.plaetze.map((s) => (s.ki === "platz"
            ? { platz: s.platz, art: "ki", ki: this.o.kiRechner ? "gut" : "notfall" }
            : { platz: s.platz, art: "mensch", spielerId: s.spielerId }));
    }
    /** Nächstes Spiel (nur der Gastgeber). Vorhand und Nummer kommen aus der Projektion. */
    async naechstesSpiel() {
        if (!this.z.sitzungId || this.z.beendet || (this.z.spiel && this.z.spiel.phase !== "ende"))
            return;
        await this.teileAus();
    }
    /** Spec 012, geplanter Wechsel: zwischen zwei Spielen den Tisch an ein anderes Gerät geben. */
    uebergib(an) {
        if (an === this.z.eigenerPlatz || !this.bestaetigt.has(an))
            return "Dieses Gerät ist gerade nicht verbunden.";
        if (this.z.spiel && this.z.spiel.phase !== "ende")
            return "Übergeben geht nur zwischen zwei Spielen.";
        this.sende(an, { t: "uebergabe", zustand: structuredClone(this.z) });
        this.abgegeben = true;
        return null;
    }
    /** Alle Verbindungen schließen (nach der Übergabe; die anderen kommen per Einladung zum neuen Gastgeber). */
    schliesseAlle() {
        for (const p of [...this.kis.keys()])
            this.kiAbmelden(p);
        for (const k of [...this.kanaele.values()])
            k.schliessen();
        this.kanaele.clear();
    }
    async teileAus() {
        for (let versuch = 0; versuch < 20; versuch++) {
            const sitzung = this.sitzung();
            const plaetze = this.z.plaetze.map((s) => s.spielerId);
            const { spiel, ereignisse } = neuesSpiel(this.o.profil, plaetze, sitzung.naechsteVorhand, this.o.seed?.() ?? neuerSeed(), sitzung.naechsteNr);
            this.z.spiel = spiel;
            await this.speichereEngine(ereignisse);
            if (spiel.phase !== "neuGemischt")
                break;
            // Neu mischen (z. B. 5 Könige): alle sehen den Grund, dann wird sofort neu gegeben. Die Vorhand bleibt.
            const grund = ereignisse.find((e) => e.typ === "spielNeuGegeben")?.daten["grund"];
            await this.speichereEngine([offenlegen(spiel)]);
            this.anAlle({ t: "hinweis", text: `Neu gemischt: ${String(grund)}` });
        }
        await this.nachZug();
    }
    // ---------- Uhr (Spec 012) ----------
    /** Regelmäßig aufrufen (UI: jede Sekunde; Tests: mit eigener Uhr). Stellt die gemeinsame Frage und führt Wahlen aus. */
    async tick() {
        if (this.abgegeben)
            return;
        const jetzt = this.jetzt();
        const w = this.z.wahl;
        if (w && jetzt - w.zeit >= ZURUECKNEHMEN_MS)
            return this.fuehreWahlAus(w.wahl);
        const s = this.z.spiel;
        if (this.z.frage || this.z.beendet || this.z.ersatzFuer || !s || s.phase === "ende" || s.phase === "neuGemischt")
            return;
        // Gewartet wird nur, wenn der Fehlende am Zug ist.
        const p = s.amZug;
        const sitz = this.z.plaetze[p - 1];
        if (this.weg(p) && sitz.wegSeit !== undefined && sitz.wegSeit !== null && jetzt - sitz.wegSeit >= FRAGE_NACH_MS) {
            this.z.frage = { platz: p, seit: jetzt };
            await this.merke();
            this.anAlleTisch();
        }
    }
    async fuehreWahlAus(wahl) {
        const frage = this.z.frage;
        this.z.wahl = null;
        this.z.frage = null;
        if (!frage)
            return this.anAlleTisch();
        const sitz = this.z.plaetze[frage.platz - 1];
        if (wahl === "warten")
            sitz.wegSeit = this.jetzt();
        if (wahl === "ki" && sitz.spielerId) {
            sitz.ki = "fuer";
            sitz.wegSeit = null;
            // Läuft schon eine Einladung (Rückkehr), bleibt sie offen: Sie hängt jetzt neben der KI.
            const offen = this.kanaele.get(frage.platz);
            this.kanaele.delete(frage.platz);
            if (offen)
                this.kiEinladungen.set(offen, frage.platz);
            const nr = this.z.spiel?.spielNr ?? this.sitzung()?.naechsteNr ?? 1;
            if (this.z.sitzungId)
                await this.erzeuge("kiUebernimmt", { platz: frage.platz, fuer: sitz.spielerId, spielNr: nr, ki: this.o.kiRechner ? "gut" : "notfall" }, this.z.sitzungId);
            this.kiAnschliessen(frage.platz);
        }
        if (wahl === "ersatz")
            this.z.ersatzFuer = frage.platz;
        if (wahl === "beenden")
            this.z.beendet = true;
        if (wahl === "neuGeben" && this.z.sitzungId && this.z.spiel) {
            const spiel = this.z.spiel;
            await this.erzeuge("spielNeuGegeben", { nr: spiel.spielNr, grund: "Spieler weg" }, this.z.sitzungId);
            await this.speichereEngine([{ ...offenlegen({ ...spiel, phase: "neuGemischt" }) }]);
            sitz.wegSeit = this.jetzt();
            this.anAlle({ t: "hinweis", text: "Neu gegeben, weil ein Spieler weg ist." });
            await this.teileAus();
            // Frage und Wahl sind erledigt: Das müssen alle sehen, nicht nur die neuen Karten.
            this.anAlleTisch();
            return;
        }
        await this.merke();
        this.anAlleTisch();
    }
    // ---------- Nachrichten ----------
    async nimm(kanal, n) {
        if (this.abgegeben)
            return;
        if (this.wechsel?.kanal === kanal)
            return; // wartet auf Bestätigung
        const platz = [...this.kanaele].find(([, k]) => k === kanal)?.[0] ?? this.kiEinladungen.get(kanal);
        if (platz === undefined)
            return;
        const sitz = this.z.plaetze[platz - 1];
        if (n.t === "rolle")
            return; // Raum-Handschlag (Spec 030), schon erledigt
        if (n.t === "version") {
            if (this.o.version && n.v !== this.o.version) {
                kanal.senden({ t: "hinweis", text: "Dein Gerät hat eine andere Version als der Gastgeber. Bitte beide die App neu laden." });
                this.sende(this.z.eigenerPlatz, { t: "hinweis", text: "Ein Mitspieler hat eine andere Version der App. Bitte beide neu laden." });
            }
            return;
        }
        // Wer an einen KI-Platz eingeladen ist, sitzt noch nicht: keine Züge im Namen der KI.
        if (this.kiEinladungen.has(kanal) && n.t !== "hallo" && n.t !== "platz")
            return;
        if (n.t === "hallo") {
            // Platz zurück mit Token (netz-sicherheit, Regel 6). Ein fremdes oder falsches Token bringt nichts.
            const mitToken = n.token ? this.z.plaetze.find((s) => s.token === n.token) : undefined;
            if (mitToken?.ki === "fuer") {
                this.kiEinladungen.delete(kanal);
                if (this.kanaele.get(platz) === kanal) {
                    this.kanaele.delete(platz);
                    this.bestaetigt.delete(platz);
                }
                return this.zurueckZurKi(mitToken.platz, kanal);
            }
            if (mitToken) {
                if (mitToken.platz !== platz) {
                    this.kanaele.delete(platz);
                    this.bestaetigt.delete(platz);
                    this.kanaele.get(mitToken.platz)?.schliessen();
                    this.kanaele.set(mitToken.platz, kanal);
                }
                await this.platzZurueck(mitToken.platz);
            }
            else {
                this.sende(platz, { t: "tisch", tisch: this.tischInfo(platz) });
            }
            this.geaendert();
            return;
        }
        if (n.t === "platz")
            return this.waehlePlatz(kanal, platz, n);
        if (this.kiEinladungen.has(kanal))
            return;
        if (n.t === "neu")
            return this.sendeSicht(platz);
        if (!this.bestaetigt.has(platz))
            return this.sende(platz, { t: "abgelehnt", grund: "Du sitzt noch nicht am Tisch." });
        // Abgleich erst, wenn der Platz bestätigt ist (Spec 030).
        if (n.t === "ergaenzung")
            return this.ergaenze(platz, n.ereignisse);
        if (n.t === "wahl") {
            // Alle verbliebenen Spieler gleichberechtigt; die erste Wahl gilt (netz-sicherheit, Wiederverbinden Regel 8).
            if (!this.z.frage || this.z.frage.platz === platz)
                return;
            if (this.z.wahl)
                return this.sende(platz, { t: "abgelehnt", grund: "Es hat schon jemand gewählt." });
            this.z.wahl = { platz, wahl: n.wahl, zeit: this.jetzt() };
            await this.erzeuge("entscheidung", { spielerId: sitz.spielerId, frage: "platzVerwaist", platz: this.z.frage.platz, wahl: n.wahl }, this.z.sitzungId);
            await this.merke();
            return this.anAlleTisch();
        }
        if (n.t === "zuruecknehmen") {
            const w = this.z.wahl;
            if (!w || w.platz !== platz || !this.z.frage)
                return;
            this.z.wahl = null;
            await this.erzeuge("entscheidung", { spielerId: sitz.spielerId, frage: "platzVerwaist", platz: this.z.frage.platz, wahl: w.wahl, zurueckgenommen: true }, this.z.sitzungId);
            await this.merke();
            return this.anAlleTisch();
        }
        if (n.t === "bestaetige") {
            const w = this.wechsel;
            if (!w || w.platz !== n.platz || w.platz === platz)
                return;
            this.wechsel = null;
            const ziel = this.z.plaetze[w.platz - 1];
            // Das alte Gerät verliert seinen Platz: neues Token.
            ziel.token = neuesToken();
            if (this.z.sitzungId)
                await this.erzeuge("geraetGewechselt", { platz: w.platz, spielerId: ziel.spielerId }, this.z.sitzungId);
            if (ziel.ki === "fuer")
                return this.zurueckZurKi(w.platz, w.kanal);
            this.kanaele.get(w.platz)?.schliessen();
            this.kanaele.set(w.platz, w.kanal);
            await this.platzZurueck(w.platz, false);
            return;
        }
        if (n.t === "aktion") {
            const s = this.z.spiel;
            if (!s || sitz.spielerId === null)
                return this.sende(platz, { t: "abgelehnt", grund: "Es läuft gerade kein Spiel." });
            if (this.z.beendet)
                return this.sende(platz, { t: "abgelehnt", grund: "Der Abend ist beendet." });
            // Der Platz kommt aus dem Kanal, nie aus der Nachricht.
            const aktion = { ...n.aktion, platz };
            const r = fuehreAus(s, aktion);
            if (!r.ok) {
                this.sende(platz, { t: "abgelehnt", grund: r.grund });
                return this.sendeSicht(platz);
            }
            this.z.spiel = r.spiel;
            const neu = [...r.ereignisse];
            if (r.spiel.phase === "ende" || r.spiel.phase === "neuGemischt")
                neu.push(offenlegen(r.spiel));
            await this.speichereEngine(neu);
            if (r.spiel.phase === "neuGemischt") {
                const grund = r.ereignisse.find((e) => e.typ === "spielNeuGegeben")?.daten["grund"];
                this.anAlle({ t: "hinweis", text: `Neu gemischt: ${String(grund)}` });
                return this.teileAus();
            }
            await this.nachZug();
        }
    }
    /** Wahl auf „Wer bist du?“: freier Platz, Gerätewechsel (Stufe 4), Ersatz oder Rückkehr nach Übernahme. */
    async waehlePlatz(kanal, platz, n) {
        const sitz = this.z.plaetze[platz - 1];
        let spielerId = n.spielerId;
        // Ablehnungen gehen an den, der gefragt hat: Bei einer Einladung an einen KI-Platz ist das nicht der Platz-Kanal.
        const neuerSpieler = async () => {
            const name = (n.neuerName ?? "").trim();
            if (!name || name.length > 24) {
                kanal.senden({ t: "abgelehnt", grund: "Bitte einen Namen mit 1 bis 24 Zeichen." });
                return null;
            }
            const id = `sp-${neueUlid().toLowerCase()}`;
            if (!await this.erzeuge("spielerAngelegt", { spielerId: id, name }, null)) {
                kanal.senden({ t: "abgelehnt", grund: "Das Profil konnte nicht angelegt werden." });
                return null;
            }
            return id;
        };
        // Ein Raum-Gast ohne Token landet zuerst auf irgendeinem verwaisten Platz (nach einer Übernahme fast immer dem des
        // alten Gastgebers). Sitzt der Gewählte woanders und ist weg, wandert der Kanal an seinen Platz (Prüfer 030).
        const seiner = spielerId ? this.z.plaetze.find((s) => s.spielerId === spielerId) : undefined;
        if (seiner && seiner.platz !== platz && seiner.platz !== this.z.eigenerPlatz && seiner.ki !== "fuer"
            && !this.bestaetigt.has(seiner.platz) && this.kanaele.get(platz) === kanal && !this.bestaetigt.has(platz)) {
            // Hängt dort schon ein Kanal (anderer vorläufiger Gast, QR-Einladung), tauschen beide die Plätze statt ihn zu schließen.
            const verdraengt = this.kanaele.get(seiner.platz);
            this.kanaele.delete(platz);
            this.kanaele.set(seiner.platz, kanal);
            this.verteilt.set(seiner.platz, 0);
            if (verdraengt) {
                this.kanaele.set(platz, verdraengt);
                this.verteilt.set(platz, 0);
                this.sende(platz, { t: "tisch", tisch: this.tischInfo(platz) });
            }
            return this.waehlePlatz(kanal, seiner.platz, n);
        }
        // Stufe 4: Wer schon hier sitzt, aber weg ist, kommt auf neuem Gerät zurück. Ein anderer bestätigt.
        const kiFuerIhn = spielerId ? this.z.plaetze.find((s) => s.ki === "fuer" && s.spielerId === spielerId) : undefined;
        if (kiFuerIhn) {
            // Der Kanal hängt noch am Platz der Einladung; die KI behält ihren Kanal, bis der Stich fertig ist.
            if (this.kanaele.get(platz) === kanal)
                this.kanaele.delete(platz);
            this.kiEinladungen.delete(kanal);
            if (kiFuerIhn.token === null)
                return this.zurueckZurKi(kiFuerIhn.platz, kanal);
            this.wechsel = { platz: kiFuerIhn.platz, kanal };
            kanal.senden({ t: "hinweis", text: "Ein anderer Spieler bestätigt gleich, dass du es bist." });
            return this.anAlleTisch();
        }
        if (spielerId && sitz.spielerId === spielerId && !this.bestaetigt.has(platz)) {
            if (sitz.token === null) {
                // Nach einer ungeplanten Übernahme kennt der neue Gastgeber keine Tokens: die Wahl genügt.
                sitz.token = neuesToken();
                return this.platzZurueck(platz);
            }
            this.kanaele.delete(platz);
            this.wechsel = { platz, kanal };
            kanal.senden({ t: "hinweis", text: "Ein anderer Spieler bestätigt gleich, dass du es bist." });
            return this.anAlleTisch();
        }
        // Ersatz an einem verwaisten Platz: übernimmt die Hand, Punkte zählen ab diesem Spiel für ihn.
        if (this.z.ersatzFuer === platz && sitz.spielerId) {
            if (n.neuerName !== undefined)
                spielerId = (await neuerSpieler()) ?? undefined;
            if (!spielerId)
                return;
            if (!this.runde()?.spieler[spielerId])
                return kanal.senden({ t: "abgelehnt", grund: "Diesen Spieler gibt es in der Runde nicht." });
            if (this.z.plaetze.some((s) => s.spielerId === spielerId))
                return kanal.senden({ t: "abgelehnt", grund: "Dieser Spieler sitzt schon am Tisch." });
            const von = sitz.spielerId;
            sitz.spielerId = spielerId;
            sitz.token = neuesToken();
            sitz.wegSeit = null;
            this.z.ersatzFuer = null;
            if (this.z.spiel)
                this.z.spiel = { ...this.z.spiel, plaetze: this.z.plaetze.map((s) => s.spielerId) };
            if (this.z.sitzungId) {
                const nr = this.z.spiel?.spielNr ?? this.sitzung().naechsteNr;
                await this.erzeuge("platzUebernommen", { platz, von, nach: spielerId, spielNr: nr }, this.z.sitzungId);
                await this.erzeuge("plaetzeGeaendert", { plaetze: this.platzListe(), abSpiel: nr }, this.z.sitzungId);
            }
            this.bestaetigt.add(platz);
            this.sende(platz, { t: "sitzt", platz, token: sitz.token });
            this.sendeBestand(platz);
            await this.nachZug();
            return this.anAlleTisch();
        }
        if (sitz.spielerId !== null)
            return kanal.senden({ t: "abgelehnt", grund: "Dieser Platz ist schon vergeben." });
        if (n.neuerName !== undefined)
            spielerId = (await neuerSpieler()) ?? undefined;
        if (!spielerId)
            return;
        if (!this.runde()?.spieler[spielerId])
            return kanal.senden({ t: "abgelehnt", grund: "Diesen Spieler gibt es in der Runde nicht." });
        if (this.z.plaetze.some((s) => s.spielerId === spielerId))
            return kanal.senden({ t: "abgelehnt", grund: "Dieser Spieler sitzt schon am Tisch." });
        sitz.spielerId = spielerId;
        sitz.token = neuesToken();
        this.bestaetigt.add(platz);
        this.sende(platz, { t: "sitzt", platz, token: sitz.token });
        this.sendeBestand(platz);
        await this.merke();
        this.anAlleTisch();
    }
    /** Platz ist wieder besetzt: Ereignis, Token, Tisch, Sicht und alle Ereignisse der Runde. */
    async platzZurueck(platz, mitEreignis = true) {
        const sitz = this.z.plaetze[platz - 1];
        const warWeg = sitz.wegSeit !== undefined && sitz.wegSeit !== null;
        this.bestaetigt.add(platz);
        this.verteilt.set(platz, 0);
        sitz.wegSeit = null;
        if (this.z.frage?.platz === platz) {
            this.z.frage = null;
            this.z.wahl = null;
        }
        if (mitEreignis && warWeg && this.z.sitzungId)
            await this.erzeuge("spielerZurueck", { platz, spielerId: sitz.spielerId, weg: this.kanaele.get(platz) && this.raumKanaele.has(this.kanaele.get(platz)) ? "raum" : "qr" }, this.z.sitzungId);
        this.sende(platz, { t: "sitzt", platz, token: sitz.token });
        this.sendeBestand(platz);
        this.sendeRunde(platz);
        this.sendeSicht(platz);
        await this.merke();
        this.anAlleTisch();
    }
    /** Nach jeder Änderung: merken, allen ihre Sicht schicken, nach Spielende die Runde verteilen. */
    async nachZug() {
        if (this.wartend.size > 0)
            await this.pruefeKiRueckgabe();
        await this.merke();
        for (const p of PLAETZE)
            this.sendeSicht(p);
        // Nach Spielende (netz-sicherheit, Regel 8) bekommen alle die vollständigen Ereignisse der Runde.
        if (this.z.spiel?.phase === "ende")
            for (const p of PLAETZE)
                this.sendeRunde(p);
        this.geaendert();
    }
    /** Jedes Gerät bekommt nur, was es noch nicht hat; nach einer neuen Verbindung alles. Nie mitten im Spiel. */
    sendeRunde(p) {
        if (!this.bestaetigt.has(p) || this.kis.has(p))
            return;
        const s = this.z.spiel;
        if (s && s.phase !== "ende" && s.phase !== "neuGemischt") {
            // Mitten im Spiel nur die abgeschlossenen Teile: alles vor dem Austeilen des laufenden Spiels.
            const start = this.ereignisse.findIndex((e) => e.typ === "kartenGegeben" && e.daten.spielNr === s.spielNr && e.sitzung === this.z.sitzungId);
            const bis = start >= 0 ? start : this.ereignisse.length;
            const ab = this.verteilt.get(p) ?? 0;
            if (ab < bis)
                this.sende(p, { t: "runde", ereignisse: this.ereignisse.slice(ab, bis).filter((e) => e.runde === this.o.rundeId) });
            this.verteilt.set(p, Math.max(ab, bis));
            return;
        }
        const ab = this.verteilt.get(p) ?? 0;
        this.sende(p, { t: "runde", ereignisse: this.ereignisse.slice(ab).filter((e) => e.runde === this.o.rundeId) });
        this.verteilt.set(p, this.ereignisse.length);
    }
    // ---------- Abgleich (Spec 030) ----------
    /** Wer sitzt, erfährt, welche Ereignisse der Runde der Gastgeber schon hat, und schickt den Rest. */
    sendeBestand(platz) {
        if (this.kis.has(platz) || platz === this.z.eigenerPlatz)
            return;
        this.sende(platz, { t: "bestand", ids: this.ereignisse.filter((e) => e.runde === this.o.rundeId).map((e) => e.id) });
    }
    /**
     * Ergänzung eines Mitspielers übernehmen: nur Ereignisse dieser Runde mit gültiger Form, die der Gastgeber noch nicht
     * hat, und nie etwas aus der laufenden Sitzung (die schreibt nur der Gastgeber).
     */
    async ergaenze(platz, ereignisse) {
        if (!Array.isArray(ereignisse))
            return;
        const bekannt = new Set(this.ereignisse.map((e) => e.id));
        const neu = [];
        for (const e of ereignisse.slice(0, 5000)) {
            if (pruefeForm(e).length > 0)
                continue;
            const x = e;
            if (x.runde !== this.o.rundeId || bekannt.has(x.id) || (this.z.sitzungId !== null && x.sitzung === this.z.sitzungId))
                continue;
            bekannt.add(x.id);
            neu.push(x);
        }
        void platz;
        if (neu.length === 0)
            return;
        this.ereignisse.push(...neu);
        this.projektion = null;
        await this.o.speichere(neu);
        this.geaendert();
    }
    // ---------- Ereignisse ----------
    runde() {
        this.projektion ??= projiziere(this.ereignisse);
        return this.projektion[this.o.rundeId];
    }
    sitzung() {
        return this.z.sitzungId ? this.runde()?.sitzungen[this.z.sitzungId] : undefined;
    }
    async erzeuge(typ, daten, sitzungId) {
        const runde = this.runde();
        const sitzung = sitzungId ? runde?.sitzungen[sitzungId] : undefined;
        const r = erzeugeEreignis(typ, daten, {
            rundeId: this.o.rundeId, geraet: this.o.geraet, runde, sitzung,
            ...(sitzungId ? { sitzungId, hoechsteSeq: Math.max(this.hoechsteSeq, sitzung?.hoechsteSeq ?? 0) } : {}),
            zusammenfuehrungen: zusammenfuehrungenAus(this.ereignisse, this.o.rundeId),
            ...(this.o.jetzt ? { jetzt: this.o.jetzt() } : {}),
        });
        if (!r.ok)
            return false;
        this.ereignisse.push(r.wert);
        if (r.wert.seq)
            this.hoechsteSeq = r.wert.seq;
        if (!NUR_PROTOKOLL.has(typ))
            this.projektion = null;
        await this.o.speichere([r.wert]);
        return true;
    }
    async speichereEngine(liste) {
        for (const e of liste) {
            if (!await this.erzeuge(e.typ, e.daten, this.z.sitzungId))
                throw new Error(`Ereignis ${e.typ} wurde abgelehnt`);
        }
    }
    // ---------- Senden ----------
    sende(platz, n) {
        this.kanaele.get(platz)?.senden(n);
    }
    anAlle(n) {
        for (const p of PLAETZE)
            if (this.bestaetigt.has(p))
                this.sende(p, n);
    }
    anAlleTisch() {
        for (const p of PLAETZE)
            this.sende(p, { t: "tisch", tisch: this.tischInfo(p) });
        // Wer auf Bestätigung wartet, sieht den Tisch ebenfalls (ohne Platz und ohne Karten).
        this.wechsel?.kanal.senden({ t: "tisch", tisch: this.tischInfo(null) });
        this.geaendert();
    }
    /** Nachrichten an einen Mitspieler entstehen ausschließlich aus sichtFuer(seinPlatz) (netz-sicherheit, Regel 1). */
    sendeSicht(platz) {
        const s = this.z.spiel;
        if (!s || !this.bestaetigt.has(platz) || this.z.plaetze[platz - 1].spielerId === null)
            return;
        const seq = (this.seq.get(platz) ?? 0) + 1;
        this.seq.set(platz, seq);
        this.sende(platz, { t: "sicht", seq, sicht: sichtFuer(s, platz) });
    }
    async merke() {
        await this.o.merke(structuredClone(this.z));
    }
    geaendert() {
        this.beiAenderung?.();
    }
    jetzt() {
        return (this.o.jetzt?.() ?? new Date()).getTime();
    }
    heute() {
        const d = this.o.jetzt?.() ?? new Date();
        const z = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    }
}
//# sourceMappingURL=gastgeber.js.map