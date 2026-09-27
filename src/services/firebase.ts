import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { AgentWallet, TransactionRecord } from '../types/agent';
import firebaseConfig from '../../firebase-applet-config.json';

const LOCAL_STORAGE_AGENTS_KEY = 'agentrails_agents_v1';
const LOCAL_STORAGE_TXS_KEY = 'agentrails_txs_v1';

let firestoreDb: any = null;

try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  // Support custom databaseId if configured
  firestoreDb = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
} catch (err) {
  console.warn('Firebase initialization note (using local cache fallback):', err);
}

/**
 * Save full agents fleet to Firestore & LocalStorage
 */
export async function persistAgents(agents: AgentWallet[]): Promise<void> {
  // Always update local cache first
  try {
    localStorage.setItem(LOCAL_STORAGE_AGENTS_KEY, JSON.stringify(agents));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }

  if (!firestoreDb) return;

  try {
    const promises = agents.map((agent) => {
      const agentDocRef = doc(firestoreDb, 'agents', agent.id);
      return setDoc(agentDocRef, {
        ...agent,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    await Promise.all(promises);
  } catch (err) {
    console.warn('Firestore agents sync error (saved locally):', err);
  }
}

/**
 * Load agents fleet from Firestore with LocalStorage fallback
 */
export async function loadAgents(defaultAgents: AgentWallet[]): Promise<AgentWallet[]> {
  // Check Firestore first if available
  if (firestoreDb) {
    try {
      const colRef = collection(firestoreDb, 'agents');
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        const remoteAgents: AgentWallet[] = [];
        snapshot.forEach((docSnap) => {
          remoteAgents.push(docSnap.data() as AgentWallet);
        });
        if (remoteAgents.length > 0) {
          // Sync to local storage
          try {
            localStorage.setItem(LOCAL_STORAGE_AGENTS_KEY, JSON.stringify(remoteAgents));
          } catch {}
          return remoteAgents;
        }
      }
    } catch (err) {
      console.warn('Firestore load failed, falling back to local storage:', err);
    }
  }

  // Fallback to local storage
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_AGENTS_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Local storage load error:', e);
  }

  return defaultAgents;
}

/**
 * Persist a transaction record to Firestore & LocalStorage
 */
export async function persistTransaction(tx: TransactionRecord, allTxs: TransactionRecord[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_STORAGE_TXS_KEY, JSON.stringify(allTxs.slice(0, 100)));
  } catch (e) {
    console.warn('LocalStorage tx save failed:', e);
  }

  if (!firestoreDb) return;

  try {
    const txDocRef = doc(firestoreDb, 'transactions', tx.id);
    await setDoc(txDocRef, tx);
  } catch (err) {
    console.warn('Firestore transaction log error:', err);
  }
}

/**
 * Load transactions from Firestore with LocalStorage fallback
 */
export async function loadTransactions(defaultTxs: TransactionRecord[]): Promise<TransactionRecord[]> {
  if (firestoreDb) {
    try {
      const colRef = collection(firestoreDb, 'transactions');
      const q = query(colRef, orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const remoteTxs: TransactionRecord[] = [];
        snapshot.forEach((d) => remoteTxs.push(d.data() as TransactionRecord));
        if (remoteTxs.length > 0) {
          try {
            localStorage.setItem(LOCAL_STORAGE_TXS_KEY, JSON.stringify(remoteTxs));
          } catch {}
          return remoteTxs;
        }
      }
    } catch (err) {
      console.warn('Firestore tx load failed:', err);
    }
  }

  // Fallback
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_TXS_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return defaultTxs;
}
