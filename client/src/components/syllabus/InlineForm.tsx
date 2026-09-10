import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';

interface InlineFormProps {
  placeholder: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * One-field form used for both "add" and "rename" throughout the tree. Kept
 * inline rather than in a modal so the student never loses their place in a
 * long syllabus.
 */
export function InlineForm({
  placeholder,
  initialValue = '',
  submitLabel,
  onSubmit,
  onCancel,
}: InlineFormProps) {
  const [value, setValue] = useState(initialValue);
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    setIsBusy(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
          if (event.key === 'Escape') onCancel();
        }}
        className="max-w-xs"
      />
      <Button type="button" onClick={() => void submit()} isLoading={isBusy}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
