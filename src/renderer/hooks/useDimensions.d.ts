export interface DimensionObject {
  width: number;
  height: number;
}

export type UseDimensionsHook = {
  ref: (node: HTMLDivElement) => void;
  dimensions: DimensionObject;
  measure: () => void;
};

export interface UseDimensionsArgs {
  liveMeasure?: boolean;
}
