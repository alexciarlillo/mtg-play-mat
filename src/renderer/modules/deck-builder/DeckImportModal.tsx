import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { ChangeEvent, useState } from 'react';

export interface DeckImportValues {
  name: string;
  deckList: string;
}

interface Props {
  isOpen: boolean;
  onClose(): void;
  onCancel(): void;
  onSubmit(values: DeckImportValues): void;
}

const DeckImportModal = ({ isOpen, onClose, onCancel, onSubmit }: Props) => {
  const [deckList, setDeckList] = useState('');
  const [name, setName] = useState('');

  const handleDeckListChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDeckList(event.target.value);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  const reset = () => {
    setDeckList('');
    setName('');
  };

  const handleSubmit = () => {
    // TODO: pre-validate
    onSubmit({ name, deckList });
    reset();
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const handleCancel = () => {
    onCancel();
    reset();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-gray-500/25" aria-hidden="true" />

      <div className="fixed inset-0 z-10 overflow-y-auto p-4 sm:p-6 md:p-20">
        <DialogPanel className="mx-auto max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black/5 transition-all p-4">
          <DialogTitle
            as="h3"
            className="text-lg font-medium leading-6 text-gray-900"
          >
            Import deck
          </DialogTitle>
          <Description className="mt-2 max-w-xl text-sm text-gray-500">
            Paste in a deck list to import it.
          </Description>

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
                className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-400 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-indigo-500 sm:text-sm"
                value={name}
                onChange={handleNameChange}
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
              className="mt-1 block w-full rounded-md border-2 border-gray-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={deckList}
              onChange={handleDeckListChange}
            />
          </div>

          <div className="mt-2 flex justify-between">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-sm border border-transparent bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={handleSubmit}
            >
              Submit
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default DeckImportModal;
