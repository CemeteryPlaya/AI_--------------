"use client";

import { useState, useRef, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * UploadPanel — Drag-and-drop GeoJSON file upload with visual feedback.
 */
export default function UploadPanel({ onUploadSuccess }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;

      // Validate extension
      if (!file.name.match(/\.(geojson|json)$/i)) {
        setResult({
          type: "error",
          message: "Please upload a .geojson or .json file.",
        });
        return;
      }

      setIsUploading(true);
      setResult(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_URL}/api/upload-assets`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setResult({
            type: "success",
            message: `✓ ${data.assets_created} of ${data.total_features} assets imported`,
            details: data.errors?.length
              ? `${data.errors.length} warning(s)`
              : null,
          });
          onUploadSuccess?.();
        } else {
          setResult({
            type: "error",
            message: data.detail || "Upload failed. Check your file format.",
          });
        }
      } catch (err) {
        setResult({
          type: "error",
          message: "Connection error. Is the backend running?",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadSuccess]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      handleUpload(file);
    },
    [handleUpload]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onFileSelect = useCallback(
    (e) => {
      const file = e.target.files[0];
      handleUpload(file);
    },
    [handleUpload]
  );

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">📤</span>
        Upload Assets
      </div>

      <div
        className={`upload-zone ${isDragOver ? "drag-over" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="upload-icon">
          {isUploading ? (
            <span className="spinner" style={{ margin: "0 auto" }}></span>
          ) : (
            "🌐"
          )}
        </span>
        <div className="upload-text">
          {isUploading ? (
            "Processing..."
          ) : (
            <>
              Drag & drop <strong>GeoJSON</strong> here
            </>
          )}
        </div>
        <div className="upload-subtext">
          {isUploading
            ? "Validating geometries & saving to PostGIS"
            : "or click to browse • .geojson, .json"}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json"
          onChange={onFileSelect}
          style={{ display: "none" }}
          id="geojson-upload-input"
        />
      </div>

      {result && (
        <div className={`upload-result ${result.type}`} style={{ marginTop: 12 }}>
          <div>{result.message}</div>
          {result.details && (
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              {result.details}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
