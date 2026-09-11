import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/Landing/LandingPage'
import LoginPage from './pages/Login/LoginPage'
import RegisterPage from './pages/Register/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPassword/ForgotPasswordPage'
import LibraryPage from './pages/Library/LibraryPage'
import CreateProjectPage from './pages/CreateProject/CreateProjectPage'
import ProjectDetailPage from './pages/ProjectDetail/ProjectDetailPage'
import GeneratePage from './pages/Generate/GeneratePage'
import DecisionPage from './pages/Decision/DecisionPage'
import ProductsPage from './pages/Products/ProductsPage'
import ResultPage from './pages/Result/ResultPage'
import ProjectSummaryPage from './pages/ProjectSummary/ProjectSummaryPage'
import SettingsPage from './pages/Settings/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/home" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/create-project" element={<CreateProjectPage />} />
        <Route path="/create-project/:id" element={<CreateProjectPage />} />
        <Route path="/project/:id" element={<ProjectDetailPage />} />
        <Route path="/project/:id/generate" element={<GeneratePage />} />
        <Route path="/project/:id/result" element={<ResultPage />} />
        <Route path="/project/:id/decisions" element={<DecisionPage />} />
        <Route path="/project/:id/products" element={<ProductsPage />} />
        <Route path="/project/:id/summary" element={<ProjectSummaryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
