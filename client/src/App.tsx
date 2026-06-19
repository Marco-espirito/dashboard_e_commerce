import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLayout } from "./components/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TeamPage } from "./pages/TeamPage";
import { MemberDashboard } from "./pages/MemberDashboard";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/membre"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="commandes" element={<OrdersPage />} />
            <Route path="produits" element={<ProductsPage />} />
            <Route path="inventaire" element={<InventoryPage />} />
            <Route path="achats" element={<PurchasesPage />} />
            <Route path="equipe" element={<TeamPage />} />
            <Route path="parametres" element={<SettingsPage />} />
            <Route path="sessions" element={<Navigate to="/admin/parametres?onglet=sessions" replace />} />
            <Route path="securite" element={<Navigate to="/admin/parametres?onglet=securite" replace />} />
          </Route>

          <Route
            path="/membre"
            element={
              <ProtectedRoute>
                <MemberDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
