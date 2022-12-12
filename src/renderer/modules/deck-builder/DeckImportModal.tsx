import { Dialog } from '@headlessui/react';
import { useState, useEffect } from 'react';

const DeckImportModal = ({ isOpen, onClose, onCancel, onSubmit }) => {
  const [deckList, setDeckList] = useState('');

  const handleDeckListChange = (event) => {
    setDeckList(event.target.value);
  };

  handleSubmit = () => {
    // TODO: pre-validate
    onSubmit(deckList);
  };

  useEffect(() => {
    setDeckList('');
  }, [isOpen]);

  return (
    <Dialog as="div" open={isOpen} onClose={onClose} className="relative z-50">
      <div
        className="fixed inset-0 bg-gray-500 bg-opacity-25"
        aria-hidden="true"
      />

      <div className="fixed inset-0 z-10 overflow-y-auto p-4 sm:p-6 md:p-20">
        <Dialog.Panel className="mx-auto max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all p-4">
          <Dialog.Title
            as="h3"
            className="text-lg font-medium leading-6 text-gray-900"
          >
            Import deck
          </Dialog.Title>
          <Dialog.Description className="mt-2 max-w-xl text-sm text-gray-500">
            Paste in a deck list to import it.
          </Dialog.Description>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Name
            </label>
            <div className="mt-1">
              <input
                id="name"
                name="name"
                type="text"
                required
                className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          <div className="mt-2">
            <label
              htmlFor="deck"
              className="block text-sm font-medium text-gray-700"
            >
              Card list
            </label>
            <textarea
              rows={12}
              name="deck"
              id="deck"
              className="mt-1 block w-full rounded-md border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={deckList}
              onChange={handleDeckListChange}
            />
          </div>

          <div className="mt-2 flex justify-between">
            <button
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center rounded border border-transparent bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={() => onSubmit(deckList)}
            >
              Submit
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default DeckImportModal;
