from __future__ import annotations

import csv
import json
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn import tree as sklearn_tree
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier


ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = ROOT / "ml" / "dataset"
MODEL_DIR = ROOT / "ml" / "model"
REPORT_DIR = ROOT / "ml" / "reports"
SRC_GENERATED_DIR = ROOT / "src" / "generated"
DATASET_PATH = DATASET_DIR / "health_classification_dataset.csv"
MODEL_PATH = MODEL_DIR / "health_status_model.joblib"
KNN_EXPORT_PATH = MODEL_DIR / "health_status_knn.json"
LABEL_MAPPING_PATH = MODEL_DIR / "label_mapping.json"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
TREE_EXPORT_PATH = MODEL_DIR / "health_status_tree.json"
TREE_EXPORT_SRC_PATH = SRC_GENERATED_DIR / "health_status_tree.json"
KNN_EXPORT_SRC_PATH = SRC_GENERATED_DIR / "health_status_knn.json"
LABEL_MAPPING_SRC_PATH = SRC_GENERATED_DIR / "label_mapping.json"
METADATA_SRC_PATH = SRC_GENERATED_DIR / "health_status_model_metadata.json"
REPORT_PATH = REPORT_DIR / "evaluation_report.txt"
CONFUSION_MATRIX_PATH = REPORT_DIR / "confusion_matrix.csv"

FEATURES = [
    "age",
    "gender",
    "height_cm",
    "weight_kg",
    "bmi",
    "heart_rate",
    "systolic_bp",
    "diastolic_bp",
    "steps",
]

CLASS_LABELS = {
    0: "Sehat",
    1: "Perlu Perhatian",
    2: "Risiko Tinggi",
}

TRAINING_ROWS = 900


def ensure_dirs() -> None:
    for directory in [DATASET_DIR, MODEL_DIR, REPORT_DIR, SRC_GENERATED_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    height_m = height_cm / 100.0
    if height_m <= 0:
        return 0.0
    return round(weight_kg / (height_m * height_m), 1)


def encode_gender(value: int) -> int:
    return 1 if int(value) == 1 else 0


def derive_label(row: dict[str, float | int]) -> int:
    bmi = float(row["bmi"])
    heart_rate = float(row["heart_rate"])
    systolic = float(row["systolic_bp"])
    diastolic = float(row["diastolic_bp"])
    steps = float(row["steps"])
    age = float(row["age"])

    healthy_windows = [
        18.5 <= bmi <= 24.9,
        60 <= heart_rate <= 95,
        100 <= systolic <= 124,
        65 <= diastolic <= 82,
        steps >= 5500,
        age <= 60,
    ]

    risk_windows = [
        bmi < 17.0 or bmi >= 30.0,
        heart_rate < 55 or heart_rate >= 105,
        systolic < 95 or systolic >= 140,
        diastolic < 60 or diastolic >= 90,
        steps < 3500,
        age >= 70,
    ]

    if sum(risk_windows) >= 2:
        return 2

    if sum(healthy_windows) >= 5:
        return 0

    return 1


def sample_height(rng: random.Random, gender: int, status: int) -> float:
    if status == 0:
        low, high = ((158, 182) if gender == 1 else (149, 172))
    elif status == 1:
        low, high = ((155, 186) if gender == 1 else (146, 176))
    else:
        low, high = ((152, 184) if gender == 1 else (144, 174))
    return round(rng.uniform(low, high), 1)


def sample_bmi(rng: random.Random, status: int) -> float:
    if status == 0:
        return round(rng.uniform(18.6, 24.7), 1)
    if status == 1:
        bands = [
            (17.0, 18.4),
            (25.0, 29.4),
            (24.4, 25.6),
        ]
        band = bands[rng.randrange(len(bands))]
        return round(rng.uniform(*band), 1)
    bands = [
        (15.0, 16.9),
        (30.0, 37.8),
    ]
    band = bands[rng.randrange(len(bands))]
    return round(rng.uniform(*band), 1)


def sample_heart_rate(rng: random.Random, status: int) -> int:
    if status == 0:
        return rng.randint(62, 92)
    if status == 1:
        ranges = [(55, 61), (93, 104)]
        return rng.randint(*ranges[rng.randrange(len(ranges))])
    ranges = [(45, 54), (105, 132)]
    return rng.randint(*ranges[rng.randrange(len(ranges))])


def sample_blood_pressure(rng: random.Random, status: int) -> tuple[int, int]:
    if status == 0:
        return rng.randint(104, 124), rng.randint(66, 82)
    if status == 1:
        patterns = [
            (rng.randint(125, 139), rng.randint(80, 89)),
            (rng.randint(96, 104), rng.randint(60, 64)),
            (rng.randint(118, 128), rng.randint(78, 86)),
        ]
        return patterns[rng.randrange(len(patterns))]
    patterns = [
        (rng.randint(80, 94), rng.randint(50, 59)),
        (rng.randint(140, 175), rng.randint(90, 110)),
    ]
    return patterns[rng.randrange(len(patterns))]


def sample_steps(rng: random.Random, status: int) -> int:
    if status == 0:
        return rng.randint(6200, 13200)
    if status == 1:
        return rng.randint(3200, 8300)
    return rng.randint(0, 4300)


def sample_age(rng: random.Random, status: int) -> int:
    if status == 0:
        return rng.randint(18, 59)
    if status == 1:
        return rng.randint(20, 67)
    return rng.randint(28, 78)


def generate_row(rng: random.Random, status: int) -> dict[str, float | int]:
    gender = encode_gender(rng.randint(0, 1))
    age = sample_age(rng, status)
    height_cm = sample_height(rng, gender, status)
    bmi = sample_bmi(rng, status)
    weight_kg = round(clamp(bmi * ((height_cm / 100.0) ** 2), 38.0, 145.0), 1)
    bmi = calculate_bmi(height_cm, weight_kg)
    heart_rate = sample_heart_rate(rng, status)
    systolic_bp, diastolic_bp = sample_blood_pressure(rng, status)
    steps = sample_steps(rng, status)

    row = {
        "age": age,
        "gender": gender,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "bmi": bmi,
        "heart_rate": heart_rate,
        "systolic_bp": systolic_bp,
        "diastolic_bp": diastolic_bp,
        "steps": steps,
    }

    row["health_status"] = derive_label(row)
    return row


def generate_dataset(total_rows: int = TRAINING_ROWS, seed: int = 42) -> list[dict[str, float | int]]:
    rng = random.Random(seed)
    rows: list[dict[str, float | int]] = []
    per_class = total_rows // 3
    remainder = total_rows - (per_class * 3)

    class_counts = {0: per_class, 1: per_class, 2: per_class}
    for idx in range(remainder):
        class_counts[idx] += 1

    for status, count in class_counts.items():
        for _ in range(count):
            rows.append(generate_row(rng, status))

    rng.shuffle(rows)
    return rows


def write_dataset(rows: list[dict[str, float | int]]) -> None:
    with DATASET_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FEATURES + ["health_status"])
        writer.writeheader()
        writer.writerows(rows)


def load_dataset() -> tuple[np.ndarray, np.ndarray]:
    features: list[list[float]] = []
    targets: list[int] = []
    with DATASET_PATH.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            features.append([float(row[field]) for field in FEATURES])
            targets.append(int(float(row["health_status"])))
    return np.array(features, dtype=float), np.array(targets, dtype=int)


def class_distribution(y: np.ndarray) -> dict[int, int]:
    values, counts = np.unique(y, return_counts=True)
    return {int(value): int(count) for value, count in zip(values, counts, strict=True)}


def tree_to_json(model: DecisionTreeClassifier) -> dict[str, Any]:
    tree = model.tree_

    def recurse(node_id: int) -> dict[str, Any]:
        feature_index = tree.feature[node_id]
        if feature_index == sklearn_tree._tree.TREE_UNDEFINED:
            value = tree.value[node_id][0]
            total = float(np.sum(value)) or 1.0
            prediction = int(np.argmax(value))
            probabilities = [round(float(v) / total, 6) for v in value]
            return {
                "type": "leaf",
                "samples": int(tree.n_node_samples[node_id]),
                "value": [int(v) for v in value.tolist()],
                "prediction": prediction,
                "label": CLASS_LABELS[prediction],
                "probabilities": probabilities,
            }

        feature_name = FEATURES[int(feature_index)]
        return {
            "type": "node",
            "feature": feature_name,
            "threshold": round(float(tree.threshold[node_id]), 6),
            "samples": int(tree.n_node_samples[node_id]),
            "left": recurse(int(tree.children_left[node_id])),
            "right": recurse(int(tree.children_right[node_id])),
        }

    return {
        "model_name": "Decision Tree Health Classifier",
        "algorithm": "DecisionTreeClassifier",
        "features": FEATURES,
        "target": "health_status",
        "class_labels": {str(key): value for key, value in CLASS_LABELS.items()},
        "tree": recurse(0),
    }


def knn_to_json(
    model: Pipeline,
    x_train: np.ndarray,
    y_train: np.ndarray,
    accuracy: float,
    dataset_rows: int,
    dataset_distribution: dict[int, int],
) -> dict[str, Any]:
    scaler: StandardScaler = model.named_steps["scaler"]
    knn: KNeighborsClassifier = model.named_steps["knn"]
    scaled_samples = scaler.transform(x_train)

    return {
        "model_name": "KNN Health Classifier",
        "algorithm": "KNeighborsClassifier",
        "features": FEATURES,
        "target": "health_status",
        "k": int(knn.n_neighbors),
        "weights": str(knn.weights),
        "metric": str(knn.metric),
        "training_date": datetime.now(timezone.utc).isoformat(),
        "accuracy": round(float(accuracy), 6),
        "dataset_rows": dataset_rows,
        "class_distribution": {str(key): value for key, value in dataset_distribution.items()},
        "class_labels": {str(key): value for key, value in CLASS_LABELS.items()},
        "scaler": {
            "mean": [round(float(value), 6) for value in scaler.mean_.tolist()],
            "scale": [round(float(value), 6) for value in scaler.scale_.tolist()],
        },
        "samples": [
            {
                "values": [round(float(value), 6) for value in sample.tolist()],
                "label": int(label),
            }
            for sample, label in zip(scaled_samples, y_train.tolist(), strict=True)
        ],
    }


def build_confusion_matrix_csv(matrix: np.ndarray) -> None:
    labels = [CLASS_LABELS[index] for index in sorted(CLASS_LABELS)]
    with CONFUSION_MATRIX_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["actual/predicted", *labels])
        for label, row in zip(labels, matrix.tolist(), strict=True):
            writer.writerow([label, *row])


def build_evaluation_report(
    dataset_rows: int,
    dataset_distribution: dict[int, int],
    decision_tree_params: dict[str, Any],
    tree_accuracy: float,
    tree_precision: float,
    tree_recall: float,
    tree_f1: float,
    tree_report: str,
    tree_matrix: np.ndarray,
    knn_accuracy: float,
    knn_precision: float,
    knn_recall: float,
    knn_f1: float,
    knn_report: str,
    tree_cv_mean: float,
    tree_cv_std: float,
    knn_cv_mean: float,
    knn_cv_std: float,
) -> str:
    labels = [CLASS_LABELS[index] for index in sorted(CLASS_LABELS)]
    matrix_lines = ["Confusion Matrix (KNN):"]
    matrix_lines.append("actual/predicted," + ",".join(labels))
    for label, row in zip(labels, tree_matrix.tolist(), strict=True):
        matrix_lines.append(label + "," + ",".join(str(int(value)) for value in row))

    return "\n".join(
        [
            "Health Classification Model Evaluation",
            "=" * 42,
            f"Training date      : {datetime.now(timezone.utc).isoformat()}",
            f"Dataset rows       : {dataset_rows}",
            f"Class distribution : Sehat={dataset_distribution.get(0, 0)}, Perlu Perhatian={dataset_distribution.get(1, 0)}, Risiko Tinggi={dataset_distribution.get(2, 0)}",
            f"Primary algorithm  : KNeighborsClassifier",
            f"Best KNN params    : {json.dumps(decision_tree_params, ensure_ascii=False)}",
            f"Comparison model   : DecisionTreeClassifier",
            "",
            "KNN Metrics",
            "-" * 11,
            f"Accuracy  : {tree_accuracy:.4f}",
            f"Precision : {tree_precision:.4f}",
            f"Recall    : {tree_recall:.4f}",
            f"F1-score  : {tree_f1:.4f}",
            f"CV mean   : {tree_cv_mean:.4f} (+/- {tree_cv_std:.4f})",
            "",
            "KNN Classification Report",
            "-" * 26,
            tree_report,
            "",
            "Decision Tree Comparison Metrics",
            "-" * 32,
            f"Accuracy  : {knn_accuracy:.4f}",
            f"Precision : {knn_precision:.4f}",
            f"Recall    : {knn_recall:.4f}",
            f"F1-score  : {knn_f1:.4f}",
            f"CV mean   : {knn_cv_mean:.4f} (+/- {knn_cv_std:.4f})",
            "",
            "Decision Tree Classification Report",
            "-" * 36,
            knn_report,
            "",
            *matrix_lines,
            "",
            "Notes",
            "-" * 5,
            "KNN dipilih sebagai model utama untuk dashboard dan prediksi frontend.",
        ]
    )


def copy_text_file(source: Path, target: Path) -> None:
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")


def main() -> None:
    ensure_dirs()

    rows = generate_dataset(total_rows=TRAINING_ROWS, seed=42)
    write_dataset(rows)

    X, y = load_dataset()
    dataset_distribution = class_distribution(y)
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    knn = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("knn", KNeighborsClassifier(n_neighbors=7, weights="distance")),
        ]
    )
    knn.fit(X_train, y_train)
    knn_predictions = knn.predict(X_test)
    knn_probability = knn.predict_proba(X_test)
    knn_cv_scores = cross_val_score(
        Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                ("knn", KNeighborsClassifier(n_neighbors=7, weights="distance")),
            ]
        ),
        X,
        y,
        cv=cv,
        scoring="accuracy",
    )

    tree_search = GridSearchCV(
        estimator=DecisionTreeClassifier(random_state=42, class_weight="balanced"),
        param_grid={
            "max_depth": [5, 6, 7, 8],
            "min_samples_leaf": [2, 4, 6],
            "min_samples_split": [4, 8, 12],
            "ccp_alpha": [0.0, 0.0005, 0.001],
        },
        cv=cv,
        scoring="accuracy",
        n_jobs=-1,
    )
    tree_search.fit(X_train, y_train)
    decision_tree = tree_search.best_estimator_
    tree_predictions = decision_tree.predict(X_test)
    tree_probability = decision_tree.predict_proba(X_test)
    tree_cv_scores = cross_val_score(
        decision_tree,
        X,
        y,
        cv=cv,
        scoring="accuracy",
    )

    knn_accuracy = accuracy_score(y_test, knn_predictions)
    tree_accuracy = accuracy_score(y_test, tree_predictions)

    knn_precision, knn_recall, knn_f1, _ = precision_recall_fscore_support(
        y_test, knn_predictions, average="macro", zero_division=0
    )
    tree_precision, tree_recall, tree_f1, _ = precision_recall_fscore_support(
        y_test, tree_predictions, average="macro", zero_division=0
    )

    knn_report = classification_report(
        y_test,
        knn_predictions,
        labels=sorted(CLASS_LABELS),
        target_names=[CLASS_LABELS[index] for index in sorted(CLASS_LABELS)],
        digits=4,
        zero_division=0,
    )
    tree_report = classification_report(
        y_test,
        tree_predictions,
        labels=sorted(CLASS_LABELS),
        target_names=[CLASS_LABELS[index] for index in sorted(CLASS_LABELS)],
        digits=4,
        zero_division=0,
    )

    knn_matrix = confusion_matrix(y_test, knn_predictions, labels=sorted(CLASS_LABELS))
    tree_matrix = confusion_matrix(y_test, tree_predictions, labels=sorted(CLASS_LABELS))
    build_confusion_matrix_csv(knn_matrix)

    model_payload = {
        "model": knn,
        "feature_order": FEATURES,
        "class_labels": CLASS_LABELS,
        "knn_probability_sample": knn_probability[:5].tolist(),
    }
    joblib.dump(model_payload, MODEL_PATH)

    label_mapping = {str(key): value for key, value in CLASS_LABELS.items()}
    LABEL_MAPPING_PATH.write_text(json.dumps(label_mapping, indent=2, ensure_ascii=False), encoding="utf-8")

    knn_export = knn_to_json(
        model=knn,
        x_train=X_train,
        y_train=y_train,
        accuracy=knn_accuracy,
        dataset_rows=len(rows),
        dataset_distribution=dataset_distribution,
    )
    KNN_EXPORT_PATH.write_text(json.dumps(knn_export, indent=2, ensure_ascii=False), encoding="utf-8")

    metadata = {
        "algorithm": "KNeighborsClassifier",
        "features": FEATURES,
        "target": "health_status",
        "training_date": datetime.now(timezone.utc).isoformat(),
        "accuracy": round(float(knn_accuracy), 6),
        "dataset_rows": len(rows),
        "class_distribution": {str(key): value for key, value in dataset_distribution.items()},
        "best_parameters": {
            "n_neighbors": 7,
            "weights": "distance",
            "metric": "minkowski",
            "p": 2,
        },
        "comparison_models": {
            "DecisionTreeClassifier": {
                "accuracy": round(float(tree_accuracy), 6),
                "precision": round(float(tree_precision), 6),
                "recall": round(float(tree_recall), 6),
                "f1_score": round(float(tree_f1), 6),
                "cv_mean_accuracy": round(float(tree_cv_scores.mean()), 6),
                "cv_std_accuracy": round(float(tree_cv_scores.std()), 6),
            }
        },
        "cross_validation": {
            "KNeighborsClassifier": {
                "mean_accuracy": round(float(knn_cv_scores.mean()), 6),
                "std_accuracy": round(float(knn_cv_scores.std()), 6),
            },
            "DecisionTreeClassifier": {
                "mean_accuracy": round(float(tree_cv_scores.mean()), 6),
                "std_accuracy": round(float(tree_cv_scores.std()), 6),
            },
        },
        "label_mapping": label_mapping,
        "model_name": "KNN Health Classifier",
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

    tree_export = tree_to_json(decision_tree)
    TREE_EXPORT_PATH.write_text(json.dumps(tree_export, indent=2, ensure_ascii=False), encoding="utf-8")

    copy_text_file(TREE_EXPORT_PATH, TREE_EXPORT_SRC_PATH)
    copy_text_file(LABEL_MAPPING_PATH, LABEL_MAPPING_SRC_PATH)
    copy_text_file(KNN_EXPORT_PATH, KNN_EXPORT_SRC_PATH)
    METADATA_SRC_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

    report = build_evaluation_report(
        dataset_rows=len(rows),
        dataset_distribution=dataset_distribution,
        decision_tree_params=metadata["best_parameters"],
        tree_accuracy=float(knn_accuracy),
        tree_precision=float(knn_precision),
        tree_recall=float(knn_recall),
        tree_f1=float(knn_f1),
        tree_report=knn_report,
        tree_matrix=knn_matrix,
        knn_accuracy=float(tree_accuracy),
        knn_precision=float(tree_precision),
        knn_recall=float(tree_recall),
        knn_f1=float(tree_f1),
        knn_report=tree_report,
        tree_cv_mean=float(knn_cv_scores.mean()),
        tree_cv_std=float(knn_cv_scores.std()),
        knn_cv_mean=float(tree_cv_scores.mean()),
        knn_cv_std=float(tree_cv_scores.std()),
    )
    REPORT_PATH.write_text(report, encoding="utf-8")

    print("Training complete")
    print(f"Dataset rows: {len(rows)}")
    print(f"KNN accuracy: {knn_accuracy:.4f}")
    print(f"Decision Tree accuracy: {tree_accuracy:.4f}")
    print(f"Model saved to: {MODEL_PATH}")
    print(f"Tree export saved to: {TREE_EXPORT_PATH}")
    print(f"KNN export saved to: {KNN_EXPORT_PATH}")
    print(f"Report saved to: {REPORT_PATH}")


if __name__ == "__main__":
    main()
