import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Finds the Firestore document ID for a given Auth user's own record in the
// `superadmin` collection.
//
// Two different lookup strategies existed in this codebase before this file
// was added — ProfileManagement.jsx queried by email (with a uid-keyed
// fallback), while Navbar.jsx assumed the doc ID always equals the Auth
// UID. If a superadmin doc was ever created with an auto-generated ID
// (e.g. added by hand in the Firebase Console, or by some other flow),
// those two lookups silently pointed at two different documents: saves
// in Profile Management went to the real doc, but the Navbar kept
// watching an empty uid-keyed path that never existed — so name/avatar
// changes never showed up there.
//
// Every component that needs "my own superadmin doc" should call this
// instead of re-implementing the lookup, so there's a single source of
// truth for how it's resolved. Falls back to the Auth UID if no matching
// document is found by email, so callers can still create one at that
// path if needed (setDoc(..., { merge: true }) creates it if missing).
export async function resolveSuperAdminDocId(user) {
  if (!user) return null;

  try {
    const q = query(collection(db, 'superadmin'), where('email', '==', user.email));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) return querySnap.docs[0].id;
  } catch (error) {
    console.error('Failed to query superadmin doc by email:', error);
  }

  try {
    const uidSnap = await getDoc(doc(db, 'superadmin', user.uid));
    if (uidSnap.exists()) return user.uid;
  } catch (error) {
    console.error('Failed to check uid-keyed superadmin doc:', error);
  }

  // Neither exists yet — fall back to uid so a save can create it there.
  return user.uid;
}
