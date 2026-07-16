import { del, get, set } from "idb-keyval";

const KEYS = {
  references: "xiaomeishuo.references.v1",
  faces: "xiaomeishuo.faces.v1",
  profile: "xiaomeishuo.profile.v3",
  faceProfile: "xiaomeishuo.face-profile.v2",
  preferences: "xiaomeishuo.preferences.v3",
  selections: "xiaomeishuo.selections.v2",
  plan: "xiaomeishuo.plan.v3",
  progress: "xiaomeishuo.progress.v1",
} as const;

const LEGACY_KEYS = [
  "xiaomeishuo.profile.v1",
  "xiaomeishuo.profile.v2",
  "xiaomeishuo.face-profile.v1",
  "xiaomeishuo.preferences.v1",
  "xiaomeishuo.preferences.v2",
  "xiaomeishuo.plan.v1",
  "xiaomeishuo.plan.v2",
];

export async function saveLocal<T>(key: keyof typeof KEYS, value: T) {
  await set(KEYS[key], value);
}

export async function loadLocal<T>(key: keyof typeof KEYS): Promise<T | undefined> {
  return get<T>(KEYS[key]);
}

export async function removeLocal(key: keyof typeof KEYS) {
  await del(KEYS[key]);
}

export async function clearLocalSession() {
  await Promise.all([...Object.values(KEYS), ...LEGACY_KEYS].map((key) => del(key)));
}
