import * as React from 'react';
import * as Switch from '@radix-ui/react-switch';

const Checkbox = ({ checkboxOn, setCheckboxOn }) => {
  const handleCheckboxClick = () => {
    setCheckboxOn(!checkboxOn);
  };

  return (
    <form>
      <div className='flex items-center w-full justify-between'>
        <label className='text-figma-primary text-xs leading-none pr-4' htmlFor='close-on-completion'>
          Close on completion
        </label>
        <Switch.Root className='w-[42px] h-[25px] bg-figma-tertiaryBg rounded-full relative data-[state=checked]:bg-figma-blue outline-none cursor-default' id='close-on-completion' checked={checkboxOn} onCheckedChange={handleCheckboxClick}>
          <Switch.Thumb className='block w-[21px] h-[21px] bg-white rounded-full shadow-[0_2px_2px] transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[19px]' />
        </Switch.Root>
      </div>
    </form>
  );
};

export default Checkbox;
