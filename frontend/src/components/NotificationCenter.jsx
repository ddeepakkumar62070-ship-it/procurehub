import { useEffect, useState } from 'react';
import { notificationApi } from '../api/notificationApi';
import { useAuthStore } from '../store/authStore';

function NotificationCenter() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    if (!user || !accessToken) {
      setNotifications([]);
      return undefined;
    }

    let active = true;
    notificationApi.list().then((result) => {
      if (active) {
        setNotifications((current) => {
          const combined = new Map(result.data.map((item) => [item.id, item]));
          current.forEach((item) => combined.set(item.id, item));
          return [...combined.values()]
            .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
            .slice(0, 30);
        });
        setError('');
      }
    }).catch((loadError) => {
      if (active) setError(loadError.response?.data?.error?.message || 'Could not load notifications');
    });

    return () => {
      active = false;
    };
  }, [user?.id, accessToken]);

  if (!user) return null;

  async function markOneRead(notification) {
    if (notification.read_at) return;
    try {
      const updated = await notificationApi.markRead(notification.id);
      setNotifications((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
      setError('');
    } catch (readError) {
      setError(readError.response?.data?.error?.message || 'Could not update notification');
    }
  }

  async function markAllRead() {
    try {
      await notificationApi.markAllRead();
      setNotifications((current) => current.map((item) => (
        item.read_at ? item : { ...item, read_at: new Date().toISOString() }
      )));
      setError('');
    } catch (readError) {
      setError(readError.response?.data?.error?.message || 'Could not update notifications');
    }
  }

  return (
    <aside className="notification-center">
      <button
        className="notification-toggle"
        type="button"
        aria-expanded={open}
        aria-label={`Notifications, ${unreadCount} unread`}
        onClick={() => setOpen((value) => !value)}
      >
        Notifications
        {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <header>
            <strong>Notifications</strong>
            <button
              className="text-button"
              type="button"
              disabled={unreadCount === 0}
              onClick={markAllRead}
            >
              Mark all read
            </button>
          </header>
          {error && <p className="notification-error">{error}</p>}
          {notifications.length === 0
            ? <p className="muted">You’re all caught up.</p>
            : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id} className={notification.read_at ? '' : 'unread'}>
                    <button type="button" onClick={() => markOneRead(notification)}>
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>{notification.type.replaceAll('_', ' ')}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}
    </aside>
  );
}

export default NotificationCenter;
