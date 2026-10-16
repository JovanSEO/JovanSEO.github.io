// Demo razgovor sa Anom iz browsera (Retell Web SDK).
// Stranica pre ovog fajla postavlja window.CS_DEMO = { vertikala } — delatnost za dugmad [data-pozovi].
// Plutajuće dugme „Demo poziv" (dole desno) postoji na svim stranicama i nudi izbor delatnosti.
import { RetellClient } from "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.2/+esm";

// Javni podaci (bezbedni za frontend). Zaštita: dozvoljen samo ovaj domen, reCAPTCHA v3 i Fraud Protection u Retell-u.
const PUBLIC_KEY = "public_key_cd715369f57786900dff9";
const RECAPTCHA_KEY = "6LcTAPItAAAAABtRYdIurPnWBzrIOlFyS_unxXpr";
const DNEVNI_LIMIT = 2;   // zajedno za sve demo razgovore na sajtu, po browseru
const MAX_SEKUNDI = 300;

// Svaki novi publish agenta u Retell-u ⇒ povećati agentVersion ovde.
const AGENTI = {
  advokati: {
    agentId: "agent_29fc33afe76037882eb0c1826e", agentVersion: 2,
    naziv: "Advokatska kancelarija", opis: "Novi predmet, hitan slučaj, poruka advokatu",
  },
  bolnice: {
    agentId: "agent_70e1c03b54d30e103e02051677", agentVersion: 0,
    naziv: "Bolnica ili klinika", opis: "Zakazivanje pregleda, nalazi, hitno stanje",
  },
};
const podrazumevana = (window.CS_DEMO || {}).vertikala;

const PHONE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 ' +
  '19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 ' +
  '9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

function element(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return document.body.appendChild(t.content.firstElementChild);
}

// Traka aktivnog poziva (na stranicama delatnosti već postoji u HTML-u).
if (!document.getElementById("callbar")) {
  element('<div class="callbar" id="callbar" hidden><span class="dot" aria-hidden="true"></span>' +
    '<span id="callbar-status">Povezivanje…</span><span class="time" id="callbar-time">00:00 / 05:00</span>' +
    '<button class="btn" type="button" id="callbar-end">Završi</button></div>');
}

const fab = element(
  '<div class="fab" id="demo-fab">' +
    '<div class="fab-panel" id="demo-panel" role="dialog" aria-label="Demo poziv sa Anom" hidden>' +
      '<div class="fab-head"><strong>Demo poziv sa Anom</strong>' +
      '<button type="button" class="fab-x" aria-label="Zatvori">×</button></div>' +
      '<p>Izaberite koga Ana zastupa u razgovoru:</p>' +
      Object.entries(AGENTI).map(([k, a]) =>
        `<button type="button" class="fab-opcija" data-vertikala="${k}"><b>${a.naziv}</b><span>${a.opis}</span></button>`).join("") +
      '<p class="fab-napomena" id="fab-napomena"></p>' +
    '</div>' +
    `<button type="button" class="fab-btn" aria-expanded="false" aria-controls="demo-panel">${PHONE}Demo poziv` +
    '<span class="dot" aria-hidden="true"></span></button>' +
  '</div>');
const panel = fab.querySelector(".fab-panel");
const fabBtn = fab.querySelector(".fab-btn");
const fabNapomena = fab.querySelector("#fab-napomena");

const client = new RetellClient({ key: PUBLIC_KEY });
const bar = document.getElementById("callbar");
const barStatus = document.getElementById("callbar-status");
const barTime = document.getElementById("callbar-time");
const napomena = document.getElementById("napomena");
let poziv = null, tajmer = null, pocetak = 0, zauzeto = false;

const danas = () => new Date().toLocaleDateString("sv");
function procitaj() {
  try {
    const d = JSON.parse(localStorage.getItem("halo_demo") || "{}");
    return d.datum === danas() ? d.broj || 0 : 0;
  } catch (e) { return 0; }
}
function upisi(broj) {
  try { localStorage.setItem("halo_demo", JSON.stringify({ datum: danas(), broj })); } catch (e) {}
}
function preostalo() { return Math.max(0, DNEVNI_LIMIT - procitaj()); }
function poruka(tekst) {
  if (napomena) napomena.textContent = tekst;
  fabNapomena.textContent = tekst;
}
function prikaziPreostalo() {
  const n = preostalo();
  poruka(n > 0
    ? "Razgovor ide preko browsera i traje najviše 5 minuta. Danas možete obaviti još " + n + (n === 1 ? " probni razgovor." : " probna razgovora.")
    : "Danas ste iskoristili oba probna razgovora. Pokušajte ponovo sutra.");
}
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function otvoriPanel(otvori) {
  panel.hidden = !otvori;
  fabBtn.setAttribute("aria-expanded", String(otvori));
  if (otvori) panel.querySelector(".fab-opcija").focus();
}

function recaptchaToken() {
  return new Promise((resolve) => {
    if (!window.grecaptcha) return resolve(undefined);
    grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_KEY, { action: "web_call" }).then(resolve, () => resolve(undefined)));
  });
}

function zavrseno() {
  clearInterval(tajmer);
  bar.hidden = true;
  fab.hidden = false;
  poziv = null;
  zauzeto = false;
  pocetak = 0;
  prikaziPreostalo();
}

async function zapocni(vertikala) {
  const agent = AGENTI[vertikala];
  if (zauzeto || !agent) return;
  if (preostalo() === 0) {
    prikaziPreostalo();
    otvoriPanel(true);
    return;
  }
  otvoriPanel(false);
  fab.hidden = true;
  bar.hidden = false;
  barStatus.textContent = "Povezivanje…";
  barTime.textContent = "00:00 / 05:00";
  zauzeto = true;
  let ziv = false;
  const token = await recaptchaToken();
  poziv = client.createWebCall({
    agent_id: agent.agentId,
    agent_version: agent.agentVersion,
    recaptchaToken: token,
    hooks: {
      onStatus: (status) => {
        if (status === "live" && !ziv) {
          ziv = true;
          upisi(procitaj() + 1);
          if (window.fbq) fbq("trackCustom", "DemoStart", { vertikala });
          pocetak = Date.now();
          barStatus.textContent = "Razgovor u toku";
          tajmer = setInterval(() => {
            const s = Math.min(MAX_SEKUNDI, Math.floor((Date.now() - pocetak) / 1000));
            barTime.textContent = mmss(s) + " / 05:00";
          }, 500);
        }
      },
      onAgentStartTalking: () => { if (ziv) barStatus.textContent = "Ana govori"; },
      onAgentStopTalking: () => { if (ziv) barStatus.textContent = "Slušam vas"; },
      onError: (err) => {
        const t = String(err && err.message || err).toLowerCase();
        zavrseno();
        if (t.includes("permission") || t.includes("notallowed") || t.includes("microphone")) {
          poruka("Dozvolite pristup mikrofonu u browseru i pokušajte ponovo.");
        } else {
          poruka("Razgovor trenutno nije mogao da počne. Pokušajte ponovo za minut.");
        }
      },
      onEnd: () => {
        if (!poziv) return;
        if (pocetak && window.fbq) fbq("trackCustom", "DemoEnd", { vertikala, trajanje_s: Math.round((Date.now() - pocetak) / 1000) });
        zavrseno();
      },
    },
  });
}

// Dugmad na stranici delatnosti pokreću njen demo; [data-izbor-demo] otvara izbor delatnosti.
document.querySelectorAll("[data-pozovi]").forEach((el) => el.addEventListener("click", () => zapocni(podrazumevana)));
document.querySelectorAll("[data-izbor-demo]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); otvoriPanel(true); }));
fabBtn.addEventListener("click", () => otvoriPanel(panel.hidden));
fab.querySelector(".fab-x").addEventListener("click", () => otvoriPanel(false));
fab.querySelectorAll(".fab-opcija").forEach((el) => el.addEventListener("click", () => zapocni(el.dataset.vertikala)));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { otvoriPanel(false); fabBtn.focus(); } });
document.addEventListener("click", (e) => { if (!panel.hidden && !fab.contains(e.target) && !e.target.closest("[data-izbor-demo]")) otvoriPanel(false); });
document.getElementById("callbar-end").addEventListener("click", () => { if (poziv) poziv.end(); });
window.addEventListener("pagehide", () => { if (poziv) poziv.end(); });
prikaziPreostalo();
