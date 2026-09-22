// Throwaway VAPID keypair for the web push e2e suite (npm run test:e2e:push).
// Test-only keys: nothing in production uses them, and they only sign pushes
// to subscriptions created with the matching public key during a test run.
// Generated with `npx web-push generate-vapid-keys`.
export const PUSH_TEST_KEYS = {
	publicKey: 'BEcvAMUQOvlAYa7ZzlmWlAfyPwOmY1LKmVEe6wm0qTrTz8T14sU-6NZ_EYmaF8c5_IczNlWtipsN-AYhOPm77b8',
	privateKey: 'aaG2h7U2vBnLEQsKBfhCDLbkm8l7-cq5mlMEJcKlKcs',
};
