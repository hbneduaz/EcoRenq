(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const nowISO = () => new Date().toISOString();
  const uid = () => "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleString("az-AZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.display = "none"), 2400);
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function simpleHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function clampInt(v, min, max) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    if (n < min || n > max) return null;
    return n;
  }

  // ---------- Keys ----------
  const LS = {
    users: "ecoreng_users_v3",
    session: "ecoreng_session_v3",
    events: "ecoreng_events_v3",
    joins: "ecoreng_joins_v3",
    subs: "ecoreng_subs_v3",
    rewards: "ecoreng_rewards_v3",
    red: "ecoreng_redemptions_v3",
    pin: "ecoreng_mod_pin_hash_v3",
  };

  // ---------- IndexedDB (videos) ----------
  const DB_NAME = "ecoreng_db_v3";
  const DB_VER = 1;
  const STORE = "videos"; // keyPath id, index bySubmission

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("bySubmission", "submissionId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutVideos(submissionId, videos) {
    const db = await idbOpen();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);

        for (const v of videos) {
          st.put({
            id: uid(),
            submissionId,
            slot: v.slot,
            name: v.name,
            type: v.type,
            size: v.size,
            durationSec: v.durationSec,
            blob: v.blob,
            createdAt: nowISO(),
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbGetVideos(submissionId) {
    const db = await idbOpen();
    try {
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const st = tx.objectStore(STORE);
        const idx = st.index("bySubmission");
        const req = idx.getAll(submissionId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      rows.sort((a, b) => (a.slot || 0) - (b.slot || 0));
      return rows;
    } finally {
      db.close();
    }
  }

  async function idbDeleteDB() {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("DB blocked"));
    });
  }

  // ---------- Seed ----------
  function seed() {
    if (!localStorage.getItem(LS.pin)) localStorage.setItem(LS.pin, simpleHash("1234"));
    if (!localStorage.getItem(LS.users)) save(LS.users, []);
    if (!localStorage.getItem(LS.joins)) save(LS.joins, []);
    if (!localStorage.getItem(LS.subs)) save(LS.subs, []);
    if (!localStorage.getItem(LS.red)) save(LS.red, []);

    if (!localStorage.getItem(LS.events)) {
      save(LS.events, [
        { id:"ev_baku_1", city:"Bakı", title:"Sahil parkı təmizliyi", when:"2026-02-20T10:00:00.000Z", place:"Bulvar", capacity:60, points:30, lat:40.3719, lng:49.8533 },
        { id:"ev_sumq_1", city:"Sumqayıt", title:"Dəniz kənarı plastik toplama", when:"2026-02-22T09:30:00.000Z", place:"Sahil", capacity:40, points:35, lat:40.5879, lng:49.6266 },
        { id:"ev_ganja_1", city:"Gəncə", title:"Park aksiyası", when:"2026-02-25T11:00:00.000Z", place:"Şəhər parkı", capacity:50, points:25, lat:40.6828, lng:46.3606 },
        { id:"ev_baku_2", city:"Bakı", title:"Meşə zolağı təmizliyi", when:"2026-02-28T10:00:00.000Z", place:"Xəzər rayonu", capacity:70, points:40, lat:40.4100, lng:50.0700 },
      ]);
    }

    if (!localStorage.getItem(LS.rewards)) {
      save(LS.rewards, [
        { id:"rw_1", title:"Restoran yemək çeki (10 AZN)", cost:120, stock:30, sponsor:"Restoran A" },
        { id:"rw_2", title:"Kofe kuponu", cost:60, stock:60, sponsor:"Kafe B" },
        { id:"rw_3", title:"EcoRəng köynək", cost:200, stock:15, sponsor:"EcoRəng" },
        { id:"rw_4", title:"Nahar menüsü (15 AZN)", cost:160, stock:20, sponsor:"Restoran C" },
        { id:"rw_5", title:"Muzey bileti", cost:90, stock:25, sponsor:"Muzey D" },
        { id:"rw_6", title:"Kitab kuponu", cost:110, stock:18, sponsor:"Kitab E" },
      ]);
    }
  }

  // ---------- Session/Auth ----------
  function session() { return load(LS.session, null); }
  function setSession(v) { save(LS.session, v); }
  function clearSession() { localStorage.removeItem(LS.session); }

  function users() { return load(LS.users, []); }
  function setUsers(v) { save(LS.users, v); }

  function me() {
    const s = session();
    if (!s?.userId) return null;
    return users().find(u => u.id === s.userId) || null;
  }

  function validAge(a) { return Number.isInteger(a) && a >= 16 && a <= 35; }

  function openAuth() {
    $("#authHint").textContent = "";
    $("#name").value = "";
    $("#age").value = "";
    $("#cityAuth").value = "";
    $("#login").value = "";
    $("#pass").value = "";
    $("#authModal").showModal();
  }
  function closeAuth() { $("#authModal").close(); }

  function renderUserbar() {
    const u = me();
    const box = $("#userbar");

    if (!u) {
      box.innerHTML = `
        <span class="badge">Status: <b>Qonaq</b></span>
        <button class="primary" id="openAuth" type="button">Giriş</button>
      `;
      $("#openAuth").addEventListener("click", openAuth);
      return;
    }

    box.innerHTML = `
      <span class="badge">Ad: <b>${esc(u.name)}</b></span>
      <span class="badge">Şəhər: <b>${esc(u.city)}</b></span>
      <span class="badge">Xal: <b>${u.points || 0}</b></span>
      <button class="ghost" id="logout" type="button">Çıxış</button>
    `;
    $("#logout").addEventListener("click", () => {
      clearSession();
      toast("Çıxış edildi");
      rerenderAll();
    });
  }

  function register() {
    const name = $("#name").value.trim();
    const age = clampInt($("#age").value, 16, 35);
    const city = $("#cityAuth").value.trim();
    const login = $("#login").value.trim();
    const pass = $("#pass").value;

    const hint = $("#authHint");

    if (!name || name.length < 2) return (hint.textContent = "Ad minimum 2 hərf olmalıdır.");
    if (!validAge(age)) return (hint.textContent = "Yaş 16–35 aralığında olmalıdır.");
    if (!city) return (hint.textContent = "Şəhər boş ola bilməz.");
    if (!login || login.length < 5) return (hint.textContent = "Telefon/email düzgün deyil.");
    if (!pass || pass.length < 4) return (hint.textContent = "Şifrə minimum 4 simvol olmalıdır.");

    const arr = users();
    if (arr.some(u => u.login.toLowerCase() === login.toLowerCase())) {
      return (hint.textContent = "Bu login artıq qeydiyyatdan keçib.");
    }

    const u = { id: uid(), name, age, city, login, passHash: simpleHash(pass), points: 0, createdAt: nowISO() };
    arr.push(u);
    setUsers(arr);
    setSession({ userId: u.id, at: nowISO() });
    toast("Qeydiyyat tamamlandı");
    closeAuth();
    rerenderAll();
  }

  function login() {
    const loginV = $("#login").value.trim();
    const pass = $("#pass").value;
    const hint = $("#authHint");

    if (!loginV || !pass) return (hint.textContent = "Login və şifrə yaz.");
    const arr = users();
    const u = arr.find(x => x.login.toLowerCase() === loginV.toLowerCase());
    if (!u) return (hint.textContent = "İstifadəçi tapılmadı.");
    if (u.passHash !== simpleHash(pass)) return (hint.textContent = "Şifrə yanlışdır.");
    if (!validAge(u.age)) return (hint.textContent = "Yaş uyğun deyil (16–35).");

    setSession({ userId: u.id, at: nowISO() });
    toast("Giriş edildi");
    closeAuth();
    rerenderAll();
  }

  // ---------- Tabs ----------
  function initTabs() {
    function setTab(name) {
      $$(".tab").forEach(b => b.classList.remove("active"));
      $(`.tab[data-tab="${name}"]`)?.classList.add("active");
      $$(".panel").forEach(p => p.classList.remove("show"));
      $(`#panel-${name}`)?.classList.add("show");
      location.hash = name;
    }

    $$(".tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    const initial = (location.hash || "#events").replace("#", "");
    if (["events","proof","rewards"].includes(initial)) setTab(initial);
  }

  // ---------- Data ----------
  function events() { return load(LS.events, []); }
  function joins() { return load(LS.joins, []); }
  function setJoins(v) { save(LS.joins, v); }
  function subs() { return load(LS.subs, []); }
  function setSubs(v) { save(LS.subs, v); }
  function rewards() { return load(LS.rewards, []); }
  function setRewards(v) { save(LS.rewards, v); }
  function reds() { return load(LS.red, []); }
  function setReds(v) { save(LS.red, v); }

  function joinedCount(eventId) { return joins().filter(j => j.eventId === eventId).length; }
  function isJoined(userId, eventId) { return joins().some(j => j.userId === userId && j.eventId === eventId); }

  // ---------- Network pill ----------
  function initNetwork() {
    const pill = $("#netPill");
    const set = () => (pill.textContent = navigator.onLine ? "Online" : "Offline");
    set();
    window.addEventListener("online", set);
    window.addEventListener("offline", set);
  }

  // ---------- Map ----------
  let map = null;
  let markerList = [];

  function initMap() {
    if (map) return;

    map = L.map("map", { zoomControl: true }).setView([40.4093, 49.8671], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
  }

  function clearMarkers() {
    markerList.forEach(m => m.remove());
    markerList = [];
  }

  function renderMarkers(evts) {
    initMap();
    clearMarkers();

    for (const e of evts) {
      const c = joinedCount(e.id);
      const popup = `
        <div style="min-width:220px">
          <div style="font-weight:900">${esc(e.title)}</div>
          <div style="opacity:.8;font-size:12px;margin-top:4px">
            ${esc(e.city)} • ${esc(e.place)} • ${fmt(e.when)}
          </div>
          <div style="opacity:.8;font-size:12px;margin-top:4px">
            +${e.points} xal • Qoşulan: ${c}/${e.capacity}
          </div>
          <div style="margin-top:8px">
            <button data-open="${e.id}"
              style="padding:8px 10px;border-radius:12px;border:1px solid rgba(238,247,240,.18);
              background:rgba(0,0,0,.18);color:#eef7f0;cursor:pointer">
              Listdə aç
            </button>
          </div>
        </div>
      `;

      const m = L.marker([e.lat, e.lng]).addTo(map).bindPopup(popup);
      markerList.push(m);

      m.on("popupopen", (ev) => {
        const node = ev.popup.getElement();
        const btn = node?.querySelector?.("[data-open]");
        if (btn) {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-open");
            scrollToEvent(id);
            m.closePopup();
          });
        }
      });
    }

    if (evts.length) {
      const bounds = L.latLngBounds(evts.map(x => [x.lat, x.lng]));
      map.fitBounds(bounds.pad(0.25));
    }
  }

  function scrollToEvent(eventId) {
    const el = document.querySelector(`[data-evt="${eventId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior:"smooth", block:"start" });
    el.style.outline = "2px solid rgba(46,125,50,.45)";
    setTimeout(() => (el.style.outline = "none"), 1200);
  }

  function locateMe() {
    if (!navigator.geolocation) return toast("Geolocation dəstəklənmir");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!map) initMap();
        map.setView([latitude, longitude], 14, { animate:true });
        toast("Yerin tapıldı");
      },
      () => toast("Yer icazəsi verilmədi")
    );
  }

  // ---------- Events UI ----------
  function renderCitySelect() {
    const sel = $("#city");
    const cityList = Array.from(new Set(events().map(e => e.city))).sort((a,b)=>a.localeCompare(b));
    const cur = sel.value || "all";

    sel.innerHTML =
      `<option value="all">Bütün şəhərlər</option>` +
      cityList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

    sel.value = cityList.includes(cur) ? cur : "all";
  }

  function filteredEvents() {
    const city = $("#city").value || "all";
    const q = ($("#q").value || "").trim().toLowerCase();
    return events().filter(e => {
      const cityOk = city === "all" || e.city === city;
      const text = `${e.title} ${e.place} ${e.city}`.toLowerCase();
      const qOk = !q || text.includes(q);
      return cityOk && qOk;
    });
  }

  function renderEvents() {
    const list = $("#eventsList");
    const u = me();
    const evts = filteredEvents();

    $("#eventsMeta").textContent = `${evts.length} aksiya`;

    list.innerHTML = evts.map(e => {
      const c = joinedCount(e.id);
      const full = c >= e.capacity;
      const joined = u ? isJoined(u.id, e.id) : false;
      const canJoin = !!u && !joined && !full;

      return `
        <div class="event" data-evt="${e.id}">
          <div class="eventTop">
            <div class="eventTitle">${esc(e.title)}</div>
            <div class="tags">
              <span class="tag">${esc(e.city)}</span>
              <span class="tag">${esc(e.place)}</span>
              <span class="tag ok">+${e.points} xal</span>
              <span class="tag warn">${fmt(e.when)}</span>
              <span class="tag ${full ? "bad" : ""}">Qoşulan: ${c}/${e.capacity}</span>
            </div>
          </div>

          <div class="rowBetween">
            <div class="muted tiny">Koordinat: ${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}</div>
            <div class="row">
              <button class="ghost" data-focus="${e.id}" type="button">Xəritədə</button>
              <button class="${canJoin ? "primary" : "ghost"}" data-join="${e.id}" type="button" ${canJoin ? "" : "disabled"}>
                ${joined ? "Qoşuldun" : (full ? "Doludur" : "Qoşul")}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-focus]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-focus");
        const e = events().find(x => x.id === id);
        if (!e) return;
        initMap();
        map.setView([e.lat, e.lng], 14, { animate:true });
      });
    });

    list.querySelectorAll("[data-join]").forEach(btn => {
      btn.addEventListener("click", () => {
        const u2 = me();
        if (!u2) {
          toast("Əvvəl giriş et");
          openAuth();
          return;
        }
        const id = btn.getAttribute("data-join");
        const e = events().find(x => x.id === id);
        if (!e) return;

        const c = joinedCount(id);
        if (c >= e.capacity) return toast("Aksiya doludur");
        if (isJoined(u2.id, id)) return;

        const j = joins();
        j.push({ id: uid(), userId: u2.id, eventId: id, at: nowISO() });
        setJoins(j);

        toast("Aksiyaya qoşuldun");
        renderEvents();
        renderMarkers(filteredEvents());
        renderProofSelect();
      });
    });

    renderMarkers(evts);
  }

  // ---------- Proof (temp slots) ----------
  const tempSlots = new Map(); // slot -> {blob,name,type,size,durationSec,url}

  function buildSlots() {
    const box = $("#slots");
    box.innerHTML = [1,2,3].map(i => `
      <div class="slot" data-slot="${i}">
        <div class="slotHead">
          <div class="slotTitle">Video ${i}</div>
          <div class="muted tiny" id="meta${i}">Boş</div>
        </div>

        <div>
          <input class="input" style="padding:10px" type="file" accept="video/mp4,video/*" data-file="${i}" />
          <div class="hint mt10" id="hint${i}"></div>
        </div>

        <video id="vid${i}" controls preload="metadata" style="display:none"></video>

        <div class="slotActions">
          <button class="ghost" data-clear="${i}" type="button" disabled>Sil</button>
        </div>
      </div>
    `).join("");

    box.querySelectorAll("[data-file]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const slot = parseInt(inp.getAttribute("data-file"), 10);
        const file = inp.files && inp.files[0] ? inp.files[0] : null;
        if (!file) return;

        const res = await validateVideo(file);
        if (!res.ok) {
          inp.value = "";
          $(`#hint${slot}`).textContent = res.msg;
          toast(res.msg);
          return;
        }

        $(`#hint${slot}`).textContent = "";
        const url = URL.createObjectURL(file);
        const durationSec = await readDuration(url);

        if (durationSec > 20.1) {
          URL.revokeObjectURL(url);
          inp.value = "";
          const msg = "Video 20 saniyədən uzun ola bilməz.";
          $(`#hint${slot}`).textContent = msg;
          toast(msg);
          return;
        }

        setSlot(slot, file, url, durationSec);
      });
    });

    box.querySelectorAll("[data-clear]").forEach(btn => {
      btn.addEventListener("click", () => clearSlot(parseInt(btn.getAttribute("data-clear"), 10)));
    });

    updateProofPills();
  }

  async function validateVideo(file) {
    const maxMB = 30;
    const mb = file.size / (1024 * 1024);
    if (!file.type.startsWith("video/")) return { ok:false, msg:"Yalnız video fayl seç." };
    if (mb > maxMB) return { ok:false, msg:`Video ${maxMB}MB-dan böyükdür.` };
    return { ok:true, msg:"" };
  }

  function readDuration(url) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => resolve(0);
    });
  }

  function setSlot(slot, file, url, durationSec) {
    const prev = tempSlots.get(slot);
    if (prev?.url) URL.revokeObjectURL(prev.url);

    tempSlots.set(slot, { blob:file, name:file.name, type:file.type, size:file.size, durationSec, url });

    const v = $(`#vid${slot}`);
    const meta = $(`#meta${slot}`);
    const clearBtn = $(`[data-clear="${slot}"]`);

    v.src = url;
    v.style.display = "block";
    meta.textContent = `${Math.round(durationSec)}s • ${(file.size/(1024*1024)).toFixed(1)}MB`;
    clearBtn.disabled = false;

    updateProofPills();
    toast(`Video ${slot} əlavə edildi`);
  }

  function clearSlot(slot) {
    const prev = tempSlots.get(slot);
    if (prev?.url) URL.revokeObjectURL(prev.url);
    tempSlots.delete(slot);

    const v = $(`#vid${slot}`);
    v.removeAttribute("src");
    v.load();
    v.style.display = "none";

    $(`#meta${slot}`).textContent = "Boş";
    $(`[data-clear="${slot}"]`).disabled = true;
    $(`input[data-file="${slot}"]`).value = "";
    $(`#hint${slot}`).textContent = "";

    updateProofPills();
  }

  function resetProof() {
    $("#note").value = "";
    [1,2,3].forEach(clearSlot);
    updateProofPills();
  }

  function updateProofPills() {
    const n = tempSlots.size;
    $("#slotCount").textContent = `${n}/3`;
    $("#proofPill").textContent = n === 0 ? "Hazır" : `${n}/3 video`;
  }

  function proofEligibleEvents(userId) {
    const j = joins().filter(x => x.userId === userId);
    const ev = events();
    return j.map(x => ev.find(e => e.id === x.eventId)).filter(Boolean);
  }

  function renderProofSelect() {
    const u = me();
    const sel = $("#proofEvent");
    const hint = $("#proofHint");

    if (!u) {
      sel.innerHTML = `<option value="">Giriş et</option>`;
      sel.disabled = true;
      hint.textContent = "Video göndərmək üçün giriş lazımdır.";
      return;
    }

    const allowed = proofEligibleEvents(u.id);
    if (!allowed.length) {
      sel.innerHTML = `<option value="">Əvvəl aksiyaya qoşul</option>`;
      sel.disabled = true;
      hint.textContent = "Aksiyalar bölməsindən ən az 1 aksiyaya qoşul.";
      return;
    }

    sel.disabled = false;
    sel.innerHTML = allowed.map(e => `<option value="${e.id}">${esc(e.title)} (${esc(e.city)})</option>`).join("");
    hint.textContent = "Aksiya seç → video əlavə et → göndər.";
  }

  function statusBadge(st) {
    if (st === "approved") return `<span class="status"><span class="dot ok"></span>approved</span>`;
    if (st === "rejected") return `<span class="status"><span class="dot bad"></span>rejected</span>`;
    return `<span class="status"><span class="dot warn"></span>pending</span>`;
  }

  async function submitProof() {
    const u = me();
    if (!u) {
      toast("Əvvəl giriş et");
      openAuth();
      return;
    }

    const eventId = $("#proofEvent").value;
    if (!eventId) return toast("Aksiya seç");
    if (!isJoined(u.id, eventId)) return toast("Bu aksiyaya qoşulmamısan");

    const vids = Array.from(tempSlots.entries())
      .map(([slot, v]) => ({ slot, blob:v.blob, name:v.name, type:v.type, size:v.size, durationSec:v.durationSec }))
      .sort((a,b) => a.slot - b.slot);

    if (!vids.length) return toast("Ən az 1 video əlavə et");
    if (vids.length > 3) return toast("Maksimum 3 video olar");

    const note = ($("#note").value || "").trim();

    const s = subs();
    const id = uid();
    const item = { id, userId: u.id, eventId, note, status:"pending", createdAt: nowISO(), videoCount: vids.length };
    s.unshift(item);
    setSubs(s);

    try {
      await idbPutVideos(id, vids);
    } catch {
      setSubs(subs().filter(x => x.id !== id));
      toast("IndexedDB xətası: video saxlanmadı");
      return;
    }

    toast("Göndəriş yaradıldı (pending)");
    resetProof();
    await renderMySubs();
    await renderModTable();
  }

  async function renderMySubs() {
    const u = me();
    const tb = $("#mySubs");
    const count = $("#mySubCount");

    if (!u) {
      tb.innerHTML = `<tr><td colspan="5" class="muted">Giriş et</td></tr>`;
      count.textContent = "0";
      return;
    }

    const my = subs().filter(x => x.userId === u.id);
    count.textContent = String(my.length);

    if (!my.length) {
      tb.innerHTML = `<tr><td colspan="5" class="muted">Hələ göndəriş yoxdur</td></tr>`;
      return;
    }

    const ev = events();
    tb.innerHTML = my.map(s => {
      const e = ev.find(x => x.id === s.eventId);
      return `
        <tr>
          <td>${fmt(s.createdAt)}</td>
          <td>${e ? esc(e.title) : "—"}</td>
          <td>${statusBadge(s.status)}</td>
          <td>${s.videoCount}</td>
          <td><button class="ghost" data-view="${s.id}" type="button">Bax</button></td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", async () => openView(btn.getAttribute("data-view")));
    });
  }

  // ---------- View submission videos ----------
  async function openView(subId) {
    const s = subs().find(x => x.id === subId);
    if (!s) return;

    const e = events().find(x => x.id === s.eventId);
    $("#viewMeta").textContent = `${e ? e.title : "—"} • ${fmt(s.createdAt)} • ${s.status}`;

    const box = $("#viewGrid");
    box.innerHTML = `<div class="muted tiny">Yüklənir...</div>`;

    const rows = await idbGetVideos(subId);
    if (!rows.length) {
      box.innerHTML = `<div class="muted">Video tapılmadı.</div>`;
      $("#viewModal").showModal();
      return;
    }

    const urls = rows.map(r => ({
      slot: r.slot,
      url: URL.createObjectURL(r.blob),
      name: r.name,
      duration: r.durationSec,
      mb: (r.size / (1024*1024)).toFixed(1)
    }));

    box.innerHTML = urls.map(v => `
      <div class="videoCard">
        <div class="k">Video ${v.slot} • ${Math.round(v.duration)}s • ${v.mb}MB</div>
        <video controls preload="metadata" src="${v.url}"></video>
      </div>
    `).join("");

    const modal = $("#viewModal");
    const cleanup = () => {
      urls.forEach(x => URL.revokeObjectURL(x.url));
      modal.removeEventListener("close", cleanup);
    };
    modal.addEventListener("close", cleanup);

    modal.showModal();
  }

  // ---------- Moderator ----------
  function pinHash() { return localStorage.getItem(LS.pin) || simpleHash("1234"); }
  function verifyPin(pin) { return simpleHash(pin) === pinHash(); }

  function openSettings() {
    $("#settingsHint").textContent = "";
    $("#oldPin").value = "";
    $("#newPin").value = "";
    $("#settingsModal").showModal();
  }
  function closeSettings() { $("#settingsModal").close(); }

  function savePin() {
    const oldP = ($("#oldPin").value || "").trim();
    const newP = ($("#newPin").value || "").trim();
    const hint = $("#settingsHint");

    if (!oldP || !newP) return (hint.textContent = "Köhnə və yeni PIN yaz.");
    if (!/^\d{4,8}$/.test(newP)) return (hint.textContent = "Yeni PIN 4–8 rəqəm olmalıdır.");
    if (!verifyPin(oldP)) return (hint.textContent = "Köhnə PIN yanlışdır.");

    localStorage.setItem(LS.pin, simpleHash(newP));
    hint.textContent = "PIN dəyişdi.";
    toast("PIN yeniləndi");
  }

  async function wipeAll() {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    try { await idbDeleteDB(); } catch {}
    toast("Data sıfırlandı");
    location.reload();
  }

  function openPinModal() {
    $("#pinHint").textContent = "";
    $("#pin").value = "";
    $("#pinModal").showModal();
  }
  function closePinModal() { $("#pinModal").close(); }

  async function pinEnter() {
    const pin = ($("#pin").value || "").trim();
    const hint = $("#pinHint");
    if (!pin) return (hint.textContent = "PIN yaz.");
    if (!verifyPin(pin)) return (hint.textContent = "PIN yanlışdır.");

    closePinModal();
    $("#modModal").showModal();
    await renderModTable();
  }

  function closeMod() { $("#modModal").close(); }

  function awardPoints(sub) {
    const e = events().find(x => x.id === sub.eventId);
    const base = e ? e.points : 20;
    const bonus = Math.min(10, Math.max(0, (sub.videoCount - 1) * 5));
    const total = base + bonus;

    const arr = users();
    const idx = arr.findIndex(u => u.id === sub.userId);
    if (idx < 0) return;

    arr[idx].points = (arr[idx].points || 0) + total;
    setUsers(arr);
  }

  async function renderModTable() {
    const tb = $("#modRows");
    const s = subs();
    const u = users();
    const ev = events();

    if (!s.length) {
      tb.innerHTML = `<tr><td colspan="6" class="muted">Göndəriş yoxdur</td></tr>`;
      return;
    }

    tb.innerHTML = s.map(x => {
      const uu = u.find(a => a.id === x.userId);
      const ee = ev.find(a => a.id === x.eventId);

      const actions = x.status === "pending"
        ? `
          <button class="primary" data-ap="${x.id}" type="button">Approve</button>
          <button class="ghost" data-rj="${x.id}" type="button">Reject</button>
        `
        : `<span class="muted tiny">Bitib</span>`;

      return `
        <tr>
          <td>${fmt(x.createdAt)}</td>
          <td>${uu ? esc(uu.name) : "—"}</td>
          <td>${ee ? esc(ee.title) : "—"}</td>
          <td>
            ${x.videoCount} video
            <div style="margin-top:8px">
              <button class="ghost" data-view="${x.id}" type="button">Bax</button>
            </div>
          </td>
          <td>${statusBadge(x.status)}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", async () => openView(btn.getAttribute("data-view")));
    });

    tb.querySelectorAll("[data-ap]").forEach(btn => {
      btn.addEventListener("click", () => modSet(btn.getAttribute("data-ap"), "approved"));
    });
    tb.querySelectorAll("[data-rj]").forEach(btn => {
      btn.addEventListener("click", () => modSet(btn.getAttribute("data-rj"), "rejected"));
    });
  }

  function modSet(subId, status) {
    const s = subs();
    const idx = s.findIndex(x => x.id === subId);
    if (idx < 0) return;
    if (s[idx].status !== "pending") return;

    s[idx].status = status;
    s[idx].moderatedAt = nowISO();
    setSubs(s);

    if (status === "approved") {
      awardPoints(s[idx]);
      toast("Approve: xal yazıldı");
    } else {
      toast("Reject edildi");
    }

    renderModTable();
    rerenderRewards();
    renderUserbar();
  }

  // ---------- Rewards / Leaderboard ----------
  function badgeForPoints(p) {
    if (p >= 500) return { t:"Eco Legend", m:"500+" };
    if (p >= 250) return { t:"Eco Pro", m:"250+" };
    if (p >= 120) return { t:"Eco Active", m:"120+" };
    if (p >= 60)  return { t:"Eco Start", m:"60+" };
    return { t:"New", m:"<60" };
  }

  function couponCode() {
    const a = Math.random().toString(36).slice(2, 6).toUpperCase();
    const b = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ER-${a}-${b}`;
  }

  function renderBoard() {
    const tb = $("#board");
    const list = users().slice().sort((a,b)=> (b.points||0)-(a.points||0)).slice(0,10);

    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="5" class="muted">İstifadəçi yoxdur</td></tr>`;
      return;
    }

    tb.innerHTML = list.map((u,i) => {
      const b = badgeForPoints(u.points || 0);
      return `
        <tr>
          <td>${i+1}</td>
          <td>${esc(u.name)}</td>
          <td>${esc(u.city)}</td>
          <td><b>${u.points || 0}</b></td>
          <td><span class="pill subtle"><b>${esc(b.m)}</b> ${esc(b.t)}</span></td>
        </tr>
      `;
    }).join("");
  }

  function renderRewards() {
    const u = me();
    const p = u ? (u.points || 0) : 0;

    $("#balance").textContent = String(p);
    const b = badgeForPoints(p);
    $("#badgeLine").textContent = `${b.t} • ${b.m}`;

    const grid = $("#rewardsGrid");
    const r = rewards();

    grid.innerHTML = r.map(x => {
      const can = u && p >= x.cost && x.stock > 0;
      return `
        <div class="reward">
          <div class="rewardTitle">${esc(x.title)}</div>
          <div class="rewardMeta">
            <div class="kpi">Sponsor: <b>${esc(x.sponsor)}</b></div>
            <div class="kpi">Stock: <b>${x.stock}</b></div>
          </div>
          <div class="rewardMeta">
            <div class="kpi">Qiymət: <b>${x.cost} xal</b></div>
            <button class="${can ? "primary" : "ghost"}" data-redeem="${x.id}" type="button" ${can ? "" : "disabled"}>Redeem</button>
          </div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll("[data-redeem]").forEach(btn => {
      btn.addEventListener("click", () => redeem(btn.getAttribute("data-redeem")));
    });

    renderBoard();
    renderCoupons();
  }

  function redeem(rewardId) {
    const u = me();
    if (!u) {
      toast("Əvvəl giriş et");
      openAuth();
      return;
    }

    const r = rewards();
    const idx = r.findIndex(x => x.id === rewardId);
    if (idx < 0) return;

    const cost = r[idx].cost;
    if (r[idx].stock <= 0) return toast("Stock yoxdur");

    const arr = users();
    const uidx = arr.findIndex(x => x.id === u.id);
    if (uidx < 0) return;

    if ((arr[uidx].points || 0) < cost) return toast("Xal çatmır");

    arr[uidx].points -= cost;
    setUsers(arr);

    r[idx].stock -= 1;
    setRewards(r);

    const red = reds();
    red.unshift({
      id: uid(),
      userId: u.id,
      rewardId,
      rewardTitle: r[idx].title,
      code: couponCode(),
      status: "active",
      createdAt: nowISO(),
    });
    setReds(red);

    toast("Kupon yaradıldı");
    rerenderRewards();
    renderUserbar();
  }

  function renderCoupons() {
    const u = me();
    const tb = $("#coupons");
    const cnt = $("#couponCount");

    if (!u) {
      tb.innerHTML = `<tr><td colspan="4" class="muted">Giriş et</td></tr>`;
      cnt.textContent = "0";
      return;
    }

    const list = reds().filter(x => x.userId === u.id);
    cnt.textContent = String(list.length);

    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="4" class="muted">Kupon yoxdur</td></tr>`;
      return;
    }

    tb.innerHTML = list.map(x => `
      <tr>
        <td>${fmt(x.createdAt)}</td>
        <td>${esc(x.rewardTitle)}</td>
        <td><code>${esc(x.code)}</code></td>
        <td>${esc(x.status)}</td>
      </tr>
    `).join("");
  }

  function rerenderRewards() {
    renderRewards();
    renderBoard();
  }

  // ---------- Rerender All ----------
  async function rerenderAll() {
    renderUserbar();
    renderCitySelect();
    renderEvents();
    renderProofSelect();
    buildSlots();
    await renderMySubs();
    renderRewards();
  }

  // ---------- Init ----------
  function init() {
    seed();
    initTabs();
    initNetwork();

    // events filter
    $("#q").addEventListener("input", () => {
      renderEvents();
    });
    $("#city").addEventListener("change", () => {
      renderEvents();
    });

    // map locate
    $("#btnLocate").addEventListener("click", locateMe);

    // auth
    $("#closeAuth").addEventListener("click", closeAuth);
    $("#btnRegister").addEventListener("click", register);
    $("#btnLogin").addEventListener("click", login);

    // settings
    $("#btnSettings").addEventListener("click", openSettings);
    $("#closeSettings").addEventListener("click", closeSettings);
    $("#savePin").addEventListener("click", savePin);
    $("#wipeAll").addEventListener("click", wipeAll);

    // moderator
    $("#btnModerator").addEventListener("click", openPinModal);
    $("#closePin").addEventListener("click", closePinModal);
    $("#pinCancel").addEventListener("click", closePinModal);
    $("#pinEnter").addEventListener("click", pinEnter);
    $("#closeMod").addEventListener("click", closeMod);

    // view
    $("#closeView").addEventListener("click", () => $("#viewModal").close());

    // proof
    $("#btnSubmit").addEventListener("click", submitProof);
    $("#btnReset").addEventListener("click", resetProof);

    rerenderAll();
  }

  init();
})();
