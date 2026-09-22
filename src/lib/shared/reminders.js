// Daily reminder scheduling, shared by the due-subscription query
// (src/lib/server/storage.js) and the hourly sender (scripts/send-reminders.mjs)
// so both always agree on the window.
export const REMINDER_HOURS = [7, 8, 20, 21];
export const REMINDER_MIN_GAP_HOURS = 20;
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';
