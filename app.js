/**
 * KostHub OS — Client-Side Router & Application Core Engine
 * Clean URL Single Page Application (GitHub + Vercel Deployment)
 */

// GANTI DENGAN URL DEPLOYMENT GOOGLE APPS SCRIPT ANDA
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyfw7D6YyS-cJt7FT-Tv-so3D6M0JrrMTnSMCF39xak6SNVZtjt0Yo_MLdw-pLS34Z7_w/exec";

// Master URL Mapping
const ROUTES = {
  "/": "/home",
  "/home": "home",
  "/kamar-unit": "kamar-unit",
  "/penghuni": "penghuni",
  "/tagihan": "tagihan",
  "/buku-kas": "buku-kas",
  "/kwitansi": "kwitansi",
  "/login": "login"
};

const state = {
  token: localStorage.getItem("kosthub_token") || null,
  activeFilter: "ALL",
  searchKeyword: "",
  currentRoute: "/home",
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
  // Tangani path awal dari browser URL
  const initialPath = window.location.pathname || "/home";
  const urlParams = new URLSearchParams(window.location.search);
  const receiptToken = urlParams.get("token") || urlParams.get("t");

  if (receiptToken) {
    navigateTo(`/kwitansi?token=${receiptToken}`, false);
    loadPublicReceipt(receiptToken);
  } else {
    navigateTo(initialPath === "/" ? "/home" : initialPath, false);
  }

  // Set Default Date Inputs
  const todayStr = new Date().toISOString().split("T")[0];
  const dueDateInput = document.getElementById("billingDueDate");
  const entryDateInput = document.getElementById("onboardEntryDate");
  if (dueDateInput) dueDateInput.value = todayStr;
  if (entryDateInput) entryDateInput.value = todayStr;
});

// Event Listener tombol Back / Forward di Browser
window.addEventListener("popstate", (event) => {
  const path = (event.state && event.state.path) ? event.state.path : window.location.pathname;
  navigateTo(path, false);
});

// Navigasi Router Utama
function navigateTo(path, pushState = true) {
  const urlParts = path.split("?");
  const cleanPath = urlParts[0];
  const queryStr = urlParts[1] ? `?${urlParts[1]}` : "";

  // Auth Guard
  if (!state.token && cleanPath !== "/login" && cleanPath !== "/kwitansi") {
    navigateTo("/login", true);
    return;
  }

  if (state.token && cleanPath === "/login") {
    navigateTo("/home", true);
    return;
  }

  const targetView = ROUTES[cleanPath] || "home";
  state.currentRoute = cleanPath;

  if (pushState && window.location.pathname !== cleanPath) {
    window.history.pushState({ path: cleanPath }, "", `${cleanPath}${queryStr}`);
  }

  renderView(targetView);
}

// Render DOM View
function renderView(viewId) {
  // Sembunyikan semua kontainer view
  ["login", "home", "kamar-unit", "penghuni", "tagihan", "buku-kas", "kwitansi"].forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.add("hidden");
  });

  // Tampilkan View Aktif
  const activeEl = document.getElementById(`view-${viewId}`);
  if (activeEl) activeEl.classList.remove("hidden");

  // Kontrol Sidebar & Topbar (Sembunyikan di Login & Kwitansi)
  const sidebar = document.getElementById("appSidebar");
  const header = document.getElementById("appHeader");
  const bottomNav = document.getElementById("appBottomNav");

  if (viewId === "login" || viewId === "kwitansi") {
    if (sidebar) sidebar.classList.add("!hidden");
    if (header) header.classList.add("!hidden");
    if (bottomNav) bottomNav.classList.add("!hidden");
  } else {
    if (sidebar) sidebar.classList.remove("!hidden");
    if (header) header.classList.remove("!hidden");
    if (bottomNav) bottomNav.classList.remove("!hidden");
    updateNavStyles(viewId);
  }

  // Pemicu Fetch Sesuai Halaman
  if (viewId === "home") {
    fetchDashboardData();
  } else if (["kamar-unit", "penghuni", "tagihan", "buku-kas"].includes(viewId)) {
    loadMasterTabData();
  }
}

function updateNavStyles(activeRoute) {
  ["home", "kamar-unit", "penghuni", "tagihan", "buku-kas"].forEach(route => {
    const navD = document.getElementById(`nav-${route}`);
    const navM = document.getElementById(`bnav-${route}`);

    if (route === activeRoute) {
      if (navD) navD.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-brand-600 text-white transition-colors shadow-sm";
      if (navM) navM.className = "flex flex-col items-center gap-1 text-brand-600";
    } else {
      if (navD) navD.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors";
      if (navM) navM.className = "flex flex-col items-center gap-1 text-slate-500";
    }
  });
}

// ==================== AUTHENTICATION ====================
async function handleLogin() {
  const pinInput = document.getElementById("inputPin");
  const btnLogin = document.getElementById("btnLogin");
  const loginError = document.getElementById("loginError");
  const pin = pinInput.value.trim();

  if (pin.length < 4) {
    loginError.innerText = "Masukkan PIN minimal 4-6 digit.";
    loginError.classList.remove("hidden");
    return;
  }

  btnLogin.disabled = true;
  btnLogin.innerText = "Memverifikasi...";

  try {
    const res = await callApi("login", { pin: pin });
    if (res.status === "success") {
      state.token = res.data.token;
      localStorage.setItem("kosthub_token", state.token);
      showToast("Selamat datang di KostHub OS!", "success");
      navigateTo("/home");
    } else {
      loginError.innerText = res.message || "PIN tidak sesuai.";
      loginError.classList.remove("hidden");
    }
  } catch (err) {
    loginError.innerText = "Koneksi API gagal: " + err.message;
    loginError.classList.remove("hidden");
  } finally {
    btnLogin.disabled = false;
    btnLogin.innerText = "Masuk ke Sistem";
  }
}

function handleLogout() {
  localStorage.removeItem("kosthub_token");
  state.token = null;
  navigateTo("/login");
}

// ==================== API CLIENT GATEWAY ====================
async function callApi(action, payload = {}) {
  const requestBody = JSON.stringify({
    action: action,
    token: state.token,
    ...payload
  });

  const response = await fetch(GAS_API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: requestBody
  });

  if (!response.ok) throw new Error("HTTP Status " + response.status);
  return await response.json();
}

// ==================== DASHBOARD & DATA FETCH ====================
async function fetchDashboardData() {
  showToast("Menyinkronkan Google Sheets...", "info");
  try {
    const res = await callApi("getDashboardData");
    if (res.status === "success") {
      state.rooms = res.data.rooms || [];
      state.kpi = res.data.kpi || state.kpi;
      updateUI();
    }
  } catch (err) {
    showToast("Gagal memuat: " + err.message, "error");
  }
}

function updateUI() {
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
  renderDueTable();
}

function renderRoomMatrix() {
  const grid = document.getElementById("roomMatrixGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.rooms.filter(room => {
    const matchFilter =
      state.activeFilter === "ALL" ? true :
        state.activeFilter === "OCCUPIED" ? (room.status === "OCCUPIED" || room.status === "DUE_TOMORROW") :
          state.activeFilter === "OVERDUE" ? room.status === "OVERDUE" :
            state.activeFilter === "VACANT" ? room.status === "VACANT" : true;

    // Aman untuk tipe data Number, String, maupun null/undefined
    const roomNumberStr = String(room.number || "").toLowerCase();
    const tenantStr = String(room.tenant || "").toLowerCase();
    const keyword = String(state.searchKeyword || "").toLowerCase();

    const matchSearch = roomNumberStr.includes(keyword) || tenantStr.includes(keyword);

    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs font-semibold">Tidak ada unit kamar dalam filter ini.</div>`;
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
            <span class="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">Terisi • Lunas</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-800 text-sm">${room.tenant || 'Penghuni'}</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Sisa Periode:</span>
            <span class="font-mono text-slate-800">${room.remainingDays || 30} Hari</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          <button onclick="viewReceiptDirect('${room.id}')" class="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors">Kwitansi</button>
          <button onclick="openBillingModal('${room.id}')" class="flex-1 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 text-xs font-bold rounded-lg transition-colors">Tagih Baru</button>
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
            <span class="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-md">Menunggak</span>
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
          <button onclick="dispatchOverdueWhatsApp('${room.id}')" class="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1">
            <span>💬</span> Tagih WA
          </button>
          <button onclick="confirmPaymentDirect('${room.id}')" class="px-3 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg">Lunas</button>
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
            <span class="text-[11px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Tersedia</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-400 text-sm">Belum Ada Penghuni</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Tarif Sewa:</span>
            <span class="font-mono text-slate-800">${formatRupiah(room.price)}/bln</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-200 flex">
          <button onclick="openOnboardModal('${room.id}')" class="w-full py-1.5 bg-brand-100 hover:bg-brand-200 text-brand-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
            <span>+</span> Daftarkan Tamu
          </button>
        </div>
      `;
    }
    grid.appendChild(card);
  });
}

function renderDueTable() {
  const tbody = document.getElementById("dueTableBody");
  if (!tbody) return;
  const overdueOrDue = state.rooms.filter(r => r.status === "OVERDUE" || r.status === "DUE_TOMORROW");

  if (overdueOrDue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Semua tagihan sewa berstatus lunas.</td></tr>`;
    return;
  }

  tbody.innerHTML = overdueOrDue.map(r => `
    <tr>
      <td class="p-3 font-bold text-slate-900">${r.number}</td>
      <td class="p-3 text-slate-700">${r.tenant || '-'}</td>
      <td class="p-3 font-mono text-red-600 font-bold">Jatuh Tempo</td>
      <td class="p-3 font-mono font-bold text-slate-900">${formatRupiah(r.debt || r.price)}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-md ${r.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-brand-700'} font-bold text-[10px]">${r.status}</span></td>
      <td class="p-3 text-right">
        <button onclick="dispatchOverdueWhatsApp('${r.id}')" class="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-xs">WA Tagihan</button>
      </td>
    </tr>
  `).join("");
}

// ==================== MASTER TABLES FETCH ====================
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
      <td class="p-3 font-bold">${u[1]}</td>
      <td class="p-3">Lantai ${u[2]}</td>
      <td class="p-3">${u[3]}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(u[4])}</td>
      <td class="p-3 text-slate-500">${u[5]}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u[6] === 'OCCUPIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${u[6]}</span></td>
      <td class="p-3 text-right font-mono text-[11px] text-slate-400">${u[0]}</td>
    </tr>
  `).join("");
}

function renderMasterTenants(tenants) {
  const tbody = document.getElementById("tenantMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = tenants.map(t => `
    <tr>
      <td class="p-3 font-bold text-slate-900">${t[1]}</td>
      <td class="p-3 font-mono text-slate-600">${t[3]}</td>
      <td class="p-3">${t[5] ? new Date(t[5]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(t[7])}</td>
      <td class="p-3">${t[8] && t[8].startsWith('http') ? `<a href="${t[8]}" target="_blank" class="text-brand-600 font-bold underline">Lihat KTP</a>` : '<span class="text-slate-400">Tidak Ada</span>'}</td>
      <td class="p-3 text-right"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">${t[9]}</span></td>
    </tr>
  `).join("");
}

function renderMasterInvoices(invoices) {
  const tbody = document.getElementById("invoiceMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="p-3 font-mono font-bold">${inv[0]}</td>
      <td class="p-3">${inv[2]}</td>
      <td class="p-3">${inv[4]}</td>
      <td class="p-3 font-mono text-slate-500">${inv[5] ? new Date(inv[5]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-mono font-bold">${formatRupiah(inv[10])}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${inv[11] === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">${inv[11]}</span></td>
      <td class="p-3 text-right">
        <button onclick="navigateTo('/kwitansi?token=${inv[1]}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold">Kwitansi</button>
      </td>
    </tr>
  `).join("");
}

function renderMasterExpenses(expenses) {
  const tbody = document.getElementById("expenseTableBody");
  if (!tbody) return;
  tbody.innerHTML = expenses.map(x => `
    <tr>
      <td class="p-3 text-slate-600 font-sans">${x[1] ? new Date(x[1]).toLocaleDateString('id-ID') : '-'}</td>
      <td class="p-3 font-sans font-bold text-slate-700">${x[2]}</td>
      <td class="p-3 font-sans">${x[3]}</td>
      <td class="p-3 font-sans text-slate-500">${x[5]}</td>
      <td class="p-3 text-right font-bold text-red-600">${formatRupiah(x[4])}</td>
    </tr>
  `).join("");
}

// ==================== ASYNC ACTIONS & MODALS ====================
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
      const receiptUrl = `${window.location.origin}/kwitansi?token=${res.data.token}`;
      const message = `Halo Sdr/i *${room ? room.tenant : 'Penghuni'}*,\nBerikut rincian tagihan sewa *${room ? room.number : 'Kamar'}*:\n\n` +
        `• Periode: ${period}\n` +
        `• Sewa Pokok: ${formatRupiah(baseRent)}\n` +
        `• Listrik: ${kwh} kWh (${formatRupiah(utilityCost)})\n` +
        `• Iuran Sampah/Air: ${formatRupiah(addFee)}\n` +
        `-----------------------------------\n` +
        `*TOTAL TAGIHAN: ${formatRupiah(res.data.total)}*\n` +
        `Jatuh Tempo: ${dueDate}\n\n` +
        `Mohon transfer ke:\n*BCA 1234567890 a.n Hendra Wijaya*\n\n` +
        `Kwitansi Digital: ${receiptUrl}`;

      state.tempWaUrl = `https://wa.me/${(room && room.tenantPhone) ? room.tenantPhone.replace(/^0/, '62') : ''}?text=${encodeURIComponent(message)}`;
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
  const msg = `Halo Sdr/i *${room.tenant}*,\nKami menginformasikan tagihan sewa *${room.number}* sebesar *${formatRupiah(room.debt || room.price)}* saat ini telah jatuh tempo.\n\nMohon konfirmasi pelunasan transfer BCA 1234567890 a.n Hendra Wijaya. Terima kasih.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
}

async function confirmPaymentDirect(unitId) {
  if (!confirm("Konfirmasi bahwa sewa unit ini telah LUNAS diterima?")) return;
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

// ==================== ONBOARDING PENGHUNI ====================
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

// ==================== CATAT BUKU KAS ====================
function openExpenseModal() {
  openModal("modalExpense");
}

async function submitExpenseRecord() {
  const desc = document.getElementById("expenseDescription").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value) || 0;
  const category = document.getElementById("expenseCategory").value;

  if (!desc || amount <= 0) {
    alert("Harap isi keterangan dan nominal pengeluaran.");
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
      showToast("Pengeluaran kas tercatat!", "success");
      fetchDashboardData();
    }
  } catch (err) {
    alert("Gagal: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Transaksi Kas";
  }
}

// ==================== TAMBAH UNIT KAMAR ====================
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
    alert("Harap isi nomor kamar dan tarif sewa.");
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
    }
  } catch (e) {
    alert("Gagal menambah kamar: " + e.message);
  }
}

// ==================== KWITANSI ROUTE HANDLER ====================
function viewReceiptDirect(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  if (!room) return;

  document.getElementById("rcptInvId").innerText = `INV-202610-${room.id.replace('UNT-', '')}`;
  document.getElementById("rcptPaidDate").innerText = new Date().toISOString().split("T")[0];
  document.getElementById("rcptTenantName").innerText = room.tenant || "Penghuni";
  document.getElementById("rcptUnitNumber").innerText = room.number;
  document.getElementById("rcptTotalPaid").innerText = formatRupiah(room.price);

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

// ==================== HELPER UI ====================
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