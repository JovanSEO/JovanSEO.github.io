// Demo razgovor sa Anom iz browsera (Retell Web SDK).
// Stranica pre ovog fajla postavlja window.CS_DEMO = { vertikala } — delatnost koja je unapred izabrana u prozoru.
// Sva dugmad za demo ([data-pozovi], [data-izbor-demo] i plutajuće dugme dole desno) otvaraju prozor „Demo poziv":
// izbor delatnosti → „Pozovi" → razgovor u toku (krupno, sa tajmerom) → kraj sa pozivom na zakazivanje.
import { RetellClient } from "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.2/+esm";

// Javni podaci (bezbedni za frontend). Zaštita: dozvoljen samo ovaj domen, reCAPTCHA v3 i Fraud Protection u Retell-u.
const PUBLIC_KEY = "public_key_cd715369f57786900dff9";
const RECAPTCHA_KEY = "6LcTAPItAAAAABtRYdIurPnWBzrIOlFyS_unxXpr";
const DNEVNI_LIMIT = 2;   // zajedno za sve demo razgovore na sajtu, po browseru
const MAX_SEKUNDI = 300;  // agent u Retell-u sam prekida posle 5 minuta; browser prekida nekoliko sekundi kasnije za svaki slučaj

// Svaki novi publish agenta u Retell-u ⇒ povećati agentVersion ovde.
const AGENTI = {
  advokati: {
    agentId: "agent_29fc33afe76037882eb0c1826e", agentVersion: 2,
    naziv: "Advokatska kancelarija", opis: "Novi predmet, hitan slučaj, poruka advokatu",
    ustanova: "Advokatska kancelarija Test", klijenti: "klijentima vaše kancelarije",
    primeri: ["Brat mi je upravo uhapšen, treba nam advokat odmah.",
      "Želim razvod, kada mogu da dođem na konsultacije?",
      "Ostavio bih poruku advokatici Jovanović."],
  },
  bolnice: {
    agentId: "agent_70e1c03b54d30e103e02051677", agentVersion: 0,
    naziv: "Bolnica ili klinika", opis: "Zakazivanje pregleda, nalazi, hitno stanje",
    ustanova: "Bolnica Test", klijenti: "pacijentima vaše ustanove",
    primeri: ["Treba mi pregled kod kardiologa, imam polisu osiguranja.",
      "Da li su mi gotovi rezultati krvi?",
      "Ocu je pozlilo, steže ga u grudima."],
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

const fab = element('<div class="fab"><button type="button" class="fab-btn" aria-haspopup="dialog">' +
  PHONE + 'Demo poziv<span class="dot" aria-hidden="true"></span></button></div>');

const dlg = element(
  '<dialog class="cs-demo" aria-label="Demo poziv sa Anom"><div class="cs-telo">' +
    '<button type="button" class="cs-x" data-akcija="zatvori" aria-label="Zatvori">×</button>' +

    '<div class="cs-korak" data-korak="izbor">' +
      '<span class="eyebrow">Demo poziv</span>' +
      '<h2>Razgovarajte sa Anom</h2>' +
      '<p class="cs-uvod">Izaberite koga Ana zastupa, pa kliknite „Pozovi". Razgovor ide preko browsera, potreban je samo mikrofon.</p>' +
      '<div class="cs-opcije" role="radiogroup" aria-label="Delatnost">' +
        Object.entries(AGENTI).map(([k, a]) =>
          `<label class="cs-opcija"><input type="radio" name="cs-vertikala" value="${k}">` +
          `<span><b>${a.naziv}</b><small>${a.opis}</small></span></label>`).join("") +
      '</div>' +
      '<p class="cs-poruka" aria-live="polite"></p>' +
      `<button type="button" class="cs-pozovi" data-akcija="pozovi">${PHONE}<span>Pozovi</span></button>` +
      '<p class="cs-sitno">Najviše 5 minuta po razgovoru. Najbolje sa slušalicama.</p>' +
      '<a class="cs-zakazi-link" href="#" data-zakazi-demo>Radije biste razgovarali sa nama? Zakažite razgovor</a>' +
    '</div>' +

    '<div class="cs-korak" data-korak="poziv" hidden>' +
      '<span class="cs-uzivo"><span class="cs-tacka" aria-hidden="true"></span>Razgovor u toku</span>' +
      '<div class="cs-avatar" aria-hidden="true"><span>A</span></div>' +
      '<h2 class="cs-ko">Ana · <span class="cs-ustanova"></span></h2>' +
      '<p class="cs-status" aria-live="polite">Povezivanje…</p>' +
      '<p class="cs-vreme"><span class="cs-sat">00:00</span> / 05:00</p>' +
      '<div class="cs-traka" aria-hidden="true"><span></span></div>' +
      '<div class="cs-primeri"><p>Probajte da kažete</p><ul></ul></div>' +
      '<div class="cs-dugmad">' +
        '<button type="button" class="btn btn-ghost" data-akcija="smanji">Smanji prozor</button>' +
        `<button type="button" class="cs-zavrsi" data-akcija="zavrsi">${PHONE}Završi razgovor</button>` +
      '</div>' +
    '</div>' +

    '<div class="cs-korak" data-korak="kraj" hidden>' +
      '<span class="eyebrow">Demo poziv</span>' +
      '<h2>Razgovor je završen</h2>' +
      '<p class="cs-uvod cs-rezime"></p>' +
      '<div class="cs-dugmad">' +
        '<a class="btn btn-primary" href="#" data-zakazi-demo>Zakažite razgovor</a>' +
        '<button type="button" class="btn btn-ghost" data-akcija="ponovo">Probajte ponovo</button>' +
      '</div>' +
      '<p class="cs-sitno cs-preostalo"></p>' +
    '</div>' +
  '</div></dialog>');

// Umanjen prikaz dok razgovor traje, a prozor je sklonjen.
const bar = element('<div class="callbar" hidden><span class="dot" aria-hidden="true"></span>' +
  '<span class="cs-bar-status">Razgovor u toku</span><span class="time"><span class="cs-bar-sat">00:00</span><span class="cs-bar-max"> / 05:00</span></span>' +
  '<button class="btn" type="button" data-akcija="prosiri">Prikaži</button>' +
  '<button class="btn btn-zavrsi" type="button" data-akcija="zavrsi">Završi</button></div>');

const $ = (sel) => dlg.querySelector(sel);
const radios = [...dlg.querySelectorAll('input[name="cs-vertikala"]')];
const pozoviBtn = $(".cs-pozovi");
const statusEl = $(".cs-status");
const napomena = document.getElementById("napomena");
const naslovStranice = document.title;
const client = new RetellClient({ key: PUBLIC_KEY });
let izabrana = podrazumevana, poziv = null, tajmer = null, pocetak = 0, zauzeto = false;

dlg.querySelectorAll("[data-zakazi-demo]").forEach((el) => {
  if (window.csPoveziZakazivanje) window.csPoveziZakazivanje(el); else el.remove();
});

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
function tekstPreostalo() {
  const n = preostalo();
  return n > 0
    ? "Danas možete obaviti još " + n + (n === 1 ? " probni razgovor." : " probna razgovora.")
    : "Danas ste iskoristili oba probna razgovora. Pokušajte ponovo sutra.";
}
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function prikaziKorak(korak) {
  dlg.dataset.stanje = korak;
  dlg.querySelectorAll(".cs-korak").forEach((k) => { k.hidden = k.dataset.korak !== korak; });
}

function osveziIzbor(greska) {
  const n = preostalo();
  radios.forEach((r) => { r.checked = r.value === izabrana; });
  pozoviBtn.disabled = !izabrana || n === 0;
  pozoviBtn.querySelector("span").textContent = izabrana ? "Pozovi" : "Izaberite delatnost";
  const poruka = $(".cs-poruka");
  poruka.textContent = greska || tekstPreostalo();
  poruka.classList.toggle("greska", Boolean(greska));
  $('[data-korak="izbor"] .cs-zakazi-link')?.toggleAttribute("hidden", n > 0);
  if (napomena) napomena.textContent = "Razgovor ide preko browsera i traje najviše 5 minuta. " + tekstPreostalo();
}

function pokaziProzor() {
  bar.hidden = true;
  if (!dlg.open) dlg.showModal();
  document.body.classList.add("cs-modal-open");
}

function otvori(vertikala) {
  if (zauzeto) return pokaziProzor();
  if (vertikala) izabrana = vertikala;
  osveziIzbor();
  prikaziKorak("izbor");
  pokaziProzor();
  if (!pozoviBtn.disabled) pozoviBtn.focus();
}

function recaptchaToken() {
  return new Promise((resolve) => {
    if (!window.grecaptcha) return resolve(undefined);
    grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_KEY, { action: "web_call" }).then(resolve, () => resolve(undefined)));
  });
}

function status(tekst, kratko, govori) {
  statusEl.textContent = tekst;
  bar.querySelector(".cs-bar-status").textContent = kratko || tekst;
  dlg.dataset.govori = govori;
}

function zavrseno() {
  clearInterval(tajmer);
  bar.hidden = true;
  fab.hidden = false;
  poziv = null;
  zauzeto = false;
  document.title = naslovStranice;
  dlg.dataset.govori = "";
}

function prikaziKraj(agent, sekundi) {
  $(".cs-rezime").textContent = "Trajanje: " + mmss(sekundi) + ". Ovako bi Ana razgovarala sa " + agent.klijenti +
    ". Zakažite kratak razgovor i podesićemo je za vas.";
  $('[data-akcija="ponovo"]').hidden = preostalo() === 0;
  $(".cs-preostalo").textContent = tekstPreostalo();
  osveziIzbor();
  prikaziKorak("kraj");
  pokaziProzor();
}

function prikaziGresku(tekst) {
  osveziIzbor(tekst);
  prikaziKorak("izbor");
  pokaziProzor();
}

async function zapocni() {
  const vertikala = izabrana, agent = AGENTI[vertikala];
  if (zauzeto || !agent) return;
  if (preostalo() === 0) return osveziIzbor();
  zauzeto = true;
  fab.hidden = true;
  pocetak = 0;
  let ziv = false;
  $(".cs-ustanova").textContent = agent.ustanova;
  $(".cs-primeri ul").innerHTML = agent.primeri.map((p) => `<li>„${p}"</li>`).join("");
  $(".cs-sat").textContent = "00:00";
  $(".cs-traka span").style.width = "0";
  bar.querySelector(".cs-bar-sat").textContent = "00:00";
  status("Povezivanje… Ako browser pita, dozvolite mikrofon.", "Povezivanje…", "veza");
  prikaziKorak("poziv");
  $('[data-akcija="zavrsi"]').focus();
  document.title = "● Razgovor u toku · Callsistent";

  const token = await recaptchaToken();
  if (!zauzeto) return; // posetilac je odustao dok se čekala reCAPTCHA
  const ovaj = client.createWebCall({
    agent_id: agent.agentId,
    agent_version: agent.agentVersion,
    recaptchaToken: token,
    hooks: {
      onStatus: (s) => {
        if (s !== "live" || ziv) return;
        ziv = true;
        upisi(procitaj() + 1);
        if (window.fbq) fbq("trackCustom", "DemoStart", { vertikala });
        pocetak = Date.now();
        status("Veza je uspostavljena. Ana se javlja…", "Razgovor u toku", "ana");
        tajmer = setInterval(() => {
          const s = Math.floor((Date.now() - pocetak) / 1000);
          const prikaz = mmss(Math.min(MAX_SEKUNDI, s));
          $(".cs-sat").textContent = prikaz;
          $(".cs-traka span").style.width = Math.min(100, (s / MAX_SEKUNDI) * 100) + "%";
          bar.querySelector(".cs-bar-sat").textContent = prikaz;
          if (s > MAX_SEKUNDI + 10 && poziv) poziv.end();
        }, 500);
      },
      onAgentStartTalking: () => { if (ziv) status("Ana govori…", "Ana govori", "ana"); },
      onAgentStopTalking: () => { if (ziv) status("Vaš red, govorite.", "Slušam vas", "vi"); },
      onError: (err) => {
        const t = String(err && err.message || err).toLowerCase();
        zavrseno();
        prikaziGresku(t.includes("permission") || t.includes("notallowed") || t.includes("microphone")
          ? "Dozvolite pristup mikrofonu u browseru i pokušajte ponovo."
          : "Razgovor trenutno nije mogao da počne. Pokušajte ponovo za minut.");
      },
      onEnd: () => {
        if (poziv !== ovaj) return;
        const sekundi = pocetak ? Math.round((Date.now() - pocetak) / 1000) : 0;
        if (pocetak && window.fbq) fbq("trackCustom", "DemoEnd", { vertikala, trajanje_s: sekundi });
        zavrseno();
        if (pocetak) prikaziKraj(agent, sekundi);
        else prikaziGresku("Razgovor je prekinut pre nego što je počeo. Pokušajte ponovo.");
      },
    },
  });
  poziv = ovaj;
}

function zavrsi() {
  if (poziv) return poziv.end();
  if (zauzeto) { zavrseno(); osveziIzbor(); prikaziKorak("izbor"); }
}

// Dugmad na stranici delatnosti otvaraju prozor sa tom delatnošću; [data-izbor-demo] otvara izbor.
document.querySelectorAll("[data-pozovi]").forEach((el) => el.addEventListener("click", () => otvori(podrazumevana)));
document.querySelectorAll("[data-izbor-demo]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); otvori(); }));
fab.querySelector(".fab-btn").addEventListener("click", () => otvori(izabrana || podrazumevana));
radios.forEach((r) => r.addEventListener("change", () => { izabrana = r.value; osveziIzbor(); }));

const akcije = {
  zatvori: () => dlg.close(),
  smanji: () => dlg.close(),
  pozovi: zapocni,
  zavrsi,
  ponovo: () => otvori(),
  prosiri: pokaziProzor,
};
[dlg, bar].forEach((el) => el.addEventListener("click", (e) => {
  const dugme = e.target.closest("[data-akcija]");
  if (dugme) akcije[dugme.dataset.akcija]();
  else if (e.target === dlg) dlg.close(); // klik pored prozora
}));
// Zatvaranje prozora (×, Escape, klik pored) tokom razgovora ne prekida razgovor, samo ga umanjuje u traku.
dlg.addEventListener("close", () => {
  document.body.classList.remove("cs-modal-open");
  if (zauzeto) bar.hidden = false;
});
window.addEventListener("pagehide", () => { if (poziv) poziv.end(); });
osveziIzbor();
