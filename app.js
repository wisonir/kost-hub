/**
 * KostHub OS — Client-Side Application Core Engine (PWA)
 * Decoupled Architecture for GitHub + Vercel Deployment
 */

// ==================== CONFIGURATION ====================
// Gantilah URL di bawah ini dengan deployment URL Web App Google Apps Script Anda
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyfw7D6YyS-cJt7FT-Tv-so3D6M0JrrMTnSMCF39xak6SNVZtjt0Yo_MLdw-pLS34Z7_w/exec";

// Global Application State
const state = {
  token: localStorage.getItem("kosthub_token") || null,
  activeFilter: "ALL",
  searchKeyword: "",
  activeTab: "dashboard",
  rooms: [],
  tenants: [],
  invoices: [],
  expenses: [],
  kpi: {
    totalUnits: 20,
    occupiedUnits: 18,
    incomeMonth: 27500000,
    overdueAmount: 3200000,
    overdueCount: 2,
    netCashflow: 21450000
  },
  tempWaUrl: ""
};

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  
  // Set default dates
  const todayStr = new Date().toISOString().split("T")[0];
  const dueDateInput = document.getElementById("billingDueDate");
  const entryDateInput = document.getElementById("onboardEntryDate");
  if (dueDateInput) dueDateInput.value = todayStr;
  if (entryDateInput) entryDateInput.value = todayStr;

  // Handle URL parameters for public receipt routing
  const urlParams = new URLSearchParams(window.location.search);
  const receiptToken = urlParams.get("token") || urlParams.get("t");
  if (receiptToken) {
    loadPublicReceipt(receiptToken);
  }
});

// ==================== AUTHENTICATION ====================
function checkSession() {
  const loginModal = document.getElementById("loginModal");
  if (!state.token) {
    loginModal.classList.remove("hidden");
  } else {
    loginModal.classList.add("hidden");
    fetchDashboardData();
  }
}

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
      document.getElementById("loginModal").classList.add("hidden");
      showToast("Selamat datang di KostHub OS!", "success");
      fetchDashboardData();
    } else {
      loginError.innerText = res.message || "PIN tidak sesuai.";
      loginError.classList.remove("hidden");
    }
  } catch (err) {
    // Demo Fallback Mode jika API GAS belum di-deploy
    if (pin === "123456") {
      state.token = "demo_token_authenticated";
      localStorage.setItem("kosthub_token", state.token);
      document.getElementById("loginModal").classList.add("hidden");
      showToast("Mode Demo Aktif", "info");
      renderMockData();
    } else {
      loginError.innerText = "Gagal menghubungi server GAS. Cek koneksi.";
      loginError.classList.remove("hidden");
    }
  } finally {
    btnLogin.disabled = false;
    btnLogin.innerText = "Masuk ke Dashboard";
  }
}

function handleLogout() {
  localStorage.removeItem("kosthub_token");
  state.token = null;
  location.reload();
}

// ==================== API CLIENT GATEWAY ====================
async function callApi(action, payload = {}) {
  // CORS Bypass: Mengirim JSON stringify dengan Content-Type: text/plain
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

  if (!response.ok) throw new Error("Network response was not ok");
  return await response.json();
}

// ==================== DATA FETCHING ====================
async function fetchDashboardData() {
  showToast("Menyinkronkan data properti...", "info");
  try {
    const res = await callApi("getDashboardData");
    if (res.status === "success") {
      state.rooms = res.data.rooms || [];
      state.tenants = res.data.tenants || [];
      state.invoices = res.data.invoices || [];
      state.kpi = res.data.kpi || state.kpi;
      updateUI();
    }
  } catch (err) {
    renderMockData();
  }
}

// Mock Data Renderer untuk Pratinjau Instan
function renderMockData() {
  state.rooms = [
    { id: "UNT-101", number: "Kamar 101", floor: 1, type: "Standard AC", price: 1500000, status: "OCCUPIED", tenant: "Dimas Pratama", remainingDays: 22, overdueDays: 0, debt: 0, lastMeter: 1420 },
    { id: "UNT-102", number: "Kamar 102", floor: 1, type: "Standard Non-AC", price: 1100000, status: "OVERDUE", tenant: "Budi Santoso", remainingDays: 0, overdueDays: 4, debt: 1600000, lastMeter: 980 },
    { id: "UNT-103", number: "Kamar 103", floor: 1, type: "Deluxe VIP", price: 1750000, status: "DUE_TOMORROW", tenant: "Anisa Rahmawati", remainingDays: 1, overdueDays: 0, debt: 0, lastMeter: 2150 },
    { id: "UNT-104", number: "Kamar 104", floor: 1, type: "Deluxe AC + KM Dalam", price: 1500000, status: "VACANT", tenant: null, remainingDays: 0, overdueDays: 0, debt: 0, lastMeter: 840 },
    { id: "UNT-105", number: "Kamar 105", floor: 1, type: "Standard AC", price: 1500000, status: "OCCUPIED", tenant: "Reza Mahendra", remainingDays: 18, overdueDays: 0, debt: 0, lastMeter: 1310 },
    { id: "UNT-201", number: "Kamar 201", floor: 2, type: "Deluxe Balcony", price: 1600000, status: "OVERDUE", tenant: "Fajar Nugraha", remainingDays: 0, overdueDays: 2, debt: 1600000, lastMeter: 1120 },
    { id: "UNT-202", number: "Kamar 202", floor: 2, type: "Standard Room", price: 1200000, status: "MAINTENANCE", tenant: null, remainingDays: 0, overdueDays: 0, debt: 0, lastMeter: 500 },
    { id: "UNT-203", number: "Kamar 203", floor: 2, type: "Deluxe Plus", price: 1550000, status: "OCCUPIED", tenant: "Siti Nurhaliza", remainingDays: 29, overdueDays: 0, debt: 0, lastMeter: 1780 }
  ];
  updateUI();
}

// ==================== UI RENDERING ====================
function updateUI() {
  renderKpiCards();
  renderRoomMatrix();
  renderDueTable();
}

function renderKpiCards() {
  document.getElementById("kpiOccupancy").innerText = `${state.kpi.occupiedUnits}/${state.kpi.totalUnits}`;
  document.getElementById("sidebarOccupancyText").innerText = `${state.kpi.occupiedUnits}/${state.kpi.totalUnits}`;
  const pct = Math.round((state.kpi.occupiedUnits / state.kpi.totalUnits) * 100);
  document.getElementById("kpiOccupancyPercent").innerText = `${pct}% Terisi`;
  document.getElementById("sidebarOccupancyBar").style.width = `${pct}%`;

  document.getElementById("kpiIncome").innerText = formatRupiah(state.kpi.incomeMonth);
  document.getElementById("kpiOverdue").innerText = formatRupiah(state.kpi.overdueAmount);
  document.getElementById("kpiOverdueCount").innerText = `${state.kpi.overdueCount} Kamar Menunggak`;
  document.getElementById("kpiNetCash").innerText = formatRupiah(state.kpi.netCashflow);

  // Update Counters on Filter Pills
  document.getElementById("count-all").innerText = state.rooms.length;
  document.getElementById("count-occupied").innerText = state.rooms.filter(r => r.status === "OCCUPIED" || r.status === "DUE_TOMORROW").length;
  document.getElementById("count-overdue").innerText = state.rooms.filter(r => r.status === "OVERDUE").length;
  document.getElementById("count-vacant").innerText = state.rooms.filter(r => r.status === "VACANT").length;
}

function renderRoomMatrix() {
  const grid = document.getElementById("roomMatrixGrid");
  grid.innerHTML = "";

  const filtered = state.rooms.filter(room => {
    const matchFilter = 
      state.activeFilter === "ALL" ? true :
      state.activeFilter === "OCCUPIED" ? (room.status === "OCCUPIED" || room.status === "DUE_TOMORROW") :
      state.activeFilter === "OVERDUE" ? room.status === "OVERDUE" :
      state.activeFilter === "VACANT" ? room.status === "VACANT" : true;

    const matchSearch = 
      room.number.toLowerCase().includes(state.searchKeyword) ||
      (room.tenant && room.tenant.toLowerCase().includes(state.searchKeyword));

    return matchFilter && matchSearch;
  });

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
            <h4 class="font-bold text-slate-800 text-sm">${room.tenant}</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Sisa Periode:</span>
            <span class="font-mono text-slate-800">${room.remainingDays} Hari Lagi</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          <button onclick="viewReceiptDirect('${room.id}')" class="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors">Kwitansi</button>
          <button onclick="openBillingModal('${room.id}')" class="flex-1 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 text-xs font-bold rounded-lg transition-colors">Detail</button>
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
            <span class="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-md">Menunggak ${room.overdueDays} Hari</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-900 text-sm">${room.tenant}</h4>
            <p class="text-[11px] text-slate-500">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-white rounded-xl border border-red-100 flex items-center justify-between text-xs font-semibold">
            <span class="text-red-500 font-bold">Tertunggak:</span>
            <span class="font-mono font-extrabold text-red-600">${formatRupiah(room.debt)}</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-red-100 flex gap-2">
          <button onclick="dispatchOverdueWhatsApp('${room.id}')" class="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1">
            <span>💬</span> Tagih WA
          </button>
          <button onclick="openBillingModal('${room.id}')" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg">Detail</button>
        </div>
      `;
    } else if (room.status === "DUE_TOMORROW") {
      card.className += "bg-white border-slate-200";
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> ${room.number}
            </span>
            <span class="text-[11px] font-bold bg-indigo-50 text-brand-600 px-2 py-0.5 rounded-md">Tempo Besok</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-800 text-sm">${room.tenant}</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Jatuh Tempo:</span>
            <span class="font-mono text-slate-800">10 Okt 2026</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex">
          <button onclick="openBillingModal('${room.id}')" class="w-full py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5">
            <span>📑</span> Buat Tagihan
          </button>
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
            <span class="text-[11px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Tersedia Siap Huni</span>
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
    } else if (room.status === "MAINTENANCE") {
      card.className += "bg-slate-100/60 border-slate-200";
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-slate-700 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-500"></span> ${room.number}
            </span>
            <span class="text-[11px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Perbaikan / Cat</span>
          </div>
          <div class="mt-2.5">
            <h4 class="font-bold text-slate-600 text-sm">Maintenance Unit</h4>
            <p class="text-[11px] text-slate-400">Lantai ${room.floor} • ${room.type}</p>
          </div>
          <div class="mt-3 py-1.5 px-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-400">Estimasi Siap:</span>
            <span class="font-mono text-slate-800">12 Okt 2026</span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-200 flex">
          <button onclick="setRoomReady('${room.id}')" class="w-full py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg">Setel Siap Huni</button>
        </div>
      `;
    }

    grid.appendChild(card);
  });
}

function renderDueTable() {
  const tbody = document.getElementById("dueTableBody");
  tbody.innerHTML = `
    <tr>
      <td class="p-3 font-bold text-slate-900">Kamar 102</td>
      <td class="p-3 text-slate-700">Budi Santoso</td>
      <td class="p-3 font-mono text-red-600 font-bold">05 Okt 2026</td>
      <td class="p-3 font-mono font-bold text-slate-900">Rp 1.600.000</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-red-100 text-red-700 font-bold text-[10px]">OVERDUE</span></td>
      <td class="p-3 text-right">
        <button onclick="dispatchOverdueWhatsApp('UNT-102')" class="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-xs">WA Tagihan</button>
      </td>
    </tr>
    <tr>
      <td class="p-3 font-bold text-slate-900">Kamar 103</td>
      <td class="p-3 text-slate-700">Anisa Rahmawati</td>
      <td class="p-3 font-mono text-indigo-600 font-bold">10 Okt 2026</td>
      <td class="p-3 font-mono font-bold text-slate-900">Rp 1.750.000</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-indigo-100 text-brand-700 font-bold text-[10px]">PENDING</span></td>
      <td class="p-3 text-right">
        <button onclick="openBillingModal('UNT-103')" class="px-3 py-1 bg-brand-600 text-white rounded-lg font-bold text-xs">Buat Tagihan</button>
      </td>
    </tr>
  `;
}

// ==================== MODAL & BILLING ACTIONS ====================
function openBillingModal(unitId) {
  const room = state.rooms.find(r => r.id === unitId) || state.rooms[0];
  document.getElementById("billingUnitId").value = room.id;
  document.getElementById("billingModalTitle").innerText = `Buat Tagihan Sewa — ${room.number}`;
  document.getElementById("billingModalSubtitle").innerText = `Penyewa: ${room.tenant || 'Tamu Baru'}`;
  document.getElementById("billingBasePrice").value = room.price;
  document.getElementById("billingLastMeter").value = room.lastMeter || 1000;
  document.getElementById("billingNewMeter").value = (room.lastMeter || 1000) + 65; // Contoh estimasi awal

  calculateBillingTotal();
  openModal("modalBilling");
}

function openQuickBillingModal() {
  const overdueOrPending = state.rooms.find(r => r.status === "OVERDUE" || r.status === "DUE_TOMORROW") || state.rooms[0];
  openBillingModal(overdueOrPending.id);
}

function calculateBillingTotal() {
  const basePrice = Number(document.getElementById("billingBasePrice").value) || 0;
  const lastMeter = Number(document.getElementById("billingLastMeter").value) || 0;
  const newMeter = Number(document.getElementById("billingNewMeter").value) || lastMeter;
  const addFee = Number(document.getElementById("billingAdditionalFee").value) || 0;
  const discount = Number(document.getElementById("billingDiscount").value) || 0;

  const kwh = Math.max(0, newMeter - lastMeter);
  const electricCost = kwh * 2000; // Standar tarif Rp 2.000 / kWh
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
  const room = state.rooms.find(r => r.id === unitId);
  const totalText = document.getElementById("billingTotalDisplay").innerText;

  // Susun template pesan WhatsApp
  const message = `Halo Sdr/i *${room ? room.tenant : 'Penghuni'}*,\nBerikut rincian tagihan sewa *${room ? room.number : 'Kamar'}*:\n\n` +
    `• Periode: ${document.getElementById("billingPeriod").value}\n` +
    `• Sewa Pokok: ${formatRupiah(Number(document.getElementById("billingBasePrice").value))}\n` +
    `• Listrik: ${document.getElementById("billingKwhUsage").innerText} kWh (${document.getElementById("billingElectricityCost").innerText})\n` +
    `• Iuran Sampah: ${formatRupiah(Number(document.getElementById("billingAdditionalFee").value))}\n` +
    `-----------------------------------\n` +
    `*TOTAL TAGIHAN: ${totalText}*\n` +
    `Jatuh Tempo: ${document.getElementById("billingDueDate").value}\n\n` +
    `Mohon transfer ke:\n*BCA 1234567890 a.n Hendra Wijaya*\n\n` +
    `Kwitansi Digital: https://kosthub.vercel.app/?token=INV-${Date.now().toString().slice(-4)}`;

  state.tempWaUrl = `https://wa.me/6281270000000?text=${encodeURIComponent(message)}`;
  document.getElementById("waMessagePreview").innerText = message;

  closeModal("modalBilling");
  openModal("modalWhatsApp");
  btn.disabled = false;
  btn.innerText = "💾 Terbitkan & Siapkan WA";
}

function dispatchWhatsAppUrl() {
  if (state.tempWaUrl) {
    window.open(state.tempWaUrl, "_blank");
  }
}

function dispatchOverdueWhatsApp(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  if (!room) return;
  const msg = `Halo Sdr/i *${room.tenant}*,\nKami menginformasikan bahwa tagihan sewa *${room.number}* sebesar *${formatRupiah(room.debt)}* saat ini telah melewati batas jatuh tempo (${room.overdueDays} hari).\n\nMohon konfirmasi pelunasannya melalui transfer ke BCA 1234567890 a.n Hendra Wijaya. Terima kasih.`;
  window.open(`https://wa.me/6281270000000?text=${encodeURIComponent(msg)}`, "_blank");
}

// ==================== ONBOARDING TENANT ====================
function openOnboardModal(unitId) {
  const room = state.rooms.find(r => r.id === unitId);
  document.getElementById("onboardUnitId").value = unitId;
  document.getElementById("onboardRoomTitle").innerText = `Registrasi Tamu Baru — ${room ? room.number : ''}`;
  openModal("modalOnboard");
}

function previewKtpImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("ktpImagePreview").src = e.target.result;
    document.getElementById("ktpPreviewContainer").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function submitOnboardingTenant() {
  const name = document.getElementById("onboardName").value.trim();
  const wa = document.getElementById("onboardWa").value.trim();
  const unitId = document.getElementById("onboardUnitId").value;

  if (!name || !wa) {
    alert("Harap isi Nama Lengkap dan Nomor WhatsApp.");
    return;
  }

  const room = state.rooms.find(r => r.id === unitId);
  if (room) {
    room.status = "OCCUPIED";
    room.tenant = name;
    room.remainingDays = 30;
    room.debt = 0;
  }

  closeModal("modalOnboard");
  showToast("Penghuni berhasil didaftarkan!", "success");
  updateUI();
}

// ==================== EXPENSE & CASHFLOW ====================
function openExpenseModal() {
  openModal("modalExpense");
}

function submitExpenseRecord() {
  const desc = document.getElementById("expenseDescription").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value) || 0;

  if (!desc || amount <= 0) {
    alert("Harap isi keterangan dan nominal pengeluaran.");
    return;
  }

  state.kpi.netCashflow -= amount;
  closeModal("modalExpense");
  showToast("Pengeluaran berhasil dicatat!", "success");
  updateUI();
}

// ==================== DIGITAL RECEIPT MODAL ====================
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
      <td class="py-2 text-slate-700">Sewa Kamar Dasar (${room.type})</td>
      <td class="py-2 text-right font-mono font-bold">${formatRupiah(room.price)}</td>
    </tr>
    <tr>
      <td class="py-2 text-slate-700">Iuran Kebersihan & Fasilitas</td>
      <td class="py-2 text-right font-mono font-bold">Termasuk</td>
    </tr>
  `;

  document.getElementById("receiptContainer").classList.remove("hidden");
}

function loadPublicReceipt(token) {
  document.getElementById("rcptInvId").innerText = `INV-TOKEN-${token}`;
  document.getElementById("rcptTotalPaid").innerText = "Rp 1.650.000";
  document.getElementById("receiptContainer").classList.remove("hidden");
}

function closeReceiptView() {
  document.getElementById("receiptContainer").classList.add("hidden");
}

// ==================== HELPER UTILITIES ====================
function setRoomFilter(filterType) {
  state.activeFilter = filterType;
  ["ALL", "OCCUPIED", "OVERDUE", "VACANT"].forEach(type => {
    const el = document.getElementById(`filter-pill-${type}`);
    if (el) {
      if (type === filterType) {
        el.className = "px-3.5 py-1.5 rounded-full bg-brand-600 text-white shrink-0 transition-colors";
      } else {
        el.className = "px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0 transition-colors";
      }
    }
  });
  renderRoomMatrix();
}

function filterRooms() {
  state.searchKeyword = document.getElementById("searchRoomInput").value.toLowerCase();
  renderRoomMatrix();
}

function switchTab(tabId) {
  state.activeTab = tabId;
  ["dashboard", "units", "tenants", "cashflow"].forEach(tab => {
    const view = document.getElementById(`view-${tab}`);
    const navD = document.getElementById(`nav-${tab}`);
    const navM = document.getElementById(`bnav-${tab}`);

    if (tab === tabId) {
      if (view) view.classList.remove("hidden");
      if (navD) navD.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-brand-600 text-white transition-colors shadow-sm";
      if (navM) navM.className = "flex flex-col items-center gap-1 text-brand-600";
    } else {
      if (view) view.classList.add("hidden");
      if (navD) navD.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors";
      if (navM) navM.className = "flex flex-col items-center gap-1 text-slate-500";
    }
  });
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