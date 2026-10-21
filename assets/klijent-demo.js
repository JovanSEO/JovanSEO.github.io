// Privatna stranica klijenta (npr. /rado-health/): šifra → „Pozovi Anu" → razgovor u toku → kraj.
// Stranica postavlja data-klijent na .kartica. Šifru proverava Edge Function `klijent-poziv`, koja posle tačne šifre
// vrati i tekst stranice (naziv klijenta, primeri) i jedina pravi poziv tajnim Retell ključem.
// Bez prijave mejlom, brojača koraka i Meta Pixel-a. Mikrofon i prelaz iz aplikacija u browser rade kao u demo.js.
import { RetellClient } from "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.2/+esm";

const FUNKCIJA = "https://kzhaekgmrsvkxhucgbrg.supabase.co/functions/v1/klijent-poziv";

const kartica = document.querySelector(".kartica");
const KLIJENT = kartica.dataset.klijent;
const $ = (sel) => kartica.querySelector(sel);
const forma = $('[data-korak="sifra"]');
const pozoviBtn = $('[data-akcija="pozovi"]');
const statusEl = $(".cs-status");
const naslovStranice = document.title;
const client = new RetellClient({ key: "server", fetch: retellFetch });
let sifra = "", stranica = null, poziv = null, tajmer = null, pocetak = 0, zauzeto = false, mikrofonOk = false;
let anaGovori = false, zadnjiGlas = 0;

const MEMORIJA = "cs_sifra_" + KLIJENT;
const zapamti = (v) => { try { v ? sessionStorage.setItem(MEMORIJA, v) : sessionStorage.removeItem(MEMORIJA); } catch (e) {} };
const zapamcena = () => { try { return sessionStorage.getItem(MEMORIJA) || ""; } catch (e) { return ""; } };

async function pitajServer(provera) {
  try {
    const r = await fetch(FUNKCIJA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ klijent: KLIJENT, sifra, provera }),
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { return { status: 0 }; }
}

async function retellFetch(url, init) {
  if (!String(url).endsWith("/create-web-call")) {
    // Retell zove stop-call samo ako je poziv otkazan pre povezivanja; bez ključa ga preskačemo (Retell ga sam gasi).
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return fetch(FUNKCIJA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ klijent: KLIJENT, sifra }),
  });
}

const PORUKE = {
  popunjeno: "Današnji razgovori su potrošeni. Pokušajte ponovo sutra ili se javite Callsistentu.",
  greska: "Razgovor trenutno nije mogao da počne. Pokušajte ponovo za minut.",
};
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function prikaziKorak(korak) {
  kartica.dataset.stanje = korak;
  kartica.querySelectorAll(".cs-korak").forEach((k) => { k.hidden = k.dataset.korak !== korak; });
}

function poruka(korak, tekst, greska) {
  const p = $(`[data-korak="${korak}"] .cs-poruka`);
  p.textContent = tekst || "";
  p.classList.toggle("greska", Boolean(greska));
}

function popuniStranicu() {
  kartica.querySelectorAll(".cs-naziv").forEach((el) => { el.textContent = stranica.naziv; });
  kartica.querySelectorAll(".cs-max").forEach((el) => { el.textContent = mmss(stranica.max_sekundi); });
  kartica.querySelectorAll(".cs-minuta").forEach((el) => { el.textContent = Math.round(stranica.max_sekundi / 60); });
  kartica.querySelectorAll(".cs-primeri ul").forEach((ul) => {
    ul.innerHTML = "";
    stranica.primeri.forEach((t) => { const li = document.createElement("li"); li.textContent = `„${t}"`; ul.appendChild(li); });
  });
  document.title = "Ana · " + stranica.naziv;
}

function prikaziIzbor(greska) {
  poruka("izbor", greska, Boolean(greska));
  prikaziKorak("izbor");
}

// Šifra: proverava je server; tačna ostaje zapamćena dok je kartica otvorena (sessionStorage), da osvežavanje ne traži ponovo.
async function otkljucaj(e, tiho) {
  e?.preventDefault();
  if (!tiho) sifra = forma.sifra.value.trim();
  if (!sifra) { poruka("sifra", "Upišite šifru.", true); return forma.sifra.focus(); }
  const dugme = forma.querySelector('[type="submit"]');
  dugme.disabled = true;
  if (!tiho) poruka("sifra", "Proveravamo…");
  const odg = await pitajServer(true);
  dugme.disabled = false;
  if (odg.status === 200 && odg.stranica) {
    stranica = odg.stranica;
    zapamti(sifra);
    popuniStranicu();
    prikaziIzbor(odg.preostalo === 0 ? PORUKE.popunjeno : "");
    return pozoviBtn.focus();
  }
  zapamti("");
  sifra = "";
  prikaziKorak("sifra");
  if (!tiho) poruka("sifra", odg.status === 403 ? "Šifra nije tačna." : PORUKE.greska, true);
  forma.sifra.select();
}

function status(tekst, govori) {
  statusEl.textContent = tekst;
  kartica.dataset.govori = govori;
}

function oznaciGovor(ana) {
  if (ana === anaGovori) return;
  anaGovori = ana;
  status(ana ? "Ana govori…" : "Vaš red, govorite.", ana ? "ana" : "vi");
}

function zavrseno() {
  clearInterval(tajmer);
  anaGovori = false;
  poziv = null;
  zauzeto = false;
  document.title = "Ana · " + stranica.naziv;
  kartica.dataset.govori = "";
}

// Mikrofon tražimo odmah na „Pozovi", da browser pokaže svoj prozorčić „Dozvoli".
const UA = navigator.userAgent;
const ANDROID = /Android/i.test(UA), IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const U_APLIKACIJI = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Viber|Line\/|MicroMessenger|; wv\)/i.test(UA);

async function traziMikrofon() {
  if (!navigator.mediaDevices?.getUserMedia) return "nema";
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((t) => t.stop());
    mikrofonOk = true;
    return "ok";
  } catch (e) {
    if (e && (e.name === "NotFoundError" || e.name === "OverconstrainedError")) return "nema-uredjaja";
    let stanje = "";
    try { stanje = (await navigator.permissions.query({ name: "microphone" })).state; } catch (x) {}
    return stanje === "denied" ? "blokirano" : "odbijeno";
  }
}

// Link koji iz aplikacije (Viber, Instagram, Facebook…) otvara stranicu u pravom browseru.
function linkZaBrowser() {
  const link = location.origin + location.pathname;
  if (ANDROID) return "intent://" + location.host + location.pathname +
    "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(link) + ";end";
  if (!IOS) return "";
  if (/Instagram/i.test(UA)) return "instagram://extbrowser/?url=" + encodeURIComponent(link);
  if (/Barcelona/i.test(UA)) return "barcelona://extbrowser/?url=" + encodeURIComponent(link);
  return "x-safari-" + link;
}

function pomocZaMikrofon(razlog) {
  const otvori = $(".cs-mik-otvori"), kopiraj = $(".cs-mik-kopiraj");
  otvori.hidden = kopiraj.hidden = true;
  kopiraj.querySelector("span").textContent = "Kopiraj link";
  let uvod, koraci = [];
  if (razlog === "nema-uredjaja") {
    uvod = "Na ovom uređaju nije pronađen mikrofon. Probajte sa telefona ili priključite slušalice sa mikrofonom.";
  } else if (U_APLIKACIJI || razlog === "nema") {
    const browser = ANDROID ? "Chrome" : IOS ? "Safari" : "Chrome, Safari, Edge ili Firefox";
    kopiraj.hidden = false;
    const prelaz = linkZaBrowser();
    otvori.hidden = !prelaz;
    if (prelaz) otvori.href = prelaz;
    otvori.querySelector("span").textContent = ANDROID ? "Otvori u Chrome-u" : "Otvori u Safariju";
    uvod = `Ova aplikacija ne pušta mikrofon unutar sebe. Otvorite stranicu u browseru (${browser}):`;
    koraci = [prelaz ? `Dodirnite „${otvori.textContent}" ili „Kopiraj link" i nalepite ga u browser.`
      : "Dodirnite „Kopiraj link\" i nalepite ga u browser.", "Upišite šifru, kliknite „Pozovi Anu\" i dozvolite mikrofon."];
  } else if (razlog === "blokirano") {
    uvod = "Mikrofon je ranije blokiran za ovaj sajt. Uključite ga ovako:";
    koraci = IOS
      ? ["Dodirnite „aA\" levo od adrese sajta.", "Izaberite „Podešavanja veb-sajta\" → „Mikrofon\" → „Dozvoli\".", "Vratite se ovde i dodirnite „Pokušaj ponovo\"."]
      : ["Kliknite ikonicu levo od adrese sajta (katanac ili podešavanja).", "Kod „Mikrofon\" izaberite „Dozvoli\".", "Kliknite „Pokušaj ponovo\"."];
  } else {
    uvod = "Browser nije dobio dozvolu za mikrofon. Dodirnite „Pokušaj ponovo\" i u prozorčiću izaberite „Dozvoli\".";
  }
  $(".cs-mik-uvod").textContent = uvod;
  $(".cs-koraci").innerHTML = "";
  koraci.forEach((k) => { const li = document.createElement("li"); li.textContent = k; $(".cs-koraci").appendChild(li); });
  $(".cs-mik-ponovo").hidden = razlog === "nema-uredjaja" || razlog === "nema" || U_APLIKACIJI;
  prikaziKorak("mikrofon");
}

function kopirajLink() {
  const link = location.origin + location.pathname;
  const gotovo = () => { $(".cs-mik-kopiraj span").textContent = "Link je kopiran ✓"; };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(link).then(gotovo, () => { $(".cs-mik-kopiraj span").textContent = link; });
  $(".cs-mik-kopiraj span").textContent = link;
}

async function pozovi() {
  if (zauzeto || !stranica) return;
  if (!mikrofonOk) {
    const razlog = await traziMikrofon();
    if (razlog !== "ok") return pomocZaMikrofon(razlog);
  }
  zauzeto = true;
  pocetak = 0;
  let ziv = false;
  const max = stranica.max_sekundi;
  $(".cs-sat").textContent = "00:00";
  $(".cs-traka span").style.width = "0";
  status("Povezivanje…", "veza");
  prikaziKorak("poziv");
  $('[data-akcija="zavrsi"]').focus();
  document.title = "● Razgovor u toku · " + stranica.naziv;

  const ovaj = client.createWebCall({
    agent_id: KLIJENT,
    audio: { emitRawAudioSamples: true },
    hooks: {
      onStatus: (s) => {
        if (s !== "live" || ziv) return;
        ziv = true;
        pocetak = Date.now();
        status("Veza je uspostavljena. Ana se javlja…", "ana");
        tajmer = setInterval(() => {
          const sek = Math.floor((Date.now() - pocetak) / 1000);
          $(".cs-sat").textContent = mmss(Math.min(max, sek));
          $(".cs-traka span").style.width = Math.min(100, (sek / max) * 100) + "%";
          if (sek > max + 10 && poziv) poziv.end();
          if (anaGovori && Date.now() - zadnjiGlas > 800) oznaciGovor(false);
        }, 250);
      },
      onAgentStartTalking: () => { if (ziv) { zadnjiGlas = Date.now(); oznaciGovor(true); } },
      onAgentStopTalking: () => { if (ziv) oznaciGovor(false); },
      onAudio: (uzorci) => {
        if (!ziv) return;
        let zbir = 0;
        for (let i = 0; i < uzorci.length; i += 4) zbir += uzorci[i] * uzorci[i];
        if (Math.sqrt(zbir / (uzorci.length / 4)) > 0.01) { zadnjiGlas = Date.now(); oznaciGovor(true); }
      },
      onError: (err) => {
        const t = String(err && err.message || err).toLowerCase();
        zavrseno();
        if (err && err.status === 403) { zapamti(""); sifra = ""; prikaziKorak("sifra"); return poruka("sifra", "Upišite šifru ponovo.", true); }
        if (!(err && err.status) && (t.includes("permission") || t.includes("notallowed") || t.includes("microphone"))) {
          mikrofonOk = false;
          return traziMikrofon().then((r) => (r === "ok" ? prikaziIzbor(PORUKE.greska) : pomocZaMikrofon(r)));
        }
        prikaziIzbor(err && err.status === 503 ? PORUKE.popunjeno : PORUKE.greska);
      },
      onEnd: () => {
        if (poziv !== ovaj) return;
        const sekundi = pocetak ? Math.round((Date.now() - pocetak) / 1000) : 0;
        zavrseno();
        if (!pocetak) return prikaziIzbor("Razgovor je prekinut pre nego što je počeo. Pokušajte ponovo.");
        // Rezime razgovora šalje Edge Function demo-rezime, na mejl klijenta (za razgovore od 15 s naviše).
        $(".cs-rezime").textContent = "Trajanje: " + mmss(sekundi) + "." +
          (sekundi >= 15 ? " Za par minuta na mejl stiže rezime: ono što je Ana zabeležila iz razgovora." : "");
        prikaziKorak("kraj");
      },
    },
  });
  poziv = ovaj;
}

function zavrsi() {
  if (poziv) return poziv.end();
  if (zauzeto) { zavrseno(); prikaziIzbor(); }
}

const akcije = {
  pozovi,
  zavrsi,
  ponovo: () => prikaziIzbor(),
  nazad: () => prikaziIzbor(),
  "mikrofon-ponovo": () => { prikaziKorak("izbor"); pozovi(); },
  "kopiraj-link": kopirajLink,
};
kartica.addEventListener("click", (e) => {
  const dugme = e.target.closest("[data-akcija]");
  if (dugme && akcije[dugme.dataset.akcija]) akcije[dugme.dataset.akcija]();
});
forma.addEventListener("submit", otkljucaj);
forma.addEventListener("input", () => poruka("sifra", ""));
window.addEventListener("pagehide", () => { if (poziv) poziv.end(); });

// Link iz mejla može da nosi šifru posle # (npr. /demo-klimaservis/#šifra): upiše se sama i skloni iz adrese.
if (location.hash.length > 1) {
  const izLinka = decodeURIComponent(location.hash.slice(1)).trim();
  history.replaceState(null, "", location.pathname + location.search);
  if (izLinka) zapamti(izLinka);
}
sifra = zapamcena();
if (sifra) otkljucaj(null, true); else forma.sifra.focus();
