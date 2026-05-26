import type { NotificationPayload, NotificationType } from '@aal/shared';
import { runtimeBus } from './EventBus.js';

/**
 * Notification engine — only fires on important state changes.
 * Has per-agent cooldown to prevent spam.
 *
 * Notify on: completed, error, waiting_input, stalled
 * Do NOT notify on: thinking, running, idle
 */
class NotificationEngineImpl {
  private cooldowns = new Map<string, number>();
  private cooldownMs = 5000; // 5s between notifications per agent
  private agentNames = new Map<string, string>();

  private notifyTypes: NotificationType[] = ['completed', 'error', 'waiting_input', 'stalled'];

  constructor() {
    // Track agent names from discovery events
    runtimeBus.on('agent:discovered', (info) => {
      this.agentNames.set(info.id, info.displayName);
    });

    runtimeBus.on('state:changed', (id, _from, to, _meta) => {
      const notifyType = this.toNotificationType(to);
      if (!notifyType) return;
      this.maybeNotify(id, notifyType);
    });
  }

  private toNotificationType(status: string): NotificationType | null {
    if (this.notifyTypes.includes(status as NotificationType)) {
      return status as NotificationType;
    }
    return null;
  }

  private maybeNotify(agentId: string, type: NotificationType): void {
    const now = Date.now();
    const last = this.cooldowns.get(agentId) ?? 0;
    if (now - last < this.cooldownMs) return;

    this.cooldowns.set(agentId, now);

    const messages: Record<NotificationType, string> = {
      completed: 'Task completed',
      error: 'Encountered an error',
      waiting_input: 'Waiting for your input',
      stalled: 'May be stuck',
    };

    const payload: NotificationPayload = {
      agentId,
      agentName: this.agentNames.get(agentId) ?? agentId,
      type,
      message: messages[type],
      timestamp: now,
    };

    runtimeBus.emit('notification', payload);
  }
}

export const notificationEngine = new NotificationEngineImpl();
