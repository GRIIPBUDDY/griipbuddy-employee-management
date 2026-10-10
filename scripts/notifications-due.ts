import "dotenv/config";
import { processDueNotifications } from "../src/features/review/due-notifications";
import { db } from "../src/lib/db/client";
try { console.log(JSON.stringify(await processDueNotifications())); }
finally { await db.$disconnect(); }
