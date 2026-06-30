/**
 * EventLog contract — in-memory adapters (KMOS-9999 §16 contract tests).
 *
 * Runs the reusable `runEventLogContract` (see event-log-contract-suite.ts)
 * against the kernel's `InMemoryEventLog` AND `PostgresEventLog` backed by an
 * in-memory fake `SqlClient`. The SAME contract runs against a REAL Postgres in
 * `event-log-postgres.test.ts` when KMOS_DATABASE_URL is set (CI database job).
 * One contract, three adapters — proving the Postgres adapter is a faithful,
 * drop-in realization of the one async kernel EventLog port (CRIT-1, KEP-001).
 */

import { InMemoryEventLog } from '@kmos/canonical-kernel';
import { PostgresEventLog } from '@kmos/events';
import { runEventLogContract, FakeSqlClient } from './event-log-contract-suite.js';

runEventLogContract('InMemoryEventLog', () => new InMemoryEventLog());
runEventLogContract('PostgresEventLog+FakeSql', () => new PostgresEventLog(new FakeSqlClient()));
