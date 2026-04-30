import { AppSettings, ServiceType, Session, Statistics, Product } from "../types";

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_API_BASE_URL_FORCE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

function isPrivateDevHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function buildBackendBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const forceConfigured = String(import.meta.env.VITE_API_BASE_URL_FORCE || "false") === "true";

  if (typeof window === "undefined") {
    return configured || "http://127.0.0.1:8000";
  }

  const frontendHost = window.location.hostname;
  const frontendProtocol = window.location.protocol || "http:";
  const sameHostBackendUrl = `${frontendProtocol}//${frontendHost}:8000`;

  // IMPORTANT : pour éviter les problèmes CORS/CSRF/cookie SameSite,
  // le frontend et le backend doivent utiliser le même hostname.
  // Ports différents OK : 5173 pour Vite, 8000 pour Django.
  if (!configured) {
    return sameHostBackendUrl;
  }

  if (forceConfigured) {
    return configured;
  }

  try {
    const parsed = new URL(configured);

    // Si .env contient une IP locale différente de l'adresse utilisée dans le navigateur,
    // on corrige automatiquement vers le même hostname que le frontend.
    // Exemple : page sur 172.22.80.1:5173 + .env 192.168.88.252:8000
    // devient appel API vers 172.22.80.1:8000.
    if (
      isPrivateDevHost(parsed.hostname) &&
      isPrivateDevHost(frontendHost) &&
      parsed.hostname !== frontendHost
    ) {
      return sameHostBackendUrl;
    }

    return configured;
  } catch {
    return sameHostBackendUrl;
  }
}

const BASE_URL = buildBackendBaseUrl();
const API_ROOT = `${BASE_URL}/api`;
const SETTINGS_STORAGE_KEY = "cyber-manager-settings-v2";

export type BackendUserRole = "admin" | "staff" | "viewer";

export interface BackendUser {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role: BackendUserRole;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  date_joined?: string;
  last_login?: string | null;
}

export interface BackendUserPayload {
  username: string;
  email?: string;
  full_name?: string;
  role: BackendUserRole;
  is_active?: boolean;
  password?: string;
}

interface BackendMeResponse {
  authenticated?: boolean;
  user?: BackendUser | null;
  id?: number;
  username?: string;
  email?: string;
  full_name?: string;
  role?: BackendUserRole;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
}

interface BackendStation {
  id: number;
  name: string;
  station_type: ServiceType;
  status: "available" | "occupied" | "maintenance";
  is_active: boolean;
}

interface BackendSession {
  id: number;
  client_name: string;
  voucher_code?: string;
  mikrotik_username?: string;
  mikrotik_user_id?: string;
  station: number;
  station_name?: string;
  service_type?: ServiceType;
  session_mode: "open" | "countdown";
  countdown_seconds: number;
  remaining_seconds: number;
  started_at: string;
  ended_at?: string | null;
  last_resumed_at?: string | null;
  consumed_seconds: number;
  paused_duration_seconds?: number;
  status: "active" | "paused" | "completed" | "archived";
  hourly_rate_snapshot?: number | string;
  minimum_price_snapshot?: number | string;
  final_price?: number | string | null;
}

export interface BackendSale {
  id: number;
  title: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  sold_by_username?: string;
  sold_at: string;
}

interface PricingRow {
  id: number;
  service_type: string;
  hourly_rate: string | number;
  minimum_price: string | number;
  active: boolean;
  updated_at?: string;
  updated_by?: number | null;
}

const defaultSettings: AppSettings = {
  rates: {
    wifi: { hourlyRate: 500, minCharge: 100 },
    console: { hourlyRate: 1000, minCharge: 200 },
  },
  notifications: {
    enabled: true,
    volume: 70,
    repeat: true,
    sound: "default",
  },
  products: [
    { name: "Film", defaultPrice: 1000, icon: "Film" },
    { name: "Série", defaultPrice: 500, icon: "Tv" },
    { name: "Gasy", defaultPrice: 800, icon: "Globe" },
    { name: "Animé", defaultPrice: 600, icon: "Sparkles" },
    { name: "Cache écran", defaultPrice: 2000, icon: "Shield" },
    { name: "Dos", defaultPrice: 1500, icon: "Smartphone" },
  ],
};

const AUTH_PATH_CANDIDATES = {
  csrf: ["/auth/csrf/"],
  login: ["/auth/login/"],
  logout: ["/auth/logout/"],
  me: ["/auth/me/"],
};

function parseNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function extractErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string") return payload || `Erreur ${status}`;

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = record.detail || record.error || record.message;

    if (typeof detail === "string" && detail) return detail;

    for (const value of Object.values(record)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "string") {
        return value[0];
      }

      if (typeof value === "string" && value) {
        return value;
      }
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return `Erreur ${status}`;
    }
  }

  return `Erreur ${status}`;
}

async function requestAbsolute<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const csrf = readCookie("csrftoken");

  if (csrf && !headers.has("X-CSRFToken") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRFToken", csrf);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status));
  }

  return payload as T;
}

async function tryRequestPaths<T>(paths: string[], options: RequestInit = {}): Promise<T> {
  let lastError: unknown;

  for (const path of paths) {
    try {
      return await requestAbsolute<T>(`${API_ROOT}${path}`, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Erreur réseau");
}

async function ensureCsrf() {
  if (readCookie("csrftoken")) return;
  await tryRequestPaths(AUTH_PATH_CANDIDATES.csrf);
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await ensureCsrf();
  }

  return requestAbsolute<T>(`${API_ROOT}${path}`, options);
}

function computeElapsedSeconds(raw: BackendSession) {
  const consumed = parseNumber(raw.consumed_seconds, 0);

  if (raw.status === "active" && raw.last_resumed_at) {
    const delta = Math.max(
      0,
      Math.floor((Date.now() - new Date(raw.last_resumed_at).getTime()) / 1000)
    );

    return consumed + delta;
  }

  // Si last_resumed_at est null, le voucher n'a pas encore été utilisé
  // ou la session est en pause : on garde uniquement le compteur backend.
  return consumed;
}

function isWaitingForHotspot(raw: BackendSession) {
  const serviceType = raw.service_type || "wifi";
  const consumed = parseNumber(raw.consumed_seconds, 0);

  return (
    raw.status === "active" &&
    serviceType === "wifi" &&
    Boolean(raw.voucher_code || raw.mikrotik_username) &&
    !raw.last_resumed_at &&
    consumed === 0
  );
}

function computeCurrentPrice(raw: BackendSession) {
  // Tant que le client n'a pas encore utilisé le code WiFi,
  // le chrono et le montant restent à 0 côté frontend.
  if (isWaitingForHotspot(raw)) {
    return 0;
  }

  if (raw.final_price != null) {
    return parseNumber(raw.final_price, 0);
  }

  const elapsedSeconds = computeElapsedSeconds(raw);
  const hourlyRate = parseNumber(raw.hourly_rate_snapshot, 0);
  const minCharge = parseNumber(raw.minimum_price_snapshot, 0);
  const price = (elapsedSeconds / 3600) * hourlyRate;

  if (elapsedSeconds <= 0) {
    return 0;
  }

  return Math.max(minCharge, Math.round(price * 100) / 100);
}

function mapSession(raw: any): Session {
  const backendStatus = String(raw.status || "").toLowerCase();

  const frontendStatus =
    backendStatus === "paused"
      ? "paused"
      : backendStatus === "completed" ||
          backendStatus === "finished" ||
          backendStatus === "terminated"
        ? "terminated"
        : backendStatus === "archived"
          ? "archived"
          : "active";

  const sessionMode = raw.session_mode || raw.sessionType || raw.session_type;

  const countdownSeconds = parseNumber(raw.countdown_seconds, 0);
  const remainingSecondsFromBackend = parseNumber(raw.remaining_seconds, 0);
  const pausedDurationSeconds = parseNumber(raw.paused_duration_seconds, 0);

  const rawSession = raw as BackendSession;
  const waitingForHotspot = isWaitingForHotspot(rawSession);

  const elapsedSecondsFromClock = waitingForHotspot
    ? 0
    : computeElapsedSeconds(rawSession);

  let elapsedSeconds = elapsedSecondsFromClock;
  let remainingSeconds = 0;

  if (sessionMode === "countdown" && countdownSeconds > 0) {
    if (waitingForHotspot) {
      // Session WiFi créée, mais code pas encore utilisé : le compte à rebours
      // affiche la durée complète et ne descend pas.
      remainingSeconds = remainingSecondsFromBackend > 0
        ? remainingSecondsFromBackend
        : countdownSeconds;
      elapsedSeconds = 0;
    } else if (backendStatus === "paused") {
      // En pause, on affiche la valeur figée par le backend.
      remainingSeconds = remainingSecondsFromBackend;
      elapsedSeconds = Math.max(0, countdownSeconds - remainingSeconds);
    } else {
      // En actif, le chrono reste juste après refresh / changement d'adresse IP.
      remainingSeconds = countdownSeconds - elapsedSecondsFromClock;
    }
  }

  return {
    id: String(raw.id),

    clientName: raw.client_name || raw.voucher_code || `ticket-${raw.id}`,

    serviceType: raw.service_type || "wifi",

    serviceName:
      raw.station_name ||
      raw.service_name ||
      `Station ${raw.station}`,

    sessionType: sessionMode === "countdown" ? "countdown" : "open",

    startTime: raw.started_at,
    endTime: raw.ended_at || undefined,

    status: frontendStatus,

    elapsedTime: Math.floor(elapsedSeconds / 60),

    // Garder les secondes précises : elapsedTime en minutes perd les secondes
    // et provoque des bugs d'affichage/prix pendant une pause.
    elapsedSeconds: Math.max(0, Math.floor(elapsedSeconds)),

    totalCost: computeCurrentPrice(raw),

    plannedDuration:
      countdownSeconds > 0
        ? Math.round(countdownSeconds / 60)
        : null,

    archived: backendStatus === "archived" || raw.archived === true,

    isPaused: backendStatus === "paused",

    // Si ton backend envoie paused_at, utilise-le.
    // Sinon null est acceptable, car le chrono peut se figer avec status = paused.
    pausedAt: raw.paused_at || raw.pausedAt || null,

    // Pause totale déjà calculée côté backend.
    // La pause actuelle n'est ajoutée qu'au moment de resume.
    totalPausedSeconds: pausedDurationSeconds,

    stationId: raw.station,
    voucherCode: raw.voucher_code || undefined,
    mikrotikUsername: raw.mikrotik_username || undefined,
    lastResumedAt: raw.last_resumed_at || null,
    timerStarted: !waitingForHotspot,
    waitingForHotspot,

    remainingSeconds:
      sessionMode === "countdown" ? Math.max(0, Math.floor(remainingSeconds)) : 0,
  };
}

function isWithinRange(dateValue: string, startDate?: string, endDate?: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return false;

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    if (date < start) return false;
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (date > end) return false;
  }

  return true;
}

/**
 * Produit dans pricing_tariff
 * Exemple :
 * service_type = product:Film
 * hourly_rate = 1
 * minimum_price = prix du produit
 */
function productServiceType(productName: string) {
  return `product:${productName.trim()}`;
}

function productNameFromServiceType(serviceType: string) {
  return serviceType.replace(/^product:/, "");
}

function isProductTariff(row: PricingRow) {
  return row.service_type.startsWith("product:");
}

function getDefaultProductIcon(productName: string) {
  const found = defaultSettings.products.find(
    (product) => product.name.toLowerCase() === productName.toLowerCase()
  );

  return found?.icon || "Film";
}

async function upsertPricingRow(
  currentRows: PricingRow[],
  body: {
    service_type: string;
    hourly_rate: string | number;
    minimum_price: string | number;
    active: boolean;
  }
) {
  const existing = currentRows.find((row) => row.service_type === body.service_type);

  const payload = {
    service_type: body.service_type,
    hourly_rate: String(body.hourly_rate),
    minimum_price: String(body.minimum_price),
    active: body.active,
  };

  if (existing) {
    const updated = await apiRequest<PricingRow>(`/pricing/${existing.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    const index = currentRows.findIndex((row) => row.id === existing.id);
    if (index >= 0) currentRows[index] = updated;

    return updated;
  }

  const created = await apiRequest<PricingRow>("/pricing/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  currentRows.push(created);

  return created;
}

export async function getCurrentUser() {
  const payload = await tryRequestPaths<BackendMeResponse>(AUTH_PATH_CANDIDATES.me);

  // Nouvelle réponse backend : { authenticated: true, user: {...} }
  if (payload.user) {
    return payload.user;
  }

  // Compatibilité avec l'ancien backend qui retourne directement l'utilisateur.
  if (payload.id && payload.username && payload.role) {
    return payload as BackendUser;
  }

  throw new Error("Non connecté");
}

export async function login(username: string, password: string) {
  await ensureCsrf();

  return tryRequestPaths<{ user: BackendUser }>(AUTH_PATH_CANDIDATES.login, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  await ensureCsrf();

  return tryRequestPaths<{ detail: string }>(AUTH_PATH_CANDIDATES.logout, {
    method: "POST",
  });
}

function normalizeUserResponse(payload: BackendUser | { user?: BackendUser }) {
  if (payload && typeof payload === "object" && "user" in payload && payload.user) {
    return payload.user;
  }
  return payload as BackendUser;
}

export async function fetchUsersApi() {
  return apiRequest<BackendUser[]>("/auth/users/");
}

export async function createUserApi(payload: BackendUserPayload) {
  const data = await apiRequest<BackendUser | { user?: BackendUser }>("/auth/users/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeUserResponse(data);
}

export async function updateUserApi(id: number, payload: Partial<BackendUserPayload>) {
  const cleanedPayload: Partial<BackendUserPayload> = { ...payload };

  if (!cleanedPayload.password) {
    delete cleanedPayload.password;
  }

  return apiRequest<BackendUser>(`/auth/users/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(cleanedPayload),
  });
}

export async function deleteUserApi(id: number) {
  return apiRequest<void>(`/auth/users/${id}/`, {
    method: "DELETE",
  });
}

export async function fetchStations() {
  return apiRequest<BackendStation[]>("/stations/");
}

export async function fetchSessionsApi() {
  const data = await apiRequest<BackendSession[]>("/sessions/");
  return data.map(mapSession);
}

export async function fetchActiveSessionsApi() {
  const data = await apiRequest<BackendSession[]>("/sessions/active/");
  return data.map(mapSession);
}

export async function fetchHistorySessionsApi() {
  const data = await apiRequest<BackendSession[]>("/sessions/history/");
  return data.map(mapSession);
}

export async function createSessionApi(payload: {
  clientName: string;
  serviceType: ServiceType;
  serviceName: string;
  sessionType: "open" | "countdown";
  plannedDuration?: number | null;
}) {
  const stations = await fetchStations();

  const exact = stations.find(
    (station) =>
      station.is_active &&
      station.status === "available" &&
      station.name === payload.serviceName &&
      station.station_type === payload.serviceType
  );

  const available = stations.find(
    (station) =>
      station.is_active &&
      station.status === "available" &&
      station.station_type === payload.serviceType
  );

  const station = exact || available;

  if (!station) {
    throw new Error(`Aucune station ${payload.serviceType} disponible dans le backend.`);
  }

  const created = await apiRequest<BackendSession>("/sessions/", {
    method: "POST",
    body: JSON.stringify({
      client_name: payload.clientName,
      station: station.id,
      service_type: payload.serviceType,
      session_mode: payload.sessionType,
      countdown_seconds:
        payload.sessionType === "countdown" && payload.plannedDuration
          ? payload.plannedDuration * 60
          : 0,
    }),
  });

  return mapSession(created);
}

export async function terminateSessionApi(id: string) {
  return apiRequest<BackendSession>(`/sessions/${id}/finish/`, {
    method: "POST",
  });
}

export async function pauseSessionApi(id: string) {
  return apiRequest<BackendSession>(`/sessions/${id}/pause/`, {
    method: "POST",
  });
}

export async function resumeSessionApi(id: string) {
  return apiRequest<BackendSession>(`/sessions/${id}/resume/`, {
    method: "POST",
  });
}

export async function archiveSessionApi(id: string) {
  return apiRequest<BackendSession>(`/sessions/${id}/archive/`, {
    method: "POST",
  });
}

export async function unarchiveSessionApi(id: string) {
  return apiRequest<BackendSession>(`/sessions/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}

export async function deleteSessionApi(id: string) {
  return apiRequest<void>(`/sessions/${id}/`, {
    method: "DELETE",
  });
}

export async function fetchRatesApi() {
  const data = await apiRequest<PricingRow[]>("/pricing/");

  const rates = {
    wifi: { ...defaultSettings.rates.wifi },
    console: { ...defaultSettings.rates.console },
  };

  data.forEach((row) => {
    if (!row.active) return;

    if (row.service_type === "wifi") {
      rates.wifi = {
        hourlyRate: parseNumber(row.hourly_rate, defaultSettings.rates.wifi.hourlyRate),
        minCharge: parseNumber(row.minimum_price, defaultSettings.rates.wifi.minCharge),
      };
    }

    if (row.service_type === "console") {
      rates.console = {
        hourlyRate: parseNumber(row.hourly_rate, defaultSettings.rates.console.hourlyRate),
        minCharge: parseNumber(row.minimum_price, defaultSettings.rates.console.minCharge),
      };
    }
  });

  return rates;
}

export async function fetchProductsApi(): Promise<Product[]> {
  const data = await apiRequest<PricingRow[]>("/pricing/");

  const productRows = data.filter(isProductTariff);

  if (productRows.length === 0) {
    return defaultSettings.products;
  }

  return productRows
    .filter((row) => row.active)
    .map((row) => {
      const name = productNameFromServiceType(row.service_type);

      return {
        name,
        defaultPrice: parseNumber(row.minimum_price, 0),
        icon: getDefaultProductIcon(name),
      };
    })
    .filter((product) => product.name.trim() && product.defaultPrice > 0);
}

export async function updateRatesApi(settings: AppSettings) {
  const currentRows = await apiRequest<PricingRow[]>("/pricing/");

  await upsertPricingRow(currentRows, {
    service_type: "wifi",
    hourly_rate: settings.rates.wifi.hourlyRate,
    minimum_price: settings.rates.wifi.minCharge,
    active: true,
  });

  await upsertPricingRow(currentRows, {
    service_type: "console",
    hourly_rate: settings.rates.console.hourlyRate,
    minimum_price: settings.rates.console.minCharge,
    active: true,
  });

  const activeProductServiceTypes = new Set<string>();
  const productMap = new Map<string, Product>();

  for (const product of settings.products || []) {
    const cleanName = product.name.trim();

    if (!cleanName) continue;

    const serviceType = productServiceType(cleanName);

    activeProductServiceTypes.add(serviceType);
    productMap.set(serviceType, {
      ...product,
      name: cleanName,
    });
  }

  for (const [serviceType, product] of productMap.entries()) {
    await upsertPricingRow(currentRows, {
      service_type: serviceType,
      hourly_rate: 1,
      minimum_price: product.defaultPrice,
      active: true,
    });
  }

  const oldProductRows = currentRows.filter(isProductTariff);

  for (const row of oldProductRows) {
    if (!activeProductServiceTypes.has(row.service_type) && row.active) {
      await apiRequest<PricingRow>(`/pricing/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          active: false,
        }),
      });
    }
  }
}

export function loadLocalSettings(): AppSettings {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!raw) return defaultSettings;

    return {
      ...defaultSettings,
      ...JSON.parse(raw),
    };
  } catch {
    return defaultSettings;
  }
}

export function saveLocalSettings(settings: AppSettings) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export async function loadAppSettings(): Promise<AppSettings> {
  const local = loadLocalSettings();

  try {
    const [rates, products] = await Promise.all([
      fetchRatesApi(),
      fetchProductsApi(),
    ]);

    return {
      ...local,
      rates,
      products,
    };
  } catch (error) {
    console.error("Error loading app settings:", error);
    return local;
  }
}

export async function saveAppSettings(settings: AppSettings) {
  await updateRatesApi(settings);
  saveLocalSettings(settings);

  try {
    return await loadAppSettings();
  } catch {
    return settings;
  }
}

export async function fetchSalesApi() {
  return apiRequest<BackendSale[]>("/film-sales/");
}

export async function fetchSalesSummaryApi(startDate?: string, endDate?: string) {
  const sales = await fetchSalesApi();
  const filtered = sales.filter((sale) => isWithinRange(sale.sold_at, startDate, endDate));

  const salesByDesignation = filtered.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.title] = (acc[sale.title] || 0) + parseNumber(sale.total_price, 0);
    return acc;
  }, {});

  return {
    total_sales_amount: filtered.reduce(
      (sum, sale) => sum + parseNumber(sale.total_price, 0),
      0
    ),
    sales_by_designation: salesByDesignation,
    count: filtered.length,
  };
}

export async function fetchStatisticsApi(
  startDate?: string,
  endDate?: string
): Promise<Statistics> {
  const [sessions, sales] = await Promise.all([
    fetchSessionsApi(),
    fetchSalesApi(),
  ]);

  const filteredSessions = sessions.filter((session) =>
    isWithinRange(session.startTime, startDate, endDate)
  );

  const filteredSales = sales.filter((sale) =>
    isWithinRange(sale.sold_at, startDate, endDate)
  );

  const revenueByService = filteredSessions.reduce<Record<string, number>>((acc, session) => {
    if (session.status === "terminated" || session.status === "archived") {
      acc[session.serviceType] = (acc[session.serviceType] || 0) + (session.totalCost || 0);
    }

    return acc;
  }, {});

  const revenueByDesignation = filteredSales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.title] = (acc[sale.title] || 0) + parseNumber(sale.total_price, 0);
    return acc;
  }, {});

  const sessionRevenue = filteredSessions
    .filter((session) => session.status === "terminated" || session.status === "archived")
    .reduce((sum, session) => sum + (session.totalCost || 0), 0);

  const salesRevenue = filteredSales.reduce(
    (sum, sale) => sum + parseNumber(sale.total_price, 0),
    0
  );

  return {
    totalSessions: filteredSessions.length,
    activeSessions: filteredSessions.filter((session) => session.status === "active").length,
    completedSessions: filteredSessions.filter((session) => session.status === "terminated").length,
    totalRevenue: sessionRevenue + salesRevenue,
    revenueByService,
    revenueByDesignation,
    sessions: filteredSessions,
  };
}

export async function fetchDashboardSummaryApi() {
  return apiRequest<{
    active_sessions: number;
    completed_sessions: number;
    total_session_revenue: number | string;
    total_film_revenue: number | string;
    total_revenue: number | string;
  }>("/reports/dashboard/");
}

export async function createSaleApi(
  items: Array<{
    designation: string;
    quantity: number;
    unitPrice: number;
  }>
) {
  const results: BackendSale[] = [];

  for (const item of items) {
    const created = await apiRequest<BackendSale>("/film-sales/", {
      method: "POST",
      body: JSON.stringify({
        title: item.designation,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      }),
    });

    results.push(created);
  }

  return results;
}

export async function deleteSaleApi(id: string) {
  return apiRequest<void>(`/film-sales/${id}/`, {
    method: "DELETE",
  });
}

export async function pingBackend() {
  try {
    // Ne pas utiliser /auth/me/ pour tester le serveur :
    // si l'utilisateur n'est pas connecté, /auth/me/ peut répondre non authentifié.
    // /auth/csrf/ est public et prouve que Django répond correctement.
    await tryRequestPaths(AUTH_PATH_CANDIDATES.csrf);
    return true;
  } catch {
    return false;
  }
}

export { BASE_URL, API_ROOT };