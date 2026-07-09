from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "ml" / "model"
MODEL_PATH = MODEL_DIR / "health_status_model.joblib"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
LABEL_MAPPING_PATH = MODEL_DIR / "label_mapping.json"


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    if height_cm <= 0:
        return 0.0
    height_m = height_cm / 100.0
    return round(weight_kg / (height_m * height_m), 1)


def normalize_gender(value: Any) -> int:
    if isinstance(value, (int, float)):
        return 1 if int(value) == 1 else 0
    text = str(value or "").strip().lower()
    if text in {"1", "l", "male", "m", "pria", "laki-laki", "laki laki", "laki"}:
        return 1
    return 0


def normalize_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if not text:
        return 0.0
    return float(text)


def load_metadata() -> dict[str, Any]:
    if METADATA_PATH.exists():
        return json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return {}


def load_label_mapping() -> dict[str, str]:
    if LABEL_MAPPING_PATH.exists():
        return json.loads(LABEL_MAPPING_PATH.read_text(encoding="utf-8"))
    return {"0": "Sehat", "1": "Perlu Perhatian", "2": "Risiko Tinggi"}


def build_input_from_args(args: argparse.Namespace) -> dict[str, float]:
    if args.input_json:
        raw = json.loads(args.input_json)
    elif args.input_file:
        raw = json.loads(Path(args.input_file).read_text(encoding="utf-8"))
    else:
        raw = {
            "age": args.age,
            "gender": args.gender,
            "height_cm": args.height_cm,
            "weight_kg": args.weight_kg,
            "bmi": args.bmi,
            "heart_rate": args.heart_rate,
            "systolic_bp": args.systolic_bp,
            "diastolic_bp": args.diastolic_bp,
            "steps": args.steps,
            "recent_weight_delta_kg": args.recent_weight_delta_kg,
            "recent_bmi_delta": args.recent_bmi_delta,
            "recent_heart_rate_delta": args.recent_heart_rate_delta,
            "recent_systolic_delta": args.recent_systolic_delta,
            "recent_diastolic_delta": args.recent_diastolic_delta,
            "recent_steps_delta": args.recent_steps_delta,
            "recent_meal_calorie_delta": args.recent_meal_calorie_delta,
            "recent_hydration_delta": args.recent_hydration_delta,
            "recent_sleep_hours_delta": args.recent_sleep_hours_delta,
            "recent_activity_calorie_delta": args.recent_activity_calorie_delta,
        }

    height_cm = normalize_float(raw.get("height_cm"))
    weight_kg = normalize_float(raw.get("weight_kg"))
    bmi = normalize_float(raw.get("bmi")) or calculate_bmi(height_cm, weight_kg)

    return {
        "age": int(normalize_float(raw.get("age"))),
        "gender": normalize_gender(raw.get("gender")),
        "height_cm": round(height_cm, 1),
        "weight_kg": round(weight_kg, 1),
        "bmi": round(bmi, 1),
        "heart_rate": round(normalize_float(raw.get("heart_rate")), 1),
        "systolic_bp": round(normalize_float(raw.get("systolic_bp")), 1),
        "diastolic_bp": round(normalize_float(raw.get("diastolic_bp")), 1),
        "steps": round(normalize_float(raw.get("steps")), 1),
        "recent_weight_delta_kg": round(normalize_float(raw.get("recent_weight_delta_kg")), 1),
        "recent_bmi_delta": round(normalize_float(raw.get("recent_bmi_delta")), 1),
        "recent_heart_rate_delta": round(normalize_float(raw.get("recent_heart_rate_delta")), 1),
        "recent_systolic_delta": round(normalize_float(raw.get("recent_systolic_delta")), 1),
        "recent_diastolic_delta": round(normalize_float(raw.get("recent_diastolic_delta")), 1),
        "recent_steps_delta": round(normalize_float(raw.get("recent_steps_delta")), 1),
        "recent_meal_calorie_delta": round(normalize_float(raw.get("recent_meal_calorie_delta")), 1),
        "recent_hydration_delta": round(normalize_float(raw.get("recent_hydration_delta")), 1),
        "recent_sleep_hours_delta": round(normalize_float(raw.get("recent_sleep_hours_delta")), 1),
        "recent_activity_calorie_delta": round(normalize_float(raw.get("recent_activity_calorie_delta")), 1),
    }


def ensure_model_exists() -> None:
    if not MODEL_PATH.exists():
        raise SystemExit("Model belum ditemukan. Jalankan python ml/train_model.py terlebih dahulu.")


def predict_health_status(features: dict[str, float]) -> dict[str, Any]:
    payload = joblib.load(MODEL_PATH)
    model = payload["model"]
    feature_order = payload.get("feature_order", [])
    label_mapping = load_label_mapping()
    metadata = load_metadata()

    input_vector = np.array([[features[name] for name in feature_order]], dtype=float)
    predicted_code = int(model.predict(input_vector)[0])
    probabilities = model.predict_proba(input_vector)[0]
    confidence = float(np.max(probabilities))

    return {
        "health_status_code": predicted_code,
        "health_status_label": label_mapping.get(str(predicted_code), f"Class {predicted_code}"),
        "confidence": round(confidence, 4),
        "probabilities": {label_mapping.get(str(index), str(index)): round(float(value), 4) for index, value in enumerate(probabilities)},
        "recommendation": {
            0: "Pertahankan pola hidup sehat, aktivitas rutin, dan pemeriksaan berkala.",
            1: "Perbaiki pola makan, tidur, dan aktivitas, lalu pantau ulang hasilnya.",
            2: "Segera konsultasikan ke tenaga medis dan lakukan pemantauan lebih sering.",
        }[predicted_code],
        "model_name": metadata.get("model_name", "KNN Health Classifier"),
        "model_algorithm": metadata.get("algorithm", "KNeighborsClassifier"),
        "accuracy": float(metadata.get("accuracy", 0.0)),
        "input": features,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Predict health status using the trained KNN model.")
    parser.add_argument("--input-json", help="Inline JSON payload with the feature values.")
    parser.add_argument("--input-file", help="Path to a JSON file containing the feature values.")
    parser.add_argument("--age", type=float, help="Age in years.")
    parser.add_argument("--gender", help="Gender code or label. 0 = female, 1 = male.")
    parser.add_argument("--height-cm", dest="height_cm", type=float, help="Height in centimeters.")
    parser.add_argument("--weight-kg", dest="weight_kg", type=float, help="Weight in kilograms.")
    parser.add_argument("--bmi", type=float, help="Body mass index.")
    parser.add_argument("--heart-rate", dest="heart_rate", type=float, help="Heart rate.")
    parser.add_argument("--systolic-bp", dest="systolic_bp", type=float, help="Systolic blood pressure.")
    parser.add_argument("--diastolic-bp", dest="diastolic_bp", type=float, help="Diastolic blood pressure.")
    parser.add_argument("--steps", type=float, help="Daily steps.")
    parser.add_argument("--recent-weight-delta-kg", dest="recent_weight_delta_kg", type=float, help="Weight delta from recent history.")
    parser.add_argument("--recent-bmi-delta", dest="recent_bmi_delta", type=float, help="BMI delta from recent history.")
    parser.add_argument("--recent-heart-rate-delta", dest="recent_heart_rate_delta", type=float, help="Heart rate delta from recent history.")
    parser.add_argument("--recent-systolic-delta", dest="recent_systolic_delta", type=float, help="Systolic delta from recent history.")
    parser.add_argument("--recent-diastolic-delta", dest="recent_diastolic_delta", type=float, help="Diastolic delta from recent history.")
    parser.add_argument("--recent-steps-delta", dest="recent_steps_delta", type=float, help="Steps delta from recent history.")
    parser.add_argument("--recent-meal-calorie-delta", dest="recent_meal_calorie_delta", type=float, help="Meal calorie delta from recent history.")
    parser.add_argument("--recent-hydration-delta", dest="recent_hydration_delta", type=float, help="Hydration delta from recent history.")
    parser.add_argument("--recent-sleep-hours-delta", dest="recent_sleep_hours_delta", type=float, help="Sleep hours delta from recent history.")
    parser.add_argument("--recent-activity-calorie-delta", dest="recent_activity_calorie_delta", type=float, help="Activity calorie delta from recent history.")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_model_exists()
    features = build_input_from_args(args)
    result = predict_health_status(features)

    if args.format == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    print("Prediksi Status Kesehatan")
    print("=" * 27)
    print(f"Class code      : {result['health_status_code']}")
    print(f"Label           : {result['health_status_label']}")
    print(f"Confidence      : {result['confidence']:.4f}")
    print(f"Recommendation  : {result['recommendation']}")
    print(f"Model           : {result['model_name']}")
    print(f"Algorithm       : {result['model_algorithm']}")
    print(f"Accuracy        : {float(result['accuracy']) * 100:.2f}%")
    print("Probabilities    :")
    for label, probability in result["probabilities"].items():
        print(f"  - {label}: {probability:.4f}")


if __name__ == "__main__":
    main()
