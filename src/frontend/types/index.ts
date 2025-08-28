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

export interface BoundingBox { // 坐标均为相对值 0~1
  id: string;
  x: number;      // 相对左上角 X
  y: number;      // 相对左上角 Y
  w: number;      // 宽度占比
  h: number;      // 高度占比
  fields: FieldValues; // 每个框都有自己独立的字段值
}

export interface FieldValues { [fieldKey:string]: string | number | boolean; }

// 如果一张图里没有任何框，也要有一个box来对应图的fields
// 因此，ImageLabel里的boxes属性至少会有一个元素
export interface ImageLabel {
  imageName: string;
  boxes: BoundingBox[];
  rotation?: number; // 旋转角度：0, 90, 180, 270
}
