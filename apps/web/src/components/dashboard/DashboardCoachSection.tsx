// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { useCoachAlerts } from '../../hooks';
import { CoachCard, CoachPanel } from '../coaching';

const DashboardCoachSection: FC = () => {
  const {
    analysis: coachAnalysis,
    topAlerts,
    loading: coachLoading,
    dismissAlert,
  } = useCoachAlerts();

  return (
    <>
      <section className="page-section" aria-label="Financial coach">
        <CoachCard alerts={topAlerts} loading={coachLoading} onDismiss={dismissAlert} />
      </section>
      <section className="page-section" aria-label="Coach insights">
        <CoachPanel analysis={coachAnalysis} loading={coachLoading} />
      </section>
    </>
  );
};

export default DashboardCoachSection;
