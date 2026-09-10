/**
 * Seed entrypoint placeholder (M0).
 * Sẽ đầy đủ ở M1 sau khi schema Doc04 được khóa.
 * Yêu cầu: idempotent với UUID cố định + upsert (R-06).
 */
async function main(): Promise<void> {
  console.info('[seed] M0 stub — no-op. M1 will seed org_unit, users, roles, thresholds.');
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
