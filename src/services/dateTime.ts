const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: LOCAL_TIME_ZONE,
};

const DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: LOCAL_TIME_ZONE,
};

const WEEKDAY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: LOCAL_TIME_ZONE,
};

const TIME_ONLY_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: LOCAL_TIME_ZONE,
};

const DAY_MONTH_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  timeZone: LOCAL_TIME_ZONE,
};

const asDate = (value: Date | string | number) => (value instanceof Date ? value : new Date(value));
const fallbackText = (value: Date | string | number, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);

const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

export const formatLocalDateTime = (value: Date | string | number, fallback = "-") => {
  const date = asDate(value);
  if (!isValidDate(date)) return fallbackText(value, fallback);
  return date.toLocaleString("id-ID", DATE_TIME_OPTIONS);
};

export const formatLocalDate = (value: Date | string | number, fallback = "-") => {
  const date = asDate(value);
  if (!isValidDate(date)) return fallbackText(value, fallback);
  return date.toLocaleDateString("id-ID", DATE_ONLY_OPTIONS);
};

export const formatLocalWeekdayDate = (value: Date | string | number, fallback = "-") => {
  const date = asDate(value);
  if (!isValidDate(date)) return fallbackText(value, fallback);
  return date.toLocaleDateString("id-ID", WEEKDAY_DATE_OPTIONS);
};

export const formatLocalTime = (value: Date | string | number, fallback = "-") => {
  const date = asDate(value);
  if (!isValidDate(date)) return fallbackText(value, fallback);
  return date.toLocaleTimeString("id-ID", TIME_ONLY_OPTIONS);
};

export const formatLocalDayMonth = (value: Date | string | number, fallback = "-") => {
  const date = asDate(value);
  if (!isValidDate(date)) return fallbackText(value, fallback);
  return date.toLocaleDateString("id-ID", DAY_MONTH_OPTIONS);
};

export const getLocalTimeZone = () => LOCAL_TIME_ZONE;
