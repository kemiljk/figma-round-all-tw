import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "@radix-ui/react-icons";

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange }) => {
  return (
    <div className="flex items-center space-x-2">
      <CheckboxPrimitive.Root id={label} checked={checked} onCheckedChange={onChange} className="CheckboxRoot">
        <CheckboxPrimitive.Indicator className="CheckboxIndicator">
          <CheckIcon className="h-3 w-3" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={label} className="text-xs leading-none text-figma-primary cursor-pointer">
        {label}
      </label>
    </div>
  );
};

export default Checkbox;
