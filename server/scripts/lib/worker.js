// Scripts that drive the pipeline in-process need a job worker (plan 17): importing this registers every handler and
// starts one. It's safe next to a running server on the same database: the queue never runs a job twice.
import '../../src/services/jobs/handlers.js';
import { startWorker, stopWorker } from '../../src/services/jobs/queue.js';

startWorker();
export { stopWorker };
