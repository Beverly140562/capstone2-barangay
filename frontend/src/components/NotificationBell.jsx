import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const navigate = useNavigate();

 
const loadNotifications = async () => {
  try {
    const data = await api.get('/notifications');

    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.notifications)
        ? data.notifications
        : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data?.data)
            ? data.data
            : [];

    setNotifications(rows);
  } catch (error) {
    console.error('Failed to load notifications:', error);
  }
};

const loadUnreadCount = async () => {
  try {
    const data = await api.get('/notifications/unread-count');

    const count = Number(
      data?.count ??
      data?.unread_count ??
      data?.unreadCount ??
      data?.data?.count ??
      0
    );

    setUnreadCount(
      Number.isFinite(count) ? count : 0
    );
  } catch (error) {
    console.error('Failed to load notification count:', error);
  }
};

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    const interval = setInterval(() => {
      loadNotifications();
      loadUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | GET NOTIFICATION DESTINATION
  |--------------------------------------------------------------------------
  */
  const getNotificationDestination = (
    notification
  ) => {
    const type =
      notification?.notification_type;

    switch (type) {
      /*
      |--------------------------------------------------------------------------
      | BENEFICIARY
      |--------------------------------------------------------------------------
      */

      case 'beneficiary_pending':
        // Captain needs to approve the request
        return '/approve';

      case 'beneficiary_approved':
      case 'beneficiary_rejected':
        // Staff/Admin can view approved beneficiaries
        return '/history';

      /*
      |--------------------------------------------------------------------------
      | CALAMITY
      |--------------------------------------------------------------------------
      */

      case 'calamity_pending':
        // Captain needs to approve the calamity request
        return '/approve';

      case 'calamity_approved':
      case 'calamity_rejected':
        // Staff/Admin can view the resulting beneficiaries
        return '/history';

      /*
      |--------------------------------------------------------------------------
      | DEFAULT
      |--------------------------------------------------------------------------
      */

      default:
        return null;
    }
  };

  /*
  |--------------------------------------------------------------------------
  | HANDLE NOTIFICATION CLICK
  |--------------------------------------------------------------------------
  */
  const handleNotificationClick = async (
    notification
  ) => {
    try {
      /*
      |----------------------------------------------------------------------
      | Mark as read first
      |----------------------------------------------------------------------
      */
      if (!notification.is_read) {
        await api.patch(
          `/notifications/${notification.notification_id}/read`
        );

        setNotifications((prev) =>
          prev.map((item) =>
            item.notification_id ===
            notification.notification_id
              ? {
                  ...item,
                  is_read: true,
                }
              : item
          )
        );

        setUnreadCount((prev) =>
          Math.max(0, prev - 1)
        );
      }

      /*
      |----------------------------------------------------------------------
      | Find destination
      |----------------------------------------------------------------------
      */
      const destination =
        getNotificationDestination(
          notification
        );

      /*
      |----------------------------------------------------------------------
      | Close dropdown
      |----------------------------------------------------------------------
      */
      setOpen(false);

      /*
      |----------------------------------------------------------------------
      | Navigate
      |----------------------------------------------------------------------
      */
      if (destination) {
        navigate(destination);
      }
    } catch (error) {
      console.error(
        'Failed to open notification:',
        error
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | MARK ONE AS READ
  |--------------------------------------------------------------------------
  */
  const markAsRead = async (
    notificationId
  ) => {
    try {
      await api.patch(
        `/notifications/${notificationId}/read`
      );

      setNotifications((prev) =>
        prev.map((notification) =>
          notification.notification_id ===
          notificationId
            ? {
                ...notification,
                is_read: true,
              }
            : notification
        )
      );

      setUnreadCount((prev) =>
        Math.max(0, prev - 1)
      );
    } catch (error) {
      console.error(
        'Failed to mark notification as read:',
        error
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | MARK ALL AS READ
  |--------------------------------------------------------------------------
  */
  const markAllAsRead = async () => {
    try {
      await api.patch(
        '/notifications/read-all'
      );

      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error(
        'Failed to mark all notifications:',
        error
      );
    }
  };

  return (
    <div className="relative">
      {/* Bell */}
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => !prev)
        }
        className="relative flex h-13 w-13 items-center justify-center rounded-full text-white transition hover:bg-white/10"
        aria-label="Notifications"
      >
        <Bell
          className="h-8 w-8"
          strokeWidth={2.5}
        />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[25px] h-[25px] items-center justify-center rounded-full bg-red-500 px-1 text-xl font-bold text-white">
            {unreadCount > 99
              ? '99+'
              : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {open && (
        <>
          {/* Background click area */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />

          <div className="absolute right-0 z-50 mt-3 w-[420px] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-2">
              <div>
                <h3 className="text-2xl font-bold text-[#6E2430]">
                  Notifications
                </h3>

                {unreadCount > 0 && (
                  <p className="text-xl text-gray-500">
                    {unreadCount} unread
                  </p>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xl font-semibold text-[#6E2430] hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[450px] overflow-y-auto">

              {notifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />

                  <p className="font-semibold">
                    No notifications
                  </p>

                  <p className="mt-1 text-xl">
                    You're all caught up.
                  </p>
                </div>
              ) : (
                notifications.map(
                  (notification) => (
                    <div
                      key={
                        notification.notification_id
                      }
                      onClick={() =>
                        handleNotificationClick(
                          notification
                        )
                      }
                      className={`cursor-pointer border-b px-5 py-4 transition hover:bg-[#FFF0F0] ${
                        notification.is_read
                          ? 'bg-white'
                          : 'bg-[#FFF5F5]'
                      }`}
                    >
                      <div className="flex gap-3">

                        {/* Unread indicator */}
                        <div className="pt-2">
                          {!notification.is_read && (
                            <span className="block h-3 w-3 rounded-full bg-red-500" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">

                          <p
                            className={`text-base ${
                              notification.is_read
                                ? 'font-semibold text-gray-700'
                                : 'font-bold text-[#6E2430]'
                            }`}
                          >
                            {notification.title}
                          </p>

                          <p className="mt-1 text-lg leading-5 text-gray-600">
                            {notification.message}
                          </p>

                          <p className="mt-2 text-lg text-gray-400">
                            {notification.created_at
                              ? new Date(
                                  notification.created_at
                                ).toLocaleString()
                              : ''}
                          </p>

                          {!notification.is_read && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                markAsRead(
                                  notification.notification_id
                                );
                              }}
                              className="mt-2 flex items-center gap-1 text-lg font-semibold text-[#6E2430] hover:underline"
                            >
                              <Check className="h-4 w-4" />
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )
              )}

            </div>
          </div>
        </>
      )}
    </div>
  );
}