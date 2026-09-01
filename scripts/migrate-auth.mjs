#!/usr/bin/env node
/**
 * One-time migration from the legacy `users` collection to Firebase
 * Authentication.
 *
 * For every profile document under
 *     artifacts/{APP_ID}/public/data/users/{docId}
 * it will:
 *   1. create (or reuse) an email/password Auth account,
 *   2. set the custom claims `role` and `empId` that firestore.rules check,
 *   3. write `authUid` and `email` back onto the profile document.
 *
 * The legacy `pass` field (a client-side SHA-256 hash) is NOT migrated — a hash
 * cannot be converted into a Firebase password. Each account gets a generated
 * temporary password which is printed once, here, and never stored. Hand them
 * out in person and have everyone change their password on first sign-in.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *   APP_ID=teamcheck-6ea23 EMAIL_DOMAIN=midrag.co.il \
 *   node scripts/migrate-auth.mjs [--dry-run] [--clear-pass]
 *
 * Requires firebase-admin:  npm i -D firebase-admin
 *
 * --dry-run     print what would happen, write nothing
 * --clear-pass  after a successful migration, remove the legacy `pass` field
 *               (do this only once the whole team has signed in with Auth)
 */

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DRY = process.argv.includes('--dry-run');
const CLEAR_PASS = process.argv.includes('--clear-pass');
const APP_ID = process.env.APP_ID || 'teamcheck-6ea23';
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'midrag.co.il';
const KEY_FILE = process.env.SERVICE_ACCOUNT_FILE;

initializeApp({
  credential: KEY_FILE
    ? cert(JSON.parse(readFileSync(KEY_FILE, 'utf8')))
    : applicationDefault(),
});

const auth = getAuth();
const db = getFirestore();

const usersCol = db
  .collection('artifacts')
  .doc(APP_ID)
  .collection('public')
  .doc('data')
  .collection('users');

/** A readable temporary password: no ambiguous characters. */
function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Transliterate a Hebrew name into an email local part. */
function slug(name, fallback) {
  const ascii = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return ascii || fallback;
}

async function main() {
  const snap = await usersCol.get();
  if (snap.empty) {
    console.log('No user profiles found under artifacts/%s/public/data/users', APP_ID);
    return;
  }

  console.log('%s%d profiles\n', DRY ? '[dry run] ' : '', snap.size);
  const created = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name || doc.id;
    const role = data.role === 'מנהל' ? 'manager' : 'employee';
    const email = data.email || `${slug(name, doc.id)}@${EMAIL_DOMAIN}`;

    let user = null;
    try {
      user = await auth.getUserByEmail(email);
    } catch {
      // no account yet
    }

    let password = null;
    if (!user) {
      password = tempPassword();
      if (DRY) {
        console.log('would create %s  (%s, %s)', email, name, role);
      } else {
        user = await auth.createUser({ email, password, displayName: name });
        console.log('created  %s  (%s, %s)', email, name, role);
      }
    } else {
      console.log('exists   %s  (%s)', email, name);
    }

    if (DRY) continue;

    // The claims firestore.rules reads.
    await auth.setCustomUserClaims(user.uid, { role, empId: data.id || doc.id });

    const patch = { authUid: user.uid, email };
    if (CLEAR_PASS) patch.pass = null;
    await doc.ref.set(patch, { merge: true });

    if (password) created.push({ name, email, password });
  }

  if (created.length) {
    console.log('\nTemporary passwords — shown once, not stored anywhere:\n');
    for (const c of created) console.log('  %s  %s  %s', c.email.padEnd(34), c.password, c.name);
    console.log('\nHand these out in person and have everyone change them on first sign-in.');
  }

  console.log(
    '\nNext: set VITE_AUTH_MODE=firebase in .env, verify sign-in, then deploy firestore.rules.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
