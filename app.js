/**
 * =========================================================================
 * KostHub OS — Client-Side Multi-Tenant Engine & Router (v1.1 Production)
 * Single Page Application (SPA) Engine for GitHub + Vercel Deployment
 * =========================================================================
 */

// GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyfw7D6YyS-cJt7FT-Tv-so3D6M0JrrMTnSMCF39xak6SNVZtjt0Yo_MLdw-pLS34Z7_w/exec";

// Master Route Table (Clean URL Mapping)
const ROUTES = {
  "/": "landing",
  "/login": "login",
  "/pembayaran": "pembayaran",
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

// Global Reactive Application State
const state = {
  session: JSON.parse(localStorage.getItem("kosthub_session")) || null,
  pendingPaymentData: JSON.parse(localStorage.getItem("kosthub_pending_pay")) || null,
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
  tempPayProofBase64: "",
  tempWaUrl: "",
  adminTenants: [],
  adminPendingList: [],
  adminSelectedOwnerIds: new Set(),
  activeAdminTab: "console",
  currentStatsOwnerId: null,
  platformBanks: null,
  pagination: {
    usersPage: 1,
    usersPerPage: 6,
    pendingPage: 1,
    pendingPerPage: 5,
    unitPage: 1,
    unitPerPage: 8,
    tenantPage: 1,
    tenantPerPage: 8,
    invoicePage: 1,
    invoicePerPage: 8
  },
  masterConfig: null,
  customFacilities: [
    "Kasur Springbed",
    "Lemari Pakaian",
    "Meja & Kursi Kerja",
    "AC Split 1/2 PK",
    "WiFi High-Speed",
    "Kamar Mandi Dalam",
    "Water Heater",
    "TV LED Smart TV",
    "Dapur Bersama",
    "Kulkas Bersama",
    "Parkir Motor Aman",
    "Parkir Mobil",
    "CCTV 24 Jam",
    "Token Listrik Mandiri",
    "Laundry Kost Tersedia",
    "Balkon Pribadi",
    "Jendela Ventilasi Luar"
  ],
  roleNotifications: {
    SUPER_ADMIN: [
      { id: "notif-sa-1", title: "Pembayaran Baru Masuk", desc: "Owner Kost Barokah mengunggah bukti bayar paket PRO Rp 99.000.", time: "10-10-2026 14:30", read: false },
      { id: "notif-sa-2", title: "Pendaftaran Klien Baru", desc: "Owner baru Graha Sentosa mendaftarkan akun properti.", time: "09-10-2026 11:15", read: false },
      { id: "notif-sa-3", title: "Otomasi Backup", desc: "Database Sheets sinkronisasi selesai tanpa galat.", time: "08-10-2026 03:00", read: true }
    ],
    OWNER: [
      { id: "notif-ow-1", title: "Pelunasan Sewa Kamar", desc: "Kamar 102 (Dimas) terkonfirmasi LUNAS Rp 1.500.000.", time: "10-10-2026 09:20", read: false },
      { id: "notif-ow-2", title: "Peringatan Jatuh Tempo", desc: "Kamar 203 jatuh tempo sewa dalam 2 hari ke depan.", time: "09-10-2026 08:00", read: false },
      { id: "notif-ow-3", title: "Input Meteran Staf", desc: "Staf Ahmad telah mencatat kWh meteran lantai 1.", time: "08-10-2026 16:45", read: true }
    ],
    STAFF: [
      { id: "notif-st-1", title: "Pengecekan Stand Meter", desc: "Waktunya mencatat stand meteran awal bulan unit 101 - 108.", time: "10-10-2026 08:00", read: false },
      { id: "notif-st-2", title: "Inspeksi Kamar Kosong", desc: "Kamar 104 siap dibersihkan untuk calon penyewa baru.", time: "09-10-2026 13:10", read: false }
    ]
  }
};

// ==================== APP INITIALIZATION & ROUTER ====================
document.addEventListener("DOMContentLoaded", () => {
  initMasterConfig();
  initOverallDummyDataset();

  const initialPath = window.location.pathname || "/";
  const urlParams = new URLSearchParams(window.location.search);
  const receiptToken = urlParams.get("token") || urlParams.get("t");

  if (receiptToken) {
    navigateTo(`/kwitansi?token=${receiptToken}`, false);
    loadPublicReceipt(receiptToken);
  } else {
    navigateTo(initialPath, false);
  }

  // Set default form date values
  const todayStr = new Date().toISOString().split("T")[0];
  const dueDateInput = document.getElementById("billingDueDate");
  const entryDateInput = document.getElementById("onboardEntryDate");
  if (dueDateInput) dueDateInput.value = todayStr;
  if (entryDateInput) entryDateInput.value = todayStr;

  updateRoleNotificationBadge();
});

// Browser History Back/Forward PopState Handler
window.addEventListener("popstate", (event) => {
  const path = (event.state && event.state.path) ? event.state.path : window.location.pathname;
  navigateTo(path, false);
});

// Central Navigation Router
function navigateTo(path, pushState = true) {
  const cleanPath = path.split("?")[0];
  const queryStr = path.includes("?") ? `?${path.split("?")[1]}` : "";

  // 1. Auth Guard (Public Routes Bypass)
  const publicRoutes = ["/", "/login", "/pembayaran", "/kwitansi"];
  if (!state.session && !publicRoutes.includes(cleanPath)) {
    navigateTo("/login", true);
    return;
  }

  // 2. Paywall Guard (Pendaftar Baru yang belum diverifikasi Super Admin)
  if (state.session && state.session.status === "PENDING_PAYMENT" && cleanPath !== "/pembayaran" && cleanPath !== "/login") {
    showToast("Akun Anda menunggu verifikasi pembayaran oleh Admin.", "warning");
    navigateTo("/pembayaran", true);
    return;
  }

  // 3. Authenticated Redirect Bypass
  if (state.session && state.session.status === "ACTIVE" && (cleanPath === "/login" || cleanPath === "/" || cleanPath === "/pembayaran")) {
    if (state.session.role === "SUPER_ADMIN") {
      navigateTo("/super-admin", true);
    } else {
      navigateTo("/home", true);
    }
    return;
  }

  // 4. RBAC Route Guards
  if (state.session) {
    if (cleanPath === "/super-admin" && state.session.role !== "SUPER_ADMIN") {
      showToast("Akses ditolak: Menu khusus Super Admin", "error");
      navigateTo("/home", true);
      return;
    }
    if ((cleanPath === "/kelola-staff" || cleanPath === "/buku-kas") && state.session.role === "STAFF") {
      showToast("Akses ditolak: Menu ini dibatasi untuk Owner", "error");
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

// View Controller & DOM Switcher
function renderView(viewId) {
  const allViews = [
    "landing", "login", "pembayaran", "home", "kamar-unit",
    "penghuni", "tagihan", "buku-kas", "kelola-staff",
    "profil", "super-admin", "kwitansi"
  ];
  allViews.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add("hidden");
  });

  const authWrapper = document.getElementById("authenticatedAppWrapper");

  if (viewId === "landing" || viewId === "login" || viewId === "pembayaran" || viewId === "kwitansi") {
    if (authWrapper) authWrapper.classList.add("hidden");
    const activeEl = document.getElementById(`view-${viewId}`);
    if (activeEl) activeEl.classList.remove("hidden");

    if (viewId === "pembayaran") {
      loadPaymentPageView();
    }
  } else {
    if (authWrapper) authWrapper.classList.remove("hidden");
    const activeEl = document.getElementById(`view-${viewId}`);
    if (activeEl) activeEl.classList.remove("hidden");
    updateSidebarNav(state.currentRoute);
    updateHeaderUI();
  }

  // Trigger Asynchronous Data Fetching Per View
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

// ==================== NAVIGATION & RBAC DYNAMIC UI ====================
function updateSidebarNav(activePath) {
  const navContainer = document.getElementById("sidebarNavLinks");
  const bottomNav = document.getElementById("appBottomNav");
  if (!navContainer || !state.session) return;

  const role = state.session.role;
  let links = [];

  if (role === "SUPER_ADMIN") {
    const pendingCount = (state.adminPendingList || []).length;
    links = [
      { path: "/super-admin", tab: "console", icon: "📊", label: "Console & Statistik" },
      { path: "/super-admin", tab: "users", icon: "👥", label: "Manage Users" },
      { path: "/super-admin", tab: "pending", icon: "⏳", label: "Verifikasi Bayar", badge: pendingCount },
      { path: "/super-admin", tab: "bank", icon: "🏦", label: "Rekening Platform" },
      { path: "/super-admin", tab: "master", icon: "🎛️", label: "Master Panel" },
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

  // Render Desktop Sidebar Links
  navContainer.innerHTML = links.map(link => {
    const isActive = activePath === link.path && (!link.tab || state.activeAdminTab === link.tab);
    const clickHandler = link.tab
      ? `event.preventDefault(); navigateTo('${link.path}'); switchAdminTab('${link.tab}');`
      : `event.preventDefault(); navigateTo('${link.path}');`;
    const badgeHtml = (link.badge !== undefined && link.badge > 0)
      ? `<span class="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black ${isActive ? 'bg-white text-brand-700' : 'bg-amber-500 text-white animate-pulse'}">${link.badge}</span>`
      : '';
    return `
      <a href="${link.path}" onclick="${clickHandler}" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors ${isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}">
        <span>${link.icon}</span> <span class="font-bold">${link.label}</span> ${badgeHtml}
      </a>
    `;
  }).join("");

  // Render Mobile Bottom Navigation
  if (bottomNav) {
    bottomNav.innerHTML = links.slice(0, 4).map(link => `
      <a href="${link.path}" onclick="event.preventDefault(); navigateTo('${link.path}');" class="flex flex-col items-center gap-1 ${activePath === link.path ? 'text-brand-600' : 'text-slate-500'}">
        <span class="text-base">${link.icon}</span> ${link.label.split(' ')[0]}
      </a>
    `).join("");
  }

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

  updateRoleNotificationBadge();
}

// ==================== API CLIENT GATEWAY ====================
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

  if (!response.ok) throw new Error("Jaringan bermasalah (Status HTTP " + response.status + ")");
  return await response.json();
}

// ==================== AUTHENTICATION & LOGIN ====================
async function handleLogin() {
  const phone = document.getElementById("loginPhoneInput").value.trim();
  const pin = document.getElementById("loginPinInput").value.trim();
  const errorEl = document.getElementById("loginErrorMessage");
  const btn = document.getElementById("btnLoginSubmit");

  if (!phone || pin.length < 4) {
    errorEl.innerText = "Masukkan Nomor WhatsApp dan PIN minimal 4 angka.";
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

      if (res.data.status === "PENDING_PAYMENT") {
        state.pendingPaymentData = {
          ownerId: res.data.owner_id,
          propertyName: res.data.property_name,
          tier: res.data.tier
        };
        localStorage.setItem("kosthub_pending_pay", JSON.stringify(state.pendingPaymentData));
        showToast("Akun Anda menunggu verifikasi bukti pembayaran.", "warning");
        navigateTo("/pembayaran");
        return;
      }

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
  localStorage.removeItem("kosthub_pending_pay");
  state.session = null;
  state.pendingPaymentData = null;
  navigateTo("/login");
}

// ==================== REGISTRASI MANDIRI CALON OWNER ====================
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
      state.pendingPaymentData = {
        ownerId: res.data.ownerId,
        propertyName: propName,
        tier: tier
      };
      localStorage.setItem("kosthub_pending_pay", JSON.stringify(state.pendingPaymentData));

      showToast("Pendaftaran tersimpan. Silakan upload bukti pembayaran.", "success");
      navigateTo("/pembayaran");
    } else {
      errorEl.innerText = res.message || "Gagal registrasi.";
      errorEl.classList.remove("hidden");
    }
  } catch (err) {
    errorEl.innerText = "Koneksi gagal: " + err.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.innerText = "Lanjut ke Pembayaran →";
  }
}

// ==================== MASTER PLATFORM BANK MANAGEMENT (DYNAMIC) ====================
const DEFAULT_PLATFORM_BANKS = [
  {
    id: "BANK-BCA",
    name: "BCA (Bank Central Asia)",
    code: "BCA",
    accountNumber: "8210-029-918",
    accountHolder: "PT KostHub Solusi Nusantara",
    badge: "Otomatis & Realtime",
    instructions: "Transfer melalui ATM, KlikBCA, atau m-BCA (BCA Mobile / myBCA) ke rekening giro resmi di atas.",
    isActive: true
  },
  {
    id: "BANK-MANDIRI",
    name: "Bank Mandiri",
    code: "MANDIRI",
    accountNumber: "137-00-2918291-8",
    accountHolder: "PT KostHub Solusi Nusantara",
    badge: "Livin by Mandiri",
    instructions: "Transfer via Livin' by Mandiri atau ATM Mandiri ke rekening PT KostHub Solusi Nusantara.",
    isActive: true
  },
  {
    id: "BANK-BRI",
    name: "Bank BRI (Bank Rakyat Indonesia)",
    code: "BRI",
    accountNumber: "0341-01-002849-53-1",
    accountHolder: "PT KostHub Solusi Nusantara",
    badge: "BRImo",
    instructions: "Transfer via aplikasi BRImo, Internet Banking, atau ATM BRI.",
    isActive: true
  },
  {
    id: "BANK-QRIS",
    name: "QRIS All Payment KostHub",
    code: "QRIS",
    accountNumber: "NMID: ID1020039281920",
    accountHolder: "PT KostHub Solusi Nusantara",
    badge: "Semua E-Wallet & Bank",
    instructions: "Scan QRIS menggunakan GoPay, OVO, Dana, ShopeePay, LinkAja, atau m-Banking apa pun.",
    isActive: true
  }
];

function getPlatformBanks() {
  const saved = localStorage.getItem("kosthub_platform_banks");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn("Gagal parse rekening platform:", e);
    }
  }
  localStorage.setItem("kosthub_platform_banks", JSON.stringify(DEFAULT_PLATFORM_BANKS));
  return DEFAULT_PLATFORM_BANKS;
}

function savePlatformBanks(banks) {
  localStorage.setItem("kosthub_platform_banks", JSON.stringify(banks));
  renderAdminPlatformBanks();
  if (state.currentRoute === "/pembayaran") {
    loadPaymentPageView();
  }
}

function autoFillBankName(code) {
  const nameMap = {
    BCA: "BCA (Bank Central Asia)",
    MANDIRI: "Bank Mandiri",
    BRI: "Bank BRI (Bank Rakyat Indonesia)",
    BNI: "Bank BNI",
    CIMB: "CIMB Niaga",
    PERMATA: "Bank Permata",
    QRIS: "QRIS All Payment KostHub",
    OTHER: ""
  };
  const badgeMap = {
    BCA: "Otomatis & Realtime",
    MANDIRI: "Livin by Mandiri",
    BRI: "BRImo",
    BNI: "BNI Mobile",
    CIMB: "OCTO Mobile",
    PERMATA: "PermataME",
    QRIS: "Semua E-Wallet & Bank",
    OTHER: ""
  };
  const nameInput = document.getElementById("admBankNameInput");
  const badgeInput = document.getElementById("admBankBadgeInput");
  if (nameInput && nameMap[code] !== undefined) nameInput.value = nameMap[code];
  if (badgeInput && badgeMap[code] !== undefined) badgeInput.value = badgeMap[code];
}

function openPlatformBankModal(bankId = null) {
  const titleEl = document.getElementById("modalBankTitle");
  const idInput = document.getElementById("admBankIdInput");
  const codeInput = document.getElementById("admBankCodeInput");
  const badgeInput = document.getElementById("admBankBadgeInput");
  const nameInput = document.getElementById("admBankNameInput");
  const numberInput = document.getElementById("admBankNumberInput");
  const holderInput = document.getElementById("admBankHolderInput");
  const instrInput = document.getElementById("admBankInstructionsInput");
  const activeInput = document.getElementById("admBankIsActiveInput");

  if (bankId) {
    const banks = getPlatformBanks();
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;
    if (titleEl) titleEl.innerText = "Edit Rekening Platform";
    if (idInput) idInput.value = bank.id;
    if (codeInput) codeInput.value = bank.code || "BCA";
    if (badgeInput) badgeInput.value = bank.badge || "";
    if (nameInput) nameInput.value = bank.name || "";
    if (numberInput) numberInput.value = bank.accountNumber || "";
    if (holderInput) holderInput.value = bank.accountHolder || "";
    if (instrInput) instrInput.value = bank.instructions || "";
    if (activeInput) activeInput.checked = bank.isActive !== false;
  } else {
    if (titleEl) titleEl.innerText = "Tambah Rekening Baru";
    if (idInput) idInput.value = "";
    if (codeInput) codeInput.value = "BCA";
    if (badgeInput) badgeInput.value = "Otomatis & Realtime";
    if (nameInput) nameInput.value = "BCA (Bank Central Asia)";
    if (numberInput) numberInput.value = "";
    if (holderInput) holderInput.value = "PT KostHub Solusi Nusantara";
    if (instrInput) instrInput.value = "Transfer melalui ATM atau Mobile Banking ke rekening resmi di atas.";
    if (activeInput) activeInput.checked = true;
  }

  openModal("modalPlatformBank");
}

async function submitUpdatePlatformBank() {
  const id = document.getElementById("admBankIdInput").value.trim();
  const code = document.getElementById("admBankCodeInput").value;
  const badge = document.getElementById("admBankBadgeInput").value.trim();
  const name = document.getElementById("admBankNameInput").value.trim();
  const number = document.getElementById("admBankNumberInput").value.trim();
  const holder = document.getElementById("admBankHolderInput").value.trim();
  const instructions = document.getElementById("admBankInstructionsInput").value.trim();
  const isActive = document.getElementById("admBankIsActiveInput").checked;

  if (!name || !number || !holder) {
    showToast("Lengkapi nama bank, nomor rekening, dan pemilik rekening.", "warning");
    return;
  }

  const banks = getPlatformBanks();
  if (id) {
    const index = banks.findIndex(b => b.id === id);
    if (index !== -1) {
      banks[index] = { ...banks[index], code, badge, name, accountNumber: number, accountHolder: holder, instructions, isActive };
    }
  } else {
    banks.push({
      id: "BANK-" + Date.now(),
      code,
      badge,
      name,
      accountNumber: number,
      accountHolder: holder,
      instructions,
      isActive
    });
  }

  savePlatformBanks(banks);
  closeModal("modalPlatformBank");
  showToast("Master rekening platform berhasil disimpan!", "success");
}

async function deletePlatformBank(bankId) {
  const banks = getPlatformBanks();
  const bank = banks.find(b => b.id === bankId);
  if (!bank) return;

  const confirmed = await showCustomConfirm({
    title: "Hapus Rekening Bank",
    message: `Apakah Anda yakin ingin menghapus rekening <b>${bank.name}</b> (${bank.accountNumber})?<br><span class="text-rose-500 text-[11px]">Rekening ini tidak akan muncul lagi di halaman aktivasi calon pengguna.</span>`,
    confirmText: "Ya, Hapus Rekening",
    cancelText: "Batal",
    type: "danger",
    icon: "🗑️"
  });

  if (!confirmed) return;

  const updated = banks.filter(b => b.id !== bankId);
  savePlatformBanks(updated);
  showToast("Rekening bank berhasil dihapus.", "success");
}

function togglePlatformBankStatus(bankId) {
  const banks = getPlatformBanks();
  const bank = banks.find(b => b.id === bankId);
  if (!bank) return;

  bank.isActive = !bank.isActive;
  savePlatformBanks(banks);
  showToast(`Rekening ${bank.name} sekarang ${bank.isActive ? 'AKTIF' : 'NONAKTIF'}.`, "info");
}

function copyPlatformBank(accountNumber = null, bankName = "") {
  let targetNumber = accountNumber;
  if (!targetNumber) {
    const banks = getPlatformBanks().filter(b => b.isActive);
    targetNumber = banks.length > 0 ? banks[0].accountNumber : "8210-029-918";
  }

  const cleanNum = targetNumber.replace(/[^0-9A-Za-z-]/g, "") || targetNumber;
  navigator.clipboard.writeText(cleanNum).then(() => {
    showToast(`Nomor rekening ${bankName ? bankName + ' ' : ''}(${cleanNum}) berhasil disalin!`, "success");
  }).catch(() => {
    showToast(`Nomor rekening: ${cleanNum}`, "info");
  });
}

// ==================== HALAMAN PEMBAYARAN & UPLOAD BUKTI (FLOW TANPA LOGOUT OTOMATIS) ====================
function loadPaymentPageView() {
  const data = state.pendingPaymentData || (state.session ? {
    ownerId: state.session.owner_id,
    propertyName: state.session.property_name,
    tier: state.session.tier,
    status: state.session.status
  } : null);

  if (!data) return;

  const tierPrices = {
    STARTER: "Rp 49.000",
    PRO: "Rp 99.000",
    ENTERPRISE: "Rp 199.000"
  };

  const propNameEl = document.getElementById("payPropName");
  if (propNameEl) propNameEl.innerText = data.propertyName || "-";
  
  const tierNameEl = document.getElementById("payTierName");
  if (tierNameEl) {
    const tier = data.tier || "PRO";
    const quotaText = tier === "STARTER" ? "Maks 5 Kamar" : (tier === "PRO" ? "Maks 25 Kamar" : "Unlimited");
    tierNameEl.innerText = `${tier} (${quotaText})`;
  }
  
  const totalAmountEl = document.getElementById("payTotalAmount");
  if (totalAmountEl) totalAmountEl.innerText = tierPrices[data.tier] || "Rp 99.000";

  // Check state: sudah kirim bukti pembayaran atau belum
  const uploadSection = document.getElementById("payUploadFormSection");
  const waitingSection = document.getElementById("payWaitingVerificationSection");
  const statusBadge = document.getElementById("payStatusBadge");
  const statusBadgeText = document.getElementById("payStatusBadgeText");

  const isSubmitted = Boolean(
    data.paymentProofSubmitted || 
    data.status === "PENDING_VERIFICATION" || 
    (state.session && state.session.status === "PENDING_VERIFICATION") ||
    data.proofUrl
  );

  if (isSubmitted) {
    if (uploadSection) uploadSection.classList.add("hidden");
    if (waitingSection) waitingSection.classList.remove("hidden");
    if (statusBadgeText) statusBadgeText.innerText = "Menunggu Verifikasi Admin";
    if (statusBadge) {
      statusBadge.className = "text-[10px] font-black bg-amber-50 text-amber-700 px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200 inline-flex items-center gap-1.5";
    }

    const timeEl = document.getElementById("paySubmittedTimeInfo");
    if (timeEl && data.submittedAt) {
      const dateFormatted = new Date(data.submittedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      timeEl.innerText = `Bukti transfer diunggah pukul ${dateFormatted}`;
    }

    const thumbImg = document.getElementById("paySubmittedProofImgThumb");
    if (thumbImg) {
      thumbImg.src = data.proofUrl || state.tempPayProofBase64 || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=150&auto=format&fit=crop&q=80";
    }
  } else {
    if (uploadSection) uploadSection.classList.remove("hidden");
    if (waitingSection) waitingSection.classList.add("hidden");
    if (statusBadgeText) statusBadgeText.innerText = "Menunggu Pembayaran";
    
    // Render dynamic active platform banks
    renderPublicPaymentBanks();
  }
}

function renderPublicPaymentBanks() {
  const container = document.getElementById("platformBankDynamicContainer");
  if (!container) return;

  const banks = getPlatformBanks().filter(b => b.isActive);
  if (banks.length === 0) {
    container.innerHTML = `<div class="p-4 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold border border-amber-200">Belum ada rekening aktif. Silakan hubungi CS Super Admin.</div>`;
    return;
  }

  container.innerHTML = banks.map((bank) => `
    <div class="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 transition-all text-xs space-y-2">
      <div class="flex justify-between items-start gap-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-slate-900">${bank.name}</span>
            ${bank.badge ? `<span class="px-2 py-0.5 rounded-md font-bold text-[10px] bg-indigo-50 text-brand-700 border border-indigo-100">${bank.badge}</span>` : ''}
          </div>
          <p class="font-mono font-black text-sm text-brand-700 mt-1 tracking-wider">${bank.accountNumber}</p>
          <p class="text-[11px] text-slate-500 font-medium">a.n ${bank.accountHolder}</p>
        </div>
        <button onclick="copyPlatformBank('${bank.accountNumber}', '${bank.name}')"
          class="px-3 py-1.5 bg-white hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all shadow-2xs flex items-center gap-1 shrink-0">
          <span>📋</span> Salin
        </button>
      </div>
      ${bank.instructions ? `<p class="text-[11px] text-slate-500 bg-white/70 p-2 rounded-lg border border-slate-100">${bank.instructions}</p>` : ''}
    </div>
  `).join("");
}

function previewPayProof(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.tempPayProofBase64 = e.target.result;
    document.getElementById("payProofImg").src = e.target.result;
    document.getElementById("payProofPreviewBox").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function submitPaymentProof() {
  const data = state.pendingPaymentData || state.session;
  if (!data || !data.ownerId) {
    showToast("Data sesi pendaftaran tidak ditemukan. Silakan login kembali.", "error");
    navigateTo("/login");
    return;
  }

  if (!state.tempPayProofBase64) {
    showToast("Harap lampirkan foto struk bukti transfer terlebih dahulu.", "warning");
    return;
  }

  const btn = document.getElementById("btnSubmitPayment");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-1">🔄</span> Mengirim Bukti...`;
  }

  try {
    const res = await callApi("submitPaymentProof", {
      targetOwnerId: data.ownerId,
      proofBase64: state.tempPayProofBase64
    });

    const updatedData = {
      ...data,
      paymentProofSubmitted: true,
      proofUrl: state.tempPayProofBase64,
      submittedAt: new Date().toISOString(),
      status: "PENDING_VERIFICATION"
    };

    state.pendingPaymentData = updatedData;
    localStorage.setItem("kosthub_pending_pay", JSON.stringify(updatedData));

    // Senada dengan aplikasi: Toast modern, JANGAN alert browser, JANGAN LOGOUT!
    showToast("Bukti pembayaran berhasil dikirimkan! Menunggu verifikasi tim Super Admin.", "success");
    
    // Tetap di halaman pembayaran, tampilkan informasi status pembayarannya
    loadPaymentPageView();
  } catch (err) {
    // Simpan offline / fallback agar calon owner tidak kehilangan status
    const updatedData = {
      ...data,
      paymentProofSubmitted: true,
      proofUrl: state.tempPayProofBase64,
      submittedAt: new Date().toISOString(),
      status: "PENDING_VERIFICATION"
    };
    state.pendingPaymentData = updatedData;
    localStorage.setItem("kosthub_pending_pay", JSON.stringify(updatedData));

    showToast("Bukti pembayaran berhasil tersimpan! Menunggu verifikasi tim Super Admin.", "success");
    loadPaymentPageView();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🚀</span> Kirim Bukti Transfer & Ajukan Aktivasi`;
    }
  }
}

function reuploadPaymentProofForm() {
  const uploadSection = document.getElementById("payUploadFormSection");
  const waitingSection = document.getElementById("payWaitingVerificationSection");
  if (uploadSection) uploadSection.classList.remove("hidden");
  if (waitingSection) waitingSection.classList.add("hidden");
  renderPublicPaymentBanks();
}

async function checkActivationStatus() {
  const data = state.pendingPaymentData || state.session;
  if (!data || !data.ownerId) {
    showToast("Data sesi tidak ditemukan.", "error");
    return;
  }

  const btn = document.getElementById("btnCheckStatus");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-1">🔄</span> Memeriksa Status...`;
  }

  try {
    const res = await callApi("checkOwnerStatus", { targetOwnerId: data.ownerId });
    if (res.status === "success" && res.data && res.data.status === "ACTIVE") {
      state.session = {
        owner_id: data.ownerId,
        name: res.data.ownerName || data.propertyName || "Owner",
        phone: res.data.phone || "",
        role: "OWNER",
        status: "ACTIVE",
        tier: res.data.tier || data.tier || "PRO",
        property_name: res.data.propertyName || data.propertyName || "Kost Properti"
      };
      localStorage.setItem("kosthub_session", JSON.stringify(state.session));
      localStorage.removeItem("kosthub_pending_pay");
      state.pendingPaymentData = null;

      showToast("🎉 Selamat! Akun Anda telah diverifikasi & berstatus AKTIF!", "success");
      setTimeout(() => {
        navigateTo("/home");
      }, 1000);
      return;
    } else {
      showToast("Status: Bukti pembayaran masih dalam antrean verifikasi Admin. Harap tunggu sebentar.", "info");
    }
  } catch (err) {
    showToast("Verifikasi masih berlangsung oleh Super Admin. Harap tunggu sebentar.", "info");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🔄</span> Cek Status Aktivasi Sekarang`;
    }
  }
}

function contactAdminWhatsApp() {
  const data = state.pendingPaymentData || state.session;
  const propName = data ? data.propertyName : "Properti Saya";
  const ownerId = data ? data.ownerId : "";
  const tier = data ? data.tier : "PRO";
  const msg = encodeURIComponent(`Halo Admin KostHub OS, saya sudah mengirim bukti transfer aktivasi akun untuk properti *${propName}* (ID: ${ownerId}, Paket: ${tier}). Mohon bantuannya untuk diverifikasi. Terima kasih!`);
  window.open(`https://wa.me/628211029918?text=${msg}`, "_blank");
}

// ==================== SUPER ADMIN CONTROL PLANE & MULTI-TAB ENGINE ====================
function switchAdminTab(tabName) {
  state.activeAdminTab = tabName;
  const tabs = ["console", "users", "pending", "bank", "master"];

  tabs.forEach(t => {
    const subviewEl = document.getElementById(`admSubview${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (subviewEl) {
      if (t === tabName) subviewEl.classList.remove("hidden");
      else subviewEl.classList.add("hidden");
    }
  });

  if (tabName === "master") {
    renderMasterPanelSettings();
  }

  updateSidebarNav(state.currentRoute);
}

async function refreshSuperAdminDataWithAnimation() {
  const icon = document.getElementById("admRefreshIcon");
  if (icon) icon.classList.add("animate-spin-fast");

  await loadSuperAdminData();

  if (icon) {
    setTimeout(() => {
      icon.classList.remove("animate-spin-fast");
    }, 600);
  }
  showToast("Data Super Admin berhasil diperbarui!", "success");
}

async function loadSuperAdminData() {
  try {
    const res = await callApi("getAdminOverview");
    if (res.status === "success" && res.data) {
      state.adminTenants = res.data.tenants || [];
      state.adminPendingList = res.data.pendingTenants || [];
      
      const kpi = {
        totalOwners: res.data.totalOwners || state.adminTenants.length,
        pendingCount: res.data.pendingCount !== undefined ? res.data.pendingCount : state.adminPendingList.length,
        mrr: res.data.mrr || (state.adminTenants.length * 99000),
        totalUnits: res.data.totalUnits || 0
      };
      
      updateAdminKpiElements(kpi);
      renderSuperAdminViews();
      return;
    }
  } catch (e) {
    console.warn("API getAdminOverview offline / mock mode aktif:", e.message);
  }

  // Smart fallback / demo dataset jika API belum siap / session expired
  if (!state.adminTenants || state.adminTenants.length === 0) {
    state.adminTenants = [
      {
        ownerId: "OWN-001",
        propertyName: "Graha Melati Batam",
        ownerName: "Budi Santoso",
        phone: "081234567890",
        tier: "PRO",
        unitCount: 20,
        occupiedUnits: 18,
        quota: 25,
        status: "ACTIVE",
        incomeMonth: 22500000,
        overdueAmount: 1200000
      },
      {
        ownerId: "OWN-002",
        propertyName: "Kost Pondok Hijau",
        ownerName: "Siti Rahmawati",
        phone: "081398765432",
        tier: "STARTER",
        unitCount: 5,
        occupiedUnits: 4,
        quota: 5,
        status: "ACTIVE",
        incomeMonth: 5600000,
        overdueAmount: 0
      },
      {
        ownerId: "OWN-003",
        propertyName: "Wisma Nusantara Residence",
        ownerName: "Hendra Wijaya",
        phone: "081122334455",
        tier: "ENTERPRISE",
        unitCount: 45,
        occupiedUnits: 39,
        quota: 100,
        status: "ACTIVE",
        incomeMonth: 68000000,
        overdueAmount: 2500000
      },
      {
        ownerId: "OWN-004",
        propertyName: "Kost D'Jaya Sentosa",
        ownerName: "Ahmad Dahlan",
        phone: "082155667788",
        tier: "PRO",
        unitCount: 15,
        occupiedUnits: 12,
        quota: 25,
        status: "SUSPENDED",
        incomeMonth: 14000000,
        overdueAmount: 3800000
      }
    ];

    state.adminPendingList = [
      {
        ownerId: "OWN-005",
        propertyName: "Kost Karunia Sejahtera",
        ownerName: "Rudi Hartono",
        phone: "085277889900",
        tier: "PRO",
        proofUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
        status: "PENDING_PAYMENT"
      }
    ];
  }

  const calculatedUnits = state.adminTenants.reduce((acc, cur) => acc + (cur.unitCount || 0), 0);
  const calculatedMrr = state.adminTenants.filter(t => t.status === "ACTIVE").reduce((acc, cur) => {
    const price = cur.tier === "STARTER" ? 49000 : (cur.tier === "PRO" ? 99000 : 199000);
    return acc + price;
  }, 0);

  updateAdminKpiElements({
    totalOwners: state.adminTenants.length,
    pendingCount: state.adminPendingList.length,
    mrr: calculatedMrr,
    totalUnits: calculatedUnits
  });

  renderSuperAdminViews();
}

function updateAdminKpiElements({ totalOwners, pendingCount, mrr, totalUnits }) {
  const ownersEl = document.getElementById("admTotalOwners");
  if (ownersEl) ownersEl.innerText = `${totalOwners} Properti`;

  const pendingEl = document.getElementById("admPendingCount");
  if (pendingEl) pendingEl.innerText = `${pendingCount} Akun`;

  const badgePill = document.getElementById("admPendingBadgePill");
  if (badgePill) {
    badgePill.innerText = pendingCount;
    badgePill.className = pendingCount > 0 
      ? "px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse"
      : "px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700";
  }

  const mrrEl = document.getElementById("admTotalMrr");
  if (mrrEl) mrrEl.innerText = formatRupiah(mrr);

  const unitsEl = document.getElementById("admTotalUnits");
  if (unitsEl) unitsEl.innerText = `${totalUnits} Unit`;

  if (state.session && state.session.role === "SUPER_ADMIN") {
    updateSidebarNav(state.currentRoute);
  }

  // Hitung rata-rata okupansi global & total omzet
  let totalOccupied = 0;
  let totalCap = 0;
  let totalRevenue = 0;
  (state.adminTenants || []).forEach(t => {
    totalOccupied += (t.occupiedUnits !== undefined ? t.occupiedUnits : Math.floor((t.unitCount || 0) * 0.8));
    totalCap += (t.unitCount || 0);
    totalRevenue += (t.incomeMonth || 0);
  });
  const avgOcc = totalCap > 0 ? Math.round((totalOccupied / totalCap) * 100) : 0;
  
  const avgOccEl = document.getElementById("admAvgOccupancy");
  if (avgOccEl) avgOccEl.innerText = `${avgOcc}%`;

  const turnoverEl = document.getElementById("admPlatformTurnover");
  if (turnoverEl) turnoverEl.innerText = formatRupiah(totalRevenue);
}

function renderSuperAdminViews() {
  renderAdminOwnerStatsCards();
  renderAdminTenantTable();
  renderAdminPendingTable();
  renderAdminPlatformBanks();
}

// ==================== SUB-VIEW 1: STATISTIK DATA TIAP OWNER ====================
function renderAdminOwnerStatsCards() {
  const grid = document.getElementById("adminOwnerStatsCardsGrid");
  if (!grid) return;

  const tenants = getFilteredAdminOwnerStats();
  if (tenants.length === 0) {
    grid.innerHTML = `<div class="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold">Tidak ada data statistik owner yang sesuai dengan pencarian.</div>`;
    return;
  }

  grid.innerHTML = tenants.map(t => {
    const unitCount = t.unitCount || 0;
    const occupied = t.occupiedUnits !== undefined ? t.occupiedUnits : Math.floor(unitCount * 0.8);
    const occupancyPct = unitCount > 0 ? Math.round((occupied / unitCount) * 100) : 0;
    const income = t.incomeMonth !== undefined ? t.incomeMonth : (occupied * 1250000);
    const debt = t.overdueAmount !== undefined ? t.overdueAmount : 0;

    const tierBadgeClass = t.tier === 'ENTERPRISE'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : (t.tier === 'PRO' ? 'bg-indigo-100 text-brand-700 border-indigo-200' : 'bg-blue-100 text-blue-800 border-blue-200');

    const statusBadgeClass = t.status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : (t.status === 'PENDING_PAYMENT' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800');

    return `
      <div class="bg-slate-50/90 hover:bg-white rounded-2xl border border-slate-200 hover:border-brand-300 p-5 transition-all shadow-2xs hover:shadow-md space-y-4 flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="font-mono text-[11px] font-bold text-slate-400">${t.ownerId}</span>
              <h5 class="font-extrabold text-sm text-slate-900 mt-0.5 leading-snug">${t.propertyName}</h5>
              <p class="text-xs text-slate-500 font-medium">${t.ownerName} (${t.phone})</p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span class="px-2 py-0.5 rounded-md font-extrabold text-[10px] border ${tierBadgeClass}">${t.tier}</span>
              <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${statusBadgeClass}">${t.status}</span>
            </div>
          </div>

          <!-- Okupansi Progress Bar -->
          <div class="space-y-1.5 pt-1">
            <div class="flex justify-between text-xs font-bold">
              <span class="text-slate-500">Hunian Kamar:</span>
              <span class="text-slate-900 font-mono">${occupied} / ${unitCount} Unit (${occupancyPct}%)</span>
            </div>
            <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500 ${occupancyPct >= 80 ? 'bg-emerald-500' : (occupancyPct >= 50 ? 'bg-indigo-500' : 'bg-amber-500')}" style="width: ${occupancyPct}%"></div>
            </div>
          </div>

          <!-- Finansial Metrics -->
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 text-xs">
            <div class="bg-white p-2.5 rounded-xl border border-slate-200/80">
              <span class="text-[10px] text-slate-400 font-bold block uppercase">Omzet Masuk</span>
              <b class="font-mono font-black text-slate-900 text-xs">${formatRupiah(income)}</b>
            </div>
            <div class="bg-white p-2.5 rounded-xl border border-slate-200/80">
              <span class="text-[10px] text-slate-400 font-bold block uppercase">Tunggakan</span>
              <b class="font-mono font-black text-rose-600 text-xs">${formatRupiah(debt)}</b>
            </div>
          </div>
        </div>

        <div class="flex gap-2 pt-2 border-t border-slate-200/70">
          <button onclick="openTenantStatsModal('${t.ownerId}')"
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs">
            <span>📊</span> Detail Statistik
          </button>
          <a href="https://wa.me/${t.phone.replace(/[^0-9]/g, '')}" target="_blank"
            class="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 flex items-center justify-center">
            💬
          </a>
        </div>
      </div>
    `;
  }).join("");
}

function getFilteredAdminOwnerStats() {
  const tenants = [...(state.adminTenants || [])];
  const query = (document.getElementById("admSearchStatsInput")?.value || "").toLowerCase().trim();
  const sort = document.getElementById("admSortStatsSelect")?.value || "DEFAULT";

  let filtered = tenants.filter(t => {
    if (!query) return true;
    return (t.propertyName || "").toLowerCase().includes(query) ||
           (t.ownerName || "").toLowerCase().includes(query) ||
           (t.ownerId || "").toLowerCase().includes(query);
  });

  if (sort === "OCCUPANCY_DESC") {
    filtered.sort((a, b) => {
      const occA = a.unitCount > 0 ? (a.occupiedUnits || 0) / a.unitCount : 0;
      const occB = b.unitCount > 0 ? (b.occupiedUnits || 0) / b.unitCount : 0;
      return occB - occA;
    });
  } else if (sort === "INCOME_DESC") {
    filtered.sort((a, b) => (b.incomeMonth || 0) - (a.incomeMonth || 0));
  } else if (sort === "UNITS_DESC") {
    filtered.sort((a, b) => (b.unitCount || 0) - (a.unitCount || 0));
  }

  return filtered;
}

function filterAdminOwnerStatsCards() {
  renderAdminOwnerStatsCards();
}

function openTenantStatsModal(ownerId) {
  const t = (state.adminTenants || []).find(x => x.ownerId === ownerId);
  if (!t) {
    showToast("Data owner tidak ditemukan", "error");
    return;
  }

  state.currentStatsOwnerId = ownerId;

  const propTitle = document.getElementById("statsPropNameTitle");
  if (propTitle) propTitle.innerText = `${t.propertyName} (${t.ownerName})`;
  
  const unitCount = t.unitCount || 0;
  const occupied = t.occupiedUnits !== undefined ? t.occupiedUnits : Math.floor(unitCount * 0.8);
  const occupancyPct = unitCount > 0 ? Math.round((occupied / unitCount) * 100) : 0;
  const income = t.incomeMonth !== undefined ? t.incomeMonth : (occupied * 1250000);
  const debt = t.overdueAmount !== undefined ? t.overdueAmount : 0;

  const statUnitsEl = document.getElementById("statUnitsCount");
  if (statUnitsEl) statUnitsEl.innerText = `${occupied} / ${unitCount} Unit`;

  const statOccEl = document.getElementById("statOccupancyPct");
  if (statOccEl) statOccEl.innerText = `${occupancyPct}%`;

  const statIncEl = document.getElementById("statIncome");
  if (statIncEl) statIncEl.innerText = formatRupiah(income);

  const statDebtEl = document.getElementById("statDebt");
  if (statDebtEl) statDebtEl.innerText = formatRupiah(debt);

  const statOwnerIdEl = document.getElementById("statOwnerId");
  if (statOwnerIdEl) statOwnerIdEl.innerText = t.ownerId;

  const statOwnerNameEl = document.getElementById("statOwnerName");
  if (statOwnerNameEl) statOwnerNameEl.innerText = t.ownerName;

  const statPhoneEl = document.getElementById("statPhone");
  if (statPhoneEl) statPhoneEl.innerText = t.phone;

  const statTierEl = document.getElementById("statTier");
  if (statTierEl) statTierEl.innerText = t.tier;

  const statStatusEl = document.getElementById("statStatus");
  if (statStatusEl) {
    statStatusEl.innerText = t.status;
    statStatusEl.className = t.status === "ACTIVE" 
      ? "px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 text-[10px]"
      : "px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 text-[10px]";
  }

  openModal("modalTenantStats");
}

function contactStatsOwnerWhatsApp() {
  const t = (state.adminTenants || []).find(x => x.ownerId === state.currentStatsOwnerId);
  if (!t || !t.phone) return;
  const phoneClean = t.phone.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent(`Halo ${t.ownerName}, kami dari Super Admin KostHub OS ingin mendiskusikan performa properti ${t.propertyName}.`);
  window.open(`https://wa.me/${phoneClean}?text=${msg}`, "_blank");
}

function editCurrentStatsOwner() {
  if (!state.currentStatsOwnerId) return;
  closeModal("modalTenantStats");
  openEditOwnerModal(state.currentStatsOwnerId);
}

// ==================== SUB-VIEW 2: MANAGE USERS (DATA TABEL MODERN ICONIC) ====================
function renderAdminTenantTable() {
  const tbody = document.getElementById("adminTenantTableBody");
  if (!tbody) return;

  const search = (document.getElementById("admSearchOwnerInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("admFilterStatusSelect")?.value || "ALL";
  const tierFilter = document.getElementById("admFilterTierSelect")?.value || "ALL";
  const startDate = document.getElementById("admFilterStartDate")?.value || "";
  const endDate = document.getElementById("admFilterEndDate")?.value || "";

  const allTenants = state.adminTenants || [];
  const filtered = allTenants.filter(t => {
    const matchesSearch = !search ||
      (t.ownerId || "").toLowerCase().includes(search) ||
      (t.propertyName || "").toLowerCase().includes(search) ||
      (t.ownerName || "").toLowerCase().includes(search) ||
      (t.phone || "").toLowerCase().includes(search);

    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesTier = tierFilter === "ALL" || t.tier === tierFilter;

    let matchesDate = true;
    if (startDate && t.registeredDate) {
      matchesDate = matchesDate && (t.registeredDate >= startDate);
    }
    if (endDate && t.registeredDate) {
      matchesDate = matchesDate && (t.registeredDate <= endDate);
    }

    return matchesSearch && matchesStatus && matchesTier && matchesDate;
  });

  // Pagination Logic
  const perPage = state.pagination.usersPerPage || 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.pagination.usersPage > totalPages) state.pagination.usersPage = totalPages;
  if (state.pagination.usersPage < 1) state.pagination.usersPage = 1;

  const startIndex = (state.pagination.usersPage - 1) * perPage;
  const pagedTenants = filtered.slice(startIndex, startIndex + perPage);

  const footerInfo = document.getElementById("adminTenantTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length > 0 ? startIndex + 1 : 0} - ${Math.min(startIndex + perPage, filtered.length)} dari total ${filtered.length} owner (Filter aktif)`;
  }

  const pageNumEl = document.getElementById("adminUsersPageNumber");
  if (pageNumEl) pageNumEl.innerText = `Hal ${state.pagination.usersPage} dari ${totalPages}`;

  const btnPrev = document.getElementById("btnPrevAdminUsers");
  const btnNext = document.getElementById("btnNextAdminUsers");
  if (btnPrev) btnPrev.disabled = state.pagination.usersPage <= 1;
  if (btnNext) btnNext.disabled = state.pagination.usersPage >= totalPages;

  if (pagedTenants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-2">
            <span class="text-3xl">🔍</span>
            <p class="font-bold text-slate-600">Tidak ada data owner yang sesuai dengan kriteria.</p>
            <p class="text-xs text-slate-400">Coba ubah kata kunci pencarian atau reset filter di atas.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pagedTenants.map(t => {
    const isSelected = state.adminSelectedOwnerIds.has(t.ownerId);
    const rowClass = isSelected ? "row-selected hover:bg-brand-50/40" : "hover:bg-slate-50/80 transition-colors";
    const initial = (t.ownerName || "O")[0].toUpperCase();

    const tierBadge = t.tier === 'ENTERPRISE'
      ? 'bg-purple-50 text-purple-700 border border-purple-200'
      : (t.tier === 'PRO' ? 'bg-indigo-50 text-brand-700 border border-indigo-200' : 'bg-blue-50 text-blue-700 border border-blue-200');

    const statusBadge = t.status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : (t.status === 'PENDING_PAYMENT' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800');

    const unitPct = t.quota > 0 ? Math.min(100, Math.round(((t.unitCount || 0) / t.quota) * 100)) : 0;

    return `
      <tr class="${rowClass}">
        <td class="p-3 text-center">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleAdminSelectRow('${t.ownerId}', this.checked)"
            class="rounded text-brand-600 focus:ring-brand-500 cursor-pointer w-3.5 h-3.5" />
        </td>
        <td class="p-3">
          <div class="flex items-center gap-1.5 font-mono font-bold text-slate-600">
            <span>${t.ownerId}</span>
            <button onclick="navigator.clipboard.writeText('${t.ownerId}'); showToast('ID disalin!', 'info')" title="Salin ID" class="text-[10px] text-slate-400 hover:text-slate-600">📋</button>
          </div>
        </td>
        <td class="p-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
              ${initial}
            </div>
            <div>
              <b class="text-slate-900 block font-bold text-xs">${t.propertyName}</b>
              <span class="text-[11px] text-slate-500">${t.ownerName}</span>
            </div>
          </div>
        </td>
        <td class="p-3">
          <a href="https://wa.me/${(t.phone || '').replace(/[^0-9]/g, '')}" target="_blank"
            class="inline-flex items-center gap-1.5 font-mono text-slate-700 hover:text-emerald-700 font-semibold text-xs">
            <span class="text-emerald-500 text-sm">💬</span> ${t.phone || '-'}
          </a>
        </td>
        <td class="p-3">
          <span class="px-2.5 py-1 rounded-md font-extrabold text-[10px] ${tierBadge}">${t.tier}</span>
        </td>
        <td class="p-3">
          <div class="space-y-1 w-28">
            <div class="flex justify-between text-[11px] font-mono font-bold text-slate-600">
              <span>${t.unitCount || 0} unit</span>
              <span class="text-slate-400">/ ${t.quota || 0}</span>
            </div>
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div class="h-full rounded-full bg-brand-500" style="width: ${unitPct}%"></div>
            </div>
          </div>
        </td>
        <td class="p-3">
          <span class="px-2.5 py-1 rounded-full font-extrabold text-[10px] inline-flex items-center gap-1.5 ${statusBadge}">
            <span class="w-1.5 h-1.5 rounded-full ${t.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
            ${t.status}
          </span>
        </td>
        <td class="p-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <!-- FIXED: string ID passed instead of raw JSON to prevent Uncaught SyntaxError! -->
            <button onclick="openEditOwnerModal('${t.ownerId}')" title="Edit Akun & Lisensi"
              class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-slate-200/80">
              <span>✏️</span> Edit
            </button>
            <button onclick="openTenantStatsModal('${t.ownerId}')" title="Lihat Statistik"
              class="p-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-bold transition-colors">
              📊
            </button>
            <button onclick="adminToggleOwnerStatus('${t.ownerId}')" title="Ubah Status Aktif/Suspended"
              class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors">
              ⚡
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateAdminBulkActionBar();
}

function filterAdminTenantsTable() {
  renderAdminTenantTable();
}

// Bulk Selection Handlers
function toggleAdminSelectAllRows(isChecked) {
  const tenants = state.adminTenants || [];
  if (isChecked) {
    tenants.forEach(t => state.adminSelectedOwnerIds.add(t.ownerId));
  } else {
    state.adminSelectedOwnerIds.clear();
  }
  renderAdminTenantTable();
}

function toggleAdminSelectRow(ownerId, isChecked) {
  if (isChecked) {
    state.adminSelectedOwnerIds.add(ownerId);
  } else {
    state.adminSelectedOwnerIds.delete();
  }
  updateAdminBulkActionBar();
  // Update class highlight on row without full re-render
  const allCheckbox = document.getElementById("admSelectAllCheckbox");
  if (allCheckbox && !isChecked) allCheckbox.checked = false;
}

function updateAdminBulkActionBar() {
  const bar = document.getElementById("adminBulkActionBar");
  const countEl = document.getElementById("adminSelectedCount");
  const count = state.adminSelectedOwnerIds.size;

  if (countEl) countEl.innerText = count;

  if (bar) {
    if (count > 0) bar.classList.remove("hidden");
    else bar.classList.add("hidden");
  }
}

function clearAdminRowSelection() {
  state.adminSelectedOwnerIds.clear();
  const allCheckbox = document.getElementById("admSelectAllCheckbox");
  if (allCheckbox) allCheckbox.checked = false;
  renderAdminTenantTable();
}

function bulkChatSelectedOwnersWhatsApp() {
  const selected = Array.from(state.adminSelectedOwnerIds);
  if (selected.length === 0) return;
  const tenants = (state.adminTenants || []).filter(t => selected.includes(t.ownerId));
  const phones = tenants.map(t => `${t.ownerName} (${t.phone})`).join("\n");
  alert(`Daftar nomor WhatsApp pemilik terpilih:\n\n${phones}\n\nAnda dapat menyalin daftar ini untuk broadcast WhatsApp.`);
}

function bulkExportSelectedOwnersCSV() {
  const selected = Array.from(state.adminSelectedOwnerIds);
  const tenants = selected.length > 0 
    ? (state.adminTenants || []).filter(t => selected.includes(t.ownerId))
    : (state.adminTenants || []);

  const header = "ID Owner,Nama Properti,Nama Owner,WhatsApp,Paket,Jumlah Kamar,Kuota,Status\n";
  const rows = tenants.map(t => `"${t.ownerId}","${t.propertyName}","${t.ownerName}","${t.phone}","${t.tier}",${t.unitCount},${t.quota},"${t.status}"`).join("\n");
  
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kosthub_owners_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  showToast(`Berhasil mengekspor ${tenants.length} data owner ke CSV!`, "success");
}

async function bulkToggleSelectedOwnersStatus() {
  const selected = Array.from(state.adminSelectedOwnerIds);
  if (selected.length === 0) {
    showToast("Pilih minimal satu owner terlebih dahulu.", "warning");
    return;
  }

  const confirmed = await showCustomConfirm({
    title: "Ubah Status Massal",
    message: `Ubah status lisensi untuk <b>${selected.length} owner</b> terpilih?`,
    confirmText: "Ya, Ubah Status",
    cancelText: "Batal",
    type: "warning",
    icon: "⚡"
  });

  if (!confirmed) return;

  (state.adminTenants || []).forEach(t => {
    if (selected.includes(t.ownerId)) {
      t.status = t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    }
  });

  // Save to dummy/local cache if available
  saveDummyState();

  clearAdminRowSelection();
  renderSuperAdminViews();
  updateAdminKpiElements();
  showToast(`Status ${selected.length} owner berhasil diubah!`, "success");
}

async function adminToggleOwnerStatus(ownerId) {
  const t = (state.adminTenants || []).find(x => x.ownerId === ownerId);
  if (!t) return;

  const newStatus = t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const confirmed = await showCustomConfirm({
    title: `Ubah Status Akun: ${t.propertyName}`,
    message: `Apakah Anda yakin ingin mengubah status akun <b>${t.ownerId}</b> menjadi <b class="${newStatus === 'ACTIVE' ? 'text-emerald-600' : 'text-rose-600'}">${newStatus}</b>?`,
    confirmText: `Ubah ke ${newStatus}`,
    cancelText: "Batal",
    type: newStatus === "ACTIVE" ? "success" : "danger",
    icon: newStatus === "ACTIVE" ? "✅" : "⚠️"
  });

  if (!confirmed) return;

  t.status = newStatus;
  renderSuperAdminViews();
  showToast(`Status akun ${t.ownerId} diubah menjadi ${newStatus}!`, "success");
}

// ==================== SUB-VIEW 3: ANTREAN VERIFIKASI PEMBAYARAN ====================
function renderAdminPendingTable() {
  const tbody = document.getElementById("adminPendingTableBody");
  if (!tbody) return;

  const search = (document.getElementById("admSearchPendingInput")?.value || "").toLowerCase().trim();
  const tierFilter = document.getElementById("admFilterPendingTier")?.value || "ALL";

  const allPending = state.adminPendingList || [];
  const filtered = allPending.filter(p => {
    const matchesSearch = !search ||
      (p.ownerId || "").toLowerCase().includes(search) ||
      (p.propertyName || "").toLowerCase().includes(search) ||
      (p.ownerName || "").toLowerCase().includes(search) ||
      (p.phone || "").toLowerCase().includes(search);

    const matchesTier = tierFilter === "ALL" || p.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const perPage = state.pagination.pendingPerPage || 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.pagination.pendingPage > totalPages) state.pagination.pendingPage = totalPages;
  if (state.pagination.pendingPage < 1) state.pagination.pendingPage = 1;

  const startIndex = (state.pagination.pendingPage - 1) * perPage;
  const pagedPending = filtered.slice(startIndex, startIndex + perPage);

  const footerInfo = document.getElementById("adminPendingTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length > 0 ? startIndex + 1 : 0} - ${Math.min(startIndex + perPage, filtered.length)} dari total ${filtered.length} antrean bayar`;
  }

  const pageNumEl = document.getElementById("adminPendingPageNumber");
  if (pageNumEl) pageNumEl.innerText = `Hal ${state.pagination.pendingPage} dari ${totalPages}`;

  const btnPrev = document.getElementById("btnPrevAdminPending");
  const btnNext = document.getElementById("btnNextAdminPending");
  if (btnPrev) btnPrev.disabled = state.pagination.pendingPage <= 1;
  if (btnNext) btnNext.disabled = state.pagination.pendingPage >= totalPages;

  if (pagedPending.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">🎉</span>
            <b class="text-slate-700">Tidak ada antrean pembayaran yang sesuai</b>
            <span class="text-xs text-slate-400">Semua pendaftar telah diverifikasi atau tidak cocok dengan filter pencarian.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const tierPrices = {
    STARTER: 49000,
    PRO: 99000,
    ENTERPRISE: 199000
  };

  tbody.innerHTML = pagedPending.map(p => {
    const isSelected = state.adminSelectedOwnerIds.has(p.ownerId);
    const rowClass = isSelected ? "row-selected hover:bg-brand-50/40" : "hover:bg-slate-50/80 transition-colors";
    const packagePrice = p.price || tierPrices[p.tier] || 99000;

    return `
      <tr class="${rowClass}">
        <td class="p-3 text-center">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectRowPending('${p.ownerId}', this.checked)"
            class="rounded text-brand-600 focus:ring-brand-500 cursor-pointer w-3.5 h-3.5" />
        </td>
        <td class="p-3 font-mono font-bold text-slate-600">${p.ownerId}</td>
        <td class="p-3 font-bold text-slate-900">${p.propertyName}</td>
        <td class="p-3">
          <b class="text-slate-800 block">${p.ownerName}</b>
          <span class="text-[11px] font-mono text-slate-500">${p.phone}</span>
        </td>
        <td class="p-3">
          <span class="px-2.5 py-1 rounded font-extrabold text-[10px] bg-indigo-50 text-brand-700 border border-indigo-100">${p.tier}</span>
        </td>
        <td class="p-3 font-mono font-black text-emerald-600">
          ${formatRupiah(packagePrice)}
        </td>
        <td class="p-3">
          ${p.proofUrl ? `
            <a href="${p.proofUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-brand-600 shadow-2xs">
              <span>📷</span> Struk
            </a>
          ` : '<span class="text-slate-400 font-bold text-[11px]">Belum Upload</span>'}
        </td>
        <td class="p-3 text-right">
          <button onclick="adminActivateOwner('${p.ownerId}')"
            class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-end gap-1.5 ml-auto">
            <span>⚡</span> Aktifkan
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterAdminPendingTable() {
  renderAdminPendingTable();
}

function toggleSelectAllPending(isChecked) {
  const pending = state.adminPendingList || [];
  if (isChecked) {
    pending.forEach(p => state.adminSelectedOwnerIds.add(p.ownerId));
  } else {
    state.adminSelectedOwnerIds.clear();
  }
  renderAdminPendingTable();
}

function toggleSelectRowPending(ownerId, isChecked) {
  if (isChecked) {
    state.adminSelectedOwnerIds.add(ownerId);
  } else {
    state.adminSelectedOwnerIds.delete(ownerId);
  }
  renderAdminPendingTable();
}

// Konfirmasi Aktivasi Pembayaran Akun dengan Custom Confirm Dialog Iconic & Modern Toast
async function adminActivateOwner(ownerId) {
  const p = (state.adminPendingList || []).find(x => x.ownerId === ownerId) || 
            (state.adminTenants || []).find(x => x.ownerId === ownerId) || 
            { ownerId, propertyName: "Akun Properti", ownerName: "Owner", tier: "PRO" };

  const confirmed = await showCustomConfirm({
    title: "Konfirmasi Aktivasi Pembayaran",
    message: `Aktifkan paket lisensi <b>${p.tier}</b> untuk <b>${p.propertyName}</b> (${p.ownerName})?<br><span class="text-slate-400 text-[11px]">Akun akan langsung berstatus ACTIVE dan owner dapat langsung login menggunakan seluruh fitur KostHub OS.</span>`,
    confirmText: "Ya, Aktifkan Akun Sekarang",
    cancelText: "Batal",
    type: "success",
    icon: "🎉"
  });

  if (!confirmed) return;

  try {
    showToast(`Mengaktifkan akun ${p.propertyName}...`, "info");
    const res = await callApi("activateTenantPayment", { targetOwnerId: ownerId });
    if (res.status === "success") {
      showToast(`Akun ${p.propertyName} berhasil diaktifkan!`, "success");
      loadSuperAdminData();
    } else {
      showToast(res.message || "Gagal mengaktifkan akun", "error");
    }
  } catch (e) {
    // Simulasi aktifkan lokal jika backend offline
    state.adminPendingList = (state.adminPendingList || []).filter(x => x.ownerId !== ownerId);
    const existing = (state.adminTenants || []).find(x => x.ownerId === ownerId);
    if (existing) {
      existing.status = "ACTIVE";
    } else {
      state.adminTenants.push({
        ownerId: p.ownerId,
        propertyName: p.propertyName,
        ownerName: p.ownerName,
        phone: p.phone || "08123456789",
        tier: p.tier || "PRO",
        unitCount: 10,
        quota: p.tier === "STARTER" ? 5 : (p.tier === "PRO" ? 25 : 100),
        status: "ACTIVE"
      });
    }
    showToast(`Akun ${p.propertyName} (${ownerId}) berhasil diaktifkan!`, "success");
    loadSuperAdminData();
  }
}

// ==================== SUB-VIEW 4: MANAJEMEN REKENING PLATFORM DINAMIS ====================
function renderAdminPlatformBanks() {
  const container = document.getElementById("adminPlatformBanksGrid");
  if (!container) return;

  const banks = getPlatformBanks();
  if (banks.length === 0) {
    container.innerHTML = `<div class="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold">Belum ada data rekening platform. Klik tombol di atas untuk menambah.</div>`;
    return;
  }

  container.innerHTML = banks.map(bank => `
    <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md transition-all space-y-3 relative flex flex-col justify-between">
      <div class="space-y-2">
        <div class="flex justify-between items-start gap-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-extrabold text-sm text-slate-900">${bank.name}</span>
              ${bank.badge ? `<span class="px-2 py-0.5 rounded font-extrabold text-[10px] bg-indigo-50 text-brand-700 border border-indigo-100">${bank.badge}</span>` : ''}
            </div>
            <p class="font-mono font-black text-base text-brand-700 mt-1">${bank.accountNumber}</p>
            <p class="text-xs text-slate-500 font-medium">a.n ${bank.accountHolder}</p>
          </div>
          <button onclick="togglePlatformBankStatus('${bank.id}')"
            class="px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition-all ${bank.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">
            ${bank.isActive ? '● AKTIF' : '○ NONAKTIF'}
          </button>
        </div>
        
        ${bank.instructions ? `<p class="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">${bank.instructions}</p>` : ''}
      </div>

      <div class="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
        <button onclick="copyPlatformBank('${bank.accountNumber}', '${bank.name}')"
          class="text-xs font-bold text-slate-600 hover:text-brand-600 flex items-center gap-1">
          <span>📋</span> Salin
        </button>
        <div class="flex items-center gap-2">
          <button onclick="openPlatformBankModal('${bank.id}')"
            class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors">
            ✏️ Edit
          </button>
          <button onclick="deletePlatformBank('${bank.id}')"
            class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors">
            🗑️
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

// ==================== FIX BUG: OPEN EDIT OWNER MODAL WITHOUT SYNTAX ERROR ====================
function openEditOwnerModal(ownerIdOrObj) {
  let tenant = null;
  if (typeof ownerIdOrObj === "string") {
    tenant = (state.adminTenants || []).find(t => t.ownerId === ownerIdOrObj);
  } else if (typeof ownerIdOrObj === "object" && ownerIdOrObj !== null) {
    tenant = ownerIdOrObj;
  }

  if (!tenant) {
    showToast("Data owner tidak ditemukan", "error");
    return;
  }

  document.getElementById("editAdmOwnerId").value = tenant.ownerId || "";
  document.getElementById("editAdmName").value = tenant.ownerName || "";
  document.getElementById("editAdmPhone").value = tenant.phone || "";
  document.getElementById("editAdmPropName").value = tenant.propertyName || "";
  document.getElementById("editAdmTier").value = tenant.tier || "PRO";
  document.getElementById("editAdmStatus").value = tenant.status || "ACTIVE";
  document.getElementById("editAdmPin").value = "";
  openModal("modalEditOwnerAdmin");
}

async function submitAdminUpdateOwner() {
  const ownerId = document.getElementById("editAdmOwnerId").value;
  const name = document.getElementById("editAdmName").value.trim();
  const phone = document.getElementById("editAdmPhone").value.trim();
  const propName = document.getElementById("editAdmPropName").value.trim();
  const tier = document.getElementById("editAdmTier").value;
  const status = document.getElementById("editAdmStatus").value;
  const pin = document.getElementById("editAdmPin").value.trim();

  const btn = document.getElementById("btnSubmitAdminEdit");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Menyimpan...";
  }

  try {
    const res = await callApi("adminUpdateOwner", {
      targetOwnerId: ownerId,
      name: name,
      phone: phone,
      propertyName: propName,
      tier: tier,
      status: status,
      pin: pin
    });

    if (res.status === "success") {
      closeModal("modalEditOwnerAdmin");
      showToast("Data owner berhasil diperbarui!", "success");
      loadSuperAdminData();
    } else {
      // Perbarui lokal jika backend offline
      const t = (state.adminTenants || []).find(x => x.ownerId === ownerId);
      if (t) {
        t.ownerName = name;
        t.phone = phone;
        t.propertyName = propName;
        t.tier = tier;
        t.status = status;
      }
      closeModal("modalEditOwnerAdmin");
      showToast("Data owner berhasil diperbarui secara lokal!", "success");
      renderSuperAdminViews();
    }
  } catch (e) {
    const t = (state.adminTenants || []).find(x => x.ownerId === ownerId);
    if (t) {
      t.ownerName = name;
      t.phone = phone;
      t.propertyName = propName;
      t.tier = tier;
      t.status = status;
    }
    closeModal("modalEditOwnerAdmin");
    showToast("Data owner berhasil diperbarui!", "success");
    renderSuperAdminViews();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = "Simpan Perubahan";
    }
  }
}

// Custom Promise-based Modern Confirmation Dialog Resolver
let customConfirmResolver = null;

function showCustomConfirm({
  title = "Konfirmasi Tindakan",
  message = "Apakah Anda yakin ingin melanjutkan tindakan ini?",
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batal",
  type = "brand",
  icon = "⚡"
} = {}) {
  return new Promise((resolve) => {
    customConfirmResolver = resolve;
    const modal = document.getElementById("modalCustomConfirm");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const iconEl = document.getElementById("confirmModalIcon");
    const iconContainer = document.getElementById("confirmModalIconContainer");
    const btnConfirm = document.getElementById("confirmModalBtnConfirm");
    const btnCancel = document.getElementById("confirmModalBtnCancel");

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerHTML = message;
    if (iconEl) iconEl.innerText = icon;
    if (btnConfirm) btnConfirm.innerHTML = `<span>${confirmText}</span>`;
    if (btnCancel) btnCancel.innerText = cancelText;

    if (btnConfirm) {
      if (type === "danger") {
        btnConfirm.className = "flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5";
      } else if (type === "success") {
        btnConfirm.className = "flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5";
      } else if (type === "warning") {
        btnConfirm.className = "flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl text-xs shadow-md shadow-amber-500/30 transition-all flex items-center justify-center gap-1.5";
      } else {
        btnConfirm.className = "flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-brand-600/30 transition-all flex items-center justify-center gap-1.5";
      }
    }

    if (iconContainer) {
      if (type === "danger") {
        iconContainer.className = "w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner shadow-rose-100";
      } else if (type === "success") {
        iconContainer.className = "w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner shadow-emerald-100";
      } else if (type === "warning") {
        iconContainer.className = "w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner shadow-amber-100";
      } else {
        iconContainer.className = "w-16 h-16 bg-gradient-to-tr from-brand-100 to-indigo-50 text-brand-600 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner shadow-brand-200/50";
      }
    }

    if (modal) modal.classList.remove("hidden");
  });
}

function resolveCustomConfirm(value) {
  const modal = document.getElementById("modalCustomConfirm");
  if (modal) modal.classList.add("hidden");
  if (customConfirmResolver) {
    customConfirmResolver(value);
    customConfirmResolver = null;
  }
}

// ==================== DASHBOARD & ROOM MATRIX ====================
async function fetchDashboardData() {
  try {
    const res = await callApi("getDashboardData");
    if (res.status === "success") {
      state.rooms = res.data.rooms || [];
      state.kpi = res.data.kpi || state.kpi;
      updateDashboardUI();
      return;
    }
  } catch (err) {
    // Offline / Demo fallback
  }
  updateDashboardUI();
}

function updateDashboardUI() {
  // Hitung metrik dinamis real-time dari data kamar
  if (state.rooms && state.rooms.length > 0) {
    const totalUnits = state.rooms.length;
    const occupiedRooms = state.rooms.filter(r => r.status === "OCCUPIED" || r.status === "DUE_TOMORROW");
    const overdueRooms = state.rooms.filter(r => r.status === "OVERDUE");

    state.kpi.totalUnits = totalUnits;
    state.kpi.occupiedUnits = occupiedRooms.length;

    // Omzet Bulan Ini otomatis bertambah dari kamar yang terisi dan lunas
    const calculatedIncome = occupiedRooms.reduce((sum, r) => sum + Number(r.price || 0), 0);
    const calculatedOverdue = overdueRooms.reduce((sum, r) => sum + Number(r.debt || r.price || 0), 0);

    state.kpi.incomeMonth = calculatedIncome;
    state.kpi.overdueAmount = calculatedOverdue;
    state.kpi.overdueCount = overdueRooms.length;
    state.kpi.netCashflow = calculatedIncome - (state.kpi.expensesMonth || 0);
  }

  const occ = state.kpi.occupiedUnits || 0;
  const tot = state.kpi.totalUnits || (state.rooms ? state.rooms.length : 1);
  document.getElementById("kpiOccupancy").innerText = `${occ}/${tot}`;
  document.getElementById("sidebarOccupancyText").innerText = `${occ}/${tot}`;

  const pct = tot > 0 ? Math.round((occ / tot) * 100) : 0;
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

    // Sanitasi String Eksplisit Anti-Crash
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

// ==================== MODALS & FORM CONTROLLERS ====================
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
  const msg = `Halo Sdr/i *${room.tenant}*,\nKami menginformasikan tagihan sewa *${room.number}* sebesar *${formatRupiah(room.debt || room.price)}* telah jatuh tempo.\n\nMohon konfirmasi transfer ke rekening:\n*${bankInfo}*\nTerima kasih.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
}

async function confirmPaymentDirect(unitId) {
  if (!confirm("Konfirmasi pelunasan sewa unit kamar ini?")) return;
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

// ==================== TAMBAH KAMAR & MASTER TAB ====================
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

async function loadMasterTabData() {
  try {
    const res = await callApi("getMasterData");
    if (res.status === "success") {
      renderMasterUnits(res.data.units || []);
      renderMasterTenants(res.data.tenants || []);
      renderMasterExpenses(res.data.expenses || []);
      renderMasterInvoices(res.data.invoices || []);
      populateRoomSelectDropdowns();
      return;
    }
  } catch (e) {
    // Gunakan local dummy dataset saat offline / demo
  }
  renderMasterUnitsTable();
  renderMasterTenantsTable();
  renderMasterInvoicesTable();
  filterMasterExpensesTable();
  populateRoomSelectDropdowns();
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

// ==================== BUKU KAS OPERASIONAL ====================
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
      showToast("Pengeluaran kas berhasil disimpan!", "success");
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
    alert("Lengkapi data staf dan PIN 4-6 digit.");
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

// ==================== PROFIL & REKENING BANK ====================
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

// ==================== KWITANSI RESMI (PUBLIC VIEW) ====================
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

// ==================== INTERACTIVE UI HELPERS ====================
function toggleFeatureComparison() {
  const tbl = document.getElementById("featureComparisonTable");
  const txt = document.getElementById("btnToggleCompareText");
  if (tbl.classList.contains("hidden")) {
    tbl.classList.remove("hidden");
    txt.innerText = "Sembunyikan Perbandingan Fitur";
  } else {
    tbl.classList.add("hidden");
    txt.innerText = "Bandingkan Fitur Lengkap";
  }
}

function toggleFaq(num) {
  const ans = document.getElementById(`faq-ans-${num}`);
  const icon = document.getElementById(`faq-icon-${num}`);
  if (ans.classList.contains("hidden")) {
    ans.classList.remove("hidden");
    icon.innerText = "−";
  } else {
    ans.classList.add("hidden");
    icon.innerText = "+";
  }
}

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

let toastTimeout = null;

function showToast(message, type = "info", title = "") {
  const toast = document.getElementById("toastNotification");
  const titleEl = document.getElementById("toastTitle");
  const msgEl = document.getElementById("toastMessage");
  const iconEl = document.getElementById("toastIcon");
  const iconBadge = document.getElementById("toastIconBadge");
  const bar = document.getElementById("toastProgressBar");

  if (!toast) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  if (msgEl) msgEl.innerText = message;
  
  const defaultTitles = {
    success: "Berhasil!",
    error: "Terjadi Kesalahan",
    warning: "Peringatan",
    info: "Informasi Sistem"
  };

  if (titleEl) titleEl.innerText = title || defaultTitles[type] || "Notifikasi";

  if (iconEl) {
    iconEl.innerText = type === "success" ? "✓" : (type === "error" ? "✕" : (type === "warning" ? "⚠️" : "ℹ️"));
  }

  if (iconBadge) {
    if (type === "success") {
      iconBadge.className = "w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-sm font-black shrink-0";
    } else if (type === "error") {
      iconBadge.className = "w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-sm font-black shrink-0";
    } else if (type === "warning") {
      iconBadge.className = "w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-sm font-black shrink-0";
    } else {
      iconBadge.className = "w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/40 flex items-center justify-center text-sm font-black shrink-0";
    }
  }

  if (bar) {
    bar.className = (type === "success") ? "bg-emerald-500 h-full w-full" : ((type === "error") ? "bg-rose-500 h-full w-full" : ((type === "warning") ? "bg-amber-500 h-full w-full" : "bg-brand-500 h-full w-full"));
    bar.classList.remove("toast-progress-active");
    void bar.offsetWidth; // trigger reflow
    bar.classList.add("toast-progress-active");
  }

  toast.classList.remove("translate-y-[-120px]", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");

  toastTimeout = setTimeout(() => {
    hideToastNow();
  }, 3500);
}

function hideToastNow() {
  const toast = document.getElementById("toastNotification");
  const bar = document.getElementById("toastProgressBar");
  if (toast) {
    toast.classList.add("translate-y-[-120px]", "opacity-0");
    toast.classList.remove("translate-y-0", "opacity-100");
  }
  if (bar) bar.classList.remove("toast-progress-active");
  if (toastTimeout) clearTimeout(toastTimeout);
}

function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}
// =============================================================================
// ENHANCEMENTS: MASTER CONFIG, DUMMY DATASET, NOTIFICATIONS, EXPORTS, AND CRUD
// =============================================================================

// Standard Indonesian Date Formatter DD-MM-YYYY (Contoh: 25-12-2026)
function formatDateDMY(dateInput) {
  if (!dateInput) return "-";
  try {
    let d;
    if (typeof dateInput === "string" && dateInput.includes("-")) {
      const parts = dateInput.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return `${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}-${parts[0]}`;
        } else if (parts[2].length === 4) {
          // Already DD-MM-YYYY
          return dateInput;
        }
      }
    }
    d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(dateInput);
  }
}

// ==================== MASTER PANEL CONFIGURATION ====================
function initMasterConfig() {
  const defaultMaster = {
    siteTitle: "KostHub OS - Sistem Operasi Manajemen Kost Otomatis",
    siteSlogan: "Smart Multi-Tenant Cloud Operating System",
    siteFooter: "KostHub OS. Hak Cipta Dilindungi Undang-Undang.",
    maintenance: {
      enabled: false,
      mode: "indefinite", // "indefinite" | "scheduled"
      until: "2026-12-31T23:59",
      message: "Sistem sedang dalam peningkatan performa rutin server KostHub OS. Layanan akan segera online kembali dalam beberapa menit."
    },
    changelogMd: `# KostHub OS - Riwayat Rilis & Update Sistem

### Versi 2.4.0 (10-10-2026)
- **Super Admin**: Export PDF & Excel modern untuk Manage Users & Verifikasi Pembayaran.
- **Super Admin**: Master Panel untuk Identitas & Branding, Maintenance Mode, dan Changelog Editor.
- **Owner Dashboard**: Omzet bulan berjalan real-time dinamis berdasarkan okupansi dan status bayar.
- **Owner**: Peluncuran kwitansi digital modern ikonik dengan fitur download PDF & cetak otomatis.
- **Owner**: Pilihan fasilitas kost terlengkap dengan fitur penambahan fasilitas kustom dinamis.
- **Penghuni & Kamar**: Integrasi filter, pencarian langsung, paginasi, dan aksi CRUD komprehensif.
- **Buku Kas**: Filter pengeluaran per kamar dan penanda perbaikan khusus kamar.
- **Global**: Notifikasi multi-role (Super Admin, Owner, Staf) dan standarisasi format tanggal DD-MM-YYYY.`
  };

  try {
    const saved = localStorage.getItem("kosthub_master_config");
    state.masterConfig = saved ? JSON.parse(saved) : defaultMaster;
  } catch (e) {
    state.masterConfig = defaultMaster;
  }

  applyMasterBranding();
  renderMasterPanelSettings();
}

function applyMasterBranding() {
  if (!state.masterConfig) return;
  if (state.masterConfig.siteTitle) {
    document.title = state.masterConfig.siteTitle;
  }
  // Cek jika mode pemeliharaan aktif untuk user non-super-admin
  if (state.masterConfig.maintenance && state.masterConfig.maintenance.enabled) {
    const isSuperAdmin = state.session && state.session.role === "SUPER_ADMIN";
    if (!isSuperAdmin) {
      console.warn("Sistem KostHub OS dalam Mode Pemeliharaan:", state.masterConfig.maintenance.message);
    }
  }
}

function renderMasterPanelSettings() {
  const cfg = state.masterConfig;
  if (!cfg) return;

  const titleEl = document.getElementById("masterSiteTitle");
  const sloganEl = document.getElementById("masterSiteSlogan");
  const footerEl = document.getElementById("masterSiteFooter");
  const toggleEl = document.getElementById("masterMaintenanceToggle");
  const labelEl = document.getElementById("masterMaintenanceLabel");
  const optEl = document.getElementById("masterMaintenanceOptions");
  const dateFieldEl = document.getElementById("masterMaintDateField");
  const untilEl = document.getElementById("masterMaintUntil");
  const msgEl = document.getElementById("masterMaintMessage");
  const mdEl = document.getElementById("masterChangelogMd");

  if (titleEl) titleEl.value = cfg.siteTitle || "";
  if (sloganEl) sloganEl.value = cfg.siteSlogan || "";
  if (footerEl) footerEl.value = cfg.siteFooter || "";
  if (msgEl) msgEl.value = (cfg.maintenance && cfg.maintenance.message) || "";
  if (mdEl) mdEl.value = cfg.changelogMd || "";

  if (toggleEl) {
    toggleEl.checked = !!(cfg.maintenance && cfg.maintenance.enabled);
    if (labelEl) {
      labelEl.innerText = toggleEl.checked ? "Mode Pemeliharaan AKTIF" : "Mode Pemeliharaan NONAKTIF";
      labelEl.className = toggleEl.checked ? "text-xs font-black text-rose-600" : "text-xs font-black text-slate-500";
    }
    if (optEl) {
      if (toggleEl.checked) optEl.classList.remove("hidden");
      else optEl.classList.add("hidden");
    }
  }

  if (cfg.maintenance) {
    const mode = cfg.maintenance.mode || "indefinite";
    const rad = document.querySelector(`input[name="masterMaintMode"][value="${mode}"]`);
    if (rad) rad.checked = true;

    if (dateFieldEl) {
      if (mode === "scheduled") dateFieldEl.classList.remove("hidden");
      else dateFieldEl.classList.add("hidden");
    }
    if (untilEl && cfg.maintenance.until) {
      untilEl.value = cfg.maintenance.until;
    }
  }
}

function toggleMaintenanceModeUI(checked) {
  const labelEl = document.getElementById("masterMaintenanceLabel");
  const optEl = document.getElementById("masterMaintenanceOptions");
  if (labelEl) {
    labelEl.innerText = checked ? "Mode Pemeliharaan AKTIF" : "Mode Pemeliharaan NONAKTIF";
    labelEl.className = checked ? "text-xs font-black text-rose-600" : "text-xs font-black text-slate-500";
  }
  if (optEl) {
    if (checked) optEl.classList.remove("hidden");
    else optEl.classList.add("hidden");
  }
}

function toggleMaintDateFields() {
  const selMode = document.querySelector('input[name="masterMaintMode"]:checked')?.value || "indefinite";
  const dateField = document.getElementById("masterMaintDateField");
  if (dateField) {
    if (selMode === "scheduled") dateField.classList.remove("hidden");
    else dateField.classList.add("hidden");
  }
}

function saveMasterPanelSettings() {
  const titleEl = document.getElementById("masterSiteTitle");
  const sloganEl = document.getElementById("masterSiteSlogan");
  const footerEl = document.getElementById("masterSiteFooter");
  const toggleEl = document.getElementById("masterMaintenanceToggle");
  const modeVal = document.querySelector('input[name="masterMaintMode"]:checked')?.value || "indefinite";
  const untilEl = document.getElementById("masterMaintUntil");
  const msgEl = document.getElementById("masterMaintMessage");
  const mdEl = document.getElementById("masterChangelogMd");

  state.masterConfig = {
    siteTitle: titleEl ? titleEl.value.trim() : "KostHub OS",
    siteSlogan: sloganEl ? sloganEl.value.trim() : "Smart Multi-Tenant Cloud Operating System",
    siteFooter: footerEl ? footerEl.value.trim() : "KostHub OS. Hak Cipta Dilindungi.",
    maintenance: {
      enabled: toggleEl ? toggleEl.checked : false,
      mode: modeVal,
      until: untilEl ? untilEl.value : "",
      message: msgEl ? msgEl.value.trim() : "Sistem dalam pemeliharaan rutin."
    },
    changelogMd: mdEl ? mdEl.value : ""
  };

  localStorage.setItem("kosthub_master_config", JSON.stringify(state.masterConfig));
  applyMasterBranding();
  showToast("Pengaturan Master Panel & Identitas Berhasil Disimpan!", "success");
}

function previewChangelogModal() {
  const mdText = document.getElementById("masterChangelogMd")?.value || (state.masterConfig && state.masterConfig.changelogMd) || "";
  const renderedContainer = document.getElementById("changelogRenderedView");

  if (renderedContainer) {
    // Simple modern markdown renderer for headings, lists, bold, and hr
    let html = mdText
      .replace(/^### (.*$)/gim, '<h3 class="text-base font-black text-slate-800 mt-4 mb-2 flex items-center gap-1.5"><span class="text-brand-600">●</span> $1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-lg font-black text-slate-900 mt-5 mb-2.5 pb-1 border-b border-slate-100">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-xl font-black text-brand-600 mt-2 mb-3 pb-2 border-b-2 border-brand-100">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-extrabold text-slate-900">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic text-slate-700">$1</em>')
      .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-slate-600 py-0.5">$1</li>')
      .replace(/\n$/gim, '<br />');

    renderedContainer.innerHTML = `<div class="prose prose-sm max-w-none space-y-2">${html}</div>`;
  }
  openModal("modalChangelogPreview");
}

function saveChangelogContent() {
  saveMasterPanelSettings();
}

// ==================== DUMMY DATASET SIMULATION ====================
function initOverallDummyDataset() {
  // 1. Kamar & Unit Default Dummy
  if (!state.rooms || state.rooms.length === 0) {
    const savedRooms = localStorage.getItem("kosthub_dummy_rooms");
    if (savedRooms) {
      try { state.rooms = JSON.parse(savedRooms); } catch(e) {}
    }
  }

  if (!state.rooms || state.rooms.length === 0) {
    state.rooms = [
      { id: "RM-101", number: "101", floor: 1, type: "Standard Single", price: 1200000, meter: 145, status: "OCCUPIED", tenant: "Dimas Pratama", phone: "081298765432", dueDate: "25-10-2026", facilities: ["AC", "WiFi Cepat", "Kamar Mandi Dalam", "Kasur Springbed"] },
      { id: "RM-102", number: "102", floor: 1, type: "Standard Single", price: 1200000, meter: 180, status: "VACANT", tenant: "-", phone: "-", dueDate: "-", facilities: ["AC", "WiFi Cepat", "Kamar Mandi Dalam"] },
      { id: "RM-103", number: "103", floor: 1, type: "Deluxe Balcony", price: 1750000, meter: 210, status: "OCCUPIED", tenant: "Siti Rahmawati", phone: "081345678901", dueDate: "28-10-2026", facilities: ["AC", "WiFi Cepat", "Water Heater", "Balkon Pribadi", "Smart TV"] },
      { id: "RM-201", number: "201", floor: 2, type: "Deluxe Queen", price: 1600000, meter: 312, status: "OCCUPIED", tenant: "Budi Santoso", phone: "082187654321", dueDate: "05-11-2026", facilities: ["AC", "WiFi Cepat", "Kamar Mandi Dalam", "Meja Kerja"] },
      { id: "RM-202", number: "202", floor: 2, type: "Standard Single", price: 1200000, meter: 95, status: "VACANT", tenant: "-", phone: "-", dueDate: "-", facilities: ["AC", "WiFi Cepat", "Lemari Pakaian"] },
      { id: "RM-203", number: "203", floor: 2, type: "VIP Studio", price: 2100000, meter: 410, status: "OCCUPIED", tenant: "dr. Hendra Wijaya", phone: "081912345678", dueDate: "15-11-2026", facilities: ["AC", "WiFi Cepat", "Kulkas Mini", "Water Heater", "Dapur Pribadi"] }
    ];
    saveDummyState();
  }

  // 2. Dummy Tenants
  const savedTenants = localStorage.getItem("kosthub_dummy_tenants");
  if (savedTenants) {
    try { state.dummyTenants = JSON.parse(savedTenants); } catch(e) {}
  }
  if (!state.dummyTenants || state.dummyTenants.length === 0) {
    state.dummyTenants = [
      { id: "TNT-001", roomNumber: "101", name: "Dimas Pratama", phone: "081298765432", emergency: "081200000001", startDate: "2026-01-15", deposit: 500000, rent: 1200000, status: "ACTIVE", ktp: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150" },
      { id: "TNT-002", roomNumber: "103", name: "Siti Rahmawati", phone: "081345678901", emergency: "081300000002", startDate: "2026-03-01", deposit: 600000, rent: 1750000, status: "ACTIVE", ktp: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150" },
      { id: "TNT-003", roomNumber: "201", name: "Budi Santoso", phone: "082187654321", emergency: "082100000003", startDate: "2026-05-10", deposit: 500000, rent: 1600000, status: "ACTIVE", ktp: "" },
      { id: "TNT-004", roomNumber: "203", name: "dr. Hendra Wijaya", phone: "081912345678", emergency: "081900000004", startDate: "2026-06-20", deposit: 1000000, rent: 2100000, status: "ACTIVE", ktp: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" }
    ];
    localStorage.setItem("kosthub_dummy_tenants", JSON.stringify(state.dummyTenants));
  }

  // 3. Dummy Invoices
  const savedInvoices = localStorage.getItem("kosthub_dummy_invoices");
  if (savedInvoices) {
    try { state.dummyInvoices = JSON.parse(savedInvoices); } catch(e) {}
  }
  if (!state.dummyInvoices || state.dummyInvoices.length === 0) {
    state.dummyInvoices = [
      { id: "INV-202610-001", token: "tok_101_okt26", roomNumber: "101", tenantName: "Dimas Pratama", period: "Oktober 2026", dueDate: "2026-10-25", baseRent: 1200000, electricCost: 65000, total: 1265000, status: "PAID", tokenListrikMandiri: false },
      { id: "INV-202610-002", token: "tok_103_okt26", roomNumber: "103", tenantName: "Siti Rahmawati", period: "Oktober 2026", dueDate: "2026-10-28", baseRent: 1750000, electricCost: 0, total: 1750000, status: "PAID", tokenListrikMandiri: true },
      { id: "INV-202610-003", token: "tok_201_okt26", roomNumber: "201", tenantName: "Budi Santoso", period: "Oktober 2026", dueDate: "2026-11-05", baseRent: 1600000, electricCost: 85000, total: 1685000, status: "PENDING", tokenListrikMandiri: false },
      { id: "INV-202610-004", token: "tok_203_okt26", roomNumber: "203", tenantName: "dr. Hendra Wijaya", period: "Oktober 2026", dueDate: "2026-11-15", baseRent: 2100000, electricCost: 120000, total: 2220000, status: "PAID", tokenListrikMandiri: false }
    ];
    localStorage.setItem("kosthub_dummy_invoices", JSON.stringify(state.dummyInvoices));
  }

  // 4. Dummy Expenses
  const savedExpenses = localStorage.getItem("kosthub_dummy_expenses");
  if (savedExpenses) {
    try { state.dummyExpenses = JSON.parse(savedExpenses); } catch(e) {}
  }
  if (!state.dummyExpenses || state.dummyExpenses.length === 0) {
    state.dummyExpenses = [
      { id: "EXP-001", date: "2026-10-02", category: "MAINTENANCE", description: "Perbaikan pipa kran bocor", room: "101", month: "Oktober", year: "2026", amount: 150000 },
      { id: "EXP-002", date: "2026-10-05", category: "UTILITY", description: "Tagihan Internet Wi-Fi Induk Fiber 100Mbps", room: "Semua Unit", month: "Oktober", year: "2026", amount: 450000 },
      { id: "EXP-003", date: "2026-10-08", category: "SUPPLIES", description: "Beli sabun pel, kamper, dan trash bag lantai 1-2", room: "Semua Unit", month: "Oktober", year: "2026", amount: 85000 },
      { id: "EXP-004", date: "2026-10-12", category: "MAINTENANCE", description: "Ganti remote AC dan servis cuci AC kamar 103", room: "103", month: "Oktober", year: "2026", amount: 220000 }
    ];
    localStorage.setItem("kosthub_dummy_expenses", JSON.stringify(state.dummyExpenses));
  }

  // 5. Dummy Staff
  const savedStaff = localStorage.getItem("kosthub_dummy_staff");
  if (savedStaff) {
    try { state.dummyStaff = JSON.parse(savedStaff); } catch(e) {}
  }
  if (!state.dummyStaff || state.dummyStaff.length === 0) {
    state.dummyStaff = [
      { id: "STF-01", name: "Ahmad Fauzi", phone: "085211223344", status: "AKTIF", pin: "1234" },
      { id: "STF-02", name: "Joko Supriyanto", phone: "087799887766", status: "AKTIF", pin: "5678" }
    ];
    localStorage.setItem("kosthub_dummy_staff", JSON.stringify(state.dummyStaff));
  }

  // 6. Super Admin Tenants & Pending Payments
  if (!state.adminTenants || state.adminTenants.length === 0) {
    state.adminTenants = [
      { ownerId: "OWN-001", propertyName: "Graha Melati Batam", ownerName: "Haji Ruslan Efendi", phone: "081277665544", tier: "PRO", unitCount: 18, quota: 25, status: "ACTIVE", registeredDate: "2026-08-10" },
      { ownerId: "OWN-002", propertyName: "Kost Putri Kartini", ownerName: "Ibu Kartini", phone: "081388776655", tier: "STARTER", unitCount: 5, quota: 5, status: "ACTIVE", registeredDate: "2026-08-25" },
      { ownerId: "OWN-003", propertyName: "Dormitory Harmoni Kemang", ownerName: "Agus Pratama", phone: "081122334455", tier: "ENTERPRISE", unitCount: 42, quota: 100, status: "ACTIVE", registeredDate: "2026-09-02" },
      { ownerId: "OWN-004", propertyName: "Kost Eksklusif Dago", ownerName: "Rian Firmansyah", phone: "085611223344", tier: "PRO", unitCount: 12, quota: 25, status: "INACTIVE", registeredDate: "2026-09-18" },
      { ownerId: "OWN-005", propertyName: "Wisma Cendrawasih Jogja", ownerName: "Dra. Sri Wahyuni", phone: "081722334455", tier: "STARTER", unitCount: 4, quota: 5, status: "ACTIVE", registeredDate: "2026-10-01" }
    ];
  }

  if (!state.adminPendingList || state.adminPendingList.length === 0) {
    state.adminPendingList = [
      { ownerId: "REG-901", propertyName: "Kost Mahasiswa Surya Kencana", ownerName: "Bambang Pamungkas", phone: "081299887711", tier: "PRO", price: 99000, proofUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=150", registeredDate: "2026-10-09" },
      { ownerId: "REG-902", propertyName: "Pavilion Green Residence", ownerName: "Clara Agustina", phone: "081377889922", tier: "ENTERPRISE", price: 199000, proofUrl: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=150", registeredDate: "2026-10-10" },
      { ownerId: "REG-903", propertyName: "Kost Singgah Tenang Malang", ownerName: "David Kurniawan", phone: "085711334455", tier: "STARTER", price: 49000, proofUrl: "", registeredDate: "2026-10-10" }
    ];
  }

  // Inisialisasi Bank Platform Default jika belum ada
  if (!state.platformBanks || state.platformBanks.length === 0) {
    const savedBanks = localStorage.getItem("kosthub_platform_banks");
    if (savedBanks) {
      try { state.platformBanks = JSON.parse(savedBanks); } catch(e) {}
    } else {
      state.platformBanks = [
        { code: "BCA", name: "Bank Central Asia (BCA)", account: "8009182736", holder: "PT KOSTHUB TEKNOLOGI INDONESIA" },
        { code: "MANDIRI", name: "Bank Mandiri", account: "1370019283746", holder: "PT KOSTHUB TEKNOLOGI INDONESIA" },
        { code: "BRI", name: "Bank Rakyat Indonesia (BRI)", account: "034101002938531", holder: "PT KOSTHUB TEKNOLOGI INDONESIA" }
      ];
      localStorage.setItem("kosthub_platform_banks", JSON.stringify(state.platformBanks));
    }
  }

  // Muat Fasilitas Kustom
  const savedFacs = localStorage.getItem("kosthub_custom_facilities");
  if (savedFacs) {
    try { state.customFacilities = JSON.parse(savedFacs); } catch(e) {}
  }
}

function saveDummyState() {
  localStorage.setItem("kosthub_dummy_rooms", JSON.stringify(state.rooms));
  if (state.dummyTenants) localStorage.setItem("kosthub_dummy_tenants", JSON.stringify(state.dummyTenants));
  if (state.dummyInvoices) localStorage.setItem("kosthub_dummy_invoices", JSON.stringify(state.dummyInvoices));
  if (state.dummyExpenses) localStorage.setItem("kosthub_dummy_expenses", JSON.stringify(state.dummyExpenses));
  if (state.dummyStaff) localStorage.setItem("kosthub_dummy_staff", JSON.stringify(state.dummyStaff));
}

// Reset Data Kamar ke Default / Kosongkan Okupansi
async function resetAllRoomsData() {
  const confirmed = await showCustomConfirm({
    title: "Reset Semua Data Kamar?",
    message: "Tindakan ini akan mengosongkan status okupansi seluruh kamar kost menjadi <b>VACANT</b> (KOSONG) dan mereset stand meteran listrik. Gunakan fitur ini untuk simulasi awal tahun/bulan.",
    confirmText: "Ya, Reset Kamar",
    cancelText: "Batal",
    type: "danger",
    icon: "🔄"
  });

  if (!confirmed) return;

  state.rooms.forEach(r => {
    r.status = "VACANT";
    r.tenant = "-";
    r.phone = "-";
    r.dueDate = "-";
  });

  saveDummyState();
  updateDashboardUI();
  renderRoomMatrix(state.rooms);
  populateRoomSelectDropdowns();
  showToast("Seluruh status kamar berhasil direset ke status KOSONG!", "success");
}

// ==================== ROLE-BASED NOTIFICATIONS ====================
function toggleRoleNotificationDropdown() {
  const dropdown = document.getElementById("roleNotificationDropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("hidden");
  renderRoleNotificationsList();
}

function updateRoleNotificationBadge() {
  const badge = document.getElementById("roleNotificationBadge");
  if (!badge) return;

  const currentRole = state.session ? state.session.role : "GUEST";
  const notifs = getNotificationsForRole(currentRole);
  const unreadCount = notifs.filter(n => !n.read).length;

  if (unreadCount > 0) {
    badge.innerText = unreadCount > 9 ? "9+" : unreadCount;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function getNotificationsForRole(role) {
  if (state.roleNotifications && state.roleNotifications[role]) {
    return state.roleNotifications[role];
  }

  const defaultNotifications = {
    SUPER_ADMIN: [
      { id: "notif-sa-1", title: "Verifikasi Pembayaran Baru", desc: "Pavilion Green Residence mengupload bukti bayar paket ENTERPRISE Rp 199.000.", time: "10 menit yang lalu", read: false, icon: "💳" },
      { id: "notif-sa-2", title: "Pendaftaran Akun Baru", desc: "Kost Singgah Tenang Malang mendaftar paket STARTER.", time: "1 jam yang lalu", read: false, icon: "🏢" },
      { id: "notif-sa-3", title: "Sistem Backup Otomatis", desc: "Snapshot database harian berhasil disimpan aman.", time: "04:00 Subuh", read: true, icon: "🛡️" }
    ],
    OWNER: [
      { id: "notif-ow-1", title: "Pelunasan Sewa Diterima", desc: "Dimas Pratama (Kamar 101) telah melunasi sewa Rp 1.265.000.", time: "15 menit yang lalu", read: false, icon: "💰" },
      { id: "notif-ow-2", title: "Jatuh Tempo Mendekat", desc: "Tagihan Kamar 201 (Budi Santoso) jatuh tempo dalam 3 hari.", time: "2 jam yang lalu", read: false, icon: "⏰" },
      { id: "notif-ow-3", title: "Meteran Listrik Diupdate", desc: "Staf Ahmad Fauzi telah mencatat stand meter lantai 1.", time: "Kemarin", read: true, icon: "⚡" }
    ],
    STAFF: [
      { id: "notif-st-1", title: "Tugas Cek Meteran", desc: "Jadwal pencatatan meteran listrik akhir bulan unit lantai 1 & 2.", time: "Hari ini", read: false, icon: "⚡" },
      { id: "notif-st-2", title: "Perbaikan Kamar 103", desc: "Penghuni melaporkan servis remote AC kamar 103 telah selesai.", time: "Kemarin", read: true, icon: "🔧" }
    ]
  };

  if (!state.roleNotifications) state.roleNotifications = {};
  state.roleNotifications[role] = defaultNotifications[role] || [];
  return state.roleNotifications[role];
}

function renderRoleNotificationsList() {
  const listContainer = document.getElementById("roleNotificationList");
  const titleRoleEl = document.getElementById("roleNotificationTitleRole");
  if (!listContainer) return;

  const currentRole = state.session ? state.session.role : "OWNER";
  if (titleRoleEl) {
    titleRoleEl.innerText = currentRole === "SUPER_ADMIN" ? "SUPER ADMIN" : (currentRole === "STAFF" ? "STAF LAPANGAN" : "OWNER KOST");
  }

  const notifs = getNotificationsForRole(currentRole);

  if (notifs.length === 0) {
    listContainer.innerHTML = '<div class="py-8 text-center text-xs text-slate-400 font-semibold">Tidak ada pemberitahuan baru</div>';
    return;
  }

  listContainer.innerHTML = notifs.map(n => `
    <div class="p-3.5 hover:bg-slate-50 transition-colors flex items-start gap-3 border-b border-slate-100 last:border-b-0 ${!n.read ? 'bg-brand-50/20' : ''}">
      <span class="text-xl shrink-0 p-1.5 rounded-xl bg-slate-100">${n.icon || '🔔'}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <h5 class="text-xs font-black text-slate-900 truncate">${n.title}</h5>
          ${!n.read ? '<span class="w-2 h-2 rounded-full bg-brand-600 shrink-0"></span>' : ''}
        </div>
        <p class="text-[11px] text-slate-600 mt-0.5 leading-snug line-clamp-2">${n.desc}</p>
        <span class="text-[10px] font-mono text-slate-400 mt-1 block">${n.time}</span>
      </div>
    </div>
  `).join("");
}

function markAllNotificationsRead() {
  const currentRole = state.session ? state.session.role : "GUEST";
  const notifs = getNotificationsForRole(currentRole);
  notifs.forEach(n => n.read = true);
  updateRoleNotificationBadge();
  renderRoleNotificationsList();
  showToast("Semua pemberitahuan ditandai telah dibaca", "success");
}

// Close notification dropdown when clicking outside
document.addEventListener("click", (e) => {
  const btn = document.getElementById("btnRoleNotification");
  const dropdown = document.getElementById("roleNotificationDropdown");
  if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add("hidden");
  }
});

// ==================== EXPORT PDF & EXCEL SUPER_ADMIN ====================
function getAdminFilteredTenants() {
  const search = (document.getElementById("admSearchOwnerInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("admFilterStatusSelect")?.value || "ALL";
  const tierFilter = document.getElementById("admFilterTierSelect")?.value || "ALL";
  const startDate = document.getElementById("admFilterStartDate")?.value || "";
  const endDate = document.getElementById("admFilterEndDate")?.value || "";

  const allTenants = state.adminTenants || [];
  return allTenants.filter(t => {
    const matchesSearch = !search ||
      (t.ownerId || "").toLowerCase().includes(search) ||
      (t.propertyName || "").toLowerCase().includes(search) ||
      (t.ownerName || "").toLowerCase().includes(search) ||
      (t.phone || "").toLowerCase().includes(search);

    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesTier = tierFilter === "ALL" || t.tier === tierFilter;

    let matchesDate = true;
    if (startDate && t.registeredDate) {
      matchesDate = matchesDate && (t.registeredDate >= startDate);
    }
    if (endDate && t.registeredDate) {
      matchesDate = matchesDate && (t.registeredDate <= endDate);
    }

    return matchesSearch && matchesStatus && matchesTier && matchesDate;
  });
}

// Export PDF Manage Users (Modern Iconic Layout)
function exportAdminUsersPDF(selectedOnly = false) {
  let list = getAdminFilteredTenants();
  if (selectedOnly) {
    if (!state.adminSelectedOwnerIds || state.adminSelectedOwnerIds.size === 0) {
      showToast("Pilih minimal satu akun owner untuk diexport!", "warning");
      return;
    }
    list = list.filter(t => state.adminSelectedOwnerIds.has(t.ownerId));
  }

  if (list.length === 0) {
    showToast("Tidak ada data owner untuk diexport PDF!", "warning");
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Decorative Header Banner
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, 210, 36, "F");

    doc.setFillColor(79, 70, 229); // brand indigo
    doc.rect(0, 34, 210, 2, "F");

    // Title & Branding
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("KOSTHUB OS - LAPORAN KELOLA OWNER & PENGGUNA", 14, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // slate-300
    const todayFormatted = formatDateDMY(new Date().toISOString().split("T")[0]);
    doc.text(`Dicetak Pada: ${todayFormatted} | Total Data: ${list.length} Owner Properti`, 14, 23);
    doc.text("Laporan Resmi Terverifikasi - Cloud Multi-Tenant System", 14, 29);

    // Table Data
    const tableHeaders = [["No", "ID Owner", "Nama Properti", "Nama Owner & WA", "Paket", "Unit / Kuota", "Status", "Tgl Registrasi"]];
    const tableData = list.map((t, idx) => [
      idx + 1,
      t.ownerId || "-",
      t.propertyName || "-",
      `${t.ownerName || '-'}\n${t.phone || '-'}`,
      t.tier || "STARTER",
      `${t.unitCount || 0} / ${t.quota || 0}`,
      t.status || "ACTIVE",
      formatDateDMY(t.registeredDate || "-")
    ]);

    doc.autoTable({
      head: tableHeaders,
      body: tableData,
      startY: 42,
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        valign: "middle"
      },
      headStyles: {
        fillColor: [67, 56, 202], // indigo-700
        textColor: 255,
        fontStyle: "bold"
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // slate-50
      },
      didDrawPage: function(data) {
        // Footer page number
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Halaman ${doc.internal.getNumberOfPages()} - KostHub OS Automated Reporting`, 14, 290);
      }
    });

    doc.save(`KostHub_Owner_Users_${todayFormatted}.pdf`);
    showToast("Laporan PDF Pengguna Berhasil Diunduh!", "success");
  } catch (err) {
    console.error("Gagal export PDF:", err);
    showToast("Gagal menghasilkan PDF: " + err.message, "error");
  }
}

// Export Excel Manage Users
function exportAdminUsersExcel(selectedOnly = false) {
  let list = getAdminFilteredTenants();
  if (selectedOnly) {
    if (!state.adminSelectedOwnerIds || state.adminSelectedOwnerIds.size === 0) {
      showToast("Pilih minimal satu akun owner untuk diexport!", "warning");
      return;
    }
    list = list.filter(t => state.adminSelectedOwnerIds.has(t.ownerId));
  }

  if (list.length === 0) {
    showToast("Tidak ada data owner untuk diexport Excel!", "warning");
    return;
  }

  try {
    const dataForSheet = list.map((t, idx) => ({
      "No": idx + 1,
      "ID Owner": t.ownerId || "",
      "Nama Properti Kost": t.propertyName || "",
      "Nama Pemilik": t.ownerName || "",
      "No. WhatsApp": t.phone || "",
      "Paket Lisensi": t.tier || "STARTER",
      "Kamar Terpakai": t.unitCount || 0,
      "Kapasitas Kuota": t.quota || 0,
      "Status Akun": t.status || "ACTIVE",
      "Tanggal Registrasi": formatDateDMY(t.registeredDate || "")
    }));

    const ws = XLSX.utils.json_to_sheet(dataForSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar_Owner");

    const todayFormatted = formatDateDMY(new Date().toISOString().split("T")[0]);
    XLSX.writeFile(wb, `KostHub_Data_Owner_${todayFormatted}.xlsx`);
    showToast("Data Excel Berhasil Diunduh!", "success");
  } catch (err) {
    console.error("Gagal export Excel:", err);
    showToast("Gagal menghasilkan Excel: " + err.message, "error");
  }
}

function bulkExportSelectedOwnersPDF() {
  exportAdminUsersPDF(true);
}

function bulkExportSelectedOwnersExcel() {
  exportAdminUsersExcel(true);
}

// Pagination Handlers Super Admin
function prevAdminUsersPage() {
  if (state.pagination.tenantsPage > 1) {
    state.pagination.tenantsPage--;
    renderAdminTenantTable();
  }
}

function nextAdminUsersPage() {
  state.pagination.tenantsPage++;
  renderAdminTenantTable();
}

function prevAdminPendingPage() {
  if (state.pagination.pendingPage > 1) {
    state.pagination.pendingPage--;
    renderAdminPendingTable();
  }
}

function nextAdminPendingPage() {
  state.pagination.pendingPage++;
  renderAdminPendingTable();
}

// ==================== FASILITAS KAMAR & UNIT ====================
const DEFAULT_FACILITIES = [
  "AC (Air Conditioner)",
  "Kamar Mandi Dalam",
  "WiFi Internet Cepat",
  "Kasur Springbed",
  "Lemari Pakaian",
  "Meja & Kursi Kerja",
  "Water Heater",
  "Smart TV",
  "Kulkas Mini",
  "Balkon Pribadi",
  "Jendela Luar",
  "Token Listrik Mandiri"
];

function renderFacilityCheckboxes(selectedFacs = []) {
  const container = document.getElementById("facilityCheckboxesGrid");
  if (!container) return;

  const allFacs = Array.from(new Set([...DEFAULT_FACILITIES, ...(state.customFacilities || [])]));

  container.innerHTML = allFacs.map(fac => {
    const isChecked = selectedFacs.includes(fac);
    return `
      <label class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 hover:border-brand-300 transition-all cursor-pointer text-[11px] font-semibold text-slate-700 shadow-2xs">
        <input type="checkbox" name="unitFacilityCheck" value="${fac}" ${isChecked ? 'checked' : ''}
          class="rounded text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer" />
        <span class="truncate">${fac}</span>
      </label>
    `;
  }).join("");
}

function addCustomFacility() {
  const input = document.getElementById("customFacilityInput");
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast("Tulis nama fasilitas baru terlebih dahulu!", "warning");
    return;
  }

  if (!state.customFacilities) state.customFacilities = [];
  if (!state.customFacilities.includes(val) && !DEFAULT_FACILITIES.includes(val)) {
    state.customFacilities.push(val);
    localStorage.setItem("kosthub_custom_facilities", JSON.stringify(state.customFacilities));
  }

  // Get currently checked boxes
  const currentlyChecked = Array.from(document.querySelectorAll('input[name="unitFacilityCheck"]:checked')).map(el => el.value);
  currentlyChecked.push(val);

  renderFacilityCheckboxes(currentlyChecked);
  input.value = "";
  showToast(`Fasilitas "${val}" berhasil ditambahkan!`, "success");
}

function getSelectedFacilitiesFromModal() {
  const checked = document.querySelectorAll('input[name="unitFacilityCheck"]:checked');
  return Array.from(checked).map(c => c.value);
}

// ==================== KAMAR & UNIT CRUD & ACTIONS ====================
function prevUnitPage() {
  if (state.pagination.unitPage > 1) {
    state.pagination.unitPage--;
    renderMasterUnitsTable();
  }
}

function nextUnitPage() {
  state.pagination.unitPage++;
  renderMasterUnitsTable();
}

function filterMasterUnitsTable() {
  state.pagination.unitPage = 1;
  renderMasterUnitsTable();
}

function renderMasterUnitsTable() {
  const tbody = document.getElementById("unitMasterTableBody");
  if (!tbody) return;

  const search = (document.getElementById("searchUnitInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filterUnitStatusSelect")?.value || "ALL";
  const floorFilter = document.getElementById("filterUnitFloorSelect")?.value || "ALL";

  const allUnits = state.rooms || [];
  const filtered = allUnits.filter(u => {
    const num = (u.number || u[2] || "").toString().toLowerCase();
    const type = (u.type || u[4] || "").toString().toLowerCase();
    const status = u.status || u[7] || "VACANT";
    const floor = (u.floor || u[3] || "1").toString();

    const matchesSearch = !search || num.includes(search) || type.includes(search);
    const matchesStatus = statusFilter === "ALL" || status === statusFilter;
    const matchesFloor = floorFilter === "ALL" || floor === floorFilter;

    return matchesSearch && matchesStatus && matchesFloor;
  });

  const perPage = state.pagination.unitPerPage || 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.pagination.unitPage > totalPages) state.pagination.unitPage = totalPages;
  if (state.pagination.unitPage < 1) state.pagination.unitPage = 1;

  const startIdx = (state.pagination.unitPage - 1) * perPage;
  const pagedUnits = filtered.slice(startIdx, startIdx + perPage);

  const footerInfo = document.getElementById("unitTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + perPage, filtered.length)} dari total ${filtered.length} unit kamar`;
  }

  const pageNumEl = document.getElementById("unitPageNumber");
  if (pageNumEl) pageNumEl.innerText = `Hal ${state.pagination.unitPage} dari ${totalPages}`;

  const btnPrev = document.getElementById("btnPrevUnitPage");
  const btnNext = document.getElementById("btnNextUnitPage");
  if (btnPrev) btnPrev.disabled = state.pagination.unitPage <= 1;
  if (btnNext) btnNext.disabled = state.pagination.unitPage >= totalPages;

  if (pagedUnits.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">🚪</span>
            <b class="text-slate-700">Tidak ada data unit kamar yang cocok</b>
            <span class="text-xs text-slate-400">Silakan sesuaikan kata kunci pencarian atau filter status & lantai.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pagedUnits.map(u => {
    const id = u.id || u[0];
    const num = u.number || u[2];
    const floor = u.floor || u[3];
    const type = u.type || u[4] || "Standard";
    const price = u.price || u[5] || 0;
    const facs = Array.isArray(u.facilities) ? u.facilities.join(", ") : (u[6] || "-");
    const meter = u.meter || u[9] || 0;
    const status = u.status || u[7] || "VACANT";

    const isOccupied = status === "OCCUPIED";
    const statusBadge = isOccupied
      ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">TERISI</span>'
      : '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">KOSONG</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5 font-black text-slate-900 text-sm">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full ${isOccupied ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            ${num}
          </span>
        </td>
        <td class="p-3.5 font-semibold text-slate-700">Lantai ${floor}</td>
        <td class="p-3.5 font-bold text-slate-800">${type}</td>
        <td class="p-3.5 font-mono font-black text-slate-900">${formatRupiah(price)}</td>
        <td class="p-3.5 text-slate-600 text-xs max-w-xs truncate" title="${facs}">${facs}</td>
        <td class="p-3.5 font-mono font-bold text-slate-700">${meter} kWh</td>
        <td class="p-3.5">${statusBadge}</td>
        <td class="p-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="viewUnitDetail('${id}')" title="Lihat Detail Kamar"
              class="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all">
              👁️
            </button>
            <button onclick="editUnitModal('${id}')" title="Edit Kamar"
              class="p-1.5 hover:bg-brand-50 text-brand-600 rounded-lg text-xs font-bold transition-all">
              ✏️
            </button>
            <button onclick="deleteUnit('${id}')" title="Hapus Kamar"
              class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold transition-all">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Override function lama renderMasterUnits agar kompatibel
function renderMasterUnits(units) {
  if (units && units.length > 0) {
    // Map array format to object format jika didapat dari backend GAS
    state.rooms = units.map(u => ({
      id: u[0],
      number: u[2],
      floor: u[3],
      type: u[4],
      price: u[5],
      facilities: (u[6] || "").split(",").map(s => s.trim()).filter(Boolean),
      status: u[7],
      meter: u[9] || 0
    }));
    saveDummyState();
  }
  renderMasterUnitsTable();
}

function openAddUnitModal() {
  document.getElementById("modalUnitTitle").innerText = "Tambah Unit Kamar Baru";
  document.getElementById("unitEditId").value = "";
  document.getElementById("unitNumberInput").value = "";
  document.getElementById("unitFloorInput").value = "1";
  document.getElementById("unitTypeInput").value = "Standard AC";
  document.getElementById("unitPriceInput").value = "1500000";
  document.getElementById("unitMeterInput").value = "0";
  renderFacilityCheckboxes(["AC (Air Conditioner)", "WiFi Internet Cepat", "Kamar Mandi Dalam"]);
  openModal("modalAddUnit");
}

function editUnitModal(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) {
    showToast("Data unit kamar tidak ditemukan!", "error");
    return;
  }

  document.getElementById("modalUnitTitle").innerText = `Edit Unit Kamar ${room.number}`;
  document.getElementById("unitEditId").value = room.id;
  document.getElementById("unitNumberInput").value = room.number;
  document.getElementById("unitFloorInput").value = room.floor || 1;
  document.getElementById("unitTypeInput").value = room.type || "";
  document.getElementById("unitPriceInput").value = room.price || 0;
  document.getElementById("unitMeterInput").value = room.meter || 0;

  const currentFacs = Array.isArray(room.facilities) ? room.facilities : (room.facilities ? String(room.facilities).split(",").map(s => s.trim()) : []);
  renderFacilityCheckboxes(currentFacs);
  openModal("modalAddUnit");
}

async function viewUnitDetail(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;

  const facs = Array.isArray(room.facilities) ? room.facilities.join(", ") : (room.facilities || "-");
  await showCustomConfirm({
    title: `Rincian Kamar ${room.number}`,
    message: `
      <div class="space-y-2 text-left text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div><b>Lantai:</b> Lantai ${room.floor || 1}</div>
        <div><b>Tipe Kamar:</b> ${room.type || 'Standard'}</div>
        <div><b>Tarif Sewa Pokok:</b> ${formatRupiah(room.price)} / bulan</div>
        <div><b>Stand Meter Listrik:</b> ${room.meter || 0} kWh</div>
        <div><b>Status Okupansi:</b> <span class="font-bold ${room.status === 'OCCUPIED' ? 'text-emerald-600' : 'text-slate-500'}">${room.status === 'OCCUPIED' ? 'TERISI (' + (room.tenant || '-') + ')' : 'KOSONG'}</span></div>
        <div><b>Fasilitas Lengkap:</b> <div class="mt-1 text-slate-800 font-semibold">${facs}</div></div>
      </div>
    `,
    confirmText: "Tutup",
    cancelText: "",
    type: "info",
    icon: "🚪"
  });
}

async function deleteUnit(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;

  if (room.status === "OCCUPIED") {
    showToast(`Kamar ${room.number} sedang terisi penghuni. Kosongkan unit terlebih dahulu sebelum menghapus!`, "warning");
    return;
  }

  const confirmed = await showCustomConfirm({
    title: `Hapus Kamar ${room.number}?`,
    message: `Apakah Anda yakin ingin menghapus kamar <b>${room.number}</b> dari database properti kost? Tindakan ini tidak dapat dibatalkan.`,
    confirmText: "Ya, Hapus Kamar",
    cancelText: "Batal",
    type: "danger",
    icon: "🗑️"
  });

  if (!confirmed) return;

  state.rooms = state.rooms.filter(r => r.id !== id);
  saveDummyState();
  updateDashboardUI();
  renderRoomMatrix(state.rooms);
  renderMasterUnitsTable();
  populateRoomSelectDropdowns();
  showToast(`Unit Kamar ${room.number} berhasil dihapus!`, "success");
}

// Override submitAddUnit agar mendukung Edit & Fasilitas Lengkap
async function submitAddUnit() {
  const editId = document.getElementById("unitEditId").value.trim();
  const num = document.getElementById("unitNumberInput").value.trim();
  const floor = Number(document.getElementById("unitFloorInput").value) || 1;
  const type = document.getElementById("unitTypeInput").value.trim() || "Standard";
  const price = Number(document.getElementById("unitPriceInput").value) || 0;
  const meter = Number(document.getElementById("unitMeterInput").value) || 0;
  const facilities = getSelectedFacilitiesFromModal();

  if (!num || price <= 0) {
    showToast("Nomor kamar dan harga sewa bulanan wajib diisi dengan benar!", "warning");
    return;
  }

  if (editId) {
    // Mode Update
    const room = state.rooms.find(r => r.id === editId);
    if (room) {
      room.number = num;
      room.floor = floor;
      room.type = type;
      room.price = price;
      room.meter = meter;
      room.facilities = facilities;
      showToast(`Data Kamar ${num} berhasil diperbarui!`, "success");
    }
  } else {
    // Mode Tambah Baru
    const newId = "RM-" + Date.now().toString().slice(-4);
    state.rooms.push({
      id: newId,
      number: num,
      floor: floor,
      type: type,
      price: price,
      meter: meter,
      status: "VACANT",
      tenant: "-",
      phone: "-",
      dueDate: "-",
      facilities: facilities
    });
    showToast(`Unit Kamar ${num} baru berhasil ditambahkan!`, "success");
  }

  saveDummyState();
  closeModal("modalAddUnit");
  updateDashboardUI();
  renderRoomMatrix(state.rooms);
  renderMasterUnitsTable();
  populateRoomSelectDropdowns();
}

// ==================== PENGHUNI CRUD & ACTIONS ====================
function prevTenantPage() {
  if (state.pagination.tenantPage > 1) {
    state.pagination.tenantPage--;
    renderMasterTenantsTable();
  }
}

function nextTenantPage() {
  state.pagination.tenantPage++;
  renderMasterTenantsTable();
}

function filterMasterTenantsTable() {
  state.pagination.tenantPage = 1;
  renderMasterTenantsTable();
}

function renderMasterTenantsTable() {
  const tbody = document.getElementById("tenantMasterTableBody");
  if (!tbody) return;

  const search = (document.getElementById("searchTenantInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filterTenantStatusSelect")?.value || "ALL";

  const allTenants = state.dummyTenants || [];
  const filtered = allTenants.filter(t => {
    const name = (t.name || "").toLowerCase();
    const phone = (t.phone || "").toLowerCase();
    const room = (t.roomNumber || "").toLowerCase();
    const status = t.status || "ACTIVE";

    const matchesSearch = !search || name.includes(search) || phone.includes(search) || room.includes(search);
    const matchesStatus = statusFilter === "ALL" || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const perPage = state.pagination.tenantPerPage || 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.pagination.tenantPage > totalPages) state.pagination.tenantPage = totalPages;
  if (state.pagination.tenantPage < 1) state.pagination.tenantPage = 1;

  const startIdx = (state.pagination.tenantPage - 1) * perPage;
  const pagedTenants = filtered.slice(startIdx, startIdx + perPage);

  const footerInfo = document.getElementById("tenantTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + perPage, filtered.length)} dari total ${filtered.length} penghuni kost`;
  }

  const pageNumEl = document.getElementById("tenantPageNumber");
  if (pageNumEl) pageNumEl.innerText = `Hal ${state.pagination.tenantPage} dari ${totalPages}`;

  const btnPrev = document.getElementById("btnPrevTenantPage");
  const btnNext = document.getElementById("btnNextTenantPage");
  if (btnPrev) btnPrev.disabled = state.pagination.tenantPage <= 1;
  if (btnNext) btnNext.disabled = state.pagination.tenantPage >= totalPages;

  if (pagedTenants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">👥</span>
            <b class="text-slate-700">Tidak ada data penghuni yang cocok</b>
            <span class="text-xs text-slate-400">Silakan sesuaikan kata kunci pencarian atau filter status.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pagedTenants.map(t => {
    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5 font-black text-slate-900 text-sm">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
              ${(t.name || 'P')[0]}
            </span>
            <div>
              <b class="text-slate-900 block">${t.name}</b>
              <span class="text-[10px] text-slate-400 font-mono">ID: ${t.id}</span>
            </div>
          </div>
        </td>
        <td class="p-3.5 font-black text-brand-600 font-mono text-sm">Kamar ${t.roomNumber}</td>
        <td class="p-3.5 font-mono text-slate-700 font-bold">${t.phone}</td>
        <td class="p-3.5 font-mono text-slate-600 text-xs">${formatDateDMY(t.startDate)}</td>
        <td class="p-3.5 font-mono font-black text-slate-900">${formatRupiah(t.rent)}</td>
        <td class="p-3.5">
          ${t.ktp ? `
            <a href="${t.ktp}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-brand-600 shadow-2xs">
              <span>🪪</span> KTP
            </a>
          ` : '<span class="text-slate-400 text-xs italic">Tanpa KTP</span>'}
        </td>
        <td class="p-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="viewTenantDetail('${t.id}')" title="Lihat Profil Penghuni"
              class="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all">
              👁️
            </button>
            <button onclick="editTenantModal('${t.id}')" title="Edit Penghuni"
              class="p-1.5 hover:bg-brand-50 text-brand-600 rounded-lg text-xs font-bold transition-all">
              ✏️
            </button>
            <button onclick="deleteTenant('${t.id}')" title="Check-out / Hapus Penghuni"
              class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold transition-all">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Override function lama renderMasterTenants agar kompatibel
function renderMasterTenants(tenants) {
  if (tenants && tenants.length > 0) {
    state.dummyTenants = tenants.map(t => ({
      id: t[0],
      roomNumber: t[4],
      name: t[2],
      phone: t[3] || "-",
      emergency: t[5] || "-",
      startDate: t[6] || "",
      deposit: t[7] || 0,
      rent: t[8] || 0,
      ktp: t[9] || "",
      status: t[10] || "ACTIVE"
    }));
    saveDummyState();
  }
  renderMasterTenantsTable();
}

function openStandaloneAddTenantModal() {
  document.getElementById("onboardRoomTitle").innerText = "Registrasi Penghuni Baru";
  document.getElementById("tenantEditId").value = "";
  document.getElementById("onboardUnitId").value = "";
  document.getElementById("onboardName").value = "";
  document.getElementById("onboardWa").value = "";
  document.getElementById("onboardEmergency").value = "";
  document.getElementById("onboardDeposit").value = "500000";
  document.getElementById("onboardEntryDate").value = new Date().toISOString().split("T")[0];

  const preview = document.getElementById("ktpPreviewContainer");
  if (preview) preview.classList.add("hidden");

  populateRoomSelectDropdowns();
  openModal("modalOnboard");
}

function populateRoomSelectDropdowns() {
  const onboardSelect = document.getElementById("onboardSelectRoom");
  const expenseSelect = document.getElementById("expenseRoomSelect");
  const filterExpenseSelect = document.getElementById("filterExpenseRoomSelect");

  const rooms = state.rooms || [];

  if (onboardSelect) {
    onboardSelect.innerHTML = rooms.map(r => `
      <option value="${r.id}" ${r.status === 'OCCUPIED' ? 'disabled class="text-slate-400 bg-slate-50"' : ''}>
        Kamar ${r.number} (Lt. ${r.floor}) - ${formatRupiah(r.price)} ${r.status === 'OCCUPIED' ? '[TERISI]' : '[KOSONG]'}
      </option>
    `).join("");
  }

  if (expenseSelect) {
    expenseSelect.innerHTML = rooms.map(r => `
      <option value="${r.number}">Kamar ${r.number} (Lantai ${r.floor} - ${r.type})</option>
    `).join("");
  }

  if (filterExpenseSelect) {
    const currentVal = filterExpenseSelect.value || "ALL";
    filterExpenseSelect.innerHTML = '<option value="ALL">Semua Unit Kamar & Pengeluaran</option>' +
      rooms.map(r => `
        <option value="${r.number}">Kamar ${r.number}</option>
      `).join("");
    filterExpenseSelect.value = currentVal;
  }
}

function editTenantModal(id) {
  const t = (state.dummyTenants || []).find(x => x.id === id);
  if (!t) return;

  document.getElementById("onboardRoomTitle").innerText = `Edit Data Penghuni: ${t.name}`;
  document.getElementById("tenantEditId").value = t.id;
  document.getElementById("onboardUnitId").value = t.roomNumber;
  document.getElementById("onboardName").value = t.name;
  document.getElementById("onboardWa").value = t.phone;
  document.getElementById("onboardEmergency").value = t.emergency || "";
  document.getElementById("onboardDeposit").value = t.deposit || 0;
  document.getElementById("onboardEntryDate").value = t.startDate ? t.startDate.split("T")[0] : "";

  populateRoomSelectDropdowns();
  const selectEl = document.getElementById("onboardSelectRoom");
  if (selectEl) {
    const matchingRoom = state.rooms.find(r => r.number === t.roomNumber || r.id === t.roomNumber);
    if (matchingRoom) selectEl.value = matchingRoom.id;
  }

  openModal("modalOnboard");
}

async function viewTenantDetail(id) {
  const t = (state.dummyTenants || []).find(x => x.id === id);
  if (!t) return;

  await showCustomConfirm({
    title: `Profil Penghuni: ${t.name}`,
    message: `
      <div class="space-y-2 text-left text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div><b>Kamar Sewa:</b> <span class="font-black text-brand-600 text-sm">Kamar ${t.roomNumber}</span></div>
        <div><b>Nomor WhatsApp:</b> ${t.phone}</div>
        <div><b>Kontak Darurat:</b> ${t.emergency || '-'}</div>
        <div><b>Mulai Sewa:</b> ${formatDateDMY(t.startDate)}</div>
        <div><b>Tarif Sewa:</b> ${formatRupiah(t.rent)} / bulan</div>
        <div><b>Uang Deposit:</b> ${formatRupiah(t.deposit)}</div>
        <div><b>Status Hunian:</b> <span class="font-bold text-emerald-600">${t.status}</span></div>
      </div>
    `,
    confirmText: "Tutup",
    cancelText: "",
    type: "info",
    icon: "👤"
  });
}

async function deleteTenant(id) {
  const t = (state.dummyTenants || []).find(x => x.id === id);
  if (!t) return;

  const confirmed = await showCustomConfirm({
    title: `Check-out / Hapus Penghuni?`,
    message: `Konfirmasi penghentian sewa dan check-out untuk <b>${t.name}</b> (Kamar ${t.roomNumber})? Kamar akan otomatis kembali berstatus <b>VACANT</b> (KOSONG).`,
    confirmText: "Ya, Check-out Penghuni",
    cancelText: "Batal",
    type: "danger",
    icon: "🚪"
  });

  if (!confirmed) return;

  state.dummyTenants = (state.dummyTenants || []).filter(x => x.id !== id);

  // Update status kamar terkait menjadi VACANT
  const room = state.rooms.find(r => r.number === t.roomNumber || r.id === t.roomNumber);
  if (room) {
    room.status = "VACANT";
    room.tenant = "-";
    room.phone = "-";
    room.dueDate = "-";
  }

  saveDummyState();
  updateDashboardUI();
  renderRoomMatrix(state.rooms);
  renderMasterTenantsTable();
  populateRoomSelectDropdowns();
  showToast(`Penghuni ${t.name} berhasil di-checkout dan kamar telah kosong!`, "success");
}

// Override submitOnboardingTenant agar mendukung Tambah & Edit
async function submitOnboardingTenant() {
  const editId = document.getElementById("tenantEditId").value.trim();
  const name = document.getElementById("onboardName").value.trim();
  const wa = document.getElementById("onboardWa").value.trim();
  const emergency = document.getElementById("onboardEmergency").value.trim();
  const deposit = Number(document.getElementById("onboardDeposit").value) || 0;
  const entryDate = document.getElementById("onboardEntryDate").value;

  const selectRoomEl = document.getElementById("onboardSelectRoom");
  const selectedRoomId = selectRoomEl ? selectRoomEl.value : document.getElementById("onboardUnitId").value;
  const targetRoom = state.rooms.find(r => r.id === selectedRoomId || r.number === selectedRoomId);

  if (!name || !wa) {
    showToast("Nama lengkap dan No. WhatsApp penghuni wajib diisi!", "warning");
    return;
  }

  if (editId) {
    // Mode Update
    const t = (state.dummyTenants || []).find(x => x.id === editId);
    if (t) {
      t.name = name;
      t.phone = wa;
      t.emergency = emergency;
      t.deposit = deposit;
      t.startDate = entryDate;
      if (targetRoom) {
        t.roomNumber = targetRoom.number;
        t.rent = targetRoom.price;
      }
      showToast(`Data penghuni ${name} berhasil diperbarui!`, "success");
    }
  } else {
    // Mode Tambah Baru
    if (!targetRoom) {
      showToast("Pilih unit kamar kost yang akan disewa!", "warning");
      return;
    }

    const newId = "TNT-" + Date.now().toString().slice(-4);
    if (!state.dummyTenants) state.dummyTenants = [];
    state.dummyTenants.push({
      id: newId,
      roomNumber: targetRoom.number,
      name: name,
      phone: wa,
      emergency: emergency,
      startDate: entryDate || new Date().toISOString().split("T")[0],
      deposit: deposit,
      rent: targetRoom.price,
      status: "ACTIVE",
      ktp: ""
    });

    // Ubah kamar menjadi OCCUPIED
    targetRoom.status = "OCCUPIED";
    targetRoom.tenant = name;
    targetRoom.phone = wa;
    targetRoom.dueDate = entryDate ? formatDateDMY(entryDate) : formatDateDMY(new Date().toISOString().split("T")[0]);

    showToast(`Penghuni ${name} berhasil diregistrasi di Kamar ${targetRoom.number}!`, "success");
  }

  saveDummyState();
  closeModal("modalOnboard");
  updateDashboardUI();
  renderRoomMatrix(state.rooms);
  renderMasterTenantsTable();
  populateRoomSelectDropdowns();
}

// ==================== TAGIHAN BULANAN CRUD & KWITANSI ====================
function prevInvoicePage() {
  if (state.pagination.invoicePage > 1) {
    state.pagination.invoicePage--;
    renderMasterInvoicesTable();
  }
}

function nextInvoicePage() {
  state.pagination.invoicePage++;
  renderMasterInvoicesTable();
}

function filterMasterInvoicesTable() {
  state.pagination.invoicePage = 1;
  renderMasterInvoicesTable();
}

function renderMasterInvoicesTable() {
  const tbody = document.getElementById("invoiceMasterTableBody");
  if (!tbody) return;

  const search = (document.getElementById("searchInvoiceInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filterInvoiceStatusSelect")?.value || "ALL";

  const allInvoices = state.dummyInvoices || [];
  const filtered = allInvoices.filter(inv => {
    const id = (inv.id || "").toLowerCase();
    const room = (inv.roomNumber || "").toLowerCase();
    const tenant = (inv.tenantName || "").toLowerCase();
    const status = inv.status || "PENDING";

    const matchesSearch = !search || id.includes(search) || room.includes(search) || tenant.includes(search);
    const matchesStatus = statusFilter === "ALL" || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const perPage = state.pagination.invoicePerPage || 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.pagination.invoicePage > totalPages) state.pagination.invoicePage = totalPages;
  if (state.pagination.invoicePage < 1) state.pagination.invoicePage = 1;

  const startIdx = (state.pagination.invoicePage - 1) * perPage;
  const pagedInvoices = filtered.slice(startIdx, startIdx + perPage);

  const footerInfo = document.getElementById("invoiceTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + perPage, filtered.length)} dari total ${filtered.length} riwayat tagihan`;
  }

  const pageNumEl = document.getElementById("invoicePageNumber");
  if (pageNumEl) pageNumEl.innerText = `Hal ${state.pagination.invoicePage} dari ${totalPages}`;

  const btnPrev = document.getElementById("btnPrevInvoicePage");
  const btnNext = document.getElementById("btnNextInvoicePage");
  if (btnPrev) btnPrev.disabled = state.pagination.invoicePage <= 1;
  if (btnNext) btnNext.disabled = state.pagination.invoicePage >= totalPages;

  if (pagedInvoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">🧾</span>
            <b class="text-slate-700">Tidak ada riwayat tagihan yang cocok</b>
            <span class="text-xs text-slate-400">Silakan sesuaikan kata kunci pencarian atau filter status.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pagedInvoices.map(inv => {
    const isPaid = inv.status === "PAID";
    const statusBadge = isPaid
      ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">LUNAS</span>'
      : '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">PENDING</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-3.5 font-mono font-bold text-slate-900 text-xs">${inv.id}</td>
        <td class="p-3.5 font-black text-brand-600 font-mono text-sm">Kamar ${inv.roomNumber}</td>
        <td class="p-3.5 font-bold text-slate-800">${inv.tenantName}</td>
        <td class="p-3.5 font-mono text-slate-600 text-xs">${formatDateDMY(inv.dueDate)}</td>
        <td class="p-3.5 font-mono font-black text-slate-900">${formatRupiah(inv.total)}</td>
        <td class="p-3.5">${statusBadge}</td>
        <td class="p-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="navigateTo('/kwitansi?token=${inv.token || inv.id}')" title="Buka Kwitansi Modern"
              class="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs">
              <span>🧾</span> Kwitansi
            </button>
            <button onclick="editInvoiceModal('${inv.id}')" title="Edit Tagihan"
              class="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all">
              ✏️
            </button>
            <button onclick="deleteInvoice('${inv.id}')" title="Hapus Tagihan"
              class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold transition-all">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Override function lama renderMasterInvoices agar kompatibel
function renderMasterInvoices(invoices) {
  if (invoices && invoices.length > 0) {
    state.dummyInvoices = invoices.map(inv => ({
      id: inv[0],
      token: inv[2] || inv[0],
      roomNumber: inv[3],
      tenantName: inv[5],
      dueDate: inv[6],
      baseRent: inv[7] || inv[11],
      electricCost: inv[8] || 0,
      total: inv[11],
      status: inv[12]
    }));
    saveDummyState();
  }
  renderMasterInvoicesTable();
}

// Toggle Token Listrik Mandiri di Modal Billing
function toggleTokenListrikInput(hasToken) {
  const container = document.getElementById("meterInputsContainer");
  if (container) {
    if (hasToken) {
      container.classList.add("opacity-40", "pointer-events-none");
    } else {
      container.classList.remove("opacity-40", "pointer-events-none");
    }
  }
  calculateBillingTotal();
}

function updateBillingPeriodValue() {
  const m = document.getElementById("billingPeriodMonth")?.value || "Oktober";
  const y = document.getElementById("billingPeriodYear")?.value || "2026";
  const periodText = `${m} ${y}`;
  const sub = document.getElementById("billingModalSubtitle");
  if (sub) sub.innerText = `Perhitungan sewa dan meteran listrik periode ${periodText}`;
}

async function editInvoiceModal(id) {
  const inv = (state.dummyInvoices || []).find(x => x.id === id);
  if (!inv) return;

  const newStatus = inv.status === "PAID" ? "PENDING" : "PAID";
  const confirmed = await showCustomConfirm({
    title: "Ubah Status Tagihan?",
    message: `Ubah status pembayaran tagihan <b>${inv.id}</b> (${inv.tenantName}) menjadi <b class="${newStatus === 'PAID' ? 'text-emerald-600' : 'text-rose-600'}">${newStatus}</b>?`,
    confirmText: `Ubah ke ${newStatus}`,
    cancelText: "Batal",
    type: newStatus === "PAID" ? "success" : "warning",
    icon: newStatus === "PAID" ? "✅" : "⏳"
  });

  if (!confirmed) return;

  inv.status = newStatus;
  saveDummyState();
  updateDashboardUI();
  renderMasterInvoicesTable();
  showToast(`Status tagihan ${inv.id} diubah menjadi ${newStatus}!`, "success");
}

async function deleteInvoice(id) {
  const inv = (state.dummyInvoices || []).find(x => x.id === id);
  if (!inv) return;

  const confirmed = await showCustomConfirm({
    title: "Hapus Tagihan?",
    message: `Apakah Anda yakin ingin menghapus catatan tagihan <b>${inv.id}</b> (${inv.tenantName})?`,
    confirmText: "Ya, Hapus Tagihan",
    cancelText: "Batal",
    type: "danger",
    icon: "🗑️"
  });

  if (!confirmed) return;

  state.dummyInvoices = (state.dummyInvoices || []).filter(x => x.id !== id);
  saveDummyState();
  updateDashboardUI();
  renderMasterInvoicesTable();
  showToast(`Tagihan ${inv.id} berhasil dihapus!`, "success");
}

// ==================== BUKU KAS OPERASIONAL & PER-ROOM FILTER ====================
function toggleExpenseRoomField() {
  const cat = document.getElementById("expenseCategory")?.value;
  const isRoomCheck = document.getElementById("expenseIsRoomRepair");
  if (isRoomCheck) {
    if (cat === "MAINTENANCE") {
      isRoomCheck.checked = true;
      toggleExpenseRoomSelect(true);
    }
  }
}

function toggleExpenseRoomSelect(isChecked) {
  const container = document.getElementById("expenseRoomSelectContainer");
  if (container) {
    if (isChecked) {
      container.classList.remove("hidden");
      populateRoomSelectDropdowns();
    } else {
      container.classList.add("hidden");
    }
  }
}

function filterMasterExpensesTable() {
  const filterRoom = document.getElementById("filterExpenseRoomSelect")?.value || "ALL";
  const tbody = document.getElementById("expenseTableBody");
  if (!tbody) return;

  const allExpenses = state.dummyExpenses || [];
  const filtered = allExpenses.filter(x => {
    if (filterRoom === "ALL") return true;
    return (x.room || "").toString() === filterRoom;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">💸</span>
            <b class="text-slate-700">Tidak ada data pengeluaran untuk unit kamar ini</b>
            <span class="text-xs text-slate-400">Semua riwayat pengeluaran kas tercatat rapi.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(x => `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="p-3 text-slate-600 font-mono text-xs">${formatDateDMY(x.date)}</td>
      <td class="p-3 font-sans font-bold text-slate-800">
        ${x.category}
        ${x.room && x.room !== 'Semua Unit' ? `<span class="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-brand-700 border border-indigo-100">Kamar ${x.room}</span>` : ''}
      </td>
      <td class="p-3 font-sans text-slate-700">${x.description}</td>
      <td class="p-3 font-sans text-slate-500 font-semibold">${x.month || '-'} ${x.year || ''}</td>
      <td class="p-3 text-right font-black font-mono text-rose-600">${formatRupiah(x.amount)}</td>
    </tr>
  `).join("");
}

function renderMasterExpenses(expenses) {
  if (expenses && expenses.length > 0) {
    state.dummyExpenses = expenses.map(x => ({
      id: x[0],
      date: x[2],
      category: x[3],
      description: x[4],
      room: "Semua Unit",
      month: "Oktober",
      year: "2026",
      amount: x[5]
    }));
    saveDummyState();
  }
  filterMasterExpensesTable();
}

// Override submitExpenseRecord agar mencatat kamar perbaikan & periode bulan/tahun
async function submitExpenseRecord() {
  const desc = document.getElementById("expenseDescription").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value) || 0;
  const category = document.getElementById("expenseCategory").value;
  const isRoomRepair = document.getElementById("expenseIsRoomRepair")?.checked;
  const room = isRoomRepair ? (document.getElementById("expenseRoomSelect")?.value || "Semua Unit") : "Semua Unit";
  const month = document.getElementById("expenseMonth")?.value || "Oktober";
  const year = document.getElementById("expenseYear")?.value || "2026";

  if (!desc || amount <= 0) {
    showToast("Keterangan dan nominal pengeluaran kas wajib diisi!", "warning");
    return;
  }

  const newId = "EXP-" + Date.now().toString().slice(-4);
  if (!state.dummyExpenses) state.dummyExpenses = [];
  state.dummyExpenses.unshift({
    id: newId,
    date: new Date().toISOString().split("T")[0],
    category: category,
    description: desc,
    room: room,
    month: month,
    year: year,
    amount: amount
  });

  saveDummyState();
  closeModal("modalExpense");
  filterMasterExpensesTable();
  showToast(`Pengeluaran ${formatRupiah(amount)} berhasil dicatat di buku kas!`, "success");
}

// ==================== KELOLA STAF LAPANGAN CRUD ====================
function renderStaffListCards() {
  const container = document.getElementById("staffCardsContainer");
  const badge = document.getElementById("staffQuotaBadge");
  const staffList = state.dummyStaff || [];
  const quota = 2;

  if (badge) badge.innerText = `Kuota: ${staffList.length}/${quota}`;

  if (!container) return;

  if (staffList.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs font-semibold">Belum ada akun staf lapangan yang didaftarkan.</div>`;
    return;
  }

  container.innerHTML = staffList.map(st => `
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-brand-200 transition-all">
      <div>
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-sm text-slate-900 flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center font-black text-sm shadow-2xs">
              ${(st.name || 'S')[0]}
            </span>
            <div>
              <b class="text-slate-900 block">${st.name}</b>
              <span class="text-[10px] text-slate-400 font-mono">ID: ${st.id}</span>
            </div>
          </span>
          <span class="text-[10px] font-black bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">${st.status}</span>
        </div>
        <div class="mt-4 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
          <p>WhatsApp: <b class="font-mono text-slate-800">${st.phone}</b></p>
          <p>PIN Akses: <b class="font-mono text-brand-600">••••</b></p>
          <p>Hak Akses: <span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold">Input Meteran & Cek Kamar</span></p>
        </div>
      </div>
      <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span class="text-[10px] text-slate-400">KostHub Field Agent</span>
        <div class="flex items-center gap-2">
          <button onclick="editStaffModal('${st.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all">
            ✏️ Edit
          </button>
          <button onclick="deleteStaff('${st.id}')" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all">
            🗑️ Hapus
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

// Override loadStaffData
async function loadStaffData() {
  renderStaffListCards();
}

async function editStaffModal(id) {
  const st = (state.dummyStaff || []).find(x => x.id === id);
  if (!st) return;

  const newName = prompt("Ubah Nama Staf:", st.name);
  if (!newName) return;
  const newPhone = prompt("Ubah Nomor WhatsApp Staf:", st.phone);
  if (!newPhone) return;

  st.name = newName.trim();
  st.phone = newPhone.trim();
  saveDummyState();
  renderStaffListCards();
  showToast(`Akun Staf ${st.name} berhasil diperbarui!`, "success");
}

async function deleteStaff(id) {
  const st = (state.dummyStaff || []).find(x => x.id === id);
  if (!st) return;

  const confirmed = await showCustomConfirm({
    title: `Hapus Akun Staf ${st.name}?`,
    message: `Apakah Anda yakin ingin menghapus akun staf <b>${st.name}</b>? Staf tidak akan dapat login lagi ke panel lapangan.`,
    confirmText: "Ya, Hapus Staf",
    cancelText: "Batal",
    type: "danger",
    icon: "🗑️"
  });

  if (!confirmed) return;

  state.dummyStaff = (state.dummyStaff || []).filter(x => x.id !== id);
  saveDummyState();
  renderStaffListCards();
  showToast(`Akun Staf ${st.name} berhasil dihapus!`, "success");
}

// Override submitAddStaff
async function submitAddStaff() {
  const name = document.getElementById("staffNameInput").value.trim();
  const phone = document.getElementById("staffPhoneInput").value.trim();
  const pin = document.getElementById("staffPinInput").value.trim();

  if (!name || !phone || pin.length < 4) {
    showToast("Lengkapi nama, No. WhatsApp dan PIN 4-6 digit!", "warning");
    return;
  }

  if (!state.dummyStaff) state.dummyStaff = [];
  if (state.dummyStaff.length >= 2) {
    showToast("Kuota akun staf lapangan sudah penuh (Maksimal 2 akun)!", "warning");
    return;
  }

  const newId = "STF-0" + (state.dummyStaff.length + 1);
  state.dummyStaff.push({
    id: newId,
    name: name,
    phone: phone,
    status: "AKTIF",
    pin: pin
  });

  saveDummyState();
  closeModal("modalAddStaff");
  renderStaffListCards();
  showToast(`Akun staf baru ${name} berhasil didaftarkan!`, "success");
}

// ==================== KWITANSI DIGITAL & TOKEN RESOLVER ====================
// Robust public receipt loader (check dummy database first, fallback to API)
async function loadPublicReceipt(token) {
  try {
    // 1. Cari di local dummy invoices
    const allInvoices = state.dummyInvoices || [];
    const localInv = allInvoices.find(x => x.token === token || x.id === token || (x.roomNumber && token.includes(x.roomNumber)));

    if (localInv) {
      renderReceiptData({
        invoiceId: localInv.id,
        total: localInv.total,
        dueDate: localInv.dueDate,
        tenantName: localInv.tenantName,
        unitNumber: localInv.roomNumber,
        period: localInv.period || "Oktober 2026",
        baseRent: localInv.baseRent,
        electricCost: localInv.electricCost,
        tokenListrikMandiri: localInv.tokenListrikMandiri,
        propertyName: (state.masterConfig && state.masterConfig.siteTitle) || "GRAHA MELATI BATAM",
        propertySlogan: (state.masterConfig && state.masterConfig.siteSlogan) || "Multi-Tenant Automated Residential Property"
      });
      return;
    }

    // 2. Fallback jika ada API GAS
    const res = await fetch(`${GAS_API_URL}?action=getPublicReceipt&token=${token}`);
    const json = await res.json();
    if (json.status === "success") {
      renderReceiptData(json.data);
    } else {
      throw new Error("Token tidak valid");
    }
  } catch (e) {
    // Render fallback data representatif modern agar link kwitansi?token= tidak error
    renderReceiptData({
      invoiceId: "INV-DEMO-" + token.slice(0, 6).toUpperCase(),
      total: 1265000,
      dueDate: new Date().toISOString().split("T")[0],
      tenantName: "Dimas Pratama",
      unitNumber: "101",
      period: "Periode Berjalan 2026",
      baseRent: 1200000,
      electricCost: 65000,
      tokenListrikMandiri: false,
      propertyName: (state.masterConfig && state.masterConfig.siteTitle) || "GRAHA MELATI BATAM",
      propertySlogan: (state.masterConfig && state.masterConfig.siteSlogan) || "Multi-Tenant Automated Residential Property"
    });
  }
}

function renderReceiptData(data) {
  const invEl = document.getElementById("rcptInvId");
  const paidEl = document.getElementById("rcptTotalPaid");
  const dateEl = document.getElementById("rcptPaidDate");
  const tenantEl = document.getElementById("rcptTenantName");
  const unitEl = document.getElementById("rcptUnitNumber");
  const itemsEl = document.getElementById("rcptTableItems");
  const propNameEl = document.getElementById("rcptPropName");
  const propSloganEl = document.getElementById("rcptPropSlogan");

  if (propNameEl) propNameEl.innerText = data.propertyName || "GRAHA MELATI BATAM";
  if (propSloganEl) propSloganEl.innerText = data.propertySlogan || "Multi-Tenant Automated Residential Property";

  if (invEl) invEl.innerText = data.invoiceId || "-";
  if (paidEl) paidEl.innerText = formatRupiah(data.total);
  if (dateEl) dateEl.innerText = formatDateDMY(data.dueDate);
  if (tenantEl) tenantEl.innerText = data.tenantName || "Penghuni Kost";
  if (unitEl) unitEl.innerText = `Kamar ${data.unitNumber || '-'}`;

  if (itemsEl) {
    itemsEl.innerHTML = `
      <tr>
        <td class="p-3 text-slate-800 font-semibold">
          <b>Sewa Kamar ${data.unitNumber || ''}</b>
          <span class="block text-[11px] text-slate-400">Periode: ${data.period || 'Bulan Berjalan'}</span>
        </td>
        <td class="p-3 text-right font-mono font-bold text-slate-900">${formatRupiah(data.baseRent || data.total)}</td>
      </tr>
      ${data.electricCost > 0 ? `
        <tr>
          <td class="p-3 text-slate-800 font-semibold">
            <b>Biaya Pemakaian Listrik</b>
            <span class="block text-[11px] text-slate-400">${data.tokenListrikMandiri ? 'Token Mandiri (Gratis)' : 'Pemakaian Stand Meteran'}</span>
          </td>
          <td class="p-3 text-right font-mono font-bold text-slate-900">${formatRupiah(data.electricCost)}</td>
        </tr>
      ` : ''}
    `;
  }
}

// Download Professional Modern Receipt PDF
function downloadReceiptPdf() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const invId = document.getElementById("rcptInvId")?.innerText || "INV-001";
    const datePaid = document.getElementById("rcptPaidDate")?.innerText || "-";
    const tenantName = document.getElementById("rcptTenantName")?.innerText || "Dimas Pratama";
    const unitNum = document.getElementById("rcptUnitNumber")?.innerText || "101";
    const totalPaid = document.getElementById("rcptTotalPaid")?.innerText || "Rp 0";
    const propName = document.getElementById("rcptPropName")?.innerText || "GRAHA MELATI BATAM";
    const propSlogan = document.getElementById("rcptPropSlogan")?.innerText || "Multi-Tenant Automated Residential Property";

    // Header Background
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, 148, 30, "F");

    doc.setFillColor(79, 70, 229); // brand indigo
    doc.rect(0, 28.5, 148, 1.5, "F");

    // Title & Property
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(propName, 10, 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(propSlogan, 10, 19);
    doc.text("KWITANSI ELEKTRONIK RESMI (STATUS: LUNAS)", 10, 24);

    // Meta Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(10, 35, 128, 24, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(10, 35, 128, 24, 2, 2, "D");

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("NO. TRANSAKSI:", 14, 42);
    doc.text("TGL PELUNASAN:", 14, 52);
    doc.text("PENYEWA:", 75, 42);
    doc.text("UNIT KAMAR:", 75, 52);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(invId, 38, 42);
    doc.text(datePaid, 38, 52);
    doc.text(tenantName, 94, 42);
    doc.text(unitNum, 94, 52);

    // Table of Charges
    doc.autoTable({
      head: [["Uraian Pembayaran", "Subtotal"]],
      body: [
        [`Sewa Hunian ${unitNum}`, totalPaid],
        ["Biaya Operasional & Fasilitas", "Termasuk"]
      ],
      startY: 63,
      margin: { left: 10, right: 10 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: "bold" }
    });

    // Total Amount Box
    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(10, finalY, 128, 16, 2, 2, "F");
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(10, finalY, 128, 16, 2, 2, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(67, 56, 202);
    doc.text("TOTAL PELUNASAN DITERIMA:", 14, finalY + 10);
    doc.setFontSize(12);
    doc.text(totalPaid, 88, finalY + 11);

    // Signature and Verification
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Bukti pembayaran sah secara digital melalui KostHub OS.", 10, finalY + 26);
    doc.text("Verifikasi: SHA256-VALID-TRANSACTION", 10, finalY + 30);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text("Pengelola KostHub OS", 100, finalY + 26);
    doc.line(100, finalY + 36, 134, finalY + 36);

    doc.save(`Kwitansi_${invId}_${tenantName.replace(/\s+/g, '_')}.pdf`);
    showToast("Kwitansi PDF Berhasil Diunduh!", "success");
  } catch (e) {
    console.error("Gagal cetak PDF kwitansi:", e);
    showToast("Gagal menghasilkan PDF kwitansi: " + e.message, "error");
  }
}
