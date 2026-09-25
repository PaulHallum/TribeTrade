import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";

export interface LogEntry {
  id?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  timestamp: any;
  userId?: string;
  tradeUserId?: string;
  stack?: string;
  technicalDetails?: any;
}

class Logger {
  private tradeUserId: string | null = null;
  private userId: string | null = null;

  setContext(userId: string | null, tradeUserId: string | null) {
    this.userId = userId;
    this.tradeUserId = tradeUserId;
  }

  async log(level: 'info' | 'warn' | 'error', message: string, technicalDetails?: any) {
    console[level](`[${level.toUpperCase()}] ${message}`, technicalDetails || '');

    if (!this.tradeUserId) return;

    try {
      // Helper to remove undefined values for Firestore
      const cleanData = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return obj.toISOString();
        
        const cleaned: any = Array.isArray(obj) ? [] : {};
        Object.entries(obj).forEach(([key, value]) => {
          if (value !== undefined) {
            cleaned[key] = cleanData(value);
          }
        });
        return cleaned;
      };

      const logData: any = {
        level,
        message,
        context: window.location.pathname,
        timestamp: serverTimestamp(),
        tradeUserId: this.tradeUserId,
      };

      if (this.userId) logData.userId = this.userId;
      
      if (technicalDetails instanceof Error) {
        logData.stack = technicalDetails.stack || null;
        logData.technicalDetails = cleanData({
          name: technicalDetails.name,
          message: technicalDetails.message,
          code: (technicalDetails as any).code,
          stack: technicalDetails.stack
        });
      } else if (technicalDetails !== undefined) {
        logData.technicalDetails = cleanData(technicalDetails);
      }

      await addDoc(collection(db, 'trade_users', this.tradeUserId, 'logs'), logData);
    } catch (err) {
      console.error('Failed to write to remote log:', err);
    }
  }

  error(message: string, error?: any) {
    return this.log('error', message, error);
  }

  warn(message: string, details?: any) {
    return this.log('warn', message, details);
  }

  info(message: string, details?: any) {
    return this.log('info', message, details);
  }

  subscribeToLogs(tradeUserId: string, callback: (logs: LogEntry[]) => void) {
    const q = query(
      collection(db, 'trade_users', tradeUserId, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
      callback(logs);
    });
  }

  async getRecentLogs(limitCount: number = 10): Promise<LogEntry[]> {
    if (!this.tradeUserId) return [];
    try {
      const q = query(
        collection(db, 'trade_users', this.tradeUserId, 'logs'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
    } catch (err) {
      console.error('Failed to fetch recent logs:', err);
      return [];
    }
  }
}

export const logger = new Logger();
