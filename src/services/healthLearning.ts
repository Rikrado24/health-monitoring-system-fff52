import { get, onValue, query, ref, remove, runTransaction, update } from "firebase/database";
import type { HealthLearningSampleDoc } from "../types/storage";
import { rtdb } from "./firebase";
import { HEALTH_PREDICTION_FEATURE_KEYS, type HealthPredictionFeatures, normalizeHealthNumber } from "./healthFeatureEngineering";

export type HealthLearningVector = HealthPredictionFeatures;

export type HealthLearningApprovalStatus = "approved" | "pending" | "rejected";
export type HealthLearningScope = "global" | "personal";

export type HealthLearningSample = {
  key: string;
  scope: HealthLearningScope;
  approvalStatus: HealthLearningApprovalStatus;
  values: number[];
  label: number;
  labelName: string;
  support: number;
  source: HealthLearningSampleDoc["source"];
  confidence: number;
  createdAt: string;
  updatedAt: string;
  uid?: string;
  note?: string;
};

export type HealthLearningSampleEntry = HealthLearningSample & {
  path: string;
  approvalAt?: string;
  approvalBy?: string;
};

const GLOBAL_SAMPLE_PATH = "ml_learning_samples/global";
const USER_SAMPLE_PATH = (uid: string) => `users/${uid}/ml_learning_samples`;
const AUTO_APPROVAL_THRESHOLDS: Record<HealthLearningSampleDoc["source"], number> = {
  prediction: 0.78,
  chat: 0.82,
  manual: 0.6,
};
const SOURCE_WEIGHTS: Record<HealthLearningSampleDoc["source"], number> = {
  prediction: 1,
  chat: 0.9,
  manual: 1.08,
};
const SCOPE_WEIGHTS: Record<HealthLearningScope, number> = {
  global: 0.84,
  personal: 1.28,
};

let learningSampleCache: HealthLearningSampleEntry[] = [];
let learningSampleEntryCache: HealthLearningSampleEntry[] = [];

const nowIso = () => new Date().toISOString();

const normalizeNumber = (value: unknown) => {
  return normalizeHealthNumber(value);
};

const roundVector = (values: number[]) => values.map((value) => Number(value.toFixed(3)));

const sampleKeyFromValues = (values: number[], label: number) =>
  `label_${label}__${roundVector(values)
    .map((value) => String(value).replace(/\./g, "_"))
    .join("__")}`;

const resolveApprovalStatus = (value: HealthLearningSampleDoc): HealthLearningApprovalStatus => {
  const explicit = value.approval_status;
  if (explicit === "approved" || explicit === "pending" || explicit === "rejected") {
    return explicit;
  }

  const sourceThreshold = AUTO_APPROVAL_THRESHOLDS[value.source] ?? 0.8;
  return normalizeNumber(value.confidence) >= sourceThreshold ? "approved" : "pending";
};

const toSample = (value: HealthLearningSampleDoc, scope: HealthLearningScope, key: string, path: string): HealthLearningSampleEntry => ({
  key,
  path,
  scope,
  approvalStatus: resolveApprovalStatus(value),
  values: roundVector(
    HEALTH_PREDICTION_FEATURE_KEYS.map((featureKey) => normalizeNumber(value[featureKey as keyof HealthLearningSampleDoc]))
  ),
  label: Math.max(0, Math.round(normalizeNumber(value.label))),
  labelName: value.label_name?.trim() || "Unknown",
  support: Math.max(1, Math.round(normalizeNumber(value.support) || 1)),
  source: value.source || "prediction",
  confidence: Math.max(0, Math.min(1, normalizeNumber(value.confidence))),
  createdAt: value.created_at || nowIso(),
  updatedAt: value.updated_at || value.created_at || nowIso(),
  uid: value.uid?.trim() || undefined,
  approvalAt: value.approved_at || undefined,
  approvalBy: value.approved_by || undefined,
  note: value.note?.trim() || undefined,
});

const mergeSamples = (samples: HealthLearningSampleEntry[]) => {
  const map = new Map<string, HealthLearningSampleEntry>();

  samples.forEach((sample) => {
    const key = `${sample.scope}__${sample.key}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...sample, support: Math.max(1, sample.support) });
      return;
    }

    map.set(key, {
      ...existing,
      support: existing.support + Math.max(1, sample.support),
      confidence: Math.max(existing.confidence, sample.confidence),
      updatedAt: existing.updatedAt > sample.updatedAt ? existing.updatedAt : sample.updatedAt,
      createdAt: existing.createdAt > sample.createdAt ? existing.createdAt : sample.createdAt,
      approvalStatus: existing.approvalStatus === "approved" || sample.approvalStatus === "approved" ? "approved" : existing.approvalStatus,
      approvalAt: existing.approvalAt || sample.approvalAt,
      approvalBy: existing.approvalBy || sample.approvalBy,
      note: existing.note || sample.note,
    });
  });

  return Array.from(map.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

const isApproved = (sample: HealthLearningSampleEntry) => sample.approvalStatus === "approved";

const normalizePayload = (sample: Omit<HealthLearningSampleDoc, "created_at" | "support" | "updated_at"> & {
  support?: number;
  created_at?: string;
  updated_at?: string;
}) => {
  const createdAt = sample.created_at || nowIso();
  const support = Math.max(1, Math.round(sample.support ?? 1));
  const approvalStatus = sample.approval_status || (normalizeNumber(sample.confidence) >= (AUTO_APPROVAL_THRESHOLDS[sample.source] ?? 0.8) ? "approved" : "pending");
  const approvalAt = sample.approved_at || (approvalStatus === "approved" ? createdAt : undefined);
  const approvalBy = sample.approved_by || (approvalStatus === "approved" ? "system" : undefined);

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
    recent_weight_delta_kg: normalizeNumber(sample.recent_weight_delta_kg),
    recent_bmi_delta: normalizeNumber(sample.recent_bmi_delta),
    recent_heart_rate_delta: normalizeNumber(sample.recent_heart_rate_delta),
    recent_systolic_delta: normalizeNumber(sample.recent_systolic_delta),
    recent_diastolic_delta: normalizeNumber(sample.recent_diastolic_delta),
    recent_steps_delta: normalizeNumber(sample.recent_steps_delta),
    recent_meal_calorie_delta: normalizeNumber(sample.recent_meal_calorie_delta),
    recent_hydration_delta: normalizeNumber(sample.recent_hydration_delta),
    recent_sleep_hours_delta: normalizeNumber(sample.recent_sleep_hours_delta),
    recent_activity_calorie_delta: normalizeNumber(sample.recent_activity_calorie_delta),
    label: Math.max(0, Math.round(normalizeNumber(sample.label))),
    label_name: String(sample.label_name || "Unknown"),
    support,
    confidence: Math.max(0, Math.min(1, normalizeNumber(sample.confidence))),
    source: sample.source,
    approval_status: approvalStatus,
    approved_at: approvalAt,
    approved_by: approvalBy,
    created_at: createdAt,
    updated_at: sample.updated_at || createdAt,
    note: sample.note?.trim() || undefined,
    uid: sample.uid?.trim() || undefined,
  };

  return { payload, approvalStatus };
};

export function getHealthLearningSamples() {
  return learningSampleCache;
}

export function getHealthLearningSampleEntries() {
  return learningSampleEntryCache;
}

export function setHealthLearningSamples(samples: HealthLearningSampleEntry[]) {
  learningSampleCache = mergeSamples(samples as HealthLearningSampleEntry[]);
}

const loadEntriesFromSnapshot = (
  snapshot: Awaited<ReturnType<typeof get>>,
  scope: HealthLearningScope,
  path: string,
  entries: HealthLearningSampleEntry[]
) => {
  if (!snapshot.exists()) return;
  const rows = snapshot.val() as Record<string, HealthLearningSampleDoc>;
  Object.entries(rows).forEach(([key, row]) => {
    const sample = toSample(row, scope, key, `${path}/${key}`);
    entries.push(sample);
  });
};

export async function loadHealthLearningSampleEntriesForUser(uid: string) {
  if (!uid) {
    learningSampleEntryCache = [];
    return learningSampleEntryCache;
  }

  const [globalSnapshot, userSnapshot] = await Promise.all([
    get(query(ref(rtdb, GLOBAL_SAMPLE_PATH))),
    get(query(ref(rtdb, USER_SAMPLE_PATH(uid)))),
  ]);

  const entries: HealthLearningSampleEntry[] = [];
  loadEntriesFromSnapshot(globalSnapshot, "global", GLOBAL_SAMPLE_PATH, entries);
  loadEntriesFromSnapshot(userSnapshot, "personal", USER_SAMPLE_PATH(uid), entries);
  learningSampleEntryCache = mergeSamples(entries);
  return learningSampleEntryCache;
}

export async function loadHealthLearningSamplesForUser(uid: string) {
  if (!uid) {
    learningSampleCache = [];
    return learningSampleCache;
  }

  const entries = await loadHealthLearningSampleEntriesForUser(uid);
  learningSampleCache = entries.filter(isApproved);
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

export async function approveHealthLearningSample(entry: HealthLearningSampleEntry, approvedBy: string) {
  const nextAt = nowIso();
  const nextStatus: HealthLearningApprovalStatus = "approved";
  const nextUpdate = {
    approval_status: nextStatus,
    approved_at: nextAt,
    approved_by: approvedBy.trim(),
    updated_at: nextAt,
  };
  await update(ref(rtdb, entry.path), nextUpdate);
  learningSampleEntryCache = learningSampleEntryCache.map((sample) =>
    sample.path === entry.path ? { ...sample, approvalStatus: nextStatus, approvalAt: nextAt, approvalBy: approvedBy.trim(), updatedAt: nextAt } : sample
  );
  learningSampleCache = mergeSamples(learningSampleEntryCache.filter(isApproved));
  return { ok: true as const };
}

export async function rejectHealthLearningSample(entry: HealthLearningSampleEntry, approvedBy: string) {
  const nextAt = nowIso();
  const nextStatus: HealthLearningApprovalStatus = "rejected";
  await update(ref(rtdb, entry.path), {
    approval_status: nextStatus,
    approved_at: nextAt,
    approved_by: approvedBy.trim(),
    updated_at: nextAt,
  });
  learningSampleEntryCache = learningSampleEntryCache.map((sample) =>
    sample.path === entry.path ? { ...sample, approvalStatus: nextStatus, approvalAt: nextAt, approvalBy: approvedBy.trim(), updatedAt: nextAt } : sample
  );
  learningSampleCache = mergeSamples(learningSampleEntryCache.filter(isApproved));
  return { ok: true as const };
}

export async function deleteHealthLearningSample(entry: HealthLearningSampleEntry) {
  await remove(ref(rtdb, entry.path));
  learningSampleEntryCache = learningSampleEntryCache.filter((sample) => sample.path !== entry.path);
  learningSampleCache = mergeSamples(learningSampleEntryCache.filter(isApproved));
  return { ok: true as const };
}

export async function recordHealthLearningSample(
  uid: string,
  sample: Omit<HealthLearningSampleDoc, "created_at" | "support" | "updated_at"> & {
    support?: number;
    created_at?: string;
    updated_at?: string;
  }
) {
  const { payload, approvalStatus } = normalizePayload(sample);
  const support = Math.max(1, Math.round(sample.support ?? 1));
  const key = sampleKeyFromValues(
    HEALTH_PREDICTION_FEATURE_KEYS.map((featureKey) => normalizeNumber(payload[featureKey as keyof HealthLearningSampleDoc])),
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

  const globalEntry = toSample(payload, "global", key, `${GLOBAL_SAMPLE_PATH}/${key}`);
  const personalEntry = toSample(payload, "personal", key, `${USER_SAMPLE_PATH(uid)}/${key}`);
  learningSampleEntryCache = mergeSamples([globalEntry, personalEntry, ...learningSampleEntryCache]);
  learningSampleCache = approvalStatus === "approved" ? mergeSamples([globalEntry, personalEntry, ...learningSampleCache]).filter(isApproved) : learningSampleCache;
  return { ok: true as const, key, payload };
}
