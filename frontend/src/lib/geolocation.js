/**
 * Утилита геолокации с явным запросом разрешений:
 * 1. Проверка разрешений через Permissions API
 * 2. Запрос navigator.geolocation (вызывает окно браузера)
 * 3. Резервный вариант: кэшированные координаты из localStorage
 * 4. Резервный вариант: локация по умолчанию (Москва)
 */

const STORAGE_KEY = "cri_user_location";
const DEFAULT_LOCATION = { lat: 55.751, lng: 37.618, source: "default" };

/**
 * Проверка текущего статуса разрешений геолокации.
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unknown'>}
 */
export async function checkGeolocationPermission() {
  try {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state; // 'granted' | 'denied' | 'prompt'
    }
  } catch {
    // Permissions API не поддерживается
  }
  return "unknown";
}

/**
 * Явный запрос геолокации у браузера.
 * Это ВЫЗОВЕТ всплывающее окно браузера, если разрешение еще не принято.
 * @returns {Promise<{lat, lng, source, error?}>}
 */
export function requestGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...getFromStorageOrDefault(), error: "Geolocation API недоступен в этом браузере" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "gps",
          accuracy: position.coords.accuracy,
        };
        saveToStorage(loc);
        resolve(loc);
      },
      (err) => {
        let error;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            error = "Доступ к геолокации запрещён. Разрешите в настройках браузера.";
            break;
          case err.POSITION_UNAVAILABLE:
            error = "Информация о местоположении недоступна.";
            break;
          case err.TIMEOUT:
            error = "Превышено время ожидания запроса геолокации.";
            break;
          default:
            error = "Не удалось определить местоположение.";
        }
        resolve({ ...getFromStorageOrDefault(), error });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Получение кэшированной локации или локации по умолчанию (без окна браузера).
 */
export function getCachedOrDefault() {
  return getFromStorageOrDefault();
}

function getFromStorageOrDefault() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.lat && parsed.lng) {
        return { lat: parsed.lat, lng: parsed.lng, source: "cached" };
      }
    }
  } catch {
    // игнорируем ошибку
  }
  return { ...DEFAULT_LOCATION };
}

function saveToStorage(loc) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat: loc.lat, lng: loc.lng })
    );
  } catch {
    // игнорируем ошибку
  }
}
