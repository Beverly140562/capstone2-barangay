
import { createContext, useContext, useEffect, useState } from 'react';

import {
  api,
  getToken,
  setToken,
  clearToken,
} from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Normalize the authenticated user's role.
  const normalizeUser = (userData) => {
    if (!userData) return null;

    const role = String(
      userData.roles || userData.role || ''
    ).trim().toLowerCase();

    return {
      ...userData,
      roles: role,
      role,
    };
  };

  // Restore existing login session.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    api.get('/auth/me')
      .then((data) => {
        setUser(normalizeUser(data.user));
      })
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Login using username OR email and password.
  const login = async (username, password) => {
    const data = await api.post('/auth/login', {
      username: username.trim(),
      password,
    });

    if (!data.token || !data.user) {
      throw new Error('Invalid login response from server.');
    }

    const authenticatedUser = normalizeUser(data.user);

    // Validate the role assigned in the database.
    if (
      !['admin', 'captain', 'staff'].includes(
        authenticatedUser.roles
      )
    ) {
      throw new Error(
        'Your account does not have a valid assigned role. Please contact the administrator.'
      );
    }

    setToken(data.token);
    setUser(authenticatedUser);

    return authenticatedUser;
  };

  // Logout.
  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
