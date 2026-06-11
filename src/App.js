import React, { useEffect, useState } from 'react';
import View from './View';
import Edit from './Edit';

function isLocalPreview() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function App() {
  const [entryPoint, setEntryPoint] = useState(isLocalPreview() ? 'view' : null);

  useEffect(() => {
    if (isLocalPreview()) {
      return;
    }

    let active = true;

    import('@forge/bridge')
      .then(({ view }) => view.getContext())
      .then((context) => {
        if (active) {
          setEntryPoint(context.extension.entryPoint);
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

  return entryPoint === 'edit' ? <Edit /> : <View />;
}

export default App;