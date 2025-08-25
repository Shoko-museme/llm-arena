export interface Field {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'select';
  options?: string[];
}

export interface FieldSet {
  createdAt: string;
  drawBoxesOnImage: boolean;
  fields: Field[];
}
