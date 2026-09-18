import { makeAutoObservable } from 'mobx';

export interface ContextMenuSpec {
  title: string;
  action: (() => void) | null;
}

interface OpenOptions {
  specs: ContextMenuSpec[];
  x: number;
  y: number;
}

export default class ContextMenuStore {
  isOpen = false;

  specs: ContextMenuSpec[] = [];

  posX = 0;

  posY = 0;

  constructor() {
    makeAutoObservable(this);
  }

  open({ specs, x, y }: OpenOptions) {
    this.isOpen = true;
    this.specs = specs;
    this.posX = x;
    this.posY = y;
  }

  close() {
    this.isOpen = false;
    this.specs = [];
  }
}
