/* Muzyczne gry: ekran wyboru + Czwórki, Detektyw, Kod.
   Korzysta z danych i odtwarzacza z index.html (ALL_PL, ALL_RAP, MODES, getPreview, audio…). */

"use strict";

/* ===================== Wspólne ===================== */

const ALL_POLISH = [...ALL_PL, ...ALL_RAP];
const RAP_SET = new Set(ALL_RAP);
const nrm = t => norm(t);
const artistsOf = s => splitArtists(s).map(nrm);
const primaryOf = s => artistsOf(s)[0] || nrm(s.artist);

// Duety, które dla gracza „brzmią” jak ich członkowie – nie mieszamy ich z grupami tych wykonawców.
const ALIASES = { "taconafide": ["taco hemingway", "quebonafide"] };
const involves = (s, a) => artistsOf(s).some(x => x === a || (ALIASES[x] || []).includes(a));

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function seedFrom(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffled(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
}

async function shareText(text) {
  track("udostepnij", { gra: currentScreen || "?" });
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("✔ Skopiowano – wklej znajomym"); }
  catch (e) { toast("Nie udało się skopiować"); }
}

/* ---- Odtwarzacz fragmentów dla nowych gier (ten sam co w „Starsza czy młodsza?”) ---- */

const Clip = { song: null, btn: null };
function setClipBtn(btn, state) {
  if (!btn) return;
  btn.dataset.state = state;
  btn.textContent = state === "playing" ? "❚❚" : state === "loading" ? "…" : state === "none" ? "✕" : "▶︎";
  btn.title = state === "none" ? "Brak fragmentu w Apple Music" : state === "retry" ? "Apple chwilowo ogranicza zapytania – spróbuj za chwilę" : "Posłuchaj fragmentu";
}
function stopClip() {
  if (!Clip.song) return;
  audio.pause();
  setClipBtn(Clip.btn, "idle");
  Clip.song = Clip.btn = null;
}
async function playClip(song, btn) {
  if (Clip.song === song && !audio.paused) { stopClip(); return; }
  stopClip();
  stopAudio();
  Clip.song = song; Clip.btn = btn;
  setClipBtn(btn, "loading");
  const url = await getPreview(song);
  if (Clip.song !== song) return;
  if (!url || url === RETRY) { setClipBtn(btn, url === RETRY ? "retry" : "none"); Clip.song = Clip.btn = null; return; }
  audio.src = url;
  audio.currentTime = 0;
  try { await audio.play(); if (Clip.song === song) setClipBtn(btn, "playing"); }
  catch (e) { setClipBtn(btn, "idle"); Clip.song = Clip.btn = null; }
}
audio.addEventListener("ended", () => { if (Clip.song) { setClipBtn(Clip.btn, "idle"); Clip.song = Clip.btn = null; } });

function amLink(song, label) {
  const a = el("a", "am-link", label || "Apple Music ↗");
  a.href = appleLink(song); a.target = "_blank"; a.rel = "noopener";
  a.onclick = e => { e.stopPropagation(); a.href = appleLink(song); };
  return a;
}

function clipButton(song) {
  const b = el("button", "clip");
  setClipBtn(b, "idle");
  b.onclick = e => { e.stopPropagation(); playClip(song, b); };
  return b;
}

/* ===================== Ekran wyboru gry i nawigacja ===================== */

const SCREENS = { czworki: "scrCzworki", detektyw: "scrDetektyw", kod: "scrKod" };
let currentScreen = null;

function hideAllScreens() {
  stopClip();
  for (const id of Object.values(SCREENS)) if ($(id)) $(id).hidden = true;
  if ($("scrHome")) $("scrHome").hidden = true;
  currentScreen = null;
}
function showHub() {
  if (typeof DetNet !== "undefined" && DetNet.client) DetNet.leave(false);
  hideAllScreens();
  stopTimer(); stopAudio();
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!$("scrHome")) { openStarsza(); return; }
  document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
  renderHome();
  $("scrHome").hidden = false;
  $("scrHome").scrollTop = 0;
}

/* ---- Strona główna: liczby, rekordy i dzisiejsze wyzwania ---- */
function renderHome() {
  const artists = new Set(ALL_POLISH.map(primaryOf)).size;
  const years = ALL_POLISH.map(s => s.year);
  $("homeStats").innerHTML =
    `<div><b>${ALL_POLISH.length}</b><span>piosenek</span></div>` +
    `<div><b>${artists}</b><span>wykonawców</span></div>` +
    `<div><b>${Math.min(...years)}–${Math.max(...years)}</b><span>lata wydania</span></div>` +
    `<div><b>4</b><span>gry</span></div>`;
  // rekordy z tej przeglądarki
  let best = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^scm-best-/.test(k)) best = Math.max(best, +localStorage.getItem(k) || 0); } } catch (e) {}
  $("gcStarsza").textContent = best ? `🏅 Twój rekord: ${best}` : "";
  const cz = store.get("scm-cz-stats", null);
  $("gcCzworki").textContent = cz && cz.played ? `🔥 Seria dni: ${cz.streak} · wygrane ${cz.won}/${cz.played}` : "";
  const det = store.get("scm-det-solo", null);
  $("gcDetektyw").textContent = det && det.best ? `🏅 Rekord: ${det.best} ${pytan(det.best)}` : "";
  const kodLast = store.get("scm-kod-last", null);
  $("gcKod").textContent = kodLast && kodLast.won ? `🏅 Ostatnio: złamany w ${kodLast.tries}/${KOD_TRIES}` : "";
  // dzisiejsze wyzwania
  const today = todayKey();
  if (cz && cz.last === today) $("dailyCz").textContent = cz.lastWon === today ? "✔ Rozwiązana dzisiaj – wróć jutro po nową" : "Dzisiaj się nie udało – jutro nowa plansza";
  else { const d = store.get("scm-cz-day", null); $("dailyCz").textContent = d && d.date === today && d.guesses.length ? "⏳ W trakcie – dokończ planszę" : "Czeka na Ciebie – ta sama dla wszystkich graczy"; }
  if (kodLast && kodLast.date === today) $("dailyKod").textContent = kodLast.won ? `✔ Złamany dzisiaj w ${kodLast.tries}/${KOD_TRIES}` : "Dzisiaj się nie udało – jutro nowy kod";
  else { const d = store.get("scm-kod-day", null); $("dailyKod").textContent = d && d.date === today && d.rows.length ? "⏳ W trakcie – dokończ kod" : "Czeka na Ciebie – ten sam dla wszystkich graczy"; }
}
if ($("scrHome")) {     // (gdyby przeglądarka podała starszą wersję strony, strony głównej po prostu nie ma)
  $("homeFriendsJump").onclick = () => $("homeFriends").scrollIntoView({ behavior: "smooth" });
  $("homeLiveStarsza").onclick = () => { track("gra", { gra: "starsza", z: "strona glowna - pojedynek" }); openStarsza(); $("friendsBtn").click(); };
  $("homeLiveDet").onclick = () => { track("gra", { gra: "detektyw", z: "strona glowna - we dwoje" }); openScreen("detektyw"); Detektyw.setMode("online"); };
}
function openScreen(key, ...args) {
  hideAllScreens();
  stopTimer(); stopAudio();
  document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
  $(SCREENS[key]).hidden = false;
  currentScreen = key;
  if (!(key === "detektyw" && DetNet.client)) history.replaceState(null, "", "#" + key);
  GAMES[key].open(...args);
}
function openStarsza() {
  hideAllScreens();
  if (location.hash && !/^#(w-|pokoj-|diagnostyka)/.test(location.hash)) history.replaceState(null, "", location.pathname);
  showChallenge();
  document.querySelectorAll(".overlay").forEach(o => o.classList.toggle("show", o.id === "startOverlay"));
}

document.querySelectorAll("[data-game]").forEach(b => b.onclick = () => {
  const g = b.dataset.game;
  track("gra", { gra: g });
  if (g === "starsza") openStarsza(); else openScreen(g);
});
document.querySelectorAll(".back-hub").forEach(b => b.onclick = showHub);
document.querySelectorAll(".mini-mute").forEach(b => b.onclick = () => { $("muteBtn").click(); syncMiniMute(); });
function syncMiniMute() { document.querySelectorAll(".mini-mute").forEach(b => b.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊"); }
$("muteBtn").addEventListener("click", syncMiniMute);

/* ===================== Gra 1: Muzyczne czwórki ===================== */

const COLOR_RE = /\b(biał|czerw|zielon|niebiesk|czarn|złot|złoc|różow|bury|szar|żółt|srebr)/i;
const NAME_TITLES = ["Małgośka", "Baśka", "Nie płacz Ewka", "Peggy Brown", "Jenny", "Józek, nie daruję ci tej nocy", "Charlie, Charlie", "Michael Essien Birthday Party", "RiRi", "Janosik (feat. Golec uOrkiestra)", "Zizu", "Arahja", "Malibu Barbie", "Gaja"];
const PLACE_TITLES = ["Warszawa", "Berlin Zachodni", "Londyn 8:15", "Lloret de Mar", "CASABLANCA", "Mississippi w ogniu", "Sen o Warszawie", "Polska", "Polsko", "Nie pytaj o Polskę", "kyoto", "Madagaskar", "Fiji", "Złote Tarasy", "Boskie Buenos", "Cykady na Cykladach", "Krakowski spleen", "Puerto Bounce (feat. Vladimir Cauchemar)"];
const nameSet = new Set(NAME_TITLES), placeSet = new Set(PLACE_TITLES);
const ENGLISH_TITLES = new Set(["Love Song", "Cool Me Down", "Horses", "Superhero", "River", "The Tower", "hot coffee", "Candy", "Rockstar", "Drive", "Taxi",
  "Error", "Supergirl", "Molly", "King", "Son of the Blue Sky", "Thank You Very Much", "Anyone I Want to Be", "Jungle Girl", "West Coast", "Jetlag", "Uh La La La"]);
const EUROVISION = new Set(["To nie ja!", "Keine Grenzen – Żadnych granic", "My Słowianie", "River", "Solo", "The Tower", "Gaja", "Anyone I Want to Be", "Superhero"]);
const FILM_SONGS = new Set(["Kiler", "Kolorowy wiatr", "Miłość ci wszystko wybaczy", "Na pierwszy znak", "Pamiętasz, była jesień"]);
const FOOD_TITLES = new Set(["Albańskie kakao", "Mix Sałat", "Szlugi i kalafiory", "hot coffee", "Bubbletea", "Wiśnia", "Miód", "Szampan", "Candy", "Malinowy król", "Malinowy chruśniak"]);
const ANIMAL_TITLES = new Set(["Króliczek", "Kundel bury", "Papuga", "Baranek", "Oddech szczura", "Jaskółka uwięziona", "Cykady na Cykladach", "Horses"]);
// Kategorie tematyczne (każda potrzebuje co najmniej 4 piosenek różnych wykonawców – resztę pilnuje makeBoard)
const THEMES = [
  { key: "color", label: "Kolor w tytule", test: s => COLOR_RE.test(s.title) },
  { key: "name", label: "Imię lub ksywka w tytule", test: s => nameSet.has(s.title) },
  { key: "place", label: "Miejsce w tytule", test: s => placeSet.has(s.title) },
  { key: "number", label: "Liczba w tytule", test: s => /\d/.test(s.title) },
  { key: "question", label: "Tytuł jest pytaniem", test: s => s.title.trim().endsWith("?") },
  { key: "english", label: "Tytuł po angielsku", test: s => ENGLISH_TITLES.has(s.title) },
  { key: "animal", label: "Zwierzę w tytule", test: s => ANIMAL_TITLES.has(s.title) },
  { key: "love", label: "Miłość w tytule", test: s => /miło|kocha|kocham/i.test(s.title) },
  { key: "eurovision", label: "Eurowizja (także Junior)", test: s => EUROVISION.has(s.title) },
  { key: "film", label: "Piosenka z filmu", test: s => FILM_SONGS.has(s.title) },
  { key: "nie", label: "Tytuł zaczyna się od „Nie”", test: s => /^nie\b/i.test(s.title.trim()) },
  { key: "you", label: "„Ty”, „ciebie” albo „cię” w tytule", test: s => /(?<!\p{L})(ty|ciebie|cię|tobą|tobie)(?!\p{L})/iu.test(s.title) },
  { key: "nature", label: "Pogoda lub przyroda w tytule", test: s => /deszcz|wiatr|słońc|niebo|\bfal[aię]?\b|wod[aęy]|wodospad|morz|śnieg|burz|księżyc|gwiazd|chmur|krajobraz|piasku/i.test(s.title) },
  { key: "food", label: "Jedzenie lub picie w tytule", test: s => FOOD_TITLES.has(s.title) },
  { key: "body", label: "Część ciała w tytule", test: s => /(?<!\p{L})(oczy|oko|serc\p{L}*|ręce|ręka|włos\p{L}*|język\p{L}*|ciała|nosa|głowy|usta)(?!\p{L})/iu.test(s.title) },
  { key: "time", label: "Pora roku, dnia lub czas w tytule", test: s => /niedziel|jesie|wiosn|zim[aynoe]|\blato\b|\bmaj\b|\bnoc|\bdni\b|dzień|świt|wieczor|wieczór|poran|późno|\bczas/i.test(s.title) },
];

const C_COLORS = [
  { cls: "g0", emoji: "🟩", label: "łatwa" },
  { cls: "g1", emoji: "🟦", label: "średnia" },
  { cls: "g2", emoji: "🟧", label: "trudna" },
  { cls: "g3", emoji: "🟪", label: "podchwytliwa" },
];

function displayArtist(a) {
  const s = ALL_POLISH.find(x => primaryOf(x) === a);
  return s ? splitArtists(s)[0] : a;
}

// Wszystkie możliwe grupy (kategorie) z bazy
function czworkiCandidates() {
  const groups = [];
  const byArtist = new Map();
  for (const s of ALL_POLISH) {
    const p = primaryOf(s);
    if (ALIASES[p]) continue;
    if (!byArtist.has(p)) byArtist.set(p, []);
    byArtist.get(p).push(s);
  }
  for (const [a, list] of byArtist) if (list.length >= 4)
    groups.push({ kind: "artist", key: "a:" + a, label: "Wykonawca: " + displayArtist(a), level: list.length >= 6 ? 0 : 1, artist: a, test: s => primaryOf(s) === a });
  for (const th of THEMES) groups.push({ kind: "theme", key: th.key, label: th.label, level: 2, test: th.test });
  for (const d of [1960, 1970, 1980, 1990, 2000]) {
    const label = d === 2000 ? "Wydane w latach 2000–2009" : `Wydane w latach ${String(d).slice(2)}.`;
    groups.push({ kind: "decade", key: "d:" + d, label, level: 1, test: s => s.year >= d && s.year <= d + 9 });
  }
  const years = new Map();
  for (const s of ALL_POLISH) years.set(s.year, (years.get(s.year) || 0) + 1);
  for (const [y, n] of years) if (n >= 6)
    groups.push({ kind: "year", key: "y:" + y, label: "Wydane w " + y + " roku", level: 3, year: y, test: s => s.year === y });
  return groups;
}

// Losuje planszę: 4 grupy po 4 piosenki, każda piosenka pasuje do dokładnie jednej grupy.
function makeBoard(seedNum) {
  const r = mulberry32(seedNum);
  const cands = czworkiCandidates();
  const artists = shuffled(cands.filter(g => g.kind === "artist"), r);
  const themes = shuffled(cands.filter(g => g.kind === "theme"), r);
  const years = shuffled(cands.filter(g => g.kind === "year"), r);
  const decades = shuffled(cands.filter(g => g.kind === "decade"), r);
  // przepisy na planszę – najczęściej najwyżej jedna grupa „wykonawca”
  const recipes = [
    ["artist", "theme", "theme", "year"], ["artist", "theme", "theme", "decade"], ["theme", "theme", "theme", "year"],
    ["artist", "theme", "theme", "theme"], ["theme", "theme", "decade", "year"], ["artist", "theme", "decade", "year"],
    ["theme", "theme", "theme", "decade"], ["artist", "artist", "theme", "year"],
  ];
  for (let attempt = 0; attempt < 60; attempt++) {
    const recipe = recipes[Math.floor(r() * recipes.length)];
    const pick = { artist: [...artists], theme: [...themes], year: [...years], decade: [...decades] };
    const chosen = [];
    for (const k of recipe) {
      const list = pick[k];
      if (!list.length) break;
      chosen.push(list.splice(Math.floor(r() * list.length), 1)[0]);
    }
    if (chosen.length < 4) continue;
    const chosenArtists = chosen.filter(g => g.kind === "artist").map(g => g.artist);
    const result = [];
    const usedTitles = new Set();          // dwa identyczne tytuły na jednej planszy byłyby mylące
    let ok = true;
    for (const g of chosen) {
      const pool = ALL_POLISH.filter(s => {
        if (!g.test(s)) return false;
        if (chosen.some(o => o !== g && o.test(s))) return false;                        // pasowałaby do dwóch grup
        if (chosenArtists.some(a => involves(s, a) && !(g.kind === "artist" && g.artist === a && primaryOf(s) === a))) return false;
        if (artistsOf(s).some(x => ALIASES[x])) return false;                            // duety typu Taconafide
        return true;
      });
      // w grupach „rok”/„tematycznych” – różni wykonawcy
      const picked = [];
      for (const s of shuffled(pool, r)) {
        if (g.kind !== "artist" && picked.some(p => primaryOf(p) === primaryOf(s))) continue;
        if (usedTitles.has(nrm(s.title))) continue;
        usedTitles.add(nrm(s.title));
        picked.push(s);
        if (picked.length === 4) break;
      }
      if (picked.length < 4) { ok = false; break; }
      result.push({ ...g, songs: picked });
    }
    if (!ok) continue;
    result.sort((x, y) => x.level - y.level);
    result.forEach((g, i) => g.color = i);
    return result;
  }
  return null;
}

const Czworki = {
  board: null, tiles: [], selected: new Set(), solved: [], mistakes: 0, guesses: [], done: false,
  daily: true, dateKey: "", hard: store.get("scm-cz-hard", false),

  open() {
    $("czHard").checked = this.hard;
    this.start(true);
  },
  start(daily) {
    this.daily = daily;
    this.dateKey = todayKey();
    const sd = daily ? seedFrom("czworki-" + this.dateKey) : (Math.random() * 2 ** 32) >>> 0;
    this.board = makeBoard(sd);
    if (!this.board) { $("czGrid").innerHTML = "<p>Nie udało się ułożyć planszy.</p>"; return; }
    this.tiles = shuffled(this.board.flatMap(g => g.songs.map(s => ({ song: s, group: g }))), mulberry32(sd ^ 0x9e3779b9));
    this.selected.clear(); this.solved = []; this.mistakes = 0; this.guesses = []; this.done = false;
    $("czSub").textContent = daily ? `📅 Plansza dnia · ${this.dateKey.split("-").reverse().join(".")}` : "🎲 Losowa plansza";
    $("czResult").hidden = true;
    // zapisany stan planszy dnia
    if (daily) {
      const saved = store.get("scm-cz-day", null);
      if (saved && saved.date === this.dateKey) {
        for (const g of saved.guesses) this.applyGuess(g.map(i => this.tiles[i]), true);
      }
    }
    prefetchIds(this.tiles.map(t => t.song)).catch(() => {});
    this.render();
  },
  save() {
    if (!this.daily) return;
    store.set("scm-cz-day", { date: this.dateKey, guesses: this.guesses.map(g => g.map(t => this.tiles.indexOf(t))) });
  },
  toggle(t) {
    if (this.done || this.solved.includes(t.group)) return;
    if (this.selected.has(t)) this.selected.delete(t);
    else if (this.selected.size < 4) this.selected.add(t);
    this.render();
  },
  submit() {
    if (this.selected.size !== 4 || this.done) return;
    const sel = [...this.selected];
    const sig = sel.map(t => this.tiles.indexOf(t)).sort((a, b) => a - b).join(",");
    if (this.guesses.some(g => g.map(t => this.tiles.indexOf(t)).sort((a, b) => a - b).join(",") === sig)) { toast("Ten zestaw już był sprawdzany"); return; }
    this.applyGuess(sel, false);
    this.save();
    this.render();
  },
  applyGuess(sel, silent) {
    this.guesses.push(sel);
    const counts = new Map();
    sel.forEach(t => counts.set(t.group, (counts.get(t.group) || 0) + 1));
    const [g, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n === 4) {
      this.solved.push(g);
      this.selected.clear();
      if (!silent) toast("✔ " + g.label);
    } else {
      this.mistakes++;
      if (!silent) {
        toast(n === 3 ? "Blisko! Brakuje jednego." : "Nie tym razem");
        $("czGrid").classList.remove("shake"); void $("czGrid").offsetWidth; $("czGrid").classList.add("shake");
      }
    }
    if (this.solved.length === 4 || this.mistakes >= 4) this.finish(silent);
  },
  finish(silent) {
    this.done = true;
    const won = this.solved.length === 4;
    for (const g of this.board) if (!this.solved.includes(g)) this.solved.push(g);
    if (this.daily && !silent) {
      const st = store.get("scm-cz-stats", { played: 0, won: 0, streak: 0, best: 0, last: "" });
      if (st.last !== this.dateKey) {
        st.played++; if (won) st.won++;
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yKey = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
        st.streak = won ? (st.lastWon === yKey ? st.streak + 1 : 1) : 0;
        if (won) st.lastWon = this.dateKey;
        st.best = Math.max(st.best, st.streak); st.last = this.dateKey;
        store.set("scm-cz-stats", st);
      }
    }
    this.won = won;
    if (!silent) track("koniec", { gra: "czworki", plansza: this.daily ? "dnia" : "losowa", wygrana: won, pomylki: this.mistakes });
  },
  shareGrid() {
    return this.guesses.map(g => g.map(t => C_COLORS[t.group.color].emoji).join("")).join("\n");
  },
  render() {
    // rozwiązane grupy
    const solvedBox = $("czSolved");
    solvedBox.innerHTML = "";
    for (const g of this.solved) {
      const row = el("div", "cz-group " + C_COLORS[g.color].cls);
      row.appendChild(el("div", "cz-glabel", esc(g.label)));
      const list = el("div", "cz-gsongs");
      for (const s of g.songs) {
        const item = el("span", "cz-gsong");
        item.appendChild(clipButton(s));
        const txt = el("span", "", `${esc(s.title)} <small>${esc(s.artist)} · ${s.year}</small>`);
        txt.appendChild(amLink(s));
        item.appendChild(txt);
        list.appendChild(item);
      }
      row.appendChild(list);
      solvedBox.appendChild(row);
    }
    // kafelki
    const grid = $("czGrid");
    grid.innerHTML = "";
    grid.classList.toggle("hard", this.hard);
    const left = this.tiles.filter(t => !this.solved.includes(t.group));
    left.forEach((t, i) => {
      const tile = el("div", "cz-tile" + (this.selected.has(t) ? " sel" : ""));
      tile.appendChild(clipButton(t.song));
      tile.appendChild(el("div", "cz-title", this.hard ? "🎧 " + (this.tiles.indexOf(t) + 1) : esc(t.song.title)));
      tile.onclick = () => this.toggle(t);
      grid.appendChild(tile);
    });
    $("czMistakes").innerHTML = "Pomyłki: " + [0, 1, 2, 3].map(i => `<span class="dot${i < this.mistakes ? " used" : ""}"></span>`).join("");
    $("czSubmit").disabled = this.selected.size !== 4 || this.done;
    $("czControls").hidden = this.done;
    if (this.done) {
      const st = store.get("scm-cz-stats", null);
      $("czResult").hidden = false;
      $("czResultTitle").textContent = this.won ? (this.mistakes === 0 ? "🏆 Bezbłędnie!" : "🎉 Rozwiązane!") : "Koniec prób – oto rozwiązanie";
      $("czResultInfo").textContent = (this.won ? `Pomyłki: ${this.mistakes}/4. ` : "") +
        (this.daily && st ? `Seria dni: ${st.streak} · wygrane: ${st.won}/${st.played}. Nowa plansza jutro!` : "");
    }
  },
};

$("czSubmit").onclick = () => Czworki.submit();
$("czShuffle").onclick = () => { const solved = Czworki.tiles.filter(t => Czworki.solved.includes(t.group)); const rest = shuffled(Czworki.tiles.filter(t => !Czworki.solved.includes(t.group)), Math.random); Czworki.tiles = [...solved, ...rest]; Czworki.render(); };
$("czClear").onclick = () => { Czworki.selected.clear(); Czworki.render(); };
$("czDaily").onclick = () => Czworki.start(true);
$("czRandom").onclick = () => Czworki.start(false);
$("czHard").onchange = () => { Czworki.hard = $("czHard").checked; store.set("scm-cz-hard", Czworki.hard); Czworki.render(); };
$("czShare").onclick = () => shareText(`🧩 Muzyczne czwórki ${Czworki.daily ? Czworki.dateKey.split("-").reverse().join(".") : "(losowa)"}` +
  (Czworki.won ? ` – rozwiązane, pomyłki: ${Czworki.mistakes}/4` : " – tym razem się nie udało") + `\n${Czworki.shareGrid()}\n` +
  location.origin + location.pathname + "#czworki");

/* ===================== Gra 2: Muzyczny detektyw ===================== */

// Kto śpiewa: K = kobieta, M = mężczyzna, KM = oboje; Z = zespół (nie solista).
const PEOPLE = {
  "taco hemingway": "M", "mata": "M", "dawid podsiadlo": "M", "skaldowie": "M Z", "maanam": "K Z", "lady pank": "M Z", "kult": "M Z",
  "sanah": "K", "quebonafide": "M", "perfect": "M Z", "sylwia grzeszczak": "K", "sobel": "M", "marek grechuta": "M", "budka suflera": "M Z",
  "wilki": "M Z", "edyta bartosiewicz": "K", "margaret": "K", "pezet": "M", "young leosia": "K", "czerwone gitary": "M Z",
  "czeslaw niemen": "M", "maryla rodowicz": "K", "bajm": "K Z", "dzem": "M Z", "hey": "K Z", "kayah": "K", "ania dabrowska": "K",
  "kortez": "M", "daria zawialow": "K", "o s t r": "M", "white 2115": "M", "hanka ordonowna": "K", "anna jantar": "K",
  "krzysztof krawczyk": "M", "zbigniew wodecki": "M", "urszula": "K", "republika": "M Z", "t love": "M Z", "edyta gorniak": "K",
  "justyna steczkowska": "K", "myslovitz": "M Z", "elektryczne gitary": "M Z", "ich troje": "KM Z", "virgin": "K Z", "kombii": "M Z",
  "feel": "M Z", "liber": "M", "agnieszka chylinska": "K", "brodka": "K", "enej": "M Z", "natalia szroeder": "K", "krzysztof zalewski": "M",
  "kwiat jabloni": "KM Z", "roksana wegiel": "K", "smolasty": "M", "kuban": "M", "grubson": "M", "hemp gru": "M Z", "lona": "M",
  "webber": "M", "tede": "M", "keke": "M", "tymek": "M", "bedoes": "M", "bedoes 2115": "M", "ronnie ferrari": "M", "sb maffija": "M Z",
  "zabson": "M", "oki": "M", "kizo": "M", "mieczyslaw fogg": "M", "slawa przybylska": "K", "maria koterbska": "K", "katarzyna sobczyk": "K",
  "trubadurzy": "M Z", "andrzej dabrowski": "M", "krzysztof klenczon": "M", "tadeusz wozniak": "M", "2 plus 1": "KM Z",
  "izabela trojanowska": "K", "klaus mitffoch": "M Z", "kombi": "M Z", "obywatel g c": "M", "chlopcy z placu broni": "M Z",
  "big cyc": "M Z", "kasia kowalska": "K", "varius manx": "K Z", "o n a": "K Z", "kazik": "M", "golec uorkiestra": "M Z",
  "brathanki": "K Z", "blue cafe": "K Z", "coma": "M Z", "happysad": "M Z", "sistars": "K Z", "blog 27": "K Z", "krzysztof kiljanski": "M",
  "strachy na lachy": "M Z", "gosia andrzejewicz": "K", "kasia cerekwicka": "K", "doda": "K", "ira": "M Z", "patrycja markowska": "K",
  "video": "M Z", "andrzej piaseczny": "M", "ewa farna": "K", "anna wyszkoni": "K", "mrozu": "M", "weekend": "M Z", "kamil bednarek": "M",
  "ewelina lisowska": "K", "lemon": "M Z", "grzegorz hyzy": "M", "tabb": "M", "sarsa": "K", "organek": "M Z", "natalia nykiel": "K",
  "ania karwan": "K", "pawel domagala": "M", "viki gabor": "K", "ralph kaminski": "M", "ochman": "M", "blanka": "K", "luna": "K",
  "oskar cyms": "M", "wiktor dydula": "M", "fukaj": "M", "kaliber 44": "M Z", "paktofonika": "M Z", "sokol": "M", "bisz": "M",
  "popek": "M", "matheo": "M", "pro8l3m": "M Z", "gang albanii": "M Z", "schafter": "M", "guzior": "M", "malik montana": "M",
  "mr polska": "M", "gibbs": "M", "bambi": "K", "zeamsone": "M", "szpaku": "M", "kubi producent": "M", "kaz balagane": "M",
  "sentino": "M", "kinny zimmer": "M", "marysia starosta": "K", "sir mich": "M", "lanek": "M", "big scythe": "M", "trill pem": "M",
  "oskar83": "M", "piotrek lewandowski": "M", "auer": "M", "bialas": "M", "pedro": "M", "francis": "M", "dachoyce": "M", "srno": "M",
  "opal": "M", "jonatan": "M", "4money": "M", "deemz": "M", "stickxr": "M", "young igi": "M", "zetha": "M", "sergiusz": "M",
  "hades": "M", "louis villain": "M", "goran bregovic": "M", "cleo": "K", "donatan": "M", "mezo": "M", "kasia wilk": "K",
  "vito bambino": "M", "skolim": "M", "khaid": "M", "shdow": "M", "bnp": "M", "kaptur": "M", "noon": "M", "pg": "M Z",
  "taconafide": "M Z", "shdw": "M",
};
function personInfo(name) {
  const v = PEOPLE[name];
  return v ? { vocal: v.split(" ")[0], band: v.includes("Z") } : null;
}
function songTraits(s) {
  // opis wokalu zapisany przy samej piosence ma pierwszeństwo (składy z wieloma gośćmi)
  if (s.vocal) return { female: s.vocal.includes("K"), male: s.vocal.includes("M"), band: !!s.band, multi: splitArtists(s).length > 1 };
  const people = artistsOf(s).map(personInfo);
  if (!people.length || people.some(p => !p)) return null;
  const voc = people.map(p => p.vocal).join("");
  return { female: voc.includes("K"), male: voc.includes("M"), band: people[0].band, multi: people.length > 1 };
}
for (const s of ALL_POLISH) s.traits = songTraits(s);
const DET_POOL = ALL_POLISH.filter(s => s.traits);

const Q_SHORT = ["Kobieta?", "Mężczyzna?", "Zespół?", "Duet / gość?", "Rap?", "Przed 1980?", "Lata 80.?", "Lata 90.?", "Przed 2000?",
  "2000–2009?", "2010–2015?", "Po 2015?", "Po 2020?", "Rok parzysty?"];
const Q_GROUPS = [["Wokal", [0, 1]], ["Skład", [2, 3]], ["Gatunek", [4]], ["Epoka", [5, 6, 7, 8, 9, 10, 11, 12]], ["Inne", [13]]];
const QUESTIONS = [
  { q: "Śpiewa kobieta?", t: s => s.traits.female },
  { q: "Śpiewa mężczyzna?", t: s => s.traits.male },
  { q: "Wykonawca to zespół (nie solista)?", t: s => s.traits.band },
  { q: "Więcej niż jeden wykonawca (duet / gościnnie)?", t: s => s.traits.multi },
  { q: "To rap / hip-hop?", t: s => RAP_SET.has(s) },
  { q: "Wydana przed 1980?", t: s => s.year < 1980 },
  { q: "Wydana w latach 80.?", t: s => s.year >= 1980 && s.year < 1990 },
  { q: "Wydana w latach 90.?", t: s => s.year >= 1990 && s.year < 2000 },
  { q: "Wydana przed 2000?", t: s => s.year < 2000 },
  { q: "Wydana w latach 2000–2009?", t: s => s.year >= 2000 && s.year < 2010 },
  { q: "Wydana w latach 2010–2015?", t: s => s.year >= 2010 && s.year <= 2015 },
  { q: "Wydana po 2015?", t: s => s.year > 2015 },
  { q: "Wydana po 2020?", t: s => s.year > 2020 },
  { q: "Wydana w roku parzystym?", t: s => s.year % 2 === 0 },
];


/* ---- Pytania wpisywane własnymi słowami ---- */
const DET_HELP = "Zapytaj np. o: kobietę lub mężczyznę, zespół, duet, rap, lata 80., rok (przed 2000, po 2015, w 2018, między 1990 a 2005), " +
  "XXI wiek, rok parzysty, pierwszą literę tytułu lub wykonawcy, słowo w tytule albo konkretnego wykonawcę.";
const DECADE_WORDS = { "szescdziesiat": 1960, "siedemdziesiat": 1970, "osiemdziesiat": 1980, "dziewiecdziesiat": 1990, "dwutysieczn": 2000 };

function artistDisplayName(n, board) {
  for (const s of board) for (const a of splitArtists(s)) if (nrm(a) === n) return a;
  return n;
}

// Zamienia pytanie gracza na { label, test } albo null, gdy nie rozumie.
function parseQuestion(text, board) {
  const t = " " + nrm(text) + " ";
  const Y = n => { n = +n; return n < 100 ? (n <= 30 ? 2000 + n : 1900 + n) : n; };
  const yearQ = (label, test) => ({ label, test });
  let m;

  // konkretny wykonawca z planszy
  const names = [...new Set(board.flatMap(s => artistsOf(s)))].filter(n => n.length >= 3).sort((a, b) => b.length - a.length);
  for (const n of names) if (t.includes(" " + n + " ")) {
    const shown = artistDisplayName(n, board);
    return { label: `wykonawca: ${shown}`, test: s => involves(s, n) };
  }
  // tytuł konkretnej piosenki – to już strzał
  for (const s of board) { const tt = nrm(s.title); if (tt.length >= 4 && t.includes(" " + tt + " ")) return { guessHint: true }; }

  // lata / rok
  if ((m = t.match(/miedzy (\d{2,4}) (?:a|i|do) (\d{2,4})/))) {
    const lo = Math.min(Y(m[1]), Y(m[2])), hi = Math.max(Y(m[1]), Y(m[2]));
    return yearQ(`wydana w latach ${lo}–${hi}`, s => s.year >= lo && s.year <= hi);
  }
  if ((m = t.match(/(?:przed|wczesniej niz|starsz\w* niz|do) (?:rokiem |roku )?(\d{4})/))) {
    const y = +m[1]; return yearQ(`wydana przed ${y}`, s => s.year < y);
  }
  if ((m = t.match(/(?:pozniej niz|mlodsz\w* niz|nowsz\w* niz|po) (?:roku )?(\d{4})/))) {
    const y = +m[1]; return yearQ(`wydana po ${y}`, s => s.year > y);
  }
  if ((m = t.match(/ od (?:roku )?(\d{4})/))) {
    const y = +m[1]; return yearQ(`wydana w ${y} lub później`, s => s.year >= y);
  }
  if ((m = t.match(/(?:lat\w*|dekad\w*) (\d{2}|\d{4})(?= |$)/)) && +m[1] % 10 === 0) {
    const d = Y(m[1]); return yearQ(`wydana w latach ${d}–${d + 9}`, s => s.year >= d && s.year <= d + 9);
  }
  for (const [w, d] of Object.entries(DECADE_WORDS)) if (t.includes(w)) return yearQ(`wydana w latach ${d}–${d + 9}`, s => s.year >= d && s.year <= d + 9);
  if (/ xxi | 21 wiek| tym wieku| tym stuleciu| xxi w/.test(t)) return yearQ("wydana w XXI wieku (od 2000)", s => s.year >= 2000);
  if (/ xx wiek| xx w | 20 wiek| poprzedni\w* wiek| zeszl\w* wiek/.test(t)) return yearQ("wydana w XX wieku (przed 2000)", s => s.year < 2000);
  if ((m = t.match(/ (19\d\d|20[0-3]\d) /))) { const y = +m[1]; return yearQ(`wydana w ${y} roku`, s => s.year === y); }
  if (/nieparzyst/.test(t)) return { label: "wydana w roku nieparzystym", test: s => s.year % 2 === 1 };
  if (/parzyst/.test(t)) return { label: "wydana w roku parzystym", test: s => s.year % 2 === 0 };

  // pierwsza litera / słowa w tytule
  const letter = t.match(/(?:liter\w*|zaczyna sie(?: na| od)?|na) ([a-z0-9]) /);
  if (letter && /liter|zaczyna/.test(t)) {
    const L = letter[1];
    if (/wykonawc|artyst|nazw\w* zespol|imie|nazwisk|piosenkar/.test(t))
      return { label: `wykonawca zaczyna się na „${L.toUpperCase()}”`, test: s => nrm(splitArtists(s)[0] || s.artist).startsWith(L) };
    return { label: `tytuł zaczyna się na „${L.toUpperCase()}”`, test: s => nrm(s.title).startsWith(L) };
  }
  if (/jednowyrazow|jedn\w* (slow|wyraz)/.test(t)) return { label: "tytuł ma jedno słowo", test: s => nrm(s.title.replace(/\(.*?\)/g, "")).split(" ").length === 1 };
  if ((m = t.match(/(?:w tytule|tytul\w* (?:zawiera|ma w sobie)) (?:jest |sie )?(?:slowo |wyraz )?([a-z0-9]{3,})/))) {
    const w = m[1];
    const shown = (text.split(/\s+/).map(x => x.replace(/[^\p{L}\p{N}]/gu, "")).find(x => nrm(x) === w)) || w;
    return { label: `w tytule jest „${shown}”`, test: s => (" " + nrm(s.title) + " ").includes(w) };
  }

  // wokal, skład, gatunek
  if (/kobiet|dziewczyn|wokalistk|piosenkark|raperk|babk| pani /.test(t)) return { label: "śpiewa kobieta", test: s => s.traits.female };
  if (/ rap|hip ?hop/.test(t)) return { label: "rap / hip-hop", test: s => RAP_SET.has(s) };
  if (/mezczyzn|facet|chlopak| chlop|wokalista |piosenkarz| pan /.test(t)) return { label: "śpiewa mężczyzna", test: s => s.traits.male };
  if (/duet|feat|gosc|wspolprac|kilku wykonaw|wiecej niz jed|dwoch wykonaw|kilka osob/.test(t)) return { label: "więcej niż jeden wykonawca", test: s => s.traits.multi };
  if (/solist|solow| solo /.test(t)) return { label: "solista (nie zespół)", test: s => !s.traits.band };
  if (/zespol|grup|kapel| band/.test(t)) return { label: "zespół", test: s => s.traits.band };
  return null;
}

const odm = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
const pytan = n => n === 1 ? "pytanie" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "pytania" : "pytań";

// 24 piosenki: mieszanka epok i wykonawców (bez powtórek wykonawcy). To samo ziarno = ta sama plansza.
function detBoard(r) {
  const picked = [];
  for (const s of shuffled(DET_POOL, r)) {
    if (picked.some(p => primaryOf(p) === primaryOf(s))) continue;
    picked.push(s);
    if (picked.length === 24) break;
  }
  return picked;
}

const Detektyw = {
  mode: store.get("scm-det-mode", "solo") === "cpu" ? "cpu" : "solo",   // "solo", "cpu" albo "online"
  questions: 0,
  board: [], mySecret: null, cpuSecret: null, oppSecret: null, myLeft: null, cpuLeft: null, oppLeft: 24,
  asked: new Set(), cpuAsked: new Set(), turn: "me", over: false, pending: null, result: null,
  hard: store.get("scm-det-hard", false), smart: store.get("scm-det-smart", false),

  open(joinCode, joinBroker) {
    $("detHard").checked = this.hard; $("detSmart").checked = this.smart;
    if (joinCode) { this.setMode("online"); DetNet.showJoin(joinCode, joinBroker); }
    else if (this.mode === "online" && DetNet.client) this.render();
    else this.setMode(this.mode === "online" ? "solo" : this.mode);
  },
  setMode(m) {
    if (m === this.mode && m !== "online" && this.board.length) { this.syncModeUi(); return; }
    if (m === "online") { this.mode = "online"; $("doName1").value = playerName; this.syncModeUi(); if (!DetNet.client) DetNet.view("doMenu"); return; }
    DetNet.leave(true);
    this.mode = m;
    store.set("scm-det-mode", m);
    this.syncModeUi();
    m === "solo" ? this.startSolo() : this.start();
  },
  syncModeUi() {
    document.querySelectorAll("#detModeSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === this.mode));
    $("detOnline").hidden = this.mode !== "online";
    $("detSmartWrap").hidden = this.mode !== "cpu";
    $("detGame").hidden = this.mode === "online" && !DetNet.playing;
  },

  // ---- sam zgadujesz: komputer tylko odpowiada ----
  startSolo() {
    this.board = detBoard(Math.random);
    this.cpuSecret = this.board[Math.floor(Math.random() * this.board.length)];
    this.mySecret = null; this.oppSecret = null;
    this.reset("me");
    this.log("🔎 Komputer ukrył jedną z tych 24 piosenek. Pytaj własnymi słowami albo wybieraj gotowe pytania – im mniej pytań, tym lepiej!", "sys");
  },

  // ---- wyścig z komputerem ----
  start() {
    const r = Math.random;
    this.board = detBoard(r);
    const two = shuffled(this.board, r);
    this.mySecret = two[0]; this.cpuSecret = two[1]; this.oppSecret = null;
    this.reset("me");
    this.log("🕵️ Komputer wylosował ukrytą piosenkę z planszy. Ty też masz swoją – zadawaj pytania i odgadnij jego piosenkę pierwszy!", "sys");
  },
  reset(firstTurn) {
    this.myLeft = new Set(this.board); this.cpuLeft = new Set(this.board); this.oppLeft = this.board.length;
    this.asked.clear(); this.cpuAsked.clear();
    this.turn = firstTurn; this.over = false; this.pending = null; this.result = null; this.questions = 0;
    $("detInput").value = "";
    $("detLog").innerHTML = "";
    prefetchIds(this.board).catch(() => {});
    this.render();
  },

  // ---- gra ze znajomym ----
  startOnline(seedNum, iStart) {
    this.board = detBoard(mulberry32(seedNum));
    this.mySecret = this.board[Math.floor(Math.random() * this.board.length)];   // tajna – zna ją tylko to urządzenie
    this.cpuSecret = null; this.oppSecret = null;
    this.reset(iStart ? "me" : "opp");
    this.log(`🕵️ Gracie z ${esc(DetNet.oppName)} na tej samej planszy. ${iStart ? "Zaczynasz Ty – zadaj pierwsze pytanie." : esc(DetNet.oppName) + " zaczyna."}`, "sys");
    this.syncModeUi();
  },
  opp() { return this.mode === "online" ? DetNet.oppName : "Komputer"; },
  resolve(spec) {
    if (typeof spec.i === "number") { const Q = QUESTIONS[spec.i]; return Q ? { label: Q.q, test: Q.t } : null; }
    return parseQuestion(spec.text || "", this.board);
  },
  askText() {
    const text = $("detInput").value.trim().slice(0, 120);
    if (!text) { $("detInput").focus(); return; }
    if (this.ask({ text }) !== false) $("detInput").value = "";
  },

  log(html, cls) { $("detLog").prepend(el("li", cls || "", html)); },
  ask(spec) {
    if (typeof spec === "number") spec = { i: spec };
    if (this.over || this.turn !== "me") return false;
    if (typeof spec.i === "number" && this.asked.has(spec.i)) return false;
    const R = this.resolve(spec);
    if (!R) { this.log(`🤔 Nie rozumiem pytania „${esc(spec.text)}”. ${esc(DET_HELP)}`, "sys"); return false; }
    if (R.guessHint) { this.log("🎯 Żeby wskazać konkretną piosenkę, kliknij ją na planszy – to strzał.", "sys"); return false; }
    if (typeof spec.i === "number") this.asked.add(spec.i);
    if (this.mode === "online") {
      this.turn = "wait";
      DetNet.send({ t: "ask", q: spec.i, text: spec.text });
      this.render();
      return true;
    }
    this.applyAnswer(R, R.test(this.cpuSecret), spec);
    if (this.mode === "solo") { this.questions++; this.render(); return true; }
    this.turn = "cpu";
    this.render();
    setTimeout(() => this.cpuTurn(), 1100);
    return true;
  },
  qHtml(R, spec) {
    return spec.text ? `„${esc(spec.text)}”` : esc(R.label);
  },
  ansHtml(R, ans, spec) {
    return `<b class="${ans ? "yes" : "no"}">${ans ? "TAK" : "NIE"}</b>` + (spec.text ? ` <small>(rozumiem: ${esc(R.label)})</small>` : "");
  },
  applyAnswer(R, ans, spec) {
    for (const s of [...this.myLeft]) if (R.test(s) !== ans) this.myLeft.delete(s);
    this.log(`Ty: <b>${this.qHtml(R, spec)}</b> → ${esc(this.opp())}: ${this.ansHtml(R, ans, spec)} · zostało ${this.myLeft.size}`, "me");
  },
  // przeciwnik online zadał pytanie – odpowiada automatycznie to urządzenie
  answerOpp(spec) {
    const R = this.resolve(spec);
    if (!R || R.guessHint || this.over) return;
    const ans = R.test(this.mySecret);
    DetNet.send({ t: "answer", q: spec.i, text: spec.text, a: ans });
    this.log(`${esc(DetNet.oppName)}: <b>${this.qHtml(R, spec)}</b> → o Twojej piosence: ${this.ansHtml(R, ans, spec)}`, "cpu");
    this.turn = "me";
    this.render();
  },
  gotAnswer(spec, ans) {
    if (this.turn !== "wait" || this.over) return;
    const R = this.resolve(spec);
    if (!R) return;
    this.applyAnswer(R, !!ans, spec);
    DetNet.send({ t: "left", n: this.myLeft.size });
    this.turn = "opp";
    this.render();
  },
  cpuTurn() {
    if (this.over) return;
    const left = [...this.cpuLeft];
    if (left.length === 1) {
      const g = left[0];
      this.log(`Komputer strzela: <b>„${esc(g.title)}”</b>…`, "cpu");
      this.end(g === this.mySecret ? "opp" : "me", g === this.mySecret ? "Komputer odgadł Twoją piosenkę." : "Komputer strzelił źle!");
      return;
    }
    const options = QUESTIONS.map((Q, i) => ({ i, Q, yes: left.filter(s => Q.t(s)).length }))
      .filter(o => !this.cpuAsked.has(o.i) && o.yes > 0 && o.yes < left.length);
    if (!options.length) {         // nie ma już rozróżniającego pytania – zgaduje losowo
      const g = left[Math.floor(Math.random() * left.length)];
      this.log(`Komputer strzela na ślepo: <b>„${esc(g.title)}”</b>…`, "cpu");
      this.end(g === this.mySecret ? "opp" : "me", g === this.mySecret ? "Komputer miał szczęście." : "Komputer strzelił źle!");
      return;
    }
    let o;
    if (this.smart) { options.sort((a, b) => Math.abs(a.yes - left.length / 2) - Math.abs(b.yes - left.length / 2)); o = options[0]; }
    else o = options[Math.floor(Math.random() * options.length)];
    this.cpuAsked.add(o.i);
    const ans = o.Q.t(this.mySecret);
    for (const s of left) if (o.Q.t(s) !== ans) this.cpuLeft.delete(s);
    this.log(`Komputer: <b>${esc(o.Q.q)}</b> → o Twojej piosence: <b class="${ans ? "yes" : "no"}">${ans ? "TAK" : "NIE"}</b> · zostało mu ${this.cpuLeft.size}`, "cpu");
    this.turn = "me";
    this.render();
  },
  guess(s) {
    if (this.over || this.turn !== "me") return;
    this.pending = s;
    this.render();
  },
  confirmGuess() {
    const s = this.pending;
    if (!s) return;
    this.pending = null;
    this.log(`Ty strzelasz: <b>„${esc(s.title)}”</b>…`, "me");
    if (this.mode === "solo") {
      this.questions++;
      if (s === this.cpuSecret) { this.end("me", `Zgadnięte w ${this.questions} ${this.questions === 1 ? "pytaniu" : "pytaniach"}.`); return; }
      this.myLeft.delete(s);
      this.log(`❌ To nie ta piosenka (+1 pytanie) · zostało ${this.myLeft.size}`, "sys");
      this.render();
      return;
    }
    if (this.mode === "online") {
      this.turn = "wait";
      DetNet.send({ t: "guess", i: this.board.indexOf(s) });
      this.render();
      return;
    }
    this.end(s === this.cpuSecret ? "me" : "opp", s === this.cpuSecret ? "Trafiony strzał – to ukryta piosenka komputera!" : "To nie ta piosenka.");
  },
  // przeciwnik online strzela w moją piosenkę
  oppGuessed(i) {
    const s = this.board[i];
    if (!s || this.over) return;
    const correct = s === this.mySecret;
    DetNet.send({ t: "result", correct, secret: this.board.indexOf(this.mySecret) });
    this.log(`${esc(DetNet.oppName)} strzela: <b>„${esc(s.title)}”</b>…`, "cpu");
    this.end(correct ? "opp" : "me", correct ? "Twoja piosenka została odgadnięta." : `Pudło! ${DetNet.oppName} strzela w złą piosenkę.`);
  },
  gotResult(correct, secretIdx) {
    if (this.over) return;
    this.oppSecret = this.board[secretIdx] || null;
    DetNet.send({ t: "reveal", secret: this.board.indexOf(this.mySecret) });
    this.end(correct ? "me" : "opp", correct ? "Trafiony strzał!" : "To nie ta piosenka.");
  },
  end(winner, why) {
    this.over = true;
    this.turn = "over";
    stopClip();
    if (this.mode === "solo") {
      const st = store.get("scm-det-solo", { played: 0, best: 0 });
      st.played++;
      const record = !st.best || this.questions < st.best;
      if (record) st.best = this.questions;
      store.set("scm-det-solo", st);
      this.result = { winner, why, st, record };
      this.log(`🎉 ${esc(why)}${record ? " Nowy rekord!" : ""}`, "sys");
      track("koniec", { gra: "detektyw", tryb: "sam", pytania: this.questions });
      this.render();
      return;
    }
    const key = this.mode === "online" ? "scm-det-online-stats" : "scm-det-stats";
    const st = store.get(key, { won: 0, lost: 0 });
    winner === "me" ? st.won++ : st.lost++;
    store.set(key, st);
    this.result = { winner, why, st };
    this.log(winner === "me" ? `🏆 Wygrywasz! ${esc(why)}` : `Wygrywa ${esc(this.opp())}. ${esc(why)}`, "sys");
    track("koniec", { gra: "detektyw", tryb: this.mode === "online" ? "online" : "komputer", wygrana: winner === "me", komputer: this.smart ? "trudny" : "latwy" });
    this.render();
  },
  render() {
    if (!this.board.length || (!this.mySecret && this.mode !== "solo")) return;
    const online = this.mode === "online", solo = this.mode === "solo";
    const oppSecret = online ? this.oppSecret : this.cpuSecret;
    const my = $("detMine");
    my.innerHTML = "";
    my.hidden = solo;
    if (!solo) {
      my.appendChild(clipButton(this.mySecret));
      const info = el("div", "", `<small>Twoja ukryta piosenka (${esc(this.opp())} jej szuka)</small><b>${esc(this.mySecret.title)}</b> <span>${esc(this.mySecret.artist)} · ${this.mySecret.year}</span> `);
      info.appendChild(amLink(this.mySecret));
      my.appendChild(info);
    }
    const n = this.board.length, bar = (label, left, cls) =>
      `<div class="ds-line ${cls}"><span>${esc(label)}</span><b>${left}<small>/${n}</small></b></div><div class="ds-bar ${cls}"><i style="width:${(left / n * 100).toFixed(1)}%"></i></div>`;
    $("detCpu").innerHTML = solo
      ? `<div class="ds-big"><div><b>${this.questions}</b><span>${pytan(this.questions)}</span></div><div><b>${this.myLeft.size}</b><span>pozostało z ${n}</span></div></div>` +
        `<div class="ds-bar me"><i style="width:${(this.myLeft.size / n * 100).toFixed(1)}%"></i></div>`
      : bar("Ty – zostało", this.myLeft.size, "me") + bar((online ? DetNet.oppName : "Komputer") + " – zostało", online ? this.oppLeft : this.cpuLeft.size, "opp");
    const grid = $("detGrid");
    grid.innerHTML = "";
    grid.classList.toggle("hard", this.hard);
    this.board.forEach((s, i) => {
      const out = !this.myLeft.has(s);
      const reveal = this.over && s === oppSecret;
      const tile = el("div", "det-tile" + (out ? " out" : "") + (reveal ? " secret" : "") + (this.pending === s ? " sel" : ""));
      tile.style.setProperty("--h", (s.hue ?? i * 37) % 360);
      const cover = el("div", "det-cover");
      cover.appendChild(clipButton(s));
      tile.appendChild(cover);
      if (out && !reveal) tile.appendChild(el("span", "det-x", "✕"));
      if (reveal) tile.appendChild(el("span", "det-badge", "🎯"));
      const txt = el("div", "det-text", this.hard && !this.over ? `🎧 ${i + 1}` : `<b>${esc(s.title)}</b><small>${esc(s.artist)}${this.over ? " · " + s.year : ""}</small>`);
      if (this.over) txt.appendChild(amLink(s));
      tile.appendChild(txt);
      tile.onclick = () => { if (!out) this.guess(s); };
      grid.appendChild(tile);
    });
    const qs = $("detQuestions");
    qs.innerHTML = "";
    for (const [name, idxs] of Q_GROUPS) {
      const row = el("div", "det-qgroup");
      row.appendChild(el("span", "det-qlabel", name));
      for (const i of idxs) {
        const b = el("button", "det-q" + (this.asked.has(i) ? " asked" : ""), esc(Q_SHORT[i]));
        b.title = QUESTIONS[i].q;
        b.disabled = this.over || this.turn !== "me" || this.asked.has(i);
        b.onclick = () => this.ask(i);
        row.appendChild(b);
      }
      qs.appendChild(row);
    }
    $("detInput").disabled = $("detAskBtn").disabled = this.over || this.turn !== "me";
    $("detTurn").textContent = this.over ? "" : this.turn === "me"
      ? (solo ? "Wpisz pytanie albo wybierz gotowe. Gdy wiesz – kliknij piosenkę." : "Twoja kolej: zadaj pytanie albo kliknij piosenkę, żeby strzelić.")
      : this.turn === "wait" ? `⏳ Czekam na odpowiedź od ${this.opp()}…`
      : online ? `⏳ Kolej: ${DetNet.oppName} – za chwilę zada pytanie.` : "🤖 Komputer myśli…";
    $("detConfirm").hidden = !this.pending;
    if (this.pending) $("detConfirmText").textContent = `Strzelasz: „${this.pending.title}”? ` + (solo ? "Pudło kosztuje +1 pytanie." : "Pomyłka = przegrana.");
    $("detResult").hidden = !this.over;
    if (this.over && this.result && solo) {
      $("detResultTitle").textContent = this.result.record ? "🏆 Nowy rekord!" : "🎉 Zgadnięte!";
      $("detResultInfo").textContent = `${this.result.why} To była „${this.cpuSecret.title}” – ${this.cpuSecret.artist} (${this.cpuSecret.year}). ` +
        `Twój rekord: ${this.result.st.best} ${pytan(this.result.st.best)} · rozegrane: ${this.result.st.played}.`;
      $("detAgain").textContent = "Zagraj jeszcze raz";
    } else if (this.over && this.result) {
      $("detResultTitle").textContent = this.result.winner === "me" ? "🏆 Wygrywasz!" : `Wygrywa ${this.opp()}`;
      $("detResultInfo").textContent = `${this.result.why} ` +
        (oppSecret ? `Ukryta piosenka (${this.opp()}): „${oppSecret.title}” – ${oppSecret.artist} (${oppSecret.year}). ` : "") +
        `Bilans${online ? " online" : ""}: ${this.result.st.won} ${odm(this.result.st.won, "wygrana", "wygrane", "wygranych")}, ` +
        `${this.result.st.lost} ${odm(this.result.st.lost, "przegrana", "przegrane", "przegranych")}.`;
      $("detAgain").textContent = online ? "🔁 Rewanż" : "Zagraj jeszcze raz";
    }
  },
};

/* ---- Połączenie dla 2 graczy (ten sam darmowy serwer co pojedynki w „Starsza czy młodsza?”) ---- */
const DetNet = {
  client: null, code: "", idx: 0, host: false, oppId: null, oppName: "", oppSeen: 0, round: 0, playing: false, pinger: null,

  view(v) {
    for (const id of ["doMenu", "doJoin", "doConn", "doWait", "doBar"]) $(id).hidden = id !== v;
    Detektyw.syncModeUi();
  },
  link() { return location.origin + location.pathname + "#detektyw-" + this.code + "-" + this.idx; },
  showJoin(code, broker) {
    $("doJoinCode").textContent = code;
    $("doJoinBtn").dataset.code = code; $("doJoinBtn").dataset.broker = broker || 0;
    $("doName2").value = playerName;
    this.view("doJoin");
  },
  async connect(code, brokerIdx, asHost) {
    this.view("doConn");
    $("doConnMsg").textContent = "Łączę się z serwerem gry…";
    try {
      await ensureMqtt();
      const order = brokerIdx === undefined ? BROKERS.map((_, i) => i) : [brokerIdx];
      let client = null, idx = 0;
      for (const i of order) { try { client = await connectBroker(i, "det-" + code); idx = i; break; } catch (e) {} }
      if (!client) throw new Error("Nie udało się połączyć z serwerem gry. Sprawdź internet i spróbuj ponownie.");
      Object.assign(this, { client, code, idx, host: asHost, oppId: null, oppName: "", round: 0, playing: false });
      const topic = TOPIC("det-" + code);
      client.subscribe(topic);
      client.on("message", (_, buf) => { let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; } this.onMessage(m); });
      client.on("connect", () => client.subscribe(topic));
      this.pinger = setInterval(() => this.tick(), 3000);
      this.send({ t: "hello", name: playerName, host: asHost });
      history.replaceState(null, "", "#detektyw-" + code + "-" + idx);
      if (asHost) {
        $("doCode").textContent = code;
        $("doLink").value = this.link();
        $("doShareStatus").textContent = "";
        this.view("doWait");
      } else {
        $("doConnMsg").textContent = "Połączono – czekam na gospodarza gry…";
        this.joinTimeout = setTimeout(() => { if (!this.oppId) $("doConnMsg").textContent = "Gospodarz nie odpowiada. Sprawdź kod albo poproś o nowy link."; }, 8000);
      }
    } catch (e) {
      $("doConnMsg").textContent = "❌ " + e.message;
    }
  },
  send(m) { if (this.client && this.client.connected) this.client.publish(TOPIC("det-" + this.code), JSON.stringify({ ...m, id: myId, to: this.oppId })); },
  tick() {
    if (!this.client) return;
    this.send({ t: "ping", name: playerName });
    if (this.oppId && Date.now() - this.oppSeen > 12000) this.oppGone();
  },
  oppGone() {
    if (!this.oppId) return;
    const name = this.oppName;
    this.oppId = null;
    this.playing = false;
    if (!Detektyw.over && Detektyw.board.length) Detektyw.log(`⚠️ Utracono połączenie z: ${esc(name)}.`, "sys");
    if (this.host) { $("doCode").textContent = this.code; $("doLink").value = this.link(); this.view("doWait"); $("doShareStatus").textContent = `${name} nie jest już w grze – możesz zaprosić kogoś innego.`; }
    else { $("doConnMsg").textContent = `Gra z: ${name} została zakończona.`; this.view("doConn"); }
  },
  onMessage(m) {
    if (!m || !m.id || m.id === myId) return;
    if (m.to && m.to !== myId) return;                               // wiadomość do kogoś innego
    if (this.oppId && m.id !== this.oppId) {
      if (m.t === "hello" && this.host) this.client.publish(TOPIC("det-" + this.code), JSON.stringify({ t: "full", id: myId, to: m.id }));
      return;
    }
    if (m.t === "full" && m.to === myId && !this.oppId) { $("doConnMsg").textContent = "Ta gra ma już dwóch graczy."; this.view("doConn"); return; }
    if (m.t === "bye") { if (m.id === this.oppId) this.oppGone(); return; }
    if (!this.oppId) {
      // pierwszy kontakt: gospodarz przyjmuje gościa i rozdaje planszę
      if (this.host && m.t === "hello" && !m.host) { this.accept(m); this.newRound(); }
      else if (!this.host && (m.t === "setup" || (m.t === "hello" && m.host))) { this.accept(m); }
      if (!this.oppId) return;
    }
    this.oppSeen = Date.now();
    if (typeof m.name === "string" && m.name) this.oppName = m.name.slice(0, 20);
    switch (m.t) {
      case "setup": if (!this.host && m.round > this.round) this.beginRound(m.round, m.seed, !m.hostStarts); break;
      case "rematch": if (this.host) this.newRound(); break;
      case "ask": Detektyw.answerOpp({ i: m.q, text: typeof m.text === "string" ? m.text.slice(0, 120) : undefined }); break;
      case "answer": Detektyw.gotAnswer({ i: m.q, text: typeof m.text === "string" ? m.text.slice(0, 120) : undefined }, m.a); break;
      case "left": Detektyw.oppLeft = m.n; Detektyw.render(); break;
      case "guess": Detektyw.oppGuessed(m.i); break;
      case "result": Detektyw.gotResult(m.correct, m.secret); break;
      case "reveal": Detektyw.oppSecret = Detektyw.board[m.secret] || null; Detektyw.render(); break;
    }
  },
  accept(m) {
    clearTimeout(this.joinTimeout);
    this.oppId = m.id; this.oppSeen = Date.now();
    this.oppName = (m.name || "Przeciwnik").slice(0, 20);
    this.send({ t: "hello", name: playerName, host: this.host });
  },
  newRound() {
    this.round++;
    const seedNum = (Math.random() * 2 ** 32) >>> 0;
    const hostStarts = this.round % 2 === 1;        // na zmianę zaczyna gospodarz i gość
    this.send({ t: "setup", round: this.round, seed: seedNum, hostStarts, name: playerName });
    this.beginRound(this.round, seedNum, hostStarts);
  },
  beginRound(round, seedNum, iStart) {
    this.round = round;
    this.playing = true;
    $("doVs").textContent = `👥 Grasz z: ${this.oppName}`;
    this.view("doBar");
    Detektyw.startOnline(seedNum, iStart);
  },
  rematch() { if (this.host) this.newRound(); else { this.send({ t: "rematch" }); $("detResultInfo").textContent = "Wysłano prośbę o rewanż…"; } },
  leave(silent) {
    clearInterval(this.pinger); clearTimeout(this.joinTimeout);
    if (this.client) { try { this.send({ t: "bye" }); this.client.end(); } catch (e) {} }
    Object.assign(this, { client: null, oppId: null, playing: false, round: 0 });
    if (location.hash.startsWith("#detektyw-")) history.replaceState(null, "", "#detektyw");
    if (!silent) { Detektyw.board = []; this.view("doMenu"); }
  },
};
window.addEventListener("pagehide", () => { if (DetNet.client) try { DetNet.send({ t: "bye" }); } catch (e) {} });

function detNeedName(input) {
  const n = input.value.trim();
  if (!n) { input.focus(); input.placeholder = "Wpisz imię, żeby przeciwnik wiedział, z kim gra"; return false; }
  setName(n); return true;
}
document.querySelectorAll("#detModeSeg button").forEach(b => b.onclick = () => Detektyw.setMode(b.dataset.m));
$("doCreate").onclick = () => {
  if (!detNeedName($("doName1"))) return;
  let code = ""; for (let i = 0; i < 4; i++) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  track("pokoj", { gra: "detektyw", akcja: "utworz" });
  DetNet.connect(code, undefined, true);
};
$("doJoinCodeBtn").onclick = () => {
  if (!detNeedName($("doName1"))) return;
  const code = $("doCodeInput").value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $("doCodeInput").focus(); return; }
  track("pokoj", { gra: "detektyw", akcja: "dolacz kodem" });
  DetNet.connect(code, 0, false);
};
$("doJoinBtn").onclick = () => {
  if (!detNeedName($("doName2"))) return;
  track("pokoj", { gra: "detektyw", akcja: "dolacz z linku" });
  DetNet.connect($("doJoinBtn").dataset.code, +$("doJoinBtn").dataset.broker || 0, false);
};
$("doCancel").onclick = $("doConnCancel").onclick = $("doJoinCancel").onclick = $("doLeave").onclick = () => DetNet.leave(false);
$("doShare").onclick = async () => {
  const text = `🕵️ Zagraj ze mną w „Muzycznego detektywa” – kod gry ${DetNet.code}:`;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ title: "Muzyczny detektyw", text, url: DetNet.link() }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text + " " + DetNet.link()); $("doShareStatus").textContent = "✔ Skopiowano link – wyślij go znajomemu."; }
  catch (e) { $("doLink").select(); $("doShareStatus").textContent = "Skopiuj link z pola powyżej."; }
};

$("detYes").onclick = () => Detektyw.confirmGuess();
$("detNo").onclick = () => { Detektyw.pending = null; Detektyw.render(); };
const detRestart = () => Detektyw.mode === "online" ? DetNet.rematch() : Detektyw.mode === "solo" ? Detektyw.startSolo() : Detektyw.start();
$("detNew").onclick = detRestart;
$("detAgain").onclick = detRestart;
$("detAskBtn").onclick = () => Detektyw.askText();
$("detInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); Detektyw.askText(); } });
$("detHard").onchange = () => { Detektyw.hard = $("detHard").checked; store.set("scm-det-hard", Detektyw.hard); Detektyw.render(); };
$("detSmart").onchange = () => { Detektyw.smart = $("detSmart").checked; store.set("scm-det-smart", Detektyw.smart); };

/* ===================== Gra 3: Muzyczny kod ===================== */

const KOD_TRIES = 8;
const Kod = {
  pool8: [], code: [], row: [], history: [], over: false, daily: true, dateKey: "",
  mode: store.get("scm-kod-mode", "pl"), easy: store.get("scm-kod-easy", true), colors: store.get("scm-kod-colors", true),

  open() {
    $("kodMode").innerHTML = Object.keys(MODES).filter(k => MODES[k].songs.length >= 10)
      .map(k => `<option value="${k}">${MODES[k].label}</option>`).join("");
    $("kodMode").value = this.mode;
    $("kodEasy").checked = this.easy;
    $("kodColors").checked = this.colors;
    this.start(true);
  },
  start(daily) {
    this.daily = daily;
    this.dateKey = todayKey();
    const sd = daily ? seedFrom("kod-" + this.dateKey) : (Math.random() * 2 ** 32) >>> 0;
    const r = mulberry32(sd);
    const src = daily ? MODES.pl.songs : MODES[this.mode].songs;
    const easy = daily ? true : this.easy;
    // 8 piosenek o różnych latach (łatwy: z różnych dekad, jeśli się da)
    const pick = [];
    const usedKey = new Set();
    for (const s of shuffled(src, r)) {
      const k = easy ? Math.floor(s.year / 10) : s.year;
      if (usedKey.has(k) || pick.some(p => p.year === s.year)) continue;
      usedKey.add(k); pick.push(s);
      if (pick.length === 8) break;
    }
    if (pick.length < 8) for (const s of shuffled(src, r)) {
      if (pick.length === 8) break;
      if (!pick.includes(s) && !pick.some(p => p.year === s.year)) pick.push(s);
    }
    this.pool8 = pick;
    this.code = shuffled(pick, r).slice(0, 4).sort((a, b) => a.year - b.year);
    this.row = []; this.history = []; this.over = false;
    $("kodSub").textContent = daily ? `📅 Kod dnia · ${this.dateKey.split("-").reverse().join(".")} · wszystkie polskie` : `🎲 Losowy kod · ${MODES[this.mode].label}${easy ? " · łatwy" : ""}`;
    if (daily) {
      const saved = store.get("scm-kod-day", null);
      if (saved && saved.date === this.dateKey) for (const h of saved.rows) { this.row = h.map(i => this.pool8[i]); this.check(true); }
    }
    prefetchIds(pick).catch(() => {});
    this.render();
  },
  add(s) {
    if (this.over || this.row.includes(s) || this.row.length >= 4) return;
    this.row.push(s);
    this.render();
  },
  removeAt(i) { if (this.over) return; this.row.splice(i, 1); this.render(); },
  check(silent) {
    if (this.row.length !== 4 || this.over) return;
    let black = 0, white = 0;
    this.row.forEach((s, i) => { if (this.code[i] === s) black++; else if (this.code.includes(s)) white++; });
    // ocena każdej pozycji osobno (do kolorowych podpowiedzi): g = dobre miejsce, y = złe miejsce, x = nie ma w kodzie
    const marks = this.row.map((s, i) => this.code[i] === s ? "g" : this.code.includes(s) ? "y" : "x");
    this.history.push({ row: [...this.row], black, white, marks });
    this.row = [];
    if (black === 4 || this.history.length >= KOD_TRIES) {
      this.over = true;
      if (this.daily && !silent) store.set("scm-kod-last", { date: this.dateKey, won: black === 4, tries: this.history.length });
      if (!silent) track("koniec", { gra: "kod", kod: this.daily ? "dnia" : "losowy", wygrana: black === 4, proby: this.history.length });
    }
    if (this.daily) store.set("scm-kod-day", { date: this.dateKey, rows: this.history.map(h => h.row.map(s => this.pool8.indexOf(s))) });
    if (!silent) this.render();
  },
  pegs(h) { return "●".repeat(h.black) + "○".repeat(h.white) + "·".repeat(4 - h.black - h.white); },
  render() {
    const cover = (s, extra) => {
      const c = el("div", "kod-cover" + (extra || ""));
      c.style.setProperty("--h", (s.hue ?? 200) % 360);
      return c;
    };
    // pula 8 piosenek
    const pool = $("kodPool");
    pool.innerHTML = "";
    for (const s of this.pool8) {
      const pos = this.row.indexOf(s);
      const inCode = this.over && this.code.includes(s);
      const chip = el("div", "kod-chip" + (pos >= 0 ? " used" : "") + (inCode ? " in-code" : ""));
      const c = cover(s);
      c.appendChild(clipButton(s));
      chip.appendChild(c);
      chip.appendChild(el("div", "kod-text", `<b>${esc(s.title)}</b><small>${esc(s.artist)}${this.over ? " · " + s.year : ""}</small>`));
      if (pos >= 0) chip.appendChild(el("span", "kod-pos", String(pos + 1)));
      chip.onclick = () => this.add(s);
      pool.appendChild(chip);
    }
    // bieżący zestaw – oś czasu
    const slots = $("kodSlots");
    slots.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const s = this.row[i];
      const slot = el("div", "kod-slot" + (s ? " filled" : "") + (!s && i === this.row.length ? " next" : ""));
      slot.appendChild(el("span", "kod-num", String(i + 1)));
      if (s) {
        slot.style.setProperty("--h", (s.hue ?? 200) % 360);
        slot.appendChild(el("span", "kod-slot-t", `<b>${esc(s.title)}</b><small>${esc(splitArtists(s)[0] || s.artist)}</small>`));
        slot.appendChild(el("span", "kod-del", "✕"));
        slot.onclick = () => this.removeAt(i);
        slot.title = "Kliknij, żeby usunąć";
      } else slot.appendChild(el("span", "kod-slot-t", `<small>${i === this.row.length ? "wybierz piosenkę" : "puste"}</small>`));
      slots.appendChild(slot);
    }
    $("kodCheck").disabled = this.row.length !== 4 || this.over;
    $("kodPlay").hidden = this.over;
    // licznik prób
    $("kodDots").innerHTML = Array.from({ length: KOD_TRIES }, (_, i) => {
      const h = this.history[i];
      const cls = h ? (h.black === 4 ? "win" : "used") : (i === this.history.length && !this.over ? "now" : "");
      return `<i class="${cls}" title="Próba ${i + 1}"></i>`;
    }).join("");
    $("kodTries").textContent = this.over ? "" : `próba ${this.history.length + 1} z ${KOD_TRIES}`;
    // historia
    $("kodHistBox").hidden = !this.history.length;
    const hist = $("kodHistory");
    hist.innerHTML = "";
    [...this.history].reverse().forEach((h, k) => {
      const n = this.history.length - k;
      const li = el("li", "kod-h" + (h.black === 4 ? " win" : ""));
      li.appendChild(el("span", "kod-n", String(n)));
      const row = el("span", "kod-row" + (this.colors ? " kod-colored" : " kod-plain"));
      h.row.forEach((s, i) => row.appendChild(el("span", "kod-mark " + (this.colors ? "m-" + h.marks[i] : "m-plain"), esc(s.title))));
      li.appendChild(row);
      if (!this.colors) li.appendChild(el("span", "kod-pegs", this.pegs(h)));
      hist.appendChild(li);
    });
    $("kodLegend").innerHTML = this.colors
      ? '<span class="kod-mark m-g">dobre miejsce</span><span class="kod-mark m-y">złe miejsce</span><span class="kod-mark m-x">nie ma w kodzie</span>'
      : '<span><b>●</b> dobre miejsce</span><span><b>○</b> złe miejsce</span><span><b>·</b> nie ma w kodzie</span>' +
        '<span class="kod-note">Kropki nie mówią, której piosenki dotyczą – to trzeba wydedukować.</span>';
    const won = this.history.length && this.history[this.history.length - 1].black === 4;
    $("kodResult").hidden = !this.over;
    if (this.over) {
      $("kodResultTitle").textContent = won ? `🔓 Złamane w ${this.history.length}. próbie!` : "🔒 Koniec prób – oto kod";
      $("kodSolution").innerHTML = "";
      this.code.forEach((s, i) => {
        const li = el("li", "");
        li.appendChild(el("span", "kod-num", String(i + 1)));
        const c = cover(s, " sm"); c.appendChild(clipButton(s)); li.appendChild(c);
        const t = el("span", "kod-sol-t", `<b>${esc(s.title)}</b><small>${esc(s.artist)}</small>`);
        t.appendChild(amLink(s));
        li.appendChild(t);
        li.appendChild(el("span", "yr", String(s.year)));
        $("kodSolution").appendChild(li);
      });
      this.won = won;
    }
  },
};
const clipHtmlPlaceholder = () => '<span class="clip-ph"></span>';

$("kodCheck").onclick = () => Kod.check(false);
$("kodClear").onclick = () => { Kod.row = []; Kod.render(); };
$("kodDaily").onclick = () => Kod.start(true);
$("kodRandom").onclick = () => Kod.start(false);
$("kodMode").onchange = () => { Kod.mode = $("kodMode").value; store.set("scm-kod-mode", Kod.mode); Kod.start(false); };
$("kodEasy").onchange = () => { Kod.easy = $("kodEasy").checked; store.set("scm-kod-easy", Kod.easy); Kod.start(false); };
$("kodColors").onchange = () => { Kod.colors = $("kodColors").checked; store.set("scm-kod-colors", Kod.colors); Kod.render(); };
$("kodShare").onclick = () => shareText(`🔐 Muzyczny kod ${Kod.daily ? Kod.dateKey.split("-").reverse().join(".") : "(losowy)"} – ` +
  (Kod.won ? `złamany w ${Kod.history.length}/${KOD_TRIES}` : `nie złamany (${KOD_TRIES}/${KOD_TRIES})`) + "\n" +
  Kod.history.map(h => Kod.colors ? h.marks.map(m => ({ g: "🟩", y: "🟨", x: "⬜" })[m]).join("")
    : h.black === 4 ? "🟢🟢🟢🟢" : "⚫".repeat(h.black) + "⚪".repeat(h.white) + "▫️".repeat(4 - h.black - h.white)).join("\n") + "\n" +
  location.origin + location.pathname + "#kod");

/* ===================== Start ===================== */

const GAMES = { czworki: Czworki, detektyw: Detektyw, kod: Kod };

(function route() {
  const h = location.hash.slice(1);
  const det = h.match(/^detektyw-([A-Z]{4})-(\d)$/i);
  if (det) openScreen("detektyw", det[1].toUpperCase(), Math.min(+det[2] || 0, BROKERS.length - 1));
  else if (GAMES[h]) openScreen(h);
  else if (!h) showHub();
  // pozostałe adresy (#w-…, #pokoj-…, #rap, #diagnostyka…) obsługuje „Starsza czy młodsza?”
})();
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (GAMES[h] && currentScreen !== h) openScreen(h); });
syncMiniMute();
