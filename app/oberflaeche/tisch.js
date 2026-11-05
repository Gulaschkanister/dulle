// Der laufende Tisch auf diesem Gerät (Spec 010, 012, 030): Gastgeber oder Mitspieler, Einladungen per QR oder Link,
// Rückkehr (QR oder still über den Raum), Übernahme, Verbindung zum Speicher. Verbindungsabbrüche sind ein normaler Zustand (netz-sicherheit, Wiederverbinden).
import { neueUlid } from "../kern/ulid.js";
import { FRAGE_NACH_MS, Gastgeber } from "../netz/gastgeber.js";
import { Mitspieler } from "../netz/mitspieler.js";
import { gastgeberImRaum, mitspielerImRaum, raumPfad } from "../netz/raum.js";
import { trysteroVermittlung } from "../netz/trystero.js";
import { guteKi } from "./kiRechner.js";
import { beantworteEinladung, erstelleEinladung } from "../netz/webrtc.js";
import { codeAusText } from "../netz/sdp.js";
import { leseLokal, schreibeLokal } from "./app.js";
import { zuletztGenutzt } from "./regeln.js";
const GESPEICHERT = "tisch";
/** Nur für Tests (E2E): feste Seeds in dieser Reihenfolge, damit Hochzeit, Armut usw. sicher vorkommen. */
const TEST_SEEDS = "dulle.test.seeds";
const TOKEN = (tischId) => `dulle.tischToken.${tischId}`;
/** Spec 012: letzter Stand am Tisch für Mitspieler, damit nach Neuladen nicht alles leer ist. */
const LETZTER_STAND = "dulle.letzterTisch";
/** Nur für Tests (E2E, Spec 030): eigene Nostr-Relays statt der öffentlichen. */
const TEST_RELAYS = "dulle.test.relays";
/** Nur für Tests des QR-Wegs (Spec 012): gar keinen Raum öffnen. */
const TEST_OHNE_RAUM = "dulle.test.ohneRaum";
/** Spec 030: optionaler TURN-Eintrag aus den Einstellungen. */
export const TURN = "dulle.turn";
/** So lange wartet ein Mitspieler im Raum auf den Gastgeber, dann kommt die klare Meldung. */
const RAUM_WARTEN_MS = 20_000;
/** Abstand zwischen zwei stillen Rückkehr-Versuchen über den Raum. */
const RUECKKEHR_ABSTAND_MS = 15_000;
/** So lange gilt ein Getrennter als „kommt über das Internet zurück“, bevor „Verbindung weg“ und „zurückholen“ kommen. */
export const RAUM_GEDULD_MS = 20_000;
/** Plätze, deren 20 s auf der Platzliste schon abgelaufen und neu gezeichnet sind (Schlüssel: Platz und wegSeit). */
const geduldVorbei = new Set();
const KLAPPT_NICHT = "Der Tisch antwortet nicht. Ist die App beim Gastgeber offen? Dann „Noch einmal versuchen“. Sitzt ihr zusammen, kann der Gastgeber auch „Am Tisch (QR)“ wählen.";
let aktiv = null;
let offenerTisch = null;
let uhr = null;
let vermittlung = null;
let gastgeberRaum = null;
/** Raum wirklich offen (nicht nur im Aufbau): erst dann taugt der Link. */
let raumBereit = false;
let mitspielerRaum = null;
let letzterRaumVersuch = 0;
let letztesRaumOeffnen = 0;
let version = null;
/** Trystero mit Nostr (Spec 030); mit TURN aus den Einstellungen, im Test mit eigenem Relay. */
function vermittlungHolen() {
    if (!vermittlung) {
        const relays = leseLokal(TEST_RELAYS);
        const turn = leseLokal(TURN);
        vermittlung = trysteroVermittlung({ ...(relays ? { relays } : {}), ...(turn?.urls ? { turn: [turn] } : {}) });
    }
    return vermittlung;
}
/** Nach einer Änderung am TURN-Eintrag: nächste Verbindung mit den neuen Werten. */
export function vermittlungNeu() { vermittlung = null; }
/** App-Version (aus version.json, Build), um abweichende Geräte zu melden. */
async function ladeVersion() {
    if (version)
        return version;
    try {
        version = (await (await fetch("version.json", { cache: "no-cache" })).json()).version ?? null;
    }
    catch { /* offline ohne Cache: ohne Vergleich */ }
    return version;
}
export function tisch() { return aktiv; }
export function gespeicherterTisch() { return offenerTisch; }
export function letzterStand() { return leseLokal(LETZTER_STAND); }
/** Beim Start: Hatte dieses Gerät einen Tisch eröffnet, der noch läuft? */
export async function ladeOffenenTisch(app) {
    offenerTisch = (await app.speicher.einstellung(GESPEICHERT)) ?? null;
}
function testSeeds() {
    const liste = leseLokal(TEST_SEEDS);
    if (!liste || liste.length === 0)
        return undefined;
    let i = 0;
    return () => liste[i++ % liste.length];
}
/** Uhr für Abwesenheiten und Entscheidungen (Spec 012): Gastgeber prüft, Anzeigen zählen hoch. */
function starteUhr(app) {
    if (uhr)
        return;
    uhr = setInterval(() => {
        const t = aktiv;
        if (!t)
            return;
        void t.gastgeber?.tick();
        if (t.rolle === "gastgeber" && !gastgeberRaum)
            void raumOeffnen(app);
        if (t.rolle === "mitspieler" && t.client && !t.client.verbunden && !t.client.tisch?.schreiberWeiter)
            void zurueckUeberRaum(app);
        const ti = t.client?.tisch;
        const zaehlt = ti && (ti.plaetze.some((p) => p.zustand === "weg") || ti.wahl !== null) || (t.client && !t.client.verbunden);
        if (zaehlt && location.hash.startsWith("#/tisch"))
            app.zeichne();
        // Die Platzliste nicht jede Sekunde neu zeichnen (dabei können Tipps verloren gehen), sondern nur, wenn für einen
        // Platz die 20 s ablaufen: Dann kommt „zurückholen“ (Spec 030, Prüfer und UI 2026-10-31).
        else if (/^#\/runde\/[^/]+\/am-handy/.test(location.hash) && ti) {
            const neu = ti.plaetze.filter((p) => p.zustand === "weg" && p.wegSeit !== null && Date.now() - p.wegSeit >= RAUM_GEDULD_MS && !geduldVorbei.has(`${p.platz}:${p.wegSeit}`));
            for (const p of neu)
                geduldVorbei.add(`${p.platz}:${p.wegSeit}`);
            if (neu.length > 0)
                app.zeichne();
        }
    }, 1000);
}
// ---------- Gastgeber ----------
/** Tisch eröffnen, nach Neuladen fortsetzen oder (Spec 012) von einem anderen Gerät übernehmen. */
export async function eroeffne(app, rundeId, profil, eigenerSpielerId, eigenerPlatz = 1, zustand, uebernahme, ohneRaum = false) {
    // Ein vorgemerktes Spiel (Schreiber, „Rückgängig“) gehört schon zum Abend: erst speichern, dann den Tisch aufbauen.
    await app.festschreiben();
    const ereignisse = (await app.speicher.alle()).filter((e) => e.runde === rundeId);
    const seed = testSeeds();
    const v = await ladeVersion();
    const g = new Gastgeber({
        rundeId, profil, geraet: app.geraet, ereignisse, ...(v ? { version: v } : {}), kiRechner: guteKi,
        speichere: async (neu) => {
            await app.speicher.fuegeHinzu(neu);
            if (neu.some((e) => ["sitzungBegonnen", "spielBeendet", "spielEingetragen", "spielKorrigiert", "spielerAngelegt", "spielNeuGegeben", "plaetzeGeaendert"].includes(e.typ)))
                await app.ladeNeu();
        },
        merke: async (z) => {
            offenerTisch = { rundeId, profil, eigenerSpielerId, zustand: z };
            await app.speicher.setzeEinstellung(GESPEICHERT, offenerTisch);
        },
        ...(seed ? { seed } : {}),
    }, eigenerSpielerId, eigenerPlatz, zustand, uebernahme);
    if (uebernahme)
        await g.uebernimm();
    const client = new Mitspieler(g.eigenerKanal());
    aktiv = { rolle: "gastgeber", rundeId, gastgeber: g, client, einladungen: new Map(), antwort: null, neu: null, fehler: null };
    g.beiAenderung = () => {
        // Eine angenommene Einladung ist erledigt, sobald der Platz verbunden ist; sonst stünde sie nach einer späteren
        // Trennung wieder da („Verbindung wird aufgebaut …“). Bei „KI spielt für“ hält die KI den Kanal, die Einladung bleibt.
        const t = aktiv;
        if (t?.gastgeber === g)
            for (const [p, e] of t.einladungen)
                if (e.link && !e.annehmen && g.verbunden(p) && !g.zustand.plaetze[p - 1].ki)
                    t.einladungen.delete(p);
        app.zeichne();
    };
    client.beiAenderung = () => app.zeichne();
    schreibeLokal(LETZTER_STAND, null);
    if (!zustand) {
        offenerTisch = { rundeId, profil, eigenerSpielerId, zustand: structuredClone(g.zustand) };
        await app.speicher.setzeEinstellung(GESPEICHERT, offenerTisch);
    }
    starteUhr(app);
    if (!ohneRaum)
        void raumOeffnen(app);
}
/** Spec 016: Den Tisch für einen offenen Abend eröffnen. Die vier Plätze stehen schon; Nummer und Vorhand laufen weiter. */
export async function eroeffneFuerAbend(app, sitzungId, eigenerSpielerId) {
    const gefunden = app.sitzung(sitzungId);
    if (!gefunden)
        return "Den Abend gibt es auf diesem Gerät nicht.";
    const { runde: r, sitzung: s } = gefunden;
    const eigen = s.plaetze.find((p) => p.art === "mensch" && p.spielerId === eigenerSpielerId);
    if (!eigen)
        return "Du sitzt an diesem Abend nicht am Tisch.";
    const token = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const zustand = {
        tischId: neueUlid(), eigenerPlatz: eigen.platz, sitzungId: s.id, spiel: null,
        plaetze: s.plaetze.map((p) => p.art === "mensch"
            ? { platz: p.platz, spielerId: p.spielerId, token: p.platz === eigen.platz ? token : null }
            : { platz: p.platz, spielerId: `ki-${p.platz}`, token: null, ki: "platz" }),
    };
    const nurKi = s.plaetze.every((p) => p.platz === eigen.platz || p.art === "ki");
    await eroeffne(app, r.id, s.profil, eigenerSpielerId, eigen.platz, zustand, undefined, nurKi);
    offenerTisch = { rundeId: r.id, profil: s.profil, eigenerSpielerId, zustand: structuredClone(aktiv.gastgeber.zustand) };
    await app.speicher.setzeEinstellung(GESPEICHERT, offenerTisch);
    return null;
}
/** Spec 016: Die Runde „Üben“ mit dem Spieler „Ich“; einmal angelegt, dann wiederverwendet. */
const UEBEN = "dulle.uebenRunde";
/**
 * Spec 016: Gegen die KI üben. Ein Tipp: Runde „Üben“ (beim ersten Mal anlegen), drei KI-Plätze, austeilen. Kein Netz.
 * Läuft schon ein Übungstisch oder ist ein Übungsabend offen, geht es dort weiter.
 */
export async function ueben(app) {
    let rundeId = leseLokal(UEBEN);
    if (!rundeId || !app.runde(rundeId)) {
        rundeId = app.neueId();
        if (!(await app.speichere("rundeAngelegt", { name: "Üben" }, { runde: rundeId })))
            return "Die Übungsrunde konnte nicht angelegt werden.";
        if (!(await app.speichere("spielerAngelegt", { spielerId: app.neueId(), name: "Ich" }, { runde: rundeId })))
            return "Die Übungsrunde konnte nicht angelegt werden.";
        schreibeLokal(UEBEN, rundeId);
    }
    const r = app.runde(rundeId);
    const ich = Object.values(r.spieler).find((sp) => !sp.zusammengefuehrtIn);
    if (aktiv) {
        if (aktiv.rundeId === rundeId && aktiv.rolle === "gastgeber")
            return null;
        return "Erst den laufenden Tisch beenden (Menü am Tisch).";
    }
    if (offenerTisch?.rundeId === rundeId) {
        await fortsetzen(app);
        return null;
    }
    const offen = app.offeneSitzung(rundeId, true);
    if (offen) {
        const f = await eroeffneFuerAbend(app, offen.sitzung.id, ich.id);
        if (f)
            return f;
        await aktiv.gastgeber.naechstesSpiel();
        return null;
    }
    await eroeffne(app, rundeId, zuletztGenutzt(r), ich.id, 1, undefined, undefined, true);
    const g = aktiv.gastgeber;
    for (const p of [2, 3, 4]) {
        const f = g.setzeKi(p);
        if (f)
            return f;
    }
    return g.starte();
}
/** Spec 016: Der Gastgeber schreibt mit echten Karten weiter. Der Tisch geht zu, der Abend bleibt offen auf diesem Gerät. */
export async function mitEchtenKartenWeiter(app) {
    const g = aktiv?.gastgeber;
    const sitzungId = g?.sitzungId;
    if (!g || !sitzungId)
        return "Es läuft kein Tisch.";
    const f = await g.mitEchtenKartenWeiter();
    if (f)
        return f;
    // Die anderen haben den Hinweis bekommen; danach gehen die Verbindungen zu.
    setTimeout(() => g.schliesseAlle(), 1500);
    await schliesseTisch(app);
    app.geheZu(`/abend/${sitzungId}`);
    return null;
}
/**
 * Spec 030: Raum des Tischs öffnen, sobald Internet da ist, auch am QR-Tisch (Rückkehr ohne Tipp). Ohne Internet oder
 * Vermittlung bleibt alles beim QR-Weg; die Uhr versucht es später wieder.
 */
async function raumOeffnen(app) {
    const g = aktiv?.gastgeber;
    const nurKi = g?.zustand.plaetze.every((p) => p.platz === g.zustand.eigenerPlatz || p.ki === "platz") ?? false;
    if (!g || nurKi || gastgeberRaum || !navigator.onLine || leseLokal(TEST_OHNE_RAUM) || Date.now() - letztesRaumOeffnen < RUECKKEHR_ABSTAND_MS)
        return;
    letztesRaumOeffnen = Date.now();
    const raum = g.raum;
    gastgeberRaum = { beiGegenueber: () => undefined, verlasse: () => undefined }; // Platzhalter: nicht doppelt öffnen
    try {
        const v = await vermittlungHolen().betrete(raum);
        // Inzwischen ein anderer Tisch: diesen Raum wieder verlassen und Platz für den neuen machen.
        if (aktiv?.gastgeber !== g) {
            v.verlasse();
            gastgeberRaum = null;
            return;
        }
        gastgeberRaum = v;
        raumBereit = true;
        gastgeberImRaum(v, g.zustand.tischId, (k) => { g.gastAusRaum(k); app.zeichne(); });
    }
    catch {
        gastgeberRaum = null;
    }
    app.zeichne();
}
export function raumOffen() { return raumBereit; }
/** Link für den ganzen Tisch: Raum-ID und Passwort stehen nur im `#fragment`. */
export function tischLink() {
    const g = aktiv?.gastgeber;
    return g ? `${location.origin}${location.pathname}#${raumPfad(g.raum)}` : null;
}
export async function fortsetzen(app) {
    const t = offenerTisch;
    if (!t)
        return;
    await eroeffne(app, t.rundeId, t.profil, t.eigenerSpielerId, t.zustand.eigenerPlatz, t.zustand);
}
/** Einladung für einen Platz (auch: Rückkehr-QR, Ersatz): QR mit Link, darunter „Antwort scannen“. */
export async function einladen(app, platz) {
    const t = aktiv;
    if (!t?.gastgeber)
        return;
    const e = { platz, link: null, code: null, annehmen: null, fehler: null };
    t.einladungen.set(platz, e);
    app.zeichne();
    try {
        const einladung = await erstelleEinladung(false);
        e.code = einladung.code;
        e.link = `${location.origin}${location.pathname}#/beitreten/${encodeURIComponent(einladung.code)}`;
        e.annehmen = einladung.annehmen;
        t.gastgeber.verbinde(platz, einladung.kanal);
    }
    catch {
        e.fehler = "Die Einladung konnte nicht erstellt werden. Dieser Browser kann vielleicht keine Direktverbindung.";
    }
    app.zeichne();
}
export async function antwortUebernehmen(app, platz, text) {
    const e = aktiv?.einladungen.get(platz);
    if (!e?.annehmen)
        return;
    try {
        await e.annehmen(codeAusText(text));
        e.annehmen = null;
        e.fehler = null;
    }
    catch (f) {
        e.fehler = f.message.startsWith("Das ist") ? f.message : "Dieser Code passt nicht. Bitte den Antwort-Code vom Handy des Mitspielers scannen.";
    }
    app.zeichne();
}
/** Spec 012, geplant: Tisch an ein anderes Gerät geben. Dieses Gerät merkt sich sein Token, um später zurückzukommen. */
export async function uebergeben(app, an) {
    const g = aktiv?.gastgeber;
    if (!g)
        return "Kein Tisch offen.";
    const fehler = g.uebergib(an);
    if (fehler)
        return fehler;
    const eigen = g.zustand.plaetze[g.zustand.eigenerPlatz - 1];
    if (eigen.token)
        schreibeLokal(TOKEN(g.zustand.tischId), eigen.token);
    const ti = aktiv?.client?.tisch;
    const sicht = aktiv?.client?.sicht ?? null;
    await schliesseTisch(app);
    // Erst schließen, wenn die Übergabe unterwegs ist (pc.close() verwirft, was noch im Puffer liegt).
    setTimeout(() => g.schliesseAlle(), 1500);
    // Dieses Gerät sitzt weiter am Tisch, jetzt als Mitspieler, der sich vom neuen Gastgeber zurückholen lässt.
    if (ti) {
        const neuerGastgeber = ti.plaetze[an - 1];
        schreibeLokal(LETZTER_STAND, { tisch: { ...ti, gastgeberName: neuerGastgeber.name ?? "", gastgeberPlatz: an }, sicht });
        fortsetzenAlsMitspieler(app);
    }
    return null;
}
// ---------- Mitspieler ----------
function neuerClient(app, kanal) {
    const client = new Mitspieler(kanal, {
        ...(version ? { version } : {}),
        // Spec 030, Abgleich: eigene Ereignisse der Runde, die der Gastgeber nicht hat (nie aus der laufenden Sitzung).
        ergaenzung: async (rundeId, ids, laufend) => (await app.speicher.alle()).filter((e) => e.runde === rundeId && !ids.has(e.id) && e.sitzung !== laufend),
        tokenFuer: (tischId) => leseLokal(TOKEN(tischId)) ?? undefined,
        merkeToken: (tischId, token) => schreibeLokal(TOKEN(tischId), token),
        uebernimm: async (ereignisse) => {
            await app.speicher.fuegeHinzu(ereignisse);
            await app.ladeNeu();
        },
        // Nach einer Übergabe ist dieses Gerät Gastgeber: Dann gibt es keinen Mitspieler-Stand mehr zu merken.
        merkeStand: (tisch, sicht) => { if (aktiv?.rolle !== "gastgeber")
            schreibeLokal(LETZTER_STAND, tisch.beendet ? null : { tisch, sicht }); },
        uebergabe: async (zustand, tisch) => {
            // Geplanter Wechsel: dieses Gerät wird Gastgeber, ohne Spielverlust.
            await uebernehmen(app, zustand, tisch, true);
            app.geheZu(`/runde/${tisch.rundeId}/am-handy`);
        },
    });
    return client;
}
/** Mitspieler: Einladung beantworten. Die Seite zeigt danach den Antwort-Code. */
export async function beitreten(app, einladung) {
    if (aktiv?.rolle === "mitspieler" && aktiv.client)
        return;
    aktiv = { rolle: "mitspieler", rundeId: null, gastgeber: null, client: null, einladungen: new Map(), antwort: null, neu: null, fehler: null };
    app.zeichne();
    await ladeVersion();
    try {
        const { code, kanal } = await beantworteEinladung(codeAusText(einladung));
        const client = neuerClient(app, kanal);
        client.beiAenderung = () => {
            if (aktiv && client.tisch)
                aktiv.rundeId = client.tisch.rundeId;
            app.zeichne();
        };
        aktiv.client = client;
        aktiv.antwort = { code, link: code };
        starteUhr(app);
    }
    catch (f) {
        aktiv.fehler = f.message.startsWith("Das ist") ? f.message : "Diese Einladung lässt sich nicht öffnen. Bitte den QR-Code noch einmal scannen.";
    }
    app.zeichne();
}
/** Spec 030: Mitspieler über den Link. Danach geht es weiter wie nach dem QR-Tausch („Wer bist du?“). */
export async function beitretenUeberRaum(app, raum) {
    if (aktiv?.rolle === "mitspieler" && aktiv.client)
        return;
    const t = { rolle: "mitspieler", rundeId: null, gastgeber: null, client: null, einladungen: new Map(), antwort: null, neu: null, fehler: null, ueberRaum: true };
    aktiv = t;
    app.zeichne();
    await ladeVersion();
    if (aktiv !== t)
        return;
    try {
        mitspielerRaum?.verlasse();
        const v = await vermittlungHolen().betrete(raum);
        if (aktiv !== t) {
            v.verlasse();
            return;
        }
        mitspielerRaum = v;
        const ok = await mitspielerImRaum(v, null, RAUM_WARTEN_MS, (kanal) => {
            if (aktiv !== t) {
                kanal.schliessen();
                return;
            }
            const client = neuerClient(app, kanal);
            client.beiAenderung = () => {
                if (aktiv && client.tisch)
                    aktiv.rundeId = client.tisch.rundeId;
                app.zeichne();
            };
            t.client = client;
        });
        if (aktiv !== t)
            return;
        if (!ok)
            t.fehler = KLAPPT_NICHT;
        starteUhr(app);
    }
    catch {
        t.fehler = "Ohne Internet geht der Link nicht. Am Tisch geht es per QR-Code.";
    }
    app.zeichne();
}
/** Ein Kanal ohne Gegenstelle: für den letzten Stand nach einem Neuladen, bis die Rückkehr geklappt hat. */
const TOTER_KANAL = { senden: () => undefined, beiNachricht: () => undefined, beiStatus: () => undefined, schliessen: () => undefined, offen: false };
/** Spec 012: Nach einem Neuladen zurück an den Tisch: letzter Stand mit „Verbindung weg“. */
export function fortsetzenAlsMitspieler(app) {
    const stand = letzterStand();
    if (!stand)
        return;
    const client = neuerClient(app, TOTER_KANAL);
    client.uebernimmStand(stand.tisch, stand.sicht);
    client.platz = stand.tisch.ich;
    client.verbunden = false;
    client.wegSeit = Date.now();
    aktiv = { rolle: "mitspieler", rundeId: stand.tisch.rundeId, gastgeber: null, client, einladungen: new Map(), antwort: null, neu: null, fehler: null };
    starteUhr(app);
    // Nicht erst auf die Uhr warten: Mit Internet sofort über den Raum zurück (Spec 030).
    void zurueckUeberRaum(app);
}
/** Spec 012, Stufe 3: Rückkehr per Einladung des Gastgebers. Der alte Stand bleibt sichtbar, bis der neue da ist. */
export async function zurueckkehren(app, text) {
    const t = aktiv;
    if (!t || t.rolle !== "mitspieler")
        return;
    try {
        const { code, kanal } = await beantworteEinladung(codeAusText(text));
        neueVerbindung(app, t, kanal);
        t.antwort = { code, link: code };
        t.fehler = null;
    }
    catch (f) {
        t.fehler = f.message.startsWith("Das ist") ? f.message : "Diese Einladung lässt sich nicht öffnen. Bitte noch einmal scannen.";
    }
    app.zeichne();
}
/** Rückkehr per QR oder Raum: Die neue Verbindung ersetzt die alte, sobald sie sitzt; bis dahin bleibt der alte Stand. */
function neueVerbindung(app, t, kanal) {
    const neu = neuerClient(app, kanal);
    neu.beiAenderung = () => {
        // Zwischen zwei Spielen kommt keine neue Sicht: die alte bleibt stehen.
        if (neu.platz && aktiv === t && t.neu === neu) {
            const alt = t.client;
            neu.uebernimmStand(alt?.tisch ?? null, alt?.sicht ?? null);
            alt?.trennen();
            t.client = neu;
            t.neu = null;
            t.antwort = null;
        }
        app.zeichne();
    };
    t.neu = neu;
}
/**
 * Spec 030, Stufe 2: Getrennt und Internet da: still über den Raum zurück, nur zum eigenen Tisch (Tisch-ID). Mit Token
 * sitzt man sofort wieder; nach einer Übernahme kennt der neue Gastgeber kein Token, dann „Als … weiterspielen“.
 */
async function zurueckUeberRaum(app) {
    const t = aktiv;
    const alt = t?.client;
    const ti = alt?.tisch;
    if (!t || t.rolle !== "mitspieler" || !alt || alt.verbunden || t.neu || t.raumVersuch || !ti?.raum || !navigator.onLine || leseLokal(TEST_OHNE_RAUM))
        return;
    if (Date.now() - letzterRaumVersuch < RUECKKEHR_ABSTAND_MS)
        return;
    letzterRaumVersuch = Date.now();
    t.raumVersuch = true;
    app.zeichne();
    try {
        await ladeVersion();
        mitspielerRaum?.verlasse();
        const v = await vermittlungHolen().betrete(ti.raum);
        mitspielerRaum = v;
        await mitspielerImRaum(v, ti.tischId, RUECKKEHR_ABSTAND_MS, (kanal) => { if (aktiv === t && !t.neu)
            neueVerbindung(app, t, kanal); });
    }
    catch {
        // Kein Internet oder keine Vermittlung: Rückkehr-QR bleibt.
    }
    finally {
        t.raumVersuch = false;
        app.zeichne();
    }
}
/** Darf dieses Gerät den Tisch übernehmen? Nur das Gerät mit der nächsten Platznummer, nach 60 s ohne Gastgeber. */
export function darfUebernehmen() {
    const c = aktiv?.client;
    const ti = c?.tisch;
    if (!c || !ti || aktiv?.rolle !== "mitspieler" || c.verbunden || c.wegSeit === null || !c.platz)
        return false;
    const naechster = ((ti.gastgeberPlatz % 4) + 1);
    return c.platz === naechster && Date.now() - c.wegSeit >= FRAGE_NACH_MS;
}
/** Spec 012: Tisch übernehmen (ungeplant aus dem letzten Stand, geplant mit dem übergebenen Zustand). */
export async function uebernehmen(app, zustandVomGastgeber, tischInfo, geplant) {
    const ich = tischInfo.ich ?? aktiv?.client?.platz;
    if (!ich)
        return;
    const eigenerSpielerId = tischInfo.plaetze[ich - 1]?.spielerId;
    if (!eigenerSpielerId)
        return;
    const eigenesToken = leseLokal(TOKEN(tischInfo.tischId));
    const zustand = zustandVomGastgeber ?? {
        tischId: tischInfo.tischId, eigenerPlatz: ich, sitzungId: tischInfo.sitzungId, spiel: null,
        // Die Tokens der anderen kennt dieses Gerät nicht: Sie kommen zurück, indem sie sich auswählen.
        plaetze: tischInfo.plaetze.map((p) => ({ platz: p.platz, spielerId: p.spielerId, token: p.platz === ich ? eigenesToken : null, ki: p.ki })),
        // Derselbe Raum: Die anderen finden den neuen Gastgeber ohne neuen Scan (Spec 030).
        ...(tischInfo.raum ? { raum: tischInfo.raum } : {}),
    };
    aktiv?.client?.trennen();
    await eroeffne(app, tischInfo.rundeId, tischInfo.profil, eigenerSpielerId, ich, zustand, { vonGeraet: tischInfo.gastgeberGeraet, geplant });
}
/** Tisch auf diesem Gerät beenden (Abend abschließen oder verlassen). */
export async function schliesseTisch(app) {
    if (aktiv?.rolle === "gastgeber") {
        offenerTisch = null;
        await app.speicher.setzeEinstellung(GESPEICHERT, null);
    }
    schreibeLokal(LETZTER_STAND, null);
    aktiv = null;
    if (uhr) {
        clearInterval(uhr);
        uhr = null;
    }
    gastgeberRaum?.verlasse();
    gastgeberRaum = null;
    raumBereit = false;
    letztesRaumOeffnen = 0;
    mitspielerRaum?.verlasse();
    mitspielerRaum = null;
}
/** Bildschirm bleibt an, solange der Tisch offen ist (nur über HTTPS). */
let sperre = null;
export async function wachBleiben() {
    const nav = navigator;
    if (sperre || !nav.wakeLock || document.visibilityState !== "visible")
        return;
    try {
        sperre = await nav.wakeLock.request("screen");
        document.addEventListener("visibilitychange", () => { sperre = null; }, { once: true });
    }
    catch {
        // Ohne Wake Lock geht der Bildschirm eben aus.
    }
}
//# sourceMappingURL=tisch.js.map