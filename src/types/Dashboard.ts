export type HealthData = {
  steps?: number;
  heartRate?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  bloodPressure?: string;
};

export type DashboardProps = {
  latest?: HealthData | null;
  userDisplayName?: string;
  userUid?: string;
  userEmail?: string;
  onSignOut: () => void;
};
