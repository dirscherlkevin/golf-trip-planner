import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: 'golftrip-af5aa.firebaseapp.com',
  projectId: 'golftrip-af5aa',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export async function getGoogleIdToken() {
  const result = await signInWithPopup(auth, googleProvider)
  return await result.user.getIdToken()
}
