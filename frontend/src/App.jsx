import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Contact from './pages/Contact';
import Dashboard from './pages/Dashboard';
import Households from './pages/Households';
import HouseholdForm from './pages/HouseholdForm';
import Validation from './pages/Validation';
import Approve from './pages/Approve';
import Beneficiaries from './pages/Beneficiaries';
import Programs from './pages/Programs';
import CreateProgram from './pages/CreateProgram';
import Users from './pages/Users';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Suggestions from './pages/Suggestions';
import CalamityProgram from './pages/CalamityProgram';
import Activity from './pages/Activity';
import { Spinner } from './components/ui';
import { Toaster } from 'react-hot-toast';
import History from './pages/History';
import About from './pages/About';
import DistributionProgram from './pages/DistributionProgram';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Role({ allow, children }) {
  const { user } = useAuth();
  if (!allow.includes(user.roles)) return <Navigate to="/dashboard" replace />;
  return children;
}

function Protected({ allow, children }) {
  return (
    <RequireAuth>
      <Role allow={allow}>
        <Layout>{children}</Layout>
      </Role>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Toaster
  position="top-right"
  toastOptions={{
    duration: 3000,

    style: {
      background: '#FFFFFF',
      color: '#333333',
      border: '1px solid #E2BEBE',
      borderRadius: '15px',
      padding: '14px 15px',
      fontSize: '20px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      width: '550px',
      maxWidth: 'calc(100vw - 40px)',
    },

    success: {
      style: {
        background: '#F0FDF4',
        color: '#166534',
        border: '3px solid #BBF7D0',
      },
    },

    error: {
      style: {
        background: '#FEF2F2',
        color: '#B91C1C',
        border: '1px solid #FECACA',
      },
    },
  }}
/>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/dashboard" element={<Protected allow={['admin', 'captain', 'staff']}><Dashboard /></Protected>} />
          <Route path="/households" element={<Protected allow={['admin', 'staff']}><Households /></Protected>} />
          <Route path="/update" element={<Protected allow={['admin', 'staff']}><Households /></Protected>} />
          <Route path="/encode" element={<Protected allow={['admin', 'staff']}><HouseholdForm /></Protected>} />
          <Route path="/validation" element={<Protected allow={['admin']}><Validation /></Protected>} />
          <Route path="/approve" element={<Protected allow={['captain', 'admin']}><Approve /></Protected>} />
          <Route path="/beneficiaries" element={<Protected allow={['admin', 'captain']}><Beneficiaries /></Protected>} />
          <Route path="/programs" element={<Protected allow={['admin']}><Programs /></Protected>} />
          <Route path="/programs/create" element={<Protected allow={['admin']}><CreateProgram /></Protected>} />
          <Route path="/users" element={<Protected allow={['admin']}><Users /></Protected>} />
          <Route path="/analytics" element={<Protected allow={['admin', 'captain']}><Analytics /></Protected>} />
          <Route path="/reports" element={<Protected allow={['admin', 'staff']}><Reports /></Protected>} />
          <Route path="/suggestions" element={<Protected allow={['staff', 'admin']}><Suggestions /></Protected>} />
          <Route path="/calamity-program" element={<Protected allow={['staff', 'admin']}><CalamityProgram /></Protected>} />
          <Route path="/activity" element={<Protected allow={['admin']}><Activity /></Protected>} />
          <Route path="/history" element={<Protected allow={['staff','admin']}><History /></Protected>} />
          <Route path="/distribution-program" element={<Protected allow={['staff']}><DistributionProgram /></Protected>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
