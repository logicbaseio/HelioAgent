#!/usr/bin/env node
import { migrateHelioCodeStore, getHelioCodePool } from "../src/server/helio-code/store.mjs";

await migrateHelioCodeStore();
await getHelioCodePool().end();
console.log("Helio Code Postgres schema is up to date.");
