import { Notification } from 'electron';

export function notify(title: string, body: string): void {
  console.log(`[notify] ${title}: ${body}`);
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}
