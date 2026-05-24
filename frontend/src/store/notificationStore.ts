/**
 * Notification store — global toast state via Zustand.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type NotificationType = "success" | "warning" | "error" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  /** Auto-dismiss after this many ms (default: 5000). Set to 0 to disable. */
  duration?: number;
  /** Optional timestamp for display */
  createdAt: number;
}

interface NotificationStore {
  notifications: Notification[];
  /** Add a new toast — returns generated id */
  addNotification: (payload: Omit<Notification, "id" | "createdAt">) => string;
  /** Remove a specific notification by id */
  removeNotification: (id: string) => void;
  /** Clear all notifications */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
let _idCounter = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (payload) => {
    const id = `notif-${Date.now()}-${_idCounter++}`;
    const notification: Notification = {
      ...payload,
      id,
      createdAt: Date.now(),
      duration: payload.duration ?? 5000,
    };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-dismiss
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, notification.duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => set({ notifications: [] }),
}));

// ---------------------------------------------------------------------------
// Convenience helpers — call anywhere without hooks
// ---------------------------------------------------------------------------
const store = useNotificationStore;

export const notify = {
  success: (title: string, message?: string, duration?: number) =>
    store.getState().addNotification({ type: "success", title, message, duration }),
  warning: (title: string, message?: string, duration?: number) =>
    store.getState().addNotification({ type: "warning", title, message, duration }),
  error: (title: string, message?: string, duration?: number) =>
    store.getState().addNotification({ type: "error", title, message, duration }),
  info: (title: string, message?: string, duration?: number) =>
    store.getState().addNotification({ type: "info", title, message, duration }),
};
