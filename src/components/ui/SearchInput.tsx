import { useState, useEffect, InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onSearch: (value: string) => void;
  delay?: number;
  initialValue?: string;
}

export function SearchInput({
  onSearch,
  delay = 300,
  initialValue = '',
  placeholder = 'Search...',
  className = '',
  ...props
}: SearchInputProps) {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, delay);

  useEffect(() => {
    onSearch(debouncedValue);
  }, [debouncedValue, onSearch]);

  const handleClear = () => {
    setValue('');
  };

  return (
    <div className={`relative group ${className}`}>
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--textTertiary)] transition-colors duration-200 group-focus-within:text-[var(--primary)]">
        <Search size={16} />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="
          w-full pl-10 pr-9 py-2.5 rounded-xl
          bg-[var(--bgSubtle,var(--surface1))]
          border border-[var(--borderMuted,var(--border))]/50
          text-[var(--text)] text-sm
          placeholder:text-[var(--textTertiary)]
          focus:outline-none
          focus:border-[var(--inputFocus)]
          focus:ring-2 focus:ring-[var(--inputFocus)]/15
          focus:bg-[var(--inputBg)]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
        "
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="
            absolute right-3 top-1/2 -translate-y-1/2
            text-[var(--textTertiary)] hover:text-[var(--text)]
            p-0.5 rounded-md hover:bg-[var(--bgOverlay,var(--surface1))]
            transition-all duration-150
          "
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
