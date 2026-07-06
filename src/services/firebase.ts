import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC8OfhwUVZCZeUs3MK2TgpfQ4wAAJ-ubD4",
  authDomain: "health-monitoring-system-fff52.firebaseapp.com",
  databaseURL: "https://health-monitoring-system-fff52-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "health-monitoring-system-fff52",
  storageBucket: "health-monitoring-system-fff52.firebasestorage.app",
  messagingSenderId: "81178037143",
  appId: "1:81178037143:web:9a924066129f47ca5792d2",
  measurementId: "G-61BNPBGVFP"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app, "us-central1");
