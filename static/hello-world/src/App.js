import React, { useEffect, useState } from 'react';
import View from './View';

function isLocalPreview() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function App() {
  // Render the normal gadget immediately. Forge context can be slow (or unavailable during
  // a dashboard refresh), so blocking on it leaves the entire gadget stuck on ‘Loading…’.
  const [entryPoint, setEntryPoint] = useState('view');
  const [EditComponent, setEditComponent] = useState(null);

  useEffect(() => {
    if (isLocalPreview()) {
      return;
    }

    let active = true;

    import('@forge/bridge')
      .then(({ view }) => view.getContext())
      .then(async (context) => {
        if (!active) return;

        const nextEntryPoint = context?.extension?.entryPoint || 'view';
        setEntryPoint(nextEntryPoint);

        if (nextEntryPoint === 'edit') {
          const module = await import('./Edit');
          if (active) {
            setEditComponent(() => module.default);
          }
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setEntryPoint('view');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (entryPoint === 'edit') {
    return EditComponent ? <EditComponent /> : 'Loading configuration...';
  }

  return <View />;
}

export default App;