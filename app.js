/**
 * KostHub OS — Client-Side Multi-Tenant Core Engine & Router
 * SPA Architecture with HTML5 PushState for Vercel Deployment
 */

// GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyfw7D6YyS-cJt7FT-Tv-so3D6M0JrrMTnSMCF39xak6SNVZtjt0Yo_MLdw-pLS34Z7_w/exec";

// Master Route Table
const ROUTES = {
  "/": "landing",
  "/login": "login",
  "/home": "home",
  "/kamar-unit": "kamar-unit",
  "/penghuni": "penghuni",
  "/tagihan": "tagihan",
  "/buku-kas": "buku-kas",
  "/kelola-staff": "kelola-staff",
  "/profil": "profil",
  "/super-admin": "super-admin",
  "/kwitansi": "kwitansi"
};

// Global Application State
const state = {
  session: JSON.parse(localStorage.getItem("kosthub_session")) || null,
  activeFilter: "ALL",
  searchKeyword: "",
  currentRoute: "/",
  rooms: [],
  kpi: {
    totalUnits: 0,
    occupiedUnits: 0,
    incomeMonth: 0,
    overdueAmount: 0,
    overdueCount: 0,
    netCashflow: 0
  },
  tempKtpBase64: "",
  tempWaUrl: ""
};

// ==================== APP INITIALIZATION & ROUTER ====================
document.addEventListener("DOMContentLoaded", () => {
  const initialPath = window.location.pathname || "/";
  const urlParams = new URLSearchParams(window.location.search);
  const receiptToken = urlParams.get("token") || urlParams.get("t");

  if (receiptToken) {
    navigateTo(`/kwitansi?token=${receiptToken}`, false);
    loadPublicReceipt(receiptToken);
  } else {
    navigateTo(initialPath, false);
  }

  // Set default dates
  const todayStr = new Date().toISOString().split("T")[0];
  const dueDateInput = document.getElementById("billingDueDate");
  const entryDateInput = document.getElementById("onboardEntryDate");
  if (dueDateInput) dueDateInput.value = todayStr;
  if (entryDateInput) entryDateInput.value = todayStr;
});

// Browser PopState Listener (Back/Forward Buttons)
window.addEventListener("popstate", (event) => {
  const path = (event.state && event.state.path) ? event.state.path : window.location.pathname;
  navigateTo(path, false);
});

// Router Core Function
function navigateTo(path, pushState = true) {
  const cleanPath = path.split("?")[0];
  const queryStr = path.includes("?") ? `?${path.split("?")[1]}` : "";

  // Auth Guard
  const publicRoutes = ["/", "/login", "/kwitansi"];
  if (!state.session && !publicRoutes.includes(cleanPath)) {
    navigateTo("/login", true);
    return;
  }

  // Redirect to Dashboard if already logged in and visiting login or landing
  if (state.session && (cleanPath === "/login" || cleanPath === "/")) {
    if (state.session.role === "SUPER_ADMIN") {
      navigateTo("/super-admin", true);
    } else {
      navigateTo("/home", true);
    }
    return;
  }

  // RBAC Access Guard
  if (state.session) {
    if (cleanPath === "/super-admin" && state.session.role !== "SUPER_ADMIN") {
      showToast("Akses ditolak: Menu khusus Super Admin", "error");
      navigateTo("/home", true);
      return;
    }
    if ((cleanPath === "/kelola-staff" || cleanPath === "/buku-kas") && state.session.role === "STAFF") {
      showToast("Akses ditolak: Menu dibatasi untuk Owner", "error");
      navigateTo("/home", true);
      return;
    }
  }

  const targetView = ROUTES[cleanPath] || "home";
  state.currentRoute = cleanPath;

  if (pushState && window.location.pathname !== cleanPath) {
    window.history.pushState({ path: cleanPath }, "", `${cleanPath}${queryStr}`);
  }

  renderView(targetView);
}

// Render Selected DOM View
function renderView(viewId) {
  // Sembunyikan semua views
  const allViews = ["landing", "login", "home", "kamar-unit", "penghuni", "tagihan", "buku-kas", "kelola-staff", "profil", "super-admin", "kwitansi"];
  allViews.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add("hidden");
  });

  const authWrapper = document.getElementById("authenticatedAppWrapper");

  if (viewId === "landing" || viewId === "login" || viewId === "kwitansi") {
    if (authWrapper) authWrapper.classList.add("hidden");
    const activeEl = document.getElementById(`view-${viewId}`);
    if (activeEl) activeEl.classList.remove("hidden");
  } else {
    if (authWrapper) authWrapper.classList.remove("hidden");
    const activeEl = document.getElementById(`view-${viewId}`);
    if (activeEl) activeEl.classList.remove("hidden");
    updateSidebarNav(state.currentRoute);
    updateHeaderUI();
  }

  // Trigger Data Fetching Per Route
  if (viewId === "home") {
    fetchDashboardData();
  } else if (["kamar-unit", "penghuni", "tagihan", "buku-kas"].includes(viewId)) {
    loadMasterTabData();
  } else if (viewId === "kelola-staff") {
    loadStaffData();
  } else if (viewId === "profil") {
    loadProfileForm();
  } else if (viewId === "super-admin") {
    loadSuperAdminData();
  }
}

// ==================== NAVIGATION & RBAC UI ====================
function updateSidebarNav(activePath) {
  const navContainer = document.getElementById("sidebarNavLinks");
  const bottomNav = document.getElementById("appBottomNav");
  if (!navContainer || !state.session) return;

  const role = state.session.role;
  let links = [];

  if (role === "SUPER_ADMIN") {
    links = [
      { path: "/super-admin", icon: "🛡️", label: "Super Admin Console" },
      { path: "/profil", icon: "👤", label: "Profil Admin" }
    ];
  } else if (role === "STAFF") {
    links = [
      { path: "/home", icon: "⚡", label: "Cek Meteran & Kamar" },
      { path: "/kamar-unit", icon: "🚪", label: "Status Kamar" },
      { path: "/penghuni", icon: "👥", label: "Data Penghuni" },
      { path: "/profil", icon: "👤", label: "Profil Saya" }
    ];
  } else {
    // Role: OWNER
    links = [
      { path: "/home", icon: "📊", label: "Dashboard & Kamar" },
      { path: "/kamar-unit", icon: "🚪", label: "Kamar & Unit" },
      { path: "/penghuni", icon: "👥", label: "Penghuni" },
      { path: "/tagihan", icon: "📑", label: "Tagihan Bulanan" },
      { path: "/buku-kas", icon: "💰", label: "Buku Kas" },
      { path: "/kelola-staff", icon: "👥", label: "Kelola Staf Lapangan" },
      { path: "/profil", icon: "⚙️", label: "Pengaturan & Bank" }
    ];
  }

  // Render Desktop Sidebar
  navContainer.innerHTML = links.map(link => `
    <a href="${link.path}" onclick="event.preventDefault(); navigateTo('${link.path}');" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors ${activePath === link.path ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}">
      <span>${link.icon}</span> ${link.label}
    </a>
  `).join("");

  // Render Mobile Bottom Navigation
  if (bottomNav) {
    bottomNav.innerHTML = links.slice(0, 4).map(link => `
      <a href="${link.path}" onclick="event.preventDefault(); navigateTo('${link.path}');" class="flex flex-col items-center gap-1 ${activePath === link.path ? 'text-brand-600' : 'text-slate-500'}">
        <span class="text-base">${link.icon}</span> ${link.label.split(' ')[0]}
      </a>
    `).join("");
  }

  // Update Role Badges
  document.getElementById("sidebarRoleBadge").innerText = role;
}

function updateHeaderUI() {
  if (!state.session) return;
  const s = state.session;
  document.getElementById("headerPropertyName").innerText = s.property_name || "Graha Melati";
  document.getElementById("headerTierBadge").innerText = s.tier || "PRO";
  document.getElementById("userHeaderName").innerText = s.name || "User";
  document.getElementById("userHeaderRole").innerText = s.role;
  document.getElementById("userHeaderAvatar").innerText = (s.name || "U")[0].toUpperCase();

  // Sembunyikan tombol finansial jika role STAFF
  const btnKas = document.getElementById("btnHeaderCatatKas");
  const btnTagih = document.getElementById("btnHeaderBuatTagihan");
  const kpiBox = document.getElementById("ownerKpiContainer");
  const staffBanner = document.getElementById("staffInstructionBanner");

  if (s.role === "STAFF") {
    if (btnKas) btnKas.classList.add("hidden");
    if (btnTagih) btnTagih.classList.add("hidden");
    if (kpiBox) kpiBox.classList.add("hidden");
    if (staffBanner) staffBanner.classList.remove("hidden");
  } else {
    if (btnKas) btnKas.classList.remove("hidden");
    if (btnTagih) btnTagih.classList.remove("hidden");
    if (kpiBox) kpiBox.classList.remove("hidden");
    if (staffBanner) staffBanner.classList.add("hidden");
  }
}

// ==================== AUTHENTICATION & API ====================
async function callApi(action, payload = {}) {
  const token = state.session ? state.session.token : null;
  const ownerId = state.session ? state.session.owner_id : null;

  const requestBody = JSON.stringify({
    action: action,
    token: token,
    owner_id: ownerId,
    ...payload
  });

  const response = await fetch(GAS_API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: requestBody
  });

  if (!response.ok) throw new Error("Jaringan bermasalah (Status " + response.status + ")");
  return await response.json();
}

async function handleLogin() {
  const phone = document.getElementById("loginPhoneInput").value.trim();
  const pin = document.getElementById("loginPinInput").value.trim();
  const errorEl = document.getElementById("loginErrorMessage");
  const btn = document.getElementById("btnLoginSubmit");

  if (!phone || pin.length < 4) {
    errorEl.innerText = "Masukkan Nomor WhatsApp dan PIN valid.";
    errorEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.innerText = "Memverifikasi...";

  try {
    const res = await callApi("login", { phone: phone, pin: pin });
    if (res.status === "success") {
      state.session = res.data;
      localStorage.setItem("kosthub_session", JSON.stringify(res.data));
      showToast("Selamat datang di KostHub OS!", "success");

      if (res.data.role === "SUPER_ADMIN") {
        navigateTo("/super-admin");
      } else {
        navigateTo("/home");
      }
    } else {
      errorEl.innerText = res.message || "Kredensial tidak valid.";
      errorEl.classList.remove("hidden");
    }
  } catch (err) {
    errorEl.innerText = "Gagal terhubung ke Apps Script: " + err.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.innerText = "Masuk ke Dashboard";
  }
}

function handleLogout() {
  localStorage.removeItem("kosthub_session");
  state.session = null;
  navigateTo("/login");
}

// ==================== SELF-REGISTRATION CALON OWNER ====================
function openRegisterModal(tier = "PRO") {
  document.getElementById("regTierInput").value = tier;
  document.getElementById("regErrorText").classList.add("hidden");
  openModal("modalRegister");
}

async function submitRegisterOwner() {
  const tier = document.getElementById("regTierInput").value;
  const name = document.getElementById("regNameInput").value.trim();
  const phone = document.getElementById("regPhoneInput").value.trim();
  const propName = document.getElementById("regPropertyNameInput").value.trim();
  const pin = document.getElementById("regPinInput").value.trim();
  const errorEl = document.getElementById("regErrorText");
  const btn = document.getElementById("btnSubmitRegister");

  if (!name || !phone || !propName || pin.length < 4) {
    errorEl.innerText = "Lengkapi seluruh kolom dan PIN 4-6 angka.";
    errorEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.innerText = "Mendaftarkan...";

  try {
    const res = await callApi("registerOwner", {
      tier: tier,
      name: name,
      phone: phone,
      propertyName: propName,
      pin: pin
    });

    if (res.status === "success") {
      closeModal("modalRegister");
      showToast("Pendaftaran sukses! Silakan login.", "success");
      document.getElementById("loginPhoneInput").value = phone;
      document.getElementById("loginPinInput").value = pin;
      navigateTo("/login");
    } else {
      errorEl.innerText = res.message || "Gagal registrasi.";
      errorEl.classList.remove("hidden");
    }
  } catch (err) {
    errorEl.innerText = "Koneksi gagal: " + err.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.innerText = "🚀 Daftarkan & Aktifkan Akun";
  }
}

// ==================== DASHBOARD & ROOM MATRIX ====================
async function fetchDashboardData() {
  showToast("Menyinkronkan data Google Sheets...", "info");
  try {
    const res = await callApi("getDashboardData");
    if (res.status === "success") {
      state.rooms = res.data.rooms || [];
      state.kpi = res.data.kpi || state.kpi;
      updateDashboardUI();
    }
  } catch (err) {
    showToast("Gagal memuat: " + err.message, "error");
  }
}

function updateDashboardUI() {
  const occ = state.kpi.occupiedUnits || 0;
  const tot = state.kpi.totalUnits || 1;
  document.getElementById("kpiOccupancy").innerText = `${occ}/${tot}`;
  document.getElementById("sidebarOccupancyText").innerText = `${occ}/${tot}`;

  const pct = Math.round((occ / tot) * 100);
  document.getElementById("kpiOccupancyPercent").innerText = `${pct}% Terisi`;
  document.getElementById("sidebarOccupancyBar").style.width = `${pct}%`;

  document.getElementById("kpiIncome").innerText = formatRupiah(state.kpi.incomeMonth);
  document.getElementById("kpiOverdue").innerText = formatRupiah(state.kpi.overdueAmount);
  document.getElementById("kpiOverdueCount").innerText = `${state.kpi.overdueCount} Kamar Menunggak`;
  document.getElementById("kpiNetCash").innerText = formatRupiah(state.kpi.netCashflow);

  document.getElementById("count-all").innerText = state.rooms.length;
  document.getElementById("count-occupied").innerText = state.rooms.filter(r => r.status === "OCCUPIED" || r.status === "DUE_TOMORROW").length;
  document.getElementById("count-overdue").innerText = state.rooms.filter(r => r.status === "OVERDUE").length;
  document.getElementById("count-vacant").innerText = state.rooms.filter(r => r.status === "VACANT").length;

  renderRoomMatrix();
}

function renderRoomMatrix() {
  const grid = document.getElementById("roomMatrixGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const isStaff = state.session && state.session.role === "STAFF";

  const filtered = state.rooms.filter(room => {
    const matchFilter =
      state.activeFilter === "ALL" ? true :
        state.activeFilter === "OCCUPIED" ? (room.status === "OCCUPIED" || room.status === "DUE_TOMORROW") :
          state.activeFilter === "OVERDUE" ? room.status === "OVERDUE" :
            state.activeFilter === "VACANT" ? room.status === "VACANT" : true;

    const rNum = String(room.number || "").toLowerCase();
    const rTen = String(room.tenant || "").toLowerCase();
    const kw = String(state.searchKeyword || "").toLowerCase();

    return matchFilter && (rNum.includes(kw) || rTen.includes(kw));
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs font-semibold">Tidak ada kamar pada kategori ini.</div>`;
    return;
  }

  filtered.forEach(room => {
    const card = document.createElement("div");
    card.className = "p-4 rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between ";

    if (room.status === "OCCUPIED") {
      card.className += "bg-white border-slate-200";
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> ${room.number}
            </span>
            <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">Terisi • Lunas</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-800 text-sm">${room.tenant || 'Penghuni'}</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Stand Meter:</span>
            <span class="font-mono text-slate-800">${room.lastMeter} kWh</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          ${isStaff ? `
            <button onclick="promptStaffUpdateMeter('${room.id}', ${room.lastMeter})" class="w-full py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 text-xs font-bold rounded-lg">⚡ Update Meteran</button>
          ` : `
            <button onclick="viewReceiptDirect('${room.id}')" class="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">Kwitansi</button>
            <button onclick="openBillingModal('${room.id}')" class="flex-1 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 text-xs font-bold rounded-lg">Tagih Baru</button>
          `}
        </div>
      `;
    } else if (room.status === "OVERDUE") {
      card.className += "bg-red-50/40 border-red-200";
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span> ${room.number}
            </span>
            <span class="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-md">Menunggak</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-900 text-sm">${room.tenant || 'Penghuni'}</h4>
            <p class="text-[11px] text-slate-500">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-white rounded-xl border border-red-100 flex items-center justify-between text-xs font-semibold">
            <span class="text-red-500 font-bold">Tertunggak:</span>
            <span class="font-mono font-extrabold text-red-600">${formatRupiah(room.debt || room.price)}</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-red-100 flex gap-2">
          ${isStaff ? `
            <button onclick="promptStaffUpdateMeter('${room.id}', ${room.lastMeter})" class="w-full py-1.5 bg-brand-50 text-brand-600 text-xs font-bold rounded-lg">⚡ Update Meteran</button>
          ` : `
            <button onclick="dispatchOverdueWhatsApp('${room.id}')" class="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1">
              <span>💬</span> Tagih WA
            </button>
            <button onclick="confirmPaymentDirect('${room.id}')" class="px-3 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg">Lunas</button>
          `}
        </div>
      `;
    } else if (room.status === "VACANT") {
      card.className += "bg-slate-50/70 border-dashed border-slate-300";
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-slate-700 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span> ${room.number}
            </span>
            <span class="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Tersedia</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-400 text-sm">Siap Huni</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Tarif Sewa:</span>
            <span class="font-mono text-slate-800">${formatRupiah(room.price)}/bln</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-200 flex">
          <button onclick="openOnboardModal('${room.id}')" class="w-full py-1.5 bg-brand-100 hover:bg-brand-200 text-brand-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1">
            <span>+</span> Daftarkan Tamu
          </button>
        </div>
      `;
    }
    grid.appendChild(card);
  });
}

function promptStaffUpdateMeter(unitId, lastMeter) {
  const newMeter = prompt("Masukkan angka stand meteran kWh terbaru:", lastMeter + 50);
  if (!newMeter) return;
  callApi("updateMeterReading", { unitId: unitId, newMeter: Number(newMeter) })
    .then(res => {
      showToast("Meteran berhasil diperbarui!", "success");
      fetchDashboardData();
    })
    .catch(err => alert("Gagal update meteran: " + err.message));
}

// ==================== ASYNC: BILLING INVOICE ====================
function openBillingModal(unitId) {
  const room = state.rooms.find(r => r.id === unitId) || state.rooms[0];
  if (!room) return;
  document.getElementById("billingUnitId").value = room.id;
  document.getElementById("billingTenantId").value = room.tenantId || "";
  document.getElementById("billingModalTitle").innerText = `Buat Tagihan Sewa — ${room.number}`;
  document.getElementById("billingModalSubtitle").innerText = `Penyewa: ${room.tenant || 'Penghuni'}`;
  document.getElementById("billingBasePrice").value = room.price;
  document.getElementById("billingLastMeter").value = room.lastMeter || 1000;
  document.getElementById("billingNewMeter").value = (room.lastMeter || 1000) + 50;

  calculateBillingTotal();
  openModal("modalBilling");
}

function openQuickBillingModal() {
  const target = state.rooms.find(r => r.status === "OVERDUE" || r.status === "DUE_TOMORROW") || state.rooms[0];
  if (target) openBillingModal(target.id);
}

function calculateBillingTotal() {
  const basePrice = Number(document.getElementById("billingBasePrice").value) || 0;
  const lastMeter = Number(document.getElementById("billingLastMeter").value) || 0;
  const newMeter = Number(document.getElementById("billingNewMeter").value) || lastMeter;
  const addFee = Number(document.getElementById("billingAdditionalFee").value) || 0;
  const discount = Number(document.getElementById("billingDiscount").value) || 0;

  const kwh = Math.max(0, newMeter - lastMeter);
  const electricCost = kwh * 2000;
  const total = Math.max(0, basePrice + electricCost + addFee - discount);

  document.getElementById("billingKwhUsage").innerText = kwh;
  document.getElementById("billingElectricityCost").innerText = formatRupiah(electricCost);
  document.getElementById("billingTotalDisplay").innerText = formatRupiah(total);
}

async function submitBillingInvoice() {
  const btn = document.getElementById("btnSubmitBilling");
  btn.disabled = true;
  btn.innerText = "Menerbitkan...";

  const unitId = document.getElementById("billingUnitId").value;
  const tenantId = document.getElementById("billingTenantId").value;
  const room = state.rooms.find(r => r.id === unitId);
  const baseRent = document.getElementById("billingBasePrice").value;
  const lastMeter = Number(document.getElementById("billingLastMeter").value) || 0;
  const newMeter = Number(document.getElementById("billingNewMeter").value) || lastMeter;
  const kwh = Math.max(0, newMeter - lastMeter);
  const utilityCost = kwh * 2000;
  const addFee = document.getElementById("billingAdditionalFee").value;
  const discount = document.getElementById("billingDiscount").value;
  const period = document.getElementById("billingPeriod").value;
  const dueDate = document.getElementById("billingDueDate").value;

  try {
    const res = await callApi("createInvoice", {
      unitId: unitId,
      tenantId: tenantId,
      period: period,
      dueDate: dueDate,
      baseRent: baseRent,
      utilityCost: utilityCost,
      additionalFee: addFee,
      discount: discount,
      newMeter: newMeter
    });

    if (res.status === "success") {
      const bankInfo = (state.session && state.session.bank_info) ? state.session.bank_info : "BCA 1234567890 a.n Ratna Dewi";
      const receiptUrl = `${window.location.origin}/kwitansi?token=${res.data.token}`;
      const message = `Halo Sdr/i *${room ? room.tenant : 'Penghuni'}*,\nBerikut rincian tagihan sewa *${room ? room.number : 'Kamar'}*:\n\n` +
        `• Periode: ${period}\n` +
        `• Sewa Pokok: ${formatRupiah(baseRent)}\n` +
        `• Listrik: ${kwh} kWh (${formatRupiah(utilityCost)})\n` +
        `• Iuran Sampah/Air: ${formatRupiah(addFee)}\n` +
        `-----------------------------------\n` +
        `*TOTAL TAGIHAN: ${formatRupiah(res.data.total)}*\n` +
        `Jatuh Tempo: ${dueDate}\n\n` +
        `Mohon transfer ke rekening resmi:\n*${bankInfo}*\n\n` +
        `Kwitansi Digital: ${receiptUrl}`;

      const phone = (room && room.tenantPhone) ? room.tenantPhone.replace(/^0/, '62') : '';
      state.tempWaUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      document.getElementById("waMessagePreview").innerText = message;

      closeModal("modalBilling");
      openModal("modalWhatsApp");
      fetchDashboardData();
    }
  } catch (err) {
    alert("Koneksi gagal: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "💾 Terbitkan & Siapkan WA";
  }
}

function dispatchWhatsAppUrl() {
  if (state.tempWaUrl) window.open(state.tempWaUrl, "_blank");
}

function dispatchOverdueWhatsApp(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  if (!room) return;
  const phone = (room.tenantPhone || "").replace(/^0/, '62');
  const bankInfo = (state.session && state.session.bank_info) ? state.session.bank_info : "BCA 1234567890 a.n Ratna Dewi";
  const msg = `Halo Sdr/i *${room.tenant}*,\nKami menginformasikan tagihan sewa *${room.number}* sebesar *${formatRupiah(room.debt || room.price)}* saat ini telah jatuh tempo.\n\nMohon konfirmasi transfer ke rekening:\n*${bankInfo}*\nTerima kasih.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
}

async function confirmPaymentDirect(unitId) {
  if (!confirm("Konfirmasi bahwa tagihan kamar ini telah LUNAS diterima?")) return;
  try {
    const res = await callApi("confirmPayment", { unitId: unitId });
    if (res.status === "success") {
      showToast("Pembayaran diverifikasi lunas!", "success");
      fetchDashboardData();
    }
  } catch (e) {
    alert("Koneksi gagal: " + e.message);
  }
}

// ==================== ONBOARDING TENANT ====================
function openOnboardModal(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  document.getElementById("onboardUnitId").value = unitId;
  document.getElementById("onboardRoomTitle").innerText = `Registrasi Tamu Baru — ${room ? room.number : ''}`;
  state.tempKtpBase64 = "";
  document.getElementById("ktpPreviewContainer").classList.add("hidden");
  openModal("modalOnboard");
}

function previewKtpImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.tempKtpBase64 = e.target.result;
    document.getElementById("ktpImagePreview").src = e.target.result;
    document.getElementById("ktpPreviewContainer").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function submitOnboardingTenant() {
  const name = document.getElementById("onboardName").value.trim();
  const wa = document.getElementById("onboardWa").value.trim();
  const unitId = document.getElementById("onboardUnitId").value;
  const deposit = document.getElementById("onboardDeposit").value;
  const entryDate = document.getElementById("onboardEntryDate").value;

  if (!name || !wa) {
    alert("Nama dan No. WhatsApp wajib diisi.");
    return;
  }

  const btn = document.getElementById("btnSubmitOnboard");
  btn.disabled = true;
  btn.innerText = "Menyimpan ke Sheets...";

  try {
    const res = await callApi("registerTenant", {
      unitId: unitId,
      name: name,
      phone: wa,
      deposit: deposit,
      entryDate: entryDate,
      ktpBase64: state.tempKtpBase64
    });

    if (res.status === "success") {
      closeModal("modalOnboard");
      showToast("Penghuni berhasil disimpan!", "success");
      fetchDashboardData();
    }
  } catch (err) {
    alert("Gagal: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan & Aktifkan Kamar";
  }
}

// ==================== TAMBAH UNIT (DENGAN QUOTA GUARD) ====================
function openAddUnitModal() {
  openModal("modalAddUnit");
}

async function submitAddUnit() {
  const num = document.getElementById("unitNumberInput").value.trim();
  const floor = document.getElementById("unitFloorInput").value;
  const type = document.getElementById("unitTypeInput").value.trim();
  const price = document.getElementById("unitPriceInput").value;
  const meter = document.getElementById("unitMeterInput").value;

  if (!num || !price) {
    alert("Nomor kamar dan harga sewa wajib diisi.");
    return;
  }

  try {
    const res = await callApi("saveUnit", {
      number: num,
      floor: floor,
      type: type,
      price: price,
      meter: meter
    });

    if (res.status === "success") {
      closeModal("modalAddUnit");
      showToast("Unit kamar baru berhasil disimpan!", "success");
      fetchDashboardData();
      loadMasterTabData();
    } else {
      alert(res.message);
    }
  } catch (e) {
    alert("Gagal menambah kamar: " + e.message);
  }
}

// ==================== MASTER TAB SWITCH & LOADER ====================
async function loadMasterTabData() {
  try {
    const res = await callApi("getMasterData");
    if (res.status === "success") {
      renderMasterUnits(res.data.units || []);
      renderMasterTenants(res.data.tenants || []);
      renderMasterExpenses(res.data.expenses || []);
      renderMasterInvoices(res.data.invoices || []);
    }
  } catch (e) {
    console.error("Gagal muat master data:", e);
  }
}

function renderMasterUnits(units) {
  const tbody = document.getElementById("unitMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = units.map(u => `
    <tr>
      <td class="p-3 font-bold">${u[2]}</td>
      <td class="p-3">Lantai ${u[3]}</td>
      <td class="p-3">${u[4]}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(u[5])}</td>
      <td class="p-3 text-slate-500">${u[6] || '-'}</td>
      <td class="p-3 font-mono">${u[9] || 0} kWh</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u[7] === 'OCCUPIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${u[7]}</span></td>
      <td class="p-3 text-right font-mono text-[11px] text-slate-400">${u[0]}</td>
    </tr>
  `).join("");
}

function renderMasterTenants(tenants) {
  const tbody = document.getElementById("tenantMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = tenants.map(t => `
    <tr>
      <td class="p-3 font-bold text-slate-900">${t[2]}</td>
      <td class="p-3 font-mono text-slate-600">${t[4]}</td>
      <td class="p-3">${t[6] ? new Date(t[6]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(t[8])}</td>
      <td class="p-3">${t[9] && t[9].startsWith('http') ? `<a href="${t[9]}" target="_blank" class="text-brand-600 font-bold underline">Lihat KTP</a>` : '<span class="text-slate-400">Tidak Ada</span>'}</td>
      <td class="p-3 text-right"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">${t[10]}</span></td>
    </tr>
  `).join("");
}

function renderMasterInvoices(invoices) {
  const tbody = document.getElementById("invoiceMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="p-3 font-mono font-bold">${inv[0]}</td>
      <td class="p-3">${inv[3]}</td>
      <td class="p-3">${inv[5]}</td>
      <td class="p-3 font-mono text-slate-500">${inv[6] ? new Date(inv[6]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(inv[11])}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${inv[12] === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">${inv[12]}</span></td>
      <td class="p-3 text-right">
        <button onclick="navigateTo('/kwitansi?token=${inv[2]}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold">Kwitansi</button>
      </td>
    </tr>
  `).join("");
}

function renderMasterExpenses(expenses) {
  const tbody = document.getElementById("expenseTableBody");
  if (!tbody) return;
  tbody.innerHTML = expenses.map(x => `
    <tr>
      <td class="p-3 text-slate-600 font-sans">${x[2] ? new Date(x[2]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-sans font-bold text-slate-700">${x[3]}</td>
      <td class="p-3 font-sans">${x[4]}</td>
      <td class="p-3 font-sans text-slate-500">${x[6]}</td>
      <td class="p-3 text-right font-bold text-red-600">${formatRupiah(x[5])}</td>
    </tr>
  `).join("");
}

// ==================== CATAT PENGELUARAN KAS ====================
function openExpenseModal() {
  openModal("modalExpense");
}

async function submitExpenseRecord() {
  const desc = document.getElementById("expenseDescription").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value) || 0;
  const category = document.getElementById("expenseCategory").value;

  if (!desc || amount <= 0) {
    alert("Keterangan dan nominal pengeluaran wajib diisi.");
    return;
  }

  const btn = document.getElementById("btnSubmitExpense");
  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  try {
    const res = await callApi("recordExpense", {
      category: category,
      description: desc,
      amount: amount
    });

    if (res.status === "success") {
      closeModal("modalExpense");
      document.getElementById("expenseDescription").value = "";
      document.getElementById("expenseAmount").value = "";
      showToast("Pengeluaran kas tercatat di Google Sheets!", "success");
      fetchDashboardData();
    }
  } catch (err) {
    alert("Gagal: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Transaksi Kas";
  }
}

// ==================== KELOLA STAF LAPANGAN ====================
async function loadStaffData() {
  try {
    const res = await callApi("getStaffList");
    if (res.status === "success") {
      const container = document.getElementById("staffCardsContainer");
      const badge = document.getElementById("staffQuotaBadge");
      const staffList = res.data.staff || [];
      const quota = res.data.quota || 2;

      badge.innerText = `Kuota: ${staffList.length}/${quota}`;

      if (staffList.length === 0) {
        container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs font-semibold">Belum ada akun staf yang didaftarkan.</div>`;
        return;
      }

      container.innerHTML = staffList.map(st => `
        <div class="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <span class="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs">${st.name[0]}</span>
                ${st.name}
              </span>
              <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">${st.status}</span>
            </div>
            <div class="mt-4 space-y-1.5 text-xs text-slate-600">
              <p>WhatsApp: <b class="font-mono text-slate-800">${st.phone}</b></p>
              <p>Hak Akses: <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">Input Meteran & Cek Kamar</span></p>
            </div>
          </div>
          <div class="mt-5 pt-3 border-t border-slate-100 flex justify-end">
            <span class="text-[10px] text-slate-400 font-mono">ID: ${st.id}</span>
          </div>
        </div>
      `).join("");
    }
  } catch (e) {
    console.error("Gagal load staf:", e);
  }
}

function openAddStaffModal() {
  openModal("modalAddStaff");
}

async function submitAddStaff() {
  const name = document.getElementById("staffNameInput").value.trim();
  const phone = document.getElementById("staffPhoneInput").value.trim();
  const pin = document.getElementById("staffPinInput").value.trim();

  if (!name || !phone || pin.length < 4) {
    alert("Lengkapi seluruh data staf dan PIN 4-6 angka.");
    return;
  }

  const btn = document.getElementById("btnSubmitStaff");
  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  try {
    const res = await callApi("saveStaff", { name: name, phone: phone, pin: pin });
    if (res.status === "success") {
      closeModal("modalAddStaff");
      showToast("Akun staf berhasil dibuat!", "success");
      loadStaffData();
    } else {
      alert(res.message);
    }
  } catch (e) {
    alert("Gagal: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Akun Staf";
  }
}

// ==================== PENGATURAN PROFIL & REKENING ====================
function loadProfileForm() {
  if (!state.session) return;
  const s = state.session;
  document.getElementById("profNameInput").value = s.name || "";
  document.getElementById("profPhoneInput").value = s.phone_wa || "";
  document.getElementById("profPropertyNameInput").value = s.property_name || "";
  document.getElementById("profBankInfoInput").value = s.bank_info || "";
  document.getElementById("profNewPinInput").value = "";
  document.getElementById("profOldPinInput").value = "";

  const bankSec = document.getElementById("ownerBankSettingsSection");
  if (s.role !== "OWNER") {
    bankSec.classList.add("hidden");
  } else {
    bankSec.classList.remove("hidden");
  }
}

async function submitUpdateProfile() {
  const name = document.getElementById("profNameInput").value.trim();
  const phone = document.getElementById("profPhoneInput").value.trim();
  const propName = document.getElementById("profPropertyNameInput").value.trim();
  const bankInfo = document.getElementById("profBankInfoInput").value.trim();
  const newPin = document.getElementById("profNewPinInput").value.trim();
  const oldPin = document.getElementById("profOldPinInput").value.trim();

  if (!oldPin) {
    alert("PIN Lama wajib diisi untuk konfirmasi keamanan.");
    return;
  }

  const btn = document.getElementById("btnSubmitProfile");
  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  try {
    const res = await callApi("updateProfile", {
      name: name,
      phone: phone,
      propertyName: propName,
      bankInfo: bankInfo,
      newPin: newPin,
      oldPin: oldPin
    });

    if (res.status === "success") {
      state.session.name = name;
      state.session.phone_wa = phone;
      state.session.property_name = propName;
      state.session.bank_info = bankInfo;
      localStorage.setItem("kosthub_session", JSON.stringify(state.session));
      showToast("Profil berhasil diperbarui!", "success");
      updateHeaderUI();
      document.getElementById("profOldPinInput").value = "";
      document.getElementById("profNewPinInput").value = "";
    } else {
      alert(res.message);
    }
  } catch (e) {
    alert("Gagal update profil: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "💾 Simpan Perubahan Profil";
  }
}

// ==================== SUPER ADMIN CONSOLE ====================
async function loadSuperAdminData() {
  try {
    const res = await callApi("getAdminOverview");
    if (res.status === "success") {
      document.getElementById("admTotalOwners").innerText = `${res.data.totalOwners} Properti`;
      document.getElementById("admTotalUnits").innerText = `${res.data.totalUnits} Unit`;
      document.getElementById("admTotalMrr").innerText = formatRupiah(res.data.mrr);
      document.getElementById("admTopTier").innerText = res.data.topTier || "PRO";

      const tbody = document.getElementById("adminTenantTableBody");
      const list = res.data.tenants || [];
      tbody.innerHTML = list.map(t => `
        <tr>
          <td class="p-3 font-mono font-bold text-slate-500">${t.ownerId}</td>
          <td class="p-3 font-bold text-slate-900">${t.propertyName}</td>
          <td class="p-3">${t.ownerName} (${t.phone})</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded font-extrabold text-[10px] bg-indigo-50 text-brand-700">${t.tier}</span></td>
          <td class="p-3 font-mono">${t.unitCount} / ${t.quota}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">${t.status}</span></td>
          <td class="p-3 text-right">
            <button onclick="promptUpgradeTier('${t.ownerId}', '${t.tier}')" class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded text-xs font-bold">Ubah Paket</button>
          </td>
        </tr>
      `).join("");
    }
  } catch (e) {
    console.error("Gagal load admin overview:", e);
  }
}

function promptUpgradeTier(ownerId, currentTier) {
  const newTier = prompt(`Pilih paket baru untuk ${ownerId} (STARTER / PRO / ENTERPRISE):`, currentTier);
  if (!newTier) return;
  callApi("updateTenantTier", { targetOwnerId: ownerId, newTier: newTier.toUpperCase() })
    .then(res => {
      showToast("Lisensi tenant diperbarui!", "success");
      loadSuperAdminData();
    })
    .catch(err => alert("Gagal ubah paket: " + err.message));
}

// ==================== PUBLIC RECEIPT ROUTE ====================
function viewReceiptDirect(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  if (!room) return;

  document.getElementById("rcptInvId").innerText = `INV-202610-${room.id.replace('UNT-', '')}`;
  document.getElementById("rcptPaidDate").innerText = new Date().toISOString().split("T")[0];
  document.getElementById("rcptTenantName").innerText = room.tenant || "Penghuni";
  document.getElementById("rcptUnitNumber").innerText = room.number;
  document.getElementById("rcptTotalPaid").innerText = formatRupiah(room.price);
  document.getElementById("rcptPropName").innerText = (state.session && state.session.property_name) ? state.session.property_name : "GRAHA MELATI BATAM";
  document.getElementById("rcptOwnerSign").innerText = `( ${(state.session && state.session.name) ? state.session.name : 'Pengelola'} )`;

  document.getElementById("rcptTableItems").innerHTML = `
    <tr>
      <td class="py-2 text-slate-700">Sewa Kamar (${room.type})</td>
      <td class="py-2 text-right font-mono font-bold">${formatRupiah(room.price)}</td>
    </tr>
    <tr>
      <td class="py-2 text-slate-700">Iuran Fasilitas & Air</td>
      <td class="py-2 text-right font-mono font-bold">Termasuk</td>
    </tr>
  `;

  navigateTo(`/kwitansi?token=${room.id}`);
}

async function loadPublicReceipt(token) {
  try {
    const res = await fetch(`${GAS_API_URL}?action=getPublicReceipt&token=${token}`);
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("rcptInvId").innerText = json.data.invoiceId;
      document.getElementById("rcptTotalPaid").innerText = formatRupiah(json.data.total);
      document.getElementById("rcptPaidDate").innerText = json.data.dueDate || "-";
      document.getElementById("rcptTableItems").innerHTML = `
        <tr>
          <td class="py-2 text-slate-700">Sewa Periode: ${json.data.period}</td>
          <td class="py-2 text-right font-mono font-bold">${formatRupiah(json.data.total)}</td>
        </tr>
      `;
    }
  } catch (e) {
    console.error("Gagal load kwitansi:", e);
  }
}

// ==================== HELPER UTILITIES ====================
function setRoomFilter(filterType) {
  state.activeFilter = filterType;
  ["ALL", "OCCUPIED", "OVERDUE", "VACANT"].forEach(type => {
    const el = document.getElementById(`filter-pill-${type}`);
    if (el) {
      el.className = (type === filterType)
        ? "px-3.5 py-1.5 rounded-full bg-brand-600 text-white shrink-0 transition-colors"
        : "px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0 transition-colors";
    }
  });
  renderRoomMatrix();
}

function filterRooms() {
  state.searchKeyword = document.getElementById("searchRoomInput").value.toLowerCase();
  renderRoomMatrix();
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toastNotification");
  const msg = document.getElementById("toastMessage");
  const icon = document.getElementById("toastIcon");

  msg.innerText = message;
  icon.innerText = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  toast.classList.remove("translate-y-[-100px]", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    toast.classList.add("translate-y-[-100px]", "opacity-0");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 3000);
}

function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}