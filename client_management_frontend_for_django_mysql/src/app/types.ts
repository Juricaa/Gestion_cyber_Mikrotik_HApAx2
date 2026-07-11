export type ServiceType = "wifi" | "console";
export type SessionType = "open" | "countdown";
export type SessionStatus = "active" | "paused" | "terminated" | "archived";
export type PaymentStatus = "pending" | "paid";
export type NotificationSound =
  | "default"
  | "beep"
  | "bell"
  | "chime"
  | "alert"
  | "digital"
  | "success";
export interface Product {
  name: string;
  defaultPrice: number;
  icon: string;
}

export interface Session {
  id: string;
  clientName: string;
  serviceType: ServiceType;
  serviceName: string;
  sessionType: SessionType;
  startTime: string;
  endTime?: string;
  status: SessionStatus;
  elapsedTime: number;
  /** Secondes précises renvoyées par le backend. Utilisé pour figer correctement pause + montant. */
  elapsedSeconds?: number;
  totalCost?: number;
  /** pending = session terminée mais paiement pas encore confirmé. */
  paymentStatus?: PaymentStatus;
  paidAt?: string | null;
  plannedDuration?: number | null;
  archived?: boolean;
  isPaused?: boolean;
  pausedAt?: string | null;
  totalPausedSeconds?: number;
  stationId?: number;
  voucherCode?: string;
  mikrotikUsername?: string;
  /** Date exacte où MikroTik a vu le voucher utilisé. Null = client pas encore connecté. */
  lastResumedAt?: string | null;
  /** True quand le voucher est déjà utilisé et que le timer peut tourner. */
  timerStarted?: boolean;
  /** True quand la session WiFi est créée mais le client n'a pas encore utilisé le code. */
  waitingForHotspot?: boolean;
  remainingSeconds?: number;

  /** Timestamp backend du snapshot timer, utile pour debug/synchronisation WiFi. */
  timerSnapshotAt?: string;

  /** Moment frontend où les valeurs backend elapsedSeconds / remainingSeconds ont été reçues. */
  timerSyncedAt?: number;
}

export interface RateSetting {
  hourlyRate: number;
  minCharge: number;
}

export interface AppSettings {
  rates: {
    wifi: RateSetting;
    console: RateSetting;
  };
  notifications: {
    enabled: boolean;
    volume: number;
    repeat: boolean;
    sound: NotificationSound;
  };
  products: Product[];
}

export interface Sale {
  id: number;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  soldByUsername?: string;
  soldAt: string;
}

export interface DailyCashReconciliation {
  id?: number;
  date: string;
  actualAmount: number;
  note?: string;
  updatedAt?: string;
  updatedByUsername?: string;
}

export interface DailyRevenueRow {
  date: string;
  label: string;
  wifiRevenue: number;
  consoleRevenue: number;
  productRevenue: number;
  totalAppRevenue: number;
  actualAmount?: number | null;
  difference?: number | null;
  sessionCount: number;
  wifiSessionCount: number;
  consoleSessionCount: number;
  saleCount: number;
  productBreakdown: Record<string, number>;
}

export interface Statistics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalRevenue: number;
  revenueByService: Record<string, number>;
  revenueByDesignation: Record<string, number>;
  sessions: Session[];
  sales: Sale[];
  dailyRevenue: DailyRevenueRow[];
}

export interface BackupFile {
  filename: string;
  size_bytes: number;
  created_at: string;
  modified_at: string;
  type: string;
  format_version?: "cyber-manager-v1" | "legacy";
}

export interface BackupHistoryEntry {
  id: number;
  user: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}
