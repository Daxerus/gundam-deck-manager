import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Catalog } from './pages/Catalog';
import { Collection } from './pages/Collection';
import { PilotLinks } from './pages/PilotLinks';
import { Decks } from './pages/Decks';
import { DeckEditor } from './pages/DeckEditor';
import { ActiveDecks } from './pages/ActiveDecks';
import { ShoppingList } from './pages/ShoppingList';
import { Friends } from './pages/Friends';
import { LoanHistory } from './pages/LoanHistory';
import { AdminInvites } from './pages/AdminInvites';

function BootScreen() {
  return (
    <div className="scanlines flex min-h-full items-center justify-center font-mono text-sm text-muted">
      Inicializando terminal…
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <BootScreen />;
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  if (isLoading) return <BootScreen />;
  if (isAuthed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Catalog />} />
        <Route path="collection" element={<Collection />} />
        <Route path="pilot-links" element={<PilotLinks />} />
        <Route path="decks" element={<Decks />} />
        <Route path="decks/:id" element={<DeckEditor />} />
        <Route path="active" element={<ActiveDecks />} />
        <Route path="shopping" element={<ShoppingList />} />
        <Route path="friends" element={<Friends />} />
        <Route path="loans" element={<LoanHistory />} />
        <Route path="admin/invites" element={<AdminInvites />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
