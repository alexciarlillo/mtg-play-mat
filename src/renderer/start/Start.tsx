import { useEffect, useState } from 'react';
import IpcEvents from 'IpcEvents';
import 'tailwindcss/tailwind.css';

const Start = () => {
  const [modules, setModules] = useState([]);

  useEffect(() => {
    window.Main.rendererChannel.On(
      IpcEvents.LIST_MODULES,
      (event, _modules) => {
        setModules(_modules);
      }
    );
  }, []);

  useEffect(() => {
    window.Main.listModules();
  }, []);

  startModule = ({ name }) => {
    window.Main.openModule({ name });
  };

  return (
    <div className="h-screen w-screen bg-slate-300 relative flex">
      <div className="bg-gray-50 px-4 py-3 text-right sm:px-6">
        {modules.map((module) => {
          return (
            <button
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={() => {
                startModule({ name: module.name });
              }}
            >
              {module.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Start;
