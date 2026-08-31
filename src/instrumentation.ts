/**
 * Next.js server bootstrap hook.
 *
 * Arms the Telegram "standby" responder as soon as the web server starts, so a client
 * who sends music BEFORE pressing the "Connect Telegram bot" button in the admin
 * panel immediately gets a Persian reply telling them to press it first.
 *
 * Runs only in the Node.js runtime; the edge runtime has no long-lived polling.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { initTelegramRuntime } = await import("@/server/telegram/runtime");
    initTelegramRuntime();
  } catch (error) {
    // Never block the web app because of Telegram.
    console.warn(
      "[instrumentation] telegram standby not armed:",
      error instanceof Error ? error.message : error,
    );
  }
}
