import { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  icon: LucideIcon;
  label: string;
}

interface BottomNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: any) => void;
}

export function BottomNav({ tabs, activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border z-40">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-around px-4 py-3 pb-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center gap-1 min-w-[60px] transition-colors"
              >
                <div className={`p-2 rounded-2xl transition-all ${
                  isActive ? 'bg-secondary' : ''
                }`}>
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                </div>
                <span className={`text-xs transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
