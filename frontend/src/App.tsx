import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HealthProvider } from './context/HealthContext';
import { AppShell } from './components/layout/AppShell';

// Pages
import { MissionOverview } from './pages/MissionOverview';
import { DigitalTwin } from './pages/DigitalTwin';
import { TelemetryLab } from './pages/TelemetryLab';
import { RecoveryPlanner } from './pages/RecoveryPlanner';
import { SimulationLab } from './pages/SimulationLab';
import { Benchmarking } from './pages/Benchmarking';
import { ExperimentHistory } from './pages/ExperimentHistory';
import { ResearchReports } from './pages/ResearchReports';
import { SettingsStatus } from './pages/SettingsStatus';

export const App: React.FC = () => {
  return (
    <HealthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<MissionOverview />} />
            <Route path="digital-twin" element={<DigitalTwin />} />
            <Route path="telemetry-lab" element={<TelemetryLab />} />
            <Route path="planner" element={<RecoveryPlanner />} />
            <Route path="simulation-lab" element={<SimulationLab />} />
            <Route path="benchmarking" element={<Benchmarking />} />
            <Route path="history" element={<ExperimentHistory />} />
            <Route path="reports" element={<ResearchReports />} />
            <Route path="settings" element={<SettingsStatus />} />
            {/* Catch-all redirect to Mission Overview */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </HealthProvider>
  );
};

export default App;
