import * as React from "react";
import * as Label from "@radix-ui/react-label";

interface InputProps {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ComponentType;
}

const Input: React.FC<InputProps> = ({ label, value, onChange, type = "number", min, max, step, disabled = false, placeholder, icon: Icon }) => {
  // Create a string representation of the value for controlled input
  const [inputValue, setInputValue] = React.useState<string>(value.toString());

  // Update the input value when the prop value changes
  React.useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  // Handle input changes and remove leading zeros when appropriate
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Allow empty input, decimal point, or negative sign
    if (newValue === "" || newValue === "." || newValue === "-" || newValue === "-.") {
      setInputValue(newValue);
      // Create a modified event with parsed value
      const modifiedEvent = { ...e, target: { ...e.target, value: newValue } };
      onChange(modifiedEvent);
      return;
    }

    // Handle leading zeros (but preserve "0." for decimals)
    if (newValue.startsWith("0") && !newValue.startsWith("0.") && newValue.length > 1) {
      // Remove leading zeros
      const cleanedValue = newValue.replace(/^0+/, "");
      setInputValue(cleanedValue);

      // Create a modified event with the cleaned value
      const modifiedEvent = { ...e, target: { ...e.target, value: cleanedValue } };
      onChange(modifiedEvent);
      return;
    }

    // For all other cases, just update normally
    setInputValue(newValue);
    onChange(e);
  };

  return (
    <div className="flex flex-col flex-1 space-y-1">
      <Label.Root className="text-xs font-medium text-figma-secondary" htmlFor={label}>
        {label}
      </Label.Root>
      <div className="relative">
        <input id={label} type={type} value={inputValue} onChange={handleInputChange} min={min} max={max} step={step} disabled={disabled} placeholder={placeholder} className="input" />
        {Icon && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-figma-secondary">
            <Icon />
          </div>
        )}
      </div>
    </div>
  );
};

export default Input;
