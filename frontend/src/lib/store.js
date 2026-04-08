"use client";

import { createContext, useContext, useReducer, useCallback, useMemo } from "react";

// ── Начальное состояние (Initial State) ───────────────────────────────────────────
const initialState = {
  // Один выбранный маркер (контакт) на карте
  activePin: null, // { lat, lng, id }

  // Множественный выбор точек (до 5 штук)
  selectedPoints: [], // [{ lat, lng, id, label }]

  // Видимость слоев на карте
  layers: {
    windRose: false,
    tectonicPlates: false,
    waveHeight: false,
    wildfires: false,
    volcanicActivity: false,
  },

  // Геолокация пользователя
  userLocation: null, // { lat, lng, source: 'gps' | 'cached' | 'default' }

  // Локальная статистика для местоположения пользователя
  localStats: null, // { aqi, seismicThreat, weatherAnomalies, ... }

  // Режим боковой панели
  sidebarPanel: "default", // 'default' | 'pinDetail' | 'layers'
};

// ── Типы действий (Action Types) ────────────────────────────────────────────
const SET_ACTIVE_PIN = "SET_ACTIVE_PIN";
const CLEAR_ACTIVE_PIN = "CLEAR_ACTIVE_PIN";
const ADD_SELECTED_POINT = "ADD_SELECTED_POINT";
const REMOVE_SELECTED_POINT = "REMOVE_SELECTED_POINT";
const CLEAR_SELECTED_POINTS = "CLEAR_SELECTED_POINTS";
const TOGGLE_LAYER = "TOGGLE_LAYER";
const SET_USER_LOCATION = "SET_USER_LOCATION";
const SET_LOCAL_STATS = "SET_LOCAL_STATS";
const SET_SIDEBAR_PANEL = "SET_SIDEBAR_PANEL";

// ── Редьюсер (Reducer) для управления состояниями ─────────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {
    case SET_ACTIVE_PIN:
      return { ...state, activePin: action.payload, sidebarPanel: "pinDetail" };

    case CLEAR_ACTIVE_PIN:
      return { ...state, activePin: null, sidebarPanel: "default" };

    case ADD_SELECTED_POINT: {
      if (state.selectedPoints.length >= 5) return state;
      const exists = state.selectedPoints.some((p) => p.id === action.payload.id);
      if (exists) return state;
      return {
        ...state,
        selectedPoints: [...state.selectedPoints, action.payload],
      };
    }

    case REMOVE_SELECTED_POINT:
      return {
        ...state,
        selectedPoints: state.selectedPoints.filter((p) => p.id !== action.payload),
      };

    case CLEAR_SELECTED_POINTS:
      return { ...state, selectedPoints: [] };

    case TOGGLE_LAYER:
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.payload]: !state.layers[action.payload],
        },
      };

    case SET_USER_LOCATION:
      return { ...state, userLocation: action.payload };

    case SET_LOCAL_STATS:
      return { ...state, localStats: action.payload };

    case SET_SIDEBAR_PANEL:
      return { ...state, sidebarPanel: action.payload };

    default:
      return state;
  }
}

// ── Контекст приложения (Context) ─────────────────────────────────────────────────
const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const actions = useMemo(
    () => ({
      setActivePin: (pin) =>
        dispatch({ type: SET_ACTIVE_PIN, payload: pin }),
      clearActivePin: () =>
        dispatch({ type: CLEAR_ACTIVE_PIN }),
      addSelectedPoint: (point) =>
        dispatch({ type: ADD_SELECTED_POINT, payload: point }),
      removeSelectedPoint: (id) =>
        dispatch({ type: REMOVE_SELECTED_POINT, payload: id }),
      clearSelectedPoints: () =>
        dispatch({ type: CLEAR_SELECTED_POINTS }),
      toggleLayer: (layerName) =>
        dispatch({ type: TOGGLE_LAYER, payload: layerName }),
      setUserLocation: (location) =>
        dispatch({ type: SET_USER_LOCATION, payload: location }),
      setLocalStats: (stats) =>
        dispatch({ type: SET_LOCAL_STATS, payload: stats }),
      setSidebarPanel: (panel) =>
        dispatch({ type: SET_SIDEBAR_PANEL, payload: panel }),
    }),
    []
  );

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={actions}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}

export function useAppActions() {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error("useAppActions must be used within AppProvider");
  return ctx;
}
