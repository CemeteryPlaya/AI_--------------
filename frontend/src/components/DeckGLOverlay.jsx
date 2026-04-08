"use client";

import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";

/**
 * DeckGLOverlay — связующее звено для интеграции слоев deck.gl в MapLibre GL
 * с использованием контроллера MapboxOverlay (совместимо с MapLibre v3+).
 */
export default function DeckGLOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}
