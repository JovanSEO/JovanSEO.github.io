// Demo razgovor sa Anom iz browsera (Retell Web SDK).
// Stranica pre ovog fajla postavlja window.CS_DEMO = { agentId, agentVersion, vertikala }.
import { RetellClient } from "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.2/+esm";

// Javni podaci (bezbedni za frontend). Zaštita: dozvoljen samo ovaj domen, reCAPTCHA v3 i Fraud Protection u Retell-u.
const PUBLIC_KEY = "public_key_cd715369f57786900dff9";
const RECAPTCHA_KEY = "6LcTAPItAAAAABtRYdIurPnWBzrIOlFyS_unxXpr";
const DNEVNI_LIMIT = 2;   // zajedno za sve demo razgovore na sajtu, po browseru
const MAX_SEKUNDI = 300;
const { agentId, agentVersion, vertikala } = window.CS_DEMO;

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
function poruka(tekst) { napomena.textContent = tekst; }
function prikaziPreostalo() {
  const n = preostalo();
  poruka(n > 0
    ? "Razgovor ide preko browsera i traje najviše 5 minuta. Danas možete obaviti još " + n + (n === 1 ? " probni razgovor." : " probna razgovora.")
    : "Danas ste iskoristili oba probna razgovora. Pokušajte ponovo sutra.");
}
const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function recaptchaToken() {
  return new Promise((resolve) => {
    if (!window.grecaptcha) return resolve(undefined);
    grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_KEY, { action: "web_call" }).then(resolve, () => resolve(undefined)));
  });
}

function zavrseno() {
  clearInterval(tajmer);
  bar.hidden = true;
  poziv = null;
  zauzeto = false;
  pocetak = 0;
  prikaziPreostalo();
}

async function zapocni() {
  if (zauzeto) return;
  if (preostalo() === 0) { prikaziPreostalo(); document.getElementById("demo").scrollIntoView({ behavior: "smooth" }); return; }
  bar.hidden = false;
  barStatus.textContent = "Povezivanje…";
  barTime.textContent = "00:00 / 05:00";
  zauzeto = true;
  let ziv = false;
  const token = await recaptchaToken();
  poziv = client.createWebCall({
    agent_id: agentId,
    agent_version: agentVersion,
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

document.querySelectorAll("[data-pozovi]").forEach((el) => el.addEventListener("click", zapocni));
document.getElementById("callbar-end").addEventListener("click", () => { if (poziv) poziv.end(); });
window.addEventListener("pagehide", () => { if (poziv) poziv.end(); });
prikaziPreostalo();
