import { initializeApp } from 'firebase/app'
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  runTransaction,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { dedupeBest, playerIdFor, type PublicScore, type ScoreBackend } from './scores'

const env = import.meta.env

function toScore(d: QueryDocumentSnapshot<DocumentData>): PublicScore {
  const v = d.data({ serverTimestamps: 'estimate' })
  return {
    id: d.id,
    name: v.name,
    playerId: v.playerId,
    score: v.score,
    bugs: v.bugs ?? 0,
    hazards: v.hazards ?? 0,
    accuracy: v.accuracy ?? 0,
    bestStreak: v.bestStreak ?? 0,
    gold: v.gold ?? 0,
    createdAt: v.createdAt?.toMillis?.() ?? Date.now(),
  }
}

export function createFirebaseBackend(): ScoreBackend {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const db = getFirestore(app)
  const scores = collection(db, 'scores')

  return {
    kind: 'firebase',

    async submit(s) {
      const ref = doc(scores, s.id)
      const playerId = playerIdFor(s.email)
      const pub = {
        name: s.name.trim().slice(0, 24),
        playerId,
        score: Math.round(s.score),
        bugs: s.bugs,
        hazards: s.hazards,
        accuracy: s.accuracy,
        bestStreak: s.bestStreak,
        gold: s.gold,
        createdAt: serverTimestamp(),
      }
      // Stable run IDs make network timeouts and offline retries idempotent.
      const bestRef = doc(db, 'leaderboard', playerId)
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(ref)
        const best = await transaction.get(bestRef)
        if (existing.exists()) return
        transaction.set(ref, pub)
        transaction.set(doc(db, 'entries', ref.id), {
          name: pub.name,
          email: s.email.trim().toLowerCase(),
          playerId,
          score: pub.score,
          createdAt: serverTimestamp(),
        })
        if (!best.exists() || pub.score > best.data().score) {
          transaction.set(bestRef, { ...pub, runId: ref.id })
        }
      })
      return { ...pub, id: ref.id, createdAt: Date.now() }
    },

    subscribeTop(n, cb, onError) {
      const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(n))
      return onSnapshot(q, (snap) => cb(dedupeBest(snap.docs.map((d) => ({ ...toScore(d), id: d.data().runId })), n)), onError)
    },

    subscribeNew(cb, onError) {
      const q = query(scores, orderBy('createdAt', 'desc'), limit(10))
      let primed = false
      return onSnapshot(q, (snap) => {
        if (!primed) {
          primed = true
          return
        }
        for (const ch of snap.docChanges()) if (ch.type === 'added' && !ch.doc.metadata.hasPendingWrites) cb(toScore(ch.doc))
      }, onError)
    },
  }
}
