"""
===============================================================================
TinyML Flood Prediction — Ultra-Lightweight MLP (~921 параметров)
===============================================================================
Этот скрипт загружает данные Kaggle «Flood Prediction», выполняет предобработку,
обучает микро-нейросеть (≤1000 параметров) и экспортирует модель в ONNX.

Архитектура (доказательство ≤1000 параметров):
    Input(20) → Dense(24) + ReLU  →  (20+1)×24 = 504 параметров
                Dense(16) + ReLU  →  (24+1)×16 = 400 параметров
                Dense(1)  + Sigmoid → (16+1)×1  =  17 параметров
                                              ────────────────
                                       Итого =   921 параметров
===============================================================================
Запуск:
  1) Скачайте "Flood Prediction Factors" с Kaggle и положите train.csv в data/
  2) pip install torch pandas scikit-learn onnx
  3) python tiny_flood_mlp.py
===============================================================================
"""

import os
import sys
import math
import pathlib

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

# ──────────────────────────────────────────────────────────────────────────────
# Конфигурация
# ──────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR   = SCRIPT_DIR / "data"

RANDOM_SEED  = 42
TEST_SIZE    = 0.20
BATCH_SIZE   = 64
LEARNING_RATE = 1e-3
MAX_EPOCHS   = 200
PATIENCE     = 15          # для Early Stopping

# Устройство (GPU, если доступен)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ──────────────────────────────────────────────────────────────────────────────
# 1. Загрузка и предобработка данных
# ──────────────────────────────────────────────────────────────────────────────
def find_csv(data_dir: pathlib.Path) -> pathlib.Path:
    """
    Найти первый CSV-файл в указанной папке.
    
    Аргументы:
        data_dir (pathlib.Path): Путь к директории с данными.
        
    Возвращает:
        pathlib.Path: Путь к первому найденному CSV-файлу.
    """
    csv_files = sorted(data_dir.glob("*.csv"))
    if not csv_files:
        print(f"[ОШИБКА] CSV-файлы не найдены в: {data_dir}")
        print(f"  → Положите любой .csv файл в {data_dir}/")
        sys.exit(1)
    if len(csv_files) > 1:
        print(f"  Найдено {len(csv_files)} CSV-файлов, используется: {csv_files[0].name}")
    return csv_files[0]


def load_and_preprocess(path: pathlib.Path):
    """
    Загрузить CSV файл, извлечь целевую переменную, заполнить пропуски 
    и отмасштабировать признаки для обучения нейросети.
    
    Аргументы:
        path (pathlib.Path): Путь к исходному CSV файлу.
        
    Возвращает:
        tuple: (X_train, X_test, y_train, y_test, число_признаков) - кортеж с тренировочными 
               и тестовыми данными, а также количеством входных параметров.
    """
    print(f"  Датасет: {path.name}")

    df = pd.read_csv(path)
    print(f"Загружено {len(df)} строк, {df.shape[1]} столбцов")

    # Удалить служебный столбец id, если есть
    if "id" in df.columns:
        df = df.drop(columns=["id"])

    # Определить целевую переменную автоматически
    # Приоритет: FloodProbability → ключевые слова → последний числовой столбец
    numeric_df_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    keywords = ["floodprobability", "flood", "probability", "risk",
                "target", "label", "output", "class", "yield", "price"]

    target_col = None
    # 1. Точное совпадение
    if "FloodProbability" in df.columns:
        target_col = "FloodProbability"
    # 2. Поиск по ключевым словам (числовые столбцы)
    if target_col is None:
        for kw in keywords:
            matches = [c for c in numeric_df_cols if kw in c.lower()]
            if matches:
                target_col = matches[0]
                break
    # 3. Запасной вариант — последний числовой столбец
    if target_col is None:
        if numeric_df_cols:
            target_col = numeric_df_cols[-1]
        else:
            print("[ОШИБКА] В датасете нет числовых столбцов для обучения.")
            sys.exit(1)

    print(f"\n  Все столбцы датасета: {list(df.columns)}")
    print(f"  ✓ Целевая переменная: '{target_col}'")
    print(f"  (Чтобы изменить — задайте TARGET_COL в конфигурации)\n")

    # Разделить на X и y
    y = df[target_col].values.astype(np.float32)
    X = df.drop(columns=[target_col])

    # Оставить только числовые колонки
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    X = X[numeric_cols].values.astype(np.float32)

    print(f"  Признаков: {X.shape[1]}, Целевая: {target_col}")

    # Заполнить пропуски медианой
    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    # Масштабирование
    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    # Разбить на train / test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_SEED
    )

    print(f"  Train: {X_train.shape[0]}  |  Test: {X_test.shape[0]}")
    return X_train, X_test, y_train, y_test, X.shape[1]


# ──────────────────────────────────────────────────────────────────────────────
# 2. Определение модели (≤1000 параметров)
# ──────────────────────────────────────────────────────────────────────────────
class TinyFloodMLP(nn.Module):
    """
    Сверхлёгкий MLP для предсказания вероятности наводнения.

    Подсчёт параметров (для in_features=20):
        Linear(20→24): (20+1)×24 = 504   (weights + biases)
        Linear(24→16): (24+1)×16 = 400
        Linear(16→1):  (16+1)×1  =  17
                                ────────
                         Итого = 921 ≤ 1000 ✓

    Для произвольного числа входных признаков архитектура адаптируется,
    но по умолчанию рассчитана на ~20 признаков.
    """

    def __init__(self, in_features: int = 20):
        super().__init__()
        # Расчёт размеров скрытых слоёв, если in_features отличается
        # от 20, подбираем h1 и h2 так, чтобы уложиться в 1000 параметров.
        # Для 20 признаков: h1=24, h2=16 → 921 параметр.
        if in_features == 20:
            h1, h2 = 24, 16
        else:
            # Автоматический подбор: стараемся ≤1000 параметров
            # budget = (in_features+1)*h1 + (h1+1)*h2 + (h2+1)*1
            # Упрощённо: h1 ≈ budget * 0.55 / (in_features+1),  h2 ≈ budget * 0.43 / (h1+1)
            budget = 980
            h1 = max(4, int(budget * 0.55 / (in_features + 1)))
            h2 = max(2, int((budget - (in_features + 1) * h1) * 0.95 / (h1 + 1)))
            # Корректируем, чтобы не превысить 1000
            total = (in_features + 1) * h1 + (h1 + 1) * h2 + (h2 + 1)
            while total > 1000 and h2 > 2:
                h2 -= 1
                total = (in_features + 1) * h1 + (h1 + 1) * h2 + (h2 + 1)
            while total > 1000 and h1 > 4:
                h1 -= 1
                total = (in_features + 1) * h1 + (h1 + 1) * h2 + (h2 + 1)

        self.net = nn.Sequential(
            nn.Linear(in_features, h1),
            nn.ReLU(),
            nn.Linear(h1, h2),
            nn.ReLU(),
            nn.Linear(h2, 1),
            # Линейный выход: подходит для регрессии с произвольным диапазоном.
            # Используйте Sigmoid только если цель строго в [0, 1] (вероятность).
        )

        # Напечатать подсчёт параметров
        p1 = (in_features + 1) * h1
        p2 = (h1 + 1) * h2
        p3 = (h2 + 1) * 1
        print(f"\n{'='*60}")
        print(f"  Архитектура TinyFloodMLP")
        print(f"{'='*60}")
        print(f"  Input({in_features}) → Dense({h1}) + ReLU")
        print(f"    → параметров: ({in_features}+1)×{h1} = {p1}")
        print(f"  Dense({h1}) → Dense({h2}) + ReLU")
        print(f"    → параметров: ({h1}+1)×{h2} = {p2}")
        print(f"  Dense({h2}) → Dense(1) + Sigmoid")
        print(f"    → параметров: ({h2}+1)×1 = {p3}")
        print(f"  {'─'*40}")
        print(f"  ИТОГО параметров: {p1 + p2 + p3}")
        print(f"  Лимит: 1000  →  {'✓ OK' if p1+p2+p3 <= 1000 else '✗ ПРЕВЫШЕН!'}")
        print(f"{'='*60}\n")

    def forward(self, x):
        return self.net(x).squeeze(-1)


# ──────────────────────────────────────────────────────────────────────────────
# 3. Обучение с Early Stopping
# ──────────────────────────────────────────────────────────────────────────────
def train_model(model, X_train, y_train, X_test, y_test):
    """
    Обучить модель нейросети с использованием механизма ранней остановки (Early Stopping),
    чтобы избежать переобучения, если ошибка на валидации (val-loss) перестаёт падать.
    
    Аргументы:
        model: Экземпляр нейросети (TinyFloodMLP).
        X_train, y_train: Обучающая выборка.
        X_test, y_test: Валидационная выборка.
        
    Возвращает:
        model: Обученная модель с восстановленными лучшими весами.
    """
    # Подготовить DataLoader
    train_ds = TensorDataset(
        torch.tensor(X_train, dtype=torch.float32),
        torch.tensor(y_train, dtype=torch.float32),
    )
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)

    X_val_t = torch.tensor(X_test, dtype=torch.float32).to(DEVICE)
    y_val_t = torch.tensor(y_test, dtype=torch.float32).to(DEVICE)

    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    best_val_loss = float("inf")
    patience_counter = 0
    best_state = None

    print(f"Обучение на {DEVICE}  |  до {MAX_EPOCHS} эпох  |  patience={PATIENCE}")
    print("-" * 60)

    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        running_loss = 0.0
        for xb, yb in train_loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            preds = model(xb)
            loss = criterion(preds, yb)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * xb.size(0)

        train_loss = running_loss / len(train_ds)

        # Валидация
        model.eval()
        with torch.no_grad():
            val_preds = model(X_val_t)
            val_loss = criterion(val_preds, y_val_t).item()

        # Логирование каждые 10 эпох
        if epoch % 10 == 0 or epoch == 1:
            print(f"  Epoch {epoch:>4d}/{MAX_EPOCHS}  "
                  f"train_loss={train_loss:.6f}  val_loss={val_loss:.6f}")

        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"\n  ⛔ Ранняя остановка на эпохе {epoch} "
                      f"(patience={PATIENCE}, best_val_loss={best_val_loss:.6f})")
                break

    # Восстановить лучшие веса
    if best_state is not None:
        model.load_state_dict(best_state)

    return model


# ──────────────────────────────────────────────────────────────────────────────
# 4. Оценка модели
# ──────────────────────────────────────────────────────────────────────────────
def evaluate(model, X_test, y_test):
    """Посчитать R², MAE, RMSE на тестовой выборке."""
    model.eval()
    X_t = torch.tensor(X_test, dtype=torch.float32).to(DEVICE)
    with torch.no_grad():
        preds = model(X_t).cpu().numpy()

    r2   = r2_score(y_test, preds)
    mae  = mean_absolute_error(y_test, preds)
    rmse = math.sqrt(mean_squared_error(y_test, preds))

    print(f"\n{'='*60}")
    print(f"  Результаты на тестовой выборке")
    print(f"{'='*60}")
    print(f"  R² Score : {r2:.6f}")
    print(f"  MAE      : {mae:.6f}")
    print(f"  RMSE     : {rmse:.6f}")
    print(f"{'='*60}")

    return r2, mae, rmse


# ──────────────────────────────────────────────────────────────────────────────
# 5. Сводка параметров модели
# ──────────────────────────────────────────────────────────────────────────────
def print_model_summary(model):
    """Напечатать сводку по слоям и параметрам."""
    print(f"\n{'='*60}")
    print(f"  Model Summary")
    print(f"{'='*60}")
    total = 0
    for name, param in model.named_parameters():
        n = param.numel()
        total += n
        trainable = "✓" if param.requires_grad else "✗"
        print(f"  {name:<25s}  shape={str(list(param.shape)):<14s}  "
              f"params={n:>5d}  trainable={trainable}")
    print(f"  {'─'*50}")
    print(f"  Всего параметров: {total}")
    print(f"  Лимит: 1000 → {'✓ OK' if total <= 1000 else '✗ ПРЕВЫШЕН!'}")
    print(f"{'='*60}\n")
    return total


# ──────────────────────────────────────────────────────────────────────────────
# 6. Экспорт в ONNX
# ──────────────────────────────────────────────────────────────────────────────
def export_onnx(model, in_features: int):
    """Экспорт модели в ONNX-формат для деплоя на edge-устройства."""
    onnx_path = SCRIPT_DIR / "tiny_flood_model.onnx"
    model.eval()
    dummy = torch.randn(1, in_features, device=DEVICE)
    try:
        torch.onnx.export(
            model, dummy, str(onnx_path),
            input_names=["features"],
            output_names=["prediction"],
            dynamic_axes={"features": {0: "batch"}, "prediction": {0: "batch"}},
            opset_version=12,
            export_params=True,
        )
        size_kb = onnx_path.stat().st_size / 1024
        print(f"  ✓ ONNX-модель сохранена: {onnx_path} ({size_kb:.1f} KB)")
    except Exception as e:
        print(f"  ⚠ ONNX экспорт недоступен: {e}")
        print("    → Установите: pip install onnxscript")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  TinyML Flood Prediction Pipeline")
    print("  Цель: MLP ≤ 1000 параметров для edge-устройств")
    print("=" * 60)

    # 1. Данные
    csv_path = find_csv(DATA_DIR)
    X_train, X_test, y_train, y_test, n_features = load_and_preprocess(csv_path)

    # 2. Модель
    model = TinyFloodMLP(in_features=n_features).to(DEVICE)
    total_params = print_model_summary(model)

    if total_params > 1000:
        print("⚠ ВНИМАНИЕ: число параметров превышает 1000!")

    # 3. Обучение
    model = train_model(model, X_train, y_train, X_test, y_test)

    # 4. Оценка
    evaluate(model, X_test, y_test)

    # 5. Финальная сводка
    print_model_summary(model)

    # 6. Экспорт
    export_onnx(model, n_features)

    # 7. Сохранить PyTorch-чекпоинт
    ckpt_path = SCRIPT_DIR / "tiny_flood_model.pt"
    torch.save(model.state_dict(), str(ckpt_path))
    print(f"  ✓ PyTorch checkpoint: {ckpt_path}")

    print("\n🎉 Готово!")


if __name__ == "__main__":
    main()
