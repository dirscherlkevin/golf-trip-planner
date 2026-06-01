import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: 'golftrip-af5aa.firebaseapp.com',
  projectId: 'golftrip-af5aa',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

export async function getGoogleIdToken() {
  if (isMobile) {
    // On mobile, use redirect flow — popup causes a tab switch that
    // kills pending network requests when the tab resumes
    await signInWithRedirect(auth, googleProvider)
    return null // page will navigate away; result handled by checkRedirectResult
  }
  const result = await signInWithPopup(auth, googleProvider)
  return await result.user.getIdToken()
}

export async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth)
    if (!result) return null
    return await result.user.getIdToken()
  } catch {
    return null
  }
}
