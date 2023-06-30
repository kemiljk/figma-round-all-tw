import * as React from 'react';
import { createRoot } from 'react-dom/client';
import Checkbox from './components/Checkbox';
import './ui.css';

function App() {
  const [checkboxOn, setCheckboxOn] = React.useState(false);

  return (
    <main className='w-full p-2'>
      <Checkbox checkboxOn={checkboxOn} setCheckboxOn={setCheckboxOn} />
      <div className='flex w-full pt-1 mx-auto'>
        <button id='run' onClick={() => parent.postMessage({ pluginMessage: { type: 'run', checkboxOn } }, '*')} className='secondary'>
          Your selection
        </button>
        <button id='select-and-run' onClick={() => parent.postMessage({ pluginMessage: { type: 'select-and-run', checkboxOn } }, '*')} className='primary'>
          Entire document
        </button>
      </div>
    </main>
  );
}

const root = createRoot(document.getElementById('react-page')!);
root.render(<App />);
