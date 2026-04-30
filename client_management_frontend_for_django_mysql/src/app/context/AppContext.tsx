import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import { Session, AppSettings, Statistics } from "../types";

import {
  archiveSessionApi,
  createSessionApi,
  deleteSessionApi,
  fetchSessionsApi,
  fetchStatisticsApi,
  fetchStations,
  loadAppSettings,
  pauseSessionApi,
  resumeSessionApi,
  saveAppSettings,
  terminateSessionApi,
  unarchiveSessionApi,
} from "../utils/api";

import { useAuth } from "./AuthContext";

interface AppContextType {
  sessions: Session[];
  settings: AppSettings;
  statistics: Statistics | null;
  loading: boolean;

  addSession: (
    session: Omit<Session, "id" | "startTime" | "status" | "elapsedTime">
  ) => Promise<void>;

  terminateSession: (
    id: string,
    elapsedTime?: number,
    totalCost?: number
  ) => Promise<void>;

  pauseSession: (id: string) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;

  updateSettings: (settings: AppSettings) => Promise<void>;

  getNextServiceName: (serviceType: "wifi" | "console") => string;

  deleteSession: (id: string) => Promise<void>;
  archiveSessions: (ids: string[]) => Promise<void>;
  deleteSessions: (ids: string[]) => Promise<void>;
  unarchiveSessions: (ids: string[]) => Promise<void>;

  fetchSessions: () => Promise<void>;
  fetchStatistics: (startDate?: string, endDate?: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

interface Station {
  id: number;
  name: string;
  station_type: "wifi" | "console";
  status?: "available" | "occupied" | "maintenance";
  is_active: boolean;
}

const defaultSettings: AppSettings = {
  rates: {
    wifi: {
      hourlyRate: 500,
      minCharge: 100,
    },
    console: {
      hourlyRate: 1000,
      minCharge: 200,
    },
  },
  notifications: {
    enabled: true,
    volume: 70,
    repeat: true,
    sound: "default",
  },
  products: [
    {
      name: "Film",
      defaultPrice: 1000,
      icon: "Film",
    },
    {
      name: "Série",
      defaultPrice: 500,
      icon: "Tv",
    },
    {
      name: "Gasy",
      defaultPrice: 800,
      icon: "Globe",
    },
    {
      name: "Animé",
      defaultPrice: 600,
      icon: "Sparkles",
    },
    {
      name: "Cache écran",
      defaultPrice: 2000,
      icon: "Shield",
    },
    {
      name: "Dos",
      defaultPrice: 1500,
      icon: "Smartphone",
    },
  ],
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([]);
      return;
    }

    const data = await fetchSessionsApi();
    setSessions(data);
  }, [isAuthenticated]);

  const fetchSettings = useCallback(async () => {
    const loaded = await loadAppSettings();
    setSettings(loaded);
  }, []);

  const fetchStationsList = useCallback(async () => {
    if (!isAuthenticated) {
      setStations([]);
      return;
    }

    const data = await fetchStations();
    setStations(data as Station[]);
  }, [isAuthenticated]);

  const fetchStatistics = useCallback(
    async (startDate?: string, endDate?: string) => {
      if (!isAuthenticated) {
        setStatistics(null);
        return;
      }

      const data = await fetchStatisticsApi(startDate, endDate);
      setStatistics(data);
    },
    [isAuthenticated]
  );

  const refreshData = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([]);
      setStations([]);
      setStatistics(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      await Promise.all([
        fetchSessions(),
        fetchStatistics(),
        fetchStationsList(),
        fetchSettings(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    fetchSessions,
    fetchStatistics,
    fetchStationsList,
    fetchSettings,
  ]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addSession = async (
    session: Omit<Session, "id" | "startTime" | "status" | "elapsedTime">
  ) => {
    await createSessionApi({
      clientName: session.clientName,
      serviceType: session.serviceType,
      serviceName: session.serviceName,
      sessionType: session.sessionType,
      plannedDuration: session.plannedDuration,
    });

    await refreshData();
  };

  const terminateSession = async (
    id: string,
    _elapsedTime?: number,
    _totalCost?: number
  ) => {
    await terminateSessionApi(id);
    await refreshData();
  };

  const pauseSession = async (id: string) => {
    await pauseSessionApi(id);

    setSessions((prevSessions) =>
      prevSessions.map((session) =>
        session.id === id
          ? {
              ...session,
              status: "paused",
              isPaused: true,
            }
          : session
      )
    );

    await refreshData();
  };

  const resumeSession = async (id: string) => {
    await resumeSessionApi(id);

    setSessions((prevSessions) =>
      prevSessions.map((session) =>
        session.id === id
          ? {
              ...session,
              status: "active",
              isPaused: false,
            }
          : session
      )
    );

    await refreshData();
  };

  const updateSettings = async (newSettings: AppSettings) => {
    const saved = await saveAppSettings(newSettings);
    setSettings(saved);
    await fetchStatistics();
  };

  const getNextServiceName = (serviceType: "wifi" | "console") => {
    const occupiedStationIds = new Set(
      sessions
        .filter(
          (session) =>
            (session.status === "active" || session.status === "paused") &&
            !session.archived
        )
        .map((session) => session.stationId)
        .filter(Boolean)
    );

    const availableStation = stations.find(
      (station) =>
        station.station_type === serviceType &&
        station.is_active &&
        (station.status ? station.status === "available" : true) &&
        !occupiedStationIds.has(station.id)
    );

    if (availableStation) {
      return availableStation.name;
    }

    const count =
      sessions.filter(
        (session) =>
          session.serviceType === serviceType &&
          (session.status === "active" || session.status === "paused") &&
          !session.archived
      ).length + 1;

    return serviceType === "wifi" ? `Wifi ${count}` : `Console ${count}`;
  };

  const deleteSession = async (id: string) => {
    await deleteSessionApi(id);
    await refreshData();
  };

  const archiveSessions = async (ids: string[]) => {
    await Promise.all(ids.map((id) => archiveSessionApi(id)));
    await refreshData();
  };

  const deleteSessions = async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteSessionApi(id)));
    await refreshData();
  };

  const unarchiveSessions = async (ids: string[]) => {
    await Promise.all(ids.map((id) => unarchiveSessionApi(id)));
    await refreshData();
  };

  return (
    <AppContext.Provider
      value={{
        sessions,
        settings,
        statistics,
        loading,

        addSession,
        terminateSession,
        pauseSession,
        resumeSession,

        updateSettings,
        getNextServiceName,

        deleteSession,
        archiveSessions,
        deleteSessions,
        unarchiveSessions,

        fetchSessions,
        fetchStatistics,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }

  return context;
}