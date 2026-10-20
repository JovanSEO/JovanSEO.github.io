// Forma „Besplatan demo" (/besplatan-demo/): šalje ime, mejl i link sajta ili Google Maps profila Edge Function-u
// `zahtev-demo` (supabase/functions/zahtev-demo), koja ih upisuje u bazu i u Google tabelu „Zahtevi".
// Posle uspeha: Pixel `Lead` (samo uz pristanak na kolačiće, vidi saglasnost.js) i poruka „Hvala".
// Anonimni brojač koraka (tabela `koraci`) je isti kao u demo.js: koliko ljudi stigne do forme i gde odustane.
(function () {
  "use strict";
  var SUPABASE_URL = "https://kzhaekgmrsvkxhucgbrg.supabase.co";
  var SUPABASE_KLJUC = "sb_publishable_b84j8JfP3xNzCPeUnsAJzA_YFeDTHuN";
  var FUNKCIJA = SUPABASE_URL + "/functions/v1/zahtev-demo";

  var forma = document.getElementById("zahtev");
  var hvala = document.getElementById("hvala");
  if (!forma) return;
  var poruka = forma.querySelector(".cs-poruka");
  var dugme = forma.querySelector('button[type="submit"]');

  // UTM i stranica dolaska, da se u zahtevu vidi sa kog oglasa je posetilac stigao.
  var IZVOR = (function () {
    var p = new URLSearchParams(location.search), izvor = { stranica: location.pathname };
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (k) { if (p.get(k)) izvor[k] = p.get(k); });
    try {
      if (izvor.utm_source) sessionStorage.setItem("cs_izvor", JSON.stringify(izvor));
      return JSON.parse(sessionStorage.getItem("cs_izvor")) || izvor;
    } catch (e) { return izvor; }
  })();

  var UA = navigator.userAgent;
  var ANDROID = /Android/i.test(UA), IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var U_APLIKACIJI = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Viber|Line\/|MicroMessenger|; wv\)/i.test(UA);
  var POSETA = (window.crypto && crypto.randomUUID && crypto.randomUUID()) || Date.now() + "-" + String(Math.random()).slice(2, 12);
  var UREDJAJ = IOS ? "iphone" : ANDROID ? "android" : "racunar";
  var APLIKACIJA = /Instagram/i.test(UA) ? "instagram" : /Barcelona/i.test(UA) ? "threads" : /Messenger/i.test(UA) ? "messenger"
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(UA) ? "facebook" : U_APLIKACIJI ? "druga" : null;
  var OGLAS = /[?&](fbclid|utm_source)=/.test(location.search) || Boolean(IZVOR.utm_source);

  function zabelezi(dogadjaj, detalj) {
    try {
      fetch(SUPABASE_URL + "/rest/v1/koraci", {
        method: "POST",
        headers: { apikey: SUPABASE_KLJUC, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ poseta: POSETA, dogadjaj: dogadjaj, detalj: detalj == null || detalj === "" ? null : String(detalj).slice(0, 80),
          stranica: location.pathname.slice(0, 60), uredjaj: UREDJAJ, aplikacija: APLIKACIJA, oglas: OGLAS }),
      }).catch(function () {});
    } catch (e) {}
  }

  zabelezi("poseta", document.referrer ? (function () { try { return new URL(document.referrer).hostname; } catch (e) { return ""; } })() : "");
  var sekundi = 0;
  var tajmer = setInterval(function () {
    if (document.visibilityState !== "visible") return;
    sekundi++;
    if ([10, 30, 60, 120].indexOf(sekundi) >= 0) zabelezi("na-stranici", sekundi);
    if (sekundi >= 120) clearInterval(tajmer);
  }, 1000);
  var skrolDo = 0;
  addEventListener("scroll", function () {
    var visina = document.documentElement.scrollHeight - innerHeight;
    var posto = visina > 0 ? (scrollY / visina) * 100 : 100;
    [25, 50, 75, 100].forEach(function (prag) { if (posto >= prag - 1 && skrolDo < prag) { skrolDo = prag; zabelezi("skrol", prag); } });
  }, { passive: true });
  var poceo = false;
  forma.addEventListener("focusin", function () { if (!poceo) { poceo = true; zabelezi("forma-pocetak"); } });

  var PORUKE = {
    ime: "Upišite ime i prezime.",
    email: "Proverite mejl adresu.",
    url: "Upišite link sajta (na primer mojsajt.rs) ili link sa Google Maps-a.",
    saglasnost: "Potrebna je vaša saglasnost da bismo napravili demo.",
    popunjeno: "Danas smo primili mnogo zahteva. Pokušajte sutra ili nam pišite na info@callsistent.com.",
    mreza: "Slanje nije uspelo. Proverite internet i pokušajte ponovo.",
  };

  function greska(kljuc, polje) {
    poruka.textContent = PORUKE[kljuc] || PORUKE.mreza;
    poruka.classList.add("greska");
    if (polje) polje.focus();
    zabelezi("forma-greska", kljuc);
  }

  function linkOk(v) {
    var u = v.trim();
    if (!u) return false;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { var x = new URL(u); return x.hostname.indexOf(".") > 0; } catch (e) { return false; }
  }

  forma.addEventListener("submit", function (e) {
    e.preventDefault();
    poruka.textContent = ""; poruka.classList.remove("greska");
    var ime = forma.ime.value.trim(), email = forma.email.value.trim(), url = forma.url.value.trim();
    if (ime.length < 2) return greska("ime", forma.ime);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return greska("email", forma.email);
    if (!linkOk(url)) return greska("url", forma.url);
    if (!forma.saglasnost.checked) return greska("saglasnost", forma.saglasnost);

    dugme.disabled = true;
    var tekstDugmeta = dugme.textContent;
    dugme.textContent = "Šaljem…";
    fetch(FUNKCIJA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ime: ime, email: email, url: url, vrsta: forma.vrsta.value, saglasnost: true,
        izvor: IZVOR, firma: forma.firma.value }),
    }).then(function (odg) {
      return odg.json().catch(function () { return {}; }).then(function (telo) { return { status: odg.status, telo: telo }; });
    }).then(function (r) {
      if (r.status === 200 && r.telo.ok) {
        zabelezi("forma-poslata", forma.vrsta.value || "bez-vrste");
        if (window.fbq) fbq("track", "Lead", { content_name: "zahtev_demo", vrsta: forma.vrsta.value || "" });
        hvala.querySelector(".hvala-ime").textContent = ", " + ime.split(" ")[0];
        hvala.querySelector(".hvala-mejl").textContent = email;
        forma.hidden = true;
        hvala.hidden = false;
        hvala.focus();
        hvala.scrollIntoView({ block: "center" });
        return;
      }
      var k = r.telo.greska;
      zabelezi("forma-server", r.status + (k ? ":" + k : ""));
      greska(k === "popunjeno" ? "popunjeno" : PORUKE[k] ? k : "mreza", k && forma[k] && forma[k].focus ? forma[k] : null);
    }).catch(function () {
      greska("mreza");
    }).then(function () {
      dugme.disabled = false;
      dugme.textContent = tekstDugmeta;
    });
  });
})();
