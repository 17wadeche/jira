import React, { useEffect, useState } from 'react';
import View from './View';

function isLocalPreview() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function App() {
  const [entryPoint, setEntryPoint] = useState(isLocalPreview() ? 'view' : null);
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

        const nextEntryPoint = context.extension.entryPoint;
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

  if (!entryPoint) {
    return 'Loading...';
  }

  if (entryPoint === 'edit') {
    return EditComponent ? <EditComponent /> : 'Loading configuration...';
  }

  return <View />;
}

export default App;