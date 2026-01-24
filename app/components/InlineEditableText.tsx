import { Text, TextField } from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";

interface InlineEditableTextProps {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  variant?: "headingLg" | "bodyMd";
  onChange: (value: string) => void;
  onCommit?: (value: string) => boolean;
  error?: string | boolean;
  maxLength?: number;
  showCharacterCount?: boolean;
}

export function InlineEditableText({
  label,
  value,
  placeholder,
  multiline = false,
  variant = "bodyMd",
  onChange,
  onCommit,
  error,
  maxLength,
  showCharacterCount,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isEditing && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [isEditing]);

  const displayValue = value?.trim() ? value : placeholder || "";

  if (isEditing) {
    return (
      <TextField
        label={label}
        labelHidden
        value={value}
        autoComplete="off"
        onChange={onChange}
        multiline={multiline ? 3 : false}
        focused={isEditing}
        onBlur={() => {
          const shouldClose = onCommit ? onCommit(value) !== false : true;
          if (error || !shouldClose) return;
          setIsEditing(false);
        }}
        placeholder={placeholder}
        error={error}
        maxLength={maxLength}
        showCharacterCount={showCharacterCount}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="bainners-inline-edit"
      onClick={() => setIsEditing(true)}
    >
      <div style={{ whiteSpace: "pre-wrap" }}>
        <Text
          as={variant === "headingLg" ? "h1" : "p"}
          variant={variant}
          tone={value?.trim() ? undefined : "subdued"}
        >
          {displayValue}
        </Text>
      </div>
    </button>
  );
}
