import { useState } from 'react';
import { Home, Apple, Dumbbell, Users } from 'lucide-react';
import { Toaster } from 'sonner';
import { DashboardTab } from './components/DashboardTab';
import { NutritionTab } from './components/NutritionTab';
import { TrainingTab } from './components/TrainingTab';
import { CommunityTab } from './components/CommunityTab';
import { InterventionModal } from './components/InterventionModal';
import { BottomNav } from './components/BottomNav';
import { AdherenceRing } from './components/AdherenceRing';

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'nutrition' | 'training' | 'community'>('home');
  const [showModal, setShowModal] = useState(false);

  const tabs = [
    { id: 'home' as const,      icon: Home,     label: 'Home' },
    { id: 'nutrition' as const, icon: Apple,    label: 'Nutrition' },
    { id: 'training' as const,  icon: Dumbbell, label: 'Training' },
    { id: 'community' as const, icon: Users,    label: 'Community' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-32">
        {activeTab === 'home'      && <DashboardTab onOpenModal={() => setShowModal(true)} />}
        {activeTab === 'nutrition' && <NutritionTab />}
        {activeTab === 'training'  && <TrainingTab />}
        {activeTab === 'community' && <CommunityTab />}
      </div>

      <AdherenceRing />
      <BottomNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {showModal && <InterventionModal onClose={() => setShowModal(false)} />}

      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--card-foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </div>
  );
}
