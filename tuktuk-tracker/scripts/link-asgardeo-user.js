/**
 * Link an Asgardeo identity to a local officer record.
 *
 *   node scripts/link-asgardeo-user.js <asgardeo-email> [officer-username]
 *
 * Why this is needed: Asgardeo and MongoDB are separate user directories.
 * Asgardeo says *who* you are; the local User record says *what you may see*,
 * because only Mongo knows the Province -> District -> Station graph that
 * scope_id points into. asgardeoAuth.js matches an incoming token to a local
 * officer by asgardeo_sub, then username, then email -- and refuses with 403
 * USER_NOT_PROVISIONED when none match, rather than auto-creating an officer
 * with a null scope_id that would silently see nothing.
 *
 * The seeded officers have no email set, so nothing can match. This sets one,
 * which lets ASGARDEO_ALLOW_EMAIL_LINKING do the rest on first sign-in: the
 * middleware then stores asgardeo_sub permanently.
 *
 * Note: with the in-memory dev database (npm run dev:memory) this has to be
 * re-run after every restart, because the database is recreated each time. Use
 * a real MONGO_URI for a link that persists.
 */

/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

const [, , email, username = 'admin'] = process.argv;

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/link-asgardeo-user.js <asgardeo-email> [officer-username]');
  console.error('Example: node scripts/link-asgardeo-user.js officer@example.com admin');
  process.exit(1);
}

const run = async () => {
  await connectDB();

  const officer = await User.findOne({ username: username.toLowerCase() });
  if (!officer) {
    console.error(`No officer with username '${username}'. Run: npm run seed`);
    await mongoose.connection.close();
    process.exit(1);
  }

  // Someone else holding this email would make the match ambiguous.
  const clash = await User.findOne({
    email: email.toLowerCase(),
    _id: { $ne: officer._id },
  });
  if (clash) {
    console.error(`Email ${email} is already on officer '${clash.username}'.`);
    await mongoose.connection.close();
    process.exit(1);
  }

  officer.email = email.toLowerCase();
  // Clear any stale link so a different Asgardeo user can take over this record.
  officer.asgardeo_sub = undefined;
  await officer.save();

  console.log(`\n  Linked ${email}  ->  officer '${officer.username}' (${officer.role})`);
  console.log('  Sign in through Asgardeo with that account; asgardeo_sub is stored on first login.\n');

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('Failed:', err.message);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
