import 'tailwindcss/tailwind.css';

const Start = () => {
  startPlayTest = () => {
    window.Main.playTest();
  };

  return (
    <div className="h-screen w-screen bg-slate-300 relative flex">
      <div>Start</div>

      <div className="bg-gray-50 px-4 py-3 text-right sm:px-6">
        <button
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          onClick={startPlayTest}
        >
          Play Test
        </button>
      </div>
    </div>
  );
};

export default Start;
