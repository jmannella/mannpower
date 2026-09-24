import { db } from '../data/db'

/**
 * Empty every table between tests without ever closing the connection.
 *
 * The obvious reset is `db.delete()` then `db.open()`, and that is what these tests used to do.
 * Deleting closes the database, so any Dexie work still in flight from the test that just
 * finished rejects with DatabaseClosedError. Nothing is awaiting those promises, so Vitest
 * counts them as unhandled errors and fails the whole run with an exit code even though every
 * test passed. It happened about one run in six, which is enough to break deploys at random.
 *
 * Clearing the tables leaves the connection open, so nothing can reject. Product code never
 * closes or deletes this database, so losing that path costs the tests nothing.
 */
export async function resetDb(): Promise<void> {
  if (!db.isOpen()) await db.open()
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
}
