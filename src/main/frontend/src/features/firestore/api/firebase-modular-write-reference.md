# Firebase Modular SDK (v9+) Write Reference

This app currently writes through backend APIs.  
Use this snippet only if/when you switch to direct browser writes with Firebase Auth + matching Firestore rules.

```ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app"
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  setDoc,
  type DocumentData,
} from "firebase/firestore"

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const db = getFirestore(app)

const FIRESTORE_AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export function generateFirestoreDocumentId(length = 20): string {
  const size = Math.max(1, Math.floor(length))
  const random = new Uint8Array(size)
  crypto.getRandomValues(random)
  return Array.from(random, (value) => FIRESTORE_AUTO_ID_CHARS[value % FIRESTORE_AUTO_ID_CHARS.length]).join("")
}

export function parseCreatePayload(jsonText: string): DocumentData {
  const parsed = JSON.parse(jsonText)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.")
  }
  return parsed as DocumentData
}

export function validateDocumentId(docId: string): void {
  const normalized = docId.trim()
  if (!normalized) return
  if (normalized.includes("/") || normalized === "." || normalized === "..") {
    throw new Error("Document ID cannot contain '/' and cannot be '.' or '..'.")
  }
}

export async function createFirestoreDocument(params: {
  collectionPath: string
  payload: DocumentData
  docId?: string
}) {
  const collectionPath = params.collectionPath.trim().replace(/^\/+|\/+$/g, "")
  if (!collectionPath) {
    throw new Error("Collection path is required.")
  }

  const segments = collectionPath.split("/")
  if (segments.length % 2 === 0) {
    throw new Error("Collection path must contain an odd number of path segments.")
  }

  const docId = params.docId?.trim() ?? ""
  validateDocumentId(docId)

  if (docId) {
    const docRef = doc(db, collectionPath, docId)
    await setDoc(docRef, params.payload)
    return { id: docRef.id, path: docRef.path }
  }

  const colRef = collection(db, collectionPath)
  const docRef = await addDoc(colRef, params.payload)
  return { id: docRef.id, path: docRef.path }
}
```

