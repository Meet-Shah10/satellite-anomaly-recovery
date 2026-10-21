import React from 'react';
import { Sliders } from 'lucide-react';
import { UnderConstructionView } from '../components/common/UnderConstructionView';

export const SimulationLab: React.FC = () => {
  return (
    <UnderConstructionView
      title="Simulation Laboratory"
      subtitle="Interactive step-by-step orbital dynamics sandbox with command execution, fault injection, and physical constraint verification."
      icon={<Sliders className="w-5 h-5" />}
      plannedFeatures={[
        {
          title: 'Manual Action Dispatcher',
          description:
            'Dispatch individual commands (reboot_subsystem, load_shedding, slew_sun, enter_safe_mode, run_diagnostics, activate_backup, clear_fault) and inspect physical responses.',
          endpoints: ['POST /api/simulate/step', 'GET /api/commands'],
        },
        {
          title: 'Fault Injection Engine',
          description:
            'Trigger active fault conditions: single_thermal, battery_discharge, tumbling_adcs, combined_cascade, and observe runaway dynamics or safe-mode triggers.',
          endpoints: ['POST /api/simulate/step', 'GET /api/scenarios'],
        },
        {
          title: 'Immediate Telemetry State Differential',
          description:
            'Side-by-side comparison of pre-step and post-step telemetry variables, computing exact delta SOC, delta T_bat, and energy expenditure in Joules.',
          endpoints: ['POST /api/simulate/step'],
        },
      ]}
      scientificScope={[
        'Deterministic physical update steps via SpacecraftSimulator.step()',
        'Direct command latency simulation (5s to 30s per action)',
        'Energy draw per command (5.0J to 25.0J)',
        'Thermal dissipation model with Stefan-Boltzmann radiation balance',
      ]}
    />
  );
};
