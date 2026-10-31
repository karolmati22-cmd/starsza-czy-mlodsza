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
  for (const id of Object.values(SCREENS)) $(id).hidden = true;
  currentScreen = null;
}
function showHub() {
  hideAllScreens();
  stopTimer(); stopAudio();
  if (location.hash) history.replaceState(null, "", location.pathname);
  document.querySelectorAll(".overlay").forEach(o => o.classList.toggle("show", o.id === "hubOverlay"));
}
function openScreen(key) {
  hideAllScreens();
  stopTimer(); stopAudio();
  document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
  $(SCREENS[key]).hidden = false;
  currentScreen = key;
  history.replaceState(null, "", "#" + key);
  GAMES[key].open();
}
function openStarsza() {
  hideAllScreens();
  if (location.hash && !/^#(w-|pokoj-|diagnostyka)/.test(location.hash)) history.replaceState(null, "", location.pathname);
  showChallenge();
  document.querySelectorAll(".overlay").forEach(o => o.classList.toggle("show", o.id === "startOverlay"));
}

document.querySelectorAll("[data-game]").forEach(b => b.onclick = () => {
  const g = b.dataset.game;
  if (g === "starsza") openStarsza(); else openScreen(g);
});
document.querySelectorAll(".back-hub").forEach(b => b.onclick = showHub);
document.querySelectorAll(".mini-mute").forEach(b => b.onclick = () => { $("muteBtn").click(); syncMiniMute(); });
function syncMiniMute() { document.querySelectorAll(".mini-mute").forEach(b => b.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊"); }
$("muteBtn").addEventListener("click", syncMiniMute);

/* ===================== Gra 1: Muzyczne czwórki ===================== */

const COLOR_RE = /\b(biał|biel|czerw|zielon|niebiesk|czarn|złot|złoc|różow|bury|szar|żółt|srebr)/i;
const NAME_TITLES = ["Małgośka", "Baśka", "Nie płacz Ewka", "Peggy Brown", "Jenny", "Józek, nie daruję ci tej nocy", "Charlie, Charlie", "Michael Essien Birthday Party", "RiRi", "Janosik (feat. Golec uOrkiestra)", "Zizu", "Arahja", "Malibu Barbie", "Gaja"];
const PLACE_TITLES = ["Warszawa", "Berlin Zachodni", "Londyn 8:15", "Lloret de Mar", "CASABLANCA", "Mississippi w ogniu", "Sen o Warszawie", "Polska", "Polsko", "Nie pytaj o Polskę", "kyoto", "Madagaskar", "Fiji", "Złote Tarasy", "Boskie Buenos", "Cykady na Cykladach", "Krakowski spleen", "Puerto Bounce (feat. Vladimir Cauchemar)"];
const nameSet = new Set(NAME_TITLES), placeSet = new Set(PLACE_TITLES);

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
  groups.push({ kind: "theme", key: "color", label: "Kolor w tytule", level: 2, test: s => COLOR_RE.test(s.title) });
  groups.push({ kind: "theme", key: "name", label: "Imię lub ksywka w tytule", level: 2, test: s => nameSet.has(s.title) });
  groups.push({ kind: "theme", key: "place", label: "Miejsce w tytule", level: 2, test: s => placeSet.has(s.title) });
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
  const recipes = [["artist", "artist", "theme", "year"], ["artist", "artist", "artist", "year"], ["artist", "theme", "theme", "year"], ["artist", "artist", "theme", "theme"]];
  for (let attempt = 0; attempt < 60; attempt++) {
    const recipe = recipes[Math.floor(r() * recipes.length)];
    const pick = { artist: [...artists], theme: [...themes], year: [...years] };
    const chosen = [];
    for (const k of recipe) {
      const list = pick[k];
      if (!list.length) break;
      chosen.push(list.splice(Math.floor(r() * list.length), 1)[0]);
    }
    if (chosen.length < 4) continue;
    const chosenArtists = chosen.filter(g => g.kind === "artist").map(g => g.artist);
    const result = [];
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
        item.appendChild(el("span", "", `${esc(s.title)} <small>${esc(s.artist)} · ${s.year}</small>`));
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
  const people = artistsOf(s).map(personInfo);
  if (!people.length || people.some(p => !p)) return null;
  const voc = people.map(p => p.vocal).join("");
  return { female: voc.includes("K"), male: voc.includes("M"), band: people[0].band, multi: people.length > 1 };
}
for (const s of ALL_POLISH) s.traits = songTraits(s);
const DET_POOL = ALL_POLISH.filter(s => s.traits);

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

const Detektyw = {
  board: [], mySecret: null, cpuSecret: null, myLeft: null, cpuLeft: null, asked: new Set(), cpuAsked: new Set(),
  turn: "me", over: false, pending: null, hard: store.get("scm-det-hard", false), smart: store.get("scm-det-smart", false),

  open() { $("detHard").checked = this.hard; $("detSmart").checked = this.smart; this.start(); },
  start() {
    const r = Math.random;
    // 24 piosenki: mieszanka epok i wykonawców (bez powtórek wykonawcy)
    const picked = [];
    for (const s of shuffled(DET_POOL, r)) {
      if (picked.some(p => primaryOf(p) === primaryOf(s))) continue;
      picked.push(s);
      if (picked.length === 24) break;
    }
    this.board = picked;
    const two = shuffled(picked, r);
    this.mySecret = two[0]; this.cpuSecret = two[1];
    this.myLeft = new Set(picked); this.cpuLeft = new Set(picked);
    this.asked.clear(); this.cpuAsked.clear();
    this.turn = "me"; this.over = false; this.pending = null;
    $("detLog").innerHTML = "";
    this.log("🕵️ Komputer wylosował ukrytą piosenkę z planszy. Ty też masz swoją – zadawaj pytania i odgadnij jego piosenkę pierwszy!", "sys");
    prefetchIds(picked).catch(() => {});
    this.render();
  },
  log(html, cls) {
    const li = el("li", cls || "", html);
    $("detLog").prepend(li);
  },
  ask(i) {
    if (this.over || this.turn !== "me" || this.asked.has(i)) return;
    const Q = QUESTIONS[i];
    this.asked.add(i);
    const ans = Q.t(this.cpuSecret);
    for (const s of [...this.myLeft]) if (Q.t(s) !== ans) this.myLeft.delete(s);
    this.log(`Ty: <b>${esc(Q.q)}</b> → komputer: <b class="${ans ? "yes" : "no"}">${ans ? "TAK" : "NIE"}</b> · zostało Ci ${this.myLeft.size}`, "me");
    this.turn = "cpu";
    this.render();
    setTimeout(() => this.cpuTurn(), 1100);
  },
  cpuTurn() {
    if (this.over) return;
    const left = [...this.cpuLeft];
    if (left.length === 1) {
      const g = left[0];
      this.log(`Komputer strzela: <b>„${esc(g.title)}”</b>…`, "cpu");
      this.end(g === this.mySecret ? "cpu" : "me", g === this.mySecret ? "Komputer odgadł Twoją piosenkę." : "Komputer strzelił źle!");
      return;
    }
    const options = QUESTIONS.map((Q, i) => ({ i, Q, yes: left.filter(s => Q.t(s)).length }))
      .filter(o => !this.cpuAsked.has(o.i) && o.yes > 0 && o.yes < left.length);
    if (!options.length) {         // nie ma już rozróżniającego pytania – zgaduje losowo
      const g = left[Math.floor(Math.random() * left.length)];
      this.log(`Komputer strzela na ślepo: <b>„${esc(g.title)}”</b>…`, "cpu");
      this.end(g === this.mySecret ? "cpu" : "me", g === this.mySecret ? "Komputer miał szczęście." : "Komputer strzelił źle!");
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
    this.pending = null;
    this.log(`Ty strzelasz: <b>„${esc(s.title)}”</b>…`, "me");
    this.end(s === this.cpuSecret ? "me" : "cpu", s === this.cpuSecret ? "Trafiony strzał – to ukryta piosenka komputera!" : "To nie ta piosenka.");
  },
  end(winner, why) {
    this.over = true;
    stopClip();
    const st = store.get("scm-det-stats", { won: 0, lost: 0 });
    winner === "me" ? st.won++ : st.lost++;
    store.set("scm-det-stats", st);
    this.result = { winner, why, st };
    this.log(winner === "me" ? `🏆 Wygrywasz! ${esc(why)}` : `🤖 Wygrywa komputer. ${esc(why)}`, "sys");
    this.render();
  },
  render() {
    // Twoja ukryta piosenka
    const my = $("detMine");
    my.innerHTML = "";
    my.appendChild(clipButton(this.mySecret));
    my.appendChild(el("div", "", `<small>Twoja ukryta piosenka (komputer jej szuka)</small><b>${esc(this.mySecret.title)}</b> <span>${esc(this.mySecret.artist)} · ${this.mySecret.year}</span>`));
    $("detCpu").textContent = this.over ? "" : `🤖 Komputerowi zostało ${this.cpuLeft.size} kandydatów · Tobie ${this.myLeft.size}`;
    // plansza
    const grid = $("detGrid");
    grid.innerHTML = "";
    grid.classList.toggle("hard", this.hard);
    this.board.forEach((s, i) => {
      const out = !this.myLeft.has(s);
      const reveal = this.over && s === this.cpuSecret;
      const tile = el("div", "det-tile" + (out ? " out" : "") + (reveal ? " secret" : "") + (this.pending === s ? " sel" : ""));
      tile.appendChild(clipButton(s));
      tile.appendChild(el("div", "det-text", this.hard && !this.over ? `🎧 ${i + 1}` : `<b>${esc(s.title)}</b><small>${esc(s.artist)}${this.over ? " · " + s.year : ""}</small>`));
      tile.onclick = () => { if (!out) this.guess(s); };
      grid.appendChild(tile);
    });
    // pytania
    const qs = $("detQuestions");
    qs.innerHTML = "";
    QUESTIONS.forEach((Q, i) => {
      const b = el("button", "det-q", esc(Q.q));
      b.disabled = this.over || this.turn !== "me" || this.asked.has(i);
      b.onclick = () => this.ask(i);
      qs.appendChild(b);
    });
    $("detTurn").textContent = this.over ? "" : this.turn === "me" ? "Twoja kolej: zadaj pytanie albo kliknij piosenkę, żeby strzelić." : "🤖 Komputer myśli…";
    $("detConfirm").hidden = !this.pending;
    if (this.pending) $("detConfirmText").textContent = `Strzelasz: „${this.pending.title}”? Pomyłka = przegrana.`;
    $("detResult").hidden = !this.over;
    if (this.over && this.result) {
      $("detResultTitle").textContent = this.result.winner === "me" ? "🏆 Wygrywasz!" : "🤖 Wygrywa komputer";
      $("detResultInfo").textContent = `${this.result.why} Ukryta piosenka komputera: „${this.cpuSecret.title}” – ${this.cpuSecret.artist} (${this.cpuSecret.year}). Bilans: ${this.result.st.won} wygranych, ${this.result.st.lost} przegranych.`;
    }
  },
};

$("detYes").onclick = () => Detektyw.confirmGuess();
$("detNo").onclick = () => { Detektyw.pending = null; Detektyw.render(); };
$("detNew").onclick = $("detAgain").onclick = () => Detektyw.start();
$("detHard").onchange = () => { Detektyw.hard = $("detHard").checked; store.set("scm-det-hard", Detektyw.hard); Detektyw.render(); };
$("detSmart").onchange = () => { Detektyw.smart = $("detSmart").checked; store.set("scm-det-smart", Detektyw.smart); };

/* ===================== Gra 3: Muzyczny kod ===================== */

const KOD_TRIES = 8;
const Kod = {
  pool8: [], code: [], row: [], history: [], over: false, daily: true, dateKey: "",
  mode: store.get("scm-kod-mode", "pl"), easy: store.get("scm-kod-easy", true),

  open() {
    $("kodMode").innerHTML = Object.keys(MODES).filter(k => MODES[k].songs.length >= 10)
      .map(k => `<option value="${k}">${MODES[k].label}</option>`).join("");
    $("kodMode").value = this.mode;
    $("kodEasy").checked = this.easy;
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
    this.history.push({ row: [...this.row], black, white });
    this.row = [];
    if (black === 4 || this.history.length >= KOD_TRIES) this.over = true;
    if (this.daily) store.set("scm-kod-day", { date: this.dateKey, rows: this.history.map(h => h.row.map(s => this.pool8.indexOf(s))) });
    if (!silent) this.render();
  },
  pegs(h) { return "●".repeat(h.black) + "○".repeat(h.white) + "·".repeat(4 - h.black - h.white); },
  render() {
    // pula 8 piosenek
    const pool = $("kodPool");
    pool.innerHTML = "";
    for (const s of this.pool8) {
      const chip = el("div", "kod-chip" + (this.row.includes(s) ? " used" : ""));
      chip.appendChild(clipButton(s));
      chip.appendChild(el("div", "kod-text", `<b>${esc(s.title)}</b><small>${esc(s.artist)}${this.over ? " · " + s.year : ""}</small>`));
      chip.onclick = () => this.add(s);
      pool.appendChild(chip);
    }
    // bieżący wiersz
    const slots = $("kodSlots");
    slots.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const s = this.row[i];
      const slot = el("div", "kod-slot" + (s ? " filled" : ""), s ? `<b>${esc(s.title)}</b>` : `<span>${i === 0 ? "najstarsza" : i === 3 ? "najmłodsza" : i + 1}</span>`);
      if (s) slot.onclick = () => this.removeAt(i);
      slots.appendChild(slot);
    }
    $("kodCheck").disabled = this.row.length !== 4 || this.over;
    $("kodPlay").hidden = this.over;
    // historia
    const hist = $("kodHistory");
    hist.innerHTML = "";
    this.history.forEach((h, n) => {
      const li = el("li", "kod-h");
      li.appendChild(el("span", "kod-n", n + 1 + "."));
      li.appendChild(el("span", "kod-row", h.row.map(s => esc(s.title)).join(" → ")));
      li.appendChild(el("span", "kod-pegs", h.pegs = this.pegs(h)));
      hist.appendChild(li);
    });
    $("kodTries").textContent = this.over ? "" : `Próba ${this.history.length + 1} z ${KOD_TRIES}`;
    const won = this.history.length && this.history[this.history.length - 1].black === 4;
    $("kodResult").hidden = !this.over;
    if (this.over) {
      $("kodResultTitle").textContent = won ? `🔓 Złamane w ${this.history.length}. próbie!` : "🔒 Koniec prób";
      $("kodSolution").innerHTML = this.code.map(s => `<li>${clipHtmlPlaceholder()}<b>${esc(s.title)}</b> – ${esc(s.artist)} <span class="yr">${s.year}</span></li>`).join("");
      // przyciski odsłuchu przy rozwiązaniu
      $("kodSolution").querySelectorAll(".clip-ph").forEach((ph, i) => ph.replaceWith(clipButton(this.code[i])));
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
$("kodShare").onclick = () => shareText(`🔐 Muzyczny kod ${Kod.daily ? Kod.dateKey.split("-").reverse().join(".") : "(losowy)"} – ` +
  (Kod.won ? `złamany w ${Kod.history.length}/${KOD_TRIES}` : `nie złamany (${KOD_TRIES}/${KOD_TRIES})`) + "\n" +
  Kod.history.map(h => h.black === 4 ? "🟢🟢🟢🟢" : "⚫".repeat(h.black) + "⚪".repeat(h.white) + "▫️".repeat(4 - h.black - h.white)).join("\n") + "\n" +
  location.origin + location.pathname + "#kod");

/* ===================== Start ===================== */

const GAMES = { czworki: Czworki, detektyw: Detektyw, kod: Kod };

(function route() {
  const h = location.hash.slice(1);
  if (GAMES[h]) openScreen(h);
  else if (!h) showHub();
  // pozostałe adresy (#w-…, #pokoj-…, #rap, #diagnostyka…) obsługuje „Starsza czy młodsza?”
})();
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (GAMES[h] && currentScreen !== h) openScreen(h); });
syncMiniMute();
