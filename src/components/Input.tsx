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
  return (
    <div className="flex flex-col flex-1 space-y-1">
      <Label.Root className="text-xs font-medium text-figma-secondary" htmlFor={label}>
        {label}
      </Label.Root>
      <div className="relative">
        <input id={label} type={type} value={value} onChange={onChange} min={min} max={max} step={step} disabled={disabled} placeholder={placeholder} className="input" />
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
