// Demo razgovor sa Anom iz browsera (Retell Web SDK).
// Stranica pre ovog fajla postavlja window.CS_DEMO = { vertikala } — delatnost koja je unapred izabrana u prozoru.
// Sva dugmad za demo ([data-pozovi], [data-izbor-demo] i plutajuće dugme dole desno) otvaraju prozor „Demo poziv":
// izbor delatnosti → „Pozovi" → prijava (ime + mejl) → šestocifreni kod iz mejla → razgovor u toku → kraj sa pozivom na zakazivanje.
// Prijava ide preko Supabase Auth-a; poziv pravi naša Edge Function `demo-poziv` (supabase/functions/demo-poziv),
// koja proverava prijavu i dnevni limit i jedina zna tajni Retell ključ. Agenti i njihove verzije su tamo.
import { RetellClient } from "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.2/+esm";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm";

// Javni podaci (bezbedni za frontend): adresa projekta i publishable ključ. Tabele su zatvorene za posetioce.
const SUPABASE_URL = "https://kzhaekgmrsvkxhucgbrg.supabase.co";
const SUPABASE_KLJUC = "sb_publishable_b84j8JfP3xNzCPeUnsAJzA_YFeDTHuN";
const FUNKCIJA = SUPABASE_URL + "/functions/v1/demo-poziv";
const MAX_SEKUNDI = 180;  // agent u Retell-u sam prekida posle 3 minuta; browser prekida nekoliko sekundi kasnije za svaki slučaj

const AGENTI = {
  advokati: {
    naziv: "Advokatska kancelarija", opis: "Novi predmet, hitan slučaj, poruka advokatu",
    ustanova: "Advokatska kancelarija Test", klijenti: "klijentima vaše kancelarije",
    primeri: ["Brat mi je upravo uhapšen, treba nam advokat odmah.",
      "Želim razvod, kada mogu da dođem na konsultacije?",
      "Ostavio bih poruku advokatici Jovanović."],
  },
  bolnice: {
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
      '<p class="cs-uvod">Izaberite koga Ana zastupa, pa kliknite „Pozovi". Razgovor ide preko browsera; kada browser pita za mikrofon, dodirnite „Dozvoli".</p>' +
      '<div class="cs-opcije" role="radiogroup" aria-label="Delatnost">' +
        Object.entries(AGENTI).map(([k, a]) =>
          `<label class="cs-opcija"><input type="radio" name="cs-vertikala" value="${k}">` +
          `<span><b>${a.naziv}</b><small>${a.opis}</small></span></label>`).join("") +
      '</div>' +
      '<p class="cs-poruka" aria-live="polite"></p>' +
      `<button type="button" class="cs-pozovi" data-akcija="pozovi">${PHONE}<span>Pozovi</span></button>` +
      '<p class="cs-sitno">Najviše 3 minuta po razgovoru. Najbolje sa slušalicama. Korišćenjem demo asistenta prihvatate ' +
        '<a href="/privatnost/" target="_blank">Politiku privatnosti</a>.</p>' +
      '<p class="cs-sitno cs-nalog" hidden></p>' +
      '<a class="cs-zakazi-link" href="#" data-zakazi-demo>Radije biste razgovarali sa nama? Zakažite razgovor</a>' +
    '</div>' +

    '<form class="cs-korak cs-forma" data-korak="prijava" hidden novalidate>' +
      '<span class="eyebrow">Demo poziv</span>' +
      '<h2>Još jedan korak</h2>' +
      '<p class="cs-uvod">Upišite ime i mejl. Poslaćemo vam kod za potvrdu i razgovor kreće odmah posle toga.</p>' +
      '<label class="cs-polje"><span>Ime i prezime</span>' +
        '<input name="ime" type="text" autocomplete="name" maxlength="120" required></label>' +
      '<label class="cs-polje"><span>Mejl</span>' +
        '<input name="email" type="email" autocomplete="email" inputmode="email" maxlength="200" required></label>' +
      '<label class="cs-kvacica"><input name="ponude" type="checkbox">' +
        '<span>Pošaljite mi ponudu i novosti o Callsistentu. Možete se odjaviti kad god želite.</span></label>' +
      '<p class="cs-poruka" aria-live="polite"></p>' +
      '<button type="submit" class="cs-pozovi"><span>Pošalji kod</span></button>' +
      '<p class="cs-sitno">Klikom na „Pošalji kod" i korišćenjem demo asistenta prihvatate <a href="/privatnost/" target="_blank">Politiku privatnosti</a> ' +
        'i saglasni ste da podatke iz prijave i razgovora koristimo u svrhe navedene u njoj. U razgovoru ne navodite stvarne poverljive podatke.</p>' +
      '<button type="button" class="cs-veza" data-akcija="nazad">Nazad</button>' +
    '</form>' +

    '<form class="cs-korak cs-forma" data-korak="kod" hidden novalidate>' +
      '<span class="eyebrow">Demo poziv</span>' +
      '<h2>Proverite mejl</h2>' +
      '<p class="cs-uvod">Poslali smo šestocifreni kod na <b class="cs-adresa"></b>. Upišite ga ovde.</p>' +
      '<label class="cs-polje"><span>Kod iz mejla</span>' +
        '<input name="kod" class="cs-kod" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
        'pattern="[0-9]*" maxlength="6" required></label>' +
      '<p class="cs-poruka" aria-live="polite"></p>' +
      `<button type="submit" class="cs-pozovi">${PHONE}<span>Potvrdi i pozovi</span></button>` +
      '<p class="cs-sitno">Nije stigao? Pogledajte i neželjenu poštu (spam). ' +
        '<button type="button" class="cs-veza" data-akcija="posalji-ponovo">Pošalji ponovo</button> · ' +
        '<button type="button" class="cs-veza" data-akcija="promeni-mejl">Promeni mejl</button></p>' +
    '</form>' +

    '<div class="cs-korak" data-korak="mikrofon" hidden>' +
      '<span class="eyebrow">Demo poziv</span>' +
      '<h2>Potreban je mikrofon</h2>' +
      '<p class="cs-uvod cs-mik-uvod"></p>' +
      '<ol class="cs-koraci"></ol>' +
      '<a class="cs-pozovi cs-mik-otvori" data-akcija="otvori-browser" href="#" hidden><span>Otvori u Safariju</span></a>' +
      `<button type="button" class="cs-pozovi cs-mik-ponovo" data-akcija="mikrofon-ponovo">${PHONE}<span>Pokušaj ponovo</span></button>` +
      '<button type="button" class="cs-veza cs-mik-kopiraj" data-akcija="kopiraj-link" hidden><span>Kopiraj link</span></button>' +
      '<button type="button" class="cs-veza" data-akcija="nazad">Nazad</button>' +
    '</div>' +

    '<div class="cs-korak" data-korak="poziv" hidden>' +
      '<span class="cs-uzivo"><span class="cs-tacka" aria-hidden="true"></span>Razgovor u toku</span>' +
      '<div class="cs-avatar" aria-hidden="true"><span>A</span></div>' +
      '<h2 class="cs-ko">Ana · <span class="cs-ustanova"></span></h2>' +
      '<p class="cs-status" aria-live="polite">Povezivanje…</p>' +
      '<p class="cs-vreme"><span class="cs-sat">00:00</span> / 03:00</p>' +
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
  '<span class="cs-bar-status">Razgovor u toku</span><span class="time"><span class="cs-bar-sat">00:00</span><span class="cs-bar-max"> / 03:00</span></span>' +
  '<button class="btn" type="button" data-akcija="prosiri">Prikaži</button>' +
  '<button class="btn btn-zavrsi" type="button" data-akcija="zavrsi">Završi</button></div>');

const $ = (sel) => dlg.querySelector(sel);
const radios = [...dlg.querySelectorAll('input[name="cs-vertikala"]')];
const pozoviBtn = $(".cs-pozovi");
const statusEl = $(".cs-status");
const formaPrijava = $('[data-korak="prijava"]');
const formaKod = $('[data-korak="kod"]');
const napomena = document.getElementById("napomena");
const naslovStranice = document.title;
const sb = createClient(SUPABASE_URL, SUPABASE_KLJUC);
// Retell SDK traži poziv od naše funkcije umesto od Retell-a: `agent_id` ovde nosi delatnost, a funkcija bira agenta.
const client = new RetellClient({ key: "server", fetch: retellFetch });
let izabrana = podrazumevana, poziv = null, tajmer = null, pocetak = 0, zauzeto = false;
let korisnik = null;   // prijavljen posetilac (Supabase Auth), ili null
let preostalo = null;  // koliko razgovora danas još može (javlja server), null = još ne znamo
let emailZaKod = "", poslatoU = 0;
// Ko govori: meri se jačina Aninog zvuka u browseru (Retell signali za početak/kraj govora ne stižu uvek).
let anaGovori = false, zadnjiGlas = 0;

dlg.querySelectorAll("[data-zakazi-demo]").forEach((el) => {
  if (window.csPoveziZakazivanje) window.csPoveziZakazivanje(el); else el.remove();
});

// UTM i stranica dolaska, da se u prijavi vidi sa kog oglasa je posetilac stigao.
const IZVOR = (() => {
  const p = new URLSearchParams(location.search), izvor = { stranica: location.pathname };
  ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => { if (p.get(k)) izvor[k] = p.get(k); });
  try {
    if (izvor.utm_source) sessionStorage.setItem("cs_izvor", JSON.stringify(izvor));
    return JSON.parse(sessionStorage.getItem("cs_izvor")) || izvor;
  } catch (e) { return izvor; }
})();

async function retellFetch(url, init) {
  if (!String(url).endsWith("/create-web-call")) {
    // Retell zove stop-call samo ako je poziv otkazan pre povezivanja; bez ključa ga preskačemo (Retell ga sam gasi).
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const { data: { session } } = await sb.auth.getSession();
  const telo = JSON.parse(init.body || "{}");
  return fetch(FUNKCIJA, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KLJUC, Authorization: "Bearer " + (session?.access_token || "") },
    body: JSON.stringify({ vertikala: telo.agent_id }),
  });
}

async function pitajServer(vertikala, proveraSamo) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { status: 401 };
  try {
    const r = await fetch(FUNKCIJA, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KLJUC, Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ vertikala, provera: proveraSamo }),
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { return { status: 0 }; }
}

const PORUKE = {
  limit: "Danas ste već obavili probni razgovor. Pokušajte ponovo sutra ili zakažite razgovor sa nama.",
  popunjeno: "Demo je za danas popunjen. Pokušajte sutra ili zakažite razgovor sa nama.",
  greska: "Razgovor trenutno nije mogao da počne. Pokušajte ponovo za minut.",
};
function porukaZaStatus(st) {
  if (st === 429) { preostalo = 0; return PORUKE.limit; }
  if (st === 503) return PORUKE.popunjeno;
  return PORUKE.greska;
}

function tekstPreostalo() {
  if (!korisnik) return "Za razgovor je potrebna kratka prijava mejlom. Jedan probni razgovor dnevno.";
  if (preostalo === 0) return PORUKE.limit;
  if (preostalo > 1) return "Danas možete obaviti još " + preostalo + " probna razgovora.";
  return "Danas možete obaviti jedan probni razgovor.";
}
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function prikaziKorak(korak) {
  if (korak !== "izbor" && korak !== dlg.dataset.stanje) zabelezi("ekran", korak);
  dlg.dataset.stanje = korak;
  dlg.querySelectorAll(".cs-korak").forEach((k) => { k.hidden = k.dataset.korak !== korak; });
}

function osveziIzbor(greska) {
  radios.forEach((r) => { r.checked = r.value === izabrana; });
  pozoviBtn.disabled = !izabrana || preostalo === 0;
  pozoviBtn.querySelector("span").textContent = izabrana ? "Pozovi" : "Izaberite delatnost";
  const poruka = $('[data-korak="izbor"] .cs-poruka');
  poruka.textContent = greska || tekstPreostalo();
  poruka.classList.toggle("greska", Boolean(greska));
  $('[data-korak="izbor"] .cs-zakazi-link')?.toggleAttribute("hidden", preostalo !== 0);
  const nalog = $(".cs-nalog");
  nalog.hidden = !korisnik;
  if (korisnik) nalog.innerHTML = "Prijavljeni ste kao <b></b>. " +
    '<button type="button" class="cs-veza" data-akcija="odjava">Odjava</button>';
  if (korisnik) nalog.querySelector("b").textContent = korisnik.email;
  if (napomena) napomena.textContent = "Razgovor ide preko browsera i traje najviše 3 minuta. " + tekstPreostalo();
}

function porukaForme(forma, tekst, greska) {
  const p = forma.querySelector(".cs-poruka");
  p.textContent = tekst || "";
  p.classList.toggle("greska", Boolean(greska));
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

function status(tekst, kratko, govori) {
  statusEl.textContent = tekst;
  bar.querySelector(".cs-bar-status").textContent = kratko || tekst;
  dlg.dataset.govori = govori;
}

function oznaciGovor(ana) {
  if (ana === anaGovori) return;
  anaGovori = ana;
  if (ana) status("Ana govori…", "Ana govori", "ana");
  else status("Vaš red, govorite.", "Slušam vas", "vi");
}

function zavrseno() {
  clearInterval(tajmer);
  anaGovori = false;
  bar.hidden = true;
  fab.hidden = false;
  document.body.classList.remove("cs-poziv");
  poziv = null;
  zauzeto = false;
  document.title = naslovStranice;
  dlg.dataset.govori = "";
}

function prikaziKraj(agent, sekundi) {
  $(".cs-rezime").textContent = "Trajanje: " + mmss(sekundi) + ". Ovako bi Ana razgovarala sa " + agent.klijenti +
    ". Zakažite kratak razgovor i podesićemo je za vas.";
  $('[data-akcija="ponovo"]').hidden = preostalo === 0;
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

// Mikrofon tražimo odmah na „Pozovi" (pre prijave), da browser pokaže svoj prozorčić „Dozvoli"
// i da posetilac ne gubi vreme na prijavu ako mikrofon ne može da radi u tom browseru.
const UA = navigator.userAgent;
const ANDROID = /Android/i.test(UA), IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const U_APLIKACIJI = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Viber|Line\/|MicroMessenger|; wv\)/i.test(UA);
let mikrofonOk = false, greskaMikrofona = "";

// Anonimni brojač koraka (tabela `koraci`): koliko posetilaca stigne do kog ekrana i gde odustane.
// Bez imena, mejla i kolačića; `POSETA` je nasumičan broj ovog učitavanja stranice. Šalje se u pozadini,
// a ako ne uspe, demo radi dalje kao da brojača nema.
const POSETA = crypto.randomUUID?.() || Date.now() + "-" + String(Math.random()).slice(2, 12);
const UREDJAJ = IOS ? "iphone" : ANDROID ? "android" : "racunar";
const APLIKACIJA = /Instagram/i.test(UA) ? "instagram" : /Barcelona/i.test(UA) ? "threads" : /Messenger/i.test(UA) ? "messenger"
  : /FBAN|FBAV|FB_IAB|FBIOS/i.test(UA) ? "facebook" : U_APLIKACIJI ? "druga" : null;
const OGLAS = /[?&](fbclid|utm_source)=/.test(location.search) || Boolean(IZVOR.utm_source);

function zabelezi(dogadjaj, detalj) {
  try {
    fetch(SUPABASE_URL + "/rest/v1/koraci", {
      method: "POST",
      headers: { apikey: SUPABASE_KLJUC, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ poseta: POSETA, dogadjaj, detalj: detalj == null || detalj === "" ? null : String(detalj).slice(0, 80),
        stranica: location.pathname.slice(0, 60), uredjaj: UREDJAJ, aplikacija: APLIKACIJA, oglas: OGLAS }),
    }).catch(() => {});
  } catch (e) {}
}

async function traziMikrofon() {
  greskaMikrofona = "";
  if (!navigator.mediaDevices?.getUserMedia) return "nema";
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((t) => t.stop());
    mikrofonOk = true;
    return "ok";
  } catch (e) {
    greskaMikrofona = (e && e.name) || "";
    if (e && (e.name === "NotFoundError" || e.name === "OverconstrainedError")) return "nema-uredjaja";
    let stanje = "";
    try { stanje = (await navigator.permissions.query({ name: "microphone" })).state; } catch (x) {}
    return stanje === "denied" ? "blokirano" : "odbijeno";
  }
}

// Link koji iz aplikacije otvara sajt u pravom browseru, na dodir posetioca.
// Instagram i Threads na iPhone-u imaju svoj prelaz (pitaju „Otvoriti izvan aplikacije?"), jer x-safari-https blokiraju;
// Facebook, Messenger, Viber… na iPhone-u puštaju x-safari-https. Android otvara Chrome preko intent://.
function linkZaBrowser() {
  const link = location.origin + location.pathname + location.search;
  if (ANDROID) return "intent://" + location.host + location.pathname + location.search +
    "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(link) + ";end";
  if (!IOS) return "";
  if (/Instagram/i.test(UA)) return "instagram://extbrowser/?url=" + encodeURIComponent(link);
  if (/Barcelona/i.test(UA)) return "barcelona://extbrowser/?url=" + encodeURIComponent(link);
  return "x-safari-" + link;
}

function upisiUputstvo(uvod, koraci) {
  $(".cs-mik-uvod").textContent = uvod;
  $(".cs-koraci").innerHTML = "";
  koraci.forEach((k) => { const li = document.createElement("li"); li.textContent = k; $(".cs-koraci").appendChild(li); });
}

// Da li je browser otvoren, odavde se ne vidi. Zato posle par sekundi dodajemo ručni put,
// za slučaj da je aplikacija blokirala prelaz (ko je prešao u browser, ovo ni ne vidi).
function otvoriUBrowseru() {
  zabelezi("otvori-browser");
  setTimeout(() => {
    const browser = IOS ? "Safari" : "Chrome";
    upisiUputstvo(`Ako se ${browser} nije otvorio, uradite to ručno:`, [
      IOS ? "Dodirnite ⋯ gore desno i izaberite „Otvori u spoljnom pregledaču\" (ili „Otvori u Safariju\")."
        : "Dodirnite ⋮ gore desno i izaberite „Otvori u Chrome-u\" (ili „Otvori u pregledaču\").",
      `Ili dodirnite „Kopiraj link\" i nalepite ga u ${IOS ? "Safari" : "Chrome"}.`,
      `U ${IOS ? "Safariju" : "Chrome-u"} kliknite „Pozovi\" i dozvolite mikrofon.`]);
  }, 2500);
}

function pomocZaMikrofon(razlog, ponovo) {
  const otvori = $(".cs-mik-otvori"), kopiraj = $(".cs-mik-kopiraj");
  otvori.hidden = kopiraj.hidden = true;
  kopiraj.querySelector("span").textContent = "Kopiraj link";
  let uvod, koraci;
  if (razlog === "nema-uredjaja") {
    uvod = "Na ovom uređaju nije pronađen mikrofon. Probajte sa telefona ili priključite slušalice sa mikrofonom.";
    koraci = [];
  } else if (U_APLIKACIJI || razlog === "nema") {
    kopiraj.hidden = false;
    const prelaz = linkZaBrowser();
    otvori.hidden = !prelaz;
    if (prelaz) otvori.href = prelaz;
    otvori.querySelector("span").textContent = ANDROID ? "Otvori u Chrome-u" : "Otvori u Safariju";
    if (IOS) {
      uvod = "Ova aplikacija ne pušta mikrofon unutar sebe. Otvorite sajt u Safariju:";
      koraci = ["Dodirnite „Otvori u Safariju\" i potvrdite.", "U Safariju kliknite „Pozovi\" i dozvolite mikrofon."];
    } else if (ANDROID) {
      uvod = "Ova aplikacija ne pušta mikrofon unutar sebe. Otvorite sajt u Chrome-u:";
      koraci = ["Dodirnite „Otvori u Chrome-u\".", "U Chrome-u kliknite „Pozovi\" i dozvolite mikrofon."];
    } else {
      uvod = "Ovaj browser ne pušta mikrofon. Otvorite sajt u Chrome-u, Safariju, Edge-u ili Firefox-u:";
      koraci = ["Dodirnite „Kopiraj link\" i nalepite ga u drugi browser.", "Kliknite „Pozovi\" i dozvolite mikrofon."];
    }
  } else if (razlog === "blokirano") {
    uvod = "Mikrofon je ranije blokiran za ovaj sajt. Uključite ga ovako:";
    koraci = IOS
      ? ["Dodirnite „aA\" levo od adrese sajta.", "Izaberite „Podešavanja veb-sajta\" → „Mikrofon\" → „Dozvoli\".", "Vratite se ovde i dodirnite „Pokušaj ponovo\"."]
      : ANDROID
      ? ["Dodirnite ikonicu levo od adrese sajta (⚙ ili katanac). Ako adrese nema (sajt otvoren iz Vibera i sl.), dodirnite ⋮ gore desno → „Otvori u Chrome-u\".", "Izaberite „Dozvole\" → „Mikrofon\" → „Dozvoli\".", "Vratite se ovde i dodirnite „Pokušaj ponovo\"."]
      : ["Kliknite ikonicu levo od adrese sajta (katanac ili podešavanja).", "Kod „Mikrofon\" izaberite „Dozvoli\".", "Kliknite „Pokušaj ponovo\"."];
  } else {
    uvod = "Browser nije dobio dozvolu za mikrofon. Dodirnite „Pokušaj ponovo\" i u prozorčiću izaberite „Dozvoli\".";
    koraci = ANDROID
      ? ["Ako se prozorčić ne pojavi: Podešavanja telefona → Aplikacije → Chrome → Dozvole → Mikrofon → Dozvoli."]
      : IOS
      ? ["Ako se prozorčić ne pojavi: Podešavanja → Safari → Mikrofon → Pitaj ili Dozvoli."]
      : ["Ako se prozorčić ne pojavi, proverite da li je mikrofon uključen u podešavanjima računara."];
  }
  // Bez ovoga „Pokušaj ponovo" izgleda kao da ne radi: aplikacija odbije mikrofon bez pitanja i isti ekran se vrati.
  if (ponovo && razlog !== "nema-uredjaja") uvod = "Ni ovog puta nije uspelo. " + uvod;
  upisiUputstvo(uvod, koraci);
  // U aplikaciji ponovni pokušaj ne pomaže (aplikacija odbije mikrofon bez pitanja), pa ostaje prelaz u browser.
  $(".cs-mik-ponovo").hidden = razlog === "nema-uredjaja" || razlog === "nema" || U_APLIKACIJI;
  prikaziKorak("mikrofon");
}

function kopirajLink() {
  zabelezi("kopiraj-link");
  const link = location.origin + location.pathname;
  const gotovo = () => { $(".cs-mik-kopiraj span").textContent = "Link je kopiran ✓"; };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(link).then(gotovo, () => rucnoKopiraj(link, gotovo));
  rucnoKopiraj(link, gotovo);
}
function rucnoKopiraj(link, gotovo) {
  const polje = document.createElement("textarea");
  polje.value = link;
  polje.setAttribute("readonly", "");
  polje.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  dlg.appendChild(polje);
  polje.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  polje.remove();
  if (ok) gotovo(); else $(".cs-mik-kopiraj span").textContent = link;
}

// „Pozovi": prvo mikrofon, pa prijava (ako treba), pa provera limita i razgovor.
async function pozovi(ponovo = false) {
  if (zauzeto || !AGENTI[izabrana]) return;
  if (!mikrofonOk) {
    const razlog = await traziMikrofon();
    zabelezi("mikrofon", razlog === "ok" || !greskaMikrofona ? razlog : razlog + ":" + greskaMikrofona);
    if (razlog !== "ok") return pomocZaMikrofon(razlog, ponovo);
  }
  if (!korisnik) {
    porukaForme(formaPrijava, "");
    prikaziKorak("prijava");
    formaPrijava.querySelector(formaPrijava.ime.value ? '[name="email"]' : '[name="ime"]').focus();
    return;
  }
  pozoviBtn.disabled = true;
  pozoviBtn.querySelector("span").textContent = "Povezivanje…";
  const odg = await pitajServer(izabrana, true);
  if (odg.status === 401) { korisnik = null; osveziIzbor(); return pozovi(); }
  if (odg.status !== 200) { zabelezi("server", odg.status); return prikaziGresku(porukaZaStatus(odg.status)); }
  preostalo = odg.preostalo;
  zapocni();
}

async function posaljiKod(e) {
  e?.preventDefault();
  const ime = formaPrijava.ime.value.trim(), email = formaPrijava.email.value.trim().toLowerCase();
  if (ime.length < 2) {
    zabelezi("forma-greska", "ime"); porukaForme(formaPrijava, "Upišite ime i prezime.", true); return formaPrijava.ime.focus();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    zabelezi("forma-greska", "email"); porukaForme(formaPrijava, "Proverite mejl adresu.", true); return formaPrijava.email.focus();
  }
  const dugme = formaPrijava.querySelector('[type="submit"]');
  dugme.disabled = true;
  porukaForme(formaPrijava, "Šaljemo kod…");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { ime, saglasnost_ponude: formaPrijava.ponude.checked, vertikala: izabrana, izvor: IZVOR },
    },
  });
  dugme.disabled = false;
  zabelezi(error ? "kod-greska" : "kod-poslat", error?.status);
  if (error) {
    const t = String(error.message || "").toLowerCase();
    porukaForme(formaPrijava, error.status === 429 || t.includes("seconds") || t.includes("rate")
      ? "Kod je upravo poslat. Sačekajte minut pa pokušajte ponovo."
      : t.includes("email") ? "Proverite mejl adresu." : "Slanje koda trenutno ne radi. Pokušajte ponovo za minut.", true);
    return;
  }
  emailZaKod = email;
  poslatoU = Date.now();
  $(".cs-adresa").textContent = email;
  formaKod.kod.value = "";
  porukaForme(formaKod, "");
  prikaziKorak("kod");
  formaKod.kod.focus();
}

async function potvrdiKod(e) {
  e?.preventDefault();
  const dugme = formaKod.querySelector('[type="submit"]');
  // iPhone posle automatskog upisa koda pošalje i formu; drugi pokušaj istim (već iskorišćenim) kodom bi javio grešku.
  if (dugme.disabled || korisnik) return;
  const kod = formaKod.kod.value.replace(/\D/g, "");
  if (kod.length !== 6) { porukaForme(formaKod, "Kod ima 6 cifara.", true); return formaKod.kod.focus(); }
  dugme.disabled = true;
  porukaForme(formaKod, "Proveravamo kod…");
  const { data, error } = await sb.auth.verifyOtp({ email: emailZaKod, token: kod, type: "email" });
  dugme.disabled = false;
  zabelezi(error || !data?.user ? "kod-pogresan" : "kod-potvrdjen");
  if (error || !data?.user) {
    porukaForme(formaKod, "Kod nije ispravan ili je istekao. Proverite ga ili pošaljite novi.", true);
    return formaKod.kod.focus();
  }
  korisnik = data.user;
  preostalo = null;
  if (window.fbq) fbq("track", "Lead", { content_name: "demo_prijava", vertikala: izabrana });
  osveziIzbor();
  pozovi();
}

function posaljiPonovo() {
  const sek = Math.ceil((60000 - (Date.now() - poslatoU)) / 1000);
  if (sek > 0) return porukaForme(formaKod, "Novi kod možete tražiti za " + sek + " s.", true);
  formaPrijava.email.value = emailZaKod;
  posaljiKod().then(() => porukaForme(formaKod, "Poslali smo novi kod."));
}

async function odjava() {
  await sb.auth.signOut();
  korisnik = null;
  preostalo = null;
  osveziIzbor();
}

async function zapocni() {
  const vertikala = izabrana, agent = AGENTI[vertikala];
  if (zauzeto || !agent) return;
  zauzeto = true;
  fab.hidden = true;
  document.body.classList.add("cs-poziv");
  pocetak = 0;
  let ziv = false;
  $(".cs-ustanova").textContent = agent.ustanova;
  $(".cs-primeri ul").innerHTML = agent.primeri.map((p) => `<li>„${p}"</li>`).join("");
  $(".cs-sat").textContent = "00:00";
  $(".cs-traka span").style.width = "0";
  bar.querySelector(".cs-bar-sat").textContent = "00:00";
  status("Povezivanje…", "Povezivanje…", "veza");
  prikaziKorak("poziv");
  $('[data-akcija="zavrsi"]').focus();
  document.title = "● Razgovor u toku · Callsistent";

  const ovaj = client.createWebCall({
    agent_id: vertikala,
    audio: { emitRawAudioSamples: true },
    hooks: {
      onStatus: (s) => {
        if (s !== "live" || ziv) return;
        ziv = true;
        if (preostalo !== null) preostalo = Math.max(0, preostalo - 1);
        if (window.fbq) fbq("trackCustom", "DemoStart", { vertikala });
        zabelezi("poziv-povezan", vertikala);
        pocetak = Date.now();
        status("Veza je uspostavljena. Ana se javlja…", "Razgovor u toku", "ana");
        tajmer = setInterval(() => {
          const s = Math.floor((Date.now() - pocetak) / 1000);
          const prikaz = mmss(Math.min(MAX_SEKUNDI, s));
          $(".cs-sat").textContent = prikaz;
          $(".cs-traka span").style.width = Math.min(100, (s / MAX_SEKUNDI) * 100) + "%";
          bar.querySelector(".cs-bar-sat").textContent = prikaz;
          if (s > MAX_SEKUNDI + 10 && poziv) poziv.end();
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
        zabelezi("poziv-greska", (err && err.status) || t.slice(0, 60));
        zavrseno();
        if (err && err.status === 401) { korisnik = null; return prikaziGresku('Prijava je istekla. Kliknite „Pozovi" i prijavite se ponovo.'); }
        if (!(err && err.status) && (t.includes("permission") || t.includes("notallowed") || t.includes("microphone"))) {
          mikrofonOk = false;
          pokaziProzor();
          return traziMikrofon().then((r) => (r === "ok" ? prikaziGresku(PORUKE.greska) : pomocZaMikrofon(r)));
        }
        prikaziGresku(err && err.status ? porukaZaStatus(err.status) : PORUKE.greska);
      },
      onEnd: () => {
        if (poziv !== ovaj) return;
        const sekundi = pocetak ? Math.round((Date.now() - pocetak) / 1000) : 0;
        zabelezi("poziv-kraj", pocetak ? sekundi : "pre-pocetka");
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
// Otvaranje sa stranice (ne „Nazad" i „Ponovo" unutar prozora) se broji kao „otvoren".
const otvoriSaStranice = (vertikala, odakle) => { zabelezi("otvoren", odakle); otvori(vertikala); };
document.querySelectorAll("[data-pozovi]").forEach((el) => el.addEventListener("click", () => otvoriSaStranice(podrazumevana, "dugme")));
document.querySelectorAll("[data-izbor-demo]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); otvoriSaStranice(undefined, "izbor"); }));
fab.querySelector(".fab-btn").addEventListener("click", () => otvoriSaStranice(izabrana || podrazumevana, "plutajuce"));
radios.forEach((r) => r.addEventListener("change", () => { izabrana = r.value; osveziIzbor(); }));
formaPrijava.addEventListener("submit", posaljiKod);
formaPrijava.addEventListener("input", () => porukaForme(formaPrijava, ""));
formaKod.addEventListener("submit", potvrdiKod);
// Kad se upiše šesta cifra, kod se šalje sam.
formaKod.kod.addEventListener("input", () => {
  formaKod.kod.value = formaKod.kod.value.replace(/\D/g, "").slice(0, 6);
  if (formaKod.kod.value.length === 6) potvrdiKod();
});

const akcije = {
  zatvori: () => dlg.close(),
  smanji: () => dlg.close(),
  pozovi: () => { zabelezi("pozovi", izabrana); pozovi(); },
  zavrsi,
  ponovo: () => otvori(),
  prosiri: pokaziProzor,
  nazad: () => otvori(),
  "posalji-ponovo": posaljiPonovo,
  "promeni-mejl": () => { prikaziKorak("prijava"); formaPrijava.email.focus(); },
  "mikrofon-ponovo": () => { zabelezi("mikrofon-ponovo"); prikaziKorak("izbor"); pozovi(true); },
  "kopiraj-link": kopirajLink,
  "otvori-browser": otvoriUBrowseru,
  odjava,
};
[dlg, bar].forEach((el) => el.addEventListener("click", (e) => {
  const dugme = e.target.closest("[data-akcija]");
  if (dugme) akcije[dugme.dataset.akcija]();
  else if (e.target === dlg) dlg.close(); // klik pored prozora
}));
// Zatvaranje prozora (×, Escape, klik pored) tokom razgovora ne prekida razgovor, samo ga umanjuje u traku.
dlg.addEventListener("close", () => {
  zabelezi("zatvoren", zauzeto ? "poziv-u-toku" : dlg.dataset.stanje);
  document.body.classList.remove("cs-modal-open");
  if (zauzeto) bar.hidden = false;
});
window.addEventListener("pagehide", () => { if (poziv) poziv.end(); });

sb.auth.getSession().then(({ data: { session } }) => {
  korisnik = session?.user || null;
  osveziIzbor();
});
osveziIzbor();
zabelezi("poseta", document.referrer ? (() => { try { return new URL(document.referrer).hostname; } catch (e) { return ""; } })() : "");

// Koliko dugo posetilac ostane (broji se samo dok je stranica vidljiva) i dokle skroluje:
// da se vidi da li odlazi odmah (oglas privlači pogrešne ljude) ili posle čitanja (stranica ne ubedi).
let sekundiNaStranici = 0;
const tajmerStranice = setInterval(() => {
  if (document.visibilityState !== "visible") return;
  sekundiNaStranici++;
  if ([10, 30, 60, 120].includes(sekundiNaStranici)) zabelezi("na-stranici", sekundiNaStranici);
  if (sekundiNaStranici >= 120) clearInterval(tajmerStranice);
}, 1000);
let skrolDo = 0;
addEventListener("scroll", () => {
  const visina = document.documentElement.scrollHeight - innerHeight;
  const posto = visina > 0 ? (scrollY / visina) * 100 : 100;
  for (const prag of [25, 50, 75, 100]) if (posto >= prag - 1 && skrolDo < prag) { skrolDo = prag; zabelezi("skrol", prag); }
}, { passive: true });
// Ostali klikovi koji vode ka nama: „Zakažite razgovor" (stranica, plutajuće dugme, prozor) i „Isprobajte" u meniju.
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-zakazi], [data-zakazi-demo], .zakazi-fab")) zabelezi("zakazi", dlg.open ? dlg.dataset.stanje : "stranica");
  else if (e.target.closest('a[href="#demo"]')) zabelezi("isprobajte");
}, true);
