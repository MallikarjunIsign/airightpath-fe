import { createContext, useContext, useState, ReactNode, HTMLAttributes } from 'react';

interface TabsContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  variant: 'pills' | 'underline';
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be used within a TabGroup');
  }
  return context;
}

interface TabGroupProps extends HTMLAttributes<HTMLDivElement> {
  defaultTab: string;
  children: ReactNode;
  onChange?: (tab: string) => void;
  variant?: 'pills' | 'underline';
}

export function TabGroup({ defaultTab, children, onChange, variant = 'pills', className = '', ...props }: TabGroupProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleSetTab = (tab: string) => {
    setActiveTab(tab);
    onChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleSetTab, variant }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TabList({ children, className = '', ...props }: TabListProps) {
  const { variant } = useTabsContext();

  return (
    <div
      className={`
        flex gap-1
        ${variant === 'underline'
          ? 'border-b border-[var(--borderMuted,var(--border))]/50'
          : 'bg-[var(--bgSubtle,var(--surface1))] p-1 rounded-xl'
        }
        ${className}
      `}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  );
}

interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export function Tab({ value, children, disabled = false, icon, className = '', ...props }: TabProps) {
  const { activeTab, setActiveTab, variant } = useTabsContext();
  const isActive = activeTab === value;

  const pillStyles = isActive
    ? 'bg-[var(--cardBg)] text-[var(--text)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-medium'
    : 'text-[var(--textSecondary)] hover:text-[var(--text)] hover:bg-[var(--bgOverlay,var(--surface2))]/50';

  const underlineStyles = isActive
    ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] -mb-px font-medium'
    : 'text-[var(--textSecondary)] hover:text-[var(--text)]';

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={`
        relative px-4 py-2 text-sm
        inline-flex items-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        ${variant === 'pills' ? `rounded-lg ${pillStyles}` : underlineStyles}
        ${className}
      `}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children: ReactNode;
}

export function TabPanel({ value, children, className = '', ...props }: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className={`py-4 animate-fade-in ${className}`} {...props}>
      {children}
    </div>
  );
}
