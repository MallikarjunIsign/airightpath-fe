import {
  SelectHTMLAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
  /** Shown on the trigger when nothing is selected yet. */
  placeholder?: string;
  /**
   * Show a filter box inside the popup. Defaults to on once the list is long
   * enough to scroll; pass `true`/`false` to force it either way.
   */
  searchable?: boolean;
  /** Placeholder for the filter box. */
  searchPlaceholder?: string;
}

/** Space (px) the popup keeps between itself and the viewport edge. */
const VIEWPORT_GUTTER = 12;
const MAX_POPUP_HEIGHT = 288;
/** Beyond this many options, scrolling to find one is a chore — filter instead. */
const SEARCHABLE_THRESHOLD = 8;

/**
 * Dropdown with a popup we render and size ourselves. The native `<select>`
 * popup is drawn by the OS at the width of its longest option, so it overflows
 * narrow viewports and ignores our styling; this list is anchored to the
 * trigger, never wider than the field, wraps long labels and flips above the
 * field when there is no room below.
 *
 * A visually hidden native `<select>` still holds the value, so `value`/
 * `onChange`, `react-hook-form`'s `register()` and normal form submission keep
 * working exactly as before.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      searchable,
      searchPlaceholder = 'Search...',
      required,
      className = '',
      ...props
    },
    ref,
  ) => {
    const selectRef = useRef<HTMLSelectElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const [maxHeight, setMaxHeight] = useState(MAX_POPUP_HEIGHT);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [query, setQuery] = useState('');
    // Mirrors the native select for uncontrolled use (e.g. RHF `register`).
    const [uncontrolledValue, setUncontrolledValue] = useState('');

    const disabled = props.disabled;
    const isControlled = props.value !== undefined;
    const currentValue = isControlled ? String(props.value ?? '') : uncontrolledValue;
    const selectedIndex = options.findIndex((o) => o.value === currentValue);
    const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '';

    const showSearch = searchable ?? options.length > SEARCHABLE_THRESHOLD;

    // The popup, keyboard cursor and Enter key all work off this list, so a
    // filtered popup behaves exactly like an unfiltered one.
    const q = query.trim().toLowerCase();
    const visibleOptions =
      showSearch && q
        ? options.filter(
            (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
          )
        : options;

    const setRefs = useCallback(
      (node: HTMLSelectElement | null) => {
        (selectRef as React.MutableRefObject<HTMLSelectElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = node;
      },
      [ref],
    );

    // Keep the trigger label in sync when the value is set outside React's
    // control (RHF `setValue`/`reset` write straight to the DOM node).
    useEffect(() => {
      const el = selectRef.current;
      if (!el || isControlled) return;
      if (el.value !== uncontrolledValue) setUncontrolledValue(el.value);
    });

    /** Write through the native select so React/RHF see a real change event. */
    const commit = (value: string) => {
      const el = selectRef.current;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (!isControlled) setUncontrolledValue(value);
      setOpen(false);
      triggerRef.current?.focus();
    };

    // Decide direction + height from the room actually available on screen.
    useLayoutEffect(() => {
      if (!open || !wrapperRef.current) return;
      const measure = () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const below = window.innerHeight - rect.bottom - VIEWPORT_GUTTER;
        const above = rect.top - VIEWPORT_GUTTER;
        const up = below < Math.min(MAX_POPUP_HEIGHT, above) && above > below;
        setDropUp(up);
        setMaxHeight(Math.max(120, Math.min(MAX_POPUP_HEIGHT, up ? above : below)));
      };
      measure();
      window.addEventListener('resize', measure);
      window.addEventListener('scroll', measure, true);
      return () => {
        window.removeEventListener('resize', measure);
        window.removeEventListener('scroll', measure, true);
      };
    }, [open]);

    // Close on outside click / Escape.
    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Start the keyboard cursor on the selected row and scroll it into view.
    useEffect(() => {
      if (!open) return;
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setQuery('');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Typing straight into the filter is the point of opening a searchable list.
    useEffect(() => {
      if (open && showSearch) searchRef.current?.focus();
    }, [open, showSearch]);

    // Filtering shifts the rows under the cursor — put it back on the first hit.
    // Only while a query is active, so opening still lands on the selected row.
    useEffect(() => {
      if (open && query) setActiveIndex(0);
    }, [query, open]);

    useEffect(() => {
      if (!open || activeIndex < 0) return;
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex]);

    /** Shared by the trigger and the filter box so both drive the same list. */
    const onListKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (!open) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(visibleOptions.length - 1, i + 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(0, i - 1));
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(visibleOptions.length - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (visibleOptions[activeIndex]) commit(visibleOptions[activeIndex].value);
          break;
        case ' ':
          // Space is a normal character while typing a filter.
          if (showSearch) break;
          e.preventDefault();
          if (visibleOptions[activeIndex]) commit(visibleOptions[activeIndex].value);
          break;
        case 'Tab':
          setOpen(false);
          break;
      }
    };

    const triggerClasses = `
      w-full max-w-full min-w-0 px-4 py-2.5 h-11 rounded-xl
      flex items-center justify-between gap-2 text-left
      bg-[var(--inputBg)]
      border border-[var(--inputBorder)]
      text-[var(--text)]
      focus:outline-none
      focus:border-[var(--inputFocus)]
      focus:ring-2 focus:ring-[var(--inputFocus)]/15
      disabled:opacity-50 disabled:cursor-not-allowed
      transition-all duration-200
      ${error ? 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/15' : ''}
      ${className}
    `;

    return (
      <div className="w-full min-w-0">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            {label}
            {required && <span className="text-[var(--error)] ml-0.5">*</span>}
          </label>
        )}

        <div className="relative group min-w-0" ref={wrapperRef}>
          {/* Real form control: holds the value, the ref and any RHF handlers. */}
          <select
            ref={setRefs}
            aria-hidden="true"
            tabIndex={-1}
            required={required}
            className="sr-only"
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-required={required}
            aria-invalid={!!error}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={onListKeyDown}
            className={triggerClasses}
          >
            <span
              className={`truncate ${selectedLabel ? 'text-[var(--text)]' : 'text-[var(--textTertiary)]'}`}
            >
              {selectedLabel || placeholder || 'Select an option'}
            </span>
            <ChevronDown
              size={16}
              className={`flex-shrink-0 text-[var(--textTertiary)] transition-transform duration-200 group-focus-within:text-[var(--primary)] ${open ? 'rotate-180' : ''}`}
            />
          </button>

          {open && (
            <div
              style={{ maxHeight }}
              className={`absolute z-50 left-0 right-0 w-full flex flex-col
                rounded-xl border border-[var(--border)] bg-[var(--cardBg)] shadow-xl
                ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              {/* Filter stays put while the list below it scrolls. */}
              {showSearch && (
                <div className="flex-shrink-0 p-2 border-b border-[var(--borderMuted,var(--border))]">
                  <div className="relative">
                    <Search
                      size={15}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--textTertiary)] pointer-events-none"
                    />
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onListKeyDown}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      aria-controls={listId}
                      className="w-full h-9 pl-8 pr-2 rounded-lg text-sm
                        bg-[var(--inputBg)] border border-[var(--inputBorder)] text-[var(--text)]
                        placeholder:text-[var(--textTertiary)]
                        focus:outline-none focus:border-[var(--inputFocus)]
                        focus:ring-2 focus:ring-[var(--inputFocus)]/15"
                    />
                  </div>
                </div>
              )}

              <div
                ref={listRef}
                id={listId}
                role="listbox"
                className="flex-1 overflow-y-auto overscroll-contain py-1"
              >
                {visibleOptions.length === 0 && (
                  <p className="px-4 py-3 text-sm text-[var(--textTertiary)]">
                    {options.length === 0 ? 'No options' : `No matches for "${query.trim()}"`}
                  </p>
                )}
                {visibleOptions.map((option, i) => {
                  const isSelected = option.value === currentValue;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => commit(option.value)}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-start gap-2 break-words transition-colors
                        ${i === activeIndex ? 'bg-[var(--surface1)]' : ''}
                        ${isSelected ? 'font-semibold text-[var(--primary)]' : 'text-[var(--text)]'}`}
                    >
                      <span className="flex-1 min-w-0 break-words">{option.label}</span>
                      {isSelected && (
                        <Check size={15} className="flex-shrink-0 mt-0.5 text-[var(--primary)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-1.5 text-sm text-[var(--error)]">{error}</p>}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
