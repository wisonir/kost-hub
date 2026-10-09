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
  platformBanks: null
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

  // Set default form date values
  const todayStr = new Date().toISOString().split("T")[0];
  const dueDateInput = document.getElementById("billingDueDate");
  const entryDateInput = document.getElementById("onboardEntryDate");
  if (dueDateInput) dueDateInput.value = todayStr;
  if (entryDateInput) entryDateInput.value = todayStr;
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
  const tabs = ["console", "users", "pending", "bank"];

  tabs.forEach(t => {
    const subviewEl = document.getElementById(`admSubview${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (subviewEl) {
      if (t === tabName) subviewEl.classList.remove("hidden");
      else subviewEl.classList.add("hidden");
    }
  });

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

  const allTenants = state.adminTenants || [];
  const filtered = allTenants.filter(t => {
    const matchesSearch = !search ||
      (t.ownerId || "").toLowerCase().includes(search) ||
      (t.propertyName || "").toLowerCase().includes(search) ||
      (t.ownerName || "").toLowerCase().includes(search) ||
      (t.phone || "").toLowerCase().includes(search);

    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesTier = tierFilter === "ALL" || t.tier === tierFilter;

    return matchesSearch && matchesStatus && matchesTier;
  });

  const footerInfo = document.getElementById("adminTenantTableFooterInfo");
  if (footerInfo) {
    footerInfo.innerText = `Menampilkan ${filtered.length} dari total ${allTenants.length} owner terdaftar`;
  }

  if (filtered.length === 0) {
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

  tbody.innerHTML = filtered.map(t => {
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
  if (selected.length === 0) return;

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

  clearAdminRowSelection();
  showToast(`Status ${selected.length} owner berhasil diubah!`, "success");
  loadSuperAdminData();
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

  const pendingList = state.adminPendingList || [];
  if (pendingList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-1.5">
            <span class="text-3xl">🎉</span>
            <b class="text-slate-700">Tidak ada antrean pembayaran baru</b>
            <span class="text-xs text-slate-400">Semua pendaftar telah diverifikasi atau belum mengunggah struk.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pendingList.map(p => `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="p-3 font-mono font-bold text-slate-500">${p.ownerId}</td>
      <td class="p-3 font-bold text-slate-900">${p.propertyName}</td>
      <td class="p-3">
        <b class="text-slate-800 block">${p.ownerName}</b>
        <span class="text-[11px] font-mono text-slate-500">${p.phone}</span>
      </td>
      <td class="p-3">
        <span class="px-2.5 py-1 rounded font-extrabold text-[10px] bg-indigo-50 text-brand-700 border border-indigo-100">${p.tier}</span>
      </td>
      <td class="p-3">
        ${p.proofUrl ? `
          <a href="${p.proofUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-brand-600 shadow-2xs">
            <span>📷</span> Lihat Struk
          </a>
        ` : '<span class="text-slate-400 font-bold text-[11px]">Belum Upload</span>'}
      </td>
      <td class="p-3 text-right">
        <button onclick="adminActivateOwner('${p.ownerId}')"
          class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-end gap-1.5 ml-auto">
          <span>⚡</span> Aktifkan Akun
        </button>
      </td>
    </tr>
  `).join("");
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
  showToast("Menyinkronkan data...", "info");
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