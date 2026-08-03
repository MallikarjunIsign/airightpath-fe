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
import { ChevronDown, Check } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
  /** Shown on the trigger when nothing is selected yet. */
  placeholder?: string;
}

/** Space (px) the popup keeps between itself and the viewport edge. */
const VIEWPORT_GUTTER = 12;
const MAX_POPUP_HEIGHT = 288;

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
    { label, error, helperText, options, placeholder, required, className = '', ...props },
    ref,
  ) => {
    const selectRef = useRef<HTMLSelectElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listId = useId();

    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const [maxHeight, setMaxHeight] = useState(MAX_POPUP_HEIGHT);
    const [activeIndex, setActiveIndex] = useState(-1);
    // Mirrors the native select for uncontrolled use (e.g. RHF `register`).
    const [uncontrolledValue, setUncontrolledValue] = useState('');

    const disabled = props.disabled;
    const isControlled = props.value !== undefined;
    const currentValue = isControlled ? String(props.value ?? '') : uncontrolledValue;
    const selectedIndex = options.findIndex((o) => o.value === currentValue);
    const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '';

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
      if (!open || activeIndex < 0) return;
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex]);

    const onTriggerKeyDown = (e: React.KeyboardEvent) => {
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
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(options.length - 1, i + 1));
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
          setActiveIndex(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (options[activeIndex]) commit(options[activeIndex].value);
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
            onKeyDown={onTriggerKeyDown}
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
              ref={listRef}
              id={listId}
              role="listbox"
              style={{ maxHeight }}
              className={`absolute z-50 left-0 right-0 w-full overflow-y-auto overscroll-contain
                rounded-xl border border-[var(--border)] bg-[var(--cardBg)] shadow-xl py-1
                ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              {options.length === 0 && (
                <p className="px-4 py-3 text-sm text-[var(--textTertiary)]">No options</p>
              )}
              {options.map((option, i) => {
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
