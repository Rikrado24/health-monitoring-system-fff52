import { get, onValue, query, ref, runTransaction, set } from "firebase/database";
import type { HealthLearningSampleDoc } from "../types/storage";
import { rtdb } from "./firebase";

export type HealthLearningVector = {
  age: number;
  gender: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  steps: number;
};

export type HealthLearningSample = {
  values: number[];
  label: number;
  support: number;
  source: HealthLearningSampleDoc["source"];
  confidence: number;
  createdAt: string;
  note?: string;
};

const GLOBAL_SAMPLE_PATH = "ml_learning_samples/global";
const USER_SAMPLE_PATH = (uid: string) => `users/${uid}/ml_learning_samples`;

let learningSampleCache: HealthLearningSample[] = [];

const nowIso = () => new Date().toISOString();

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundVector = (values: number[]) => values.map((value) => Number(value.toFixed(3)));

const sampleKeyFromValues = (values: number[], label: number) =>
  `label_${label}__${roundVector(values)
    .map((value) => String(value).replace(/\./g, "_"))
    .join("__")}`;

const toSample = (value: HealthLearningSampleDoc): HealthLearningSample => ({
  values: roundVector([
    normalizeNumber(value.age),
    normalizeNumber(value.gender),
    normalizeNumber(value.height_cm),
    normalizeNumber(value.weight_kg),
    normalizeNumber(value.bmi),
    normalizeNumber(value.heart_rate),
    normalizeNumber(value.systolic_bp),
    normalizeNumber(value.diastolic_bp),
    normalizeNumber(value.steps),
  ]),
  label: Math.max(0, Math.round(normalizeNumber(value.label))),
  support: Math.max(1, Math.round(normalizeNumber(value.support) || 1)),
  source: value.source || "prediction",
  confidence: Math.max(0, Math.min(1, normalizeNumber(value.confidence))),
  createdAt: value.created_at || nowIso(),
  note: value.note?.trim() || undefined,
});

const mergeSamples = (samples: HealthLearningSample[]) => {
  const map = new Map<string, HealthLearningSample>();

  samples.forEach((sample) => {
    const key = sampleKeyFromValues(sample.values, sample.label);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...sample, support: Math.max(1, sample.support) });
      return;
    }

    map.set(key, {
      ...existing,
      support: existing.support + Math.max(1, sample.support),
      confidence: Math.max(existing.confidence, sample.confidence),
      createdAt: existing.createdAt > sample.createdAt ? existing.createdAt : sample.createdAt,
      note: existing.note || sample.note,
    });
  });

  return Array.from(map.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export function getHealthLearningSamples() {
  return learningSampleCache;
}

export function setHealthLearningSamples(samples: HealthLearningSample[]) {
  learningSampleCache = mergeSamples(samples);
}

export async function loadHealthLearningSamplesForUser(uid: string) {
  if (!uid) {
    learningSampleCache = [];
    return learningSampleCache;
  }

  const [globalSnapshot, userSnapshot] = await Promise.all([
    get(query(ref(rtdb, GLOBAL_SAMPLE_PATH))),
    get(query(ref(rtdb, USER_SAMPLE_PATH(uid)))),
  ]);

  const samples: HealthLearningSample[] = [];

  const appendSnapshot = (snapshot: Awaited<ReturnType<typeof get>>) => {
    if (!snapshot.exists()) return;
    const rows = snapshot.val() as Record<string, HealthLearningSampleDoc>;
    Object.values(rows).forEach((row) => samples.push(toSample(row)));
  };

  appendSnapshot(globalSnapshot);
  appendSnapshot(userSnapshot);
  learningSampleCache = mergeSamples(samples);
  return learningSampleCache;
}

export function subscribeHealthLearningSamplesForUser(
  uid: string,
  onChange?: (samples: HealthLearningSample[]) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) return () => {};

  const syncCache = async () => {
    try {
      const samples = await loadHealthLearningSamplesForUser(uid);
      onChange?.(samples);
    } catch (error) {
      onError?.(error);
    }
  };

  const globalRef = query(ref(rtdb, GLOBAL_SAMPLE_PATH));
  const userRef = query(ref(rtdb, USER_SAMPLE_PATH(uid)));
  const unsubscribeGlobal = onValue(globalRef, () => void syncCache(), onError);
  const unsubscribeUser = onValue(userRef, () => void syncCache(), onError);

  void syncCache();

  return () => {
    unsubscribeGlobal();
    unsubscribeUser();
  };
}

export async function recordHealthLearningSample(
  uid: string,
  sample: Omit<HealthLearningSampleDoc, "created_at" | "support" | "updated_at"> & {
    support?: number;
    created_at?: string;
    updated_at?: string;
  }
) {
  const createdAt = sample.created_at || nowIso();
  const support = Math.max(1, Math.round(sample.support ?? 1));
  const payload: HealthLearningSampleDoc = {
    age: normalizeNumber(sample.age),
    gender: normalizeNumber(sample.gender),
    height_cm: normalizeNumber(sample.height_cm),
    weight_kg: normalizeNumber(sample.weight_kg),
    bmi: normalizeNumber(sample.bmi),
    heart_rate: normalizeNumber(sample.heart_rate),
    systolic_bp: normalizeNumber(sample.systolic_bp),
    diastolic_bp: normalizeNumber(sample.diastolic_bp),
    steps: normalizeNumber(sample.steps),
    label: Math.max(0, Math.round(normalizeNumber(sample.label))),
    label_name: String(sample.label_name || "Unknown"),
    support,
    confidence: Math.max(0, Math.min(1, normalizeNumber(sample.confidence))),
    source: sample.source,
    created_at: createdAt,
    updated_at: sample.updated_at || createdAt,
    note: sample.note?.trim() || undefined,
    uid: sample.uid?.trim() || undefined,
  };

  const key = sampleKeyFromValues(
    [payload.age, payload.gender, payload.height_cm, payload.weight_kg, payload.bmi, payload.heart_rate, payload.systolic_bp, payload.diastolic_bp, payload.steps],
    payload.label
  );

  const globalRef = ref(rtdb, `${GLOBAL_SAMPLE_PATH}/${key}`);
  const userRef = ref(rtdb, `${USER_SAMPLE_PATH(uid)}/${key}`);

  await Promise.all([
    runTransaction(globalRef, (current) => {
      if (!current) return payload;
      const previous = current as HealthLearningSampleDoc;
      return {
        ...previous,
        ...payload,
        support: Math.max(1, Number(previous.support || 1)) + support,
        updated_at: nowIso(),
      };
    }),
    runTransaction(userRef, (current) => {
      if (!current) return payload;
      const previous = current as HealthLearningSampleDoc;
      return {
        ...previous,
        ...payload,
        support: Math.max(1, Number(previous.support || 1)) + support,
        updated_at: nowIso(),
      };
    }),
  ]);

  learningSampleCache = mergeSamples([toSample(payload), ...learningSampleCache]);
  return { ok: true as const, key, payload };
}
